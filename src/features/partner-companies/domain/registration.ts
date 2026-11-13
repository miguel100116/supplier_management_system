import type { BranchRecord, BusinessClassification, PartnerCompany, PartnerCompanyType, SupplierOrigin } from '../../../types/survey';
import { isNTBranch } from '../../document-tracker/domain/compliance';

export type RegistrationType = 'Trade' | 'Non-Trade' | 'Both';

export function manualEntryBusinessClassification(
  type: PartnerCompanyType,
  origin: SupplierOrigin | undefined,
  classification?: BusinessClassification,
): BusinessClassification | undefined {
  if (type === 'Supplier' && origin === 'Foreign') return undefined;
  if (!classification) throw new Error('Select Corporation (Corp) or Sole Proprietorship (Sole).');
  return classification;
}

export function registrationType(company: Pick<PartnerCompany, 'branches'>): RegistrationType {
  const branches = company.branches ?? [];
  const nt = branches.some(isNTBranch);
  return nt ? (branches.some((branch) => !isNTBranch(branch)) ? 'Both' : 'Non-Trade') : 'Trade';
}

export function registrationBranches(company: Pick<PartnerCompany, 'id' | 'type' | 'supplierOrigin' | 'branches'>, type: RegistrationType, trade: string, nt: string): BranchRecord[] {
  if (!['Trade', 'Non-Trade', 'Both'].includes(type)) throw new Error('Select a valid registration type.');
  if (type !== 'Trade' && !nt.trim()) throw new Error('Non-Trade BP Code is required.');
  if (type !== 'Non-Trade' && /-NT$/i.test(trade.trim())) throw new Error('Use the Non-Trade BP Code field for codes ending in -NT.');
  if (type === 'Both' && trade.trim() && trade.trim().toLowerCase() === nt.trim().toLowerCase()) throw new Error('Trade and Non-Trade BP Codes must be different.');
  const existing = company.branches ?? [];
  const excluded = existing.filter((branch) => type === 'Trade' ? isNTBranch(branch) : type === 'Non-Trade' ? !isNTBranch(branch) : false);
  // Registration edits never delete a branch with operational data.
  if (excluded.length) {
    throw new Error('This change would remove an existing branch and its saved details or documents. Keep its registration type to preserve those records.');
  }
  const base = company.type === 'Supplier' ? `Supplier-${company.supplierOrigin ?? 'Local'}` : company.type;
  const branches = existing.filter((branch) => !excluded.includes(branch));
  for (const nonTrade of [false, true]) {
    if ((nonTrade && type === 'Trade') || (!nonTrade && type === 'Non-Trade')) continue;
    const code = (nonTrade ? nt : trade).trim();
    const index = branches.findIndex((branch) => isNTBranch(branch) === nonTrade);
    if (index >= 0) branches[index] = { ...branches[index], bpCode: code, ...(nonTrade ? { rawCategory: `${base}-NT` } : {}) };
    else branches.push({ id: `${company.id}-registration-${nonTrade ? 'nt' : 'trade'}`, bpCode: code, rawCategory: `${base}${nonTrade ? '-NT' : ''}` });
  }
  return branches;
}
