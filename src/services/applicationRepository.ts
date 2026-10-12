import type { PageModuleKey } from '../utils/rbac';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ComplianceDocument, PartnerCompany, SurveyResponse } from '../types/survey';
import type { NotificationReadState } from '../utils/notificationReadState';
import {
  createNotificationReadState,
  parseNotificationReadState,
} from '../utils/notificationReadState';
import { isSupabaseConfigured, supabase } from './supabaseClient';
import { parseApplicationRecordPayload } from './applicationRecordSchemas';
import { parsePersistedProfile, type PersistedProfile } from '../features/account-management/domain/accountProfile';
export { parsePersistedProfile, type PersistedProfile } from '../features/account-management/domain/accountProfile';

export const APPLICATION_RECORD_TYPES = [
  'partner_company',
  'survey',
  'survey_response',
  'archive_series',
  'department_permission',
  'category_labels',
  'feedback_contact',
  'feedback_report',
  'feedback_settings',
  'document_notification_rule',
  'notification_read_state',
  'admin_activity',
  'document_modification',
  'export_history',
  'supplier_ranking_history',
  'employee_notification_state',
  'reminder_settings',
  'compliance_snapshot',
  'active_company_snapshot',
  'evaluation_import_archive',
] as const;

export type ApplicationRecordType = typeof APPLICATION_RECORD_TYPES[number];

export const APPLICATION_RECORD_CHANGED_EVENT = 'supabase-application-record-changed';
export const APPLICATION_PROFILES_CHANGED_EVENT = 'supabase-application-profiles-changed';
export const APPLICATION_REALTIME_STATUS_EVENT = 'supabase-realtime-status';
const REALTIME_WARNING_FAILURE_THRESHOLD = 3;

export interface RealtimeSyncState {
  consecutiveFailures: number;
  warningVisible: boolean;
}

export function advanceRealtimeSyncState(current: RealtimeSyncState, status: string): RealtimeSyncState {
  if (status === 'SUBSCRIBED') return { consecutiveFailures: 0, warningVisible: false };
  if (status !== 'CHANNEL_ERROR' && status !== 'TIMED_OUT') return current;

  const consecutiveFailures = current.consecutiveFailures + 1;
  return { consecutiveFailures, warningVisible: consecutiveFailures >= REALTIME_WARNING_FAILURE_THRESHOLD };
}

export function persistApplicationRecordsInBackground(operation: Promise<void>): void {
  void operation.catch((error) => {
    const message = error instanceof Error ? error.message : 'Unable to save shared data to Supabase.';
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('supabase-persistence-error', { detail: message }));
    }
  });
}

interface ApplicationRecordRow<T> {
  record_id: string;
  payload: T;
  created_at: string;
}

const WRITE_CHUNK_SIZE = 300;
const WRITE_CHUNK_CONCURRENCY = 4;
const READ_PAGE_SIZE = 1_000;
const READ_PAGE_CONCURRENCY = 6;

export function applicationRecordPageRanges(totalCount: number, pageSize = READ_PAGE_SIZE): Array<[number, number]> {
  if (!Number.isInteger(totalCount) || totalCount <= 0 || !Number.isInteger(pageSize) || pageSize <= 0) return [];
  const ranges: Array<[number, number]> = [];
  for (let from = 0; from < totalCount; from += pageSize) {
    ranges.push([from, Math.min(from + pageSize - 1, totalCount - 1)]);
  }
  return ranges;
}

export function batchApplicationRecordPageRanges(
  ranges: Array<[number, number]>,
  batchSize = READ_PAGE_CONCURRENCY,
): Array<Array<[number, number]>> {
  if (!Number.isInteger(batchSize) || batchSize <= 0) return [];
  const batches: Array<Array<[number, number]>> = [];
  for (let index = 0; index < ranges.length; index += batchSize) {
    batches.push(ranges.slice(index, index + batchSize));
  }
  return batches;
}

export function nextApplicationRecordPageBatch(
  from: number,
  pageSize = READ_PAGE_SIZE,
  batchSize = READ_PAGE_CONCURRENCY,
): Array<[number, number]> {
  if (!Number.isInteger(from) || from < 0 || !Number.isInteger(pageSize) || pageSize <= 0 || !Number.isInteger(batchSize) || batchSize <= 0) {
    return [];
  }
  return Array.from({ length: batchSize }, (_, index) => {
    const pageFrom = from + index * pageSize;
    return [pageFrom, pageFrom + pageSize - 1];
  });
}

