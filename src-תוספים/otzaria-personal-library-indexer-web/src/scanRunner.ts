import * as fs from 'fs';
import * as path from 'path';
import { EventEmitter } from 'events';
import { scanFolder, OOXML_WORD_EXT, UNSUPPORTED_WORD_EXT, PDF_EXT } from './scan';
import { processWordFile, MissingBookmarksChoice } from './wordDocxProcessor';
import { extractPdfOutline } from './pdfOutline';
import { generatePdfCompanion } from './pdfCompanion';
import { loadExistingIndex, mergeBooks, saveIndex } from './indexStore';
import { LibraryBookEntry, PersonalLibraryIndex } from './types';

/**
 * שם ברירת המחדל של תיקיית הפלט הנוצרת בשורש התיקייה שנסרקה, שבה נשמרים כל
 * הקבצים שהכלי מייצר (מסמכים-מלווים ל-PDF, קובצי links.json, וקובץ המיפוי
 * personal-library-index.json) - כדי לא ללכלך את תיקיות הספרים האמיתיות.
 * שם קבוע ומוסכם בין שלושת גרסאות הכלי (CLI/web/electron) - אין לשנותו.
 */
export const DEFAULT_COMPANION_SUBFOLDER = '_אינדקס_אישי';

export interface ScanOptions {
  folder: string;
  indexPath?: string;
  companionSubfolder?: string | null;
}

export interface BookSummaryItem {
  title: string;
  kind: 'word' | 'pdf-companion';
  sourcePath: string;
  pdfPath?: string;
  headingCount: number;
}

export interface SkippedItem {
  path: string;
  reason: string;
}

export interface ScanSummary {
  folder: string;
  indexPath: string;
  totalFilesFound: number;
  updatedBooks: BookSummaryItem[];
  skipped: SkippedItem[];
  totalBooksInIndex: number;
  index: PersonalLibraryIndex;
}

/**
 * מריץ סריקה שלמה של תיקייה (מקביל ל-main() ב-CLI המקורי), אך פולט אירועים
 * (log/file/question/done/error) במקום להדפיס ל-stdout ולשאול ב-readline.
 * שאלות "מה לעשות עם כותרות בלי סימנייה" נפלטות כאירוע 'question' עם מזהה,
 * וממתינות (Promise) עד ש-answerQuestion(id, choice) ייקרא מבחוץ (מהשרת/מהדפדפן).
 */
export class ScanRunner extends EventEmitter {
  private pendingQuestions = new Map<
    string,
    (choice: MissingBookmarksChoice) => void
  >();
  private nextQuestionId = 1;
  private cancelled = false;

  answerQuestion(id: string, choice: MissingBookmarksChoice): boolean {
    const resolver = this.pendingQuestions.get(id);
    if (!resolver) return false;
    this.pendingQuestions.delete(id);
    resolver(choice);
    return true;
  }

  cancel(): void {
    this.cancelled = true;
  }

  private log(message: string): void {
    this.emit('log', { message });
  }

  private askDecision(fileLabel: string, missingCount: number): Promise<MissingBookmarksChoice> {
    const id = String(this.nextQuestionId++);
    return new Promise((resolve) => {
      this.pendingQuestions.set(id, resolve);
      this.emit('question', { id, fileLabel, missingCount });
    });
  }

