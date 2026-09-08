import * as readline from 'readline';

export type MissingBookmarksChoice = 'source' | 'copy' | 'skip';

// שימוש בממשק readline יחיד לכל אורך חיי התהליך: יצירת מופע חדש בכל שאלה
// (וסגירתו מיד) עלולה "לבלוע" קלט מוזרם בצנרת (piped stdin) שכבר נקרא
// למאגר הפנימי של המופע הקודם ואבד עם סגירתו - תופעה ידועה ב-Node כשמנסים
// ליצור כמה readline.Interface ברצף על אותו process.stdin.
let sharedRl: readline.Interface | null = null;
function getSharedRl(): readline.Interface {
  if (!sharedRl) {
    sharedRl = readline.createInterface({ input: process.stdin, output: process.stdout });
  }
  return sharedRl;
}

/** נזרקת כשקלט הסטנדרטי נגמר (למשל stdin לא-אינטראקטיבי/piped שהגיע לסופו). */
export class NoMoreInputError extends Error {}

/** שאלה אינטראקטיבית בשורת הפקודה, מחזירה מחרוזת תשובה גולמית (trim). */
function ask(question: string): Promise<string> {
  const rl = getSharedRl();
  if ((rl as unknown as { closed?: boolean }).closed) {
    throw new NoMoreInputError('readline interface is closed (no more input)');
  }
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.trim());
    });
  });
}

/** סוגר את ממשק ה-readline המשותף (לקרוא בסוף ריצת התוכנית). */
export function closeSharedPrompt(): void {
  if (sharedRl) {
    sharedRl.close();
    sharedRl = null;
  }
}

/**
 * שואל את המשתמש מה לעשות כשנמצאו כותרות בלי סימנייה בקובץ Word.
 * חוזר במחזור עד לתשובה תקינה: מ/ה/ד (source/copy/skip).
 */
export async function askMissingBookmarksChoice(
  fileLabel: string,
  missingCount: number
): Promise<MissingBookmarksChoice> {
  const question = `קובץ ${fileLabel}: נמצאו ${missingCount} כותרות בלי סימנייה. הוסף סימניות ל[מ]קור, [ה]עתק לקובץ חדש, או [ד]לג על קובץ זה? `;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    let raw: string;
    try {
      raw = await ask(question);
    } catch (err) {
      if (err instanceof NoMoreInputError) {
        process.stdout.write(
          '\nאין קלט אינטראקטיבי זמין יותר (stdin נגמר) - מדלג על קובץ זה כברירת מחדל בטוחה.\n'
        );
        return 'skip';
      }
      throw err;
    }
    const answer = raw.toLowerCase();
    if (answer === 'מ' || answer === 'm' || answer === 'source') return 'source';
    if (answer === 'ה' || answer === 'h' || answer === 'copy') return 'copy';
    if (answer === 'ד' || answer === 'd' || answer === 'skip') return 'skip';
    process.stdout.write('תשובה לא מובנת. נא להקיש מ / ה / ד.\n');
  }
}
