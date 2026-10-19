import { useEffect, useMemo, useState } from 'react';
import { CalendarClock, ChevronDown, ChevronUp, ClipboardList, FilePlus, Search } from 'lucide-react';
import { SurveyResponse } from '../types/survey';
import { isScoredQuestion } from '../data/questionWeights';
import { submissionCount } from '../features/analytics/domain/analytics';
import { Pagination } from '../components/Pagination';

interface MySubmissionsPageProps {
  responses: SurveyResponse[];
  userEmail: string;
  onFillForm?: () => void;
}

const SUBMISSIONS_PAGE_SIZE = 10;

export function MySubmissionsPage({ responses, userEmail, onFillForm }: MySubmissionsPageProps) {
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(SUBMISSIONS_PAGE_SIZE);

  const mySubmissions = useMemo(() => {
    const mine = responses.filter((r) => r.respondentEmail?.trim().toLowerCase() === userEmail.trim().toLowerCase());
    const groups: Record<string, SurveyResponse[]> = {};
    mine.forEach((r) => {
      if (!groups[r.responseId]) groups[r.responseId] = [];
      groups[r.responseId].push(r);
    });
    return Object.values(groups).sort((a, b) => b[0].submissionDate.localeCompare(a[0].submissionDate));
  }, [responses, userEmail]);

  const filteredSubmissions = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return mySubmissions;
    return mySubmissions.filter((group) =>
      group[0].company.toLowerCase().includes(query) || group[0].surveyType.toLowerCase().includes(query)
    );
  }, [mySubmissions, search]);

  const totalPages = Math.max(1, Math.ceil(filteredSubmissions.length / pageSize));
  const paginatedSubmissions = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredSubmissions.slice(start, start + pageSize);
  }, [filteredSubmissions, currentPage, pageSize]);

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);

  const changePage = (page: number) => {
    setCurrentPage(page);
    setExpandedId(null);
  };

  return (
    <div className="space-y-5">
      <section className="panel flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-base font-semibold flex items-center gap-2">
            <ClipboardList size={18} className="text-[#0063a9] dark:text-blue-400" />
            My Submission History
          </h3>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Every evaluation you've submitted, newest first. {submissionCount(mySubmissions.flat())} counted.
          </p>
        </div>
        {onFillForm && (
          <button onClick={onFillForm} className="primary-button inline-flex items-center gap-2 shrink-0" type="button">
            <FilePlus size={16} />
            New Evaluation
          </button>
        )}
      </section>

      {mySubmissions.length > 0 && (
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by company or type..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setCurrentPage(1);
              setExpandedId(null);
            }}
            className="w-full pl-9 pr-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-[#0063a9] dark:focus:ring-blue-600"
          />
        </div>
      )}

      {mySubmissions.length === 0 ? (
        <div className="panel text-center py-14">
          <ClipboardList size={32} className="mx-auto mb-3 text-slate-300 dark:text-slate-700" />
          <p className="font-semibold text-slate-600 dark:text-slate-300">You haven't submitted any evaluations yet.</p>
          <p className="mt-1 text-sm text-slate-400">Once you fill out a survey, it'll show up here.</p>
        </div>
      ) : filteredSubmissions.length === 0 ? (
        <div className="panel text-center py-10 text-slate-500">No submissions match "{search}".</div>
      ) : (
        <div className="space-y-3">
          {paginatedSubmissions.map((group) => {
            const head = group[0];
            const isExpanded = expandedId === head.responseId;
            return (
              <div key={head.responseId} className="panel overflow-hidden">
                <button
                  type="button"
                  onClick={() => setExpandedId(isExpanded ? null : head.responseId)}
                  className="flex w-full flex-wrap items-center justify-between gap-3 text-left"
                >
                  <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
                    <div>
                      <p className="text-xs text-slate-500 font-medium">Company</p>
                      <p className="font-semibold text-slate-900 dark:text-slate-100">{head.company}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 font-medium">Survey Type</p>
                      <p className="font-semibold">{head.surveyType}</p>
                    </div>
                    <div className="flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400">
                      <CalendarClock size={14} />
                      {new Date(head.submissionDate).toLocaleString()}
                    </div>
                    <span className="text-xs font-semibold text-slate-400">{group.length} question{group.length === 1 ? '' : 's'} answered</span>
                  </div>
                  {isExpanded ? <ChevronUp size={18} className="text-slate-400 shrink-0" /> : <ChevronDown size={18} className="text-slate-400 shrink-0" />}
                </button>

                {isExpanded && (
                  <div className="mt-4 space-y-4 border-t border-slate-100 dark:border-slate-800 pt-4">
                    {group.map((ans) => (
                      <div key={ans.questionId} className="border-l-2 border-[#0063a9] dark:border-blue-500 pl-4">
                        <p className="text-sm text-slate-500 dark:text-slate-400 mb-1">{ans.questionCategory} - Q{ans.questionNumber}</p>
                        <p className="font-medium text-slate-900 dark:text-slate-100 mb-2">{ans.question}</p>
                        <div className="bg-slate-50 dark:bg-slate-900/50 p-3 rounded-lg flex items-center gap-2">
                          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Answer:</span>
                          <span className="font-bold text-[#0063a9] dark:text-blue-400">
                            {isScoredQuestion(ans.surveyType, ans.questionId) ? ans.rating : (ans.comment || 'N/A')}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {filteredSubmissions.length > 0 && (
            <Pagination page={currentPage} pageSize={pageSize} totalItems={filteredSubmissions.length}
              onPageChange={changePage} onPageSizeChange={(size) => { setPageSize(size); setCurrentPage(1); setExpandedId(null); }}
              ariaLabel="Submission history pagination" />
          )}
        </div>
      )}
    </div>
  );
}
