import {
  loadApplicationRecords,
  persistApplicationRecordsInBackground,
  upsertApplicationRecords,
} from '../../../services/applicationRepository';

const EVENT_NAME = 'survey-reminders-changed';

interface PersistedEmployeeNotificationState {
  id: string;
  userEmail: string;
  readIds: string[];
  deletedIds: string[];
  updatedAt: string;
}

function normalizedEmail(userEmail: string): string {
  return userEmail.trim().toLowerCase();
}

function storageKey(userEmail: string, kind: 'read' | 'deleted') {
  return `survey_reminders_${kind}_${normalizedEmail(userEmail)}`;
}

function loadIds(userEmail: string, kind: 'read' | 'deleted'): Set<string> {
  try {
    const raw = localStorage.getItem(storageKey(userEmail, kind));
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch (e) {
    return new Set();
  }
}

function saveIds(userEmail: string, kind: 'read' | 'deleted', ids: Set<string>) {
  localStorage.setItem(storageKey(userEmail, kind), JSON.stringify(Array.from(ids)));
  const email = normalizedEmail(userEmail);
  const state: PersistedEmployeeNotificationState = {
    id: email,
    userEmail: email,
    readIds: Array.from(kind === 'read' ? ids : loadIds(email, 'read')),
    deletedIds: Array.from(kind === 'deleted' ? ids : loadIds(email, 'deleted')),
    updatedAt: new Date().toISOString(),
  };
  persistApplicationRecordsInBackground(
    upsertApplicationRecords('employee_notification_state', [state], (item) => item.id, { ownRecords: true }),
  );
  window.dispatchEvent(new Event(EVENT_NAME));
}

export async function hydrateEmployeeNotificationStateFromSupabase(userEmail: string, signal?: AbortSignal): Promise<void> {
  const email = normalizedEmail(userEmail);
  const migrationKey = `survey_reminders_supabase_migrated_v1:${email}`;
  let states = await loadApplicationRecords<PersistedEmployeeNotificationState>('employee_notification_state', { ownRecords: true, signal });
  let state = states.find((candidate) => candidate.userEmail === email);
  if (!state && localStorage.getItem(migrationKey) !== 'true') {
    state = {
      id: email,
      userEmail: email,
      readIds: Array.from(loadIds(email, 'read')),
      deletedIds: Array.from(loadIds(email, 'deleted')),
      updatedAt: new Date().toISOString(),
    };
    await upsertApplicationRecords('employee_notification_state', [state], (item) => item.id, { ownRecords: true });
    states = [state];
  }
  signal?.throwIfAborted();
  localStorage.setItem(migrationKey, 'true');
  localStorage.setItem(storageKey(email, 'read'), JSON.stringify(state?.readIds ?? []));
  localStorage.setItem(storageKey(email, 'deleted'), JSON.stringify(state?.deletedIds ?? []));
  window.dispatchEvent(new Event(EVENT_NAME));
}

export function getReadIds(userEmail: string): Set<string> {
  return loadIds(userEmail, 'read');
}

export function getDeletedIds(userEmail: string): Set<string> {
  return loadIds(userEmail, 'deleted');
}

export function markNotificationRead(userEmail: string, id: string) {
  const ids = loadIds(userEmail, 'read');
  if (!ids.has(id)) {
    ids.add(id);
    saveIds(userEmail, 'read', ids);
  }
}

export function markNotificationUnread(userEmail: string, id: string) {
  const ids = loadIds(userEmail, 'read');
  if (ids.delete(id)) saveIds(userEmail, 'read', ids);
}

export function markNotificationsRead(userEmail: string, notificationIds: string[]) {
  if (notificationIds.length === 0) return;
  const ids = loadIds(userEmail, 'read');
  let changed = false;
  notificationIds.forEach((id) => {
    if (!ids.has(id)) {
      ids.add(id);
      changed = true;
    }
  });
  if (changed) saveIds(userEmail, 'read', ids);
}

export function deleteNotifications(userEmail: string, idsToDelete: string[]) {
  if (idsToDelete.length === 0) return;
  const ids = loadIds(userEmail, 'deleted');
  idsToDelete.forEach((id) => ids.add(id));
  saveIds(userEmail, 'deleted', ids);
}

/** Subscribe to read/deleted state changes made anywhere in the app (bell, page, etc). */
export function subscribeNotificationState(callback: () => void) {
  window.addEventListener(EVENT_NAME, callback);
  return () => window.removeEventListener(EVENT_NAME, callback);
}
