import { buildArchiveAnalyticsVisuals, type ArchiveAnalyticsData } from '../domain/archiveAnalyticsVisuals';
import type { ExportVisual } from './workbookVisuals';

export async function createArchiveAnalyticsImages(analytics: ArchiveAnalyticsData[]): Promise<ExportVisual[]> {
  const images: ExportVisual[] = [];
  for (const page of buildArchiveAnalyticsVisuals(analytics)) {
    const url = URL.createObjectURL(new Blob([page.svg], { type: 'image/svg+xml;charset=utf-8' }));
    try {
      const image = new Image();
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error('Unable to render archive Analytics. Please retry the export.'));
        image.src = url;
      });
      const canvas = document.createElement('canvas');
      canvas.width = page.width * 2;
      canvas.height = page.height * 2;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('This browser cannot render the archive charts.');
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      images.push({ title: page.title, width: page.width, height: page.height, placement: page.placement, description: page.description, continuation: page.continuation, dataUrl: canvas.toDataURL('image/png') });
    } finally { URL.revokeObjectURL(url); }
  }
  return images;
}
