import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  Calendar,
  LayoutGrid,
  ListChecks,
  Presentation as PresentationIcon,
  Sparkles,
  Star,
  Trophy,
  TrendingUp,
} from 'lucide-react';
import { SlideDeck } from '../components/SlideDeck';
import { StateMessage } from '../components/StateMessage';
import { PartnerCompany, SurveyResponse, SurveyType } from '../types/survey';
import {
  buildSlides,
  DATE_RANGE_OPTIONS,
  DateRangeId,
  describeDateRange,
  filterByDateRange,
  PRESENTATION_CATEGORIES,
  PresentationCategoryId,
} from '../utils/presentation';

interface PresentPageProps {
  responses: SurveyResponse[];
  partnerCompanies: PartnerCompany[];
}

const allSurveyTypes: SurveyType[] = ['Courier', 'Supplier', 'Subcontractor'];

const categoryIcons: Record<PresentationCategoryId, typeof BarChart3> = {
  comparison: BarChart3,
  sections: LayoutGrid,
  leaderboard: Trophy,
  trends: TrendingUp,
  questions: ListChecks,
  spotlight: Star,
  distribution: AlertTriangle,
};

export function PresentPage({ responses, partnerCompanies }: PresentPageProps) {
  const [selectedCategories, setSelectedCategories] = useState<PresentationCategoryId[]>([
    'comparison',
    'leaderboard',
    'sections',
  ]);
  const [surveyTypes, setSurveyTypes] = useState<SurveyType[]>(allSurveyTypes);
  const [dateRangeId, setDateRangeId] = useState<DateRangeId>('all');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [deck, setDeck] = useState<ReturnType<typeof buildSlides> | null>(null);
  const DEFAULT_TITLE = 'Stakeholder Satisfaction Presentation';
  const [titleInput, setTitleInput] = useState(DEFAULT_TITLE);
  const [deckTitle, setDeckTitle] = useState(DEFAULT_TITLE);

  const toggleCategory = (id: PresentationCategoryId) => {
    setSelectedCategories((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]));
  };

  const toggleSurveyType = (type: SurveyType) => {
    setSurveyTypes((prev) => (prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]));
  };

  const scopedResponses = useMemo(
    () => responses.filter((r) => surveyTypes.length === 0 || surveyTypes.includes(r.surveyType)),
    [responses, surveyTypes],
  );

  const isCustomInvalid = dateRangeId === 'custom' && (!customFrom || !customTo || customFrom > customTo);

  const dateFiltered = useMemo(() => {
    if (isCustomInvalid) return [];
    return filterByDateRange(scopedResponses, { id: dateRangeId, from: customFrom, to: customTo });
  }, [scopedResponses, dateRangeId, customFrom, customTo, isCustomInvalid]);

  const canGenerate = selectedCategories.length > 0 && dateFiltered.length > 0 && !isCustomInvalid;

  const handleGenerate = () => {
    if (!canGenerate) return;
    const activeTypes = surveyTypes.length ? surveyTypes : allSurveyTypes;
    const dateRangeLabel = describeDateRange({ id: dateRangeId, from: customFrom, to: customTo }, dateFiltered);
    const finalTitle = titleInput.trim() || DEFAULT_TITLE;
    const slides = buildSlides({
      responses: dateFiltered,
      partnerCompanies,
      categoryIds: selectedCategories,
      dateRangeLabel,
      surveyTypes: activeTypes,
      presentationTitle: finalTitle,
    });
    setDeckTitle(finalTitle);
    setDeck(slides);
  };

  if (deck) {
    return <SlideDeck slides={deck} title={deckTitle} onExit={() => setDeck(null)} responses={dateFiltered} />;
  }

  return (
    <div className="space-y-5">
      <section className="panel relative overflow-hidden border-2 border-blue-100/70 bg-gradient-to-r from-[#0866B1] to-[#00457a] p-6 text-white dark:border-blue-900/40 sm:p-8">
        <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
        <div className="relative flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/15 text-white">
            <PresentationIcon size={22} />
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.3em] text-blue-100">Presentation Builder</p>
            <h3 className="text-xl font-bold text-white">Turn your analytics into a shareable deck</h3>
          </div>
        </div>
        <p className="relative mt-3 max-w-2xl text-sm text-blue-50">
          Pick the topics you want to cover and the time window to pull data from. We'll collate the numbers into a
          polished, presentation-ready slide deck — complete with an intro, contents, and an overview that highlights
          your top performers.
        </p>
      </section>

      {/* Step 1: Categories */}
      <section className="panel">
        <div className="mb-4 flex flex-col gap-3 min-[420px]:flex-row min-[420px]:items-center min-[420px]:justify-between">
          <div className="min-w-0">
            <h3 className="text-base font-semibold">1. What would you like to present?</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">Select one or more topics. Overview and takeaways are always included.</p>
          </div>
          <span className="badge self-start min-[420px]:self-auto">{selectedCategories.length} selected</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {PRESENTATION_CATEGORIES.map((category) => {
            const Icon = categoryIcons[category.id];
            const active = selectedCategories.includes(category.id);
            return (
              <button
                key={category.id}
                type="button"
                onClick={() => toggleCategory(category.id)}
                className={`flex items-start gap-3 rounded-xl border-2 p-4 text-left transition ${
                  active
                    ? 'border-[#0866B1] bg-blue-50/70 dark:border-blue-500 dark:bg-blue-950/30'
                    : 'border-slate-100 hover:border-slate-200 dark:border-slate-800 dark:hover:border-slate-700'
                }`}
              >
                <div
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                    active ? 'bg-[#0866B1] text-white' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                  }`}
                >
                  <Icon size={16} />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-800 dark:text-slate-100">{category.label}</p>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{category.description}</p>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Step 2: Time window */}
      <section className="panel">
        <div className="flex items-center gap-2">
          <Calendar size={16} className="text-[#0866B1] dark:text-blue-400" />
          <h3 className="text-base font-semibold">2. What time window?</h3>
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400">Narrow the deck to a specific reporting period, or cover everything on record.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {DATE_RANGE_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setDateRangeId(option.id)}
              title={option.description}
              className={`rounded-full border px-4 py-1.5 text-sm font-semibold transition ${
                dateRangeId === option.id
                  ? 'border-[#0866B1] bg-[#0866B1] text-white'
                  : 'border-slate-200 text-slate-500 hover:border-slate-300 dark:border-slate-700 dark:text-slate-400'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
        {dateRangeId === 'custom' && (
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
              From
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-800 focus:border-[#0866B1] focus:outline-none focus:ring-1 focus:ring-[#0866B1] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
              To
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-800 focus:border-[#0866B1] focus:outline-none focus:ring-1 focus:ring-[#0866B1] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            </label>
            {isCustomInvalid && (
              <p className="text-xs font-semibold text-rose-500">Pick a valid start and end date, with start before end.</p>
            )}
          </div>
        )}
      </section>

      {/* Step 3: Survey types */}
      <section className="panel">
        <h3 className="text-base font-semibold">3. Which stakeholder groups?</h3>
        <p className="text-sm text-slate-500 dark:text-slate-400">Leave all selected to cover every partner type.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {allSurveyTypes.map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => toggleSurveyType(type)}
              className={`rounded-full border px-4 py-1.5 text-sm font-semibold transition ${
                surveyTypes.includes(type)
                  ? 'border-[#0866B1] bg-[#0866B1] text-white'
                  : 'border-slate-200 text-slate-500 hover:border-slate-300 dark:border-slate-700 dark:text-slate-400'
              }`}
            >
              {type}
            </button>
          ))}
        </div>
      </section>

      {/* Step 4: Title */}
      <section className="panel">
        <h3 className="text-base font-semibold">4. Give it a title</h3>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Shown on the cover slide and the presentation window — make it your own.
        </p>
        <input
          type="text"
          value={titleInput}
          onChange={(e) => setTitleInput(e.target.value)}
          placeholder={DEFAULT_TITLE}
          maxLength={120}
          className="mt-3 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-800 focus:border-[#0866B1] focus:outline-none focus:ring-1 focus:ring-[#0866B1] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        />
      </section>


      {/* Generate */}
      <section className="panel flex flex-col items-center justify-between gap-4 sm:flex-row">
        <div>
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            {isCustomInvalid
              ? 'Fix the custom date range above to continue.'
              : dateFiltered.length > 0
              ? `Ready to generate — ${dateFiltered.length} responses in this window.`
              : 'No responses match this selection yet.'}
          </p>
          <p className="text-xs text-slate-400">
            {selectedCategories.length} topic{selectedCategories.length === 1 ? '' : 's'} selected ·{' '}
            {DATE_RANGE_OPTIONS.find((o) => o.id === dateRangeId)?.label}
          </p>
        </div>
        <button type="button" onClick={handleGenerate} disabled={!canGenerate} className="primary-button disabled:cursor-not-allowed disabled:opacity-40">
          <Sparkles size={16} />
          <span>Generate Presentation</span>
        </button>
      </section>

      {!responses.length && (
        <StateMessage title="No survey data yet" message="Once evaluations start coming in, you'll be able to build a presentation here." />
      )}
    </div>
  );
}