  async run(opts: ScanOptions): Promise<ScanSummary> {
    const folder = path.resolve(opts.folder);
    const companionSubfolder =
      opts.companionSubfolder && opts.companionSubfolder.trim().length > 0
        ? opts.companionSubfolder.trim()
        : DEFAULT_COMPANION_SUBFOLDER;
    const indexPath = opts.indexPath
      ? path.resolve(opts.indexPath)
      : path.join(folder, companionSubfolder, 'personal-library-index.json');

    this.log(`סורק תיקייה: ${folder}`);
    this.log(`תיקיית הפלט (מסמכים-מלווים, קישורים, וקובץ המיפוי): ${path.join(folder, companionSubfolder)}`);
    this.emit('phase', { phase: 'listing' });

    const files = scanFolder(folder);
    this.log(`נמצאו ${files.length} קבצים רלוונטיים.`);
    this.emit('files-found', { count: files.length });

    const updatedBooks: LibraryBookEntry[] = [];
    const skipped: SkippedItem[] = [];

    for (const file of files) {
      if (this.cancelled) {
        this.log('הסריקה בוטלה.');
        break;
      }

      if (OOXML_WORD_EXT.has(file.ext)) {
        const ext = path.extname(file.absPath);
        const base = file.absPath.slice(0, -ext.length);
        const sibling = `${base}_links.json`;
        if (fs.existsSync(sibling)) {
          this.log(
            `${file.absPath}: מסמך-מלווה שנוצר על ידי הכלי (זוהה לפי ${path.basename(
              sibling
            )}), מדלג על עיבוד ככותרות Word.`
          );
          continue;
        }
        this.emit('file-start', { path: file.absPath, type: 'word' });
        this.log(`עיבוד קובץ Word: ${file.absPath}`);
        try {
          const result = await processWordFile(file.absPath, (label, count) =>
            this.askDecision(label, count)
          );
          for (const l of result.logs) this.log(l);
          if (result.writtenPath && result.headings.length > 0) {
            const title = path.basename(result.writtenPath, path.extname(result.writtenPath));
            updatedBooks.push({
              title,
              kind: 'word',
              sourcePath: result.writtenPath,
              headings: result.headings,
            });
            this.emit('file-done', {
              path: file.absPath,
              kind: 'word',
              headingCount: result.headings.length,
            });
          } else {
            skipped.push({ path: file.absPath, reason: 'ללא כותרות או דילוג' });
            this.emit('file-skipped', { path: file.absPath, reason: 'ללא כותרות או דילוג' });
          }
        } catch (err) {
          const msg = (err as Error).message;
          this.log(`שגיאה בעיבוד ${file.absPath}: ${msg}`);
          skipped.push({ path: file.absPath, reason: `שגיאה: ${msg}` });
          this.emit('file-error', { path: file.absPath, message: msg });
        }
      } else if (UNSUPPORTED_WORD_EXT.has(file.ext)) {
        this.log(`${file.absPath}: פורמט ${file.ext} עדיין לא נתמך, מדלג.`);
        skipped.push({ path: file.absPath, reason: `פורמט ${file.ext} עדיין לא נתמך` });
        this.emit('file-skipped', { path: file.absPath, reason: `פורמט ${file.ext} עדיין לא נתמך` });
      } else if (PDF_EXT.has(file.ext)) {
        this.emit('file-start', { path: file.absPath, type: 'pdf' });
        this.log(`עיבוד קובץ PDF: ${file.absPath}`);
        try {
          const outline = await extractPdfOutline(file.absPath);
          if (!outline) {
            this.log('לא נמצא outline (תוכן עניינים) ב-PDF זה, מדלג.');
            skipped.push({ path: file.absPath, reason: 'אין תוכן עניינים (outline) ב-PDF' });
            this.emit('file-skipped', {
              path: file.absPath,
              reason: 'אין תוכן עניינים (outline) ב-PDF',
            });
            continue;
          }
          const companion = await generatePdfCompanion(file.absPath, outline, folder, companionSubfolder);
          this.log(
            `נוצר מסמך מלווה: ${companion.companionDocxPath} (${companion.headings.length} כותרות)`
          );
          this.log(`נוצר קובץ קישורים: ${companion.linksJsonPath}`);
          updatedBooks.push({
            title: companion.companionTitle,
            kind: 'pdf-companion',
            sourcePath: companion.companionDocxPath,
            pdfPath: file.absPath,
            headings: companion.headings,
          });
          this.emit('file-done', {
            path: file.absPath,
            kind: 'pdf-companion',
            headingCount: companion.headings.length,
          });
        } catch (err) {
          const msg = (err as Error).message;
          this.log(`שגיאה בעיבוד ${file.absPath}: ${msg}`);
          skipped.push({ path: file.absPath, reason: `שגיאה: ${msg}` });
          this.emit('file-error', { path: file.absPath, message: msg });
        }
      }
    }

    const existing = loadExistingIndex(indexPath);
    const mergedBooks = mergeBooks(existing.books, updatedBooks);
    const index: PersonalLibraryIndex = {
      version: 1,
      generatedAt: new Date().toISOString(),
      books: mergedBooks,
    };
    fs.mkdirSync(path.dirname(indexPath), { recursive: true });
    saveIndex(indexPath, index);

    this.log(`נשמר אינדקס: ${indexPath}`);
    this.log(`סה"כ ספרים באינדקס: ${mergedBooks.length} (עודכנו/נוספו ${updatedBooks.length} בהרצה זו)`);

    const summary: ScanSummary = {
      folder,
      indexPath,
      totalFilesFound: files.length,
      updatedBooks: updatedBooks.map((b) => ({
        title: b.title,
        kind: b.kind,
        sourcePath: b.sourcePath,
        pdfPath: b.kind === 'pdf-companion' ? b.pdfPath : undefined,
        headingCount: b.headings.length,
      })),
      skipped,
      totalBooksInIndex: mergedBooks.length,
      index,
    };

    this.emit('done', summary);
    return summary;
  }
}
