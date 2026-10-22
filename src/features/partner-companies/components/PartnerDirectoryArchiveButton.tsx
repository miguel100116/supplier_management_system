import React from 'react';
import { Archive, ArchiveRestore } from 'lucide-react';

interface PartnerDirectoryArchiveButtonProps {
  companyName: string;
  isArchived: boolean;
  onArchiveOrRestore: () => void;
}

export function PartnerDirectoryArchiveButton({ companyName, isArchived, onArchiveOrRestore }: PartnerDirectoryArchiveButtonProps) {
  const label = isArchived ? `Restore ${companyName} from archive` : `Archive ${companyName}`;
  const Icon = isArchived ? ArchiveRestore : Archive;

  return (
    <button
      type="button"
      className="admin-directory-archive-button"
      aria-label={label}
      title={isArchived ? 'Restore partner' : 'Archive partner'}
      onClick={onArchiveOrRestore}
    >
      <Icon size={16} aria-hidden="true" />
    </button>
  );
}