export function mergeApplicationRecordsById<T>(
  current: readonly T[],
  refreshed: readonly T[],
  requestedIds: readonly string[],
  getId: (record: T) => string,
): T[] {
  const changedIds = new Set(requestedIds);
  return [
    ...current.filter((record) => !changedIds.has(getId(record))),
    ...refreshed,
  ].sort((left, right) => getId(left).localeCompare(getId(right)));
}

export function incompleteApplicationRecordPageRange(
  from: number,
  to: number,
  receivedCount: number,
): [number, number] | null {
  if (
    !Number.isInteger(from)
    || !Number.isInteger(to)
    || !Number.isInteger(receivedCount)
    || from < 0
    || to < from
    || receivedCount < 0
  ) return null;
  if (receivedCount === 0 || receivedCount >= to - from + 1) return null;
  return [from + receivedCount, to];
}

function requireConfigured(): void {
  if (!isSupabaseConfigured) throw new Error('Supabase is not configured.');
}

function requestAuthoritativeRefresh(recordType: ApplicationRecordType): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(APPLICATION_RECORD_CHANGED_EVENT, {
    detail: { recordType, reason: 'write-rejected' },
  }));
}

function assertObjectPayload(value: unknown, label: string): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object before it can be saved.`);
  }
}

async function currentUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error(error?.message ?? 'No authenticated Supabase user.');
  return data.user.id;
}

export function surveyResponseRecordId(response: SurveyResponse): string {
  return `${response.responseId}:${response.questionId}`;
}

export async function loadApplicationRecords<T>(recordType: ApplicationRecordType): Promise<T[]> {
  requireConfigured();
  const values: T[] = [];
  let invalidCount = 0;
  const invalidReasons = new Map<string, number>();

  const appendRows = (rows: ApplicationRecordRow<T>[]) => {
    for (const row of rows) {
      try {
        values.push(parseApplicationRecordPayload(recordType, row.payload, row.record_id, {
          recordCreatedAt: row.created_at,
        }) as T);
      } catch (error) {
        invalidCount += 1;
        const rawReason = error instanceof Error ? error.message : 'unknown validation error';
        const safeReason = rawReason
          .split(`${recordType}/${row.record_id}`).join(recordType)
          .replace(/\s+/g, ' ')
          .slice(0, 180);
        invalidReasons.set(safeReason, (invalidReasons.get(safeReason) ?? 0) + 1);
      }
    }
  };

  const loadCompleteRange = async (
    from: number,
    to: number,
    expectedCount: number,
  ): Promise<ApplicationRecordRow<T>[]> => {
    if (expectedCount <= 0) return [];
    const { data, error } = await supabase
      .from('application_records')
      .select('record_id,payload,created_at')
      .eq('record_type', recordType)
      .order('record_id')
      .range(from, to);
    if (error) throw new Error(`Unable to load ${recordType} records: ${error.message}`);
    const rows = (data ?? []) as unknown as ApplicationRecordRow<T>[];
    if (rows.length === 0) return [];
    const remainingRange = incompleteApplicationRecordPageRange(from, to, rows.length);
    if (!remainingRange) return rows;
    const remainingRows = await loadCompleteRange(
      remainingRange[0],
      remainingRange[1],
      expectedCount - rows.length,
    );
    return [...rows, ...remainingRows];
  };

  // Avoid an exact count here: under response RLS it makes Postgres scan every
  // visible response before returning the first page. Discover later pages in
  // bounded parallel batches instead of waiting on one request per page.
  const firstRows = await loadCompleteRange(0, READ_PAGE_SIZE - 1, READ_PAGE_SIZE);
  appendRows(firstRows);

  let from = firstRows.length;
  let hasMore = firstRows.length === READ_PAGE_SIZE;
  while (hasMore) {
    const ranges = nextApplicationRecordPageBatch(from);
    const pages = await Promise.all(ranges.map(([pageFrom, pageTo]) =>
      loadCompleteRange(pageFrom, pageTo, pageTo - pageFrom + 1)));
    for (let index = 0; index < pages.length; index += 1) {
      appendRows(pages[index]);
      if (pages[index].length < READ_PAGE_SIZE) {
        hasMore = false;
        break;
      }
    }
    if (hasMore) from += ranges.length * READ_PAGE_SIZE;
  }
  if (invalidCount > 0 && typeof window !== 'undefined') {
    const reasonSummary = [...invalidReasons.entries()]
      .sort((left, right) => right[1] - left[1])
      .slice(0, 3)
      .map(([reason, count]) => `${count}× ${reason}`)
      .join('; ');
    window.dispatchEvent(new CustomEvent('supabase-persistence-error', {
      detail: `${invalidCount} invalid ${recordType} record${invalidCount === 1 ? '' : 's'} were quarantined during refresh.${reasonSummary ? ` ${reasonSummary}` : ''}`,
    }));
  }
  return values;
}

export async function loadApplicationRecordsByIds<T>(
  recordType: ApplicationRecordType,
  recordIds: readonly string[],
): Promise<T[]> {
  requireConfigured();
  const ids = [...new Set(recordIds.filter((id) => typeof id === 'string' && id.length > 0))];
  if (ids.length === 0) return [];

  const chunks: string[][] = [];
  for (let index = 0; index < ids.length; index += WRITE_CHUNK_SIZE) {
    chunks.push(ids.slice(index, index + WRITE_CHUNK_SIZE));
  }
  const pages = await Promise.all(chunks.map(async (chunk) => {
    const { data, error } = await supabase
      .from('application_records')
      .select('record_id,payload,created_at')
      .eq('record_type', recordType)
      .in('record_id', chunk)
      .order('record_id');
    if (error) throw new Error(`Unable to load changed ${recordType} records: ${error.message}`);
    return (data ?? []) as unknown as ApplicationRecordRow<T>[];
  }));

  const values: T[] = [];
  let invalidCount = 0;
  for (const row of pages.flat()) {
    try {
      values.push(parseApplicationRecordPayload(recordType, row.payload, row.record_id, {
        recordCreatedAt: row.created_at,
      }) as T);
    } catch {
      invalidCount += 1;
    }
  }
  if (invalidCount > 0 && typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('supabase-persistence-error', {
      detail: `${invalidCount} invalid changed ${recordType} record${invalidCount === 1 ? '' : 's'} were quarantined during refresh.`,
    }));
  }
  return values;
}

export async function upsertApplicationRecords<T>(
  recordType: ApplicationRecordType,
  values: T[],
  getId: (value: T) => string,
  options?: { ownRecords?: boolean },
): Promise<void> {
  requireConfigured();
  if (values.length === 0) return;
  const ownerId = options?.ownRecords ? await currentUserId() : null;
  let rows: Array<{ record_type: ApplicationRecordType; record_id: string; payload: T; owner_id?: string }>;
  try {
    rows = values.map((value) => {
      const recordId = getId(value);
      const parsed = parseApplicationRecordPayload(recordType, value, recordId) as T;
      return {
        record_type: recordType,
        record_id: recordId,
        payload: parsed,
        ...(ownerId ? { owner_id: ownerId } : {}),
      };
    });
  } catch (error) {
    requestAuthoritativeRefresh(recordType);
    throw error;
  }

  const writeChunks: Array<typeof rows> = [];
  for (let index = 0; index < rows.length; index += WRITE_CHUNK_SIZE) {
    writeChunks.push(rows.slice(index, index + WRITE_CHUNK_SIZE));
  }
  for (let index = 0; index < writeChunks.length; index += WRITE_CHUNK_CONCURRENCY) {
    const chunkBatch = writeChunks.slice(index, index + WRITE_CHUNK_CONCURRENCY);
    const results = await Promise.allSettled(chunkBatch.map((chunk) =>
      supabase
        .from('application_records')
        .upsert(chunk, { onConflict: 'record_type,record_id' }),
    ));
    const failure = results.find((result) => result.status === 'rejected');
    const databaseError = results.find((result) => result.status === 'fulfilled' && result.value.error)?.status === 'fulfilled'
      ? results.find((result) => result.status === 'fulfilled' && result.value.error)
      : undefined;
    if (failure || databaseError) {
      requestAuthoritativeRefresh(recordType);
      const reason = failure?.status === 'rejected'
        ? failure.reason instanceof Error ? failure.reason.message : String(failure.reason)
        : databaseError?.status === 'fulfilled' ? databaseError.value.error?.message : 'Unknown database error.';
      throw new Error(`Unable to save ${recordType} records: ${reason}`);
    }
  }
}

export async function deleteApplicationRecords(
  recordType: ApplicationRecordType,
  recordIds: string[],
): Promise<void> {
  requireConfigured();
  for (let index = 0; index < recordIds.length; index += WRITE_CHUNK_SIZE) {
    const ids = recordIds.slice(index, index + WRITE_CHUNK_SIZE);
    if (ids.length === 0) continue;
    const { error } = await supabase
      .from('application_records')
      .delete()
      .eq('record_type', recordType)
      .in('record_id', ids);
    if (error) {
      requestAuthoritativeRefresh(recordType);
      throw new Error(`Unable to delete ${recordType} records: ${error.message}`);
    }
  }
}

/** Match provenance at the database boundary so a newer re-import keeps its rows. */
export async function deleteImportedSurveyResponses(
  client: SupabaseClient,
  recordIds: readonly string[],
  importBatchId: string,
): Promise<string[]> {
  if (!importBatchId.trim()) throw new Error('An import batch ID is required.');
  const deletedIds: string[] = [];
  for (let index = 0; index < recordIds.length; index += WRITE_CHUNK_SIZE) {
    const { data, error } = await client.from('application_records').delete()
      .eq('record_type', 'survey_response')
      .eq('payload->>importBatchId', importBatchId)
      .eq('payload->>dataSource', 'client_csv')
      .in('record_id', recordIds.slice(index, index + WRITE_CHUNK_SIZE))
      .select('record_id');
    if (error) {
      requestAuthoritativeRefresh('survey_response');
      throw new Error(`Unable to remove imported responses: ${error.message}`);
    }
    if (!Array.isArray(data) || data.some((row) => !row || typeof row.record_id !== 'string')) {
      throw new Error('Unable to confirm which imported responses were removed. Refresh before retrying.');
    }
    deletedIds.push(...data.map((row) => row.record_id));
  }
  return deletedIds;
}

export async function replaceApplicationRecords<T>(
  recordType: ApplicationRecordType,
  values: T[],
  getId: (value: T) => string,
  options?: { ownRecords?: boolean },
): Promise<void> {
  requireConfigured();
  const { data, error } = await supabase
    .from('application_records')
    .select('record_id')
    .eq('record_type', recordType);
  if (error) {
    requestAuthoritativeRefresh(recordType);
    throw new Error(`Unable to reconcile ${recordType} records: ${error.message}`);
  }
  const nextIds = new Set(values.map(getId));
  const removedIds = (data ?? [])
    .map((row) => row.record_id as string)
    .filter((id) => !nextIds.has(id));
  await upsertApplicationRecords(recordType, values, getId, options);
  await deleteApplicationRecords(recordType, removedIds);
}

export function subscribeToApplicationChanges(): () => void {
  if (!isSupabaseConfigured || typeof window === 'undefined') return () => undefined;

  const realtimeRecordTypes: ApplicationRecordType[] = [
    'partner_company',
    'survey',
    'survey_response',
    'archive_series',
    'department_permission',
    'category_labels',
    'feedback_contact',
    'feedback_report',
    'feedback_settings',
    'document_notification_rule',
    'notification_read_state',
    'admin_activity',
    'document_modification',
    'export_history',
    'employee_notification_state',
    'reminder_settings',
    'compliance_snapshot',
    'active_company_snapshot',
  ];
  let realtimeSyncState: RealtimeSyncState = { consecutiveFailures: 0, warningVisible: false };
  const channel = supabase
    .channel(`application-data-${crypto.randomUUID()}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'application_records',
        filter: `record_type=in.(${realtimeRecordTypes.join(',')})`,
      },
      (payload) => {
        const row = (payload.new && Object.keys(payload.new).length > 0 ? payload.new : payload.old) as {
          record_type?: ApplicationRecordType;
          record_id?: string;
        };
        if (!row.record_type) return;
        window.dispatchEvent(new CustomEvent(APPLICATION_RECORD_CHANGED_EVENT, {
          detail: { recordType: row.record_type, recordId: row.record_id },
        }));
      },
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'app_profiles' },
      (payload) => {
        const row = (payload.new && Object.keys(payload.new).length > 0 ? payload.new : payload.old) as {
          email?: string;
        };
        window.dispatchEvent(new CustomEvent(APPLICATION_PROFILES_CHANGED_EVENT, {
          detail: { email: row.email },
        }));
      },
    )
    .subscribe((status, error) => {
      const syncState = (realtimeSyncState = advanceRealtimeSyncState(realtimeSyncState, status));
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        const diagnosticError = error as (Error & { code?: unknown; status?: unknown }) | undefined;
        const code = typeof diagnosticError?.code === 'string' || typeof diagnosticError?.code === 'number'
          ? diagnosticError.code
          : null;
        const errorStatus = typeof diagnosticError?.status === 'string' || typeof diagnosticError?.status === 'number'
          ? diagnosticError.status
          : null;
        console.error('[Supabase Realtime] subscription failed', {
          message: error?.message ?? `Realtime channel reported ${status}.`,
          code,
          status,
          errorStatus,
        });
        window.dispatchEvent(new CustomEvent(APPLICATION_REALTIME_STATUS_EVENT, {
          detail: { status, consecutiveFailures: syncState.consecutiveFailures, warningVisible: syncState.warningVisible },
        }));
      } else if (status === 'SUBSCRIBED') {
        window.dispatchEvent(new CustomEvent(APPLICATION_REALTIME_STATUS_EVENT, {
          detail: { status, consecutiveFailures: 0, warningVisible: false },
        }));
      }
    });

  return () => {
    void supabase.removeChannel(channel);
  };
}

