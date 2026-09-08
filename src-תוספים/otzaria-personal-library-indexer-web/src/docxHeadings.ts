import { makeBookmarkName } from './slug';
import { WordHeadingRecord } from './types';

interface RawHeadingParagraph {
  pStart: number; // אינדקס תחילת <w:p...>
  pEnd: number; // אינדקס אחרי </w:p> (סוף הבלוק)
  pPrEnd: number | null; // אינדקס אחרי </w:pPr>, אם קיים
  pOpenTagEnd: number; // אינדקס אחרי תג הפתיחה <w:p ...>
  pCloseTagStart: number; // אינדקס תחילת </w:p>
  level: number; // 1-6
  text: string;
  existingBookmark: string | null;
}

/** בונה מפה של styleId -> רמת כותרת (1-6), משילוב ברירות מחדל + styles.xml. */
export function buildHeadingStyleMap(stylesXml: string | null): Map<string, number> {
  const map = new Map<string, number>();
  // ברירות מחדל סטנדרטיות (Word/`docx` npm package)
  for (let i = 1; i <= 6; i++) map.set(`Heading${i}`, i);

  if (stylesXml) {
    const styleRe = /<w:style\b[^>]*w:styleId="([^"]+)"[^>]*>([\s\S]*?)<\/w:style>/g;
    let m: RegExpExecArray | null;
    while ((m = styleRe.exec(stylesXml))) {
      const styleId = m[1];
      const body = m[2];
      const nameMatch = /<w:name\b[^>]*w:val="([^"]+)"/.exec(body);
      if (!nameMatch) continue;
      const nameVal = nameMatch[1].trim().toLowerCase();
      const headingMatch = /^heading\s*([1-6])$/.exec(nameVal);
      if (headingMatch) {
        map.set(styleId, parseInt(headingMatch[1], 10));
      }
    }
  }
  return map;
}

function decodeXmlText(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function extractParagraphText(paragraphBlock: string): string {
  const texts: string[] = [];
  const tRe = /<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g;
  let m: RegExpExecArray | null;
  while ((m = tRe.exec(paragraphBlock))) {
    texts.push(decodeXmlText(m[1]));
  }
  return texts.join('');
}

/** מוצא את המקסימום w:id הקיים בין bookmarkStart/bookmarkEnd, כדי להימנע מהתנגשות. */
export function findMaxBookmarkId(documentXml: string): number {
  let max = 0;
  const re = /<w:bookmark(?:Start|End)\b[^>]*\bw:id="(\d+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(documentXml))) {
    const id = parseInt(m[1], 10);
    if (id > max) max = id;
  }
  return max;
}

/** מאתר את כל פסקאות הכותרת (Heading1-6) במסמך, כולל סימנייה קיימת אם יש. */
function findHeadingParagraphs(
  documentXml: string,
  styleMap: Map<string, number>
): RawHeadingParagraph[] {
  const results: RawHeadingParagraph[] = [];
  // התאמת בלוקי <w:p ...>...</w:p> (פסקאות אינן מקוננות ב-OOXML)
  const pRe = /<w:p\b(?:\s[^>]*)?>([\s\S]*?)<\/w:p>/g;
  let m: RegExpExecArray | null;
  while ((m = pRe.exec(documentXml))) {
    const pStart = m.index;
    const pEnd = pRe.lastIndex;
    const fullBlock = m[0];
    const inner = m[1];

    const pStyleMatch = /<w:pStyle\b[^>]*w:val="([^"]+)"/.exec(inner);
    if (!pStyleMatch) continue;
    const level = styleMap.get(pStyleMatch[1]);
    if (!level) continue; // סגנון פסקה שאינו כותרת ידועה

    const text = extractParagraphText(inner).trim();
    if (!text) continue; // כותרת ריקה - לא רלוונטית

    // מיקום תג הפתיחה של <w:p...>
    const openTagMatch = /^<w:p\b(?:\s[^>]*)?>/.exec(fullBlock);
    const pOpenTagEnd = pStart + (openTagMatch ? openTagMatch[0].length : 0);
    const pCloseTagStart = pEnd - '</w:p>'.length;

    // מיקום סוף <w:pPr>...</w:pPr> אם קיים
    let pPrEnd: number | null = null;
    const pPrMatch = /<w:pPr\b[^>]*>[\s\S]*?<\/w:pPr>|<w:pPr\b[^>]*\/>/.exec(fullBlock);
    if (pPrMatch) {
      pPrEnd = pStart + pPrMatch.index + pPrMatch[0].length;
    }

    // חיפוש bookmarkStart קיים בתוך הפסקה
    const bmMatch = /<w:bookmarkStart\b[^>]*\bw:name="([^"]+)"/.exec(fullBlock);
    const existingBookmark = bmMatch ? bmMatch[1] : null;

    results.push({
      pStart,
      pEnd,
      pPrEnd,
      pOpenTagEnd,
      pCloseTagStart,
      level,
      text,
      existingBookmark,
    });
  }
  return results;
}

