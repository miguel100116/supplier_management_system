import { useState } from 'react';
import type { PartnerCompany } from '../../../types/survey';
import { isNTBranch } from '../../document-tracker/domain/compliance';
import { registrationBranches, registrationType, type RegistrationType } from '../domain/registration';

export function PartnerRegistrationEditor({ company, isAdmin, onSave, onDirtyChange }: {
  company: PartnerCompany; isAdmin: boolean;
  onSave: (company: PartnerCompany) => Promise<void>;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const initialType = company.registrationType ?? registrationType(company);
  const initialTrade = company.branches?.find((branch) => !isNTBranch(branch))?.bpCode ?? '';
  const initialNt = company.branches?.find(isNTBranch)?.bpCode ?? '';
  const [type, setType] = useState<RegistrationType>(initialType);
  const [trade, setTrade] = useState(initialTrade);
  const [nt, setNt] = useState(initialNt);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  return <form className="space-y-3" onSubmit={async (event) => {
    event.preventDefault();
    if (!isAdmin || saving) return;
    setError(''); setSaving(true);
    try {
      const branches = registrationBranches(company, type, trade, nt);
      await onSave({ ...company, registrationType: type, branches });
      onDirtyChange(false);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to save registration.'); }
    finally { setSaving(false); }
  }}>
    <label className="field-label">Registration type
      <select className="field text-xs py-2" disabled={!isAdmin || saving} value={type} onChange={(event) => { setType(event.target.value as RegistrationType); onDirtyChange(true); }}>
        <option>Trade</option><option>Non-Trade</option><option>Both</option>
      </select>
    </label>
    {type !== 'Non-Trade' && <label className="field-label">Trade BP Code
      <input className="field text-xs py-2" value={trade} disabled={!isAdmin || saving} onChange={(event) => { setTrade(event.target.value); onDirtyChange(true); }} />
    </label>}
    {type !== 'Trade' && <label className="field-label">Non-Trade (NT) BP Code
      <input className="field text-xs py-2" required value={nt} disabled={!isAdmin || saving} onChange={(event) => { setNt(event.target.value); onDirtyChange(true); }} />
    </label>}
    {error && <p role="alert" className="text-xs text-rose-600">{error}</p>}
    {isAdmin && <button type="submit" className="btn-primary text-xs" disabled={saving}>{saving ? 'Saving…' : 'Save registration'}</button>}
  </form>;
}
