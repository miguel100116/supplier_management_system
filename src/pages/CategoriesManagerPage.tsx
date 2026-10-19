import { useState } from 'react';
import { useModalEscape } from '../hooks/useModalEscape';
import { UnsavedChangesDialog } from '../components/UnsavedChangesDialog';
import { PageDescription } from '../components/PageDescription';
import { AlertTriangle, Ban, ChevronRight, Layers, PackageSearch, RotateCcw, Save, Truck, X } from 'lucide-react';
import { SurveyType } from '../types/survey';
import { DEFAULT_CATEGORIES } from '../data/questionCategories';

interface CategoriesManagerPageProps {
  categoryLabels: Record<SurveyType, string[]>;
  onRenameCategory: (surveyType: SurveyType, slotIndex: number, newLabel: string) => void;
  onRestoreDefaults: (surveyType: SurveyType) => void;
}

const TYPE_META: Record<SurveyType, { icon: typeof Truck; description: string }> = {
  Courier: { icon: Truck, description: 'Categories used on Courier evaluation forms, reports, and charts.' },
  Supplier: { icon: PackageSearch, description: 'Categories used on Supplier evaluation forms, reports, and charts.' },
  Subcontractor: { icon: Layers, description: 'Categories used on Subcontractor evaluation forms, reports, and charts.' },
};

