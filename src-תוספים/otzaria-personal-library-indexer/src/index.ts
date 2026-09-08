#!/usr/bin/env node
import * as fs from 'fs';
import * as path from 'path';
import {
  scanFolder,
  OOXML_WORD_EXT,
  UNSUPPORTED_WORD_EXT,
  PDF_EXT,
} from './scan';
import { processWordFile } from './wordDocxProcessor';
import { closeSharedPrompt } from './prompt';
import { extractPdfOutline } from './pdfOutline';
import { generatePdfCompanion } from './pdfCompanion';
import { loadExistingIndex, mergeBooks, saveIndex } from './indexStore';
import { LibraryBookEntry } from './types';

interface CliOptions {
  folder: string;
  indexPath: string;
  companionSubfolder: string | null;
}

function parseArgs(argv: string[]): CliOptions {
  const args = argv.slice(2);
  if (args.length === 0 || args[0].startsWith('-')) {
    printUsageAndExit();
  }
  const folder = path.resolve(args[0]);
  let indexPath = path.join(folder, 'personal-library-index.json');
  let companionSubfolder: string | null = null;

  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--index-path') {
      const val = args[++i];
      if (!val) printUsageAndExit();
      indexPath = path.resolve(val);
    } else if (arg === '--companion-subfolder') {
      const val = args[++i];
      if (!val) printUsageAndExit();
      companionSubfolder = val;
    } else if (arg === '--help' || arg === '-h') {
      printUsageAndExit();
    } else {
      console.error(`ארגומנט לא מוכר: ${arg}`);
      printUsageAndExit();
    }
  }

  return { folder, indexPath, companionSubfolder };
}

function printUsageAndExit(): never {
  console.log(
    [
      'שימוש: otzaria-plib-indexer <תיקייה> [--index-path <נתיב>] [--companion-subfolder <שם>]',
      '',
      '  <תיקייה>                 תיקיית השורש לסריקה רקורסיבית של קבצי Word/PDF.',
      '  --index-path <נתיב>      נתיב לקובץ personal-library-index.json (ברירת מחדל: שורש התיקייה הנסרקת).',
      '  --companion-subfolder <שם>  תת-תיקייה (יחסית לכל PDF) לכתיבת מסמך האינדקס המלווה (ברירת מחדל: אותה תיקייה כמו ה-PDF).',
    ].join('\n')
  );
  process.exit(1);
}

async function main() {
  const opts = parseArgs(process.argv);
  console.log(`סורק תיקייה: ${opts.folder}`);

  const files = scanFolder(opts.folder);
  console.log(`נמצאו ${files.length} קבצים רלוונטיים.`);

  const updatedBooks: LibraryBookEntry[] = [];

  for (const file of files) {
    if (OOXML_WORD_EXT.has(file.ext)) {
      // דילוג על מסמכים-מלווים שהכלי עצמו יצר עבור PDF (מזוהים לפי קובץ
      // <שם>_links.json צמוד) - אחרת הם ייסרקו שוב כמסמכי Word רגילים
      // ויקבלו בקשת סימניות מיותרת, בזמן שהם כבר מיוצגים באינדקס כ-pdf-companion.
      const ext = path.extname(file.absPath);
      const base = file.absPath.slice(0, -ext.length);
      const sibling = `${base}_links.json`;
      if (fs.existsSync(sibling)) {
        console.log(`\n${file.absPath}: מסמך-מלווה שנוצר על ידי הכלי (זוהה לפי ${path.basename(sibling)}), מדלג על עיבוד ככותרות Word.`);
        continue;
      }
      console.log(`\nעיבוד קובץ Word: ${file.absPath}`);
      try {
        const result = await processWordFile(file.absPath);
        if (result.writtenPath && result.headings.length > 0) {
          const title = path.basename(result.writtenPath, path.extname(result.writtenPath));
          updatedBooks.push({
            title,
            kind: 'word',
            sourcePath: result.writtenPath,
            headings: result.headings,
          });
        }
      } catch (err) {
        console.error(`  שגיאה בעיבוד ${file.absPath}: ${(err as Error).message}`);
      }
    } else if (UNSUPPORTED_WORD_EXT.has(file.ext)) {
      console.log(`\n${file.absPath}: פורמט ${file.ext} עדיין לא נתמך, מדלג.`);
    } else if (PDF_EXT.has(file.ext)) {
      console.log(`\nעיבוד קובץ PDF: ${file.absPath}`);
      try {
        const outline = await extractPdfOutline(file.absPath);
        if (!outline) {
          console.log('  לא נמצא outline (תוכן עניינים) ב-PDF זה, מדלג.');
          continue;
        }
        const companion = await generatePdfCompanion(file.absPath, outline, opts.companionSubfolder);
        console.log(
          `  נוצר מסמך מלווה: ${companion.companionDocxPath} (${companion.headings.length} כותרות)`
        );
        console.log(`  נוצר קובץ קישורים: ${companion.linksJsonPath}`);
        updatedBooks.push({
          title: companion.companionTitle,
          kind: 'pdf-companion',
          sourcePath: companion.companionDocxPath,
          pdfPath: file.absPath,
          headings: companion.headings,
        });
      } catch (err) {
        console.error(`  שגיאה בעיבוד ${file.absPath}: ${(err as Error).message}`);
      }
    }
  }

  const existing = loadExistingIndex(opts.indexPath);
  const mergedBooks = mergeBooks(existing.books, updatedBooks);
  saveIndex(opts.indexPath, {
    version: 1,
    generatedAt: new Date().toISOString(),
    books: mergedBooks,
  });

  console.log(`\nנשמר אינדקס: ${opts.indexPath}`);
  console.log(`סה"כ ספרים באינדקס: ${mergedBooks.length} (עודכנו/נוספו ${updatedBooks.length} בהרצה זו)`);
  closeSharedPrompt();
}

main().catch((err) => {
  console.error('שגיאה כללית:', err);
  process.exit(1);
});
