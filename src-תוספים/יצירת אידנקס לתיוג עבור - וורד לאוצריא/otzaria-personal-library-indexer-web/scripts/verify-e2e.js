// בדיקת קצה-לקצה אוטומטית: מפעילה את השרת, מדמה דפדפן (fetch + פענוח ידני של
// זרם SSE), מריצה סריקה על תיקיית fixtures, עונה על שאלות "כותרות בלי סימנייה"
// כמו שמשתמש היה לוחץ על כפתורים בדף, ומוודאת שהתוצאה הסופית תואמת ציפיות.
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const PORT = 4599;
const BASE = `http://localhost:${PORT}`;
const FIXTURES = path.join(ROOT, 'fixtures');

function httpJson(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const data = body ? Buffer.from(JSON.stringify(body), 'utf8') : null;
    const req = http.request(
      BASE + urlPath,
      {
        method,
        headers: data
          ? { 'Content-Type': 'application/json', 'Content-Length': data.length }
          : {},
      },
      (res) => {
        let raw = '';
        res.on('data', (c) => (raw += c));
        res.on('end', () => {
          let parsed = null;
          try {
            parsed = raw ? JSON.parse(raw) : null;
          } catch {
            parsed = raw;
          }
          resolve({ status: res.statusCode, body: parsed });
        });
      }
    );
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

/** מתחבר לזרם SSE ומפעיל onEvent(eventName, dataObj) לכל אירוע. מחזיר פונקציית close(). */
function connectSSE(urlPath, onEvent) {
  const req = http.get(BASE + urlPath, (res) => {
    res.on('error', () => {});
    let buffer = '';
    res.setEncoding('utf8');
    res.on('data', (chunk) => {
      buffer += chunk;
      let idx;
      while ((idx = buffer.indexOf('\n\n')) !== -1) {
        const rawEvent = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        if (!rawEvent.trim() || rawEvent.startsWith(':')) continue;
        let eventName = 'message';
        let dataLine = '';
        for (const line of rawEvent.split('\n')) {
          if (line.startsWith('event:')) eventName = line.slice(6).trim();
          else if (line.startsWith('data:')) dataLine += line.slice(5).trim();
        }
        let data = null;
        try {
          data = dataLine ? JSON.parse(dataLine) : null;
        } catch {
          data = dataLine;
        }
        onEvent(eventName, data);
      }
    });
  });
  req.on('error', () => {});
  return () => req.destroy();
}

function waitForServerReady(child) {
  return new Promise((resolve, reject) => {
    let out = '';
    const timeout = setTimeout(() => reject(new Error('timeout waiting for server start')), 15000);
    child.stdout.on('data', (d) => {
      out += d.toString('utf8');
      if (out.includes('שרת סורק הספרייה האישית פועל')) {
        clearTimeout(timeout);
        resolve();
      }
    });
    child.stderr.on('data', (d) => process.stderr.write(d.toString('utf8')));
    child.on('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error('server exited early with code ' + code));
    });
  });
}

