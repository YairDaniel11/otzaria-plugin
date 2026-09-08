/** יצירת שם bookmark תקין ל-OOXML: אות ראשונה, אחר כך אותיות/ספרות/קו תחתון בלבד. */
export function slugifyForBookmark(text: string, maxLen = 40): string {
  // תעתיק גס: משאירים רק תווים לטיניים/ספרות, ממירים כל השאר לקו תחתון
  const ascii = text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // הסרת diacritics מ-NFKD
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  const base = ascii.length > 0 ? ascii : 'heading';
  return base.slice(0, maxLen);
}

/** שם bookmark דטרמיניסטי: h_<index>_<slug>, קטום ל-40 תווים לכל היותר. */
export function makeBookmarkName(index: number, text: string): string {
  const prefix = `h_${index}_`;
  const slug = slugifyForBookmark(text, Math.max(1, 40 - prefix.length));
  return `${prefix}${slug}`;
}
