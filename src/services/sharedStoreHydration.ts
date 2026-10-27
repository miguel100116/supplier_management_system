import type { ApplicationRecordType } from './applicationRepository';
import type { PageKey } from '../utils/pageRouting';
import { createCoalescedTaskRunner } from '../utils/coalescedTask';
import { hydrateAdminActivityFromSupabase } from '../features/account-management/services/adminActivityLog';
import { hydrateComplianceHistoryFromSupabase } from '../features/document-tracker/services/complianceHistory';
import { hydrateDocumentModificationsFromSupabase } from '../features/document-tracker/services/documentModificationLog';
import { hydrateNotificationSettingsFromSupabase } from '../features/notifications/services/documentNotificationSettings';
import { hydrateEmployeeNotificationStateFromSupabase } from '../features/notifications/services/employeeNotificationState';
import { hydrateExportHistoryFromSupabase } from '../features/reports/services/exportHistory';
import { hydrateFeedbackHubFromSupabase } from '../features/feedback-hub/services/feedbackHubStore';
import { hydrateReminderSettingsFromSupabase } from '../features/notifications/services/reminderSettings';

export interface SharedStoreHydrationAccess {
  userEmail: string;
  isAdmin: boolean;
  canUseFeedbackHub: boolean;
  signal?: AbortSignal;
}

export function createSharedStoreHydrator(
  access: SharedStoreHydrationAccess,
  hydrate = hydrateChangedSharedStore,
) {
  const loaded = new Set<ApplicationRecordType>();
  const pending = new Map<ApplicationRecordType, Promise<void>>();
  const controller = new AbortController();
  const scopedAccess = { ...access, signal: controller.signal };
  const refresh = createCoalescedTaskRunner(async (type: ApplicationRecordType) => {
    controller.signal.throwIfAborted();
    await hydrate(type, scopedAccess);
    controller.signal.throwIfAborted();
    loaded.add(type);
  }, () => controller.signal.aborted);
  const run = (type: ApplicationRecordType) => {
    const operation = refresh(type);
    pending.set(type, operation);
    void operation.finally(() => {
      if (pending.get(type) === operation) pending.delete(type);
    }).catch(() => {});
    return operation;
  };
  const required = (page: PageKey, settingsOpen: boolean): ApplicationRecordType[] => {
    const types: ApplicationRecordType[] = [];
    if (page === 'reports' || page === 'export-history') types.push('export_history');
    if (page === 'document-register') types.push('compliance_snapshot', 'document_modification');
    if (page === 'partners-feedback-hub' && access.canUseFeedbackHub) types.push('feedback_settings');
    if (access.isAdmin && (page === 'survey-forms' || page === 'settings' || settingsOpen)) types.push('admin_activity');
    return types;
  };
  const ensure = (type: ApplicationRecordType) => loaded.has(type)
    ? Promise.resolve() : pending.get(type) ?? run(type);
  return {
    loadStartup: () => Promise.all((['document_notification_rule', 'reminder_settings', 'employee_notification_state'] as const).map(ensure)),
    loadPage: (page: PageKey, settingsOpen = false) => Promise.all(required(page, settingsOpen).map(ensure)),
    isPageReady: (page: PageKey, settingsOpen = false) => required(page, settingsOpen).every(type => loaded.has(type)),
    refresh: (type: ApplicationRecordType) => {
      // One Feedback hydration reads all three records; batch their invalidations together.
      if (type === 'feedback_contact' || type === 'feedback_report') type = 'feedback_settings';
      if (!loaded.has(type) && !pending.has(type)) return Promise.resolve();
      return run(type);
    },
    dispose: () => controller.abort(),
  };
}

export async function hydrateChangedSharedStore(
  recordType: ApplicationRecordType,
  access: SharedStoreHydrationAccess,
): Promise<void> {
  switch (recordType) {
    case 'feedback_contact':
    case 'feedback_report':
    case 'feedback_settings':
      if (access.canUseFeedbackHub) await hydrateFeedbackHubFromSupabase(access.signal);
      return;
    case 'document_notification_rule':
      await hydrateNotificationSettingsFromSupabase(access.isAdmin, access.signal);
      return;
    case 'admin_activity':
      if (access.isAdmin) await hydrateAdminActivityFromSupabase(access.signal);
      return;
    case 'document_modification':
      await hydrateDocumentModificationsFromSupabase(access.isAdmin, access.signal);
      return;
    case 'export_history':
      await hydrateExportHistoryFromSupabase(access.signal);
      return;
    case 'employee_notification_state':
      await hydrateEmployeeNotificationStateFromSupabase(access.userEmail, access.signal);
      return;
    case 'reminder_settings':
      await hydrateReminderSettingsFromSupabase(access.isAdmin, access.signal);
      return;
    case 'compliance_snapshot':
      await hydrateComplianceHistoryFromSupabase(access.isAdmin, access.signal);
      return;
    default:
      return;
  }
}
