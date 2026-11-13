import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { SurveyType } from '../../../types/survey';
import type { buildArchivedReport, ArchivedReportKind } from '../domain/archivedReports';
import type { PaperSize } from '../domain/paperSize';
import { createArchivedReportPdf } from './archivedReportExport';

let renderer: Promise<typeof import('pdfjs-dist')> | undefined;
const preparedReports = new WeakMap<ReturnType<typeof buildArchivedReport>, Map<string, Promise<Blob>>>();

/** Load the local renderer/worker only when a paper preview is opened. */
export function preparePdfRenderer() {
  renderer ??= Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')]).then(([pdfjs, worker]) => {
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
    return pdfjs;
  }).catch(error => { renderer = undefined; throw error; });
  return renderer;
}

/** Two recent paper variants per immutable report; discarded reports remain garbage-collectable. */
export function prepareArchivedPaper(report: ReturnType<typeof buildArchivedReport>, kind: ArchivedReportKind, category: SurveyType, paperSize: PaperSize, includeComments: boolean) {
  let variants = preparedReports.get(report);
  if (!variants) { variants = new Map(); preparedReports.set(report, variants); }
  const key = `${kind}:${category}:${paperSize}:${includeComments}`;
  const cached = variants.get(key);
  if (cached) return cached;
  const oldest = variants.keys().next().value;
  if (variants.size >= 2 && oldest !== undefined) variants.delete(oldest);
  const recipe = { kind, parameters: { paperSize, category, archivedItemId: 'preview', includeComments } };
  const pending = createArchivedReportPdf(report.title, report.itemLabel, category, report.tables, recipe, report.analytics, { preview: true });
  variants.set(key, pending);
  const currentVariants = variants;
  void pending.catch(() => { if (currentVariants.get(key) === pending) currentVariants.delete(key); });
  return pending;
}

export async function loadPdfPreview(blob: Blob, signal: AbortSignal): Promise<PDFDocumentProxy> {
  const pdfjs = await preparePdfRenderer();
  if (signal.aborted) throw new DOMException('Preview changed', 'AbortError');
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (signal.aborted) throw new DOMException('Preview changed', 'AbortError');
  const task = pdfjs.getDocument({ data: bytes, useSystemFonts: true });
  const abort = () => { void task.destroy(); };
  signal.addEventListener('abort', abort, { once: true });
  try { return await task.promise; }
  finally { signal.removeEventListener('abort', abort); }
}
