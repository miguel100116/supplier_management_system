import { PartnerCompany } from '../../../types/survey';

export type MissingProfileField = 'address' | 'contact' | 'email' | 'phone';

export const MISSING_FIELD_LABELS: Record<MissingProfileField, string> = {
  address: 'Address',
  contact: 'Contact Person',
  email: 'Email',
  phone: 'Mobile Phone',
};

// Checked against the first branch - a company's "profile" for outreach
// purposes (reports, evaluation invites) is its primary branch's contact
// details. Used to flag partners needing a completeness follow-up, separate
// from compliance-document expiry.
export function findMissingProfileFields(company: PartnerCompany): MissingProfileField[] {
  const branch = company.branches?.[0];
  const missing: MissingProfileField[] = [];
  if (!branch?.address?.trim()) missing.push('address');
  if (!branch?.contactPerson?.trim()) missing.push('contact');
  if (!(branch?.email?.trim() || company.email?.trim())) missing.push('email');
  if (!branch?.mobilePhone?.trim()) missing.push('phone');
  return missing;
}
