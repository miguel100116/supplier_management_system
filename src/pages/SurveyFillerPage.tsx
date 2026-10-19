import { useState, useMemo, useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import { useModalEscape } from '../hooks/useModalEscape';
import { motion, useReducedMotion } from 'motion/react';
import { CheckCircle, Info, Shield, ArrowRight, ClipboardCopy, Send, UserCheck, ArrowLeft, X } from 'lucide-react';
import { CustomForm, Rating, PartnerCompany } from '../types/survey';
import { formatSurveyDateRange, validateSurveyDateRange } from '../features/evaluations/domain/surveyDates';
import { SurveyDateRangeQuestion } from '../features/evaluations/components/SurveyDateRangeQuestion';
import { RatingScale } from '../features/evaluations/components/RatingScale';
import { resolveSelectableSurveyId } from '../features/evaluations/domain/surveySelection';
import { getQuestionMaxPoints } from '../data/questionWeights';
import { getSurveyEvaluationCompanies } from '../utils/analytics';
import { EmployeeCompanyIcon } from '../features/employee-experience/components/EmployeeCompanyIcon';

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
   * (step 1 or 3), `onAllowed` is invoked immediately. `onCancelled` runs if
   * the respondent chooses to stay on the form.
   */
  attemptExit: (onAllowed: () => void, onCancelled?: () => void) => void;
}

interface PendingExit {
  onAllowed: () => void;
  onCancelled?: () => void;
}

interface SurveyFillerPageProps {
  surveys: CustomForm[];
  partnerCompanies: PartnerCompany[];
  initialSurveyId?: string | null;
  initialCompanyName?: string;
  employeeExperience?: boolean;
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
  ) => string | null;
  onCancel?: () => void;
}