function arraysEqual(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

export function CategoriesManagerPage({ categoryLabels, onRenameCategory, onRestoreDefaults }: CategoriesManagerPageProps) {
  const [openType, setOpenType] = useState<SurveyType | null>(null);
  const [draftLabels, setDraftLabels] = useState<string[]>([]);
  const [pendingAction, setPendingAction] = useState<'save' | 'restore' | null>(null);
  const [validationError, setValidationError] = useState('');
  const [showUnsavedChanges, setShowUnsavedChanges] = useState(false);
  const [closeAfterSave, setCloseAfterSave] = useState(false);
  useModalEscape(Boolean(pendingAction), () => { setPendingAction(null); setCloseAfterSave(false); }, 60);

  const openEditor = (type: SurveyType) => {
    setOpenType(type);
    setDraftLabels([...categoryLabels[type]]);
    setValidationError('');
  };

  const closeEditor = () => {
    setOpenType(null);
    setDraftLabels([]);
    setPendingAction(null);
    setValidationError('');
    setShowUnsavedChanges(false);
    setCloseAfterSave(false);
  };

  const requestCloseEditor = () => {
    if (openType && !arraysEqual(draftLabels, categoryLabels[openType])) {
      setShowUnsavedChanges(true);
      return;
    }
    closeEditor();
  };

  useModalEscape(Boolean(openType), requestCloseEditor, 50);

  const isDirty = openType ? !arraysEqual(draftLabels, categoryLabels[openType]) : false;
  const isDefault = openType ? arraysEqual(draftLabels, DEFAULT_CATEGORIES[openType]) : false;

  const handleDraftChange = (index: number, value: string) => {
    setDraftLabels((current) => current.map((label, i) => (i === index ? value : label)));
  };

  const requestSave = () => {
    if (!openType || !isDirty) return;
    const trimmed = draftLabels.map((l) => l.trim());
    if (trimmed.some((l) => !l)) {
      setValidationError('Every category needs a name - none can be blank.');
      return false;
    }
    const unique = new Set(trimmed.map((l) => l.toLowerCase()));
    if (unique.size !== trimmed.length) {
      setValidationError('Category names must be unique within this list.');
      return false;
    }
    setValidationError('');
    setPendingAction('save');
    return true;
  };

  const requestRestore = () => {
    if (!openType) return;
    setValidationError('');
    setPendingAction('restore');
  };

  const confirmPendingAction = () => {
    if (!openType || !pendingAction) return;
    if (pendingAction === 'save') {
      draftLabels.forEach((label, i) => {
        const trimmed = label.trim();
        if (trimmed && trimmed !== categoryLabels[openType][i]) {
          onRenameCategory(openType, i, trimmed);
        }
      });
    } else {
      onRestoreDefaults(openType);
      setDraftLabels([...DEFAULT_CATEGORIES[openType]]);
    }
    setPendingAction(null);
    if (closeAfterSave && pendingAction === 'save') closeEditor();
  };

  return (
    <div className="space-y-5">
      <PageDescription>
        Each partner type is evaluated across 5 categories. Renaming a category here updates it everywhere it's
        used - survey question categories, the radar chart, bar charts, reports, and the survey editor's category
        dropdown.
      </PageDescription>

      <div className="grid gap-4 sm:grid-cols-3">
        {(['Courier', 'Supplier', 'Subcontractor'] as const).map((type) => {
          const Icon = TYPE_META[type].icon;
          return (
            <button
              key={type}
              type="button"
              onClick={() => openEditor(type)}
              className="panel text-left p-5 space-y-3 hover:border-blue-200 dark:hover:border-blue-900 transition cursor-pointer group"
            >
              <div className="flex items-center justify-between">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-[#0063a9] dark:bg-blue-950/40 dark:text-blue-300">
                  <Icon size={18} />
                </span>
                <ChevronRight size={16} className="text-slate-300 group-hover:text-[#0063a9] dark:group-hover:text-blue-300 transition" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-800 dark:text-white">{type}</h3>
                <p className="text-[11px] text-slate-400 mt-0.5">{TYPE_META[type].description}</p>
              </div>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {categoryLabels[type].map((cat) => (
                  <span
                    key={cat}
                    className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                  >
                    {cat}
                  </span>
                ))}
              </div>
            </button>
          );
        })}
      </div>

      {openType && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div role="dialog" aria-modal="true" aria-labelledby="category-editor-title" className="w-full max-w-lg rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-950 flex flex-col max-h-[90vh] overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 px-5 py-4 shrink-0">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Category Labels</p>
                <h3 id="category-editor-title" className="text-base font-bold text-slate-800 dark:text-white">{openType} Categories</h3>
              </div>
              <button type="button" onClick={requestCloseEditor} className="icon-button" title="Close">
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-3">
              {validationError && (
                <div className="flex items-center gap-2 rounded-lg bg-rose-50 border border-rose-200 p-2.5 text-xs text-rose-600 dark:bg-rose-950/30 dark:border-rose-900 dark:text-rose-400">
                  <Ban size={14} className="shrink-0" />
                  <span>{validationError}</span>
                </div>
              )}
              {draftLabels.map((label, i) => (
                <div key={i}>
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Category {i + 1}</label>
                  <input
                    type="text"
                    className="field mt-1"
                    value={label}
                    onChange={(e) => handleDraftChange(i, e.target.value)}
                  />
                </div>
              ))}
              <p className="text-[11px] text-slate-400 pt-1">
                "Overall" (whole-company feedback like Period Covered and the closing comments question) is a fixed
                category shared by every survey type and isn't managed here.
              </p>
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-slate-100 dark:border-slate-800 px-5 py-4 shrink-0 bg-slate-50 dark:bg-slate-950/40">
              <button
                type="button"
                onClick={requestRestore}
                disabled={isDefault}
                className="secondary-button text-xs disabled:cursor-not-allowed disabled:opacity-40"
              >
                <RotateCcw size={13} /> Restore to Default
              </button>
              <div className="flex items-center gap-2">
                <button type="button" onClick={requestCloseEditor} className="secondary-button text-xs">
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={requestSave}
                  disabled={!isDirty}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#0063a9] px-4 py-2 text-xs font-bold text-white shadow-xs transition hover:bg-[#00528c] disabled:cursor-not-allowed disabled:bg-slate-300 disabled:hover:bg-slate-300 dark:disabled:bg-slate-700"
                >
                  <Save size={13} /> Save Changes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showUnsavedChanges && <UnsavedChangesDialog
        description="You have unsaved category changes. Saving updates these labels throughout the system and requires confirmation."
        onContinue={() => setShowUnsavedChanges(false)}
        onDiscard={closeEditor}
        onSave={() => {
          if (!requestSave()) return false;
          setCloseAfterSave(true);
          setShowUnsavedChanges(false);
        }}
      />}

      {pendingAction && openType && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-xl border border-amber-100 bg-white p-6 shadow-2xl dark:border-amber-900/40 dark:bg-slate-950">
            <div className="flex items-start gap-3 text-amber-600 dark:text-amber-400">
              <AlertTriangle size={22} className="shrink-0 mt-0.5" />
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  {pendingAction === 'save' ? 'Rename these categories?' : `Restore ${openType} to default categories?`}
                </h3>
                <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
                  This changes {openType} category names across the whole system - the radar chart, bar charts,
                  reports, the analytics dashboard, and every existing survey question and submitted response
                  already tagged with the old name. This can't be undone automatically.
                </p>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-3">
              <button type="button" onClick={() => { setPendingAction(null); setCloseAfterSave(false); }} className="secondary-button text-sm">
                Cancel
              </button>
              <button
                type="button"
                onClick={() => { try { confirmPendingAction(); } catch (error) { setValidationError(error instanceof Error ? error.message : 'Unable to save changes. Please try again.'); setPendingAction(null); } }}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-bold text-white shadow-xs transition hover:bg-amber-700"
              >
                Yes, Apply Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