export interface DocxHeadingsResult {
  /** ה-XML המעודכן (אם בוצעו הכנסות סימניות; אחרת זהה למקור). */
  documentXml: string;
  /** כל הכותרות, לפי סדר במסמך, כולל bookmark סופי (קיים או חדש). */
  headings: WordHeadingRecord[];
  /** true אם היו כותרות שדרשו הכנסת סימנייה (inserted or not, before user's choice applied). */
  missingCount: number;
}

/**
 * מנתח את document.xml, מזהה כותרות וסימניות קיימות, ומכניס סימניות חדשות
 * לכותרות שחסרות (בהחדרה כירורגית ישירות למחרוזת ה-XML הגולמית, כדי לשמר
 * את שאר המסמך בית-לבית).
 */
export function analyzeAndInsertBookmarks(
  documentXml: string,
  stylesXml: string | null
): DocxHeadingsResult {
  const styleMap = buildHeadingStyleMap(stylesXml);
  const paragraphs = findHeadingParagraphs(documentXml, styleMap);

  let nextId = findMaxBookmarkId(documentXml) + 1;
  const finalHeadings: (WordHeadingRecord & { pStart: number })[] = [];
  let missingCount = 0;

  // נאסוף תחילה את שמות הסימניות הסופיים (קיים או שם חדש שנייצר) לפי הסדר במסמך
  const plan = paragraphs.map((p, idx) => {
    if (p.existingBookmark) {
      return { ...p, index: idx, bookmark: p.existingBookmark, needsInsert: false };
    }
    missingCount++;
    const bookmark = makeBookmarkName(idx, p.text);
    return { ...p, index: idx, bookmark, needsInsert: true };
  });

  // הכנסה בפועל - מהסוף להתחלה כדי לא לפגוע באופסטים של פסקאות קודמות
  let xml = documentXml;
  for (let i = plan.length - 1; i >= 0; i--) {
    const p = plan[i];
    if (!p.needsInsert) continue;
    const id = nextId++;
    const startTag = `<w:bookmarkStart w:name="${p.bookmark}" w:id="${id}"/>`;
    const endTag = `<w:bookmarkEnd w:id="${id}"/>`;
    const insertStartAt = p.pPrEnd !== null ? p.pPrEnd : p.pOpenTagEnd;
    const insertEndAt = p.pCloseTagStart;
    // הכנסת bookmarkEnd קודם (אופסט גבוה יותר), אח"כ bookmarkStart
    xml = xml.slice(0, insertEndAt) + endTag + xml.slice(insertEndAt);
    xml = xml.slice(0, insertStartAt) + startTag + xml.slice(insertStartAt);
  }

  for (const p of plan) {
    finalHeadings.push({ index: p.index, text: p.text, bookmark: p.bookmark, pStart: p.pStart });
  }

  return {
    documentXml: xml,
    headings: finalHeadings.map(({ index, text, bookmark }) => ({ index, text, bookmark })),
    missingCount,
  };
}
