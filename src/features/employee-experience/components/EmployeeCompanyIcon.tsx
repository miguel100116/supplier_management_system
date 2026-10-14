import { Building2, HardHat, Truck } from 'lucide-react';
import type { SurveyType } from '../../../types/survey';

export function EmployeeCompanyIcon({ type, size = 22, className }: { type: SurveyType; size?: number; className?: string }) {
  if (type === 'Courier') return <Truck size={size} aria-hidden="true" className={className} />;
  if (type === 'Supplier') return <Building2 size={size} aria-hidden="true" className={className} />;
  return <HardHat size={size} aria-hidden="true" className={className} />;
}
