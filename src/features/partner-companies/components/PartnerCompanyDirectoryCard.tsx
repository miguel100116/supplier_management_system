import { FileText } from 'lucide-react';
import type { PartnerCompany } from '../../../types/survey';
import { PartnerDirectoryArchiveButton } from './PartnerDirectoryArchiveButton';

interface PartnerCompanyDirectoryCardProps {
  company: PartnerCompany;
  categoryClassName: string;
  documentStatus: string;
  documentStatusClassName: string;
  branchStatusClassName?: string;
  primaryBranchCode?: string;
  primaryBranchStatus?: string;
  registeredDate: string;
  archivedDate?: string;
  attentionCount: number;
  missingProfileCount: number;
  canReviewDocuments: boolean;
  isAdmin: boolean;
  onOpen: () => void;
  onReviewDocuments: () => void;
  onArchiveOrRestore: () => void;
}

export function PartnerCompanyDirectoryCard({
  company,
  categoryClassName,
  documentStatus,
  documentStatusClassName,
  branchStatusClassName,
  primaryBranchCode,
  primaryBranchStatus,
  registeredDate,
  archivedDate,
  attentionCount,
  missingProfileCount,
  canReviewDocuments,
  isAdmin,
  onOpen,
  onReviewDocuments,
  onArchiveOrRestore,
}: PartnerCompanyDirectoryCardProps) {
  return (
    <article className="admin-directory-mobile-card">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <button type="button" onClick={onOpen} className="admin-directory-company-link" aria-label={`Open ${company.name} partner record`}>
            <span className="admin-directory-company-name">{company.name}</span>
            {primaryBranchCode && <span className="admin-directory-company-code">BP Code {primaryBranchCode}</span>}
            {(company.branches?.length ?? 0) > 1 && <span className="admin-directory-company-code">{company.branches?.length} branches</span>}
          </button>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <span className={`inline-flex rounded-md border px-2 py-1 text-[10px] font-semibold ${categoryClassName}`}>{company.type === 'Supplier' && company.supplierOrigin ? `Supplier ${company.supplierOrigin}` : company.type}</span>
          </div>
        </div>
        <span className={`shrink-0 rounded-md border px-2 py-1 text-[10px] font-semibold ${company.isArchived ? 'border-slate-200 bg-slate-100 text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400' : documentStatusClassName}`}>{company.isArchived ? 'Archived' : documentStatus}</span>
      </div>
      <dl className="admin-directory-mobile-facts">
        <div><dt>Registered</dt><dd>{registeredDate}</dd></div>
        <div><dt>Branch status</dt><dd>{primaryBranchStatus ? <span className={`inline-flex rounded-md border px-2 py-0.5 text-[10px] font-medium ${branchStatusClassName}`}>{primaryBranchStatus}</span> : company.accreditationStatus ?? 'Not set'}</dd></div>
        {archivedDate && <div><dt>Archived</dt><dd>{archivedDate}</dd></div>}
        {attentionCount > 0 && !company.isArchived && <div><dt>Document follow-up</dt><dd>{attentionCount} item{attentionCount === 1 ? '' : 's'}</dd></div>}
        {missingProfileCount > 0 && <div><dt>Profile</dt><dd>{missingProfileCount} fields missing</dd></div>}
      </dl>
      {(canReviewDocuments || isAdmin) && <div className="admin-directory-mobile-actions">
        {canReviewDocuments && <button type="button" onClick={onReviewDocuments} className="admin-directory-review-link admin-directory-review-icon" aria-label={`Review documents for ${company.name}`} title="Review documents"><FileText size={15} aria-hidden="true" /></button>}
        {isAdmin && <PartnerDirectoryArchiveButton companyName={company.name} isArchived={Boolean(company.isArchived)} onArchiveOrRestore={onArchiveOrRestore} />}
      </div>}
    </article>
  );
}
