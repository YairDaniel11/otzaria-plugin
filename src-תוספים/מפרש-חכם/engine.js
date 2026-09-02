'use strict';

/*
 * הליבה של "מפרש חכם": עוקבת אחרי מיקום הקריאה, ומראה/מסתירה מפרשים
 * "מנוהלים" (למשל ביאור הלכה) לפי אם יש להם פירוש על השורה הנוכחית.
 * נטען הן ב-background.html (רץ תמיד ברקע בזמן קריאה) והן ב-index.html
 * (מסך ההגדרות, לצורך בדיקה ידנית).
 */

const SC_FRAGMENTS_KEY = 'smartCommentatorFragments';
const SC_ENABLED_KEY = 'smartCommentatorEnabled';
const SC_AUTOHIDE_KEY = 'smartCommentatorAutoHide';

async function scCall(method, params) {
  try {
    const res = await Otzaria.call(method, params || {});
    if (!res || !res.success) {
      if (res && res.error) console.error('smart-commentator:', method, res.error.code, res.error.message);
      return null;
    }
    return res.data;
  } catch (e) {
    console.error('smart-commentator:', method, e);
    return null;
  }
}

async function scGetSettings() {
  const [fragments, enabled, autoHide] = await Promise.all([
    scCall('storage.get', { key: SC_FRAGMENTS_KEY }),
    scCall('storage.get', { key: SC_ENABLED_KEY }),
    scCall('storage.get', { key: SC_AUTOHIDE_KEY })
  ]);
  return {
    fragments: Array.isArray(fragments) ? fragments.filter((f) => typeof f === 'string' && f.trim()) : [],
    enabled: enabled !== false,
    autoHide: autoHide !== false
  };
}

/*
 * בדיקה על שורה בודדת פספסה תוכן שממוקם על שורה אחרת באותו סימן (למשל
 * שורת הכותרת/הפתיחה של הסימן, שלרוב אין עליה קישורים בעצמה). לכן טווח
 * הבדיקה הוא הסימן כולו, לפי תוכן העניינים של הספר — לא שורה בודדת.
 * תוכן העניינים נשמר במטמון פר-ספר, ונטען מחדש רק כשעוברים לספר אחר.
 */
let scTocCache = { bookId: null, toc: [] };

async function scGetSectionRange(bookId, index) {
  if (scTocCache.bookId !== bookId) {
    const toc = await scCall('library.getBookToc', { bookId: bookId });
    const sorted = Array.isArray(toc) ? toc.slice().sort((a, b) => a.index - b.index) : [];
    scTocCache = { bookId: bookId, toc: sorted };
  }
  const toc = scTocCache.toc;
  if (!toc.length) return { start: index, end: index };

  let pos = -1;
  for (let i = 0; i < toc.length; i++) {
    if (toc[i].index <= index) pos = i;
    else break;
  }
  if (pos === -1) {
    return { start: 0, end: Math.max(0, toc[0].index - 1) };
  }
  const start = toc[pos].index;
  const MAX_SPAN = 400;
  const end = (pos + 1 < toc.length)
    ? Math.min(toc[pos + 1].index - 1, start + MAX_SPAN)
    : start + MAX_SPAN;
  return { start: start, end: Math.max(start, end) };
}

/**
 * בודקת מיקום נתון ומעדכנת את המפרשים הפעילים בהתאם.
 * מחזירה תקציר של מה שקרה (או null אם לא בוצעה פעולה) — שימושי לתצוגה
 * ידנית במסך ההגדרות.
 */
async function scCheckLocation(loc) {
  const bookId = loc && loc.currentBookId;
  const index = loc && loc.currentIndex;
  const debug = { bookId: bookId || null, index: index === undefined ? null : index, currentRef: (loc && loc.currentRef) || null };

  if (!bookId || index === null || index === undefined || index < 0) {
    return { skipped: 'no_location', debug: debug };
  }

  const settings = await scGetSettings();
  debug.fragments = settings.fragments;
  if (!settings.enabled) return { skipped: 'disabled', debug: debug };
  if (settings.fragments.length === 0) return { skipped: 'no_fragments', debug: debug };

  const activeData = await scCall('reader.getActiveCommentators');
  if (!activeData || !Array.isArray(activeData.available)) return { skipped: 'no_reader_tab', debug: debug };
  debug.available = activeData.available;
  debug.active = activeData.active || [];

  const managedNames = activeData.available.filter((name) =>
    settings.fragments.some((f) => name.indexOf(f) !== -1)
  );
  debug.managedNames = managedNames;
  if (managedNames.length === 0) return { skipped: 'no_managed_commentators', debug: debug };

  const range = await scGetSectionRange(bookId, index);
  debug.range = range;

  const commData = await scCall('library.getCommentators', {
    bookId: bookId,
    startLine: range.start,
    endLine: range.end
  });
  if (!commData || !Array.isArray(commData.commentators)) return { skipped: 'commentators_lookup_failed', debug: debug };

  const hereNames = new Set(commData.commentators.map((c) => c.title));
  debug.hereNames = [...hereNames];
  const activeSet = new Set(activeData.active || []);

  const toAdd = [];
  const toRemove = [];
  managedNames.forEach((name) => {
    const hasContent = hereNames.has(name);
    const isActive = activeSet.has(name);
    if (hasContent && !isActive) toAdd.push(name);
    else if (!hasContent && isActive && settings.autoHide) toRemove.push(name);
  });

  if (toAdd.length === 0 && toRemove.length === 0) {
    return { skipped: 'nothing_to_change', managedNames: managedNames, debug: debug };
  }

  const args = {};
  if (toAdd.length) args.add = toAdd;
  if (toRemove.length) args.remove = toRemove;
  await scCall('reader.setActiveCommentators', args);
  return { added: toAdd, removed: toRemove, debug: debug };
}

/**
 * מתזמן בדיקה עם דיליי קצר (כדי לא לתפוס כל שינוי מיקום חטוף תוך כדי
 * גלילה מהירה), ודואג שלא ירוצו שתי בדיקות זו על גבי זו.
 */
function scCreateScheduler() {
  let timer = null;
  let running = false;
  let pending = null;

  async function runNow() {
    if (running) {
      timer = setTimeout(runNow, 150);
      return;
    }
    const loc = pending;
    pending = null;
    if (!loc) return;
    running = true;
    try {
      await scCheckLocation(loc);
    } finally {
      running = false;
    }
  }

  return function schedule(loc) {
    pending = loc;
    clearTimeout(timer);
    timer = setTimeout(runNow, 300);
  };
}
