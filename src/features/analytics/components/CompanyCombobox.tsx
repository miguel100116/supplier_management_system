import { type KeyboardEvent, type ReactNode, useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';

interface CompanyComboboxProps {
  idPrefix: string;
  label: string;
  placeholder: string;
  icon: ReactNode;
  tone: 'primary' | 'compare';
  options: string[];
  selectedValue: string | null;
  query: string;
  onQueryChange: (query: string) => void;
  onSelect: (company: string) => void;
  onClearSelection: () => void;
}

const toneStyles = {
  primary: {
    focus: 'focus:border-[#0866B1] dark:focus:border-blue-500',
    active: 'bg-blue-50 text-[#0866B1] dark:bg-blue-950/40 dark:text-blue-300',
  },
  compare: {
    focus: 'focus:border-orange-500 dark:focus:border-orange-400',
    active: 'bg-orange-50 text-orange-600 dark:bg-orange-950/40 dark:text-orange-300',
  },
} as const;

export function CompanyCombobox({
  idPrefix,
  label,
  placeholder,
  icon,
  tone,
  options,
  selectedValue,
  query,
  onQueryChange,
  onSelect,
  onClearSelection,
}: CompanyComboboxProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const styles = toneStyles[tone];
  const listboxId = `${idPrefix}-listbox`;

  useEffect(() => {
    setActiveIndex((current) => Math.min(current, Math.max(options.length - 1, 0)));
  }, [options.length]);

  const selectOption = (company: string) => {
    onSelect(company);
    onQueryChange(company);
    setIsOpen(false);
  };

  const clearSelection = () => {
    onClearSelection();
    onQueryChange('');
    setActiveIndex(0);
    setIsOpen(true);
    inputRef.current?.focus();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      setIsOpen(false);
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
        setActiveIndex(event.key === 'ArrowDown' ? 0 : Math.max(options.length - 1, 0));
        return;
      }
      const direction = event.key === 'ArrowDown' ? 1 : -1;
      setActiveIndex(options.length ? (activeIndex + direction + options.length) % options.length : 0);
      return;
    }
    if (event.key === 'Enter' && isOpen && options[activeIndex]) {
      event.preventDefault();
      selectOption(options[activeIndex]);
    }
  };

  return (
    <div className="relative w-full">
      <div className="relative">
        {icon}
        <input
          ref={inputRef}
          type="text"
          value={isOpen ? query : (selectedValue || query)}
          onFocus={() => {
            setIsOpen(true);
            setActiveIndex(0);
            if (selectedValue) onQueryChange('');
          }}
          onChange={(event) => {
            onQueryChange(event.target.value);
            setIsOpen(true);
            setActiveIndex(0);
            if (selectedValue) onClearSelection();
          }}
          onKeyDown={handleKeyDown}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={isOpen}
          aria-controls={listboxId}
          aria-activedescendant={isOpen && options[activeIndex] ? `${idPrefix}-option-${activeIndex}` : undefined}
          aria-label={label}
          placeholder={placeholder}
          className={`w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-9 pr-9 text-sm text-slate-700 outline-none transition-colors dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200 ${styles.focus}`}
        />
        {(selectedValue || query) && (
          <button
            type="button"
            onClick={clearSelection}
            className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            aria-label={`Clear ${label.toLowerCase()}`}
          >
            <X size={15} />
          </button>
        )}
      </div>

      {isOpen && (
        <div id={listboxId} role="listbox" className="absolute z-20 mt-1.5 max-h-64 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-800 dark:bg-slate-950">
          {options.length === 0 ? (
            <p className="px-3 py-3 text-center text-sm text-slate-400 dark:text-slate-500">No matching partners.</p>
          ) : (
            options.map((company, optionIndex) => (
              <button
                key={company}
                id={`${idPrefix}-option-${optionIndex}`}
                type="button"
                role="option"
                aria-selected={company === selectedValue}
                tabIndex={-1}
                onMouseEnter={() => setActiveIndex(optionIndex)}
                onClick={() => selectOption(company)}
                className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors ${
                  company === selectedValue || options[activeIndex] === company
                    ? `${styles.active} font-semibold`
                    : 'text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-900'
                }`}
              >
                <span className="truncate">{company}</span>
              </button>
            ))
          )}
        </div>
      )}

      {isOpen && <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} aria-hidden="true" />}
    </div>
  );
}
