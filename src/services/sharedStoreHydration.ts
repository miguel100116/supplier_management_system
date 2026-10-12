import type { ApplicationRecordType } from './applicationRepository';
import { hydrateAdminActivityFromSupabase } from '../utils/adminActivityLog';
import { hydrateComplianceHistoryFromSupabase } from '../utils/complianceHistory';
import { hydrateDocumentModificationsFromSupabase } from '../utils/documentModificationLog';
import { hydrateNotificationSettingsFromSupabase } from '../utils/documentNotificationSettings';
import { hydrateEmployeeNotificationStateFromSupabase } from '../utils/employeeNotificationState';
import { hydrateExportHistoryFromSupabase } from '../utils/exportHistory';
import { hydrateFeedbackHubFromSupabase } from '../utils/feedbackHubStore';
import { hydrateReminderSettingsFromSupabase } from '../utils/reminderSettings';

export interface SharedStoreHydrationAccess {
  userEmail: string;
  isAdmin: boolean;
  canUseFeedbackHub: boolean;
}

export async function hydrateSharedClientStores(access: SharedStoreHydrationAccess): Promise<void> {
  const tasks: Promise<void>[] = [
    hydrateNotificationSettingsFromSupabase(access.isAdmin),
    hydrateReminderSettingsFromSupabase(access.isAdmin),
    hydrateEmployeeNotificationStateFromSupabase(access.userEmail),
    hydrateExportHistoryFromSupabase(),
    hydrateComplianceHistoryFromSupabase(access.isAdmin),
    hydrateDocumentModificationsFromSupabase(access.isAdmin),
  ];
  if (access.canUseFeedbackHub) tasks.push(hydrateFeedbackHubFromSupabase());
  if (access.isAdmin) {
    tasks.push(hydrateAdminActivityFromSupabase());
  }
  await Promise.all(tasks);
}

export async function hydrateChangedSharedStore(
  recordType: ApplicationRecordType,
  access: SharedStoreHydrationAccess,
): Promise<void> {
  switch (recordType) {
    case 'feedback_contact':
    case 'feedback_report':
    case 'feedback_settings':
      if (access.canUseFeedbackHub) await hydrateFeedbackHubFromSupabase();
      return;
    case 'document_notification_rule':
      await hydrateNotificationSettingsFromSupabase(access.isAdmin);
      return;
    case 'admin_activity':
      if (access.isAdmin) await hydrateAdminActivityFromSupabase();
      return;
    case 'document_modification':
      await hydrateDocumentModificationsFromSupabase(access.isAdmin);
      return;
    case 'export_history':
      await hydrateExportHistoryFromSupabase();
      return;
    case 'employee_notification_state':
      await hydrateEmployeeNotificationStateFromSupabase(access.userEmail);
      return;
    case 'reminder_settings':
      await hydrateReminderSettingsFromSupabase(access.isAdmin);
      return;
    case 'compliance_snapshot':
      await hydrateComplianceHistoryFromSupabase(access.isAdmin);
      return;
    default:
      return;
  }
}
