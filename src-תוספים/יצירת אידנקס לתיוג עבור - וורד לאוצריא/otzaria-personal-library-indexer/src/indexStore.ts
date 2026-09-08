import * as fs from 'fs';
import * as path from 'path';
import { LibraryBookEntry, PersonalLibraryIndex } from './types';

/** קורא אינדקס קיים מהדיסק, או מחזיר אינדקס ריק אם לא קיים / לא תקין. */
export function loadExistingIndex(indexPath: string): PersonalLibraryIndex {
  if (!fs.existsSync(indexPath)) {
    return { version: 1, generatedAt: new Date().toISOString(), books: [] };
  }
  try {
    const raw = fs.readFileSync(indexPath, 'utf8');
    const parsed = JSON.parse(raw) as PersonalLibraryIndex;
    if (!parsed || !Array.isArray(parsed.books)) {
      throw new Error('מבנה קובץ אינדקס לא תקין');
    }
    return parsed;
  } catch (err) {
    console.error(
      `אזהרה: לא ניתן לקרוא את קובץ האינדקס הקיים (${indexPath}): ${(err as Error).message}. מתחיל אינדקס חדש.`
    );
    return { version: 1, generatedAt: new Date().toISOString(), books: [] };
  }
}

/**
 * ממזג רשומות חדשות/מעודכנות לתוך אינדקס קיים, לפי מפתח sourcePath.
 * רשומות שלא נסרקו בהרצה הנוכחית (כי לא היו בתיקייה שנסרקה) נשארות כפי שהיו.
 */
export function mergeBooks(
  existing: LibraryBookEntry[],
  updated: LibraryBookEntry[]
): LibraryBookEntry[] {
  const bySourcePath = new Map<string, LibraryBookEntry>();
  for (const b of existing) bySourcePath.set(normalizeKey(b.sourcePath), b);
  for (const b of updated) bySourcePath.set(normalizeKey(b.sourcePath), b);
  return Array.from(bySourcePath.values());
}

function normalizeKey(p: string): string {
  return p.toLowerCase();
}

export function saveIndex(indexPath: string, index: PersonalLibraryIndex): void {
  fs.mkdirSync(path.dirname(indexPath), { recursive: true });
  fs.writeFileSync(indexPath, JSON.stringify(index, null, 2), 'utf8');
}
