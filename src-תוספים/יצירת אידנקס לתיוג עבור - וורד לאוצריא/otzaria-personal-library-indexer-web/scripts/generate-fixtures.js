const { Document, Packer, Paragraph, HeadingLevel, TextRun, BookmarkStart, BookmarkEnd } = require('docx');
const fs = require('fs');
const path = require('path');

const fixturesDir = path.join(__dirname, '..', 'fixtures');
fs.mkdirSync(fixturesDir, { recursive: true });
fs.mkdirSync(path.join(fixturesDir, 'sub'), { recursive: true });

async function writeDoc(children, outPath) {
  const doc = new Document({ sections: [{ children }] });
  const buf = await Packer.toBuffer(doc);
  fs.writeFileSync(outPath, buf);
}

(async () => {
  // 1) מסמך מעורב: כותרת אחת עם סימנייה קיימת, כותרת אחת בלי
  await writeDoc(
    [
      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun('פרק ראשון')] }),
      new Paragraph({ text: 'תוכן כלשהו.' }),
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [
          new BookmarkStart('existing_bm_1', 1),
          new TextRun('תת פרק עם סימנייה קיימת'),
          new BookmarkEnd(1),
        ],
      }),
      new Paragraph({ text: 'עוד תוכן.' }),
      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun('פרק שני בלי סימנייה')] }),
      new Paragraph({ text: 'תוכן נוסף.' }),
    ],
    path.join(fixturesDir, 'doc-mixed.docx')
  );

  // 2) מסמך ללא סימניות כלל
  await writeDoc(
    [
      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun('מבוא')] }),
      new Paragraph({ text: 'תוכן.' }),
      new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun('סעיף א')] }),
      new Paragraph({ text: 'תוכן.' }),
      new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun('סעיף ב')] }),
      new Paragraph({ text: 'תוכן.' }),
    ],
    path.join(fixturesDir, 'sub', 'doc-none.docx')
  );

  // 3) מסמך שבו לכל הכותרות כבר יש סימנייה - לא אמור להופיע פרומפט
  await writeDoc(
    [
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: [
          new BookmarkStart('bm_full_1', 10),
          new TextRun('כותרת עם סימנייה'),
          new BookmarkEnd(10),
        ],
      }),
      new Paragraph({ text: 'תוכן.' }),
    ],
    path.join(fixturesDir, 'doc-full.docx')
  );

  // 4) PDF עם תוכן עניינים אמיתי (כולל רמת קינון אחת), לבדיקת יצירת מסמך-מלווה
  const {
    PDFDocument,
    StandardFonts,
    PDFName,
    PDFHexString,
    PDFNumber,
  } = require('pdf-lib');

  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < 5; i++) {
    const page = pdfDoc.addPage([300, 400]);
    page.drawText(`Page ${i + 1}`, { x: 50, y: 350, size: 20, font });
  }

  const context = pdfDoc.context;
  const catalog = pdfDoc.catalog;
  const pageRefs = pdfDoc.getPages().map((p) => p.ref);

  const item1Ref = context.nextRef();
  const item2Ref = context.nextRef();
  const item2aRef = context.nextRef(); // ילד מקונן תחת item2 (בדיקת עומק)
  const item3Ref = context.nextRef();
  const outlineRef = context.nextRef();

  const item1 = context.obj({
    Title: PDFHexString.fromText('פרק א'),
    Parent: outlineRef,
    Dest: context.obj([pageRefs[0], PDFName.of('Fit')]),
    Next: item2Ref,
  });
  const item2 = context.obj({
    Title: PDFHexString.fromText('פרק ב'),
    Parent: outlineRef,
    Dest: context.obj([pageRefs[2], PDFName.of('Fit')]),
    Prev: item1Ref,
    Next: item3Ref,
    First: item2aRef,
    Last: item2aRef,
    Count: PDFNumber.of(1),
  });
  const item2a = context.obj({
    Title: PDFHexString.fromText('פרק ב - תת סעיף מקונן'),
    Parent: item2Ref,
    Dest: context.obj([pageRefs[3], PDFName.of('Fit')]),
  });
  const item3 = context.obj({
    Title: PDFHexString.fromText('פרק ג - תת סעיף'),
    Parent: outlineRef,
    Dest: context.obj([pageRefs[4], PDFName.of('Fit')]),
    Prev: item2Ref,
  });

  const outline = context.obj({
    Type: PDFName.of('Outlines'),
    First: item1Ref,
    Last: item3Ref,
    Count: PDFNumber.of(3),
  });

  context.assign(item1Ref, item1);
  context.assign(item2Ref, item2);
  context.assign(item2aRef, item2a);
  context.assign(item3Ref, item3);
  context.assign(outlineRef, outline);
  catalog.set(PDFName.of('Outlines'), outlineRef);

  const pdfBytes = await pdfDoc.save();
  fs.writeFileSync(path.join(fixturesDir, 'sample.pdf'), pdfBytes);

  // 5) עותק נוסף באותו שם בסיס אך בתת-תיקייה אחרת (fixtures/sub/sample.pdf) - לבדיקת
  // סכימת מניעת-ההתנגשות בשמות: שני קבצי sample.pdf (אחד בשורש, אחד ב-sub) חייבים
  // להפיק שני מסמכים-מלווים בעלי שמות שונים בתיקיית הפלט השטוחה המשותפת.
  fs.writeFileSync(path.join(fixturesDir, 'sub', 'sample.pdf'), pdfBytes);

  console.log('fixtures written');
})();
