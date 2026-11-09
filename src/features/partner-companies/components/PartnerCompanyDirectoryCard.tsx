import { FileText } from 'lucide-react';
import type { PartnerCompany } from '../../../types/survey';
import { PartnerDirectoryArchiveButton } from './PartnerDirectoryArchiveButton';
import { PartnerDirectoryStatusPicker, type PartnerDirectoryStatusOption } from './PartnerDirectoryStatusPicker';

interface PartnerCompanyDirectoryCardProps {
  company: PartnerCompany;
  categoryClassName: string;
  categoryValue: string;
  categorySelectedValue: string;
  categoryOptions: readonly PartnerDirectoryStatusOption[];
  branchStatusOptions: readonly PartnerDirectoryStatusOption[];
  documentStatus: string;
  documentStatusClassName: string;
  branchStatusClassName?: string;
  primaryBranchCode?: string;
  primaryBranchId?: string;
  primaryBranchStatus?: string;
  registeredDate: string;
  archivedDate?: string;
  attentionCount: number;
  missingProfileCount: number;
  canReviewDocuments: boolean;
  isAdmin: boolean;
  onOpen: () => void;
  onCategoryChange: (value: string) => void;
  onBranchStatusChange: (value: string) => void;
  onOpenPendingDocuments: () => void;
  onReviewDocuments: () => void;
  onArchiveOrRestore: () => void;
}

export function PartnerCompanyDirectoryCard({
  company,
  categoryClassName,
  categoryValue,
  categorySelectedValue,
  categoryOptions,
  branchStatusOptions,
  documentStatus,
  documentStatusClassName,
  branchStatusClassName,
  primaryBranchCode,
  primaryBranchId,
  primaryBranchStatus,
  registeredDate,
  archivedDate,
  attentionCount,
  missingProfileCount,
  canReviewDocuments,
  isAdmin,
  onOpen,
  onCategoryChange,
  onBranchStatusChange,
  onOpenPendingDocuments,
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
            {isAdmin ? (
              <PartnerDirectoryStatusPicker label={`Category for ${company.name}`} value={categoryValue} selectedValue={categorySelectedValue}
                triggerClassName={`inline-flex rounded-md border px-2 py-1 text-[10px] font-semibold ${categoryClassName}`} options={categoryOptions} onChange={onCategoryChange} />
            ) : (
              <span className={`inline-flex rounded-md border px-2 py-1 text-[10px] font-semibold ${categoryClassName}`}>{categoryValue}</span>
            )}
          </div>
        </div>
        {company.isArchived || documentStatus !== 'Pending' ? (
          <span className={`shrink-0 rounded-md border px-2 py-1 text-[10px] font-semibold ${company.isArchived ? 'border-slate-200 bg-slate-100 text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400' : documentStatusClassName}`}>{company.isArchived ? 'Archived' : documentStatus}</span>
        ) : (
          <button type="button" onClick={onOpenPendingDocuments} aria-label={`Open pending documents for ${company.name}`} className={`shrink-0 cursor-pointer rounded-md border px-2 py-1 text-[10px] font-semibold hover:ring-2 hover:ring-[#2187CD]/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2187CD] ${documentStatusClassName}`}>{documentStatus}</button>
        )}
      </div>
      <dl className="admin-directory-mobile-facts">
        <div><dt>Registered</dt><dd>{registeredDate}</dd></div>
        <div><dt>Branch status</dt><dd>{isAdmin && primaryBranchId ? (
          <PartnerDirectoryStatusPicker label={`Branch status for ${primaryBranchCode || company.name}`} value={primaryBranchStatus ?? 'Not set'}
            triggerClassName={`inline-flex rounded-md border px-2 py-0.5 text-[10px] font-medium ${branchStatusClassName ?? 'border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400'}`}
            options={branchStatusOptions} onChange={onBranchStatusChange} />
        ) : primaryBranchStatus ? (
          <span className={`inline-flex rounded-md border px-2 py-0.5 text-[10px] font-medium ${branchStatusClassName}`}>{primaryBranchStatus}</span>
        ) : company.accreditationStatus ?? 'Not set'}</dd></div>
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
