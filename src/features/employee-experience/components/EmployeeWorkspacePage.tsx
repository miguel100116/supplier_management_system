import { useMemo, useState } from 'react';
import { ArrowRight, Check, ClipboardList, FileText, History, LockKeyhole, Search } from 'lucide-react';
import type { CustomForm, PartnerCompany, SurveyResponse, SurveyType } from '../../../types/survey';
import { useModalEscape } from '../../../hooks/useModalEscape';
import { filterPendingEvaluations, getPendingEmployeeEvaluations, type EmployeeEvaluationFilter } from '../domain/pendingEvaluations';
import { EmployeeCompanyIcon } from './EmployeeCompanyIcon';
import { Pagination } from '../../../components/Pagination';
import { WorkspaceWelcomeBanner } from '../../../components/WorkspaceWelcomeBanner';

type WorkspaceView = 'Home' | 'Evaluations' | 'My submissions';
type SubmissionItem = { id: string; company: string; type: SurveyType; date: string; answers: { question: string; answer: string }[] };

interface EmployeeWorkspacePageProps {
  view: WorkspaceView;
  surveys: CustomForm[];
  partnerCompanies: PartnerCompany[];
  responses: SurveyResponse[];
  userEmail: string;
  isLoading: boolean;
  error: string | null;
  onNavigate: (view: WorkspaceView) => void;
  onStartEvaluation: (surveyId: string, companyName: string) => void;
  initialEvaluationFilter?: EmployeeEvaluationFilter;
  onEvaluationFilterChange?: (filter: EmployeeEvaluationFilter) => void;
}

