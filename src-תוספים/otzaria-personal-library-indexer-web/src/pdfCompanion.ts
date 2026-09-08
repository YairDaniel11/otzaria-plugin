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
 * בונה קידומת ייחודית מנתיב-התיקייה היחסי של הקובץ המקורי (יחסית לשורש שנסרק),
 * כדי למנוע התנגשות שמות כששני קבצים מתיקיות-מקור שונות מגיעים לאותה תיקיית פלט
 * שטוחה בשורש. למשל: שורש "books", קובץ "books/subject/sample.pdf" -> קידומת
 * "subject_". קובץ ישירות בשורש (בלי תיקיית-אב יחסית) לא מקבל קידומת כלל.
 */
function relativeDirPrefix(scanRoot: string, fileAbsPath: string): string {
  const relDir = path.relative(scanRoot, path.dirname(fileAbsPath));
  if (!relDir || relDir === '.') return '';
  return relDir.split(path.sep).filter(Boolean).join('_') + '_';
}

/**
 * יוצר מסמך Word מלווה עבור PDF, עם כותרת אחת לכל ערך ב-outline (בעומק המתאים),
 * וגם קובץ links.json (בפורמט הילידי של אוצריא) שממפה כל כותרת לעמוד ב-PDF המקורי.
 * כל הפלט הנוצר נשמר בתיקיית-פלט אחת ושטוחה בשורש התיקייה שנסרקה
 * (scanRoot/companionSubfolder), ולא ליד קובץ ה-PDF המקורי - כדי לא ללכלך את
 * תיקיות הספרים האמיתיות. מכיוון שכמה תיקיות-מקור עשויות כעת לחלוק תיקיית פלט
 * אחת, שם הקובץ מקבל קידומת של הנתיב היחסי כדי למנוע התנגשות שמות.
 */
export async function generatePdfCompanion(
  pdfAbsPath: string,
  outline: FlatOutlineEntry[],
  scanRoot: string,
  companionSubfolder: string
): Promise<CompanionGenerationResult> {
  const pdfBase = path.basename(pdfAbsPath, path.extname(pdfAbsPath));
  const outDir = path.join(scanRoot, companionSubfolder);
  fs.mkdirSync(outDir, { recursive: true });

  const prefix = relativeDirPrefix(scanRoot, pdfAbsPath);
  const companionTitle = `${prefix}${pdfBase} - אינדקס`;
  const companionDocxPath = path.join(outDir, `${companionTitle}.docx`);
  const linksJsonPath = path.join(outDir, `${companionTitle}_links.json`);

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
