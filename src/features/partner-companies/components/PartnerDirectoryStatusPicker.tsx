import { useId, useRef, useState } from 'react';

export interface PartnerDirectoryStatusOption {
  value: string;
  label: string;
  className: string;
}

interface PartnerDirectoryStatusPickerProps {
  label: string;
  value: string;
  selectedValue?: string;
  triggerClassName: string;
  options: readonly PartnerDirectoryStatusOption[];
  onChange: (value: string) => void;
}

export function PartnerDirectoryStatusPicker({ label, value, selectedValue = value, triggerClassName, options, onChange }: PartnerDirectoryStatusPickerProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listboxId = useId();

  const closeWhenPointerLeaves = () => {
    if (!rootRef.current?.contains(document.activeElement)) setOpen(false);
  };

  return (
    <div
      ref={rootRef}
      className="relative z-0 inline-flex hover:z-40 focus-within:z-40"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={closeWhenPointerLeaves}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && open) {
          event.preventDefault();
          setOpen(false);
          triggerRef.current?.focus();
        }
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-label={`${label}: ${value}`}
        aria-haspopup="listbox"
        aria-controls={listboxId}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        onFocus={() => setOpen(true)}
        className={`${triggerClassName} cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2187CD]`}
      >
        {value}
      </button>
      {open && (
        <div id={listboxId} role="listbox" aria-label={label} className="absolute left-0 top-full z-50 min-w-full rounded-md border border-slate-200 bg-white p-1 shadow-lg dark:border-slate-700 dark:bg-slate-900">
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={option.value === selectedValue}
              onClick={() => { onChange(option.value); setOpen(false); }}
              className={`flex min-h-8 w-full items-center whitespace-nowrap rounded px-2 text-left text-xs hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#2187CD] dark:hover:bg-slate-800 ${option.className}`}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
