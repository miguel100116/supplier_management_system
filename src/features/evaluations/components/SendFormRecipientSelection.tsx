import { useState } from 'react';
import type { PersistedProfile } from '../../account-management/domain/accountProfile';
import { normalizeRecipientEmail } from '../domain/formRecipients';

export function SendFormRecipientSelection({ recipients, selectedEmails, busy, onSelect }: {
  recipients: PersistedProfile[];
  selectedEmails: string[];
  busy: boolean;
  onSelect: (emails: string[]) => void;
}) {
  const [search, setSearch] = useState('');
  const selected = new Set(selectedEmails.map(normalizeRecipientEmail));
  const query = search.trim().toLowerCase();
  const visible = recipients.filter(recipient => `${recipient.email} ${recipient.department} ${recipient.designation}`.toLowerCase().includes(query));
  const allSelected = recipients.length > 0 && recipients.every(recipient => selected.has(normalizeRecipientEmail(recipient.email)));
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input type="checkbox" aria-label="Select all eligible employees" checked={allSelected} disabled={busy || !recipients.length}
            ref={input => { if (input) input.indeterminate = selected.size > 0 && !allSelected; }}
            onChange={event => onSelect(event.target.checked ? recipients.map(recipient => normalizeRecipientEmail(recipient.email)) : [])}
            className="h-4 w-4 rounded border-slate-300 accent-[#2187CD] focus:ring-[#2187CD]" />
          Select all
        </label>
        <span role="status" className="text-xs text-slate-500">{selected.size} of {recipients.length} employees selected</span>
      </div>
      <input type="search" aria-label="Search recipients" placeholder="Search email, department or designation" value={search}
        onChange={event => setSearch(event.target.value)} disabled={busy}
        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2187CD] dark:border-slate-700 dark:bg-slate-900" />
      <div className="max-h-[35vh] overflow-auto rounded-lg border border-slate-200 dark:border-slate-700">
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-800"><tr><th scope="col" className="p-2">Employee</th><th scope="col" className="hidden p-2 sm:table-cell">Department</th><th scope="col" className="hidden p-2 sm:table-cell">Designation</th></tr></thead>
          <tbody>{visible.map(recipient => {
            const email = normalizeRecipientEmail(recipient.email);
            return <tr key={email} className="border-t border-slate-100 dark:border-slate-800">
              <td className="p-2"><label className="flex items-center gap-2"><input type="checkbox" aria-label={`Send to ${recipient.email}`} checked={selected.has(email)} disabled={busy}
                onChange={event => onSelect(event.target.checked ? [...selectedEmails, email] : selectedEmails.filter(value => normalizeRecipientEmail(value) !== email))}
                className="h-4 w-4 shrink-0 rounded border-slate-300 accent-[#2187CD] focus:ring-[#2187CD]" /><span className="min-w-0 break-all">{recipient.email}<span className="mt-1 block break-normal text-xs text-slate-500 sm:hidden">{recipient.department} · {recipient.designation}</span></span></label></td>
              <td className="hidden p-2 sm:table-cell">{recipient.department}</td><td className="hidden p-2 sm:table-cell">{recipient.designation}</td>
            </tr>;
          })}</tbody>
        </table>
        {!visible.length && <p className="p-5 text-center text-sm text-slate-500">{recipients.length ? 'No employees match your search.' : 'No eligible employees match the current access settings.'}</p>}
      </div>
    </div>
  );
}
