import * as fs from 'fs';
import * as path from 'path';
import { DEFAULT_OUTPUT_SUBFOLDER } from './types';

export const OOXML_WORD_EXT = new Set(['.docx', '.docm', '.dotx', '.dotm']);
export const UNSUPPORTED_WORD_EXT = new Set(['.doc', '.dot', '.rtf', '.odt']);
export const PDF_EXT = new Set(['.pdf']);

export interface ScannedFile {
  absPath: string;
  ext: string;
}

/** סריקה רקורסיבית של תיקייה, מחזירה קבצים עם סיומות רלוונטיות בלבד. */
export function scanFolder(root: string): ScannedFile[] {
  const results: ScannedFile[] = [];
  const relevant = new Set<string>([
    ...OOXML_WORD_EXT,
    ...UNSUPPORTED_WORD_EXT,
    ...PDF_EXT,
  ]);

  function walk(dir: string) {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (err) {
      console.error(`שגיאה בקריאת תיקייה ${dir}: ${(err as Error).message}`);
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        // דילוג על תיקיות מיוחדות שכיחות, וגם על תת-תיקיית הפלט של הכלי עצמו
        // (_אינדקס_אישי) - כדי לא לסרוק מחדש את המסמכים-המלווים שהכלי כתב שם.
        if (
          entry.name === 'node_modules' ||
          entry.name === '.git' ||
          entry.name === DEFAULT_OUTPUT_SUBFOLDER
        )
          continue;
        walk(full);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (relevant.has(ext)) {
          results.push({ absPath: path.resolve(full), ext });
        }
      }
    }
  }

  walk(root);
  return results;
}
