import { useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Eye, X } from 'lucide-react';
import { CustomForm, PartnerCompany } from '../../../types/survey';
import { getQuestionMaxPoints } from '../../../data/questionWeights';
import { getSurveyEvaluationCompanies } from '../../analytics/domain/analytics';
import { useModalEscape } from '../../../hooks/useModalEscape';

interface SurveyPreviewModalProps {
  survey: CustomForm;
  partnerCompanies?: PartnerCompany[];
  onClose: () => void;
}

const DEPARTMENTS = [
  'Accounts Payable - Trade',
  'Business Solutions Manager',
  'Executive Office',
  'Logistics',
  'Procurement Group',
  'TASS',
];

const RESPONDENT_TYPES = ['Rank & File', 'Supervisory', 'Managerial', 'Director', 'Executive'];

// Read-only-in-spirit walkthrough of a survey exactly as an employee would see it,
// paginated by section (page 1 = Respondent Info, then one page per question
// section) with no submit action - nothing typed here is ever saved or sent
// anywhere. Deliberately kept separate from SurveyFillerPage instead of adding
// a "preview mode" flag to it, so the real submission flow (validation, drafts,
// keyboard shortcuts) can't be accidentally affected by preview-only changes.
export function SurveyPreviewModal({ survey, partnerCompanies = [], onClose }: SurveyPreviewModalProps) {
  useModalEscape(true, onClose);
  const availableDepartments = survey.accessDepartments?.length ? survey.accessDepartments : DEPARTMENTS;
  const availableRespondentTypes = survey.accessRoles?.length ? survey.accessRoles : RESPONDENT_TYPES;
  const sampleCompanies = useMemo(() => getSurveyEvaluationCompanies(survey, partnerCompanies), [survey, partnerCompanies]);

  const [department, setDepartment] = useState(availableDepartments[0] || '');
  const [respondentType, setRespondentType] = useState(availableRespondentTypes[0] || '');
  const [company, setCompany] = useState(sampleCompanies[0]?.name || '');
  const [address, setAddress] = useState('');
  const [periodCovered, setPeriodCovered] = useState('1st Half');
  const [ratings, setRatings] = useState<Record<string, any>>({});

  const questions = useMemo(
    () => survey.questions.filter((q) => q.question !== 'Period Covered'),
    [survey.questions]
  );

  // One page per distinct section, in first-appearance order; questions with
  // no section (or if the form defines none at all) fall into a single
  // unlabeled page instead of being dropped.
  const sections = useMemo(() => {
    const order: string[] = [];
    const seen = new Set<string>();
    questions.forEach((q) => {
      const label = q.section || 'Questions';
      if (!seen.has(label)) {
        seen.add(label);
        order.push(label);
      }
    });
    return order;
  }, [questions]);

  const totalPages = 1 + sections.length;
  const [pageIndex, setPageIndex] = useState(0);
  const isInfoPage = pageIndex === 0;
  const currentSection = !isInfoPage ? sections[pageIndex - 1] : null;
  const currentQuestions = currentSection ? questions.filter((q) => (q.section || 'Questions') === currentSection) : [];

  const handleRatingChange = (qId: string, value: any) => setRatings((prev) => ({ ...prev, [qId]: value }));
  const handleMatrixRatingChange = (qId: string, subId: string, value: any) =>
    setRatings((prev) => ({ ...prev, [qId]: { ...prev[qId], [subId]: value } }));
  const handleCheckboxChange = (qId: string, option: string, checked: boolean) =>
    setRatings((prev) => {
      const current = Array.isArray(prev[qId]) ? prev[qId] : [];
      return { ...prev, [qId]: checked ? [...current, option] : current.filter((item: string) => item !== option) };
    });
  const handleDateRangeChange = (qId: string, field: 'from' | 'to', value: string) =>
    setRatings((prev) => ({ ...prev, [qId]: { ...prev[qId], [field]: value } }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
      <div className="w-full max-w-3xl h-[90vh] max-h-[90vh] rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-950 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="shrink-0 border-b border-slate-100 dark:border-slate-800 px-6 py-4 flex items-center justify-between gap-3 bg-amber-50/60 dark:bg-amber-950/10">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400 shrink-0">
              <Eye size={16} />
            </span>
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                Preview Mode &middot; Nothing typed here is saved
              </p>
              <h3 className="text-sm font-bold text-slate-800 dark:text-white">{survey.title}</h3>
            </div>
          </div>
          <button onClick={onClose} type="button" className="icon-button shrink-0" title="Close Preview">
            <X size={18} />
          </button>
        </div>

        {/* Page indicator */}
        <div className="shrink-0 px-6 py-2.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] font-semibold text-slate-400">
          <span>
            Page {pageIndex + 1} of {totalPages}
          </span>
          <span className="truncate max-w-[60%] text-right">
            {isInfoPage ? 'Respondent Info' : currentSection}
          </span>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {isInfoPage ? (
            <div className="space-y-5">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                This is the intake step employees fill out before answering the form's questions.
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="field-label">Associated Department</label>
                  <select className="field" value={department} onChange={(e) => setDepartment(e.target.value)}>
                    {availableDepartments.map((dept) => (
                      <option key={dept} value={dept}>{dept}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="field-label">Designation</label>
                  <select className="field" value={respondentType} onChange={(e) => setRespondentType(e.target.value)}>
                    {availableRespondentTypes.map((role) => (
                      <option key={role} value={role}>{role}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="field-label">Select Partner Company to Evaluate *</label>
                {sampleCompanies.length > 0 ? (
                  <select className="field text-xs font-semibold" value={company} onChange={(e) => setCompany(e.target.value)}>
                    {sampleCompanies.map((c) => (
                      <option key={c.id} value={c.name}>{c.name}</option>
                    ))}
                  </select>
                ) : (
                  <input type="text" className="field" placeholder="e.g. Apex Buildworks Co." value={company} onChange={(e) => setCompany(e.target.value)} />
                )}
              </div>
              <div>
                <label className="field-label">Address</label>
                <input type="text" className="field" placeholder="Enter Company Address" value={address} onChange={(e) => setAddress(e.target.value)} />
              </div>
              {(survey.surveyType === 'Courier' || survey.surveyType === 'Supplier') && (
                <div>
                  <label className="field-label">Period Covered</label>
                  <select className="field" value={periodCovered} onChange={(e) => setPeriodCovered(e.target.value)}>
                    <option value="1st Half">1st Half</option>
                    <option value="2nd Half">2nd Half</option>
                    <option value="Annual">Annual</option>
                  </select>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-5">
              {currentQuestions.map((q, idx) => {
                const maxVal = getQuestionMaxPoints(survey.surveyType, q.questionId);
                const currentRating = ratings[q.questionId] !== undefined ? ratings[q.questionId] : maxVal;

                return (
                  <div key={q.questionId} className="panel p-5 space-y-4 shadow-sm border-l-4 border-l-[#0063a9] dark:border-l-blue-400">
                    <div className="flex items-start justify-between gap-4">
                      <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-100 leading-relaxed">
                        <span className="text-slate-400 font-bold mr-1.5">{idx + 1}.</span>
                        {q.question} <span className="text-rose-500 font-bold">*</span>
                      </h4>
                      <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400 shrink-0">
                        {q.questionCategory}
                      </span>
                    </div>

                    {q.inputType === 'select' ? (
                      <select
                        className="field w-full text-xs font-semibold"
                        value={ratings[q.questionId] ?? ''}
                        onChange={(e) => handleRatingChange(q.questionId, e.target.value)}
                      >
                        <option value="">-- Select option --</option>
                        {q.options?.map((opt) => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                    ) : q.inputType === 'text' ? (
                      <input
                        type="text"
                        placeholder="Enter your answer"
                        className="field w-full"
                        value={ratings[q.questionId] ?? ''}
                        onChange={(e) => handleRatingChange(q.questionId, e.target.value)}
                      />
                    ) : q.inputType === 'checkbox' ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {q.options?.map((opt) => {
                          const isChecked = Array.isArray(ratings[q.questionId]) && ratings[q.questionId].includes(opt);
                          return (
                            <label key={opt} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
                              <input
                                type="checkbox"
                                className="w-4 h-4 rounded border-slate-300 text-[#0063a9] focus:ring-[#0063a9]"
                                checked={isChecked}
                                onChange={(e) => handleCheckboxChange(q.questionId, opt, e.target.checked)}
                              />
                              <span>{opt}</span>
                            </label>
                          );
                        })}
                      </div>
                    ) : q.inputType === 'date-range' ? (
                      <div className="flex items-center gap-4">
                        <input
                          type="text"
                          placeholder="dd/mm/yyyy"
                          maxLength={10}
                          className="field w-40"
                          value={ratings[q.questionId]?.from || ''}
                          onChange={(e) => handleDateRangeChange(q.questionId, 'from', e.target.value)}
                        />
                        <span className="text-slate-400 font-bold">to</span>
                        <input
                          type="text"
                          placeholder="dd/mm/yyyy"
                          maxLength={10}
                          className="field w-40"
                          value={ratings[q.questionId]?.to || ''}
                          onChange={(e) => handleDateRangeChange(q.questionId, 'to', e.target.value)}
                        />
                      </div>
                    ) : q.inputType === 'matrix' && q.subQuestions ? (
                      <div className="overflow-x-auto w-full">
                        <table className="w-full text-sm text-left border-collapse min-w-[600px]">
                          <thead>
                            <tr className="border-b border-slate-200 dark:border-slate-800">
                              <th className="pb-3 text-slate-500 w-3/5 font-semibold">Criteria</th>
                              {[2, 1, 0, 'N/A'].map((opt) => (
                                <th key={opt} className="pb-3 text-center text-slate-500 font-semibold">{opt}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {q.subQuestions.map((sub, subIdx) => {
                              const subVal = ratings[q.questionId]?.[sub.id] || '';
                              return (
                                <tr key={sub.id} className={subIdx !== q.subQuestions!.length - 1 ? 'border-b border-slate-100 dark:border-slate-800' : ''}>
                                  <td className="py-4 pr-4">
                                    <div className="text-slate-800 dark:text-slate-200 leading-snug">{String.fromCharCode(97 + subIdx)}. {sub.label}</div>
                                    {sub.description && <div className="text-xs text-[#0063a9] dark:text-blue-400 mt-2 font-medium">{sub.description}</div>}
                                  </td>
                                  {[2, 1, 0, 'N/A'].map((opt) => (
                                    <td key={opt} className="py-4 text-center">
                                      <input
                                        type="radio"
                                        name={`preview-matrix-${q.questionId}-${sub.id}`}
                                        className="w-4 h-4 text-[#0063a9] border-slate-300 focus:ring-[#0063a9]"
                                        checked={subVal.toString() === opt.toString()}
                                        onChange={() => handleMatrixRatingChange(q.questionId, sub.id, opt)}
                                      />
                                    </td>
                                  ))}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    ) : q.inputType === 'typed-rating' ? (
                      <input
                        type="text"
                        placeholder={
                          (q.validationRange?.allowNa ?? true)
                            ? `Enter N/A or number from ${q.validationRange?.min || 0} to ${q.validationRange?.max || 100}`
                            : `Enter a number from ${q.validationRange?.min || 0} to ${q.validationRange?.max || 100}`
                        }
                        className="field w-full max-w-sm"
                        value={ratings[q.questionId] ?? ''}
                        onChange={(e) => handleRatingChange(q.questionId, e.target.value)}
                      />
                    ) : (
                      <div className="flex flex-wrap items-center gap-2">
                        {Array.from({ length: maxVal + 1 }, (_, r) => r).map((r) => {
                          const isSelected = currentRating === r;
                          const ratio = maxVal > 0 ? r / maxVal : 1;
                          let btnStyle = 'border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-900';
                          if (isSelected) {
                            btnStyle = ratio <= 0.3
                              ? 'bg-rose-50 border-rose-500 text-rose-600 ring-2 ring-rose-200 dark:bg-rose-950/40 dark:text-rose-400 dark:ring-rose-900/30'
                              : ratio < 0.75
                              ? 'bg-amber-50 border-amber-500 text-amber-600 ring-2 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:ring-amber-900/30'
                              : 'bg-emerald-50 border-emerald-500 text-emerald-600 ring-2 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:ring-emerald-900/30';
                          }
                          let label = '';
                          if (r === 0) label = 'Poor';
                          else if (r === maxVal) label = 'Excellent';
                          else if (r === Math.round(maxVal / 2)) label = 'Fair';
                          return (
                            <button
                              key={r}
                              type="button"
                              onClick={() => handleRatingChange(q.questionId, r)}
                              className={`flex-1 min-w-[42px] h-11 rounded-lg border text-sm font-bold flex flex-col items-center justify-center transition duration-150 cursor-pointer ${btnStyle}`}
                            >
                              <span className="text-base leading-none">{r}</span>
                              {label && <span className="text-[8px] font-semibold mt-0.5 tracking-tight uppercase opacity-70">{label}</span>}
                            </button>
                          );
                        })}
                        <button
                          type="button"
                          onClick={() => handleRatingChange(q.questionId, 'N/A')}
                          className={`min-w-16 h-11 rounded-lg border text-sm font-bold flex flex-col items-center justify-center transition duration-150 cursor-pointer ${
                            currentRating === 'N/A'
                              ? 'bg-slate-100 border-slate-400 text-slate-700 ring-2 ring-slate-200 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-300'
                              : 'border-slate-200 text-slate-400 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-900'
                          }`}
                        >
                          <span className="text-sm leading-none">N/A</span>
                          <span className="text-[8px] font-semibold mt-0.5 uppercase tracking-tight opacity-70">Not App</span>
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer navigation */}
        <div className="shrink-0 border-t border-slate-100 dark:border-slate-800 px-6 py-4 flex items-center justify-between gap-3 bg-slate-50 dark:bg-slate-950/40">
          <button
            type="button"
            onClick={() => setPageIndex((p) => Math.max(0, p - 1))}
            disabled={pageIndex === 0}
            className="secondary-button text-xs disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ArrowLeft size={14} /> Back
          </button>

          {pageIndex < totalPages - 1 ? (
            <button
              type="button"
              onClick={() => setPageIndex((p) => Math.min(totalPages - 1, p + 1))}
              className="primary-button bg-[#0063a9] hover:bg-[#00528c] text-xs"
            >
              Next <ArrowRight size={14} />
            </button>
          ) : (
            <button type="button" onClick={onClose} className="primary-button bg-emerald-600 hover:bg-emerald-700 text-xs">
              Finish Preview
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