function formatDate(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 'Date unavailable' : parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function getFirstNameFromEmail(email: string) {
  const localPart = email.trim().split('@')[0] ?? '';
  const firstName = localPart.split(/[._+-]/)[0]?.replace(/\d+$/, '').trim();
  if (!firstName) return '';
  return firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase();
}

function formatDateTime(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 'Date unavailable' : parsed.toLocaleString();
}

export function EmployeeWorkspacePage({ view, surveys, partnerCompanies, responses, userEmail, isLoading, error, onNavigate, onStartEvaluation, initialEvaluationFilter, onEvaluationFilterChange }: EmployeeWorkspacePageProps) {
  const [filter, setFilter] = useState<'All evaluations' | SurveyType>('All evaluations');
  const [localEvaluationFilter, setLocalEvaluationFilter] = useState<EmployeeEvaluationFilter>(initialEvaluationFilter ?? 'All evaluations');
  const evaluationFilter = initialEvaluationFilter ?? localEvaluationFilter;
  const [search, setSearch] = useState('');
  const [detail, setDetail] = useState<SubmissionItem | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [evaluationPage, setEvaluationPage] = useState(1);
  const [evaluationPageSize, setEvaluationPageSize] = useState(10);
  const [historyPageSize, setHistoryPageSize] = useState(10);
  useModalEscape(Boolean(detail), () => setDetail(null));

  const evaluations = useMemo(() => getPendingEmployeeEvaluations(surveys, partnerCompanies, responses, userEmail), [partnerCompanies, responses, surveys, userEmail]);
  const categoryEvaluations = useMemo(() => filterPendingEvaluations(evaluations, evaluationFilter), [evaluations, evaluationFilter]);
  const categoryCounts = useMemo(() => {
    const counts: Record<SurveyType, number> = { Courier: 0, Supplier: 0, Subcontractor: 0 };
    evaluations.forEach(({ type }) => { counts[type] += 1; });
    return counts;
  }, [evaluations]);
  const visibleEvaluations = useMemo(() => filterPendingEvaluations(evaluations, evaluationFilter, search), [evaluations, evaluationFilter, search]);
  const evaluationPageCount = Math.max(1, Math.ceil(visibleEvaluations.length / evaluationPageSize));
  const activeEvaluationPage = Math.min(evaluationPage, evaluationPageCount);
  const pagedEvaluations = visibleEvaluations.slice(
    (activeEvaluationPage - 1) * evaluationPageSize,
    activeEvaluationPage * evaluationPageSize,
  );
  const groupedSubmissions = useMemo(() => {
    const byResponseId = new Map<string, SurveyResponse[]>();
    responses
      .filter((response) => response.respondentEmail?.trim().toLowerCase() === userEmail.trim().toLowerCase())
      .forEach((response) => {
        const items = byResponseId.get(response.responseId) ?? [];
        items.push(response);
        byResponseId.set(response.responseId, items);
      });
    return [...byResponseId.entries()]
      .map(([id, rows]) => ({
        id,
        company: rows[0].company,
        type: rows[0].surveyType,
        date: rows[0].submissionDate,
        answers: rows.map((answer) => ({
          question: answer.question,
          answer: typeof answer.rating === 'number' ? String(answer.rating) : answer.comment || String(answer.rating || 'N/A'),
        })),
      }))
      .sort((left, right) => right.date.localeCompare(left.date));
  }, [responses, userEmail]);

  const visibleSubmissions = groupedSubmissions.filter((item) =>
    (filter === 'All evaluations' || item.type === filter) &&
    `${item.company} ${item.type}`.toLowerCase().includes(search.trim().toLowerCase()),
  );
  const pageSize = historyPageSize;
  const pageCount = Math.max(1, Math.ceil(visibleSubmissions.length / pageSize));
  const pagedSubmissions = visibleSubmissions.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const visibleEvaluationRows = view === 'Home' ? categoryEvaluations.slice(0, 3) : pagedEvaluations;
  const recentSubmissions = groupedSubmissions.slice(0, 3);
  const pageDescription = view === 'Home'
    ? 'Your next evaluation starts here. Let’s make every partnership better.'
    : view === 'Evaluations'
      ? 'Find a partner and share feedback on your experience.'
      : 'A clear record of the evaluations you’ve completed.';
  const firstName = getFirstNameFromEmail(userEmail);
  const pendingCount = categoryEvaluations.length;
  const categoryLabel = evaluationFilter === 'All evaluations' ? 'evaluation' : `${evaluationFilter.toLowerCase()} evaluation`;
  const countLabel = `${pendingCount} pending ${categoryLabel}${pendingCount === 1 ? '' : 's'}${evaluationFilter === 'All evaluations' ? ' across all categories' : ''}`;
  const updateEvaluationFilter = (nextFilter: EmployeeEvaluationFilter) => {
    setLocalEvaluationFilter(nextFilter);
    onEvaluationFilterChange?.(nextFilter);
    setEvaluationPage(1);
  };
  const emptyTitle = search.trim()
    ? 'No matching evaluations'
    : pendingCount === 0 && evaluationFilter !== 'All evaluations' && evaluations.length > 0
      ? `No pending ${evaluationFilter.toLowerCase()} evaluations`
      : pendingCount === 0
        ? 'You’re all caught up'
        : 'No matching evaluations';
  const emptyDescription = search.trim()
    ? 'Try another partner name or evaluation title.'
    : pendingCount === 0 && evaluationFilter !== 'All evaluations' && evaluations.length > 0
      ? `${evaluations.length} pending evaluation${evaluations.length === 1 ? '' : 's'} remain across other categories.`
      : 'There are no pending evaluations available to you right now.';
  const summaryText = isLoading
    ? 'Loading pending evaluations.'
    : error
      ? 'The current evaluation count is unavailable.'
      : pendingCount === 0
        ? emptyDescription
        : view === 'Home'
          ? `Showing up to 3 pending${evaluationFilter === 'All evaluations' ? '' : ` ${evaluationFilter.toLowerCase()}`} evaluations, nearest due first.`
          : `${countLabel}. Search by partner name or evaluation title.`;

  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">YOUR PERSONAL WORKSPACE</div>
          <h1>{view === 'Home' ? `Good to see you${firstName ? `, ${firstName}` : ''}.` : view}</h1>
          <p>{pageDescription}</p>
        </div>
        {view === 'My submissions' && <button className="primary-button" type="button" onClick={() => onNavigate('Evaluations')}>Browse evaluations <ArrowRight size={17} /></button>}
      </div>

      {view === 'Home' && (
        <WorkspaceWelcomeBanner
          eyebrow="YOUR EXPERIENCE MATTERS"
          title={<>Better partners.<br />Better work, together.</>}
          description={<>Your feedback helps us understand the partners<br className="desktop-break" /> we work with. Start with an evaluation below.</>}
          actionLabel="Explore your evaluations"
          onAction={() => onNavigate('Evaluations')}
        />
      )}

      {view !== 'My submissions' && (
        <div className={view === 'Home' ? 'content-grid' : view === 'Evaluations' ? 'single-content evaluations-view' : 'single-content'}>
          <div className="primary-column">
            <section className="panel evaluations-panel">
              <div className="panel-heading">
                <div><h2>{view === 'Home' ? 'Ready for your feedback' : 'Available evaluations'}<span className="quiet-count" aria-label={isLoading || error ? 'Pending evaluation count unavailable' : countLabel} title={isLoading || error ? 'Pending evaluation count unavailable' : countLabel}>{isLoading || error ? '—' : pendingCount}</span></h2><p>{summaryText}</p></div>
                {view === 'Home' && <button className="text-button" type="button" aria-label={isLoading || error ? 'View all evaluations' : `View all ${countLabel}`} onClick={() => onNavigate('Evaluations')}>View all <ArrowRight size={16} /></button>}
              </div>
              <div className="list-tools">
                <div className="filter-tabs" role="group" aria-label="Filter evaluations by type">
                  {(['All evaluations', 'Courier', 'Supplier', 'Subcontractor'] as const).map((type) => <button key={type} type="button" className={evaluationFilter === type ? 'selected' : ''} aria-pressed={evaluationFilter === type} aria-label={type === 'All evaluations' ? type : `${type}: ${isLoading || error ? 'count unavailable' : `${categoryCounts[type]} pending`}`} onClick={() => updateEvaluationFilter(type)}>{type}{type !== 'All evaluations' && <span className="filter-count" aria-hidden="true">{isLoading || error ? '—' : categoryCounts[type]}</span>}</button>)}
                </div>
                {view === 'Evaluations' ? <label className="search-field"><Search size={17} /><input aria-label="Search partner or evaluation title" placeholder="Search partner or evaluation title…" value={search} onChange={(event) => { setSearch(event.target.value); setEvaluationPage(1); }} /></label> : <span className="list-access"><LockKeyhole size={12} /> Available to you</span>}
              </div>
              {isLoading ? <div className="empty-state" role="status"><ClipboardList size={30} /><h3>Loading evaluations</h3><p>Your available forms will appear here.</p></div>
                : error ? <div className="empty-state" role="alert"><ClipboardList size={30} /><h3>Evaluations are unavailable</h3><p>We couldn’t load your evaluation information.</p></div>
                  : <div className="evaluation-list">
                    {visibleEvaluationRows.map((item) => <div className="evaluation-row" key={item.id}>
                      <div className={`company-avatar ${item.type === 'Courier' ? 'avatar-blue' : 'avatar-purple'}`}><EmployeeCompanyIcon type={item.type} size={23} /></div>
                      <div className="evaluation-text"><div className="company-line"><h3><button className="company-name-button" type="button" aria-label={`Start ${item.type.toLowerCase()} evaluation for ${item.company}`} onClick={() => onStartEvaluation(item.surveyId, item.company)}>{item.company}</button></h3><span className={`type-tag ${item.type.toLowerCase()}`}>{item.type}</span></div><p>{item.title}{item.deadline && <span className="evaluation-deadline"> · Due {item.deadline.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>}</p></div>
                      <button className="start-button" type="button" aria-label={`Start ${item.type.toLowerCase()} evaluation for ${item.company}`} onClick={() => onStartEvaluation(item.surveyId, item.company)}>Start evaluation <ArrowRight size={16} /></button>
                    </div>)}
                    {visibleEvaluationRows.length === 0 && <div className="empty-state" role="status"><ClipboardList size={30} /><h3>{emptyTitle}</h3><p>{emptyDescription}</p>{(evaluationFilter !== 'All evaluations' || search.trim()) && <button className="text-button" type="button" onClick={() => { updateEvaluationFilter('All evaluations'); setSearch(''); setEvaluationPage(1); }}>{view === 'Home' && evaluationFilter !== 'All evaluations' ? 'View all categories' : 'Clear filters'}</button>}</div>}
                  </div>}
              {!isLoading && !error && view === 'Evaluations' && visibleEvaluations.length > 0 && <Pagination page={activeEvaluationPage} pageSize={evaluationPageSize} totalItems={visibleEvaluations.length} onPageChange={setEvaluationPage} onPageSizeChange={(size) => { setEvaluationPageSize(size); setEvaluationPage(1); }} ariaLabel="Evaluation pages" showPageControls={evaluationPageCount > 1 || evaluationPageSize !== 10} verticalPadding="comfortable" className="mt-6 px-[17px] min-[561px]:px-5" />}
              {view === 'Home' && <div className="panel-footnote"><LockKeyhole size={14} /> Only evaluations available to you appear here.</div>}
            </section>
            {view === 'Home' && <section className="panel recent-panel">
              <div className="panel-heading"><div><h2>Recently submitted</h2><p>Your feedback, safely in the record.</p></div><button className="text-button" type="button" onClick={() => onNavigate('My submissions')}>View history <ArrowRight size={16} /></button></div>
              <HistoryRows items={recentSubmissions} onSelect={setDetail} compact />
            </section>}
          </div>

          {view === 'Home' && <aside className="context-column">
            <section className="how-it-works"><div className="section-kicker"><ClipboardList size={17} /> SIMPLE BY DESIGN</div><h2>A few steps.<br />A meaningful difference.</h2>
              {[['Choose your partner', 'Find the company you’ve worked with.'], ['Share your experience', 'Answer the evaluation honestly and thoughtfully.'], ['Review and submit', 'Check your answers before submitting.']].map(([heading, description], index) => <div className="guide-step" key={heading}><span>{index + 1}</span><div><h4>{heading}</h4><p>{description}</p></div></div>)}
              <button className="guide-link" type="button" onClick={() => onNavigate('Evaluations')}>Browse evaluations <ArrowRight size={15} /></button>
            </section>
            <section className="history-callout"><span className="callout-icon"><History size={21} /></span><h3>Already shared feedback?</h3><p>Find your previous evaluations and revisit what you submitted.</p><button className="text-button" type="button" onClick={() => onNavigate('My submissions')}>Go to my submissions <ArrowRight size={15} /></button></section>
          </aside>}
        </div>
      )}

      {view === 'My submissions' && <section className="panel employee-history-panel">
        <div className="panel-heading"><div><h2>Your submission history</h2><p>Personal submissions, newest first.</p></div><span className="record-count">{groupedSubmissions.length} submissions</span></div>
        <div className="history-tools"><label className="search-field"><Search size={17} /><input aria-label="Search submissions" placeholder="Search by company or evaluation type…" value={search} onChange={(event) => { setSearch(event.target.value); setCurrentPage(1); }} /></label>
          <select aria-label="Filter submission type" value={filter} onChange={(event) => { setFilter(event.target.value as typeof filter); setCurrentPage(1); }}><option>All evaluations</option><option>Courier</option><option>Supplier</option><option>Subcontractor</option></select>
        </div>
        <div className="history-table-head"><span>PARTNER &amp; EVALUATION</span><span>SUBMITTED</span><span>STATUS</span></div>
        {isLoading ? <div className="empty-state" role="status"><History size={30} /><h3>Loading submissions</h3></div>
          : error ? <div className="empty-state" role="alert"><History size={30} /><h3>Submissions are unavailable</h3><p>We couldn’t load your submission history.</p></div>
            : <HistoryRows items={pagedSubmissions} onSelect={setDetail} />}
        {!isLoading && !error && !visibleSubmissions.length && <div className="empty-state"><History size={30} /><h3>{groupedSubmissions.length ? 'No submissions found' : 'No submissions yet'}</h3><p>{groupedSubmissions.length ? 'Try another search or clear your filters.' : 'Your completed evaluations will appear here.'}</p>{groupedSubmissions.length > 0 && <button className="text-button" type="button" onClick={() => { setSearch(''); setFilter('All evaluations'); }}>Clear filters</button>}</div>}
        {!isLoading && !error && visibleSubmissions.length > 0 && <Pagination page={currentPage} pageSize={pageSize} totalItems={visibleSubmissions.length} onPageChange={setCurrentPage} onPageSizeChange={(size) => { setHistoryPageSize(size); setCurrentPage(1); }} ariaLabel="Submission history pagination" showPageControls={pageCount > 1 || pageSize !== 10} />}
      </section>}

      {detail && <div className="fixed inset-0 modal-backdrop">
        <section className="modal" role="dialog" aria-modal="true" aria-label="Submission details">
          <button className="modal-close icon-button" type="button" aria-label="Close dialog" autoFocus onClick={() => setDetail(null)}><span aria-hidden="true">×</span></button>
          <span className="submitted-tag"><Check size={13} /> Submitted</span><h2>{detail.company}</h2><p className="modal-subtitle">{detail.type} evaluation · {formatDateTime(detail.date)}</p>
          <div className="modal-note">Submitted evaluation · Read-only</div>
          {detail.answers.map((answer, index) => <div className="answer-row" key={`${answer.question}-${index}`}><div><span>{answer.question}</span><p>{answer.answer}</p></div></div>)}
          <button className="secondary-button" type="button" onClick={() => { setDetail(null); onNavigate('My submissions'); }}>Back to my submissions</button>
        </section>
      </div>}
    </>
  );
}

function HistoryRows({ items, compact = false, onSelect }: { items: SubmissionItem[]; compact?: boolean; onSelect: (item: SubmissionItem) => void }) {
  return <div className={compact ? 'history-list compact' : 'history-list'}>{items.map((item) => <button key={item.id} type="button" className="history-row" onClick={() => onSelect(item)}>
    <span className="history-icon"><FileText size={20} /></span><span className="history-company"><strong>{item.company}</strong><span>{item.type} evaluation</span></span><span className="history-date">{formatDate(item.date)}</span><span className="submitted-tag"><Check size={12} /> Submitted</span><ArrowRight size={17} />
  </button>)}</div>;
}