export const SurveyFillerPage = forwardRef<SurveyFillerHandle, SurveyFillerPageProps>(function SurveyFillerPage(
  { surveys, partnerCompanies = [], initialSurveyId, initialCompanyName = '', employeeExperience = false, userEmail, defaultDepartment, defaultRespondentType, responses, onSubmitted, onCancel },
  ref
) {
  const shouldReduceMotion = useReducedMotion() ?? false;
  const successContainerVariants = {
    hidden: { opacity: 0, y: shouldReduceMotion ? 0 : 8 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: shouldReduceMotion ? 0 : 0.42,
        ease: 'easeOut' as const,
        delayChildren: shouldReduceMotion ? 0 : 0.04,
        staggerChildren: shouldReduceMotion ? 0 : 0.055,
      },
    },
  };
  const successItemVariants = {
    hidden: { opacity: 0, y: shouldReduceMotion ? 0 : 7 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: shouldReduceMotion ? 0 : 0.3, ease: 'easeOut' as const },
    },
  };
  const successCopyVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        delayChildren: shouldReduceMotion ? 0 : 0.025,
        staggerChildren: shouldReduceMotion ? 0 : 0.045,
      },
    },
  };
  const [selectedSurveyId, setSelectedSurveyId] = useState<string>(() => resolveSelectableSurveyId(surveys, initialSurveyId));
  const [step, setStep] = useState<1 | 2 | 3>(1); // 1: Info, 2: Questions, 3: Success
  const [showReview, setShowReview] = useState(false);
  const [showDraftModal, setShowDraftModal] = useState(false);
  const [draftSaveError, setDraftSaveError] = useState('');
  // True once the respondent has entered the Questions Form at least once for
  // this session. Lets us tell apart the *first* transition into step 2
  // (where answers should be freshly initialized from any saved draft) from
  // a *later* transition via the "Return" button (where in-progress answers
  // already sitting in state must be preserved, not overwritten).
  const [hasStartedForm, setHasStartedForm] = useState(false);
  // Holds the navigation callback to run once the respondent resolves the
  // "Save Progress Draft?" warning, when that warning was triggered by
  // navigation initiated OUTSIDE this component (e.g. sidebar Home click).
  const pendingExitRef = useRef<PendingExit | null>(null);
  // Timestamp captured the moment the respondent first enters the Questions
  // Form for this submission (see setHasStartedForm(true) below) - a ref,
  // not state, since it's read-only until submit and shouldn't trigger
  // re-renders. Cleared on handleReset so the next submission gets its own.
  const startTimeRef = useRef<string | null>(null);

  // Respondent metadata
  const [company, setCompany] = useState('');
  const department = defaultDepartment ?? '';
  const respondentType = defaultRespondentType ?? '';
  const hasOrganizationalProfile = Boolean(department && respondentType);
  const [address, setAddress] = useState('');
  const [periodCovered, setPeriodCovered] = useState('1st Half');

  // Answers state
  const [ratings, setRatings] = useState<Record<string, any>>({});
  const [comments, setComments] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [copyPreviousAnswers, setCopyPreviousAnswers] = useState(true);

  const activeSurvey = surveys.find((s) => s.id === selectedSurveyId);
  useEffect(() => {
    const nextId = resolveSelectableSurveyId(surveys, selectedSurveyId);
    if (nextId === selectedSurveyId) return;
    setSelectedSurveyId(nextId);
    setStep(1);
    setCompany('');
    setRatings({});
    setComments({});
    setValidationErrors({});
    setError('');
    setHasStartedForm(false);
    setShowReview(false);
    startTimeRef.current = null;
  }, [surveys, selectedSurveyId]);

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

  const selectedPartnerCompany = matchingCompanies.find((item) => item.name === company)
    ?? allCompaniesOfThisType.find((item) => item.name === company);
  const selectedCompanyAddress = selectedPartnerCompany?.branches
    ?.map((branch) => branch.address?.trim())
    .find((branchAddress): branchAddress is string => Boolean(branchAddress)) ?? '';

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
      setCompany(matchingCompanies.some((item) => item.name === initialCompanyName)
        ? initialCompanyName
        : matchingCompanies[0].name);
    } else {
      setCompany('');
    }
  }, [matchingCompanies, initialCompanyName]);

  useEffect(() => {
    if (employeeExperience) setAddress(selectedCompanyAddress);
  }, [employeeExperience, selectedCompanyAddress]);

  useImperativeHandle(ref, () => ({
    attemptExit: (onAllowed: () => void, onCancelled?: () => void) => {
      if (step === 2) {
        // Mid-survey: don't let external navigation (Home, sidebar, etc.)
        // silently wipe in-progress answers - surface the same draft warning.
        pendingExitRef.current = { onAllowed, onCancelled };
        setDraftSaveError('');
        setShowDraftModal(true);
      } else {
        onAllowed();
      }
    },
  }), [step]);

  const handleStartForm = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!hasOrganizationalProfile) {
      setError('Your Department and Designation are not assigned. Please contact an administrator before submitting an evaluation.');
      return;
    }

    if (!company.trim() && !hasEvaluatedAll) {
      setError('Please provide your organization or company name.');
      return;
    }

    if (!activeSurvey) {
      setError('Please select a survey form to respond to.');
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
    const draftKey = `survey_analytics_draft_${selectedSurveyId}_${company}`;
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
      pendingExit.onAllowed();
    } else if (onCancel) {
      onCancel();
    }
  };

  const handleSaveDraft = () => {
    if (!selectedSurveyId || !company) {
      finishExit();
      return;
    }
    const draftKey = `survey_analytics_draft_${selectedSurveyId}_${company}`;
    const draftData = {
      ratings,
      comments,
      periodCovered,
      department,
      respondentType,
      address,
    };
    try {
      localStorage.setItem(draftKey, JSON.stringify(draftData));
      setDraftSaveError('');
      finishExit();
    } catch {
      setDraftSaveError('Your draft could not be saved. Check your browser storage and try again. Your answers are still open in this evaluation.');
    }
  };

  const handleExitWithoutSaving = () => {
    if (selectedSurveyId && company) {
      const draftKey = `survey_analytics_draft_${selectedSurveyId}_${company}`;
      localStorage.removeItem(draftKey);
    }
    finishExit();
  };

  const handleCancelDraftModal = () => {
    // Respondent chose to stay on the form - cancel any pending external
    // navigation instead of letting it fire later.
    const pendingExit = pendingExitRef.current;
    pendingExitRef.current = null;
    setDraftSaveError('');
    setShowDraftModal(false);
    pendingExit?.onCancelled?.();
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

    const range = { from: ratings[qId]?.from || '', to: ratings[qId]?.to || '', [field]: value };
    const message = Object.values(validateSurveyDateRange(range)).join(' ');
    setValidationErrors((prev) => {
      const next = { ...prev };
      if (message) next[qId] = message;
      else delete next[qId];
      return next;
    });
  };

  const handleCommentChange = (qId: string, value: string) => {
    setComments((prev) => ({ ...prev, [qId]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeSurvey) return;
    if (!hasOrganizationalProfile) {
      setError('Your Department and Designation are not assigned. Please contact an administrator before submitting an evaluation.');
      return;
    }

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
        const message = Object.values(validateSurveyDateRange({ from: val?.from || '', to: val?.to || '' })).join(' ');
        if (message) errors[q.questionId] = message;
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

    if (employeeExperience && !showReview) {
      setShowReview(true);
      return;
    }

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
        const drStr = formatSurveyDateRange({ from: val?.from || '', to: val?.to || '' });
        finalComment = drStr + (finalComment ? ` | Comment detail: ${finalComment}` : '');
      } else {
        ratingVal = ratings[q.questionId] === 'N/A'
          ? 'N/A'
          : typeof ratings[q.questionId] === 'number' ? ratings[q.questionId] : qMax;
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

    const responseId = onSubmitted(
      selectedSurveyId,
      company.trim(),
      department,
      respondentType,
      address.trim(),
      formattedAnswers,
      startTimeRef.current ?? undefined
    );
    if (!responseId) {
      setError('Your evaluation could not be submitted. Please try again.');
      return;
    }

    if (selectedSurveyId && company) {
      const draftKey = `survey_analytics_draft_${selectedSurveyId}_${company.trim()}`;
      localStorage.removeItem(draftKey);
    }

    setStep(3);
  };

  const handleReset = () => {
    setCompany('');
    setAddress('');
    setPeriodCovered('1st Half');
    setRatings({});
    setComments({});
    setValidationErrors({});
    setError('');
    setHasStartedForm(false);
    setShowReview(false);
    startTimeRef.current = null;
    setStep(1);
  };

  if (!activeSurvey && surveys.length === 0) {
    return (
      <div className="employee-survey-empty panel mx-auto max-w-2xl p-6 text-center sm:p-12" id="survey-filler-empty">
        <Info size={40} className="mx-auto text-amber-500 mb-4" />
        <h3 className="text-xl font-bold">No Surveys Available</h3>
        <p className="text-slate-500 dark:text-slate-400 mt-2">No survey forms are available for your account right now.</p>
      </div>
    );
  }

  return (
    <div className={`employee-survey-filler ${employeeExperience ? 'form-workspace' : 'max-w-3xl mx-auto space-y-6'}`} id="survey-filler-container">
      {employeeExperience && step < 3 && (
        <section className="evaluation-progress-panel" aria-label="Evaluation workflow">
        {step === 2 && !showReview && (
        <div className="flex items-center justify-between pb-2">
          <button
            onClick={() => { setShowReview(false); setStep(1); }}
            className="secondary-button back-link flex items-center gap-2 text-xs py-1.5 px-3"
            type="button"
          >
            <ArrowLeft size={14} />
            <span>Return</span>
          </button>
        </div>
      )}
        <div className="workflow-steps" aria-label="Evaluation progress">
          <div className={step === 1 ? 'current' : 'completed'}><span>{step === 1 ? '1' : <CheckCircle size={14} aria-label="Completed" />}</span>Evaluation details<i /></div>
          <div className={step === 2 && !showReview ? 'current' : showReview ? 'completed' : ''}><span>{showReview ? <CheckCircle size={14} aria-label="Completed" /> : '2'}</span>Your feedback<i /></div>
          <div className={showReview ? 'current' : ''}><span>3</span>Review &amp; submit</div>
        </div>
        </section>
      )}

      {!employeeExperience && step === 2 && !showReview && (
        <div className="flex items-center justify-between pb-2">
          <button onClick={() => { setShowReview(false); setStep(1); }} className="secondary-button flex items-center gap-2 text-xs py-1.5 px-3" type="button">
            <ArrowLeft size={14} /><span>Return</span>
          </button>
        </div>
      )}

      {!employeeExperience && <div className="flex items-center justify-between gap-2 px-1 sm:px-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold"><span className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${step >= 1 ? 'bg-[#0063a9] text-white' : 'bg-slate-200 text-slate-500'}`}>1</span><span>Respondent Info</span></div>
        <div className="mx-1 h-px flex-1 bg-slate-200 dark:bg-slate-800 sm:mx-4" />
        <div className="flex items-center gap-1.5 text-xs font-semibold"><span className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${step >= 2 ? 'bg-[#0063a9] text-white' : 'bg-slate-200 text-slate-500'}`}>2</span><span>Questions Form</span></div>
        <div className="mx-1 h-px flex-1 bg-slate-200 dark:bg-slate-800 sm:mx-4" />
        <div className="flex items-center gap-1.5 text-xs font-semibold"><span className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${step >= 3 ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-500'}`}>3</span><span>Success</span></div>
      </div>}

      {employeeExperience && step < 3 && activeSurvey && (
        <section className="evaluation-context" aria-label="Selected evaluation">
          <div className={`company-avatar ${activeSurvey.surveyType === 'Courier' ? 'avatar-blue' : 'avatar-purple'}`} aria-hidden="true"><EmployeeCompanyIcon type={activeSurvey.surveyType} size={23} /></div>
          <div>
            <span className="type-tag">{activeSurvey.surveyType}</span>
            <h1>{company || activeSurvey.title}</h1>
            <p>{activeSurvey.title}{periodCovered ? ` · ${periodCovered}` : ''}</p>
          </div>
        </section>
      )}

      {step === 1 && (
        <div className={`panel ${employeeExperience ? 'form-panel space-y-6' : 'space-y-6 p-4 min-[420px]:p-6 sm:p-10'}`} id="survey-filler-step-1">
          {!employeeExperience ? <div className="text-center max-w-xl mx-auto space-y-2"><p className="text-[10px] uppercase tracking-widest text-[#0063a9] font-bold">Microsoft Forms Ingress</p><h2 className="text-2xl font-bold">Stakeholder Feedback Form</h2><p className="text-sm text-slate-500">Provide your details and complete the official MBS stakeholder evaluation survey. Your feedback directly impacts operations.</p></div> : null}
          {employeeExperience && <div className="form-section-heading"><h2>Evaluation details</h2><p>Confirm the partner and evaluation details before sharing your feedback.</p></div>}

          {employeeExperience && <div className="respondent-summary">
            <div><span>RESPONDENT</span><strong>{userEmail || 'Signed-in employee'}</strong></div>
            <div><span>DEPARTMENT</span><strong>{department || 'Not assigned'}</strong></div>
            <div><span>DESIGNATION</span><strong>{respondentType || 'Not assigned'}</strong></div>
          </div>}

          {employeeExperience && <div className="evaluation-guidance">
            <Info size={17} />
            <p>Answer based on your own experience with <strong>{company}</strong>. You’ll have a chance to review everything before submitting.</p>
          </div>}

          {hasEvaluatedAll && (
            <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-5 text-sm text-emerald-800 dark:bg-emerald-950/20 dark:border-emerald-900/40 flex items-start gap-3 shadow-xs">
              <CheckCircle size={20} className="text-emerald-500 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-bold">All Registered Companies Evaluated!</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  You have already successfully evaluated all registered partner companies matching the <strong>{activeSurvey?.surveyType}</strong> category. There are no additional partner evaluations required at this time.
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

          <form onSubmit={handleStartForm} className={employeeExperience ? 'space-y-5' : 'space-y-5 border-t border-slate-100 pt-6 dark:border-slate-800'}>
            {!employeeExperience && <div className="bg-[#0063a9]/10 text-[#0063a9] font-bold px-4 py-2.5 rounded-lg text-sm uppercase tracking-wider border border-[#0063a9]/10 shadow-xs mb-6">Section 1: Details</div>}

            {!employeeExperience && surveys.length > 1 ? (
              <div>
                <label htmlFor="filler-survey" className="field-label">Survey Form to Answer *</label>
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
            ) : !employeeExperience && activeSurvey && (
              <div className="rounded-lg bg-slate-50 border border-slate-200 px-4 py-2.5 text-xs text-slate-500 dark:bg-slate-900/40 dark:border-slate-800">
                Survey Form: <strong className="text-slate-700 dark:text-slate-200">{activeSurvey.title}</strong> ({activeSurvey.surveyType})
              </div>
            )}

            {!hasEvaluatedAll ? (
              <>
                {!employeeExperience && <div className="grid gap-4 sm:grid-cols-2 mb-5">
                  <div>
                    <label htmlFor="filler-dept" className="field-label">Associated Department</label>
                    <input
                      id="filler-dept"
                      type="text"
                      className="field bg-slate-50 dark:bg-slate-900/40"
                      value={department || 'Not assigned'}
                      readOnly
                      aria-readonly="true"
                    />
                  </div>

                  <div>
                    <label htmlFor="filler-role" className="field-label">Designation</label>
                    <input
                      id="filler-role"
                      type="text"
                      className="field bg-slate-50 dark:bg-slate-900/40"
                      value={respondentType || 'Not assigned'}
                      readOnly
                      aria-readonly="true"
                    />
                  </div>
                </div>}

                {!employeeExperience && !hasOrganizationalProfile && (
                  <p className="mb-5 text-sm text-amber-700 dark:text-amber-400" role="status">
                    Your Department and Designation are not assigned. Please contact an administrator before submitting an evaluation.
                  </p>
                )}

                {!employeeExperience && <div>
                  <label htmlFor="filler-company" className="field-label">Select Partner Company to Evaluate *</label>
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
                </div>}

                <div>
                  <label htmlFor="filler-address" className="field-label">Address</label>
                  <input
                    id="filler-address"
                    type="text"
                    className="field"
                    value={address}
                    readOnly={employeeExperience}
                    aria-readonly={employeeExperience || undefined}
                    placeholder={employeeExperience ? 'Address not available' : 'Enter Company Address'}
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
                    className="flex cursor-pointer items-start gap-3 rounded-lg border border-[#0063a9]/20 bg-[#0063a9]/5 p-4 text-sm dark:border-blue-900/40 dark:bg-blue-950/20"
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
                        whatever's different for this company instead of rating every question from scratch.
                      </span>
                    </span>
                  </label>
                )}
              </>
            ) : (
              <div className="text-center py-6 text-slate-400 text-xs">
                Fields are locked since all companies are evaluated.
              </div>
            )}

            <div className={employeeExperience ? 'form-bottom' : 'flex justify-end border-t border-slate-100 pt-5 dark:border-slate-800'}>
              {!hasEvaluatedAll && (
                <button
                  type="submit"
                  className="primary-button w-full bg-[#0063a9] hover:bg-[#00528c] min-[420px]:w-auto"
                  id="btn-filler-next"
                  disabled={!hasOrganizationalProfile}
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
        <form onSubmit={handleSubmit} className={employeeExperience ? 'panel form-panel feedback-panel space-y-4' : 'space-y-6'} id="survey-filler-step-2">
          {/* Form Header Info card */}
          {employeeExperience ? <div className="form-section-heading"><h2>{showReview ? 'Review your evaluation' : 'Your feedback'}</h2><p>{showReview ? 'Check your responses before submitting this evaluation.' : activeSurvey.description}</p></div> : <div className="panel bg-[#0063a9]/5 border-blue-100 dark:border-blue-900/30"><h3 className="text-lg font-bold text-[#0063a9] dark:text-blue-300">{activeSurvey.title}</h3><p className="text-xs text-slate-500 mt-1 dark:text-slate-400">{activeSurvey.description}</p><div className="flex flex-wrap items-center gap-4 mt-3 text-xs text-slate-500 dark:text-slate-400 pt-3 border-t border-blue-400/10"><div>Company: <strong className="text-slate-700 dark:text-slate-200">{company}</strong></div><div className="hidden sm:inline text-slate-300">|</div><div>Department: <strong className="text-slate-700 dark:text-slate-200">{department}</strong></div><div className="hidden sm:inline text-slate-300">|</div><div>Role: <strong className="text-slate-700 dark:text-slate-200">{respondentType}</strong></div></div></div>}

          {employeeExperience && showReview && (
            <div className="respondent-summary">
              <div><span>PARTNER</span><strong>{company}</strong></div>
              <div><span>DEPARTMENT</span><strong>{department || 'Not assigned'}</strong></div>
              <div><span>DESIGNATION</span><strong>{respondentType || 'Not assigned'}</strong></div>
            </div>
          )}

          {error && (
            <div className="validation-error flex items-center gap-2" role="alert">
              <Info size={16} />
              <span>{error}</span>
            </div>
          )}

          {showReview && (
            <section className="review-summary" aria-label="Evaluation answers">
              {activeSurvey.questions.filter((question) => question.question !== 'Period Covered').map((question, index) => {
                const answer = ratings[question.questionId];
                const answerText = answer == null || answer === ''
                  ? 'Not answered'
                  : Array.isArray(answer)
                    ? answer.join(', ')
                    : typeof answer === 'object'
                      ? question.inputType === 'matrix' && question.subQuestions
                        ? question.subQuestions.map((sub) => `${sub.label}: ${answer[sub.id] || 'Not answered'}`).join(' · ')
                        : Object.entries(answer).map(([key, value]) => `${key}: ${value || '—'}`).join(' · ')
                      : String(answer);
                return (
                  <div className="answer-row" key={question.questionId}>
                    <div>
                      <span>QUESTION {index + 1}</span>
                      <p>{question.question}</p>
                      <p>{answerText}</p>
                      {comments[question.questionId] && <p>Comment: {comments[question.questionId]}</p>}
                    </div>
                  </div>
                );
              })}
            </section>
          )}

          {/* Form questions list */}
          {(!employeeExperience || !showReview) && <div className="space-y-5">
            {(() => {
              let currentSection = '';
              const questionsToRender = activeSurvey.questions.filter(q => q.question !== 'Period Covered');
              return questionsToRender.map((q, idx) => {
                const showSectionHeader = q.section && q.section !== currentSection;
                if (showSectionHeader) {
                  currentSection = q.section!;
                }

                const maxVal = getQuestionMaxPoints(activeSurvey.surveyType, q.questionId);
                const ratingMin = q.inputType === 'typed-rating' ? (q.validationRange?.min ?? 0) : 0;
                const ratingMax = q.inputType === 'typed-rating' ? (q.validationRange?.max ?? 100) : maxVal;
                const ratingAllowsNa = q.inputType === 'typed-rating' ? (q.validationRange?.allowNa ?? true) : true;
                const currentRating = ratings[q.questionId] !== undefined ? ratings[q.questionId] : maxVal;

                return (
                  <div key={q.questionId} className="space-y-3">
                    {showSectionHeader && (
                      <div className="pt-6 pb-1 first:pt-0">
                        <div className="bg-[#0063a9]/10 text-[#0063a9] dark:bg-blue-950/40 dark:text-blue-300 font-bold px-4 py-2.5 rounded-lg text-sm uppercase tracking-wider border border-[#0063a9]/10 shadow-xs">
                          {q.section}
                        </div>
                      </div>
                    )}

                    <div
                      id={`q-container-${q.questionId}`}
                      data-question-order={idx}
                      className={employeeExperience
                        ? `question space-y-4 ${validationErrors[q.questionId] ? 'validation-error' : ''}`
                        : `panel p-5 space-y-4 shadow-sm hover:shadow-md transition duration-200 border-l-4 ${validationErrors[q.questionId] ? 'border-l-rose-500 bg-rose-50/10 ring-1 ring-rose-300' : 'border-l-[#0063a9]'}`}
                    >
                      <div className="space-y-1">
                        <div className="flex items-start justify-between gap-4">
                          <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-100 leading-relaxed">
                            <span className="text-slate-400 font-bold mr-1.5">{idx + 1}.</span>
                            {q.question} <span className="text-rose-500 font-bold">*</span>
                          </h4>
                          {!employeeExperience && <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                            {q.questionCategory}
                          </span>}
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
                                    className="w-4 h-4 rounded border-slate-300 text-[#0063a9] focus:ring-[#0063a9]"
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
                        <SurveyDateRangeQuestion
                          id={`survey-date-${q.questionId}`}
                          value={{ from: ratings[q.questionId]?.from || '', to: ratings[q.questionId]?.to || '' }}
                          showErrors={Boolean(validationErrors[q.questionId])}
                          onChange={(field, date) => handleDateRangeChange(q.questionId, field, date)}
                        />
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
                                      {sub.description && <div className="text-xs text-[#0063a9] dark:text-blue-400 mt-2 font-medium">{sub.description}</div>}
                                    </td>
                                    {[2, 1, 0, 'N/A'].map(opt => (
                                      <td key={opt} className="py-4 text-center">
                                        <input 
                                          type="radio"
                                          name={`matrix-${q.questionId}-${sub.id}`}
                                          className="w-4 h-4 text-[#0063a9] border-slate-300 focus:ring-[#0063a9]"
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
                      ) : (
                        <div>
                          <RatingScale
                            questionId={q.questionId}
                            questionOrder={idx}
                            min={ratingMin}
                            max={ratingMax}
                            allowNa={ratingAllowsNa}
                            value={q.inputType === 'typed-rating'
                              ? (ratings[q.questionId] === 'N/A'
                                ? 'N/A'
                                : ratings[q.questionId] !== undefined && ratings[q.questionId] !== '' && Number.isInteger(Number(ratings[q.questionId]))
                                  ? Number(ratings[q.questionId])
                                  : undefined)
                              : currentRating}
                            label={`Rating for question ${idx + 1}`}
                            onChange={(value) => {
                              handleRatingChange(q.questionId, value);
                              if (validationErrors[q.questionId]) {
                                setValidationErrors((previous) => {
                                  const next = { ...previous };
                                  delete next[q.questionId];
                                  return next;
                                });
                              }
                            }}
                          />
                          {validationErrors[q.questionId] && (
                            <p className={`${employeeExperience ? 'employee-rating-validation-message' : 'mt-2'} flex items-center gap-1 text-xs font-semibold text-rose-500`} role="alert">
                              <span className="inline-block h-1.5 w-1.5 rounded-full bg-rose-500" />
                              {validationErrors[q.questionId]}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              });
            })()}
          </div>}

          {/* Form Footer */}
          <div className={employeeExperience ? 'form-bottom' : 'panel flex flex-col-reverse gap-3 p-4 min-[420px]:flex-row min-[420px]:items-center min-[420px]:justify-between sm:p-5'}>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => employeeExperience && showReview ? setShowReview(false) : setStep(1)}
                className="secondary-button flex items-center gap-1.5"
              >
                <ArrowLeft size={14} />
                <span>{employeeExperience && showReview ? 'Edit answers' : 'Return'}</span>
              </button>
            </div>
            
            <button
              type="submit"
              className={employeeExperience ? 'primary-button' : 'primary-button w-full bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 min-[420px]:w-auto'}
              id="btn-filler-submit"
            >
              {employeeExperience && showReview ? <Send size={14} /> : employeeExperience ? <ArrowRight size={14} /> : <Send size={14} />}
              <span>{employeeExperience ? showReview ? 'Submit evaluation' : 'Review answers' : 'Submit Evaluation'}</span>
            </button>
          </div>
        </form>
      )}

      {step === 3 && (
        <motion.div
          className={`${employeeExperience ? 'panel confirmation' : 'panel space-y-6 p-6 text-center sm:p-16'} submission-success`}
          id="survey-filler-success"
          variants={successContainerVariants}
          initial="hidden"
          animate="visible"
        >
          <motion.div
            className={`${employeeExperience ? 'success-mark' : 'inline-flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 text-emerald-500 dark:bg-emerald-950/30 dark:text-emerald-400'} submission-success-icon`}
            variants={{
              hidden: { opacity: 0, scale: shouldReduceMotion ? 1 : 0.78 },
              visible: {
                opacity: 1,
                scale: 1,
                transition: shouldReduceMotion
                  ? { duration: 0 }
                  : { type: 'spring', stiffness: 300, damping: 24 },
              },
            }}
          >
            <svg aria-hidden="true" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <motion.path
                d="m9 12 2 2 4-4"
                initial={{ pathLength: shouldReduceMotion ? 1 : 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: shouldReduceMotion ? 0 : 0.28, delay: shouldReduceMotion ? 0 : 0.16, ease: 'easeOut' }}
              />
            </svg>
          </motion.div>

          {employeeExperience ? <><motion.h1 variants={successItemVariants}>Thank you for your feedback</motion.h1><motion.p variants={successItemVariants}>Your evaluation for <strong>{company}</strong> has been submitted.</motion.p></> : <motion.div className="space-y-2 max-w-md mx-auto" variants={successCopyVariants}><motion.h2 className="text-2xl font-bold text-slate-800 dark:text-white" variants={successItemVariants}>Submission Successful</motion.h2><motion.p className="text-sm text-slate-500 dark:text-slate-400" variants={successItemVariants}>Thank you! Your ratings and comments have been registered in our database. The central administrator has been notified.</motion.p></motion.div>}

          {employeeExperience ? <motion.div className="confirmation-meta" variants={successItemVariants}><CheckCircle size={16} /><span>{activeSurvey?.title} — {new Date().toLocaleDateString()}</span></motion.div> : <motion.div className="border border-dashed border-slate-200 dark:border-slate-800 rounded-lg p-5 max-w-sm mx-auto text-left text-xs space-y-2" variants={successItemVariants}><div className="flex justify-between"><span className="text-slate-400 font-semibold">Respondent:</span><span className="text-slate-700 dark:text-slate-300 font-bold">{company}</span></div><div className="flex justify-between"><span className="text-slate-400 font-semibold">Audience Segment:</span><span className="text-slate-700 dark:text-slate-300 font-bold">{activeSurvey?.surveyType}</span></div><div className="flex justify-between"><span className="text-slate-400 font-semibold">Date Registered:</span><span className="text-slate-700 dark:text-slate-300 font-bold">{new Date().toLocaleString()}</span></div></motion.div>}
          {employeeExperience && <motion.small variants={successItemVariants}>Your response is recorded with your employee account.</motion.small>}

          <motion.div className={employeeExperience ? 'confirmation-actions' : 'pt-4 flex items-center justify-center gap-3'} variants={successItemVariants}>
            <button
              onClick={handleReset}
              className="secondary-button"
              type="button"
              id="btn-submit-another"
            >
                <span>{employeeExperience ? 'Start another evaluation' : 'Submit Another Evaluation'}</span>
            </button>
            {onCancel && (
              <button
                onClick={onCancel}
                className={employeeExperience ? 'primary-button' : 'primary-button bg-[#0063a9] hover:bg-[#00528c]'}
                type="button"
              >
                {employeeExperience ? 'Return to Evaluations' : 'Return to Directory'}
              </button>
            )}
          </motion.div>
        </motion.div>
      )}

      {/* Draft Save Confirmation Modal */}
      {showDraftModal && (
          <div className={employeeExperience ? 'fixed inset-0 modal-backdrop' : 'fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-200'}>
          <div className={employeeExperience ? 'modal draft-confirmation-modal' : 'bg-white dark:bg-slate-900 rounded-xl shadow-xl max-w-md w-full border border-slate-100 dark:border-slate-800 overflow-hidden animate-in fade-in zoom-in-95 duration-200'} role="dialog" aria-modal="true" aria-labelledby="draft-modal-title" aria-describedby="draft-modal-description">
            {employeeExperience && <button type="button" className="draft-modal-close" aria-label="Close save progress dialog" onClick={handleCancelDraftModal}><X size={18} aria-hidden="true" /></button>}
            <div className={employeeExperience ? 'draft-modal-content' : 'p-6 space-y-4'}>
              <div className="draft-modal-heading">
                <h2 id="draft-modal-title">Save your progress?</h2>
              </div>
              <p className="modal-subtitle" id="draft-modal-description">
                You have an unfinished evaluation. Save your answers as a draft to continue later, or leave without saving.
              </p>
              {draftSaveError && <p className="draft-save-error" role="alert">{draftSaveError}</p>}
            </div>
            <div className={employeeExperience ? 'confirmation-actions' : 'bg-slate-50 dark:bg-slate-950/60 px-6 py-4 flex flex-col sm:flex-row gap-2 sm:justify-end border-t border-slate-100 dark:border-slate-800/50'}>
              {!employeeExperience && <button
                type="button"
                onClick={handleCancelDraftModal}
                className="secondary-button order-last sm:order-none text-xs py-2"
              >Cancel</button>}
              <button
                type="button"
                onClick={handleExitWithoutSaving}
                className={employeeExperience ? 'secondary-button exit-without-saving' : 'px-4 py-2 text-xs font-semibold rounded-lg text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-100 dark:text-rose-400 dark:bg-rose-950/30 dark:hover:bg-rose-950/60 dark:border-rose-900/40'}
              >
                Exit Without Saving
              </button>
              <button
                type="button"
                onClick={handleSaveDraft}
                className={employeeExperience ? 'primary-button' : 'px-4 py-2 text-xs font-bold rounded-lg text-white bg-[#2187CD] hover:bg-[#176FAE] shadow-sm'}
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
