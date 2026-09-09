import * as fs from 'fs';
import * as path from 'path';
import JSZip from 'jszip';
import { analyzeAndInsertBookmarks } from './docxHeadings';
import { WordHeadingRecord } from './types';

export type MissingBookmarksChoice = 'source' | 'copy' | 'skip';

/**
 * קורא-החלטה: מקבל שם קובץ ומספר כותרות חסרות-סימנייה, ומחזיר הבטחה
 * שתתממש עם ההחלטה (מקור/עותק/דילוג). בגרסת ה-CLI המקורית זה היה שאלת
 * readline; כאן זה נמסר מבחוץ (מהשרת) כדי לאפשר שאלה דרך הדפדפן ולחכות
 * לתשובה אסינכרונית ללא תלות בקלט תקני.
 */
export type MissingBookmarksDecider = (
  fileLabel: string,
  missingCount: number
) => Promise<MissingBookmarksChoice>;

export interface ProcessWordResult {
  /** הנתיב שאליו נכתב בפועל (מקור או עותק) — או null אם דילגנו על הקובץ. */
  writtenPath: string | null;
  headings: WordHeadingRecord[];
  /** הודעות יומן (log) שנוצרו תוך כדי העיבוד, לצורך העברה לצד הלקוח. */
  logs: string[];
}

/**
 * מעבד קובץ Word מבוסס zip (docx/docm/dotx/dotm): מזהה כותרות וסימניות,
 * ואם חסרות סימניות קורא ל-decideMissingBookmarks כדי לשאול מה לעשות
 * (מקור/עותק/דילוג) - קריאה זו עשויה להיות אסינכרונית וממתינה לתשובת משתמש.
 */
export async function processWordFile(
  absPath: string,
  decideMissingBookmarks: MissingBookmarksDecider
): Promise<ProcessWordResult> {
  const logs: string[] = [];
  const log = (msg: string) => logs.push(msg);

  const buf = fs.readFileSync(absPath);
  const zip = await JSZip.loadAsync(buf);

  const docXmlFile = zip.file('word/document.xml');
  if (!docXmlFile) {
    log(`אזהרה: לא נמצא word/document.xml ב-${absPath}, מדלג.`);
    return { writtenPath: null, headings: [], logs };
  }
  const documentXml = await docXmlFile.async('string');
  const stylesXmlFile = zip.file('word/styles.xml');
  const stylesXml = stylesXmlFile ? await stylesXmlFile.async('string') : null;

  const result = analyzeAndInsertBookmarks(documentXml, stylesXml);

  if (result.headings.length === 0) {
    log(`${path.basename(absPath)}: לא נמצאו כותרות (Heading1-6).`);
    return { writtenPath: null, headings: [], logs };
  }

  if (result.missingCount === 0) {
    log(`${path.basename(absPath)}: נמצאו ${result.headings.length} כותרות, לכולן יש כבר סימנייה.`);
    return { writtenPath: absPath, headings: result.headings, logs };
  }

  const choice = await decideMissingBookmarks(path.basename(absPath), result.missingCount);

  if (choice === 'skip') {
    log(`${path.basename(absPath)}: דילוג לפי בחירת המשתמש.`);
    return { writtenPath: null, headings: [], logs };
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

  return { writtenPath: targetPath, headings: result.headings, logs };
}
