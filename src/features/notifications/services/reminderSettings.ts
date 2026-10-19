import {
  loadApplicationRecords,
  persistApplicationRecordsInBackground,
  upsertApplicationRecords,
} from '../../../services/applicationRepository';

export interface ReminderSettings {
  id: 'global';
  frequencyHours: string;
  updatedAt: string;
}

const STORAGE_KEY = 'admin_reminder_frequency';
const MIGRATION_KEY = 'admin_reminder_frequency_supabase_migrated_v1';
const DEFAULT_FREQUENCY = '24';
export const REMINDER_SETTINGS_CHANGED_EVENT = 'reminder-settings-changed';

export function getReminderFrequency(): string {
  return localStorage.getItem(STORAGE_KEY) || DEFAULT_FREQUENCY;
}

export function saveReminderFrequency(frequencyHours: string): void {
  localStorage.setItem(STORAGE_KEY, frequencyHours);
  const settings: ReminderSettings = {
    id: 'global',
    frequencyHours,
    updatedAt: new Date().toISOString(),
  };
  persistApplicationRecordsInBackground(
    upsertApplicationRecords('reminder_settings', [settings], (item) => item.id),
  );
  window.dispatchEvent(new Event(REMINDER_SETTINGS_CHANGED_EVENT));
}

export async function hydrateReminderSettingsFromSupabase(canMigrate = false): Promise<void> {
  let settings = await loadApplicationRecords<ReminderSettings>('reminder_settings');
  if (settings.length === 0 && canMigrate && localStorage.getItem(MIGRATION_KEY) !== 'true') {
    const localSettings: ReminderSettings = {
      id: 'global',
      frequencyHours: getReminderFrequency(),
      updatedAt: new Date().toISOString(),
    };
    await upsertApplicationRecords('reminder_settings', [localSettings], (item) => item.id);
    settings = [localSettings];
  }
  if (settings.length > 0 || canMigrate) localStorage.setItem(MIGRATION_KEY, 'true');
  localStorage.setItem(STORAGE_KEY, settings[0]?.frequencyHours ?? DEFAULT_FREQUENCY);
  window.dispatchEvent(new Event(REMINDER_SETTINGS_CHANGED_EVENT));
}
