import React, { useState } from 'react';
import { X, RotateCcw, AlertTriangle } from 'lucide-react';
import { useModalEscape } from '../../../hooks/useModalEscape';

interface ReturnReasonModalProps {
  reportTitle: string;
  companyName: string;
  recipientEmail: string;
  onConfirmReturn: (reason: string) => void;
  onClose: () => void;
}

export function ReturnReasonModal({
  reportTitle,
  companyName,
  recipientEmail,
  onConfirmReturn,
  onClose,
}: ReturnReasonModalProps) {
  useModalEscape(true, onClose);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) {
      setError('Please provide a specific reason for returning this email for revision.');
      return;
    }
    onConfirmReturn(reason.trim());
  };

  return (
    <div className="feedback-modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm animate-fadeIn">
      <section className="feedback-modal-panel w-full max-w-lg rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-950 overflow-hidden" role="dialog" aria-modal="true" aria-labelledby="feedback-return-title">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-rose-100 bg-rose-50/60 px-6 py-4 dark:border-rose-950/40 dark:bg-rose-950/20">
          <div className="flex items-center gap-2.5 text-rose-700 dark:text-rose-400">
            <RotateCcw size={18} />
            <h2 id="feedback-return-title" className="text-base font-bold">Return Email Report for Revision</h2>
          </div>
          <button
            onClick={onClose}
            type="button"
            aria-label="Close return report dialog"
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            <X size={18} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs dark:border-slate-800 dark:bg-slate-900 space-y-1">
            <p className="font-semibold text-slate-800 dark:text-slate-200">{reportTitle}</p>
            <p className="text-slate-500">Partner: <span className="font-medium">{companyName}</span> ({recipientEmail})</p>
          </div>

          <div className="text-xs text-slate-600 dark:text-slate-400">
            Returning this item will pause the queue timer and move the report into a <strong className="text-rose-600 dark:text-rose-400">Returned (Revise)</strong> state. The original sender will be notified to make updates.
          </div>

          <div>
            <label className="field-label text-xs font-bold text-slate-700 dark:text-slate-300">
              Reason for Return <span className="text-rose-500">*</span>
            </label>
            <textarea
              rows={4}
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                setError('');
              }}
              placeholder="e.g. Please update the CC recipient list to include the department head, and adjust section 2 summary text..."
              className="field mt-1 text-xs"
            />
            {error && <p className="mt-1.5 text-xs text-rose-500 font-medium">{error}</p>}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="secondary-button text-xs"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-4 py-2 text-xs font-bold text-white hover:bg-rose-700 transition"
            >
              <RotateCcw size={14} />
              Return to Sender
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
