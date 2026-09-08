/** טיפוסים משותפים לכלי הסריקה. */

/** כותרת (Heading) בודדת שנמצאה במסמך Word. */
export interface WordHeadingRecord {
  index: number; // סדר יציב 0-based בתוך המסמך
  text: string;
  bookmark: string;
}

/** כותרת (Outline entry) בודדת מתוך PDF, לאחר יצירת מסמך-מלווה. */
export interface PdfCompanionHeadingRecord {
  index: number; // סדר 0-based בתוך המסמך-המלווה (docx)
  text: string;
  page: number; // 1-based
}

export interface WordBookEntry {
  title: string;
  kind: 'word';
  sourcePath: string;
  headings: WordHeadingRecord[];
}

export interface PdfCompanionBookEntry {
  title: string;
  kind: 'pdf-companion';
  sourcePath: string; // הנתיב לקובץ ה-docx המלווה שנוצר
  pdfPath: string; // הנתיב לקובץ ה-PDF המקורי
  headings: PdfCompanionHeadingRecord[];
}

export type LibraryBookEntry = WordBookEntry | PdfCompanionBookEntry;

export interface PersonalLibraryIndex {
  version: 1;
  generatedAt: string; // ISO8601
  books: LibraryBookEntry[];
}

/** ערך יחיד בפורמט links.json הילידי של אוצריא (RawBookLink, 5 מפתחות). */
export interface RawBookLinkEntry {
  heRef_2: string;
  line_index_1: number;
  path_2: string;
  line_index_2: number;
  'Conection Type': string;
  start?: number;
  end?: number;
}
