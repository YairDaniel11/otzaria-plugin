// בדיקה עצמאית (בלי Electron בכלל) של שכבת הליבה: מריצה את runLibraryScan
// ישירות מתוך dist/core/libraryScan.js (אחרי build), עם callbacks מדומים
// שמדמים בדיוק את מה ש-main.ts של Electron היה עושה - כולל מענה שונה לכל
// אחת מכמה בקשות סימניות-חסרות ברצף, כדי להוכיח שהמנגנון "משהה וממשיך"
// לא מתבלבל בין קבצים (בעיה קלאסית של channel/id mismatch).
const path = require('path');
const fs = require('fs');
const { runLibraryScan, DEFAULT_OUTPUT_SUBFOLDER } = require(path.join(__dirname, '..', 'dist', 'core', 'libraryScan'));

const fixturesDir = path.join(__dirname, '..', 'fixtures');
// כל התוצרים (מסמכים-מלווים, links.json, קובץ האינדקס) אמורים לנחות כאן -
// תיקיית פלט אחת ויחידה בשורש התיקייה הנסרקת, ולא מפוזרים בתת-תיקיות המקור.
const outputDir = path.join(fixturesDir, DEFAULT_OUTPUT_SUBFOLDER);
const indexPath = path.join(outputDir, 'personal-library-index.json');

let pass = true;
function check(cond, label) {
  console.log(`${cond ? 'PASS' : 'FAIL'} - ${label}`);
  if (!cond) pass = false;
}

const bookmarkRequestsSeen = [];

