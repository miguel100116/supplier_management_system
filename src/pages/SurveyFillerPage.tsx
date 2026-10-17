import { useState, useMemo, useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import { useModalEscape } from '../hooks/useModalEscape';
import { CheckCircle, Info, Shield, ArrowRight, ClipboardCopy, Send, UserCheck, ArrowLeft } from 'lucide-react';
import { CustomForm, Rating, PartnerCompany } from '../types/survey';
import { isValidDDMMYYYY } from '../utils/time';
import { getQuestionMaxPoints } from '../data/questionWeights';
import { getSurveyEvaluationCompanies } from '../utils/analytics';

// Exposed to parent components (via ref) so that navigation triggered from
// OUTSIDE this page — e.g. clicking the sidebar Home logo or another nav
// item while the respondent is in the middle of the Questions Form — can be
// intercepted and routed through the same "Save Progress Draft?" warning
// used internally, instead of silently discarding in-progress answers.
export interface SurveyFillerHandle {
  /**
   * Ask the survey filler whether it's safe to navigate away right now.
   * If the respondent is mid-survey (step 2), this shows the draft-save
   * warning and only calls `onAllowed` once the respondent resolves it
   * (Save Draft & Exit / Exit Without Saving). If there's nothing at risk
   * (step 1 or 3), `onAllowed` is invoked immediately.
   */
  attemptExit: (onAllowed: () => void) => void;
}

interface SurveyFillerPageProps {
  surveys: CustomForm[];
  partnerCompanies: PartnerCompany[];
  initialSurveyId?: string | null;
  userEmail: string;
  defaultDepartment?: string;
  defaultRespondentType?: string;
  responses: any[];
  onSubmitted: (
    surveyId: string,
    company: string,
    department: string,
    respondentType: string,
    address: string | undefined,
    answers: { questionId: string; questionNumber: number; question: string; questionCategory: string; rating: Rating; comment: string }[],
    startTime?: string
  ) => void;
  onCancel?: () => void;
}

const DEPARTMENTS = [
  'Accounts Payable - Trade',
  'Business Solutions Manager',
  'Executive Office',
  'Logistics',
  'Procurement Group',
  'TASS'
];

const RESPONDENT_TYPES = [
  'Rank & File',
  'Supervisory',
  'Managerial',
  'Director',
  'Executive'
];

export const SurveyFillerPage = forwardRef<SurveyFillerHandle, SurveyFillerPageProps>(function SurveyFillerPage(
  { surveys, partnerCompanies = [], initialSurveyId, userEmail, defaultDepartment, defaultRespondentType, responses, onSubmitted, onCancel },
  ref
) {
  const [selectedSurveyId, setSelectedSurveyId] = useState<string>(initialSurveyId || (surveys[0]?.id ?? ''));
  const [step, setStep] = useState<1 | 2 | 3>(1); // 1: Info, 2: Questions, 3: Success
  const [showDraftModal, setShowDraftModal] = useState(false);
  // True once the respondent has entered the Questions Form at least once for
  // this session. Lets us tell apart the *first* transition into step 2
  // (where answers should be freshly initialized from any saved draft) from
  // a *later* transition via the "Return" button (where in-progress answers
  // already sitting in state must be preserved, not overwritten).
  const [hasStartedForm, setHasStartedForm] = useState(false);
  // Holds the navigation callback to run once the respondent resolves the
  // "Save Progress Draft?" warning, when that warning was triggered by
  // navigation initiated OUTSIDE this component (e.g. sidebar Home click).
  const pendingExitRef = useRef<(() => void) | null>(null);
  // Timestamp captured the moment the respondent first enters the Questions
  // Form for this submission (see setHasStartedForm(true) below) - a ref,
  // not state, since it's read-only until submit and shouldn't trigger
  // re-renders. Cleared on handleReset so the next submission gets its own.
  const startTimeRef = useRef<string | null>(null);

  // Respondent metadata
  const [company, setCompany] = useState('');
  const [department, setDepartment] = useState(defaultDepartment || DEPARTMENTS[0]);
  const [respondentType, setRespondentType] = useState(defaultRespondentType || RESPONDENT_TYPES[0]);
  const [address, setAddress] = useState('');
  const [periodCovered, setPeriodCovered] = useState('1st Half');

  // Answers state
  const [ratings, setRatings] = useState<Record<string, any>>({});
  const [comments, setComments] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [copyPreviousAnswers, setCopyPreviousAnswers] = useState(true);

  const activeSurvey = surveys.find((s) => s.id === selectedSurveyId);
  const availableDepartments = useMemo(() => {
    return activeSurvey?.accessDepartments?.length ? activeSurvey.accessDepartments : DEPARTMENTS;
  }, [activeSurvey]);
  const availableRespondentTypes = useMemo(() => {
    return activeSurvey?.accessRoles?.length ? activeSurvey.accessRoles : RESPONDENT_TYPES;
  }, [activeSurvey]);

  useEffect(() => {
    const preferredDepartment = defaultDepartment && availableDepartments.includes(defaultDepartment)
      ? defaultDepartment
      : availableDepartments[0];
    if (preferredDepartment && !availableDepartments.includes(department)) {
      setDepartment(preferredDepartment);
    }
  }, [availableDepartments, defaultDepartment, department]);

  useEffect(() => {
    const preferredType = defaultRespondentType && availableRespondentTypes.includes(defaultRespondentType as any)
      ? defaultRespondentType
      : availableRespondentTypes[0];
    if (preferredType && !availableRespondentTypes.includes(respondentType as any)) {
      setRespondentType(preferredType);
    }
  }, [availableRespondentTypes, defaultRespondentType, respondentType]);

  // Filter registered partner companies that match the selected survey type
  // and exclude those already evaluated by this specific user
  const matchingCompanies = useMemo(() => {
    if (!activeSurvey) return [];
    
    // Find all company names already evaluated by this user for this survey type
    const evaluatedCompanies = new Set(
      responses
        .filter((r) => r.respondentEmail === userEmail && r.surveyType === activeSurvey.surveyType)
        .map((r) => r.company)
    );

    return getSurveyEvaluationCompanies(activeSurvey, partnerCompanies).filter(
      (c) => !evaluatedCompanies.has(c.name)
    );
  }, [partnerCompanies, activeSurvey, responses, userEmail]);

  // All companies assigned to this survey (even if already evaluated)
  const allCompaniesOfThisType = useMemo(() => {
    if (!activeSurvey) return [];
    return getSurveyEvaluationCompanies(activeSurvey, partnerCompanies);
  }, [partnerCompanies, activeSurvey]);

  const hasEvaluatedAll = useMemo(() => {
    return allCompaniesOfThisType.length > 0 && matchingCompanies.length === 0;
  }, [allCompaniesOfThisType, matchingCompanies]);

  // This employee's most recent full submission for the currently selected survey
  // type (regardless of which company it was for). Lets a new evaluation start
  // from what they typically rate this survey type instead of always defaulting
  // to the maximum score, so they only have to adjust what's actually different.
  const lastSubmissionForType = useMemo(() => {
    if (!activeSurvey) return null;
    const mine = responses.filter(
      (r) => r.respondentEmail === userEmail && r.surveyType === activeSurvey.surveyType
    );
    if (mine.length === 0) return null;

    // Group by responseId so we compare whole submissions, then take the most recent one.
    const byResponseId = new Map<string, typeof mine>();
    mine.forEach((r) => {
      const list = byResponseId.get(r.responseId) ?? [];
      list.push(r);
      byResponseId.set(r.responseId, list);
    });

    let latestId: string | null = null;
    let latestDate = '';
    byResponseId.forEach((rows, id) => {
      const date = rows[0]?.submissionDate ?? '';
      if (!latestId || date > latestDate) {
        latestId = id;
        latestDate = date;
      }
    });
    if (!latestId) return null;

    const rows = byResponseId.get(latestId)!;
    const answers = new Map<string, Rating>();
    rows.forEach((r) => answers.set(r.questionId, r.rating));

    return {
      company: rows[0]?.company ?? '',
      submissionDate: latestDate,
      answers,
    };
  }, [responses, userEmail, activeSurvey]);

  // Reset the toggle to its default whenever a fresh previous submission becomes
  // available for a newly selected survey type.
  useEffect(() => {
    setCopyPreviousAnswers(true);
  }, [lastSubmissionForType?.company, lastSubmissionForType?.submissionDate]);

  // Sync company with selected survey type
  useEffect(() => {
    if (matchingCompanies.length > 0) {
      setCompany(matchingCompanies[0].name);
    } else {
      setCompany('');
    }
  }, [matchingCompanies]);

  useImperativeHandle(ref, () => ({
    attemptExit: (onAllowed: () => void) => {
      if (step === 2) {
        // Mid-survey: don't let external navigation (Home, sidebar, etc.)
        // silently wipe in-progress answers — surface the same draft warning.
        pendingExitRef.current = onAllowed;
        setShowDraftModal(true);
      } else {
        onAllowed();
      }
    },
  }), [step]);

  const handleStartForm = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!company.trim() && !hasEvaluatedAll) {
      setError('Please provide your organization or partner name.');
      return;
    }

    if (!selectedSurveyId) {
      setError('Please select a evaluation form to respond to.');
      return;
    }

    if (hasStartedForm) {
      // Respondent already started the Questions Form and used "Return" to
      // revisit Respondent Info — keep their in-progress ratings/comments
      // exactly as they are instead of re-initializing from the draft or
      // defaults. Only sync the Period Covered value, in case it was
      // changed while back on this step.
      const periodQuestion = activeSurvey?.questions.find((q) => q.question === 'Period Covered');
      if (periodQuestion) {
        setRatings((prev) => ({ ...prev, [periodQuestion.questionId]: periodCovered }));
      }
      setStep(2);
      return;
    }

    // Try to load saved draft for this survey & company if it exists
    const draftKey = `evaluation_analytics_draft_${selectedSurveyId}_${company}`;
    const savedDraft = localStorage.getItem(draftKey);
    let draftRatings: Record<string, any> = {};
    let draftComments: Record<string, string> = {};
    if (savedDraft) {
      try {
        const parsed = JSON.parse(savedDraft);
        draftRatings = parsed.ratings || {};
        draftComments = parsed.comments || {};
      } catch (_) {}
    }

    // Initialize answer state for this survey's questions
    const initialRatings: Record<string, any> = {};
    const initialComments: Record<string, string> = {};
    activeSurvey?.questions.forEach((q) => {
      const qMax = getQuestionMaxPoints(activeSurvey.surveyType, q.questionId);
      const previousAnswer = copyPreviousAnswers ? lastSubmissionForType?.answers.get(q.questionId) : undefined;

      if (draftRatings[q.questionId] !== undefined) {
        initialRatings[q.questionId] = draftRatings[q.questionId];
      } else {
        if (q.question === 'Period Covered') {
          initialRatings[q.questionId] = periodCovered;
        } else if (q.inputType === 'checkbox') {
          initialRatings[q.questionId] = [];
        } else if (q.inputType === 'matrix') {
          // Copy each sub-question's previous rating individually, keyed the same
          // way it's stored on submission: `${q.questionId}-${sub.id}`.
          const subDefaults: Record<string, any> = {};
          q.subQuestions?.forEach((sub) => {
            const previousSubAnswer = copyPreviousAnswers
              ? lastSubmissionForType?.answers.get(`${q.questionId}-${sub.id}`)
              : undefined;
            if (previousSubAnswer !== undefined) {
              subDefaults[sub.id] = previousSubAnswer;
            }
          });
          initialRatings[q.questionId] = subDefaults;
        } else if (q.inputType === 'date-range') {
          initialRatings[q.questionId] = { from: '', to: '' };
        } else if (q.inputType === 'text' || q.inputType === 'select') {
          initialRatings[q.questionId] = '';
        } else if (q.inputType === 'typed-rating') {
          initialRatings[q.questionId] = previousAnswer !== undefined ? previousAnswer : '';
        } else {
          initialRatings[q.questionId] = previousAnswer !== undefined ? previousAnswer : qMax; // fall back to maximum scale value
        }
      }

      if (draftComments[q.questionId] !== undefined) {
        initialComments[q.questionId] = draftComments[q.questionId];
      } else {
        initialComments[q.questionId] = '';
      }
    });
    setRatings(initialRatings);
    setComments(initialComments);
    setValidationErrors({});
    setHasStartedForm(true);
    startTimeRef.current = new Date().toISOString();

    setStep(2);
  };

  // Resolves the "Save Progress Draft?" warning, whether it was triggered by
  // an in-form action or by navigation attempted from outside this page.
  const finishExit = () => {
    setShowDraftModal(false);
    const pendingExit = pendingExitRef.current;
    pendingExitRef.current = null;
    if (pendingExit) {
      pendingExit();
    } else if (onCancel) {
      onCancel();
    }
  };

  const handleSaveDraft = () => {
    if (!selectedSurveyId || !company) {
      finishExit();
      return;
    }
    const draftKey = `evaluation_analytics_draft_${selectedSurveyId}_${company}`;
    const draftData = {
      ratings,
      comments,
      periodCovered,
      department,
      respondentType,
      address,
    };
    localStorage.setItem(draftKey, JSON.stringify(draftData));
    finishExit();
  };

  const handleExitWithoutSaving = () => {
    if (selectedSurveyId && company) {
      const draftKey = `evaluation_analytics_draft_${selectedSurveyId}_${company}`;
      localStorage.removeItem(draftKey);
    }
    finishExit();
  };

  const handleCancelDraftModal = () => {
    // Respondent chose to stay on the form — cancel any pending external
    // navigation instead of letting it fire later.
    pendingExitRef.current = null;
    setShowDraftModal(false);
  };
  useModalEscape(showDraftModal, handleCancelDraftModal);

  const handleRatingChange = (qId: string, value: any) => {
    setRatings((prev) => ({ ...prev, [qId]: value }));
  };

  const handleMatrixRatingChange = (qId: string, subId: string, value: any) => {
    setRatings((prev) => ({
      ...prev,
      [qId]: { ...prev[qId], [subId]: value }
    }));
  };

  const handleCheckboxChange = (qId: string, option: string, checked: boolean) => {
    setRatings((prev) => {
      const current = Array.isArray(prev[qId]) ? prev[qId] : [];
      if (checked) {
        return { ...prev, [qId]: [...current, option] };
      } else {
        return { ...prev, [qId]: current.filter((item: string) => item !== option) };
      }
    });
  };

  const handleDateRangeChange = (qId: string, field: 'from' | 'to', value: string) => {
    setRatings((prev) => ({
      ...prev,
      [qId]: { ...prev[qId], [field]: value }
    }));

    // Live strict validation: dd/mm/yyyy only, and must be a real calendar date.
    // This catches spammed/random input (letters, malformed digits, impossible dates) immediately.
    if (!value.trim()) {
      setValidationErrors((prev) => {
        const copy = { ...prev };
        delete copy[qId];
        return copy;
      });
      return;
    }

    if (!isValidDDMMYYYY(value)) {
      setValidationErrors((prev) => ({
        ...prev,
        [qId]: 'Enter valid dates in dd/mm/yyyy format (e.g. 05/03/2026).'
      }));
    } else {
      setValidationErrors((prev) => {
        const copy = { ...prev };
        delete copy[qId];
        return copy;
      });
    }
  };

  const handleCommentChange = (qId: string, value: string) => {
    setComments((prev) => ({ ...prev, [qId]: value }));
  };

  // Moves focus to the next question card after a keyboard-driven rating action,
  // so Tab/Enter can hop between questions without tabbing through every
  // individual rating button.
  const focusNextQuestion = (currentOrder: number) => {
    requestAnimationFrame(() => {
      const next = document.querySelector<HTMLElement>(`[data-question-order="${currentOrder + 1}"]`);
      if (!next) return;
      const focusable = next.querySelector<HTMLElement>('[tabindex="0"], input, select, textarea, button:not([tabindex="-1"])');
      focusable?.focus();
    });
  };

  // Keyboard shortcuts for the number-scale rating buttons: digit keys jump
  // straight to that score, arrow keys step through the scale, and Enter moves
  // on to the next question. Tab already moves to the next question on its own
  // because only the currently-selected button in each group stays in the tab
  // order (a "roving tabindex" - see the tabIndex logic where these buttons render).
  const handleRatingKeyDown = (
    e: React.KeyboardEvent<HTMLButtonElement>,
    questionId: string,
    order: number,
    optionValues: Array<number | 'N/A'>,
  ) => {
    const focusOption = (value: number | 'N/A') => {
      requestAnimationFrame(() => {
        document.getElementById(`rating-btn-${questionId}-${value}`)?.focus();
      });
    };

    if (/^[0-9]$/.test(e.key)) {
      const digit = Number(e.key);
      if (optionValues.includes(digit)) {
        e.preventDefault();
        handleRatingChange(questionId, digit);
        focusOption(digit);
      }
      return;
    }

    if (e.key === 'n' || e.key === 'N') {
      if (optionValues.includes('N/A')) {
        e.preventDefault();
        handleRatingChange(questionId, 'N/A');
        focusOption('N/A');
      }
      return;
    }

    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      const current = ratings[questionId];
      const currentIdx = optionValues.findIndex((v) => v.toString() === (current ?? '').toString());
      const nextIdx = Math.min(optionValues.length - 1, (currentIdx === -1 ? -1 : currentIdx) + 1);
      const nextVal = optionValues[nextIdx];
      handleRatingChange(questionId, nextVal);
      focusOption(nextVal);
      return;
    }

    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      const current = ratings[questionId];
      const currentIdx = optionValues.findIndex((v) => v.toString() === (current ?? '').toString());
      const prevIdx = Math.max(0, (currentIdx === -1 ? optionValues.length : currentIdx) - 1);
      const prevVal = optionValues[prevIdx];
      handleRatingChange(questionId, prevVal);
      focusOption(prevVal);
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      focusNextQuestion(order);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeSurvey) return;

    // Validate form inputs
    const errors: Record<string, string> = {};
    activeSurvey.questions.forEach((q) => {
      const val = ratings[q.questionId];
      const valStr = val !== undefined ? val.toString().trim() : '';

      if (q.inputType === 'select') {
        if (!valStr) {
          errors[q.questionId] = 'This field is required. Please select an option from the dropdown.';
        }
      } else if (q.inputType === 'checkbox') {
        if (!Array.isArray(val) || val.length === 0) {
          errors[q.questionId] = 'This field is required. Please select at least one option.';
        }
      } else if (q.inputType === 'date-range') {
        if (!val || !val.from || !val.to) {
          errors[q.questionId] = 'This field is required. Please specify both dates.';
        } else if (!isValidDDMMYYYY(val.from) || !isValidDDMMYYYY(val.to)) {
          errors[q.questionId] = 'Enter valid dates in dd/mm/yyyy format (e.g. 05/03/2026).';
        }
      } else if (q.inputType === 'matrix') {
        q.subQuestions?.forEach(sub => {
           const subVal = val?.[sub.id];
           if (subVal === undefined || subVal === '') {
             errors[q.questionId] = 'Please answer all sub-questions in this section.';
           }
        });
      } else if (q.inputType === 'text') {
        if (!valStr) {
          errors[q.questionId] = 'This field is required. Please enter your answer.';
        }
      } else if (q.inputType === 'typed-rating') {
        const allowNa = q.validationRange?.allowNa ?? true;
        if (!valStr) {
          errors[q.questionId] = allowNa
            ? 'This field is required. Please type a rating score or "N/A".'
            : 'This field is required. Please type a rating score.';
        } else if (valStr.toUpperCase() === 'N/A') {
          if (!allowNa) {
            errors[q.questionId] = 'This question does not accept "N/A". Please enter a whole number instead.';
          }
        } else {
          const num = Number(valStr);
          const min = q.validationRange?.min ?? 0;
          const max = q.validationRange?.max ?? 100;
          if (isNaN(num) || !Number.isInteger(num) || num < min || num > max) {
            errors[q.questionId] = allowNa
              ? `Invalid input. Must be "N/A" or a whole number between ${min} and ${max}.`
              : `Invalid input. Must be a whole number between ${min} and ${max}.`;
          }
        }
      }
    });

    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      setError('Please resolve the invalid or missing answers highlighted in red below.');
      
      // Smooth scroll to the first question with an error
      setTimeout(() => {
        const firstErrorId = Object.keys(errors)[0];
        const element = document.getElementById(`q-container-${firstErrorId}`);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100);
      return;
    }

    setError('');
    setValidationErrors({});

    const formattedAnswers = activeSurvey.questions.flatMap((q) => {
      const qMax = getQuestionMaxPoints(activeSurvey.surveyType, q.questionId);
      const val = ratings[q.questionId];
      let finalComment = comments[q.questionId]?.trim() || '';

      if (q.inputType === 'matrix' && q.subQuestions) {
        return q.subQuestions.map((sub, idx) => {
          const subVal = val?.[sub.id] !== undefined ? val[sub.id].toString().trim() : '';
          let ratingVal: Rating = 'N/A';
          if (subVal.toUpperCase() === 'N/A') {
            ratingVal = 'N/A';
          } else {
            ratingVal = parseInt(subVal, 10);
            if (isNaN(ratingVal)) ratingVal = 'N/A';
          }
          return {
            questionId: `${q.questionId}-${sub.id}`,
            questionNumber: q.questionNumber + (idx * 0.1),
            question: `${q.question} - ${sub.label}`,
            questionCategory: q.questionCategory,
            rating: ratingVal,
            comment: finalComment,
          };
        });
      }

      let ratingVal: Rating = 'N/A';
      const valStr = val !== undefined && val !== null ? val.toString().trim() : '';

      if (q.inputType === 'typed-rating') {
        if (valStr.toUpperCase() === 'N/A') {
          ratingVal = 'N/A';
        } else {
          ratingVal = parseInt(valStr, 10);
        }
      } else if (q.inputType === 'select' || q.inputType === 'text') {
        ratingVal = 'N/A';
        finalComment = valStr + (finalComment ? ` | Comment detail: ${finalComment}` : '');
      } else if (q.inputType === 'checkbox') {
        ratingVal = 'N/A';
        const joined = Array.isArray(val) ? val.join(', ') : valStr;
        finalComment = joined + (finalComment ? ` | Comment detail: ${finalComment}` : '');
      } else if (q.inputType === 'date-range') {
        ratingVal = 'N/A';
        const fromStr = val?.from || '';
        const toStr = val?.to || '';
        const drStr = `From: ${fromStr} To: ${toStr}`;
        finalComment = drStr + (finalComment ? ` | Comment detail: ${finalComment}` : '');
      } else {
        ratingVal = typeof ratings[q.questionId] === 'number' ? ratings[q.questionId] : qMax;
      }

      return [{
        questionId: q.questionId,
        questionNumber: q.questionNumber,
        question: q.question,
        questionCategory: q.questionCategory,
        rating: ratingVal,
        comment: finalComment,
      }];
    });

    onSubmitted(
      selectedSurveyId,
      company.trim(),
      department,
      respondentType,
      address.trim(),
      formattedAnswers,
      startTimeRef.current ?? undefined
    );

    if (selectedSurveyId && company) {
      const draftKey = `evaluation_analytics_draft_${selectedSurveyId}_${company.trim()}`;
      localStorage.removeItem(draftKey);
    }

    setStep(3);
  };

  const handleReset = () => {
    setCompany('');
    setDepartment(DEPARTMENTS[0]);
    setRespondentType(RESPONDENT_TYPES[0]);
    setAddress('');
    setPeriodCovered('1st Half');
    setRatings({});
    setComments({});
    setValidationErrors({});
    setError('');
    setHasStartedForm(false);
    startTimeRef.current = null;
    setStep(1);
  };

  if (!activeSurvey && surveys.length === 0) {
    return (
      <div className="panel mx-auto max-w-2xl p-6 text-center sm:p-12" id="survey-filler-empty">
        <Info size={40} className="mx-auto text-amber-500 mb-4" />
        <h3 className="text-xl font-bold">No Evaluations Available</h3>
        <p className="text-slate-500 dark:text-slate-400 mt-2">There are currently no published evaluation forms inside the system.</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6" id="survey-filler-container">
      {/* Top Navigation Header */}
      <div className="flex items-center justify-between pb-2">
        {step === 1 ? (
          onCancel && (
            <button
              onClick={onCancel}
              className="secondary-button flex items-center gap-2 text-xs py-1.5 px-3"
              type="button"
            >
              <ArrowLeft size={14} />
              <span>Back to Form Management</span>
            </button>
          )
        ) : step === 2 ? (
          <button
            onClick={() => setStep(1)}
            className="secondary-button flex items-center gap-2 text-xs py-1.5 px-3"
            type="button"
          >
            <ArrowLeft size={14} />
            <span>Return</span>
          </button>
        ) : (
          <div />
        )}
      </div>

      {/* Step Progress bar */}
      <div className="flex items-center justify-between gap-2 px-1 sm:px-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold">
          <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${step >= 1 ? 'bg-[#0866B1] text-white' : 'bg-slate-200 text-slate-500'}`}>1</span>
          <span className={`hidden min-[420px]:inline ${step >= 1 ? 'text-slate-900 dark:text-white font-bold' : 'text-slate-400'}`}>Respondent Info</span>
        </div>
        <div className="mx-1 h-px flex-1 bg-slate-200 dark:bg-slate-800 sm:mx-4" />
        <div className="flex items-center gap-1.5 text-xs font-semibold">
          <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${step >= 2 ? 'bg-[#0866B1] text-white' : 'bg-slate-200 text-slate-500'}`}>2</span>
          <span className={`hidden min-[420px]:inline ${step >= 2 ? 'text-slate-900 dark:text-white font-bold' : 'text-slate-400'}`}>Questions Form</span>
        </div>
        <div className="mx-1 h-px flex-1 bg-slate-200 dark:bg-slate-800 sm:mx-4" />
        <div className="flex items-center gap-1.5 text-xs font-semibold">
          <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${step >= 3 ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-500'}`}>3</span>
          <span className={`hidden min-[420px]:inline ${step >= 3 ? 'text-emerald-600 font-bold' : 'text-slate-400'}`}>Success</span>
        </div>
      </div>

      {step === 1 && (
        <div className="panel space-y-6 p-4 min-[420px]:p-6 sm:p-10" id="survey-filler-step-1">
          <div className="text-center max-w-xl mx-auto space-y-2">
            <p className="text-[10px] uppercase tracking-widest text-[#0866B1] font-bold dark:text-blue-300">Microsoft Forms Ingress</p>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Stakeholder Feedback Form</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Provide your details and complete the official MBS stakeholder evaluation. Your feedback directly impacts operations.
            </p>
          </div>

          {hasEvaluatedAll && (
            <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-5 text-sm text-emerald-800 dark:bg-emerald-950/20 dark:border-emerald-900/40 flex items-start gap-3 shadow-xs">
              <CheckCircle size={20} className="text-emerald-500 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-bold">All Registered Partners Evaluated!</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  You have already successfully evaluated all registered partners matching the <strong>{activeSurvey?.surveyType}</strong> category. There are no additional partner evaluations required at this time.
                </p>
              </div>
            </div>
          )}

          {error && (
            <div className="rounded-lg bg-rose-50 border border-rose-200 px-4 py-2.5 text-sm text-rose dark:bg-rose-950/30 dark:border-rose-900 flex items-center gap-2">
              <Info size={16} />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleStartForm} className="space-y-5 border-t border-slate-100 pt-6 dark:border-slate-800">
            <div className="bg-[#0866B1]/10 text-[#0866B1] dark:bg-blue-950/40 dark:text-blue-300 font-bold px-4 py-2.5 rounded-lg text-sm uppercase tracking-wider border border-[#0866B1]/10 shadow-xs mb-6">
              Section 1: Details
            </div>

            {surveys.length > 1 ? (
              <div>
                <label htmlFor="filler-survey" className="field-label">Evaluation Form to Answer *</label>
                <select
                  id="filler-survey"
                  className="field text-sm font-semibold"
                  value={selectedSurveyId}
                  onChange={(e) => setSelectedSurveyId(e.target.value)}
                >
                  {surveys.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.title} ({s.surveyType})
                    </option>
                  ))}
                </select>
              </div>
            ) : activeSurvey && (
              <div className="rounded-lg bg-slate-50 border border-slate-200 px-4 py-2.5 text-xs text-slate-500 dark:bg-slate-900/40 dark:border-slate-800">
                Evaluation Form: <strong className="text-slate-700 dark:text-slate-200">{activeSurvey.title}</strong> ({activeSurvey.surveyType})
              </div>
            )}

            {!hasEvaluatedAll ? (
              <>
                <div className="grid gap-4 sm:grid-cols-2 mb-5">
                  <div>
                    <label htmlFor="filler-dept" className="field-label">Associated Department</label>
                    <select
                      id="filler-dept"
                      className="field"
                      value={department}
                      onChange={(e) => setDepartment(e.target.value)}
                    >
                      {availableDepartments.map((dept) => (
                        <option key={dept} value={dept}>
                          {dept}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label htmlFor="filler-role" className="field-label">Designation</label>
                    <select
                      id="filler-role"
                      className="field"
                      value={respondentType}
                      onChange={(e) => setRespondentType(e.target.value)}
                    >
                      {availableRespondentTypes.map((role) => (
                        <option key={role} value={role}>
                          {role}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label htmlFor="filler-company" className="field-label">Select Partner to Evaluate *</label>
                  {matchingCompanies.length > 0 ? (
                    <select
                      id="filler-company"
                      className="field text-xs font-semibold"
                      value={company}
                      onChange={(e) => setCompany(e.target.value)}
                      required
                    >
                      <option value="">-- Choose registered partner --</option>
                      {matchingCompanies.map((c) => (
                        <option key={c.id} value={c.name}>
                          {c.name} {c.affiliation ? `(${c.affiliation})` : ''}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      id="filler-company"
                      type="text"
                      className="field"
                      placeholder="e.g. Apex Buildworks Co."
                      value={company}
                      onChange={(e) => setCompany(e.target.value)}
                      required
                    />
                  )}
                </div>

                <div>
                  <label htmlFor="filler-address" className="field-label">Address</label>
                  <input
                    id="filler-address"
                    type="text"
                    className="field"
                    placeholder="Enter Partner Address"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                  />
                </div>

                {activeSurvey && (activeSurvey.surveyType === 'Courier' || activeSurvey.surveyType === 'Supplier') && (
                  <div>
                    <label htmlFor="filler-period" className="field-label">Period Covered</label>
                    <select
                      id="filler-period"
                      className="field"
                      value={periodCovered}
                      onChange={(e) => setPeriodCovered(e.target.value)}
                    >
                      <option value="1st Half">1st Half</option>
                      <option value="2nd Half">2nd Half</option>
                      <option value="Annual">Annual</option>
                    </select>
                  </div>
                )}

                {lastSubmissionForType && (
                  <label
                    htmlFor="filler-copy-previous"
                    className="flex cursor-pointer items-start gap-3 rounded-lg border border-[#0866B1]/20 bg-[#0866B1]/5 p-4 text-sm dark:border-blue-900/40 dark:bg-blue-950/20"
                  >
                    <input
                      id="filler-copy-previous"
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-slate-300 text-azure focus:ring-azure dark:border-slate-700 dark:bg-slate-900"
                      checked={copyPreviousAnswers}
                      onChange={(e) => setCopyPreviousAnswers(e.target.checked)}
                    />
                    <span>
                      <span className="block font-semibold text-slate-700 dark:text-slate-200">
                        Start from my last evaluation's ratings
                      </span>
                      <span className="block text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        We'll pre-fill this form with the ratings from your most recent {activeSurvey?.surveyType.toLowerCase()} evaluation
                        ({lastSubmissionForType.company}, {new Date(lastSubmissionForType.submissionDate).toLocaleDateString()}) — just adjust
                        whatever's different for this partner instead of rating every question from scratch.
                      </span>
                    </span>
                  </label>
                )}
              </>
            ) : (
              <div className="text-center py-6 text-slate-400 text-xs">
                Fields are locked since all partners are evaluated.
              </div>
            )}

            <div className="flex flex-col-reverse gap-3 border-t border-slate-100 pt-5 dark:border-slate-800 min-[420px]:flex-row min-[420px]:items-center min-[420px]:justify-between">
              {onCancel ? (
                <button
                  type="button"
                  onClick={onCancel}
                  className="secondary-button w-full min-[420px]:w-auto"
                >
                  Back to Form Management
                </button>
              ) : (
                <div />
              )}
              {!hasEvaluatedAll && (
                <button
                  type="submit"
                  className="primary-button w-full bg-[#0866B1] hover:bg-[#07528E] min-[420px]:w-auto"
                  id="btn-filler-next"
                >
                  <span>Proceed to Form Questions</span>
                  <ArrowRight size={16} />
                </button>
              )}
            </div>
          </form>
        </div>
      )}

      {step === 2 && activeSurvey && (
        <form onSubmit={handleSubmit} className="space-y-6" id="survey-filler-step-2">
          {/* Form Header Info card */}
          <div className="panel bg-[#0866B1]/5 border-blue-100 dark:border-blue-900/30">
            <h3 className="text-lg font-bold text-[#0866B1] dark:text-blue-300">{activeSurvey.title}</h3>
            <p className="text-xs text-slate-500 mt-1 dark:text-slate-400">{activeSurvey.description}</p>
            <div className="flex flex-wrap items-center gap-4 mt-3 text-xs text-slate-500 dark:text-slate-400 pt-3 border-t border-blue-400/10">
              <div>
                Partner: <strong className="text-slate-700 dark:text-slate-200">{company}</strong>
              </div>
              <div className="hidden sm:inline text-slate-300">|</div>
              <div>
                Department: <strong className="text-slate-700 dark:text-slate-200">{department}</strong>
              </div>
              <div className="hidden sm:inline text-slate-300">|</div>
              <div>
                Role: <strong className="text-slate-700 dark:text-slate-200">{respondentType}</strong>
              </div>
            </div>
          </div>

          {error && (
            <div className="rounded-lg bg-rose-50 border border-rose-200 px-4 py-2.5 text-sm text-rose dark:bg-rose-950/30 dark:border-rose-900 flex items-center gap-2">
              <Info size={16} />
              <span>{error}</span>
            </div>
          )}

          {/* Form questions list */}
          <div className="space-y-5">
            {(() => {
              let currentSection = '';
              const questionsToRender = activeSurvey.questions.filter(q => q.question !== 'Period Covered');
              return questionsToRender.map((q, idx) => {
                const showSectionHeader = q.section && q.section !== currentSection;
                if (showSectionHeader) {
                  currentSection = q.section!;
                }

                const maxVal = getQuestionMaxPoints(activeSurvey.surveyType, q.questionId);
                const currentRating = ratings[q.questionId] !== undefined ? ratings[q.questionId] : maxVal;

                return (
                  <div key={q.questionId} className="space-y-3">
                    {showSectionHeader && (
                      <div className="pt-6 pb-1 first:pt-0">
                        <div className="bg-[#0866B1]/10 text-[#0866B1] dark:bg-blue-950/40 dark:text-blue-300 font-bold px-4 py-2.5 rounded-lg text-sm uppercase tracking-wider border border-[#0866B1]/10 shadow-xs">
                          {q.section}
                        </div>
                      </div>
                    )}

                    <div
                      id={`q-container-${q.questionId}`}
                      data-question-order={idx}
                      className={`panel p-5 space-y-4 shadow-sm hover:shadow-md transition duration-200 border-l-4 ${
                        validationErrors[q.questionId]
                          ? 'border-l-rose-500 bg-rose-50/10 ring-1 ring-rose-300 dark:border-l-rose-500 dark:bg-rose-950/5 dark:ring-rose-900/30'
                          : 'border-l-[#0866B1] dark:border-l-blue-400'
                      }`}
                    >
                      <div className="space-y-1">
                        <div className="flex items-start justify-between gap-4">
                          <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-100 leading-relaxed">
                            <span className="text-slate-400 font-bold mr-1.5">{idx + 1}.</span>
                            {q.question} <span className="text-rose-500 font-bold">*</span>
                          </h4>
                          <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                            {q.questionCategory}
                          </span>
                        </div>
                      </div>

                      {/* Input Types rendering */}
                      {q.inputType === 'select' ? (
                        <div>
                          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-2">Choose an option:</span>
                          <select
                            className="field w-full text-xs font-semibold"
                            value={ratings[q.questionId] !== undefined ? ratings[q.questionId].toString() : ''}
                            onChange={(e) => {
                              handleRatingChange(q.questionId, e.target.value);
                              if (validationErrors[q.questionId]) {
                                setValidationErrors(prev => {
                                  const copy = { ...prev };
                                  delete copy[q.questionId];
                                  return copy;
                                });
                              }
                            }}
                          >
                            <option value="">-- Select option --</option>
                            {q.options?.map((opt) => (
                              <option key={opt} value={opt}>{opt}</option>
                            ))}
                          </select>
                        </div>
                      ) : q.inputType === 'text' ? (
                        <div>
                          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-2">Your Answer:</span>
                          <input
                            type="text"
                            placeholder="Enter your answer"
                            className="field w-full"
                            value={ratings[q.questionId] !== undefined ? ratings[q.questionId].toString() : ''}
                            onChange={(e) => {
                              handleRatingChange(q.questionId, e.target.value);
                              if (validationErrors[q.questionId]) {
                                setValidationErrors(prev => {
                                  const copy = { ...prev };
                                  delete copy[q.questionId];
                                  return copy;
                                });
                              }
                            }}
                          />
                        </div>
                      ) : q.inputType === 'checkbox' ? (
                        <div>
                          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-2">Select Options:</span>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {q.options?.map((opt) => {
                              const isChecked = Array.isArray(ratings[q.questionId]) && ratings[q.questionId].includes(opt);
                              return (
                                <label key={opt} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
                                  <input 
                                    type="checkbox"
                                    className="w-4 h-4 rounded border-slate-300 text-[#0866B1] focus:ring-[#0866B1]"
                                    checked={isChecked}
                                    onChange={(e) => {
                                      handleCheckboxChange(q.questionId, opt, e.target.checked);
                                      if (validationErrors[q.questionId]) {
                                        setValidationErrors(prev => {
                                          const copy = { ...prev };
                                          delete copy[q.questionId];
                                          return copy;
                                        });
                                      }
                                    }}
                                  />
                                  <span>{opt}</span>
                                </label>
                              )
                            })}
                          </div>
                        </div>
                      ) : q.inputType === 'date-range' ? (
                        <div>
                           <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-2">Duration (From - To):</span>
                           <div className="flex items-center gap-4">
                             <input
                               type="text"
                               inputMode="numeric"
                               placeholder="dd/mm/yyyy"
                               maxLength={10}
                               className={`field w-40 ${validationErrors[q.questionId] ? 'border-rose-400 focus:ring-rose-200' : ''}`}
                               value={ratings[q.questionId]?.from || ''}
                               onChange={(e) => {
                                 handleDateRangeChange(q.questionId, 'from', e.target.value);
                               }}
                             />
                             <span className="text-slate-400 font-bold">to</span>
                             <input
                               type="text"
                               inputMode="numeric"
                               placeholder="dd/mm/yyyy"
                               maxLength={10}
                               className={`field w-40 ${validationErrors[q.questionId] ? 'border-rose-400 focus:ring-rose-200' : ''}`}
                               value={ratings[q.questionId]?.to || ''}
                               onChange={(e) => {
                                 handleDateRangeChange(q.questionId, 'to', e.target.value);
                               }}
                             />
                           </div>
                           {validationErrors[q.questionId] && (
                             <p className="text-xs text-rose-500 font-semibold mt-1.5 flex items-center gap-1">
                               <span className="inline-block w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                               {validationErrors[q.questionId]}
                             </p>
                           )}
                        </div>
                      ) : q.inputType === 'matrix' && q.subQuestions ? (
                        <div className="overflow-x-auto w-full">
                          <table className="w-full text-sm text-left border-collapse min-w-[600px]">
                            <thead>
                              <tr className="border-b border-slate-200 dark:border-slate-800">
                                <th className="pb-3 text-slate-500 w-3/5 font-semibold">Criteria</th>
                                {[2, 1, 0, 'N/A'].map(opt => (
                                  <th key={opt} className="pb-3 text-center text-slate-500 font-semibold">{opt}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {q.subQuestions.map((sub, idx) => {
                                const subVal = ratings[q.questionId]?.[sub.id] || '';
                                return (
                                  <tr key={sub.id} className={idx !== q.subQuestions!.length - 1 ? "border-b border-slate-100 dark:border-slate-800" : ""}>
                                    <td className="py-4 pr-4">
                                      <div className="text-slate-800 dark:text-slate-200 leading-snug">{String.fromCharCode(97 + idx)}. {sub.label}</div>
                                      {sub.description && <div className="text-xs text-[#0866B1] dark:text-blue-400 mt-2 font-medium">{sub.description}</div>}
                                    </td>
                                    {[2, 1, 0, 'N/A'].map(opt => (
                                      <td key={opt} className="py-4 text-center">
                                        <input 
                                          type="radio"
                                          name={`matrix-${q.questionId}-${sub.id}`}
                                          className="w-4 h-4 text-[#0866B1] border-slate-300 focus:ring-[#0866B1]"
                                          checked={subVal.toString() === opt.toString()}
                                          onChange={() => {
                                            handleMatrixRatingChange(q.questionId, sub.id, opt);
                                            if (validationErrors[q.questionId]) {
                                              setValidationErrors(prev => {
                                                const copy = { ...prev };
                                                delete copy[q.questionId];
                                                return copy;
                                              });
                                            }
                                          }}
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
                        <div>
                          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-1">
                            Type Rating (Value: {q.validationRange ? `${q.validationRange.min}-${q.validationRange.max}` : '0-100'}{(q.validationRange?.allowNa ?? true) ? ' or "N/A"' : ''}): <span className="text-rose-500 font-bold">*</span>
                          </span>
                          <input
                            type="text"
                            placeholder={
                              (q.validationRange?.allowNa ?? true)
                                ? `Enter N/A or number from ${q.validationRange?.min || 0} to ${q.validationRange?.max || 100}`
                                : `Enter a number from ${q.validationRange?.min || 0} to ${q.validationRange?.max || 100}`
                            }
                            className={`field w-full max-w-sm ${validationErrors[q.questionId] ? 'border-rose-400 focus:ring-rose-200' : ''}`}
                            value={ratings[q.questionId] !== undefined ? ratings[q.questionId].toString() : ''}
                            onChange={(e) => {
                              handleRatingChange(q.questionId, e.target.value);
                              if (validationErrors[q.questionId]) {
                                setValidationErrors(prev => {
                                  const copy = { ...prev };
                                  delete copy[q.questionId];
                                  return copy;
                                });
                              }
                            }}
                          />
                          {validationErrors[q.questionId] && (
                            <p className="text-xs text-rose-500 font-semibold mt-1 flex items-center gap-1">
                              <span className="inline-block w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                              {validationErrors[q.questionId]}
                            </p>
                          )}
                        </div>
                      ) : (
                        <div>
                          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-2">Select Performance Rating:</span>
                          <div className="flex flex-wrap items-center gap-2">
                            {(() => {
                              // Options in scale order (used for arrow-key stepping and the
                              // roving tabIndex below, so Tab exits the group in one hop).
                              const optionValues: Array<number | 'N/A'> = [
                                ...Array.from({ length: maxVal + 1 }, (_, i) => i),
                                'N/A',
                              ];

                              return Array.from({ length: maxVal + 1 }, (_, i) => i).map((r) => {
                                const isSelected = currentRating === r;
                                const ratio = maxVal > 0 ? r / maxVal : 1;

                                let btnStyle = 'border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-900';
                                if (isSelected) {
                                  if (ratio <= 0.3) {
                                    btnStyle = 'bg-rose-50 border-rose-500 text-rose-600 ring-2 ring-rose-200 dark:bg-rose-950/40 dark:text-rose-400 dark:ring-rose-900/30';
                                  } else if (ratio < 0.75) {
                                    btnStyle = 'bg-amber-50 border-amber-500 text-amber-600 ring-2 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:ring-amber-900/30';
                                  } else {
                                    btnStyle = 'bg-emerald-50 border-emerald-500 text-emerald-600 ring-2 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:ring-emerald-900/30';
                                  }
                                }

                                let label = '';
                                if (r === 0) label = 'Poor';
                                else if (r === maxVal) label = 'Excellent';
                                else if (r === Math.round(maxVal / 2)) label = 'Fair';

                                return (
                                  <button
                                    key={r}
                                    id={`rating-btn-${q.questionId}-${r}`}
                                    type="button"
                                    tabIndex={isSelected ? 0 : -1}
                                    onClick={() => handleRatingChange(q.questionId, r)}
                                    onKeyDown={(e) => handleRatingKeyDown(e, q.questionId, idx, optionValues)}
                                    className={`flex-1 min-w-[42px] h-11 rounded-lg border text-sm font-bold flex flex-col items-center justify-center transition duration-150 cursor-pointer ${btnStyle}`}
                                  >
                                    <span className="text-base leading-none">{r}</span>
                                    {label && (
                                      <span className="text-[8px] font-semibold mt-0.5 tracking-tight uppercase opacity-70">
                                        {label}
                                      </span>
                                    )}
                                  </button>
                                );
                              }).concat(
                                <button
                                  key="na"
                                  id={`rating-btn-${q.questionId}-N/A`}
                                  type="button"
                                  tabIndex={currentRating === 'N/A' ? 0 : -1}
                                  onClick={() => handleRatingChange(q.questionId, 'N/A')}
                                  onKeyDown={(e) => handleRatingKeyDown(e, q.questionId, idx, optionValues)}
                                  className={`min-w-16 h-11 rounded-lg border text-sm font-bold flex flex-col items-center justify-center transition duration-150 cursor-pointer ${
                                    currentRating === 'N/A'
                                      ? 'bg-slate-100 border-slate-400 text-slate-700 ring-2 ring-slate-200 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-300'
                                      : 'border-slate-200 text-slate-400 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-900'
                                  }`}
                                >
                                  <span className="text-sm leading-none">N/A</span>
                                  <span className="text-[8px] font-semibold mt-0.5 uppercase tracking-tight opacity-70">Not App</span>
                                </button>
                              );
                            })()}
                          </div>
                          <p className="mt-2 text-[10px] text-slate-400 dark:text-slate-500">
                            Tip: with a rating focused, press 0–{maxVal} or the arrow keys to change it, then Enter to jump to the next question.
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                );
              });
            })()}
          </div>

          {/* Form Footer */}
          <div className="panel flex flex-col-reverse gap-3 p-4 min-[420px]:flex-row min-[420px]:items-center min-[420px]:justify-between sm:p-5">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="secondary-button flex w-full items-center gap-1.5 px-3 py-2 text-xs min-[420px]:w-auto"
              >
                <ArrowLeft size={14} />
                <span>Return</span>
              </button>
            </div>
            
            <button
              type="submit"
              className="primary-button w-full bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 min-[420px]:w-auto"
              id="btn-filler-submit"
            >
              <Send size={14} />
              <span>Submit Evaluation</span>
            </button>
          </div>
        </form>
      )}

      {step === 3 && (
        <div className="panel space-y-6 p-6 text-center sm:p-16" id="survey-filler-success">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 text-emerald-500 dark:bg-emerald-950/30 dark:text-emerald-400">
            <CheckCircle size={36} />
          </div>

          <div className="space-y-2 max-w-md mx-auto">
            <h2 className="text-2xl font-bold text-slate-800 dark:text-white">Submission Successful</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Thank you! Your ratings and comments have been registered in our database. The central administrator has been notified.
            </p>
          </div>

          <div className="border border-dashed border-slate-200 dark:border-slate-800 rounded-lg p-5 max-w-sm mx-auto text-left text-xs space-y-2">
            <div className="flex justify-between">
              <span className="text-slate-400 font-semibold">Respondent:</span>
              <span className="text-slate-700 dark:text-slate-300 font-bold">{company}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400 font-semibold">Audience Segment:</span>
              <span className="text-slate-700 dark:text-slate-300 font-bold">{activeSurvey?.surveyType}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400 font-semibold">Date Registered:</span>
              <span className="text-slate-700 dark:text-slate-300 font-bold">{new Date().toLocaleString()}</span>
            </div>
          </div>

          <div className="pt-4 flex items-center justify-center gap-3">
            <button
              onClick={handleReset}
              className="secondary-button"
              type="button"
              id="btn-submit-another"
            >
              <span>Submit Another Evaluation</span>
            </button>
            {onCancel && (
              <button
                onClick={onCancel}
                className="primary-button bg-[#0866B1] hover:bg-[#07528E]"
                type="button"
              >
                Return to Directory
              </button>
            )}
          </div>
        </div>
      )}

      {/* Draft Save Confirmation Modal */}
      {showDraftModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl max-w-md w-full border border-slate-100 dark:border-slate-800 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-6 space-y-4">
              <div className="flex items-center gap-3 text-amber-500">
                <Info size={24} className="shrink-0" />
                <h3 className="text-lg font-bold text-slate-950 dark:text-white">Save Progress Draft?</h3>
              </div>
              <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                You're about to leave this evaluation before submitting it. Would you like to save your completed answers as a draft so you can resume later, or exit without saving?
              </p>
            </div>
            <div className="bg-slate-50 dark:bg-slate-950/60 px-6 py-4 flex flex-col sm:flex-row gap-2 sm:justify-end border-t border-slate-100 dark:border-slate-800/50">
              <button
                type="button"
                onClick={handleCancelDraftModal}
                className="secondary-button order-last sm:order-none text-xs py-2"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExitWithoutSaving}
                className="px-4 py-2 text-xs font-semibold rounded-lg text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-100 dark:text-rose-400 dark:bg-rose-950/30 dark:hover:bg-rose-950/60 dark:border-rose-900/40"
              >
                Exit Without Saving
              </button>
              <button
                type="button"
                onClick={handleSaveDraft}
                className="px-4 py-2 text-xs font-bold rounded-lg text-white bg-emerald-600 hover:bg-emerald-700 shadow-sm"
              >
                Save Draft & Exit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});
