import { jsPDF } from 'jspdf';
import { PRESENTATION_CANVAS_HEIGHT, PRESENTATION_CANVAS_WIDTH } from './presentationCanvasExport';

/** Preserve the exact in-app slide canvas instead of approximating it with a separate PDF layout. */
export async function exportSlidesAsPDF(slideImages: string[], deckTitle: string) {
  const doc = new jsPDF({
    unit: 'pt',
    format: [PRESENTATION_CANVAS_WIDTH, PRESENTATION_CANVAS_HEIGHT],
    orientation: 'landscape',
    compress: true,
  });

  slideImages.forEach((image, index) => {
    if (index > 0) doc.addPage([PRESENTATION_CANVAS_WIDTH, PRESENTATION_CANVAS_HEIGHT], 'landscape');
    doc.addImage(image, 'JPEG', 0, 0, PRESENTATION_CANVAS_WIDTH, PRESENTATION_CANVAS_HEIGHT, undefined, 'FAST');
  });

  const filename = `${deckTitle.replace(/[^a-z0-9]+/gi, '_').toLowerCase() || 'presentation'}_${new Date()
    .toISOString()
    .slice(0, 10)}.pdf`;
  doc.save(filename);
}
