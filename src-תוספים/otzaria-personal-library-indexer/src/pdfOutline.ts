import * as fs from 'fs';

export interface FlatOutlineEntry {
  title: string;
  depth: number; // 0 = רמה עליונה -> Heading1, עד מקסימום 5 (Heading6)
  page: number; // 1-based
}

// pdfjs-dist הוא ESM-only (build/pdf.mjs) - טוענים דינמית כדי לא לגרום ל-TS
// להמיר את ה-import ל-require (שיישבר על מודול ESM).
// eslint-disable-next-line @typescript-eslint/no-implied-eval
const dynamicImport: (specifier: string) => Promise<any> = new Function(
  'specifier',
  'return import(specifier)'
) as any;

let pdfjsModulePromise: Promise<any> | null = null;
function getPdfjs(): Promise<any> {
  if (!pdfjsModulePromise) {
    pdfjsModulePromise = dynamicImport('pdfjs-dist/legacy/build/pdf.mjs');
  }
  return pdfjsModulePromise;
}

/**
 * טוען PDF ומחזיר את ה-outline שלו (אם קיים) כרשימה שטוחה עם עומק ומספר עמוד
 * מוחלט (1-based). מחזיר null אם אין outline כלל.
 */
export async function extractPdfOutline(absPath: string): Promise<FlatOutlineEntry[] | null> {
  const pdfjs = await getPdfjs();
  const data = new Uint8Array(fs.readFileSync(absPath));
  const loadingTask = pdfjs.getDocument({
    data,
    isEvalSupported: false,
    useSystemFonts: true,
  });
  const doc = await loadingTask.promise;
  try {
    const outline = await doc.getOutline();
    if (!outline || outline.length === 0) return null;

    const flat: FlatOutlineEntry[] = [];

    async function resolvePage(dest: any): Promise<number | null> {
      if (dest == null) return null;
      let explicitDest = dest;
      if (typeof dest === 'string') {
        explicitDest = await doc.getDestination(dest);
      }
      if (!explicitDest || !Array.isArray(explicitDest) || explicitDest.length === 0) return null;
      const pageRef = explicitDest[0];
      try {
        const pageIndex = await doc.getPageIndex(pageRef);
        return pageIndex + 1;
      } catch {
        return null;
      }
    }

    async function walk(items: any[], depth: number) {
      for (const item of items) {
        const page = await resolvePage(item.dest);
        if (page !== null) {
          flat.push({ title: (item.title || '').trim() || '(ללא כותרת)', depth, page });
        }
        if (item.items && item.items.length > 0) {
          await walk(item.items, depth + 1);
        }
      }
    }

    await walk(outline, 0);
    return flat.length > 0 ? flat : null;
  } finally {
    await doc.destroy();
  }
}
