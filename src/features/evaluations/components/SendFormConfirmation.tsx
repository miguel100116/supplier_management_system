import { useId, useRef } from 'react';
import { useModalEscape } from '../../../hooks/useModalEscape';

interface SendFormConfirmationProps {
  title: string;
  surveyType: string;
  recipientCount: number;
  companyCount: number;
  busy: boolean;
  error?: string;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

export function SendFormConfirmation({ title, surveyType, recipientCount, companyCount, busy, error, onClose, onConfirm }: SendFormConfirmationProps) {
  const titleId = useId();
  const descriptionId = useId();
  const pending = useRef(false);
  const requestClose = () => { if (!busy && !pending.current) onClose(); };
  useModalEscape(true, requestClose, 90);

  const confirm = async () => {
    if (busy || pending.current) return;
    pending.current = true;
    try { await onConfirm(); }
    finally { pending.current = false; }
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/60 p-4">
      <section role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId} aria-busy={busy} className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-800 dark:bg-slate-950">
        <h2 id={titleId} className="text-base font-bold text-slate-900 dark:text-white">Proceed with sending?</h2>
        <div id={descriptionId} className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          <p>Are you sure you want to make this evaluation form available?</p>
          <p className="mt-2 break-words font-semibold text-slate-900 dark:text-white">{title} · {surveyType}</p>
          <p className="mt-2">{companyCount} companies to evaluate · {recipientCount} eligible employees</p>
        </div>
        {error && <p role="alert" className="mt-3 text-sm text-rose-600 dark:text-rose-400">{error}</p>}
        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button type="button" autoFocus disabled={busy} onClick={requestClose} className="secondary-button text-xs">Go back</button>
          <button type="button" disabled={busy} onClick={() => void confirm()} className="primary-button text-xs">{busy ? 'Sending…' : 'Yes, proceed'}</button>
        </div>
      </section>
    </div>
  );
}
