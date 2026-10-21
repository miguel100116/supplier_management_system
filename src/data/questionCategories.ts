import { SurveyType } from '../types/survey';

// Fixed 6th category available on every survey type, for whole-company
// feedback that doesn't belong to any of the 5 scored categories below
// (the intake "Period Covered" field and the closing "Overall Comments and
// Feedback" question). Not customizable via the Categories Manager and not
// counted among each type's 5 categories.
export const OVERALL_CATEGORY = 'Overall';

// Legacy label some already-stored surveys/responses used to carry for the
// same "not one of the 5" bucket before it was renamed. useSurveyData.ts
// self-heals stored data to OVERALL_CATEGORY on load, but this is kept here
// too so anything reading older data directly still recognizes it.
export const LEGACY_OVERALL_CATEGORY = 'General';

export function isOverallCategory(category: string): boolean {
  return category === OVERALL_CATEGORY || category === LEGACY_OVERALL_CATEGORY;
}

// The 5 scoring categories used per survey type, matching the current
// production question set (src/hooks/useSurveyData.ts). This is the
// "factory" set the Categories Manager seeds from and can restore to - the
// live (possibly admin-renamed) set is tracked separately, see
// getStoredCategoryLabels below.
export const DEFAULT_CATEGORIES: Record<SurveyType, string[]> = {
  Courier: ['Delivery', 'Commercial', 'Technology', 'Support', 'Security'],
  Supplier: ['Documentation', 'Delivery', 'Price', 'Quality', 'Communication'],
  Subcontractor: ['Delivery', 'Documentation', 'Cost', 'Quality', 'Communication'],
};

// src/data/questionWeights.ts's per-question `section` labels, in the same
// slot order as DEFAULT_CATEGORIES above (same 5 real-world categories, just
// worded to match the paper evaluation forms). Renaming a category via the
// Categories Manager never touches questionWeights.ts itself (the point
// values there are validated against the paper rubric) - instead
// getLiveCategoryLabel translates these original labels to the current
// display name by slot position, purely for chart/report labels.
export const WEIGHT_SECTION_ORDER: Record<SurveyType, string[]> = {
  Courier: ['Reliability/Delivery', 'Cost', 'Technology', 'Customer Service', 'Security'],
  Supplier: ['Documentation', 'Delivery', 'Price/Cost Effectiveness', 'Quality', 'Communication'],
  Subcontractor: ['Delivery / Timeliness', 'Documentation / Invoicing', 'Cost Control / Pricing', 'Quality & Technical Competence', 'Communication'],
};

export const CATEGORIES_STORAGE_KEY = 'survey_analytics_categories_v1';

function cloneDefaults(): Record<SurveyType, string[]> {
  return {
    Courier: [...DEFAULT_CATEGORIES.Courier],
    Supplier: [...DEFAULT_CATEGORIES.Supplier],
    Subcontractor: [...DEFAULT_CATEGORIES.Subcontractor],
  };
}

// Reads the admin's current (possibly renamed) category labels from
// localStorage, falling back to the factory defaults per type if unset,
// malformed, or missing a slot. Synchronous and side-effect-free so it can
// be called from plain utility functions (e.g. scoring.ts) as well as React
// state initializers.
export function getStoredCategoryLabels(): Record<SurveyType, string[]> {
  const defaults = cloneDefaults();
  try {
    if (typeof localStorage === 'undefined') return defaults;
    const raw = localStorage.getItem(CATEGORIES_STORAGE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw);
    (Object.keys(defaults) as SurveyType[]).forEach((type) => {
      const stored = parsed?.[type];
      if (Array.isArray(stored) && stored.length === defaults[type].length && stored.every((v) => typeof v === 'string' && v.trim())) {
        defaults[type] = stored;
      }
    });
    return defaults;
  } catch {
    return defaults;
  }
}

// Translates one of questionWeights.ts's original section labels into the
// current live category label for the same slot, for display purposes only
// (radar chart / SectionScore labels). Falls back to the original label
// untouched if it isn't one of the 5 recognized slots for this survey type.
export function getLiveCategoryLabel(surveyType: SurveyType, originalSectionLabel: string): string {
  const slotIndex = WEIGHT_SECTION_ORDER[surveyType]?.indexOf(originalSectionLabel);
  if (slotIndex === undefined || slotIndex < 0) return originalSectionLabel;
  const live = getStoredCategoryLabels()[surveyType]?.[slotIndex];
  return live || DEFAULT_CATEGORIES[surveyType][slotIndex];
}
