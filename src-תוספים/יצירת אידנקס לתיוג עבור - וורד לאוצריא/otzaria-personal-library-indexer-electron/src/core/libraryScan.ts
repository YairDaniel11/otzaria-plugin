import * as fs from 'fs';
import * as path from 'path';
import { scanFolder, OOXML_WORD_EXT, UNSUPPORTED_WORD_EXT, PDF_EXT } from './scan';
import { processWordFile, ResolveBookmarksChoice } from './wordDocxProcessor';
import { extractPdfOutline } from './pdfOutline';
import { generatePdfCompanion } from './pdfCompanion';
import { loadExistingIndex, mergeBooks, saveIndex } from './indexStore';
import { LibraryBookEntry, PersonalLibraryIndex } from './types';

/**
 * אירוע התקדמות בודד שנשלח מה-scan אל הקורא (בממשק ה-Electron: מהתהליך
 * הראשי אל חלון הרינדור דרך IPC). כל אירוע הוא "שורה" בלוג ההתקדמות.
 */
export interface ScanProgressEvent {
  type:
    | 'scan-start'
    | 'files-found'
    | 'file-start'
    | 'file-log'
    | 'file-done'
    | 'file-skip'
    | 'file-error'
    | 'scan-done';
  message: string;
  filePath?: string;
  kind?: 'word' | 'pdf' | 'unsupported';
}

/** שם ברירת המחדל של תיקיית הפלט הנוצרת בשורש התיקייה הנסרקת, שבה נשמרים
 *  כל התוצרים (מסמכים-מלווים ל-PDF, קבצי links.json, וקובץ האינדקס) - כדי
 *  לא לפזר קבצים חדשים בתוך תיקיות הספרים המקוריות של המשתמש. שם קבוע שהוחלט
 *  עליו במשותף עם הכלים האחרים (CLI המקורי וגרסת ה-web) ואין לשנותו. */
export const DEFAULT_OUTPUT_SUBFOLDER = '_אינדקס_אישי';

export interface ScanOptions {
  indexPath?: string;
  /** שם תיקיית הפלט (יחסי לשורש הנסרק). ברירת המחדל: DEFAULT_OUTPUT_SUBFOLDER. */
  companionSubfolder?: string | null;
}

export interface ScanSummary {
  indexPath: string;
  totalBooksInIndex: number;
  updatedThisRun: number;
  wordBooks: number;
  pdfCompanionBooks: number;
  totalHeadings: number;
  skippedUnsupported: number;
  skippedNoOutline: number;
  errors: number;
}

export interface ScanResult {
  index: PersonalLibraryIndex;
  summary: ScanSummary;
}

export interface ScanCallbacks {
  onProgress: (event: ScanProgressEvent) => void;
  resolveBookmarksChoice: ResolveBookmarksChoice;
}

/**
 * מריץ את כל תהליך הסריקה על תיקייה, ומדווח כל צעד דרך onProgress. כשנתקל
 * בקובץ Word עם כותרות בלי סימנייה, קורא ל-resolveBookmarksChoice ומחכה
 * (await) עד שההבטחה שהיא מחזירה תתמלא - כלומר עד שהצד הקורא (main process
 * של Electron) יקבל תשובה מהמשתמש בממשק ויפתור אותה.
 */