export async function loadNotificationReadState(userEmail: string): Promise<NotificationReadState | null> {
  requireConfigured();
  const ownerId = await currentUserId();
  const { data, error } = await supabase
    .from('application_records')
    .select('record_id,payload')
    .eq('record_type', 'notification_read_state')
    .eq('record_id', ownerId)
    .eq('owner_id', ownerId)
    .maybeSingle();
  if (error) throw new Error(`Unable to load notification read state: ${error.message}`);
  if (!data) return null;
  const parsed = parseNotificationReadState(data.payload, userEmail);
  if (!parsed) throw new Error('The stored notification read state is invalid.');
  return parsed;
}

export async function saveNotificationReadState(state: NotificationReadState): Promise<void> {
  requireConfigured();
  const ownerId = await currentUserId();
  const normalized = createNotificationReadState(state.userEmail, state.readNotificationIds, state.updatedAt);
  const { error } = await supabase.from('application_records').upsert({
    record_type: 'notification_read_state',
    record_id: ownerId,
    payload: normalized,
    owner_id: ownerId,
  }, { onConflict: 'record_type,record_id' });
  if (error) throw new Error(`Unable to save notification read state: ${error.message}`);
}

export async function loadProfiles(): Promise<PersistedProfile[]> {
  requireConfigured();
  const { data, error } = await supabase
    .from('app_profiles')
    .select('email,role,designation,department,permission_pages,permission_survey_types')
    .order('email');
  if (error) throw new Error(`Unable to load user profiles: ${error.message}`);
  return ((data ?? []) as unknown[]).map((row, index) => parsePersistedProfile(row, `app_profiles[${index}]`));
}

