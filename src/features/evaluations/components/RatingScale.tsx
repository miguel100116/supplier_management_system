import React, { KeyboardEvent } from 'react';
import { Rating } from '../../../types/survey';

interface RatingScaleProps {
  questionId: string;
  questionOrder: number;
  min: number;
  max: number;
  allowNa: boolean;
  value: Rating | undefined;
  onChange: (value: Rating) => void;
  label: string;
}

/** Compact, keyboard-accessible rating selector shared by numeric rating questions. */
export function RatingScale({ questionId, questionOrder, min, max, allowNa, value, onChange, label }: RatingScaleProps) {
  const values: Rating[] = [
    ...Array.from({ length: Math.max(0, max - min + 1) }, (_, index) => min + index),
    ...(allowNa ? ['N/A' as const] : []),
  ];
  const current = value == null ? '' : String(value);
  const selected = values.find((option) => String(option) === current);
  const tabStop = selected ?? values[0];

  const focusOption = (option: Rating) => {
    requestAnimationFrame(() => document.getElementById(`rating-btn-${questionId}-${option}`)?.focus());
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, option: Rating) => {
    const index = values.findIndex((item) => String(item) === String(option));
    let next: Rating | undefined;

    if (/^[0-9]$/.test(event.key)) next = values.find((item) => item === Number(event.key));
    else if ((event.key === 'n' || event.key === 'N') && allowNa) next = 'N/A';
    else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = values[Math.min(values.length - 1, index + 1)];
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = values[Math.max(0, index - 1)];
    else if (event.key === 'Enter') {
      event.preventDefault();
      requestAnimationFrame(() => {
        const nextQuestion = document.querySelector<HTMLElement>(`[data-question-order="${questionOrder + 1}"]`);
        nextQuestion?.querySelector<HTMLElement>('[tabindex="0"], input, select, textarea, button:not([tabindex="-1"])')?.focus();
      });
      return;
    }

    if (next !== undefined) {
      event.preventDefault();
      onChange(next);
      focusOption(next);
    }
  };

  return (
    <div className="rating-scale-shell">
      <div className="rating-options" role="radiogroup" aria-label={label}>
        {values.map((option) => {
          const isSelected = String(selected) === String(option);
          return (
            <button
              key={option}
              id={`rating-btn-${questionId}-${option}`}
              type="button"
              role="radio"
              aria-checked={isSelected}
              aria-label={option === 'N/A' ? 'Not applicable' : String(option)}
              tabIndex={tabStop === option ? 0 : -1}
              onClick={() => onChange(option)}
              onKeyDown={(event) => handleKeyDown(event, option)}
              className={`rating-option${isSelected ? ' selected' : ''}${option === 'N/A' ? ' not-applicable' : ''}`}
            >
              {option}
              {option === 'N/A' && <span className="rating-option-description">Not applicable</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
