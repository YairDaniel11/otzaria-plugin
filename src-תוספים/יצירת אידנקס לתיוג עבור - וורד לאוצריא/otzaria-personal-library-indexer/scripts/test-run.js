// מדמה סשן אינטראקטיבי אמיתי: מזין תשובות רק לאחר שמופיע הפרומפט המתאים,
// ולא סוגר את ה-stdin עד סוף התהליך - כדי לבדוק את הכלי כמו שהמשתמש באמת יריץ אותו.
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const child = spawn('node', [path.join(__dirname, '..', 'dist', 'index.js'), 'fixtures'], {
  cwd: path.join(__dirname, '..'),
  stdio: ['pipe', 'pipe', 'pipe'],
});

let buffer = '';
let answeredMixed = false;
let answeredNone = false;

child.stdout.on('data', (data) => {
  const text = data.toString('utf8');
  process.stdout.write(text);
  buffer += text;
  if (!answeredMixed && buffer.includes('doc-mixed.docx: נמצאו')) {
    answeredMixed = true;
    setTimeout(() => child.stdin.write('מ\n'), 50);
  }
  if (!answeredNone && buffer.includes('doc-none.docx: נמצאו')) {
    answeredNone = true;
    setTimeout(() => child.stdin.write('ה\n'), 50);
  }
});
child.stderr.on('data', (data) => process.stderr.write(data.toString('utf8')));
child.on('close', (code) => {
  console.log('CHILD EXIT CODE:', code);
  verifyDefaultOutputLocations();
});

/**
 * מוודא שברירת המחדל (בלי --index-path/--companion-subfolder) מרכזת את כל הפלט
 * שהכלי מייצר תחת fixtures/_אינדקס_אישי, ושסכמת מניעת ההתנגשויות בשם הקובץ
 * (קידומת מהנתיב היחסי, עם "_" במקום מפריד-נתיב) פועלת נכון עבור שני קבצי
 * sample.pdf בעלי אותו שם בסיס בתת-תיקיות שונות (שורש fixtures ו-fixtures/subject).
 */
function verifyDefaultOutputLocations() {
  const outDir = path.join(__dirname, '..', 'fixtures', '_אינדקס_אישי');
  const expectations = [
    { label: 'קובץ מיפוי (personal-library-index.json)', file: 'personal-library-index.json' },
    { label: 'מלווה PDF שבשורש (sample.pdf)', file: 'sample - אינדקס.docx' },
    { label: 'links.json למלווה שבשורש', file: 'sample - אינדקס_links.json' },
    {
      label: 'מלווה PDF בתת-תיקייה (subject/sample.pdf) עם קידומת נגד התנגשות',
      file: 'subject_sample - אינדקס.docx',
    },
    {
      label: 'links.json למלווה בתת-תיקייה, עם אותה קידומת',
      file: 'subject_sample - אינדקס_links.json',
    },
  ];

  let allOk = true;
  for (const exp of expectations) {
    const full = path.join(outDir, exp.file);
    const ok = fs.existsSync(full);
    console.log(`[בדיקה] ${exp.label}: ${ok ? 'נמצא' : 'חסר!'} (${full})`);
    if (!ok) allOk = false;
  }

  // ודא שהמסמכים המלווים לא נשארו (או הופיעו מלכתחילה) ליד ה-PDF המקורי -
  // ברירת המחדל צריכה להעביר אותם כולם ל-_אינדקס_אישי בשורש.
  const staleNextToPdf = [
    path.join(__dirname, '..', 'fixtures', 'sample - אינדקס.docx'),
    path.join(__dirname, '..', 'fixtures', 'subject', 'sample - אינדקס.docx'),
  ];
  for (const stale of staleNextToPdf) {
    const existsStale = fs.existsSync(stale);
    console.log(`[בדיקה] לא אמור להיות ליד ה-PDF המקורי: ${existsStale ? 'קיים בטעות!' : 'אכן לא קיים'} (${stale})`);
    if (existsStale) allOk = false;
  }

  console.log(allOk ? '\n=== בדיקת ברירת מחדל: הצליחה ===' : '\n=== בדיקת ברירת מחדל: נכשלה ===');
  if (!allOk) process.exitCode = 1;
}
