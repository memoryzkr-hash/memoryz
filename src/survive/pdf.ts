/** Reads the text layer of a PDF in the browser. pdf.js is loaded only when a PDF is actually picked. */

export interface PdfText {
  pages: string[];
  /** Characters of real text found; near zero means a scanned PDF. */
  chars: number;
}

export async function readPdf(data: ArrayBuffer, onPage?: (done: number, total: number) => void): Promise<PdfText> {
  const pdfjs = await import('pdfjs-dist');
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const task = pdfjs.getDocument({ data: new Uint8Array(data.slice(0)) });
  const doc = await task.promise;
  const pages: string[] = [];
  let chars = 0;
  try {
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const tc = await page.getTextContent();
      let text = '';
      let lastY: number | null = null;
      for (const item of tc.items) {
        if (!('str' in item)) continue;
        const y = item.transform[5];
        // A jump in y means a new line even when pdf.js does not flag it.
        if (lastY !== null && Math.abs(y - lastY) > 2 && !text.endsWith('\n')) text += '\n';
        text += item.str;
        if (item.hasEOL) text += '\n';
        lastY = y;
      }
      pages.push(text);
      chars += text.replace(/\s/g, '').length;
      onPage?.(i, doc.numPages);
      page.cleanup();
    }
  } finally {
    void task.destroy();
  }
  return { pages, chars };
}

export function toBase64(data: ArrayBuffer): string {
  const bytes = new Uint8Array(data);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