async function main() {
  // ניקוי תוצרים משריצה קודמת, כדי שהבדיקה תהיה דטרמיניסטית
  const mixedCopy = path.join(fixturesDir, 'doc-mixed - עם סימניות.docx');
  const noneCopy = path.join(fixturesDir, 'sub', 'doc-none - עם סימניות.docx');
  for (const p of [mixedCopy, noneCopy]) {
    if (fs.existsSync(p)) fs.rmSync(p);
  }
  if (fs.existsSync(outputDir)) fs.rmSync(outputDir, { recursive: true, force: true });

  const events = [];

  const result = await runLibraryScan(
    fixturesDir,
    {},
    {
      onProgress: (evt) => {
        events.push(evt);
      },
      resolveBookmarksChoice: (fileLabel, missingCount, absPath) => {
        bookmarkRequestsSeen.push({ fileLabel, missingCount, absPath });
        // מדמה עיכוב אמיתי (כמו חלון שממתין ללחיצת עכבר) לפני שהתשובה חוזרת,
        // כדי לוודא שה-await בצד הליבה באמת משהה עד לתשובה ולא ממשיך מוקדם מדי.
        return new Promise((resolve) => {
          setTimeout(() => {
            if (fileLabel === 'doc-mixed.docx') {
              resolve('source'); // הוסף למקור
            } else if (fileLabel === 'doc-none.docx') {
              resolve('copy'); // העתק לקובץ חדש
            } else {
              resolve('skip');
            }
          }, 30);
        });
      },
    }
  );

  console.log('\n--- אירועי התקדמות (progress events) ---');
  for (const e of events) console.log(`[${e.type}] ${e.message}`);

  console.log('\n--- בדיקות ---');

  check(bookmarkRequestsSeen.length === 2, `נשלחו בדיוק 2 בקשות החלטה על סימניות (בפועל: ${bookmarkRequestsSeen.length})`);
  // doc-mixed.docx: 3 כותרות (פרק ראשון / תת-פרק עם סימנייה קיימת / פרק שני בלי סימנייה) - 2 מהן בלי סימנייה
  check(
    bookmarkRequestsSeen[0] && bookmarkRequestsSeen[0].fileLabel === 'doc-mixed.docx' && bookmarkRequestsSeen[0].missingCount === 2,
    'הבקשה הראשונה שייכת ל-doc-mixed.docx עם 2 כותרות חסרות'
  );
  // sub/doc-none.docx: 3 כותרות (מבוא / סעיף א / סעיף ב), כולן בלי סימנייה
  check(
    bookmarkRequestsSeen[1] && bookmarkRequestsSeen[1].fileLabel === 'doc-none.docx' && bookmarkRequestsSeen[1].missingCount === 3,
    'הבקשה השנייה שייכת ל-doc-none.docx עם 3 כותרות חסרות'
  );

  // doc-mixed.docx: תשובה "source" -> נערך במקום, לא נוצר עותק
  check(!fs.existsSync(mixedCopy), 'לא נוצר עותק עבור doc-mixed.docx (כי הבחירה הייתה "הוסף למקור")');
  const mixedBook = result.index.books.find((b) => b.sourcePath.toLowerCase() === path.join(fixturesDir, 'doc-mixed.docx').toLowerCase());
  check(!!mixedBook && mixedBook.headings.length === 3, 'doc-mixed.docx נכנס לאינדקס עם 3 כותרות');

  // sub/doc-none.docx: תשובה "copy" -> המקור לא נערך, נוצר קובץ עותק חדש
  check(fs.existsSync(noneCopy), 'נוצר קובץ עותק "sub/doc-none - עם סימניות.docx" (כי הבחירה הייתה "העתק לקובץ חדש")');
  const noneBook = result.index.books.find((b) => b.sourcePath.toLowerCase() === noneCopy.toLowerCase());
  check(!!noneBook && noneBook.headings.length === 3, 'העותק של doc-none נכנס לאינדקס עם 3 כותרות');

  // doc-full.docx: כבר הייתה לו סימנייה - לא אמור להיכנס לרשימת הבקשות בכלל
  check(
    !bookmarkRequestsSeen.some((r) => r.fileLabel === 'doc-full.docx'),
    'doc-full.docx לא יצר בקשת החלטה כלל (לכל הכותרות שלו כבר הייתה סימנייה)'
  );

  // שני קבצי sample.pdf (שורש + sub, אותו שם בסיס): נוצרו שני מסמכים-מלווים +
  // שני קבצי קישורים, ושניהם נחתו בתוך תיקיית הפלט השטוחה בשורש הנסרק - בלי
  // להתנגש בשם, בזכות קידומת הנתיב היחסי לקובץ שאינו בשורש.
  const pdfBooks = result.index.books.filter((b) => b.kind === 'pdf-companion');
  check(pdfBooks.length === 2, `נוצרו בדיוק 2 רשומות pdf-companion (בפועל: ${pdfBooks.length})`);

  const rootCompanion = path.join(outputDir, 'sample - אינדקס.docx');
  const subCompanion = path.join(outputDir, 'sub_sample - אינדקס.docx');
  const rootLinks = path.join(outputDir, 'sample - אינדקס_links.json');
  const subLinks = path.join(outputDir, 'sub_sample - אינדקס_links.json');

  check(
    fs.existsSync(rootCompanion),
    `מסמך-מלווה של sample.pdf שבשורש נשמר בשם הרגיל, ללא קידומת (${rootCompanion})`
  );
  check(
    fs.existsSync(subCompanion),
    `מסמך-מלווה של sub/sample.pdf נשמר עם קידומת "sub_" למניעת התנגשות שם (${subCompanion})`
  );
  check(fs.existsSync(rootLinks), 'קובץ links.json של sample.pdf (שורש) נכתב בפועל לדיסק');
  check(fs.existsSync(subLinks), 'קובץ links.json של sub/sample.pdf נכתב עם קידומת "sub_"');

  for (const pdfBook of pdfBooks) {
    check(
      path.dirname(pdfBook.sourcePath).toLowerCase() === outputDir.toLowerCase(),
      `רשומת ה-pdf-companion (${path.basename(pdfBook.sourcePath)}) מצביעה על קובץ בתוך תיקיית הפלט ${DEFAULT_OUTPUT_SUBFOLDER}, לא ליד קובץ המקור`
    );
    check(
      fs.existsSync(pdfBook.pdfPath),
      `pdfPath של הרשומה (${pdfBook.pdfPath}) עדיין מצביע על קובץ ה-PDF המקורי במקומו האמיתי`
    );
  }

  check(
    fs.existsSync(indexPath) && path.dirname(indexPath).toLowerCase() === outputDir.toLowerCase(),
    `נכתב קובץ personal-library-index.json בתוך תיקיית הפלט ${DEFAULT_OUTPUT_SUBFOLDER} (לא בשורש התיקייה הנסרקת)`
  );
  check(result.summary.errors === 0, `אין שגיאות בסיכום (בפועל: ${result.summary.errors})`);

  console.log(`\nסיכום: wordBooks=${result.summary.wordBooks} pdfCompanionBooks=${result.summary.pdfCompanionBooks} totalHeadings=${result.summary.totalHeadings} skippedUnsupported=${result.summary.skippedUnsupported} skippedNoOutline=${result.summary.skippedNoOutline}`);

  console.log(`\n${pass ? 'כל הבדיקות עברו (PASS)' : 'יש בדיקות שנכשלו (FAIL)'}`);
  process.exit(pass ? 0 : 1);
}

main().catch((err) => {
  console.error('שגיאה כללית בבדיקה:', err);
  process.exit(1);
});
