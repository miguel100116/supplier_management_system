import { useMemo, useState } from 'react';
import { SurveyResponse } from '../types/survey';
import { TableFilterBar } from './TableFilterBar';
import { compareDate, compareText, isWithinDateRange } from '../utils/tableFilters';

interface ResponseTableProps {
  responses: SurveyResponse[];
}

export function ResponseTable({ responses }: ResponseTableProps) {
  const [search, setSearch] = useState('');
  const [tableSort, setTableSort] = useState<'date-desc' | 'date-asc' | 'company-asc' | 'company-desc'>('date-desc');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const filteredResponses = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return responses
      .filter((response) => {
        if (!isWithinDateRange(response.submissionDate, dateFrom, dateTo)) return false;
        if (!needle) return true;
        return `${response.responseId} ${response.surveyType} ${response.company} ${response.question} ${response.comment ?? ''}`.toLowerCase().includes(needle);
      })
      .sort((a, b) => {
        if (tableSort === 'date-asc') return compareDate(a.submissionDate, b.submissionDate);
        if (tableSort === 'company-asc') return compareText(a.company, b.company);
        if (tableSort === 'company-desc') return compareText(b.company, a.company);
        return compareDate(b.submissionDate, a.submissionDate);
      });
  }, [responses, search, tableSort, dateFrom, dateTo]);
  const visibleResponses = filteredResponses.slice(0, 80);

  return (
    <section className="panel overflow-hidden">
      <div className="mb-4 flex flex-col gap-2 min-[420px]:flex-row min-[420px]:items-center min-[420px]:justify-between">
        <div>
          <h3 className="text-base font-semibold">Response Table</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">Showing {visibleResponses.length} of {filteredResponses.length} matching records</p>
        </div>
      </div>
      <div className="mb-4">
        <TableFilterBar
          sortOptions={[
            { value: 'date-desc', label: 'Date: newest first' },
            { value: 'date-asc', label: 'Date: oldest first' },
            { value: 'company-asc', label: 'Partner: A–Z' },
            { value: 'company-desc', label: 'Partner: Z–A' },
          ]}
          sortValue={tableSort}
          onSortChange={setTableSort}
          resultCount={filteredResponses.length}
          dateFrom={dateFrom}
          dateTo={dateTo}
          onDateFromChange={setDateFrom}
          onDateToChange={setDateTo}
          dateLabel="Submission date"
          onReset={() => {
            setSearch('');
            setTableSort('date-desc');
            setDateFrom('');
            setDateTo('');
          }}
        >
          <label className="min-w-[190px] flex-1 sm:flex-none">
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Search</span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Partner, evaluation, question…"
              className="field !mt-0 w-full py-2 text-xs sm:w-[220px]"
            />
          </label>
        </TableFilterBar>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-[760px] text-left text-sm">
          <thead className="border-b border-slate-200 text-xs uppercase text-slate-500 dark:border-slate-800 dark:text-slate-400">
            <tr>
              <th className="px-3 py-3">Response ID</th>
              <th className="px-3 py-3">Evaluation</th>
              <th className="px-3 py-3">Date</th>
              <th className="px-3 py-3">Partner</th>
              <th className="px-3 py-3">Question</th>
              <th className="px-3 py-3">Rating</th>
              <th className="px-3 py-3">Comment</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {visibleResponses.map((response) => (
              <tr key={response.responseId} className="hover:bg-slate-50 dark:hover:bg-slate-900">
                <td className="whitespace-nowrap px-3 py-3 font-medium">{response.responseId}</td>
                <td className="px-3 py-3">{response.surveyType}</td>
                <td className="whitespace-nowrap px-3 py-3">{response.submissionDate.slice(0, 10)}</td>
                <td className="whitespace-nowrap px-3 py-3">{response.company}</td>
                <td className="min-w-64 px-3 py-3">{response.question}</td>
                <td className="px-3 py-3">
                  <span className="badge">{response.rating}</span>
                </td>
                <td className="min-w-72 px-3 py-3 text-slate-500 dark:text-slate-400">{response.comment}</td>
              </tr>
            ))}
            {visibleResponses.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-10 text-center text-slate-400">No responses match the selected filters.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
