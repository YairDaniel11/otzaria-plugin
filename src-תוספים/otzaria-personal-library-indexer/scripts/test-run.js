// מדמה סשן אינטראקטיבי אמיתי: מזין תשובות רק לאחר שמופיע הפרומפט המתאים,
// ולא סוגר את ה-stdin עד סוף התהליך - כדי לבדוק את הכלי כמו שהמשתמש באמת יריץ אותו.
const { spawn } = require('child_process');
const path = require('path');

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
});
