import * as fs from 'fs';
import * as path from 'path';
import JSZip from 'jszip';
import { analyzeAndInsertBookmarks } from './docxHeadings';
import { askMissingBookmarksChoice } from './prompt';
import { WordHeadingRecord } from './types';

export interface ProcessWordResult {
  /** הנתיב שאליו נכתב בפועל (מקור או עותק) — או null אם דילגנו על הקובץ. */
  writtenPath: string | null;
  headings: WordHeadingRecord[];
}

/**
 * מעבד קובץ Word מבוסס zip (docx/docm/dotx/dotm): מזהה כותרות וסימניות,
 * ואם חסרות סימניות שואל את המשתמש מה לעשות (מקור/עותק/דילוג).
 */
export async function processWordFile(absPath: string): Promise<ProcessWordResult> {
  const buf = fs.readFileSync(absPath);
  const zip = await JSZip.loadAsync(buf);

  const docXmlFile = zip.file('word/document.xml');
  if (!docXmlFile) {
    console.error(`  אזהרה: לא נמצא word/document.xml ב-${absPath}, מדלג.`);
    return { writtenPath: null, headings: [] };
  }
  const documentXml = await docXmlFile.async('string');
  const stylesXmlFile = zip.file('word/styles.xml');
  const stylesXml = stylesXmlFile ? await stylesXmlFile.async('string') : null;

  const result = analyzeAndInsertBookmarks(documentXml, stylesXml);

  if (result.headings.length === 0) {
    console.log(`  ${path.basename(absPath)}: לא נמצאו כותרות (Heading1-6).`);
    return { writtenPath: null, headings: [] };
  }

  if (result.missingCount === 0) {
    console.log(
      `  ${path.basename(absPath)}: נמצאו ${result.headings.length} כותרות, לכולן יש כבר סימנייה.`
    );
    return { writtenPath: absPath, headings: result.headings };
  }

  const choice = await askMissingBookmarksChoice(path.basename(absPath), result.missingCount);

  if (choice === 'skip') {
    console.log(`  ${path.basename(absPath)}: דילוג לפי בחירת המשתמש.`);
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
  console.log(
    `  ${path.basename(absPath)}: נכתבו ${result.missingCount} סימניות חדשות ל-${path.basename(targetPath)}.`
  );

  return { writtenPath: targetPath, headings: result.headings };
}
