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
import { SlideDeck } from '../features/presentation/components/SlideDeck';
import { StateMessage } from '../components/StateMessage';
import { PartnerCompany, SurveyResponse, SurveyType } from '../types/survey';
import { submissionCount } from '../features/analytics/domain/analytics';
import {
  buildSlides,
  DATE_RANGE_OPTIONS,
  DateRangeId,
  describeDateRange,
  filterByDateRange,
  PRESENTATION_CATEGORIES,
  PresentationCategoryId,
} from '../features/presentation/domain/presentation';

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
      <header className="border-b border-slate-200 pb-4 dark:border-slate-800">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#eef7fc] text-[#2187CD]">
            <PresentationIcon size={18} />
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#2187CD]">Presentation Builder</p>
            <h3 className="mt-1 text-lg font-bold text-slate-800 dark:text-slate-100">Turn your analytics into a shareable deck</h3>
          </div>
        </div>
        <p className="mt-2 max-w-3xl text-xs leading-5 text-slate-500 dark:text-slate-400">
          Pick the topics you want to cover and the time window to pull data from. We'll collate the numbers into a
          polished, presentation-ready slide deck — complete with an intro, contents, and an overview that highlights
          your top performers.
        </p>
      </header>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
      <div className="min-w-0 space-y-4">
      {/* Step 1: Categories */}
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
        <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 dark:border-slate-800 min-[420px]:flex-row min-[420px]:items-center min-[420px]:justify-between">
          <div className="min-w-0">
            <h3 className="text-base font-semibold">1. What would you like to present?</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">Select one or more topics. Overview and takeaways are always included.</p>
          </div>
          <span className="badge self-start min-[420px]:self-auto">{selectedCategories.length} selected</span>
        </div>
        <div className="divide-y divide-slate-100 px-5 dark:divide-slate-800">
          {PRESENTATION_CATEGORIES.map((category) => {
            const Icon = categoryIcons[category.id];
            const active = selectedCategories.includes(category.id);
            return (
              <button
                key={category.id}
                type="button"
                onClick={() => toggleCategory(category.id)}
                aria-pressed={active}
                className={`flex w-full items-center gap-3 py-3 text-left transition ${
                  active
                    ? 'text-slate-800 dark:text-slate-100'
                    : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                }`}
              >
                <div
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                    active ? 'bg-[#eef7fc] text-[#2187CD]' : 'bg-slate-50 text-slate-400 dark:bg-slate-900'
                  }`}
                >
                  <Icon size={16} />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-800 dark:text-slate-100">{category.label}</p>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{category.description}</p>
                </div>
                <span aria-hidden="true" className={`ml-auto flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] ${active ? 'border-[#2187CD] bg-[#2187CD] text-white' : 'border-slate-300 dark:border-slate-700'}`}>{active ? '✓' : ''}</span>
              </button>
            );
          })}
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
      {/* Step 2: Time window */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-950">
        <div className="flex items-center gap-2">
          <Calendar size={16} className="text-[#2187CD]" />
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
              aria-pressed={dateRangeId === option.id}
              className={`rounded-full border px-4 py-1.5 text-sm font-semibold transition ${
                dateRangeId === option.id
                  ? 'border-[#2187CD]/40 bg-[#eef7fc] text-[#176FAE] dark:bg-sky-950/30 dark:text-sky-300'
                  : 'border-slate-200 text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-900'
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
                className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-800 focus:border-[#2187CD] focus:outline-none focus:ring-2 focus:ring-[#2187CD]/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
              To
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-800 focus:border-[#2187CD] focus:outline-none focus:ring-2 focus:ring-[#2187CD]/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            </label>
            {isCustomInvalid && (
              <p className="text-xs font-semibold text-rose-500">Pick a valid start and end date, with start before end.</p>
            )}
          </div>
        )}
      </section>

      {/* Step 3: Survey types */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-950">
        <h3 className="text-base font-semibold">3. Which stakeholder groups?</h3>
        <p className="text-sm text-slate-500 dark:text-slate-400">Leave all selected to cover every partner type.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {allSurveyTypes.map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => toggleSurveyType(type)}
              aria-pressed={surveyTypes.includes(type)}
              className={`rounded-full border px-4 py-1.5 text-sm font-semibold transition ${
                surveyTypes.includes(type)
                  ? 'border-[#2187CD]/40 bg-[#eef7fc] text-[#176FAE] dark:bg-sky-950/30 dark:text-sky-300'
                  : 'border-slate-200 text-slate-500 hover:border-slate-300 dark:border-slate-700 dark:text-slate-400'
              }`}
            >
              {type}
            </button>
          ))}
        </div>
      </section>
      </div>
      </div>

      <aside className="space-y-4 xl:sticky xl:top-5">
      {/* Step 4: Title */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-950">
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
          className="mt-3 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-[#2187CD] focus:outline-none focus:ring-2 focus:ring-[#2187CD]/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        />
      </section>


      {/* Generate */}
      <section className="flex flex-col items-start justify-between gap-4 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-950 sm:flex-row sm:items-center">
        <div>
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            {isCustomInvalid
              ? 'Fix the custom date range above to continue.'
              : dateFiltered.length > 0
              ? `Ready to generate — ${submissionCount(dateFiltered)} answered forms in this window.`
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
      </aside>
      </div>

      {!responses.length && (
        <StateMessage title="No survey data yet" message="Once evaluations start coming in, you'll be able to build a presentation here." />
      )}
    </div>
  );
}