async function main() {
  console.log('== מפעיל שרת לבדיקה ==');
  const child = spawn('node', [path.join(ROOT, 'dist', 'server.js')], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), NO_OPEN_BROWSER: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await waitForServerReady(child);
  console.log('שרת פועל על', BASE);

  try {
    console.log('== מתחיל סריקה על', FIXTURES, '==');
    const start = await httpJson('POST', '/api/scan/start', { folder: FIXTURES });
    if (start.status !== 200) throw new Error('scan/start failed: ' + JSON.stringify(start));
    const scanId = start.body.scanId;
    console.log('scanId =', scanId);

    const questionsSeen = [];
    let doneSummary = null;
    let closeSSE = null;

    const donePromise = new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => reject(new Error('timeout waiting for done event')), 30000);
      closeSSE = connectSSE('/api/scan/stream?id=' + scanId, (eventName, data) => {
        if (eventName === 'log') {
          console.log('  [log]', data.message);
        } else if (eventName === 'question') {
          console.log('  [question]', data.fileLabel, data.missingCount, 'id=' + data.id);
          questionsSeen.push(data);
          let choice = 'skip';
          if (data.fileLabel.includes('doc-mixed')) choice = 'source';
          else if (data.fileLabel.includes('doc-none')) choice = 'copy';
          setTimeout(() => {
            httpJson('POST', '/api/scan/answer', { scanId, questionId: data.id, choice }).then((r) => {
              console.log('  -> ענה', choice, 'עבור', data.fileLabel, 'status=', r.status);
            });
          }, 30);
        } else if (eventName === 'fatal-error') {
          clearTimeout(timeoutId);
          reject(new Error('fatal-error: ' + data.message));
        } else if (eventName === 'done') {
          clearTimeout(timeoutId);
          doneSummary = data;
          resolve(data);
        }
      });
    });

    const summary = await donePromise;
    if (closeSSE) closeSSE();

    console.log('\n== סיכום שהתקבל ==');
    console.log(JSON.stringify(summary, null, 2));

    // --- אימותים ---
    const asserts = [];
    const assert = (cond, msg) => asserts.push({ cond: !!cond, msg });

    assert(questionsSeen.length === 2, 'צריכות להיות בדיוק 2 שאלות (doc-mixed, doc-none), התקבלו ' + questionsSeen.length);
    assert(
      new Set(questionsSeen.map((q) => q.id)).size === questionsSeen.length,
      'לכל שאלה מזהה ייחודי משלה (אין דליפה בין שאלות)'
    );

    const bySourceBase = (p) => path.basename(p).toLowerCase();
    const mixedBook = summary.updatedBooks.find((b) => bySourceBase(b.sourcePath).startsWith('doc-mixed'));
    assert(!!mixedBook, 'doc-mixed.docx (בחירה: מקור) מופיע ברשימת הספרים שעודכנו');
    assert(mixedBook && mixedBook.sourcePath.toLowerCase().includes('doc-mixed.docx'), 'doc-mixed נכתב למקור (לא לעותק)');
    // doc-mixed: 3 כותרות בסה"כ (1 עם סימנייה קיימת + 2 בלי, שהשאלה דיווחה עליהן כ-missingCount=2)
    assert(mixedBook && mixedBook.headingCount === 3, 'ל-doc-mixed יש 3 כותרות בסה"כ (headingCount=' + (mixedBook && mixedBook.headingCount) + ')');

    const noneBook = summary.updatedBooks.find((b) => bySourceBase(b.sourcePath).includes('doc-none'));
    assert(!!noneBook, 'doc-none.docx (בחירה: העתק) מופיע ברשימת הספרים שעודכנו');
    assert(noneBook && noneBook.sourcePath.includes('עם סימניות'), 'doc-none נכתב כעותק חדש עם "עם סימניות" בשם');

    const fullBook = summary.updatedBooks.find((b) => bySourceBase(b.sourcePath).startsWith('doc-full'));
    assert(!!fullBook, 'doc-full.docx (כבר עם סימניות, אין שאלה) מופיע ברשימת הספרים');

    const pdfCompanions = summary.updatedBooks.filter((b) => b.kind === 'pdf-companion');
    assert(pdfCompanions.length === 2, 'נוצרו 2 מסמכים-מלווים (sample.pdf בשורש + sub/sample.pdf), התקבלו ' + pdfCompanions.length);
    for (const c of pdfCompanions) {
      assert(c.headingCount === 4, 'למסמך המלווה ' + c.sourcePath + ' 4 כותרות (outline שטוח), התקבל ' + c.headingCount);
    }

    // --- בדיקות תיקיית הפלט הייעודית בשורש (_אינדקס_אישי) ---
    const outDir = path.join(FIXTURES, '_אינדקס_אישי');
    assert(fs.existsSync(outDir) && fs.statSync(outDir).isDirectory(), 'תיקיית הפלט _אינדקס_אישי נוצרה בשורש התיקייה שנסרקה');

    // קובץ המיפוי עצמו חייב לשבת *בתוך* תיקיית הפלט, לא ישירות בשורש
    const expectedIndexPath = path.join(outDir, 'personal-library-index.json');
    assert(summary.indexPath === expectedIndexPath, 'indexPath מצביע לתוך תיקיית הפלט: ' + summary.indexPath + ' (צפוי ' + expectedIndexPath + ')');
    assert(!fs.existsSync(path.join(FIXTURES, 'personal-library-index.json')), 'קובץ המיפוי לא נכתב ישירות לשורש התיקייה שנסרקה');

    // בדיקה שקובץ המיפוי אכן נכתב לדיסק ותואם את מה שהתקבל ב-summary
    assert(fs.existsSync(summary.indexPath), 'קובץ personal-library-index.json נכתב לדיסק בפועל');
    const onDisk = JSON.parse(fs.readFileSync(summary.indexPath, 'utf8'));
    assert(onDisk.books.length === summary.totalBooksInIndex, 'מספר הספרים בקובץ שעל הדיסק תואם ל-totalBooksInIndex');

    // כל המסמכים-המלווים וקובצי הקישורים חייבים לשבת שטוח בתוך outDir (לא ליד ה-PDF המקורי)
    for (const c of pdfCompanions) {
      assert(
        path.dirname(c.sourcePath) === outDir,
        'המסמך המלווה ' + c.sourcePath + ' יושב בתוך תיקיית הפלט השטוחה ' + outDir
      );
      const linksPath = path.join(outDir, path.basename(c.sourcePath, '.docx') + '_links.json');
      assert(fs.existsSync(linksPath), 'קובץ ה-links.json הצמוד ל-' + c.sourcePath + ' נוצר בפועל: ' + linksPath);
      if (fs.existsSync(linksPath)) {
        const links = JSON.parse(fs.readFileSync(linksPath, 'utf8'));
        assert(links.length === 4, 'קובץ links.json של ' + c.sourcePath + ' מכיל 4 רשומות, התקבלו ' + links.length);
      }
    }

    // בדיקת סכימת מניעת-ההתנגשות בשמות: sample.pdf שבשורש -> "sample - אינדקס.docx" (בלי קידומת),
    // sub/sample.pdf -> "sub_sample - אינדקס.docx" (עם קידומת נתיב-התיקייה היחסי)
    const rootCompanion = pdfCompanions.find((c) => c.pdfPath === path.join(FIXTURES, 'sample.pdf'));
    const subCompanion = pdfCompanions.find((c) => c.pdfPath === path.join(FIXTURES, 'sub', 'sample.pdf'));
    assert(!!rootCompanion, 'נמצא מסמך-מלווה עבור sample.pdf שבשורש');
    assert(!!subCompanion, 'נמצא מסמך-מלווה עבור sub/sample.pdf');
    assert(
      rootCompanion && path.basename(rootCompanion.sourcePath) === 'sample - אינדקס.docx',
      'לקובץ שבשורש אין קידומת: ' + (rootCompanion && path.basename(rootCompanion.sourcePath))
    );
    assert(
      subCompanion && path.basename(subCompanion.sourcePath) === 'sub_sample - אינדקס.docx',
      'לקובץ שבתת-תיקייה יש קידומת "sub_" למניעת התנגשות שם: ' + (subCompanion && path.basename(subCompanion.sourcePath))
    );
    assert(
      rootCompanion && subCompanion && rootCompanion.sourcePath !== subCompanion.sourcePath,
      'שני המסמכים-המלווים קיבלו נתיבים שונים (אין התנגשות שמות)'
    );

    console.log('\n== תוצאות בדיקות ==');
    let failed = 0;
    for (const a of asserts) {
      console.log((a.cond ? 'OK   ' : 'FAIL ') + a.msg);
      if (!a.cond) failed++;
    }

    if (failed > 0) {
      console.error(`\n${failed} בדיקות נכשלו.`);
      process.exitCode = 1;
    } else {
      console.log('\nכל הבדיקות עברו בהצלחה.');
    }
  } finally {
    child.kill();
  }
}

main().catch((err) => {
  console.error('שגיאה בבדיקת הקצה-לקצה:', err);
  process.exitCode = 1;
});
