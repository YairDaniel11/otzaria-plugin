# מדריך מקיף לפיתוח תוספים לאוצריא

**גרסה: 1.0 | עבור מפתחים ו-AI כאחד**

---

## תוכן עניינים

1. [מבוא ועקרונות יסוד](#1-מבוא)
2. [מבנה התוסף וקובץ manifest.json](#2-manifest)
3. [הרשאות — רשימה מלאה וכללים](#3-permissions)
4. [עיצוב — Material Design 3 ושפת העיצוב של אוצריא](#4-design)
5. [מבנה HTML — שלד מלא](#5-html-skeleton)
6. [כללי UX וממשק משתמש אחיד](#6-ux-rules)
7. [גלילה, פריסה ותמיכה במובייל](#7-scrolling-layout)
8. [API — כל הקריאות הזמינות](#8-api)
9. [אירועים (Events)](#9-events)
10. [אחסון נתונים](#10-storage)
11. [בטיחות קוד — XSS, Timezone ועוד](#11-security)
12. [ספריות חיצוניות, גופנים ורשת](#12-bundling)
13. [אייקונים — FluentUI System Icons](#13-icons)
14. [הגדרות (Settings Panel)](#14-settings-panel)
15. [פרסום בחנות התוספים](#15-publishing)
16. [שגיאות נפוצות — מה לא לעשות](#16-common-mistakes)

---

## 1. מבוא ועקרונות יסוד

תוספי אוצריא הם יישומי HTML/CSS/JS הרצים בתוך WebView מבודד. הסביבה היא:
- **WebView2** על Windows
- **WKWebView** על iOS/macOS
- **WebView** על Android/Linux

האובייקט הגלובלי `Otzaria` מוזרק אוטומטית על ידי המארח — **אין לטעון כל סקריפט חיצוני** לקבלתו.

### עקרונות בסיסיים שיש להפנים

1. **אין גישה חופשית לרשת** — כל URL חיצוני חייב להיות ברשימת ה-allowlist של אוצריא (פרט 12).
2. **כל הצבעים מגיעים מה-API** — אין לקודד צבעים ישירות בקוד.
3. **עיצוב אחיד לכל התוספים** — שפת עיצוב Material Design 3, בדיוק כמו אוצריא עצמה.
4. **הרשאות מינימליות בלבד** — בקשו רק מה שאתם אכן משתמשים בו.
5. **גלילה — חובה להגדיר באופן מפורש** — WebView לא גולל אוטומטית.

---

## 2. מבנה התוסף וקובץ manifest.json

### מבנה תיקיות

```
my-plugin/
├── manifest.json       ← חובה
├── index.html          ← ה-entrypoint
├── style.css           ← עיצוב (או inline ב-HTML)
├── script.js           ← לוגיקה (או inline ב-HTML)
└── assets/             ← תמונות, גופנים חיצוניים, ספריות מקומיות
```

### manifest.json — שדות חובה מלאים

```json
{
  "id": "com.yourname.pluginname",
  "name": "שם התוסף",
  "version": "1.0.0",
  "description": "תיאור קצר ומדויק של מה התוסף עושה",
  "author": "שמכם",
  "type": "webapp",
  "category": "Utilities",
  "stability": "beta",
  "minAppVersion": "0.9.91",
  "entrypoint": "index.html",
  "permissions": [
    "plugin.storage.read",
    "plugin.storage.write",
    "events.subscribe:theme.changed"
  ],
  "contributes": {
    "toolTab": {
      "title": "שם הכרטיסייה",
      "order": 100,
      "allowOrderBeforeBuiltIns": false,
      "defaultPinned": true,
      "iconName": "puzzle_piece_24_regular"
    }
  }
}
```

### פירוט שדות החובה

| שדה | תיאור | דוגמה |
|-----|--------|-------|
| `id` | מזהה ייחודי בפורמט reverse-domain | `"com.yossi.mytool"` |
| `name` | שם התוסף כפי שיוצג | `"מעקב לימוד"` |
| `version` | SemVer | `"1.0.0"` |
| `description` | תיאור קצר | `"מעקב יומי אחר לימוד..."` |
| `author` | שמכם | `"יוסי לוי"` |
| `type` | תמיד `"webapp"` | `"webapp"` |
| `category` | קטגוריה | `"Utilities"` |
| `stability` | `"beta"` או `"stable"` | `"beta"` |
| `minAppVersion` | גרסה מינימלית | `"0.9.91"` |
| `entrypoint` | קובץ HTML ראשי | `"index.html"` |

### שדה `contributes.toolTab`

```json
"contributes": {
  "toolTab": {
    "title": "לוח שנה",
    "order": 100,
    "allowOrderBeforeBuiltIns": false,
    "defaultPinned": true,
    "iconName": "calendar_24_regular"
  }
}
```

- **`defaultPinned: true`** — התוסף יופיע אוטומטית בסרגל הכלים אחרי התקנה. אם `false`, המשתמש צריך לנעוץ אותו ידנית.
- **`allowOrderBeforeBuiltIns`** — האם התוסף יכול להופיע לפני הכלים המובנים. השתמשו בזה רק אם זה הכרחי לתפקוד התוסף.
- **`order`** — מספר קטן יותר = מיקום שמאלי יותר.

### שדה `network.allowlist` (אופציונלי, הצהרתי בלבד)

```json
"network": {
  "allowlist": [
    "https://api.example.com/v1/endpoint"
  ]
}
```

> ⚠️ **חשוב:** שדה זה הצהרתי בלבד! גישה בפועל לרשת מחייבת PR לקוד אוצריא — ראה פרט 12.

---

## 3. הרשאות — רשימה מלאה וכללים

### כלל ברזל: בקשו רק מה שאתם משתמשים בו!

כל הרשאה שבקוד שלכם אין קריאה ל-API המתאים — **הסירו אותה**. הרשאות מיותרות:
- מעוררות חשד
- פוגעות באמון המשתמשים
- עלולות לגרום לדחיית התוסף מהחנות

### רשימת כל ההרשאות החוקיות

```json
{
  "permissions": [
    "app.info.read",                              // app.getInfo, app.getLocale, app.getGrantedPermissions
    "app.user_email.read",                        // app.getUserEmail
    "library.books.read",                         // library.findBooks, getBookMetadata, listRecentBooks, getTree
    "library.content.read",                       // library.getBookContent, getBookToc
    "search.fulltext.read",                       // search.fullText
    "reader.open",                                // reader.openBook, openBookAtRef, getCurrentState, getCurrentRef, getSelection
    "navigation.write",                           // navigation.goTo
    "notes.read",                                 // notes.list, getBookNotesSummary
    "notes.write",                                // notes.add, update, delete
    "calendar.read",                              // calendar.getSelectedDate, getDailyTimes, getHalachicTimes, getJewishDate, getEvents
    "settings.read",                              // settings.get, settings.getMany
    "ui.feedback",                                // ui.showMessage, showSuccess, showError, showConfirm, showWarning
    "plugin.storage.read",                        // storage.get, storage.list
    "plugin.storage.write",                       // storage.set, storage.remove
    "published_data.write",                       // publishedData.upsert, remove, listOwn
    "network.access",                             // גישה לרשת (+ PR נדרש!)
    "feedback.send_email",                        // feedback.sendEmail
    "history.read",                               // history.list, listSearches
    "history.write",                              // history.clear, remove
    "notifications.send",                         // notifications.showInApp
    "notifications.system",                       // notifications.sendSystem, scheduleSystem, cancel, cancelAll, checkPermissions, requestPermissions
    "app.run_on_startup",                         // ריצה ברקע בעת עלית האפליקציה
    "database.read",                              // database.listSources, describeSource, query, batchQuery
    "reader.context_menu",                        // reader.addContextMenuItem, removeContextMenuItem
    "reader.highlight",                           // reader.setHighlight, getHighlights, clearHighlight, clearAllHighlights

    // הרשמה לאירועים — כל אחד בנפרד:
    "events.subscribe:theme.changed",
    "events.subscribe:navigation.changed",
    "events.subscribe:reader.current_book_changed",
    "events.subscribe:reader.current_ref_changed",
    "events.subscribe:calendar.date_changed",
    "events.subscribe:workspace.changed",
    "events.subscribe:settings.changed",
    "events.subscribe:plugin.permissions_changed",
    "events.subscribe:reader.selection_changed"
  ]
}
```

### הרשאות שאינן קיימות — אל תכניסו אותן!

❌ `reader.context_menu` — **לא קיים** (הנכון: `reader.context_menu`)  
❌ `app.info.read` לבקשת מייל — **הנכון:** `app.user_email.read`  
❌ `navigation.write` לאירועים — **אירוע** דורש `events.subscribe:navigation.changed`  
❌ `settings.read` לאירועים — **אירוע** דורש `events.subscribe:settings.changed`  
❌ `events.subscribe:calendar.date_changed` — **כן קיים** ✅ (היה באג בגרסה ישנה)  
❌ `events.subscribe:reader.selection_changed` — **כן קיים** ✅ (דורש הרשמה)

---

## 4. עיצוב — Material Design 3 ושפת העיצוב של אוצריא

### עיקרון הברזל: אין צבעים קשיחים!

```css
/* ❌ אסור לחלוטין */
color: #6750A4;
background: white;
border: 1px solid #ccc;
border-radius: 20px;
font-size: 16px;

/* ✅ נכון */
color: var(--color-primary);
background: var(--color-surface);
border: 1px solid var(--color-outline);
border-radius: var(--radius-md);
font-size: 0.9em;
```

### CSS Variables — ברירות מחדל (מוחלפות על ידי applyTheme)

הכניסו זאת ל-`:root` בתחילת ה-CSS שלכם:

```css
:root {
  /* Color Roles */
  --color-primary:                   #6750A4;
  --color-on-primary:                #FFFFFF;
  --color-secondary:                 #625B71;
  --color-on-secondary:              #FFFFFF;
  --color-surface:                   #FFFBFE;
  --color-on-surface:                #1C1B1F;
  --color-surface-container-highest: #E6E0E9;
  --color-error:                     #B3261E;
  --color-on-error:                  #FFFFFF;
  --color-outline:                   #79747E;

  /* Derived */
  --color-primary-subtle:   rgba(103, 80, 164, 0.12);
  --color-secondary-subtle: rgba(98, 91, 113, 0.12);

  /* Typography */
  --font-main:      'Frank Ruhl Libre', 'David', serif;
  --font-size-base: 18px;
  --line-height:    1.5;

  /* Shape (M3) */
  --radius-sm:   8px;
  --radius-md:   12px;
  --radius-lg:   16px;
  --radius-pill: 999px;
}
```

### פונקציית applyTheme — חובה להפעיל!

```javascript
function applyTheme(theme) {
  if (!theme || !theme.colorScheme) return;
  const cs = theme.colorScheme;
  const root = document.documentElement;

  root.style.setProperty('--color-primary',                   cs.primary);
  root.style.setProperty('--color-on-primary',                cs.onPrimary);
  root.style.setProperty('--color-secondary',                 cs.secondary);
  root.style.setProperty('--color-on-secondary',              cs.onSecondary);
  root.style.setProperty('--color-surface',                   cs.surface);
  root.style.setProperty('--color-on-surface',                cs.onSurface);
  root.style.setProperty('--color-surface-container-highest', cs.surfaceContainerHighest);
  root.style.setProperty('--color-error',                     cs.error);
  root.style.setProperty('--color-on-error',                  cs.onError);
  root.style.setProperty('--color-outline',                   cs.outline);

  // גוונים עדינים לרקעי hover
  root.style.setProperty('--color-primary-subtle',   hexToRgba(cs.primary,   0.12));
  root.style.setProperty('--color-secondary-subtle', hexToRgba(cs.secondary, 0.12));

  // מצב כהה/בהיר
  document.body.classList.toggle('dark-mode', theme.mode === 'dark');

  // טיפוגרפיה
  if (theme.typography) {
    const t = theme.typography;
    root.style.setProperty('--font-main',      `'${t.fontFamily}', 'David', serif`);
    root.style.setProperty('--font-size-base', `${t.fontSize}px`);
    root.style.setProperty('--line-height',    String(t.lineHeight));
  }
}

function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// חיבור לאירועים:
Otzaria.on('plugin.boot',   payload => applyTheme(payload.theme));
Otzaria.on('theme.changed', applyTheme); // דורש: events.subscribe:theme.changed
```

### Color Roles — מה כל צבע משמש לו

| משתנה CSS | שימוש נכון |
|-----------|-----------|
| `--color-primary` | כפתורים ראשיים, הדגשות, קישורים |
| `--color-on-primary` | טקסט/אייקון **בתוך** אלמנטים בצבע primary |
| `--color-secondary` | הדגשות משניות, chips, אינדיקטורים |
| `--color-on-secondary` | טקסט/אייקון על רקע secondary |
| `--color-surface` | רקע כרטיסים, חלוניות, תיבות קלט, body |
| `--color-on-surface` | טקסט ראשי, אייקונים |
| `--color-surface-container-highest` | פופאוברים, דיאלוגים, שכבות מוגבהות |
| `--color-error` | הודעות שגיאה, גבולות שגיאה |
| `--color-outline` | מסגרות, מפרידים |
| `--color-primary-subtle` | רקעי hover, הדגשה קלה |
| `--color-secondary-subtle` | hover על אלמנטים משניים |

### Shape — border-radius אחיד

| משתנה | ערך | שימוש |
|-------|-----|-------|
| `--radius-sm` | `8px` | שדות קלט, chips קטנים, תאי טבלה |
| `--radius-md` | `12px` | כרטיסי תוכן |
| `--radius-lg` | `16px` | חלוניות, פאנלים |
| `--radius-pill` | `999px` | pills, chips עגולים, badges |

### רכיבי עיצוב סטנדרטיים

#### כפתור ראשי (Filled)
```css
.btn-primary {
  background: var(--color-primary);
  color: var(--color-on-primary);
  border: none;
  border-radius: var(--radius-sm);
  padding: 9px 20px;
  font-family: var(--font-main);
  font-size: 0.95rem;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.15s;
}
.btn-primary:hover    { opacity: 0.88; }
.btn-primary:disabled { opacity: 0.45; cursor: default; }
```

#### כפתור משני (Tonal)
```css
.btn-secondary {
  background: var(--color-secondary-subtle);
  color: var(--color-on-surface);
  border: 1px solid var(--color-outline);
  border-radius: var(--radius-sm);
  padding: 9px 20px;
  font-family: var(--font-main);
  font-size: 0.95rem;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.15s;
}
.btn-secondary:hover { opacity: 0.85; }
```

#### כרטיס (Card)
```css
.card {
  background: var(--color-surface);
  border: 1px solid var(--color-outline);
  border-radius: var(--radius-md);
  padding: 16px 20px;
}
.card-title {
  font-size: 1rem;
  font-weight: 700;
  color: var(--color-primary);
  margin-bottom: 12px;
}
```

#### שדה קלט (Input)
```css
.input {
  padding: 9px 12px;
  border: 1.5px solid var(--color-outline);
  border-radius: var(--radius-sm);
  font-family: var(--font-main);
  font-size: 0.95rem;
  color: var(--color-on-surface);
  background: var(--color-surface);
  direction: rtl;
  outline: none;
  transition: border-color 0.15s;
  width: 100%;
  box-sizing: border-box;
}
.input:focus { border-color: var(--color-primary); }
```

#### Chip / Tag
```css
.chip {
  border-radius: var(--radius-pill);
  background: var(--color-primary-subtle);
  color: var(--color-primary);
  padding: 4px 12px;
  font-size: 0.8rem;
  font-weight: 600;
  display: inline-block;
}
```

#### Hover אינטראקטיבי
```css
.interactive {
  transition: background 0.15s;
  cursor: pointer;
}
.interactive:hover {
  background: color-mix(in srgb, var(--color-primary) 8%, transparent);
}
```

#### ספינר טעינה
```css
.spinner {
  width: 36px; height: 36px;
  border: 3px solid var(--color-outline);
  border-top-color: var(--color-primary);
  border-radius: 50%;
  animation: spin 0.75s linear infinite;
  margin: auto;
}
@keyframes spin { to { transform: rotate(360deg); } }
```

#### אנימציית כניסה
```css
.fade-in {
  animation: fadeIn 0.2s ease-out;
}
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(4px); }
  to   { opacity: 1; transform: translateY(0); }
}
```

---

## 5. מבנה HTML — שלד מלא

```html
<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>שם התוסף</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    /* ── גלילה — חובה! ─────────────────────────────── */
    html, body {
      height: 100%;
      overflow-y: auto;
      overflow-x: hidden;
    }

    /* ── CSS Variables (ברירות מחדל) ───────────────── */
    :root {
      --color-primary: #6750A4; --color-on-primary: #FFFFFF;
      --color-secondary: #625B71; --color-on-secondary: #FFFFFF;
      --color-surface: #FFFBFE; --color-on-surface: #1C1B1F;
      --color-surface-container-highest: #E6E0E9;
      --color-error: #B3261E; --color-on-error: #FFFFFF;
      --color-outline: #79747E;
      --color-primary-subtle: rgba(103,80,164,0.12);
      --color-secondary-subtle: rgba(98,91,113,0.12);
      --font-main: 'Frank Ruhl Libre', 'David', serif;
      --font-size-base: 18px;
      --line-height: 1.5;
      --radius-sm: 8px; --radius-md: 12px;
      --radius-lg: 16px; --radius-pill: 999px;
    }

    /* ── גוף ─────────────────────────────────────── */
    body {
      font-family: var(--font-main);
      font-size: var(--font-size-base);
      line-height: var(--line-height);
      background: var(--color-surface);
      color: var(--color-on-surface);
      direction: rtl;
      min-height: 100%;
    }

    /* ── כותרת עליונה אחידה ───────────────────────── */
    .plugin-header {
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
      padding: 12px 16px;
      border-bottom: 1px solid var(--color-outline);
      background: var(--color-surface);
    }
    .plugin-header h1 {
      font-size: 1.1em;
      font-weight: 700;
      color: var(--color-on-surface);
      text-align: center;
    }
    .settings-btn {
      position: absolute;
      left: 12px;       /* שמאל תמיד — ב-RTL זה הצד הנגדי */
      background: none;
      border: none;
      cursor: pointer;
      color: var(--color-on-surface);
      padding: 6px;
      border-radius: var(--radius-sm);
      transition: background 0.15s;
      display: flex;
      align-items: center;
    }
    .settings-btn:hover {
      background: var(--color-secondary-subtle);
    }

    /* ── תוכן ─────────────────────────────────────── */
    .plugin-content {
      padding: 16px;
    }

    /* ── Scrim ────────────────────────────────────── */
    .overlay-scrim {
      position: fixed; inset: 0;
      background: rgba(0,0,0,0.30);
      opacity: 0; pointer-events: none;
      transition: opacity 0.2s; z-index: 100;
    }
    .overlay-scrim.open { opacity: 1; pointer-events: auto; }

    /* ── פאנל הגדרות ─────────────────────────────── */
    .overlay-panel {
      position: fixed;
      top: 10px; bottom: 12px; left: 10px;
      width: 320px;
      background: color-mix(in srgb, var(--color-secondary) 15%, var(--color-surface));
      border-radius: 18px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.18);
      padding: 20px;
      overflow-y: auto;
      z-index: 101;
      opacity: 0;
      transform: translateX(-30px);  /* נכנס מהשמאל */
      pointer-events: none;
      transition: opacity 0.2s, transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    }
    .overlay-panel.open {
      opacity: 1; transform: translateX(0); pointer-events: auto;
    }
    .overlay-panel h2 {
      font-size: 1.1em; font-weight: 700;
      color: var(--color-primary); margin-bottom: 16px;
    }
  </style>
</head>
<body>

  <!-- כותרת עליונה -->
  <header class="plugin-header">
    <h1>שם התוסף</h1>
    <button class="settings-btn" id="settingsBtn" aria-label="הגדרות">
      <!-- אייקון הגדרות — SVG inline -->
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <path d="M12 15.5A3.5 3.5 0 0 1 8.5 12 3.5 3.5 0 0 1 12 8.5a3.5 3.5 0 0 1 3.5 3.5 3.5 3.5 0 0 1-3.5 3.5m7.43-2.92c.04-.34.07-.69.07-1.08s-.03-.74-.07-1.08l2.33-1.82a.55.55 0 0 0 .13-.71l-2.21-3.82a.55.55 0 0 0-.67-.24l-2.75 1.1c-.57-.44-1.18-.8-1.85-1.07L14 2.42A.54.54 0 0 0 13.46 2h-4.42A.54.54 0 0 0 8.5 2.42l-.42 2.93c-.67.27-1.28.63-1.85 1.07L3.48 5.32a.54.54 0 0 0-.67.24L.6 9.38a.53.53 0 0 0 .13.71l2.33 1.82c-.04.34-.07.69-.07 1.09s.03.74.07 1.08L.73 15.9a.55.55 0 0 0-.13.71l2.21 3.82c.14.24.41.32.67.24l2.75-1.1c.57.44 1.18.8 1.85 1.07l.42 2.93c.06.3.3.43.54.43h4.42c.24 0 .48-.13.54-.43l.42-2.93c.67-.27 1.28-.63 1.85-1.07l2.75 1.1a.55.55 0 0 0 .67-.24l2.21-3.82a.55.55 0 0 0-.13-.71l-2.33-1.82z"
              fill="currentColor"/>
      </svg>
    </button>
  </header>

  <!-- תוכן ראשי -->
  <main class="plugin-content">
    <!-- תוכן התוסף כאן -->
  </main>

  <!-- Scrim -->
  <div class="overlay-scrim" id="scrim"></div>

  <!-- פאנל הגדרות -->
  <aside class="overlay-panel" id="settingsPanel">
    <h2>הגדרות</h2>
    <!-- תוכן ההגדרות כאן -->
  </aside>

  <script>
    // ── applyTheme ─────────────────────────────────
    function applyTheme(theme) {
      if (!theme || !theme.colorScheme) return;
      const cs = theme.colorScheme;
      const r = document.documentElement;
      r.style.setProperty('--color-primary',                   cs.primary);
      r.style.setProperty('--color-on-primary',                cs.onPrimary);
      r.style.setProperty('--color-secondary',                 cs.secondary);
      r.style.setProperty('--color-on-secondary',              cs.onSecondary);
      r.style.setProperty('--color-surface',                   cs.surface);
      r.style.setProperty('--color-on-surface',                cs.onSurface);
      r.style.setProperty('--color-surface-container-highest', cs.surfaceContainerHighest);
      r.style.setProperty('--color-error',                     cs.error);
      r.style.setProperty('--color-on-error',                  cs.onError);
      r.style.setProperty('--color-outline',                   cs.outline);
      r.style.setProperty('--color-primary-subtle',   hexToRgba(cs.primary,   0.12));
      r.style.setProperty('--color-secondary-subtle', hexToRgba(cs.secondary, 0.12));
      document.body.classList.toggle('dark-mode', theme.mode === 'dark');
      if (theme.typography) {
        r.style.setProperty('--font-main',      `'${theme.typography.fontFamily}', 'David', serif`);
        r.style.setProperty('--font-size-base', `${theme.typography.fontSize}px`);
        r.style.setProperty('--line-height',    String(theme.typography.lineHeight));
      }
    }
    function hexToRgba(hex, alpha) {
      return `rgba(${parseInt(hex.slice(1,3),16)},${parseInt(hex.slice(3,5),16)},${parseInt(hex.slice(5,7),16)},${alpha})`;
    }

    // ── פאנל הגדרות ────────────────────────────────
    const settingsBtn   = document.getElementById('settingsBtn');
    const settingsPanel = document.getElementById('settingsPanel');
    const scrim         = document.getElementById('scrim');

    function openSettings() {
      settingsPanel.classList.add('open');
      scrim.classList.add('open');
    }
    function closeSettings() {
      settingsPanel.classList.remove('open');
      scrim.classList.remove('open');
    }
    settingsBtn.addEventListener('click', openSettings);
    scrim.addEventListener('click', closeSettings);

    // ── אתחול ──────────────────────────────────────
    Otzaria.on('plugin.boot', async (payload) => {
      applyTheme(payload.theme);
      // ... אתחול שלכם כאן
    });
    // דורש: events.subscribe:theme.changed
    Otzaria.on('theme.changed', applyTheme);
  </script>
</body>
</html>
```

---

## 6. כללי UX וממשק משתמש אחיד

אלה כללים **מחייבים** לכל התוספים בחנות אוצריא — לא המלצות:

### כותרת עליונה

✅ **שם התוסף תמיד ממורכז לאמצע בכותרת**
✅ **הכותרת תהיה שם התוסף בלבד** — לא שם המפתח, לא תיאור
❌ **אסור לכתוב שם המפתח בכותרת** או בכל מקום גלוי בתוסף (למעט בחלון "אודות" אופציונלי)

```html
<!-- ✅ נכון -->
<header class="plugin-header">
  <h1>מעקב לימוד</h1>
  <button class="settings-btn">...</button>
</header>

<!-- ❌ שגוי -->
<header>
  <h1>מעקב לימוד — מאת יוסי לוי</h1>
</header>
```

### כפתור הגדרות

✅ **כפתור הגדרות תמיד בצד שמאל של הכותרת**
✅ **לחיצה על כפתור הגדרות פותחת פאנל overlay מהצד השמאל**
✅ **עיצוב פאנל ההגדרות בדיוק כמו בתמונה** — background של `color-mix(secondary + surface)`, border-radius 18px, box-shadow

```css
/* כפתור הגדרות — תמיד שמאל */
.settings-btn {
  position: absolute;
  left: 12px;   /* שמאל ב-RTL */
  /* ... */
}

/* פאנל יוצא משמאל */
.overlay-panel {
  left: 10px;   /* ב-RTL: שמאל */
  transform: translateX(-30px);  /* כניסה מהשמאל */
}
.overlay-panel.open {
  transform: translateX(0);
}
```

### מה מותר בפאנל ההגדרות

✅ הגדרות שמשפיעות על התנהגות התוסף
✅ בחירות ברירת מחדל
✅ כפתור "אודות" עם שם המפתח ופרטי יצירת קשר
❌ לוגיקת תוסף ראשית — ההגדרות זה רק הגדרות

### אודות — מקום שם המפתח

```html
<!-- בתוך פאנל ההגדרות -->
<details>
  <summary>אודות</summary>
  <p>פותח על ידי: יוסי לוי</p>
  <p>גרסה: 1.0.0</p>
  <p>יצירת קשר: yossi@example.com</p>
</details>
```

### נגישות בסיסית

```html
<!-- תמיד הוסיפו aria-label לכפתורים ללא טקסט -->
<button aria-label="הגדרות">...</button>
<button aria-label="סגור">...</button>

<!-- תמיד הוסיפו alt לתמונות -->
<img src="icon.png" alt="אייקון מועדפים" />

<!-- שדות קלט תמיד עם label -->
<label for="searchInput">חיפוש</label>
<input id="searchInput" type="text" />
```

---

## 7. גלילה, פריסה ותמיכה במובייל

### גלילה — חובה מוחלטת!

WebView **אינו** גולל אוטומטית. ללא הגדרה מפורשת — הדף ייחתך ולא יגלול.

```css
/* ── חובה בכל תוסף ─────────────────────────────── */
html, body {
  height: 100%;
  overflow-y: auto;
  overflow-x: hidden;
}

/* ── אם יש container גלילה מותאם ──────────────── */
.scroll-container {
  height: 100%;
  overflow-y: auto;    /* או scroll */
  overflow-x: hidden;
}

/* ── מה לא לעשות ──────────────────────────────── */
/* ❌ אסור! חוסם גלילה */
html { overflow: hidden; }
body { overflow: hidden; }
```

### פריסה רספונסיבית — תמיכה בגדלים שונים

```css
/* ── ברירת מחדל: עמודה אחת (מובייל) ───────────── */
.grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
}

/* ── טאבלט ומעלה ────────────────────────────── */
@media (min-width: 480px) {
  .grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

/* ── דסקטופ ────────────────────────────────── */
@media (min-width: 768px) {
  .grid {
    grid-template-columns: repeat(3, 1fr);
  }
}
```

### גופנים — גודל יחסי בלבד!

`fontSize` של המשתמש נע בין 16 ל-36 פיקסל. עצבו **תמיד** עם `em` יחסי:

```css
/* ❌ שגוי — קשיח */
.title { font-size: 20px; }

/* ✅ נכון — יחסי */
.title { font-size: 1.2em; }     /* 120% מ-base */
.small { font-size: 0.85em; }    /* 85% מ-base */
.label { font-size: 0.75em; }    /* 75% מ-base */
```

### היררכיה טיפוגרפית מומלצת

```css
.text-headline { font-size: 1.4em; font-weight: 700; }
.text-title    { font-size: 1.1em; font-weight: 700; }
.text-body     { font-size: 1em;   font-weight: 400; }
.text-body-sm  { font-size: 0.88em; }
.text-label    { font-size: 0.78em; font-weight: 600; }
```

---

## 8. API — כל הקריאות הזמינות

### תבנית קריאה בסיסית

```javascript
// תמיד השתמשו ב-try/catch
try {
  const response = await Otzaria.call('method.name', { param: value });
  if (response.success) {
    const data = response.data;
    // עשו משהו עם data
  } else {
    console.error('שגיאה:', response.error.message);
  }
} catch (e) {
  console.error('שגיאת רשת/SDK:', e);
}
```

### app.* — מידע על האפליקציה

**הרשאה:** `app.info.read`

```javascript
// מידע על גרסה ופלטפורמה
const { data } = await Otzaria.call('app.getInfo');
// { version: "5.2.1", buildNumber: "123", platform: "windows" }

// ערכת צבעים (בדרך כלל לא צריך — מגיע ב-plugin.boot)
const { data: theme } = await Otzaria.call('app.getTheme');

// שפה וכיוון
const { data } = await Otzaria.call('app.getLocale');
// { locale: "he-IL", textDirection: "rtl" }

// הרשאות מאושרות נוכחיות
const { data } = await Otzaria.call('app.getGrantedPermissions');
// { permissions: ["app.info.read", "reader.open"] }
```

**הרשאה נוספת:** `app.user_email.read`

```javascript
// מייל המשתמש (אם הוגדר)
const { data } = await Otzaria.call('app.getUserEmail');
// { email: "user@example.com" }
```

### library.* — ספרייה

**הרשאה:** `library.books.read`

```javascript
// חיפוש ספרים
const { data: books } = await Otzaria.call('library.findBooks', {
  query: 'רמב"ם',
  limit: 10  // ברירת מחדל: 20
});
// [{ bookId: "משנה תורה", title: "משנה תורה", topics: [...] }, ...]

// מטא-דאטה על ספר
const { data: meta } = await Otzaria.call('library.getBookMetadata', {
  bookId: 'בראשית'
});

// ספרים שנפתחו לאחרונה
const { data: recent } = await Otzaria.call('library.listRecentBooks');

// עץ ספרייה מלא
const { data: tree } = await Otzaria.call('library.getTree', {
  path: '/תנך',     // אופציונלי — צמצום לתת-קטגוריה
  includeBooks: true // ברירת מחדל: true
});
```

**הרשאה:** `library.content.read`

```javascript
// תוכן ספר (עד 5000 תווים)
const { data: content } = await Otzaria.call('library.getBookContent', {
  bookId: 'בראשית',
  offset: 0,
  limit: 2000  // מקסימום: 5000
});

// תוכן עניינים
const { data: toc } = await Otzaria.call('library.getBookToc', {
  bookId: 'בראשית'
});
// [{ text: "פרק א", index: 0, level: 1 }, ...]
```

### search.* — חיפוש

**הרשאה:** `search.fulltext.read`

```javascript
const { data: results } = await Otzaria.call('search.fullText', {
  query: 'ואהבת לרעך כמוך',
  limit: 50  // ברירת מחדל: 50
});
// [{ book: "ויקרא", text: "...", index: 1234 }, ...]
```

### reader.* — פעולות קריאה

**הרשאה:** `reader.open`

```javascript
// פתיחת ספר לפי index
await Otzaria.call('reader.openBook', {
  bookId: 'בראשית',
  index: 0,
  searchQuery: ''  // אופציונלי — הדגשת טקסט
});

// פתיחת ספר לפי כותרת/ref
await Otzaria.call('reader.openBookAtRef', {
  bookId: 'בראשית',
  ref: 'פרק א',
  index: 0  // גיבוי אם ה-ref לא נמצא
});

// מצב קורא נוכחי (כולל כל הטאבים הפתוחים)
const { data: state } = await Otzaria.call('reader.getCurrentState');
// {
//   currentBook: "בראשית", currentBookId: "בראשית",
//   currentIndex: 42, currentRef: "פרק ג",
//   openTabs: [{ bookId, book, index, currentRef }, ...]
// }

// מיקום נוכחי בלבד
const { data: ref } = await Otzaria.call('reader.getCurrentRef');
// { currentBook, currentBookId, currentIndex, currentRef }

// טקסט מסומן נוכחי
const { data: sel } = await Otzaria.call('reader.getSelection');
// { text, start, end, currentRef, currentBook, currentBookId, currentIndex }
// null אם אין סימון
```

**הרשאה:** `reader.context_menu`

```javascript
// הוספת פריט לתפריט קליק ימני
await Otzaria.call('reader.addContextMenuItem', {
  id: 'my-item',
  label: 'שמור מראה מקום',
  icon: 'bookmark_24_regular'  // אופציונלי
});

// הסרת פריט
await Otzaria.call('reader.removeContextMenuItem', { id: 'my-item' });
```

**הרשאה:** `reader.highlight`

```javascript
// הוספת הדגשה
await Otzaria.call('reader.setHighlight', {
  bookId: 'בראשית',
  index: 42,
  color: '#FFFF00',  // אופציונלי
  label: 'חשוב'     // אופציונלי
});

// קריאת כל ההדגשות לספר
const { data: highlights } = await Otzaria.call('reader.getHighlights', {
  bookId: 'בראשית'
});

// מחיקת הדגשה ספציפית
await Otzaria.call('reader.clearHighlight', { bookId: 'בראשית', index: 42 });

// מחיקת כל ההדגשות
await Otzaria.call('reader.clearAllHighlights', {});
// או לספר ספציפי:
await Otzaria.call('reader.clearAllHighlights', { bookId: 'בראשית' });
```

### navigation.* — ניווט

**הרשאה:** `navigation.write`

```javascript
// מעבר למסך ראשי
await Otzaria.call('navigation.goTo', {
  target: 'library'  // 'library' | 'reading' | 'more' | 'settings'
});
```

### notes.* — הערות

**הרשאה:** `notes.read`

```javascript
const { data: notes } = await Otzaria.call('notes.list', { bookId: 'בראשית' });
// [{ id, lineNumber, content, contentPlain }, ...]

const { data: summary } = await Otzaria.call('notes.getBookNotesSummary');
// [{ bookId, noteCount, lastModified }, ...]
```

**הרשאה:** `notes.write`

```javascript
await Otzaria.call('notes.add', { bookId: 'בראשית', lineNumber: 10, content: 'הערה' });
await Otzaria.call('notes.update', { bookId: 'בראשית', noteId: '123', content: 'מעודכן' });
await Otzaria.call('notes.delete', { bookId: 'בראשית', noteId: '123' });
```

### ui.* — ממשק משתמש

**הרשאה:** `ui.feedback`

```javascript
// הודעות (snackbar / toast)
await Otzaria.call('ui.showMessage', { message: 'הפעולה בוצעה' });
await Otzaria.call('ui.showSuccess', { message: 'נשמר בהצלחה!' });
await Otzaria.call('ui.showError',   { message: 'אירעה שגיאה' });

// דיאלוגים עם אישור
const { data } = await Otzaria.call('ui.showConfirm', {
  title: 'אישור מחיקה',
  content: 'האם אתה בטוח?'
});
if (data.confirmed) { /* ... */ }

const { data } = await Otzaria.call('ui.showWarning', {
  title: 'אזהרה',
  content: 'פעולה בלתי הפיכה',
  subtitle: 'לא ניתן לשחזר'  // אופציונלי
});
```

### calendar.* — לוח שנה

**הרשאה:** `calendar.read`

```javascript
// תאריך נבחר
const { data: date } = await Otzaria.call('calendar.getSelectedDate');
// "2026-04-08T00:00:00.000Z"

// זמנים הלכתיים
const { data: times } = await Otzaria.call('calendar.getDailyTimes');
// { sunrise: "06:23", sunset: "19:11", tzet: "19:45", ... }

// תאריך עברי
const { data: jewishDate } = await Otzaria.call('calendar.getJewishDate');
// { year: 5786, month: 1, day: 10, monthName: "ניסן",
//   isLeapYear: false, isShabbat: false,
//   holidays: [{ text: "שביעי של פסח", kind: "yomTov" }] }

// אירועי יום
const { data: events } = await Otzaria.call('calendar.getEvents', {
  date: '2026-04-08'  // אופציונלי — ברירת מחדל: תאריך נבחר
});
```

### storage.* — אחסון

**הרשאה:** `plugin.storage.read` לקריאה, `plugin.storage.write` לכתיבה

```javascript
// שמירה
await Otzaria.call('storage.set', { key: 'mySettings', value: { fontSize: 18, darkMode: true } });

// קריאה
const { data } = await Otzaria.call('storage.get', { key: 'mySettings' });
// { fontSize: 18, darkMode: true } או null אם לא קיים

// מחיקה
await Otzaria.call('storage.remove', { key: 'mySettings' });

// רשימת כל המפתחות
const { data: keys } = await Otzaria.call('storage.list');
// ["mySettings", "cache", ...]
```

**טיפ:** שמרו אובייקט אחד עם כל ההגדרות, לא מפתח לכל הגדרה:

```javascript
// ✅ נכון — קריאה/כתיבה אחת
const settings = { theme: 'auto', fontSize: 18, showDates: true };
await Otzaria.call('storage.set', { key: 'settings', value: settings });

// ❌ פחות יעיל
await Otzaria.call('storage.set', { key: 'theme',     value: 'auto' });
await Otzaria.call('storage.set', { key: 'fontSize',  value: 18 });
await Otzaria.call('storage.set', { key: 'showDates', value: true });
```

### settings.* — הגדרות אוצריא

**הרשאה:** `settings.read`

```javascript
// קריאת הגדרה בודדת
const { data: fontSize } = await Otzaria.call('settings.get', { key: 'key-font-size' });

// קריאת מספר הגדרות
const { data: settings } = await Otzaria.call('settings.getMany', {
  keys: ['key-font-size', 'key-font-family', 'key-dark-mode']
});
// { "key-font-size": 25, "key-font-family": "Frank Ruhl Libre", "key-dark-mode": false }
```

מפתחות מורשים לקריאה: `key-dark-mode`, `key-follow-system-theme`, `key-swatch-color`, `key-dark-swatch-color`, `key-font-size`, `key-font-family`, `key-commentators-font-family`, `key-commentators-font-size`, `key-line-height`, `key-selected-city`, `key-calendar-type`, `key-show-teamim`, `key-default-nikud`, `key-remove-nikud-tanach`, `key-replace-holy-names`, `key-library-view-mode`, `key-align-tabs-to-right`, `key-copy-with-headers`, `key-copy-header-format`

### notifications.* — התראות

**הרשאה:** `notifications.send`

```javascript
// התראה בתוך האפליקציה (snackbar)
await Otzaria.call('notifications.showInApp', {
  message: 'הפעולה הושלמה',
  type: 'success'  // 'info' | 'success' | 'error'
});
```

**הרשאה:** `notifications.system`

```javascript
// התראת מערכת הפעלה מיידית
await Otzaria.call('notifications.sendSystem', {
  title: 'תזכורת',
  body: 'זמן שחרית',
  id: 12345  // אופציונלי
});

// התראה מתוזמנת — scheduledTime חייב להיות ISO 8601 UTC!
await Otzaria.call('notifications.scheduleSystem', {
  title: 'תזכורת',
  body: 'זמן מנחה',
  scheduledTime: new Date(targetDate).toISOString(),  // UTC נכון כאן!
  id: 12346
});

// ביטול התראות
await Otzaria.call('notifications.cancel',    { id: 12345 });
await Otzaria.call('notifications.cancelAll');

// בדיקה ובקשת הרשאות
const { data: perms } = await Otzaria.call('notifications.checkPermissions');
if (!perms.granted) {
  await Otzaria.call('notifications.requestPermissions');
}
```

### history.* — היסטוריה

**הרשאה:** `history.read`

```javascript
const { data: history } = await Otzaria.call('history.list', { limit: 50 });
// [{ bookId, title, ref, index, workspaceName }, ...]

const { data: searches } = await Otzaria.call('history.listSearches', { limit: 50 });
// [{ query, ref, workspaceName }, ...]
```

**הרשאה:** `history.write`

```javascript
await Otzaria.call('history.clear');
await Otzaria.call('history.remove', { bookId: 'בראשית', index: 0 });
```

### feedback.* — משוב

**הרשאה:** `feedback.send_email`

```javascript
await Otzaria.call('feedback.sendEmail', {
  to: 'author@example.com',
  subject: 'משוב על התוסף',
  body: 'הכל עובד מעולה!',
  includeSystemInfo: true  // מוסיף גרסה, פלטפורמה ושם תוסף
});
```

### publishedData.* — שיתוף נתונים

**הרשאה:** `published_data.write`

```javascript
// פרסום אירוע ללוח שנה
await Otzaria.call('publishedData.upsert', {
  type: 'calendar.event',
  scope: 'global',
  key: 'myplugin:event1',
  payload: {
    title: 'שקיעה',
    startsAt: '2026-04-08T19:11:00+03:00',
    source: 'שם התוסף',
    importance: 'high'  // 'high' | 'medium' | 'low'
  }
});

// הסרה
await Otzaria.call('publishedData.remove', {
  type: 'calendar.event', scope: 'global', key: 'myplugin:event1'
});

// רשימת כל הרשומות שלי
const { data } = await Otzaria.call('publishedData.listOwn');
```

סוגי `type`: `'calendar.event'`, `'saved.query'`, `'note.draft'`, `'reference.link'`, `'tool.badge'`

### database.* — SQLite

**הרשאה:** `database.read` + הצהרה ב-manifest

```json
"contributes": {
  "databaseSources": [
    { "id": "talmud_synopsis", "label": "עדי נוסח בבלי", "required": true }
  ]
}
```

```javascript
// רשימת מקורות זמינים
const { data } = await Otzaria.call('database.listSources');

// סכמה של מקור
const { data } = await Otzaria.call('database.describeSource', { sourceId: 'talmud_synopsis' });

// שאילתה דקלרטיבית
const { data } = await Otzaria.call('database.query', {
  sourceId: 'talmud_synopsis',
  from: { table: 'tractates', alias: 't' },
  select: [{ expr: 't.name', as: 'name' }],
  where: { op: '=', left: 't.name', value: 'מסכת ברכות' },
  orderBy: [{ expr: 't.name', direction: 'asc' }],
  limit: 100,
  rowFormat: 'object'  // 'array' | 'object'
});
```

### ריצת רקע (app.run_on_startup)

**הרשאה:** `app.run_on_startup`

```javascript
Otzaria.on('plugin.boot', async (payload) => {
  if (payload.app.runMode === 'background') {
    // רץ בעת עלית אוצריא, לפני שהמשתמש פתח את הכרטיסייה
    // השתמשו בזה לתזמון התראות, טעינת נתונים ברקע וכו'
  }
  // אחרת: runMode === 'foreground' — המשתמש רואה את הכרטיסייה
});
```

> ⚠️ **בלי בדיקת `runMode` — קוד יירוץ פעמיים** (פעם מ-background, פעם מ-foreground).

---

## 9. אירועים (Events)

### רשימת כל האירועים

```javascript
// ─── ללא הרשאה ───────────────────────────────────────
Otzaria.on('plugin.boot',  (payload) => { /* BootPayload — אתחול */ });
Otzaria.on('plugin.ready', ()        => { /* לאחר boot */ });

// ─── דורשים הרשאה ────────────────────────────────────
// events.subscribe:theme.changed
Otzaria.on('theme.changed', (theme) => { applyTheme(theme); });

// events.subscribe:navigation.changed
// נורה רק בין מסכים ראשיים (library ↔ reading ↔ more ↔ settings)
Otzaria.on('navigation.changed', ({ screen }) => { console.log(screen); });

// events.subscribe:reader.current_book_changed
// נורה כשספר/טאב חדש נבחר — לא כשגוללים בתוך ספר
Otzaria.on('reader.current_book_changed', ({ book, index }) => { });

// events.subscribe:reader.current_ref_changed
// נורה בכל שינוי מיקום קריאה (גלילה לפרק, מעבר עמוד, פתיחת ספר)
// ⭐ זה האירוע הנכון למעקב אחרי מיקום!
Otzaria.on('reader.current_ref_changed', (location) => {
  // { currentBook, currentBookId, currentIndex, currentRef }
});

// events.subscribe:calendar.date_changed
Otzaria.on('calendar.date_changed', ({ date }) => { });

// events.subscribe:workspace.changed
Otzaria.on('workspace.changed', ({ workspaceId }) => { });

// events.subscribe:settings.changed
Otzaria.on('settings.changed', ({ key, newValue }) => { });

// events.subscribe:plugin.permissions_changed
Otzaria.on('plugin.permissions_changed', ({ permissions }) => { });

// events.subscribe:reader.selection_changed
// נורה כשהמשתמש מסמן טקסט — לא נורה בביטול סימון
Otzaria.on('reader.selection_changed', ({ text, currentRef, currentBook }) => { });

// ─── ללא הרשאה נוספת (נשלח רק לתוסף הרושם) ───────────
Otzaria.on('reader.context_menu_item_clicked', (data) => {
  // { itemId, selectedText, currentRef, currentBook, currentBookId, currentIndex }
});
```

### הבדל חשוב בין אירועי הקורא

| אירוע | מתי נורה |
|-------|---------|
| `navigation.changed` | מעבר בין מסכים ראשיים בלבד |
| `reader.current_book_changed` | פתיחת ספר/טאב חדש בלבד |
| `reader.current_ref_changed` | **כל** שינוי מיקום — גלילה, פרק, עמוד, ספר |

**למעקב אחרי מיקום → השתמשו ב-`reader.current_ref_changed`!**

### הסרת האזנה

```javascript
// חשוב: לשמור reference לפונקציה כדי להסיר אותה
const handler = (data) => { doSomething(data); };
Otzaria.on('theme.changed', handler);
// ...
Otzaria.off('theme.changed', handler);
```

---

## 10. אחסון נתונים

### מתי להשתמש ב-storage

```javascript
// ✅ שמרו בסיום פעולה חשובה
async function saveUserData(data) {
  await Otzaria.call('storage.set', { key: 'userData', value: data });
}

// ✅ טענו ב-plugin.boot
Otzaria.on('plugin.boot', async () => {
  const { data: saved } = await Otzaria.call('storage.get', { key: 'userData' });
  if (saved) loadUserData(saved);
});
```

### טיפול ב-null

```javascript
// storage.get מחזיר null אם המפתח לא קיים
const { data } = await Otzaria.call('storage.get', { key: 'settings' });
const settings = data ?? { theme: 'auto', fontSize: 18 }; // ברירת מחדל
```

---

## 11. בטיחות קוד — XSS, Timezone ועוד

### בעיית Timezone — `toISOString()` לתאריכים מקומיים ❌

```javascript
// ❌ שגוי — מחזיר UTC, לא תאריך מקומי!
// בישראל אחרי 2:00-3:00 בלילה יחזיר את תאריך מחר!
const today = new Date().toISOString().slice(0, 10);

// ✅ נכון — תאריך מקומי
function localDateStr(d) {
  d = d || new Date();
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}
const today = localDateStr();

// ✅ זה בסדר — חותמת זמן לשרת/תזכורות (UTC הוא הנכון)
scheduledTime: new Date(targetDate).toISOString()
```

### XSS — אל תכניסו ישירות ל-innerHTML ❌

כל ערך שאינו קוד שלכם — שם קובץ, נתוני API, נתוני storage, קלט משתמש — עלול להכיל HTML זדוני.

```javascript
// ❌ שגוי — XSS!
card.innerHTML = `<div>${fileName}</div>`;
chip.innerHTML = `<span>${apiResponse.name}</span>`;
list.innerHTML += `<li>${userInput}</li>`;

// ✅ פתרון 1: פונקציית esc
function esc(s) {
  const d = document.createElement('div');
  d.textContent = String(s);
  return d.innerHTML;
}
card.innerHTML = `<div>${esc(fileName)}</div>`;

// ✅ פתרון 2 (הכי בטוח): textContent ישירות
const div = document.createElement('div');
div.textContent = fileName;
card.appendChild(div);
```

**כלל:** כל ערך שלא כתבתם אתם בקוד — `esc()` לפני `innerHTML`.

### טיפול בשגיאות API

```javascript
// תמיד בדקו success לפני שימוש ב-data
const response = await Otzaria.call('library.findBooks', { query: 'תנ"ך' });
if (!response.success) {
  console.error(`שגיאה: ${response.error.code} — ${response.error.message}`);
  return;
}
const books = response.data;
```

---

## 12. ספריות חיצוניות, גופנים ורשת

### ⚠️ אין גישה חופשית לרשת!

אוצריא חוסם כל בקשת רשת שאינה ברשימת ה-allowlist. זה אומר:

```html
<!-- ❌ יכשל בזמן ריצה! -->
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Ruboto" />
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
```

### כל ספרייה חיצונית — ארזו בתוך התוסף!

```
my-plugin/
├── manifest.json
├── index.html
└── assets/
    ├── libs/
    │   ├── chart.min.js        ← הורידו ושמרו לוקלית
    │   └── flatpickr.min.css   ← הורידו ושמרו לוקלית
    └── fonts/
        └── my-font.woff2       ← רק אם לא גופן מובנה של אוצריא
```

```html
<!-- ✅ נכון — קובץ לוקלי -->
<script src="assets/libs/chart.min.js"></script>
<link rel="stylesheet" href="assets/libs/flatpickr.min.css" />
```

### גופנים מובנים — אין צורך לארוז!

הגופנים האלה מוזרקים אוטומטית לכל WebView של תוסף:
`FrankRuhlCLM`, `TaameyDavidCLM`, `Shofar`, `NotoRashiHebrew`, `KeterYG`, `NotoSerifHebrew`, `Tinos`, `Rubik`, `TaameyAshkenaz`

```css
/* ✅ גופנים מובנים — עובד ללא ארוז */
body { font-family: 'FrankRuhlCLM', 'David', serif; }

/* ⚠️ גופן מערכת שבחר המשתמש — ייפול ל-fallback */
body { font-family: var(--font-main), 'David', serif; }
```

### גישה לרשת — תהליך מלא

אם התוסף שלכם צריך לגשת ל-URL חיצוני:

1. **הצהירו ב-manifest.json:**
```json
{
  "permissions": ["network.access"],
  "network": {
    "allowlist": ["https://api.example.com/v1/specific-endpoint"]
  }
}
```

2. **פתחו Pull Request** לאוצריא בקובץ `lib/plugins/models/plugin_network_allowlist.dart` עם ה-URL המדויק.

3. **כתבו בה-PR:**
   - URL מלא ומדויק (לא דומיין גנרי)
   - שם התוסף ו-id
   - הסבר מה נשלח/מתקבל
   - קישור למאגר התוסף

```javascript
// ✅ שימוש בגישת רשת אחרי אישור
const res = await fetch('https://api.example.com/v1/specific-endpoint');
const data = await res.json();
```

> ⚠️ URL שלא אושר יחזיר `403 Forbidden` — גם אם הרשאת `network.access` קיימת ב-manifest.

---

## 13. אייקונים — FluentUI System Icons

### כיצד להשתמש

כל האייקונים בתוספים חייבים להיות מספריית **FluentUI System Icons** — אותה ספריה שאוצריא עצמה משתמשת.

שם האייקון בפורמט: `<name>_24_regular` או `<name>_24_filled`

### אייקון בשורת הטאבים (manifest)

```json
"contributes": {
  "toolTab": {
    "iconName": "calendar_24_regular"
  }
}
```

### אייקון בתפריט הקשר (קוד)

```javascript
await Otzaria.call('reader.addContextMenuItem', {
  id: 'my-item',
  label: 'שמור',
  icon: 'bookmark_24_regular'
});
```

### אייקונים בממשק התוסף — SVG inline

לאייקונים בתוך ה-HTML של התוסף עצמו, השתמשו ב-SVG inline. כך הם מקבלים את הצבע מה-CSS:

```html
<!-- אייקון גדרות (הגדרות) -->
<button class="settings-btn" aria-label="הגדרות">
  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
    <!-- path של האייקון -->
  </svg>
</button>
```

עם `fill="currentColor"` האייקון מקבל את `color` של ה-CSS — לא צריך לציין צבע ספציפי.

### דוגמאות שמות אייקונים נפוצים

| שם | שימוש |
|----|-------|
| `calendar_24_regular` | לוח שנה |
| `book_24_regular` | ספרים |
| `search_24_regular` | חיפוש |
| `bookmark_24_regular` | סימניה |
| `star_24_regular` | מועדפים |
| `star_24_filled` | מועדפים מלא |
| `settings_24_regular` | הגדרות |
| `note_24_regular` | הערה |
| `history_24_regular` | היסטוריה |
| `puzzle_piece_24_regular` | תוסף |
| `info_24_regular` | מידע / אודות |
| `checkmark_24_regular` | סימן V |
| `dismiss_24_regular` | סגירה / X |

> **חיפוש אייקונים:** [https://github.com/microsoft/fluentui-system-icons](https://github.com/microsoft/fluentui-system-icons)

---

## 14. הגדרות (Settings Panel)

פאנל ההגדרות צריך להיפתח מהצד השמאל, בדיוק כמו בתמונה המצורפת.

### עיצוב מלא

```html
<!-- Scrim -->
<div class="overlay-scrim" id="scrim"></div>

<!-- פאנל -->
<aside class="overlay-panel" id="settingsPanel">
  <div class="settings-header">
    <h2>הגדרות</h2>
    <button class="close-btn" id="closeSettings" aria-label="סגור">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
        <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2"/>
      </svg>
    </button>
  </div>

  <!-- קטגוריית הגדרות -->
  <section class="settings-section">
    <h3 class="settings-section-title">תצוגה</h3>

    <label class="settings-row">
      <span class="settings-label">הצג תאריכים</span>
      <input type="checkbox" id="showDates" />
    </label>

    <label class="settings-row">
      <span class="settings-label">מספר פריטים</span>
      <select id="itemCount" class="input">
        <option value="10">10</option>
        <option value="25">25</option>
        <option value="50">50</option>
      </select>
    </label>
  </section>

  <!-- אודות -->
  <section class="settings-section">
    <h3 class="settings-section-title">אודות</h3>
    <p class="settings-about">גרסה: 1.0.0</p>
    <p class="settings-about">פותח על ידי: שמכם</p>
  </section>
</aside>
```

```css
.settings-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}
.settings-header h2 {
  font-size: 1.1em;
  font-weight: 700;
  color: var(--color-primary);
}
.close-btn {
  background: none; border: none; cursor: pointer;
  color: var(--color-on-surface); padding: 4px;
  border-radius: var(--radius-sm);
  transition: background 0.15s;
}
.close-btn:hover { background: var(--color-secondary-subtle); }

.settings-section { margin-bottom: 24px; }
.settings-section-title {
  font-size: 0.78em;
  font-weight: 700;
  color: var(--color-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 12px;
}
.settings-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
  border-bottom: 1px solid var(--color-outline);
  gap: 12px;
}
.settings-label { font-size: 0.95em; color: var(--color-on-surface); }
.settings-about { font-size: 0.85em; color: var(--color-on-surface); opacity: 0.7; margin-bottom: 4px; }
```

```javascript
// שמירת הגדרות אוטומטית
document.getElementById('showDates').addEventListener('change', async (e) => {
  const settings = await loadSettings();
  settings.showDates = e.target.checked;
  await Otzaria.call('storage.set', { key: 'settings', value: settings });
});

async function loadSettings() {
  const { data } = await Otzaria.call('storage.get', { key: 'settings' });
  return data ?? { showDates: true, itemCount: 25 };
}

// טעינת הגדרות בעת אתחול
Otzaria.on('plugin.boot', async () => {
  const settings = await loadSettings();
  document.getElementById('showDates').checked = settings.showDates;
  document.getElementById('itemCount').value    = String(settings.itemCount);
});
```

---

## 15. פרסום בחנות התוספים

### בדיקות לפני העלאה

- [ ] כל שדות `manifest.json` קיימים (id, name, version, description, author, type, category, stability, minAppVersion, entrypoint)
- [ ] כל הרשאות ב-manifest משמשות בפועל בקוד
- [ ] אין הרשאות שאינן קיימות (ראה רשימה בפרט 3)
- [ ] גלילה מוגדרת (`overflow-y: auto` על html/body)
- [ ] ה-HTML מתחיל עם `<html lang="he" dir="rtl">`
- [ ] `applyTheme` מחובר ל-`plugin.boot` ו-`theme.changed`
- [ ] אין צבעים קשיחים בקוד (ללא `#hex`, `rgb(...)`, `white`, `black`)
- [ ] שם מפתח אינו בכותרת (רק בחלון אודות)
- [ ] כפתור הגדרות בצד שמאל פותח overlay משמאל
- [ ] כל ספריות חיצוניות ארוזות לוקלית (לא CDN)
- [ ] אין שימוש ב-`innerHTML` עם ערכים לא-esc'ים
- [ ] אין שימוש ב-`toISOString()` לתאריכים מקומיים

### אריזה

```bash
# שיטה א — דרך אוצריא עצמה (מומלץ)
otzaria pack-plugin                                          # מהתיקייה הנוכחית
otzaria pack-plugin C:\my-plugin                            # עם נתיב
otzaria pack-plugin C:\my-plugin --output C:\my.otzplugin  # עם פלט מותאם
otzaria pack-plugin --force                                 # דריסה

# שיטה ב — דרך Dart (דורש קוד מקור אוצריא)
dart tool/plugins/package_plugin.dart path/to/plugin
```

הפלט: קובץ `{id}-{version}.otzplugin` (ארכיון ZIP).

הכלי יבדוק אוטומטית:
- מבנה manifest תקין
- הרשאות חוקיות
- קובץ entrypoint קיים
- שימוש ב-API לא מוכר (אזהרה, לא חסימה)
- תאימות עיצוב (אזהרה, לא חסימה)

### העלאה לחנות

- **חנות:** [https://otzaria.org/plugins](https://otzaria.org/plugins)
- **העלאה:** [https://otzaria.org/plugins/upload](https://otzaria.org/plugins/upload)

בנוסף לחנות, **פרסמו גם בפורום** בשרשורים:
- "תוספים לאוצריא — פרסום" (הכרזה)
- "תוספים לאוצריא — דיונים" (לקבלת משוב)

---

## 16. שגיאות נפוצות — מה לא לעשות

### שגיאות manifest

```json
// ❌ שדות חסרים
{
  "id": "myplugin",
  "name": "התוסף שלי"
}

// ✅ נכון — כל השדות
{
  "id": "com.myname.myplugin",
  "name": "התוסף שלי",
  "version": "1.0.0",
  "description": "תיאור",
  "author": "שמי",
  "type": "webapp",
  "category": "Utilities",
  "stability": "beta",
  "minAppVersion": "0.9.91",
  "entrypoint": "index.html"
}
```

### שגיאות הרשאות

```json
// ❌ הרשאות לא קיימות
"permissions": [
  "reader.context_menu",   // ❌ הנכון: "reader.context_menu"
  "app.info.read",         // אם רוצים getUserEmail: "app.user_email.read"
  "calendar.read",         // ❌ לא קיים — הנכון: "calendar.read" (כן קיים למעשה)
  "settings.read"          // בסדר — אבל רק אם קוראים ל-settings.get!
]
```

```json
// ❌ הרשאות מיותרות שאין להן קריאת API
"permissions": [
  "notifications.system",    // אם לא קוראים ל-scheduleSystem/sendSystem
  "network.access",          // אם אין fetch לאתר חיצוני
  "history.write"            // אם רק קוראים ולא מוחקים
]
```

### שגיאות עיצוב

```css
/* ❌ צבעים קשיחים */
color: #6750A4;
background: white;
border: 1px solid gray;
border-radius: 10px;
font-size: 18px;

/* ✅ נכון */
color: var(--color-primary);
background: var(--color-surface);
border: 1px solid var(--color-outline);
border-radius: var(--radius-md);
font-size: 1em;
```

### שגיאות HTML

```html
<!-- ❌ חסר dir ו-lang -->
<html>

<!-- ✅ נכון -->
<html lang="he" dir="rtl">
```

```css
/* ❌ חוסם גלילה */
html, body { overflow: hidden; }

/* ✅ מאפשר גלילה */
html, body { height: 100%; overflow-y: auto; overflow-x: hidden; }
```

### שגיאות UX

```html
<!-- ❌ שם מפתח בכותרת -->
<h1>מעקב לימוד — מאת יוסי לוי</h1>

<!-- ✅ שם תוסף בלבד, ממורכז -->
<h1>מעקב לימוד</h1>
```

```css
/* ❌ כפתור הגדרות בצד ימין */
.settings-btn { right: 12px; }

/* ✅ כפתור הגדרות תמיד בצד שמאל */
.settings-btn { left: 12px; }
```

```css
/* ❌ פאנל הגדרות יוצא מימין */
.overlay-panel { right: 10px; transform: translateX(30px); }

/* ✅ פאנל הגדרות יוצא משמאל */
.overlay-panel { left: 10px; transform: translateX(-30px); }
```

### שגיאות Timezone

```javascript
// ❌ תאריך UTC — שגוי לתצוגה מקומית
const today = new Date().toISOString().slice(0, 10);

// ✅ תאריך מקומי
const today = localDateStr(); // השתמשו בפונקציה מפרט 11
```

### שגיאות XSS

```javascript
// ❌ XSS!
element.innerHTML = `<div>${userInput}</div>`;
element.innerHTML = `<div>${apiData.name}</div>`;
element.innerHTML = `<div>${storageData}</div>`;

// ✅ בטוח
element.innerHTML = `<div>${esc(userInput)}</div>`;
element.textContent = userInput; // הכי בטוח
```

### שגיאות CDN

```html
<!-- ❌ ייכשל — אין גישה לרשת -->
<script src="https://cdnjs.cloudflare.com/ajax/libs/lodash.js/4.17.21/lodash.min.js"></script>

<!-- ✅ הורידו לתיקיית assets -->
<script src="assets/libs/lodash.min.js"></script>
```

---

*מסמך זה עודכן לאחרונה: יוני 2026. בכל שאלה על API נוסף — פנו למאגר אוצריא בגיטהאב.*