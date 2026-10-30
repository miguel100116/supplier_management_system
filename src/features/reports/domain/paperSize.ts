export const PAPER_SIZES = {
  a4: { label: 'A4 (210 × 297 mm)', width: 595.28, height: 841.89 },
  letter: { label: 'Letter (8.5 × 11 in)', width: 612, height: 792 },
  legal: { label: 'Legal (8.5 × 14 in)', width: 612, height: 1008 },
  'long-bond': { label: 'Long Bond (8.5 × 13 in)', width: 612, height: 936 },
} as const;

export type PaperSize = keyof typeof PAPER_SIZES;
export function isPaperSize(value: unknown): value is PaperSize {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(PAPER_SIZES, value);
}
export function paperSizePoints(size: PaperSize = 'a4'): [number, number] {
  if (!isPaperSize(size)) throw new Error('Invalid paper size.');
  return [PAPER_SIZES[size].width, PAPER_SIZES[size].height];
}
export function paperSizeTwips(size: PaperSize = 'a4') {
  const [width, height] = paperSizePoints(size);
  return { width: Math.round(width * 20), height: Math.round(height * 20) };
}
