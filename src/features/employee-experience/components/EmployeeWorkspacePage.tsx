import { useMemo, useState } from 'react';
import { ArrowRight, Check, ClipboardList, FileText, History, LockKeyhole, Search } from 'lucide-react';
import type { CustomForm, PartnerCompany, SurveyResponse, SurveyType } from '../../../types/survey';
import { useModalEscape } from '../../../hooks/useModalEscape';
import { getSurveyEvaluationCompanies } from '../../../utils/analytics';
import { EmployeeCompanyIcon } from './EmployeeCompanyIcon';

type WorkspaceView = 'Home' | 'Evaluations' | 'My submissions';
type EvaluationItem = { id: string; surveyId: string; company: string; type: SurveyType; title: string; companyId: string };
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

export function EmployeeWorkspacePage({ view, surveys, partnerCompanies, responses, userEmail, isLoading, error, onNavigate, onStartEvaluation }: EmployeeWorkspacePageProps) {
  const [filter, setFilter] = useState<'All evaluations' | SurveyType>('All evaluations');
  const [search, setSearch] = useState('');
  const [detail, setDetail] = useState<SubmissionItem | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [evaluationPage, setEvaluationPage] = useState(1);
  useModalEscape(Boolean(detail), () => setDetail(null));

  const evaluations = useMemo<EvaluationItem[]>(() => {
    const completed = new Map<SurveyType, Set<string>>();
    responses
      .filter((response) => response.respondentEmail?.trim().toLowerCase() === userEmail.trim().toLowerCase())
      .forEach((response) => {
        const companies = completed.get(response.surveyType) ?? new Set<string>();
        companies.add(response.company.trim().toLowerCase());
        completed.set(response.surveyType, companies);
      });

    return surveys
      .filter((survey) => survey.status !== 'Archived')
      .flatMap((survey) => getSurveyEvaluationCompanies(survey, partnerCompanies)
        .filter((company) => !completed.get(survey.surveyType)?.has(company.name.trim().toLowerCase()))
        .map((company) => ({
          id: `${survey.id}:${company.id}`,
          surveyId: survey.id,
          company: company.name,
          companyId: company.id,
          type: survey.surveyType,
          title: survey.title,
        })));
  }, [partnerCompanies, responses, surveys, userEmail]);

  const visibleEvaluations = evaluations.filter((item) =>
    (filter === 'All evaluations' || item.type === filter) &&
    `${item.company} ${item.title}`.toLowerCase().includes(search.trim().toLowerCase()),
  );
  const evaluationPageSize = 10;
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
  const pageSize = 10;
  const pageCount = Math.max(1, Math.ceil(visibleSubmissions.length / pageSize));
  const pagedSubmissions = visibleSubmissions.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const visibleEvaluationRows = view === 'Home' ? visibleEvaluations.slice(0, 3) : visibleEvaluations;
  const recentSubmissions = groupedSubmissions.slice(0, 2);
  const pageDescription = view === 'Home'
    ? 'Your next evaluation starts here. Let’s make every partnership better.'
    : view === 'Evaluations'
      ? 'Find a partner and share feedback on your experience.'
      : 'A clear record of the evaluations you’ve completed.';
  const firstName = getFirstNameFromEmail(userEmail);

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
        <div className="welcome-banner">
          <div className="welcome-content">
            <span className="banner-eyebrow"><span /> YOUR EXPERIENCE MATTERS</span>
            <h2>Better partners.<br />Better work, together.</h2>
            <p>Your feedback helps us understand the partners<br className="desktop-break" /> we work with. Start with an evaluation below.</p>
            <button className="banner-link" type="button" onClick={() => onNavigate('Evaluations')}>Explore your evaluations <ArrowRight size={17} /></button>
          </div>
          <div className="hero-art" aria-hidden="true">
            <div className="art-orbit orbit-one" /><div className="art-orbit orbit-two" /><div className="art-dot dot-one" /><div className="art-dot dot-two" />
            <div className="art-sheet sheet-back" /><div className="art-sheet sheet-front"><span className="art-sheet-heading" /><span className="art-sheet-sub" />
              {[0, 1, 2].map((item) => <div className="art-line" key={item}><span className="art-check"><Check size={12} /></span><span /></div>)}
            </div><div className="art-seal"><Check size={24} /></div>
          </div>
        </div>
      )}

      {view !== 'My submissions' && (
        <div className={view === 'Home' ? 'content-grid' : view === 'Evaluations' ? 'single-content evaluations-view' : 'single-content'}>
          <div className="primary-column">
            <section className="panel evaluations-panel">
              <div className="panel-heading">
                <div><h2>{view === 'Home' ? 'Ready for your feedback' : 'Available evaluations'}<span className="quiet-count">{evaluations.length}</span></h2><p>Choose a partner company to get started.</p></div>
                {view === 'Home' && <button className="text-button" type="button" onClick={() => onNavigate('Evaluations')}>View all <ArrowRight size={16} /></button>}
              </div>
              <div className="list-tools">
                <div className="filter-tabs" aria-label="Filter by evaluation type">
                  {(['All evaluations', 'Courier', 'Supplier', 'Subcontractor'] as const).map((type) => <button key={type} type="button" className={filter === type ? 'selected' : ''} aria-pressed={filter === type} onClick={() => { setFilter(type); setCurrentPage(1); setEvaluationPage(1); }}>{type}</button>)}
                </div>
                {view === 'Evaluations' ? <label className="search-field"><Search size={17} /><input aria-label="Search partner companies" placeholder="Search a partner company…" value={search} onChange={(event) => { setSearch(event.target.value); setEvaluationPage(1); }} /></label> : <span className="list-access"><LockKeyhole size={12} /> Available to you</span>}
              </div>
              {isLoading ? <div className="empty-state" role="status"><ClipboardList size={30} /><h3>Loading evaluations</h3><p>Your available forms will appear here.</p></div>
                : error ? <div className="empty-state" role="alert"><ClipboardList size={30} /><h3>Evaluations are unavailable</h3><p>We couldn’t load your evaluation information.</p></div>
                  : <div className="evaluation-list">
                    {(view === 'Home' ? visibleEvaluations.slice(0, 3) : pagedEvaluations).map((item) => <div className="evaluation-row" key={item.id}>
                      <div className={`company-avatar ${item.type === 'Courier' ? 'avatar-blue' : 'avatar-purple'}`}><EmployeeCompanyIcon type={item.type} size={23} /></div>
                      <div className="evaluation-text"><div className="company-line"><h3><button className="company-name-button" type="button" aria-label={`Start evaluation for ${item.company}`} onClick={() => onStartEvaluation(item.surveyId, item.company)}>{item.company}</button></h3><span className={`type-tag ${item.type.toLowerCase()}`}>{item.type}</span></div><p>{item.title}</p></div>
                      <button className="start-button" type="button" onClick={() => onStartEvaluation(item.surveyId, item.company)}>Start evaluation <ArrowRight size={16} /></button>
                    </div>)}
                    {visibleEvaluationRows.length === 0 && <div className="empty-state"><ClipboardList size={30} /><h3>{evaluations.length ? 'No matching evaluations' : 'You’re all caught up'}</h3><p>{evaluations.length ? 'Try another company name or evaluation type.' : 'There are no more evaluations available to you right now.'}</p>{evaluations.length > 0 && <button className="text-button" type="button" onClick={() => { setFilter('All evaluations'); setSearch(''); setEvaluationPage(1); }}>Clear filters</button>}</div>}
                  </div>}
              {!isLoading && !error && view === 'Evaluations' && visibleEvaluations.length > 0 && <nav className="employee-evaluation-pagination" aria-label="Evaluation pages">
                <span>Showing {(activeEvaluationPage - 1) * evaluationPageSize + 1}–{Math.min(activeEvaluationPage * evaluationPageSize, visibleEvaluations.length)} of {visibleEvaluations.length}</span>
                <div><button className="secondary-button" type="button" disabled={activeEvaluationPage <= 1} onClick={() => setEvaluationPage((page) => Math.max(1, page - 1))}>Previous</button><span>Page {activeEvaluationPage} of {evaluationPageCount}</span><button className="secondary-button" type="button" disabled={activeEvaluationPage >= evaluationPageCount} onClick={() => setEvaluationPage((page) => Math.min(evaluationPageCount, page + 1))}>Next</button></div>
              </nav>}
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
        {pageCount > 1 && <div className="employee-history-pagination"><button type="button" className="secondary-button" disabled={currentPage <= 1} onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}>Previous</button><span>Page {currentPage} of {pageCount}</span><button type="button" className="secondary-button" disabled={currentPage >= pageCount} onClick={() => setCurrentPage((page) => Math.min(pageCount, page + 1))}>Next</button></div>}
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
