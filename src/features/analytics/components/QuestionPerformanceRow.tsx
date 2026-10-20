import React from 'react';
import { formatNumber } from '../domain/analytics';
import { getValueColorBand } from '../domain/valueColorBand';

interface QuestionPerformanceRowProps {
  rank: number;
  question: string;
  average: number;
}

export function QuestionPerformanceRow({ rank, question, average }: QuestionPerformanceRowProps) {
  const boundedAverage = Math.max(0, Math.min(100, average));
  const scoreColors = {
    green: { bar: 'bg-green-500', text: 'text-green-700 dark:text-green-400' },
    yellow: { bar: 'bg-yellow-400', text: 'text-yellow-700 dark:text-yellow-400' },
    orange: { bar: 'bg-orange-500', text: 'text-orange-700 dark:text-orange-400' },
    red: { bar: 'bg-red-500', text: 'text-red-700 dark:text-red-400' },
  }[getValueColorBand(boundedAverage)];

  return (
    <li className="flex items-start gap-3 border-b border-slate-100 py-3 dark:border-slate-800">
      <span className="w-6 shrink-0 pt-0.5 text-center text-[11px] font-bold text-slate-400">{rank}</span>
      <span className="min-w-0 flex-1">
        <span className="block whitespace-normal break-words text-xs font-medium leading-5 text-slate-700 dark:text-slate-200">
          {question}
        </span>
        <span
          className="mt-2 block h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"
          role="progressbar"
          aria-label={`Average score for ${question}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={boundedAverage}
        >
          <span
            className={`block h-full rounded-full ${scoreColors.bar}`}
            style={{ width: `${boundedAverage}%` }}
          />
        </span>
      </span>
      <span className={`shrink-0 pt-0.5 text-xs font-bold tabular-nums ${scoreColors.text}`}>
        {formatNumber(average)}
      </span>
    </li>
  );
}
