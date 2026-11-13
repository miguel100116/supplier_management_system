import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
import type { SurveyType } from '../../../types/survey';
import type { buildArchivedReport, ArchivedReportKind } from '../domain/archivedReports';
import { paperSizePoints, type PaperSize } from '../domain/paperSize';
import { loadPdfPreview, prepareArchivedPaper, preparePdfRenderer } from '../services/pdfPreview';

function PaperPage({ document, number, paperSize }: { document: PDFDocumentProxy; number: number; paperSize: PaperSize }) {
  const frame = useRef<HTMLElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [near, setNear] = useState(number === 1);
  const [width, setWidth] = useState(0);
  const [rendered, setRendered] = useState(false);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [paperWidth, paperHeight] = paperSizePoints(paperSize);
  useEffect(() => {
    const element = frame.current!;
    const observer = new IntersectionObserver(entries => setNear(entries[0].isIntersecting), { rootMargin: '600px' });
    const resize = new ResizeObserver(() => setWidth(element.clientWidth));
    observer.observe(element); resize.observe(element); setWidth(element.clientWidth);
    return () => { observer.disconnect(); resize.disconnect(); };
  }, []);
  useEffect(() => {
    setRendered(false); setError(false);
    if (!near || !width) return;
    let active = true;
    let render: RenderTask | undefined;
    const surface = canvas.current!;
    void (async () => {
      try {
        const page = await document.getPage(number);
        if (!active) return;
        const viewport = page.getViewport({ scale: width / page.getViewport({ scale: 1 }).width * Math.min(window.devicePixelRatio || 1, 2) });
        surface.width = Math.ceil(viewport.width); surface.height = Math.ceil(viewport.height);
        render = page.render({ canvas: surface, viewport });
        await render.promise;
        if (active) setRendered(true);
      } catch { if (active) setError(true); }
    })();
    return () => { active = false; render?.cancel(); surface.width = 1; surface.height = 1; };
  }, [document, number, near, width, retry]);
  return <figure ref={frame} data-paper-page={number} data-rendered={rendered} data-paper-width={paperWidth} data-paper-height={paperHeight} className="relative m-0 w-full bg-white shadow-lg" style={{ aspectRatio: `${paperWidth} / ${paperHeight}` }}>
    <canvas ref={canvas} aria-hidden="true" className="absolute inset-0 block h-full w-full" style={{ visibility: rendered ? 'visible' : 'hidden' }} />
    {error ? <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center"><p role="alert" className="text-xs text-red-600">Unable to render page {number}.</p><button type="button" className="secondary-button" onClick={() => setRetry(value => value + 1)}>Retry page {number}</button></div> : null}
    <figcaption className="sr-only">Paper page {number} of {document.numPages}</figcaption>
  </figure>;
}

/** The preview uses the actual exported PDF's finite page boxes, never an expanding HTML sheet. */
export function ArchivedPaperPreview({ report, kind, category, paperSize, includeComments, children }: {
  report: ReturnType<typeof buildArchivedReport>;
  kind: ArchivedReportKind;
  category: SurveyType;
  paperSize: PaperSize;
  includeComments: boolean;
  children: ReactNode;
}) {
  const [document, setDocument] = useState<PDFDocumentProxy>();
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let loaded: PDFDocumentProxy | undefined;
    setDocument(undefined); setError('');
    void (async () => {
      try {
        const [blob] = await Promise.all([
          prepareArchivedPaper(report, kind, category, paperSize, includeComments),
          preparePdfRenderer(),
        ]);
        if (controller.signal.aborted) return;
        loaded = await loadPdfPreview(blob, controller.signal);
        if (controller.signal.aborted) { await loaded.loadingTask.destroy(); return; }
        setDocument(loaded);
      } catch { if (!controller.signal.aborted) setError('Unable to prepare the paper preview. Please retry.'); }
    })();
    return () => { controller.abort(); if (loaded) void loaded.loadingTask.destroy(); };
  }, [report, kind, category, paperSize, includeComments, retry]);
  return <div aria-label="Archived report preview" className="mx-auto w-full max-w-[640px]">
    {/* Keep the existing semantic headings/tables available to assistive technology. */}
    <div className="sr-only" style={{ width: paperSizePoints(paperSize)[0] }}>{children}</div>
    {error ? <div className="space-y-2"><p role="alert" className="text-sm text-red-600">{error}</p><button type="button" className="secondary-button" onClick={() => setRetry(value => value + 1)}>Retry preview</button></div> : document ? <div className="space-y-4" aria-label="Paper preview pages">{Array.from({ length: document.numPages }, (_, index) => <PaperPage key={index} document={document} number={index + 1} paperSize={paperSize} />)}</div> : <p role="status" className="text-xs text-slate-500">Preparing paper preview…</p>}
  </div>;
}
