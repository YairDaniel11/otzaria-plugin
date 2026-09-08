import * as fs from 'fs';
import * as path from 'path';
import JSZip from 'jszip';
import { analyzeAndInsertBookmarks } from './docxHeadings';
import { WordHeadingRecord } from './types';

export type MissingBookmarksChoice = 'source' | 'copy' | 'skip';

/** קורא-callback שמחליף את שאלת ה-readline המקורית: מקבל את שם הקובץ ומספר
 *  הכותרות החסרות, ומחזיר הבטחה (Promise) שתתמלא כאשר המשתמש בממשק (כאן:
 *  חלון ה-Electron) בחר תשובה. הצד הקורא (main process) אחראי לפתור אותה. */
export type ResolveBookmarksChoice = (
  fileLabel: string,
  missingCount: number,
  absPath: string
) => Promise<MissingBookmarksChoice>;

export interface WordProcessLogger {
  (message: string): void;
}

export interface ProcessWordResult {
  /** הנתיב שאליו נכתב בפועל (מקור או עותק) — או null אם דילגנו על הקובץ. */
  writtenPath: string | null;
  headings: WordHeadingRecord[];
}

/**
 * מעבד קובץ Word מבוסס zip (docx/docm/dotx/dotm): מזהה כותרות וסימניות,
 * ואם חסרות סימניות קורא ל-resolveChoice (שמופעל דרך IPC בממשק הגרפי) כדי
 * לקבל את החלטת המשתמש - מקור/עותק/דילוג.
 */
export async function processWordFile(
  absPath: string,
  resolveChoice: ResolveBookmarksChoice,
  log: WordProcessLogger = () => {}
): Promise<ProcessWordResult> {
  const buf = fs.readFileSync(absPath);
  const zip = await JSZip.loadAsync(buf);

  const docXmlFile = zip.file('word/document.xml');
  if (!docXmlFile) {
    log(`אזהרה: לא נמצא word/document.xml ב-${absPath}, מדלג.`);
    return { writtenPath: null, headings: [] };
  }
  const documentXml = await docXmlFile.async('string');
  const stylesXmlFile = zip.file('word/styles.xml');
  const stylesXml = stylesXmlFile ? await stylesXmlFile.async('string') : null;

  const result = analyzeAndInsertBookmarks(documentXml, stylesXml);

  if (result.headings.length === 0) {
    log(`${path.basename(absPath)}: לא נמצאו כותרות (Heading1-6).`);
    return { writtenPath: null, headings: [] };
  }

  if (result.missingCount === 0) {
    log(`${path.basename(absPath)}: נמצאו ${result.headings.length} כותרות, לכולן יש כבר סימנייה.`);
    return { writtenPath: absPath, headings: result.headings };
  }

  const choice = await resolveChoice(path.basename(absPath), result.missingCount, absPath);

  if (choice === 'skip') {
    log(`${path.basename(absPath)}: דילוג לפי בחירת המשתמש.`);
    return { writtenPath: null, headings: [] };
  }

  zip.file('word/document.xml', result.documentXml);
  const outBuf = await zip.generateAsync({ type: 'nodebuffer' });

  let targetPath = absPath;
  if (choice === 'copy') {
    const ext = path.extname(absPath);
    const base = absPath.slice(0, -ext.length);
    targetPath = `${base} - עם סימניות${ext}`;
  }
  fs.writeFileSync(targetPath, outBuf);
  log(
    `${path.basename(absPath)}: נכתבו ${result.missingCount} סימניות חדשות ל-${path.basename(targetPath)}.`
  );

  return { writtenPath: targetPath, headings: result.headings };
}
