export type ValueColorBand = 'green' | 'yellow' | 'orange' | 'red';

export function getValueColorBand(value: number): ValueColorBand {
  if (value >= 90) return 'green';
  if (value >= 80) return 'yellow';
  if (value >= 70) return 'orange';
  return 'red';
}
