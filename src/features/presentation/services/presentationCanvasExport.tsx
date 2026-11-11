import { createElement, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import html2canvas from 'html2canvas';
import type { Slide } from '../domain/presentation';

export const PRESENTATION_CANVAS_WIDTH = 1280;
export const PRESENTATION_CANVAS_HEIGHT = 720;

/**
 * A single in-app leaderboard page is expanded only for file exports. The
 * interactive deck and its slide tracker keep their original slide count.
 */
export function expandSlidesForExport(slides: Slide[]): Slide[] {
  const categoryOrder = ['Courier', 'Supplier', 'Subcontractor'];
  return slides.flatMap((slide) => {
    if (slide.kind !== 'leaderboard' || slide.groups.length === 0) return [slide];

    return [...slide.groups]
      .sort((left, right) => categoryOrder.indexOf(left.surveyType) - categoryOrder.indexOf(right.surveyType))
      .map((group) => ({ ...slide, groups: [group] }));
  });
}

/** Render the actual React slide canvas and capture it for pixel-matched exports. */
export async function capturePresentationSlides(
  slides: Slide[],
  renderSlide: (slide: Slide) => ReactNode,
  styleContext: HTMLElement,
): Promise<string[]> {
  const host = document.createElement('div');
  const hostId = `presentation-export-${crypto.randomUUID()}`;
  host.id = hostId;
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText = [
    'position:fixed',
    'left:0',
    'top:0',
    `width:${PRESENTATION_CANVAS_WIDTH}px`,
    `height:${PRESENTATION_CANVAS_HEIGHT}px`,
    'overflow:hidden',
    'opacity:0',
    'z-index:-1',
    'pointer-events:none',
    'background:#ffffff',
  ].join(';');
  styleContext.append(host);

  const root = createRoot(host);
  try {
    const images: string[] = [];
    for (const slide of expandSlidesForExport(slides)) {
      flushSync(() => {
        root.render(createElement('div', {
          style: {
            width: PRESENTATION_CANVAS_WIDTH,
            height: PRESENTATION_CANVAS_HEIGHT,
            overflow: 'hidden',
          },
        }, renderSlide(slide)));
      });

      if (document.fonts?.ready) await document.fonts.ready;
      await Promise.all([...host.querySelectorAll('img')].map((image) => image.decode()));
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

      const canvas = await html2canvas(host, {
        width: PRESENTATION_CANVAS_WIDTH,
        height: PRESENTATION_CANVAS_HEIGHT,
        scale: 2,
        foreignObjectRendering: true,
        backgroundColor: '#ffffff',
        useCORS: true,
        logging: false,
        onclone: (clonedDocument) => {
          const clone = clonedDocument.getElementById(hostId);
          if (clone instanceof HTMLElement) {
            clone.style.opacity = '1';
            clone.style.zIndex = '2147483647';
          }
          const motionStyles = clonedDocument.createElement('style');
          motionStyles.textContent = '* { animation: none !important; transition: none !important; }';
          clonedDocument.head.append(motionStyles);
        },
      });
      images.push(canvas.toDataURL('image/jpeg', 0.96));
    }
    return images;
  } finally {
    root.unmount();
    host.remove();
  }
}
