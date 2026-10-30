import { PAPER_SIZES, isPaperSize, type PaperSize } from '../domain/paperSize';

export function PaperSizeSelect({ value, onChange, disabled = false }: { value: PaperSize; onChange: (value: PaperSize) => void; disabled?: boolean }) {
  return <label className="flex min-w-0 flex-col gap-1 text-xs font-semibold text-slate-600 dark:text-slate-300">Paper size
    <select className="field max-w-full text-xs" value={value} disabled={disabled} onChange={event => {
      if (isPaperSize(event.target.value)) onChange(event.target.value);
    }}>{Object.entries(PAPER_SIZES).map(([key, option]) => <option key={key} value={key}>{option.label}</option>)}</select>
  </label>;
}
