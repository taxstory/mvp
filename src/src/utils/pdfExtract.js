// src/utils/pdfExtract.js
//
// Reads a return PDF IN THE BROWSER and hands visual rows of text to the Form 1040 parser. The file is read from memory
// (File → ArrayBuffer → pdf.js). It is never uploaded, never stored, and no raw text is returned to the caller beyond the
// parser's numeric result: `readReturnPdf` returns only what parseForm1040 returns plus page/row counts.
//
// pdf.js is loaded lazily so the ~1 MB library is only fetched on the screen that imports a PDF.
import { parseForm1040 } from './form1040Parser.js';

export const MAX_BYTES = 25 * 1024 * 1024;
const MAX_PAGES = 4;                      // the 1040 itself is pages 1–2; schedules and attachments are not needed

let pdfjsPromise;
/** Loads pdf.js and points it at its worker (Vite resolves the ?url import to a hashed same-origin asset). */
export function loadPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')]).then(([lib, worker]) => {
      lib.GlobalWorkerOptions.workerSrc = worker.default;
      return lib;
    });
  }
  return pdfjsPromise;
}

const ROW_TOLERANCE = 4;                  // points: items whose baselines differ by less than this are on one visual row
const WIDE_GAP = 14;                      // points: a gap this wide between two items marks caption → amount column

/** Group positioned text items into rows (top→bottom, left→right). A wide gap becomes the ‖ leader the parser understands. */
export function itemsToRows(items) {
  const sorted = items.filter(i => i.str && i.str.trim()).sort((a, b) => (b.y - a.y) || (a.x - b.x));
  const rows = []; let cur = null;
  for (const it of sorted) {
    if (cur && Math.abs(cur.y - it.y) <= ROW_TOLERANCE) cur.items.push(it);
    else { cur = { y: it.y, items: [it] }; rows.push(cur); }
  }
  return rows.map(r => {
    const items = r.items.sort((a, b) => a.x - b.x); let text = '', prevEnd = null;
    for (const it of items) {
      if (prevEnd !== null) { const gap = it.x - prevEnd; text += gap > WIDE_GAP ? ' ‖ ' : (gap > 0.5 || /^\S/.test(it.str) ? ' ' : ''); }
      text += it.str.trim(); prevEnd = it.x + (it.width || it.str.length * 4);
    }
    return text;
  });
}

/** @param {ArrayBuffer|Uint8Array} data  @param pdfjs the pdf.js module (injected so tests can pass the Node build) */
export async function extractRows(data, pdfjs, { maxPages = MAX_PAGES } = {}) {
  const task = pdfjs.getDocument({
    data: data instanceof Uint8Array ? data : new Uint8Array(data),
    isEvalSupported: false, useSystemFonts: true, stopAtErrors: false, disableAutoFetch: true, verbosity: 0,
  });
  const doc = await task.promise;
  const rows = [];
  try {
    for (let p = 1; p <= Math.min(doc.numPages, maxPages); p++) {
      const page = await doc.getPage(p);
      const text = await page.getTextContent();
      const items = text.items.map(i => ({ str: i.str, x: i.transform[4], y: i.transform[5], width: i.width }));
      // Fillable-form PDFs (the IRS layout many tax products reproduce) keep amounts in form fields, which getTextContent() does not return.
      // A field's box rarely shares its caption's exact baseline, so each field is SNAPPED to the caption on the same visual row: the nearest
      // text item to its left (for amounts) or right (for check boxes) whose baseline falls inside the box's vertical span.
      const textItems = items.filter(i => i.str && i.str.trim());
      const annots = await page.getAnnotations({ intent: 'display' }).catch(() => []);
      for (const a of annots) {
        if (a.subtype !== 'Widget' || !a.rect) continue;
        const x = a.rect[0], width = a.rect[2] - a.rect[0], lo = Math.min(a.rect[1], a.rect[3]) - 2, hi = Math.max(a.rect[1], a.rect[3]) + 1;
        const inSpan = textItems.filter(t => t.y >= lo && t.y <= hi);
        const snap = (leftOf) => {
          const c = leftOf ? inSpan.filter(t => t.x + (t.width || 0) <= x + 2).sort((p, q) => (q.x + (q.width || 0)) - (p.x + (p.width || 0)))
                           : inSpan.filter(t => t.x >= x - 2).sort((p, q) => p.x - q.x);
          return c.length ? c[0].y : (a.rect[1] + a.rect[3]) / 2;
        };
        if (a.fieldType === 'Tx' && a.fieldValue) items.push({ str: String(a.fieldValue), x, y: snap(true), width });
        else if (a.fieldType === 'Btn' && a.checkBox && a.fieldValue && !/^(off|0|false)$/i.test(String(a.fieldValue))) items.push({ str: '☒', x, y: snap(false), width });
      }
      rows.push(...itemsToRows(items));
      page.cleanup();
    }
  } finally { await task.destroy(); }   // frees the worker's copy of the document (and with it the file's text)
  return rows;
}

/**
 * Parse a return PDF locally. Returns the parser's result (figures, status, year, checks, quality) plus counts.
 * Throws a user-safe Error for unreadable files. The file never leaves the browser.
 */
export async function readReturnPdf(file, pdfjs = null) {
  if (!file || file.type !== 'application/pdf') throw new Error('Please choose a PDF file.');
  if (file.size > MAX_BYTES) throw new Error('That file is larger than 25 MB.');
  const lib = pdfjs || await loadPdfjs();
  let rows;
  try { rows = await extractRows(await file.arrayBuffer(), lib); }
  catch { throw new Error('That PDF could not be read. It may be damaged or password-protected.'); }
  if (rows.length === 0) throw new Error('This PDF has no selectable text — it looks like a scan or a photo. Use a PDF exported from your tax software, or enter the figures manually.');
  return { ...parseForm1040(rows), rowCount: rows.length };
}
