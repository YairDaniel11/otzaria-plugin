import * as fs from 'fs';
import * as path from 'path';
import { Document, Packer, Paragraph, HeadingLevel, TextRun } from 'docx';
import { FlatOutlineEntry } from './pdfOutline';
import { PdfCompanionHeadingRecord, RawBookLinkEntry } from './types';

const HEADING_LEVELS = [
  HeadingLevel.HEADING_1,
  HeadingLevel.HEADING_2,
  HeadingLevel.HEADING_3,
  HeadingLevel.HEADING_4,
  HeadingLevel.HEADING_5,
  HeadingLevel.HEADING_6,
];

function headingLevelForDepth(depth: number) {
  const idx = Math.min(depth, HEADING_LEVELS.length - 1);
  return HEADING_LEVELS[idx];
}

export interface CompanionGenerationResult {
  companionDocxPath: string;
  companionTitle: string; // שם הקובץ בלי סיומת
  linksJsonPath: string;
  headings: PdfCompanionHeadingRecord[];
}

/**
 * יוצר מסמך Word מלווה עבור PDF, עם כותרת אחת לכל ערך ב-outline (בעומק המתאים),
 * וגם קובץ links.json (בפורמט הילידי של אוצריא) שממפה כל כותרת לעמוד ב-PDF המקורי.
 *
 * כל התוצרים (docx + links.json) נכתבים תמיד לתוך תיקיית פלט אחת ויחידה
 * שנוצרת בשורש התיקייה שנסרקה (scannedRootAbs) - `<scannedRoot>/<companionSubfolder>` -
 * ולא לתוך כל תת-תיקייה שבה נמצא ה-PDF המקורי. מכיוון שכמה PDF מתת-תיקיות
 * שונות עשויים לחלוק אותו שם בסיס (למשל שני קבצים בשם "sample.pdf"
 * בתת-תיקיות שונות), שם קובץ המלווה מקבל קידומת של הנתיב היחסי של ה-PDF
 * ביחס לשורש הסריקה (עם "_" במקום מפרידי תיקיות) - וזאת רק כאשר ה-PDF לא
 * נמצא ישירות בשורש הנסרק (שם אין צורך בקידומת כלל).
 */
export async function generatePdfCompanion(
  pdfAbsPath: string,
  outline: FlatOutlineEntry[],
  scannedRootAbs: string,
  companionSubfolder: string
): Promise<CompanionGenerationResult> {
  const pdfDir = path.dirname(pdfAbsPath);
  const pdfBase = path.basename(pdfAbsPath, path.extname(pdfAbsPath));
  const outDir = path.join(scannedRootAbs, companionSubfolder);
  fs.mkdirSync(outDir, { recursive: true });

  const relDir = path.relative(scannedRootAbs, pdfDir);
  const collisionPrefix =
    relDir && !relDir.startsWith('..')
      ? relDir.split(path.sep).filter(Boolean).join('_') + '_'
      : '';

  const companionTitle = `${pdfBase} - אינדקס`;
  const companionBaseName = `${collisionPrefix}${companionTitle}`;
  const companionDocxPath = path.join(outDir, `${companionBaseName}.docx`);
  const linksJsonPath = path.join(outDir, `${companionBaseName}_links.json`);

  const paragraphs = outline.map(
    (entry) =>
      new Paragraph({
        heading: headingLevelForDepth(entry.depth),
        children: [new TextRun(entry.title)],
      })
  );

  const doc = new Document({ sections: [{ children: paragraphs }] });
  const buf = await Packer.toBuffer(doc);
  fs.writeFileSync(companionDocxPath, buf);

  const headings: PdfCompanionHeadingRecord[] = outline.map((entry, index) => ({
    index,
    text: entry.title,
    page: entry.page,
  }));

  // קובץ links.json בפורמט RawBookLink (5 המפתחות של אוצריא) - ראו הערת סכמה ב-README:
  // line_index_1/2 הם 1-based לפי מוסכמת הפורמט. line_index_2 כאן הוא ניחוש-סביר:
  // אין ל-PDF "שורות" טקסטואליות, אז אנו משתמשים במספר העמוד (1-based) כערך
  // line_index_2, כדי שכלי היעד (עורך הקישורים בפלאגין) יוכל לפענח אותו למספר עמוד.
  const rawLinks: RawBookLinkEntry[] = headings.map((h) => ({
    heRef_2: h.text,
    line_index_1: h.index + 1, // מיקום הכותרת במסמך המלווה (1-based)
    path_2: pdfAbsPath,
    line_index_2: h.page, // ניחוש: מספר עמוד (1-based) במקום אינדקס שורה
    'Conection Type': 'הפניה',
  }));

  fs.writeFileSync(linksJsonPath, JSON.stringify(rawLinks, null, 2), 'utf8');

  return { companionDocxPath, companionTitle, linksJsonPath, headings };
}
