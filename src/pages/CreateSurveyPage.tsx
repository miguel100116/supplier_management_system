import { useCallback, useEffect, useRef, useState } from 'react';
import { Plus, Trash, ArrowLeft, Save, AlertCircle, FileText, ChevronDown } from 'lucide-react';
import { SurveyType, CustomForm } from '../types/survey';
import { isValidDDMMYYYY } from '../utils/time';
import { DEFAULT_CATEGORIES, OVERALL_CATEGORY } from '../data/questionCategories';

interface CreateSurveyPageProps {
  onBack: () => void;
  onRequestCloseReady?: (requestClose: (() => void) | null) => void;
  onSave: (survey: Omit<CustomForm, 'id' | 'createdAt'>) => void;
  surveyToEdit?: CustomForm;
  categoryLabels?: Record<SurveyType, string[]>;
}

interface QuestionInput {
  question: string;
  questionCategory: string;
  section?: string;
  inputType?: 'rating' | 'text' | 'select' | 'typed-rating';
  options?: string[];
  validationRange?: { min: number; max: number; allowNa: boolean };
}

export function CreateSurveyPage({ onBack, onRequestCloseReady, onSave, surveyToEdit, categoryLabels = DEFAULT_CATEGORIES }: CreateSurveyPageProps) {
  const [title, setTitle] = useState(surveyToEdit ? surveyToEdit.title : '');
  const [surveyType, setSurveyType] = useState<SurveyType>(surveyToEdit ? surveyToEdit.surveyType : 'Courier');
  const [description, setDescription] = useState(surveyToEdit ? surveyToEdit.description : '');
  const [maxRating, setMaxRating] = useState(surveyToEdit ? (surveyToEdit.maxRating ?? 100) : 100);
  const [deadlineDate, setDeadlineDate] = useState(surveyToEdit ? (surveyToEdit.deadlineDate ?? '') : '');
  const [deadlineError, setDeadlineError] = useState('');
  const [questions, setQuestions] = useState<QuestionInput[]>(
    surveyToEdit
      ? (surveyToEdit.questions.map((q) => ({
          question: q.question,
          questionCategory: q.questionCategory,
          section: q.section,
          inputType: q.inputType as any,
          options: q.options,
          validationRange: q.validationRange as any,
        })) as any[])
      : [{ question: '', questionCategory: OVERALL_CATEGORY }]
  );
  const [error, setError] = useState('');
  const initialFormSnapshot = useRef(JSON.stringify({ title, surveyType, description, maxRating, deadlineDate, questions }));
  const handleBack = useCallback(() => {
    const currentSnapshot = JSON.stringify({ title, surveyType, description, maxRating, deadlineDate, questions });
    if (currentSnapshot !== initialFormSnapshot.current && !window.confirm('Discard unsaved survey form changes?')) return;
    onBack();
  }, [deadlineDate, description, maxRating, onBack, questions, surveyType, title]);

  useEffect(() => {
    onRequestCloseReady?.(handleBack);
    return () => onRequestCloseReady?.(null);
  }, [handleBack, onRequestCloseReady]);

  // The 5 categories currently defined for this survey type (Categories
  // Manager), plus the fixed "Overall" bucket for whole-company feedback -
  // always last, always available, on every type.
  const categoryOptions = [...categoryLabels[surveyType], OVERALL_CATEGORY];

  const handleAddQuestion = () => {
    setQuestions([...questions, { question: '', questionCategory: OVERALL_CATEGORY }]);
  };

  const handleRemoveQuestion = (index: number) => {
    if (questions.length === 1) {
      setError('A survey must have at least one question.');
      return;
    }
    const next = [...questions];
    next.splice(index, 1);
    setQuestions(next);
    setError('');
  };

  const handleQuestionChange = (index: number, value: string) => {
    const next = [...questions];
    next[index].question = value;
    setQuestions(next);
  };

  const handleCategoryChange = (index: number, value: string) => {
    const next = [...questions];
    next[index].questionCategory = value;
    setQuestions(next);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!title.trim()) {
      setError('Please provide a survey title.');
      return;
    }

    if (deadlineDate.trim() && !isValidDDMMYYYY(deadlineDate)) {
      setDeadlineError('Enter a valid deadline date in dd/mm/yyyy format (e.g. 05/03/2026).');
      setError('Please fix the deadline date before saving.');
      return;
    }
    setDeadlineError('');

    if (questions.some((q) => !q.question.trim())) {
      setError('All questions must contain text. Please fill or remove empty questions.');
      return;
    }

    const formattedQuestions = questions.map((q, idx) => ({
      questionId: surveyToEdit && surveyToEdit.questions[idx]
        ? surveyToEdit.questions[idx].questionId
        : `Q-CUST-${Date.now()}-${idx + 1}`,
      questionNumber: idx + 1,
      question: q.question.trim(),
      questionCategory: q.questionCategory,
      section: q.section?.trim() || undefined,
      inputType: q.inputType || 'rating',
      options: q.options && q.options.length > 0 ? q.options : undefined,
      validationRange: q.validationRange || undefined,
    }));

    onSave({
      title: title.trim(),
      surveyType,
      description: description.trim() || `Custom survey for ${surveyType} stakeholders.`,
      deadlineDate: deadlineDate.trim() || undefined,
      maxRating,
      questions: formattedQuestions as any,
    });
  };

  return (
    <div className="panel space-y-6" id="create-survey-page">
      <div className="flex items-center justify-between border-b border-slate-100 pb-4 dark:border-slate-800">
        <button
          onClick={handleBack}
          className="secondary-button"
          type="button"
          id="btn-back-to-surveys"
        >
          <ArrowLeft size={16} />
          <span>Back</span>
        </button>
        <div className="text-right">
          <span className="badge">Form Builder Mode</span>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div className="flex items-center gap-2 rounded-lg bg-rose-50 border border-rose-200 p-3 text-sm text-rose dark:bg-rose-950/30 dark:border-rose-900">
            <AlertCircle size={16} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="grid gap-5 md:grid-cols-3">
          <div className="md:col-span-2 space-y-4">
            <div>
              <label htmlFor="survey-title" className="field-label">Survey Title *</label>
              <input
                id="survey-title"
                type="text"
                className="field"
                placeholder="e.g. Q3 Logistics & Courier Experience Feedback"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </div>

            <div>
              <label htmlFor="survey-desc" className="field-label">Description / Instructions</label>
              <textarea
                id="survey-desc"
                className="field min-h-20 max-h-40"
                placeholder="Describe the purpose of this survey to respondents..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
          </div>

          <div className="rounded-lg bg-slate-50 p-4 dark:bg-slate-900/50 space-y-4">
            <div>
              <label htmlFor="survey-type" className="field-label">Survey Type (Audience) *</label>
              <div className="relative mt-1">
                <select
                  id="survey-type"
                  className="field !mt-0 appearance-none pr-10"
                  value={surveyType}
                  onChange={(e) => setSurveyType(e.target.value as SurveyType)}
                >
                  <option value="Courier">Courier (Courier/Logistics)</option>
                  <option value="Supplier">Supplier (Goods/Materials)</option>
                  <option value="Subcontractor">Subcontractor (On-Site/Execution)</option>
                </select>
                <ChevronDown aria-hidden="true" size={16} className="select-chevron pointer-events-none absolute top-1/2 -translate-y-1/2 text-slate-700 dark:text-slate-300" />
              </div>
            </div>

            <div>
              <label htmlFor="survey-deadline" className="field-label">Deadline Date</label>
              <input
                id="survey-deadline"
                type="text"
                inputMode="numeric"
                maxLength={10}
                placeholder="dd/mm/yyyy"
                className={`field ${deadlineError ? 'border-rose-400 focus:ring-rose-200' : ''}`}
                value={deadlineDate}
                onChange={(e) => {
                  const value = e.target.value;
                  setDeadlineDate(value);
                  if (!value.trim()) {
                    setDeadlineError('');
                  } else if (!isValidDDMMYYYY(value)) {
                    setDeadlineError('Enter a valid date in dd/mm/yyyy format.');
                  } else {
                    setDeadlineError('');
                  }
                }}
              />
              {deadlineError ? (
                <p className="text-xs text-rose-500 font-semibold mt-1 flex items-center gap-1">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                  {deadlineError}
                </p>
              ) : (
                <p className="text-[10px] text-slate-400 mt-1 leading-relaxed">
                  The date respondents must complete this form by (dd/mm/yyyy).
                </p>
              )}
            </div>

            <div>
              <label htmlFor="max-rating" className="field-label flex items-center justify-between">
                <span>Rating Scale Max (N) *</span>
                <span className="font-bold text-[#0063a9] dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 px-2 py-0.5 rounded text-xs">
                  0 to {maxRating}
                </span>
              </label>
              <div className="flex items-center gap-2.5 mt-1.5">
                <input
                  id="max-rating"
                  type="range"
                  min="2"
                  max="10"
                  className="w-full accent-[#0063a9] cursor-pointer h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none"
                  value={maxRating}
                  onChange={(e) => setMaxRating(Number(e.target.value))}
                />
              </div>
              <p className="text-[10px] text-slate-400 mt-1 leading-relaxed">
                Respondents will answer from: N/A, 0, up to {maxRating}.
              </p>
            </div>
          </div>
        </div>

        <div className="border-t border-slate-100 pt-6 dark:border-slate-800">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
              <FileText size={18} className="text-[#0063a9] dark:text-blue-400" />
              <span>Survey Questions ({questions.length})</span>
            </h3>
            <button
              type="button"
              onClick={handleAddQuestion}
              className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-blue-400/50 hover:border-[#0063a9] hover:bg-blue-50 text-[#0063a9] px-3 py-1.5 text-xs font-semibold dark:hover:bg-blue-950/40 dark:text-blue-300 transition"
              id="btn-add-question"
            >
              <Plus size={14} />
              <span>Add Question</span>
            </button>
          </div>

          <div className="space-y-4">
            {questions.map((q, idx) => (
              <div
                key={idx}
                className="group relative flex flex-col gap-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/40"
              >
                <div className="flex items-center justify-between border-b border-slate-100 pb-2 dark:border-slate-800">
                  <div className="flex items-center gap-2">
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                      {idx + 1}
                    </div>
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Question Config</span>
                  </div>
                  
                  <button
                    type="button"
                    onClick={() => handleRemoveQuestion(idx)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/20 transition duration-200 cursor-pointer"
                    title="Remove question"
                  >
                    <Trash size={16} />
                  </button>
                </div>

                <div className="flex-1 space-y-3">
                  <div className="flex flex-col md:flex-row gap-3">
                    <div className="flex-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase">Question Text *</label>
                      <input
                        type="text"
                        className="field mt-1"
                        placeholder="e.g. Does the courier deliver goods on the agreed date?"
                        value={q.question}
                        onChange={(e) => handleQuestionChange(idx, e.target.value)}
                        required
                      />
                    </div>
                    <div className="w-full md:w-48 shrink-0">
                      <label className="text-[10px] font-bold text-slate-400 uppercase">Category</label>
                      <div className="relative mt-1">
                        <select
                          className="field !mt-0 appearance-none pr-9"
                          value={q.questionCategory}
                          onChange={(e) => handleCategoryChange(idx, e.target.value)}
                        >
                          {categoryOptions.map((cat) => (
                            <option key={cat} value={cat}>
                              {cat}
                            </option>
                          ))}
                        </select>
                        <ChevronDown aria-hidden="true" size={15} className="select-chevron pointer-events-none absolute top-1/2 -translate-y-1/2 text-slate-700 dark:text-slate-300" />
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-3 grid-cols-1 md:grid-cols-3 pt-2 border-t border-slate-100 dark:border-slate-800/60">
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase">Section Header (Optional)</label>
                      <input
                        type="text"
                        className="field mt-1 py-1 px-2.5 text-xs"
                        placeholder="e.g. SECTION 2: Reliability/Delivery (30 points)"
                        value={q.section || ''}
                        onChange={(e) => {
                          const next = [...questions];
                          next[idx].section = e.target.value;
                          setQuestions(next);
                        }}
                      />
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase">Input Type / Response Format</label>
                      <div className="relative mt-1">
                        <select
                        className="field !mt-0 appearance-none py-1 pl-2.5 pr-9 text-xs"
                        value={q.inputType || 'rating'}
                        onChange={(e) => {
                          const next = [...questions];
                          const type = e.target.value as any;
                          next[idx].inputType = type;
                          if (type === 'select' && !next[idx].options) {
                            next[idx].options = ['Option 1', 'Option 2'];
                          }
                          if (type === 'typed-rating' && !next[idx].validationRange) {
                            next[idx].validationRange = { min: 0, max: 15, allowNa: true };
                          }
                          setQuestions(next);
                        }}
                      >
                        <option value="rating">Performance Rating Scale (0 to N)</option>
                        <option value="select">Dropdown Menu Selector</option>
                        <option value="typed-rating">Typed Rating with Range Bounds (e.g. 0-15)</option>
                        <option value="text">Text Field Answer</option>
                        </select>
                        <ChevronDown aria-hidden="true" size={15} className="select-chevron pointer-events-none absolute top-1/2 -translate-y-1/2 text-slate-700 dark:text-slate-300" />
                      </div>
                    </div>

                    {q.inputType === 'select' && (
                      <div>
                        <label className="text-[10px] font-bold text-amber-600 uppercase dark:text-amber-400">Dropdown Options (Comma Separated)</label>
                        <input
                          type="text"
                          className="field mt-1 py-1 px-2.5 text-xs border-amber-200 focus:ring-amber-100 dark:border-amber-900/40"
                          placeholder="Option 1, Option 2, Option 3"
                          value={q.options ? q.options.join(', ') : ''}
                          onChange={(e) => {
                            const next = [...questions];
                            next[idx].options = e.target.value.split(',').map(s => s.trim()).filter(Boolean);
                            setQuestions(next);
                          }}
                        />
                      </div>
                    )}

                    {q.inputType === 'typed-rating' && (
                      <div className="space-y-2">
                        <div className="flex gap-2">
                          <div className="flex-1">
                            <label className="text-[10px] font-bold text-[#0063a9] uppercase dark:text-blue-400">Min Score</label>
                            <input
                              type="number"
                              className="field mt-1 py-1 px-2.5 text-xs"
                              value={q.validationRange?.min ?? 0}
                              onChange={(e) => {
                                const next = [...questions];
                                next[idx].validationRange = {
                                  min: parseInt(e.target.value, 10) || 0,
                                  max: next[idx].validationRange?.max ?? 15,
                                  allowNa: next[idx].validationRange?.allowNa ?? true,
                                };
                                setQuestions(next);
                              }}
                            />
                          </div>
                          <div className="flex-1">
                            <label className="text-[10px] font-bold text-[#0063a9] uppercase dark:text-blue-400">Max Score</label>
                            <input
                              type="number"
                              className="field mt-1 py-1 px-2.5 text-xs"
                              value={q.validationRange?.max ?? 15}
                              onChange={(e) => {
                                const next = [...questions];
                                next[idx].validationRange = {
                                  min: next[idx].validationRange?.min ?? 0,
                                  max: parseInt(e.target.value, 10) || 15,
                                  allowNa: next[idx].validationRange?.allowNa ?? true,
                                };
                                setQuestions(next);
                              }}
                            />
                          </div>
                        </div>
                        <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300 cursor-pointer">
                          <input
                            type="checkbox"
                            className="h-3.5 w-3.5 rounded border-slate-300 text-[#0063a9] focus:ring-[#0063a9]"
                            checked={q.validationRange?.allowNa ?? true}
                            onChange={(e) => {
                              const next = [...questions];
                              next[idx].validationRange = {
                                min: next[idx].validationRange?.min ?? 0,
                                max: next[idx].validationRange?.max ?? 15,
                                allowNa: e.target.checked,
                              };
                              setQuestions(next);
                            }}
                          />
                          <span>Allow respondents to answer "N/A"</span>
                        </label>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-slate-100 pt-5 dark:border-slate-800">
          <button
            onClick={handleBack}
            className="secondary-button"
            type="button"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="primary-button bg-[#0063a9] hover:bg-[#00528c]"
            id="btn-save-survey"
          >
            <Save size={16} />
            <span>{surveyToEdit ? 'Save Changes' : 'Create and Publish Form'}</span>
          </button>
        </div>
      </form>
    </div>
  );
}