export async function renewPartnerDocument(
  companyId: string,
  branchId: string,
  documentName: string,
  expectedDocument: ComplianceDocument,
  nextDocument: Pick<ComplianceDocument, 'provided' | 'expiryDate'>,
): Promise<PartnerCompany> {
  requireConfigured();
  const { data, error } = await supabase.rpc('renew_partner_document', {
    p_company_id: companyId,
    p_branch_id: branchId,
    p_document_name: documentName,
    p_expected_document: expectedDocument,
    p_next_document: nextDocument,
  });
  if (error) {
    requestAuthoritativeRefresh('partner_company');
    throw new Error(`Unable to renew the document: ${error.message}`);
  }
  return parseApplicationRecordPayload('partner_company', data, companyId) as PartnerCompany;
}

export async function replaceProfiles(profiles: PersistedProfile[]): Promise<void> {
  requireConfigured();
  const rows = profiles.map((profile, index) => {
    const parsed = parsePersistedProfile({
      email: profile.email,
      role: profile.role,
      designation: profile.designation,
      department: profile.department,
      permission_pages: profile.permissions?.pages,
      permission_survey_types: profile.permissions?.surveyTypes,
    }, `profiles[${index}]`);
    return {
      email: parsed.email,
      role: parsed.role,
      designation: parsed.designation,
      department: parsed.department,
      permission_pages: parsed.permissions?.pages ?? null,
      permission_survey_types: parsed.permissions?.surveyTypes ?? null,
    };
  });
  const { data, error: loadError } = await supabase.from('app_profiles').select('email');
  if (loadError) throw new Error(`Unable to reconcile user profiles: ${loadError.message}`);
  const nextEmails = new Set(rows.map((row) => row.email));
  const removedEmails = (data ?? []).map((row) => row.email as string).filter((email) => !nextEmails.has(email));
  const { error } = await supabase.from('app_profiles').upsert(rows, { onConflict: 'email' });
  if (error) throw new Error(`Unable to save user profiles: ${error.message}`);
  if (removedEmails.length > 0) {
    const { error: deleteError } = await supabase.from('app_profiles').delete().in('email', removedEmails);
    if (deleteError) throw new Error(`Unable to remove user profiles: ${deleteError.message}`);
  }
}
