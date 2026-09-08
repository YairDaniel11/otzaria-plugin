import * as fs from 'fs';
import * as path from 'path';
import { Document, Packer, Paragraph, HeadingLevel, TextRun } from 'docx';
import { FlatOutlineEntry } from './pdfOutline';
import { PdfCompanionHeadingRecord, RawBookLinkEntry, DEFAULT_OUTPUT_SUBFOLDER } from './types';

/** מפריד שמשמש להחלפת מפרידי-נתיב (\\ או /) כשבונים קידומת שם-קובץ למניעת התנגשויות. */
const COLLISION_PREFIX_SEPARATOR = '_';

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
 * מיקום הפלט:
 * - אם companionSubfolder נמסר במפורש (override דרך --companion-subfolder), ההתנהגות
 *   נשארת כמו שהייתה: תת-תיקייה קבועה יחסית לתיקיית ה-PDF עצמו, בלי קידומת שם.
 * - אחרת (ברירת המחדל), כל המסמכים-המלווים מרוכזים תחת <scannedRoot>/_אינדקס_אישי,
 *   ומכיוון שכמה תת-תיקיות מקור עכשיו חולקות תיקיית פלט שטוחה אחת, שם הקובץ מקבל
 *   קידומת מהנתיב היחסי של ה-PDF (יחסית לשורש הנסרק) כדי למנוע התנגשויות בין קבצים
 *   בעלי אותו שם בסיס בתת-תיקיות שונות - למשל books/subject/sample.pdf יהפוך ל-
 *   "subject_sample - אינדקס.docx", בעוד PDF שיושב ישירות בשורש הנסרק לא מקבל קידומת.
 */
export async function generatePdfCompanion(
  pdfAbsPath: string,
  outline: FlatOutlineEntry[],
  companionSubfolder: string | null,
  scannedRoot: string
): Promise<CompanionGenerationResult> {
  const pdfDir = path.dirname(pdfAbsPath);
  const pdfBase = path.basename(pdfAbsPath, path.extname(pdfAbsPath));

  let outDir: string;
  let namePrefix = '';
  if (companionSubfolder) {
    // override מפורש: התנהגות ישנה, ליד ה-PDF, בלי קידומת (אין התנגשות כי כל PDF כותב לצדו).
    outDir = path.join(pdfDir, companionSubfolder);
  } else {
    // ברירת מחדל: תיקייה שטוחה אחת בשורש הנסרק + קידומת נגד התנגשויות.
    outDir = path.join(scannedRoot, DEFAULT_OUTPUT_SUBFOLDER);
    const relDir = path.relative(scannedRoot, pdfDir);
    if (relDir && relDir !== '.' && !relDir.startsWith('..')) {
      namePrefix =
        relDir.split(path.sep).join(COLLISION_PREFIX_SEPARATOR) + COLLISION_PREFIX_SEPARATOR;
    }
  }
  fs.mkdirSync(outDir, { recursive: true });

  const companionTitle = `${namePrefix}${pdfBase} - אינדקס`;
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
