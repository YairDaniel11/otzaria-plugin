# מדריך מעשי (Cookbook) — מתכוני קוד לתוספי אוצריא

מסמך זה מרכז נושאים שמפתחי תוספים נוטים לפספס, עם קטעי קוד מוכנים להעתקה.
הוא משלים את [DESIGN_GUIDE.md](DESIGN_GUIDE.md) (עקרונות עיצוב) ואת [API_REFERENCE.md](API_REFERENCE.md) (ה-API המלא).

תוכן:
1. [גופן מותאם אישית](#1-גופן-מותאם-אישית)
2. [אייקונים מאוצריא](#2-אייקונים-מאוצריא)
3. [חלונית הגדרות בסגנון אוצריא](#3-חלונית-הגדרות-בסגנון-אוצריא)

---

## 1. גופן מותאם אישית

### העיקרון: אוצריא מזריקה את הגופנים בשבילך

הגופנים העבריים המובנים של אוצריא נטענים אוטומטית כ-`@font-face` ל-WebView של התוסף **עוד לפני `plugin.boot`**.
אין צורך לארוז קבצי גופן (`.ttf`/`.woff2`) בתוסף — מספיק להפנות לשם הגופן ב-CSS.

הגופנים הזמינים:

`FrankRuhlCLM` · `TaameyDavidCLM` · `Shofar` · `NotoRashiHebrew` · `KeterYG` · `NotoSerifHebrew` · `Tinos` · `Rubik` · `TaameyAshkenaz`

> מוזרקים רק הגופן הראשי וגופן המפרשים **שנבחרו בהגדרות**. אם המשתמש בחר גופן מערכת (לא מובנה) — ההזרקה מדלגת, וה-WebView נופל ל-fallback של ה-CSS. לכן **תמיד** השאר `'David', serif` בסוף שרשרת ה-`font-family`.

### מתכון א' — להפנות לגופן מובנה בשם

```css
.prayer {
  font-family: 'FrankRuhlCLM', 'David', serif;
}
```

זה הכל. אם הגופן רשום ב-WebView הוא ייטען; אחרת ה-fallback תופס.

### מתכון ב' (מומלץ) — לעקוב אחרי הגופן שהמשתמש בחר באוצריא

כך ברירת המחדל של התוסף "מתיישרת" עם שאר האפליקציה ומתעדכנת בזמן אמת. הגופן מגיע בתוך
`theme.typography.fontFamily` (ראה [DESIGN_GUIDE.md](DESIGN_GUIDE.md#מבנה-אובייקט-ה-theme)):

```javascript
// שרשרת fallback קבועה כדי שהטקסט תמיד ייראה טוב גם אם הגופן הנבחר לא מובנה
const FONT_FALLBACK = "'David', 'Noto Serif Hebrew', serif";

let themeFont = '';     // הגופן של אוצריא (מ-theme)
let userFont = '';      // בחירת המשתמש בתוסף (אם הוספת בורר — מתכון ג')

function applyFont() {
  const family = userFont || themeFont || 'FrankRuhlCLM';
  document.documentElement.style.setProperty(
    '--prayer-font', `'${family}', ${FONT_FALLBACK}`,
  );
}

function applyTheme(theme) {
  // ... שאר applyTheme (צבעים) ...
  if (theme && theme.typography && theme.typography.fontFamily) {
    themeFont = theme.typography.fontFamily;
    applyFont();
  }
}

Otzaria.on('plugin.boot', (p) => applyTheme(p.theme));
// ⚠️ דורש הרשאה: events.subscribe:theme.changed
Otzaria.on('theme.changed', applyTheme);
```

וב-CSS משתמשים במשתנה:

```css
.prayer { font-family: var(--prayer-font, 'FrankRuhlCLM', serif); }
```

### מתכון ג' — בורר גופן בתוך התוסף

מאפשר למשתמש לבחור מבין הגופנים המובנים. ערך ריק = "ברירת מחדל" שעוקבת אחרי אוצריא (מתכון ב'):

```javascript
const FONTS = [
  ['', 'ברירת מחדל'],
  ['FrankRuhlCLM', 'פרנק רוהל'],
  ['TaameyDavidCLM', 'דוד'],
  ['Shofar', 'שופר'],
];

function buildFontPicker(container) {
  container.innerHTML = FONTS.map(([id, label]) =>
    `<button class="pill${userFont === id ? ' active' : ''}" data-font="${id}">${label}</button>`,
  ).join('');
  container.querySelectorAll('[data-font]').forEach((btn) => {
    btn.onclick = () => {
      userFont = btn.getAttribute('data-font');
      Otzaria.call('storage.set', { key: 'fontFamily', value: userFont }); // שמירה
      applyFont();
      buildFontPicker(container);   // רענון מצב ה-active
    };
  });
}
```

### מתכון ד' (מתקדם) — לארוז גופן משלך

רק אם אתה צריך גופן ש**אינו** ברשימה המובנית. הנח את הקובץ בתוך התוסף והפנה אליו בנתיב יחסי:

```
my-plugin/
├── index.html
├── css/style.css
└── fonts/
    └── MyFont.woff2
```

```css
@font-face {
  font-family: 'MyFont';
  src: url('../fonts/MyFont.woff2') format('woff2');
  font-display: swap;
}
.special { font-family: 'MyFont', 'David', serif; }
```

> השתמש ב-`woff2` (קל משמעותית מ-`ttf`) כדי לא לנפח את גודל התוסף. הנתיב יחסי לקובץ ה-CSS — אסור להפנות לקבצים מחוץ לתיקיית התוסף.

---

## 2. אייקונים מאוצריא

**חשוב להבין:** אין API שמחזיר לתוסף קובץ SVG של אייקון. אוצריא מציירת אייקוני
[FluentUI System Icons](https://github.com/microsoft/fluentui-system-icons) **בצד שלה** בשני מקומות שהתוסף מצהיר עליהם. בתוך ה-WebView עצמו — האייקונים הם שלך (SVG inline).

### מקום 1 — אייקון הטאב במסך "כלים"

מוצהר ב-`manifest.json`. השם הוא שם FluentUI בגודל 24, המסתיים ב-`_24_regular` או `_24_filled`:

```json
"contributes": {
  "toolTab": {
    "title": "סידורון",
    "order": 300,
    "defaultPinned": true,
    "iconName": "book_24_regular"
  }
}
```

### מקום 2 — אייקון בתפריט לחצן-ימין (מסכי טקסט)

בעת רישום פריט לתפריט ההקשר, ניתן לציין `icon` (שם FluentUI 24, אופציונלי):

```javascript
await Otzaria.call('reader.addContextMenuItem', {
  id: 'my-bookmark-item',
  label: 'הוסף לסימניות שלי',
  icon: 'bookmark_24_regular',
});
```

> **איך מוצאים שם אייקון?** גלוש ל-[מאגר FluentUI](https://github.com/microsoft/fluentui-system-icons), או חפש בקוד אוצריא `FluentIcons.xxx_24_regular`. שם שאינו קיים במפת האייקונים יוצג כפאזל ברירת מחדל (בטאב) או ללא אייקון (בתפריט) — לא תיזרק שגיאה.

### בתוך ה-WebView — SVG inline שעוקב אחרי ה-theme

לאייקונים בתוך התוסף עצמו (כפתורים, כותרות) השתמש ב-SVG ישירות, וצבע אותו עם `currentColor`
כדי שיירש את צבע הטקסט/ה-theme במקום צבע קשיח:

```html
<button class="tool-btn" aria-label="הגדרות" title="הגדרות">
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
       stroke-width="2" aria-hidden="true">
    <circle cx="12" cy="12" r="3"/>
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
  </svg>
</button>
```

```css
.tool-btn { color: var(--color-on-surface-variant); }       /* צבע האייקון = currentColor */
.tool-btn:hover { color: var(--color-on-surface); }
.tool-btn svg { width: 21px; height: 21px; }
```

> **אל תקבע צבע קשיח** ב-`fill`/`stroke`. השתמש ב-`currentColor` ושלוט בצבע דרך `color` עם משתני ה-theme — כך האייקון מתאים אוטומטית למצב כהה/בהיר.

---

## 3. חלונית הגדרות בסגנון אוצריא

חלונית ההגדרות צריכה להתנהג כמו זו של **לוח השנה** באוצריא: פאנל צף שנכנס בהחלקה
מצד אחד, מעל שכבת רקע כהה (scrim), ובתוכו **כרטיסים בעלי כותרת** עם **בקרת סגמנטים** (segmented)
לבחירה יחידה ו**מתגי switch** ל-on/off. כל הצבעים מ-theme, השמירה מיידית.

הערכים כאן תואמים את הרכיבים האמיתיים: `ContextOverlayPanel`, `SettingsCard`,
`SegmentedSettingsTile` ו-`SwitchSettingsTile`.

### א. משתני ה-theme הנדרשים

הפאנל משתמש בכמה תפקידי צבע מעבר לבסיסיים. הרחב את `applyTheme` (מ-[DESIGN_GUIDE.md](DESIGN_GUIDE.md#פונקציית-applytheme)) כך שיכלול:

```javascript
function applyTheme(theme) {
  if (!theme || !theme.colorScheme) return;
  const cs = theme.colorScheme;
  const r = document.documentElement;
  // ... המיפויים הבסיסיים (primary, surface וכו') ...
  r.style.setProperty('--color-on-surface-variant',        cs.onSurfaceVariant);
  r.style.setProperty('--color-surface-container-high',    cs.surfaceContainerHigh);
  r.style.setProperty('--color-surface-container-highest', cs.surfaceContainerHighest);
  r.style.setProperty('--color-secondary-container',       cs.secondaryContainer);
  r.style.setProperty('--color-on-secondary-container',    cs.onSecondaryContainer);
  r.style.setProperty('--color-outline-variant',           cs.outlineVariant);
  r.style.setProperty('--color-scrim',                     cs.scrim);
}
```

### ב. ה-HTML — scrim + פאנל + כרטיסים

```html
<!-- שכבת רקע כהה: לחיצה עליה סוגרת -->
<div class="overlay-scrim" id="settings-scrim"></div>

<aside class="overlay-panel" id="settings-panel" aria-label="הגדרות">
  <div class="panel-head">הגדרות</div>
  <div class="panel-body">

    <!-- כרטיס בעל כותרת -->
    <section class="settings-card">
      <h3 class="settings-card-title">תצוגה</h3>
      <div class="settings-card-body">

        <!-- שורת בחירה יחידה (segmented) -->
        <div class="settings-row">
          <div class="settings-row-text">
            <div class="settings-row-title">נוסח התפילה</div>
            <div class="settings-row-subtitle">הנוסח שיוצג בכל התפילות</div>
          </div>
          <div class="segmented" id="seg-nusach"></div>
        </div>

        <!-- שורת מתג on/off -->
        <div class="settings-row toggle-row">
          <div class="settings-row-text">
            <div class="settings-row-title">אני בארץ ישראל</div>
          </div>
          <button class="switch" id="set-israel" role="switch" aria-label="ארץ ישראל"></button>
        </div>

      </div>
    </section>

  </div>
</aside>
```

### ג. ה-CSS

```css
/* ── Scrim ─────────────────────────────────────── */
.overlay-scrim {
  position: fixed; inset: 0;
  background: var(--color-scrim, #000);
  opacity: 0; pointer-events: none;
  transition: opacity 0.2s;
  z-index: 100;
}
.overlay-scrim.open { opacity: 0.30; pointer-events: auto; }

/* ── Panel (נכנס מהצד, כמו לוח השנה) ───────────── */
.overlay-panel {
  position: fixed;
  top: 10px; bottom: 12px;
  inset-inline-start: 10px;   /* ב-RTL: הקצה השמאלי הפיזי — כמו ContextOverlayPanel */
  width: min(400px, 92vw);
  background: var(--color-surface-container-high);
  color: var(--color-on-surface);
  border-radius: 18px;        /* radiusPanel */
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
  display: flex; flex-direction: column; overflow: hidden;
  z-index: 101;
  opacity: 0; transform: translateX(-30px); pointer-events: none;
  transition: opacity 0.2s, transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}
.overlay-panel.open { opacity: 1; transform: none; pointer-events: auto; }

.panel-head {
  padding: 18px 20px 12px;
  font-size: 1.2rem; font-weight: 700; text-align: center;
  flex: 0 0 auto;
}
.panel-body { overflow-y: auto; padding: 4px 16px 20px; }

/* ── Card (כמו SettingsCard) ───────────────────── */
.settings-card {
  background: var(--color-surface);
  border-radius: 20px;        /* radiusXL */
  overflow: hidden;
  margin-top: 16px;
}
.settings-card-title {
  font-size: 1rem; font-weight: 700;
  color: var(--color-primary);          /* כותרת בצבע primary */
  padding: 20px 16px 10px;
  margin: 0;
}
/* מפריד דק בין שורות (כמו ה-divider של SettingsCard) */
.settings-card-body > .settings-row + .settings-row {
  border-top: 1.5px solid var(--color-surface-container-highest);
}

.settings-row {
  display: flex; align-items: center; justify-content: space-between;
  gap: 12px; padding: 12px 16px;
}
.settings-row-title    { font-size: 1rem; }
.settings-row-subtitle { font-size: 0.8rem; color: var(--color-on-surface-variant); margin-top: 2px; }

/* ── Segmented (כמו SegmentedSettingsTile) ─────── */
.segmented {
  display: inline-flex;
  border: 1px solid var(--color-outline);
  border-radius: 8px;          /* radiusSM */
  overflow: hidden;
  flex: 0 0 auto;
}
.segmented button {
  border: none; background: var(--color-surface);
  color: var(--color-on-surface-variant);
  height: 40px; padding: 0 14px;
  font-family: inherit; font-size: 0.95rem; cursor: pointer;
  transition: background 0.15s;
}
.segmented button + button { border-inline-start: 1px solid var(--color-outline); }
.segmented button.active {
  background: var(--color-secondary-container);   /* אטום — לא שקיפות */
  color: var(--color-on-secondary-container);
}

/* ── Switch (M3, כמו SwitchSettingsTile) ───────── */
.switch {
  width: 46px; height: 26px; border-radius: 999px;
  border: 2px solid var(--color-outline);
  background: var(--color-surface-container-highest);
  position: relative; cursor: pointer; transition: 0.2s; flex: 0 0 auto;
}
.switch::after {
  content: ''; position: absolute; top: 3px; inset-inline-end: 3px;
  width: 16px; height: 16px; border-radius: 50%;
  background: var(--color-outline); transition: 0.2s;
}
.switch.on { background: var(--color-primary); border-color: var(--color-primary); }
.switch.on::after { inset-inline-end: 23px; background: var(--color-on-primary); }
```

### ד. ה-JS — פתיחה/סגירה, מילוי ושמירה

```javascript
const panel = document.getElementById('settings-panel');
const scrim = document.getElementById('settings-scrim');

function openSettings()  { panel.classList.add('open');  scrim.classList.add('open'); }
function closeSettings() { panel.classList.remove('open'); scrim.classList.remove('open'); }
scrim.addEventListener('click', closeSettings);

// בקרת סגמנטים (בחירה יחידה)
const NUSACHIM = [{ id: 'edot', label: 'עדות המזרח' }, { id: 'sfard', label: 'ספרד' }, { id: 'ashkenaz', label: 'אשכנז' }];
let nusach = 'edot';

function buildSegmented() {
  const el = document.getElementById('seg-nusach');
  el.innerHTML = NUSACHIM.map((n) =>
    `<button class="${nusach === n.id ? 'active' : ''}" data-id="${n.id}">${n.label}</button>`,
  ).join('');
  el.querySelectorAll('[data-id]').forEach((b) => {
    b.onclick = () => {
      nusach = b.getAttribute('data-id');
      Otzaria.call('storage.set', { key: 'nusach', value: nusach }); // שמירה מיידית
      buildSegmented();
      rerender();   // החלת השינוי על התצוגה
    };
  });
}

// מתג on/off
function setToggle(id, on, onChange) {
  const el = document.getElementById(id);
  el.classList.toggle('on', !!on);
  el.onclick = () => {
    const v = !el.classList.contains('on');
    el.classList.toggle('on', v);
    onChange(v);
  };
}

let isInIsrael = true;
setToggle('set-israel', isInIsrael, (v) => {
  isInIsrael = v;
  Otzaria.call('storage.set', { key: 'isInIsrael', value: v });
  rerender();
});
```

> **שמירה מיידית, ללא כפתור "שמור".** כל שינוי נכתב מיד ל-`storage.set` ומוחל על התצוגה — בדיוק כמו הגדרות לוח השנה.

### למה אלה הערכים?

| פריט | ערך | מקור באוצריא |
|------|-----|--------------|
| צד פתיחת הפאנל | קצה שמאל פיזי (ב-RTL), `inset-inline-start: 10px` | `ContextOverlayPanel` (`centerEnd`) |
| scrim | `colorScheme.scrim` ב-30% | `cs.scrim.withValues(alpha: 0.30)` |
| רדיוס פאנל | 18px | `AppTokens.radiusPanel` |
| רקע פאנל | `surfaceContainerHigh` | `ContextOverlayPanel` |
| אנימציה | slide 300ms + fade 200ms | `animPanelSlide` / `animPanelOpacity` |
| רדיוס כרטיס | 20px | `AppTokens.radiusXL` (`SettingsCard`) |
| כותרת כרטיס | בצבע `primary`, מודגשת | `SettingsCardHeader` |
| מפריד בין שורות | 1.5px | `AppCard.sectionSpacing` |
| רדיוס סגמנט | 8px | `AppTokens.radiusSM` |
| סגמנט נבחר | רקע `secondaryContainer`, טקסט `onSecondaryContainer` | `AppSegmentedControl` |
| מתג דלוק | track `primary`, thumb `onPrimary` | `CustomSwitch` (M3) |
| מתג כבוי | track `surfaceContainerHighest`, thumb `outline` | `CustomSwitch` (M3) |

---

> זקוקים ל-API נוסף או לדפוס עיצוב נוסף? כתבו לנו ב-[GitHub Issues](https://github.com/Otzaria/otzaria/issues) עם התג `plugin-sdk`.
