import { createCoalescedTaskRunner } from '../../../utils/coalescedTask';

/** Serializes refreshes and leaves the last successful list intact on failure. */
export function createDocumentReminderRefresh(
  load: () => Promise<void>,
  reportError: (message: string | null) => void,
  signal: AbortSignal,
) {
  const run = createCoalescedTaskRunner(async () => {
    if (signal.aborted) return;
    try {
      await load();
      if (!signal.aborted) reportError(null);
    } catch (error) {
      if (!signal.aborted) reportError(error instanceof Error ? error.message : 'Unable to load document reminders.');
    }
  }, () => signal.aborted);
  return () => run('reminders');
}