export async function runLibraryScan(
  folder: string,
  options: ScanOptions,
  callbacks: ScanCallbacks
): Promise<ScanResult> {
  const absFolder = path.resolve(folder);
  const companionSubfolder = (options.companionSubfolder && options.companionSubfolder.trim()) || DEFAULT_OUTPUT_SUBFOLDER;
  const outputDir = path.join(absFolder, companionSubfolder);
  fs.mkdirSync(outputDir, { recursive: true });
  const indexPath = options.indexPath
    ? path.resolve(options.indexPath)
    : path.join(outputDir, 'personal-library-index.json');

  const emit = (event: ScanProgressEvent) => callbacks.onProgress(event);

  emit({ type: 'scan-start', message: `סורק תיקייה: ${absFolder}` });

  const files = scanFolder(absFolder, [companionSubfolder]);
  emit({ type: 'files-found', message: `נמצאו ${files.length} קבצים רלוונטיים.` });

  const updatedBooks: LibraryBookEntry[] = [];
  const summary: ScanSummary = {
    indexPath,
    totalBooksInIndex: 0,
    updatedThisRun: 0,
    wordBooks: 0,
    pdfCompanionBooks: 0,
    totalHeadings: 0,
    skippedUnsupported: 0,
    skippedNoOutline: 0,
    errors: 0,
  };

  for (const file of files) {
    if (OOXML_WORD_EXT.has(file.ext)) {
      const ext = path.extname(file.absPath);
      const base = file.absPath.slice(0, -ext.length);
      const sibling = `${base}_links.json`;
      if (fs.existsSync(sibling)) {
        emit({
          type: 'file-skip',
          filePath: file.absPath,
          kind: 'word',
          message: `${file.absPath}: מסמך-מלווה שנוצר על ידי הכלי (זוהה לפי ${path.basename(
            sibling
          )}), מדלג על עיבוד ככותרות Word.`,
        });
        continue;
      }
      emit({ type: 'file-start', filePath: file.absPath, kind: 'word', message: `עיבוד קובץ Word: ${file.absPath}` });
      try {
        const result = await processWordFile(
          file.absPath,
          callbacks.resolveBookmarksChoice,
          (msg) => emit({ type: 'file-log', filePath: file.absPath, kind: 'word', message: msg })
        );
        if (result.writtenPath && result.headings.length > 0) {
          const title = path.basename(result.writtenPath, path.extname(result.writtenPath));
          updatedBooks.push({
            title,
            kind: 'word',
            sourcePath: result.writtenPath,
            headings: result.headings,
          });
          summary.wordBooks++;
          summary.totalHeadings += result.headings.length;
          emit({
            type: 'file-done',
            filePath: file.absPath,
            kind: 'word',
            message: `${path.basename(file.absPath)}: הושלם (${result.headings.length} כותרות).`,
          });
        } else {
          emit({
            type: 'file-skip',
            filePath: file.absPath,
            kind: 'word',
            message: `${path.basename(file.absPath)}: לא נוסף לאינדקס (ללא כותרות או דילוג).`,
          });
        }
      } catch (err) {
        summary.errors++;
        emit({
          type: 'file-error',
          filePath: file.absPath,
          kind: 'word',
          message: `שגיאה בעיבוד ${file.absPath}: ${(err as Error).message}`,
        });
      }
    } else if (UNSUPPORTED_WORD_EXT.has(file.ext)) {
      summary.skippedUnsupported++;
      emit({
        type: 'file-skip',
        filePath: file.absPath,
        kind: 'unsupported',
        message: `${file.absPath}: פורמט ${file.ext} עדיין לא נתמך, מדלג.`,
      });
    } else if (PDF_EXT.has(file.ext)) {
      emit({ type: 'file-start', filePath: file.absPath, kind: 'pdf', message: `עיבוד קובץ PDF: ${file.absPath}` });
      try {
        const outline = await extractPdfOutline(file.absPath);
        if (!outline) {
          summary.skippedNoOutline++;
          emit({
            type: 'file-skip',
            filePath: file.absPath,
            kind: 'pdf',
            message: `${path.basename(file.absPath)}: לא נמצא תוכן עניינים ב-PDF זה, מדלג.`,
          });
          continue;
        }
        const companion = await generatePdfCompanion(file.absPath, outline, absFolder, companionSubfolder);
        emit({
          type: 'file-log',
          filePath: file.absPath,
          kind: 'pdf',
          message: `נוצר מסמך מלווה: ${companion.companionDocxPath} (${companion.headings.length} כותרות)`,
        });
        emit({
          type: 'file-log',
          filePath: file.absPath,
          kind: 'pdf',
          message: `נוצר קובץ קישורים: ${companion.linksJsonPath}`,
        });
        updatedBooks.push({
          title: companion.companionTitle,
          kind: 'pdf-companion',
          sourcePath: companion.companionDocxPath,
          pdfPath: file.absPath,
          headings: companion.headings,
        });
        summary.pdfCompanionBooks++;
        summary.totalHeadings += companion.headings.length;
        emit({
          type: 'file-done',
          filePath: file.absPath,
          kind: 'pdf',
          message: `${path.basename(file.absPath)}: הושלם (${companion.headings.length} כותרות).`,
        });
      } catch (err) {
        summary.errors++;
        emit({
          type: 'file-error',
          filePath: file.absPath,
          kind: 'pdf',
          message: `שגיאה בעיבוד ${file.absPath}: ${(err as Error).message}`,
        });
      }
    }
  }

  const existing = loadExistingIndex(indexPath);
  const mergedBooks = mergeBooks(existing.books, updatedBooks);
  const finalIndex: PersonalLibraryIndex = {
    version: 1,
    generatedAt: new Date().toISOString(),
    books: mergedBooks,
  };
  saveIndex(indexPath, finalIndex);

  summary.totalBooksInIndex = mergedBooks.length;
  summary.updatedThisRun = updatedBooks.length;

  emit({
    type: 'scan-done',
    message: `נשמר אינדקס: ${indexPath} (סה"כ ${mergedBooks.length} ספרים, עודכנו ${updatedBooks.length} בהרצה זו)`,
  });

  return { index: finalIndex, summary };
}
