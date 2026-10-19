import { useId, useRef, useState } from 'react';
import { useModalEscape } from '../hooks/useModalEscape';

interface UnsavedChangesDialogProps {
  onContinue: () => void;
  onDiscard: () => void;
  onSave?: () => boolean | void | Promise<boolean | void>;
  description?: string;
}

export function UnsavedChangesDialog({ onContinue, onDiscard, onSave, description = 'You have unsaved changes. Discard them to leave, or continue editing.' }: UnsavedChangesDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const saving = useRef(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  useModalEscape(true, () => { if (!saving.current) onContinue(); }, 250);

  const save = async () => {
    if (!onSave || saving.current) return;
    saving.current = true;
    setIsSaving(true);
    setError('');
    try {
      if (await onSave() === false) setError('Please review the form and correct the highlighted fields before saving.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save changes. Please try again.');
    } finally {
      saving.current = false;
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[250] flex items-center justify-center bg-slate-950/60 p-4">
      <section role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId} aria-busy={isSaving} className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-800 dark:bg-slate-950">
        <h2 id={titleId} className="text-base font-bold text-slate-900 dark:text-white">Unsaved changes</h2>
        <p id={descriptionId} className="mt-2 text-sm text-slate-500 dark:text-slate-400">{description}</p>
        {error && <p role="alert" className="mt-3 text-sm text-rose-600 dark:text-rose-400">{error}</p>}
        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
          <button type="button" autoFocus disabled={isSaving} onClick={onContinue} className="secondary-button text-xs">Continue Editing</button>
          <button type="button" disabled={isSaving} onClick={onDiscard} className="secondary-button text-xs text-rose-700 dark:text-rose-400">Discard Changes</button>
          {onSave && <button type="button" disabled={isSaving} onClick={() => void save()} className="primary-button text-xs">{isSaving ? 'Saving…' : 'Save Changes'}</button>}
        </div>
      </section>
    </div>
  );
}
