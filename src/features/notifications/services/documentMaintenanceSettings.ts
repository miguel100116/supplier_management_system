import { loadApplicationRecords, upsertApplicationRecords } from '../../../services/applicationRepository';

export const MAINTENANCE_DOCUMENTS = [
  'AFS', 'GIS (Corp)', 'DTI (Sole)', 'Business Permit', 'Import Permit', 'Business Permit/License',
] as const;

export interface DocumentMaintenanceSettings {
  id: 'default';
  validityYears: Partial<Record<(typeof MAINTENANCE_DOCUMENTS)[number], number | null>>;
  reminderDays: number[];
  dailyFinalDays: number;
  updatedAt?: string;
  updatedBy?: string;
}

export const DEFAULT_DOCUMENT_MAINTENANCE_SETTINGS: DocumentMaintenanceSettings = {
  id: 'default',
  validityYears: Object.fromEntries(MAINTENANCE_DOCUMENTS.map((name) => [name, null])) as DocumentMaintenanceSettings['validityYears'],
  reminderDays: [60, 30],
  dailyFinalDays: 30,
};

export function validateDocumentMaintenanceSettings(value: DocumentMaintenanceSettings): string | null {
  if (!Array.isArray(value.reminderDays) || value.reminderDays.some((day) => !Number.isInteger(day) || day < 1 || day > 365)) {
    return 'Reminder intervals must be whole days from 1 to 365.';
  }
  if (value.reminderDays.length > 20) return 'The schedule can contain up to 20 reminder intervals.';
  if (new Set(value.reminderDays).size !== value.reminderDays.length) return 'Reminder intervals must be unique.';
  if (!Number.isInteger(value.dailyFinalDays) || value.dailyFinalDays < 1 || value.dailyFinalDays > 90) {
    return 'Daily reminders must cover 1 to 90 days before expiry.';
  }
  if (!value.validityYears || typeof value.validityYears !== 'object' || Array.isArray(value.validityYears)) {
    return 'Validity periods must be configured as a document list.';
  }
  for (const [documentName, years] of Object.entries(value.validityYears)) {
    if (!MAINTENANCE_DOCUMENTS.includes(documentName as (typeof MAINTENANCE_DOCUMENTS)[number])) {
      return `${documentName} is not a supported renewable document.`;
    }
    if (years !== null && years !== undefined && (!Number.isInteger(years) || years < 1 || years > 50)) {
      return `${documentName} validity must be a whole number from 1 to 50 years or unset.`;
    }
  }
  return null;
}

export async function loadDocumentMaintenanceSettings(signal?: AbortSignal): Promise<DocumentMaintenanceSettings> {
  const [saved] = await loadApplicationRecords<DocumentMaintenanceSettings>('document_maintenance', { signal });
  if (!saved) return {
    ...DEFAULT_DOCUMENT_MAINTENANCE_SETTINGS,
    validityYears: { ...DEFAULT_DOCUMENT_MAINTENANCE_SETTINGS.validityYears },
    reminderDays: [...DEFAULT_DOCUMENT_MAINTENANCE_SETTINGS.reminderDays],
  };
  return {
    id: 'default',
    validityYears: { ...DEFAULT_DOCUMENT_MAINTENANCE_SETTINGS.validityYears, ...saved.validityYears },
    reminderDays: [...(saved.reminderDays ?? DEFAULT_DOCUMENT_MAINTENANCE_SETTINGS.reminderDays)],
    dailyFinalDays: saved.dailyFinalDays ?? DEFAULT_DOCUMENT_MAINTENANCE_SETTINGS.dailyFinalDays,
    ...(saved.updatedAt ? { updatedAt: saved.updatedAt } : {}),
    ...(saved.updatedBy ? { updatedBy: saved.updatedBy } : {}),
  };
}

export async function saveDocumentMaintenanceSettings(value: DocumentMaintenanceSettings): Promise<void> {
  const validationError = validateDocumentMaintenanceSettings(value);
  if (validationError) throw new Error(validationError);
  await upsertApplicationRecords('document_maintenance', [{
    id: 'default',
    validityYears: { ...value.validityYears },
    reminderDays: [...value.reminderDays],
    dailyFinalDays: value.dailyFinalDays,
    updatedAt: new Date().toISOString(),
    ...(value.updatedBy ? { updatedBy: value.updatedBy } : {}),
  }], (settings) => settings.id);
}
