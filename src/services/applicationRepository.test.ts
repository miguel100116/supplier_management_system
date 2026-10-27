import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { SurveyResponse } from '../types/survey';
import {
  loadApplicationRecordsByIds,
  loadApplicationRecords,
  subscribeToApplicationChanges,
  APPLICATION_RECORD_CHANGED_EVENT,
  upsertApplicationRecords,
  advanceRealtimeSyncState,
  APPLICATION_RECORD_TYPES,
  mergeApplicationRecordsById,
  parsePersistedProfile,
  surveyResponseRecordId,
} from './applicationRepository';
import { parseApplicationRecordPayload } from './applicationRecordSchemas';

const now = '2026-09-24T00:00:00.000Z';

test('cursor loading returns every response under a small server row cap and stops on cancellation', async () => {
  const records = Array.from({ length: 1305 }, (_, index) => ({
    record_id: `response-${String(index).padStart(4, '0')}:q1`, created_at: now,
    payload: { responseId: `response-${String(index).padStart(4, '0')}`, surveyType: 'Supplier',
      respondentType: 'Employee', submissionDate: now, company: 'Synthetic supplier',
      questionId: 'q1', questionNumber: 1, question: 'Quality', questionCategory: 'Quality', rating: 2, comment: '' },
  }));
  const requests: URL[] = [];
  let controller: AbortController | undefined;
  const client = createClient('https://synthetic.supabase.co', 'synthetic-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async input => {
      const url = new URL(String(input));
      requests.push(url);
      assert.equal(url.searchParams.get('record_type'), 'eq.survey_response');
      assert.equal(url.searchParams.get('order'), 'record_id.asc');
      assert.equal(url.searchParams.has('offset'), false);
      const cursor = url.searchParams.get('record_id')?.slice(3);
      const rows = records.filter(row => !cursor || row.record_id > cursor).slice(0, 256);
      if (controller) controller.abort();
      return new Response(JSON.stringify(rows), { headers: { 'Content-Type': 'application/json' } });
    } },
  });
  const loaded = await loadApplicationRecords<SurveyResponse>('survey_response', undefined, client);
  assert.equal(loaded.length, records.length);
  assert.deepEqual(loaded.map(row => row.responseId), records.map(row => row.payload.responseId));
  assert.equal(requests.length, 7);
  const config = readFileSync(new URL('../../supabase/config.toml', import.meta.url), 'utf8');
  const maxRows = Number(config.match(/^max_rows\s*=\s*(\d+)/m)?.[1]);
  assert.ok(requests.every(url => Number(url.searchParams.get('limit')) <= maxRows));
  controller = new AbortController();
  await assert.rejects(loadApplicationRecords('survey_response', { signal: controller.signal }, client), /abort/i);
  assert.equal(requests.length, 8, 'abort prevents the next database page');
});

test('new export-history writes reject unsupported recipes before making a Supabase request', async () => {
  let requests = 0;
  const client = { from() { requests++; throw new Error('Unexpected database write'); } } as unknown as SupabaseClient;
  await assert.rejects(upsertApplicationRecords('export_history', [{
    id: 'new-history', title: 'Report', filename: 'report.pdf', format: 'pdf', exportedAt: now,
    recipe: { kind: 'future-report', parameters: {} },
  }], entry => entry.id, undefined, client), /Invalid report recipe/);
  assert.equal(requests, 0);
});

test('survey distribution metadata is optional for legacy forms and validated as a pair', () => {
  const form = { id: 'form', title: 'Evaluation', surveyType: 'Courier', createdAt: now, questions: [] };
  assert.doesNotThrow(() => parseApplicationRecordPayload('survey', form, 'form'));
  const sent = { ...form, distributionId: 'send-1', lastDistributedAt: now };
  assert.deepEqual(parseApplicationRecordPayload('survey', sent, 'form'), sent);
  for (const invalid of [{ ...form, distributionId: 'send-1' }, { ...form, lastDistributedAt: now }, { ...sent, lastDistributedAt: 'bad-date' }, { ...sent, distributionId: '' }]) {
    assert.throws(() => parseApplicationRecordPayload('survey', invalid, 'form'));
  }
});

test('Realtime shares one channel, accepts PK-only DELETE events, reconciles reconnects and cleans up', (t) => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const target = new EventTarget();
  Object.defineProperty(globalThis, 'window', { configurable: true, value: target });
  t.after(() => {
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow);
    else Reflect.deleteProperty(globalThis, 'window');
  });
  const registrations: Array<{ filter: { table: string; event: string; filter?: string }; callback: (payload: unknown) => void }> = [];
  let statusChanged: (status: string) => void = () => {};
  let channels = 0;
  let removed = 0;
  const channel = {
    on: (_event: string, filter: typeof registrations[number]['filter'], callback: (payload: unknown) => void) => {
      registrations.push({ filter, callback });
      return channel;
    },
    subscribe: (callback: typeof statusChanged) => { statusChanged = callback; return channel; },
  };
  const client = {
    channel: () => { channels++; return channel; },
    removeChannel: () => { removed++; },
  } as unknown as SupabaseClient;
  const changes: Array<{ recordType: string; recordId?: string; reason?: string }> = [];
  target.addEventListener(APPLICATION_RECORD_CHANGED_EVENT, (event) => changes.push((event as CustomEvent).detail));
  t.mock.method(console, 'error', () => {});
  const cleanup = subscribeToApplicationChanges(client);
  assert.equal(channels, 1);
  const records = registrations.find((entry) => entry.filter.table === 'application_records')!;
  assert.equal(records.filter.event, '*');
  assert.equal(records.filter.filter, undefined, 'Supabase cannot filter DELETE events');
  statusChanged('SUBSCRIBED');
  records.callback({ new: {}, old: { record_type: 'survey_response', record_id: 'r:q' }, eventType: 'DELETE' });
  assert.deepEqual(changes.at(-1), { recordType: 'survey_response', recordId: 'r:q' });
  statusChanged('CHANNEL_ERROR');
  statusChanged('SUBSCRIBED');
  assert.ok(changes.some(change => change.recordType === 'export_history' && change.reason === 'reconnect'));
  assert.ok(changes.some(change => change.recordType === 'survey_response' && change.reason === 'reconnect'));
  const count = changes.length;
  cleanup();
  statusChanged('SUBSCRIBED');
  records.callback({ new: { record_type: 'survey_response', record_id: 'late:q' } });
  assert.equal(changes.length, count, 'disposed subscription cannot publish stale changes');
  assert.equal(removed, 1);
});

test('response imports commit in one statement, validate every row and fail without partial chunks', async () => {
  const rows = Array.from({ length: 650 }, (_, index) => ({
    responseId: `r-${index}`, surveyType: 'Supplier', respondentType: 'Employee', submissionDate: now,
    company: 'Synthetic supplier', questionId: 'Q-SUP-1', questionNumber: 1,
    question: 'Quality', questionCategory: 'Quality', rating: 0, comment: '',
  } as SurveyResponse));
  const calls: unknown[][] = [];
  let failure = false;
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: 'owner' } } }) },
    from: (table: string) => {
      assert.equal(table, 'application_records');
      return { upsert: async (values: unknown[], options: unknown) => {
        calls.push([values, options]);
        return { error: failure ? { message: 'write rejected' } : null };
      } };
    },
  } as unknown as SupabaseClient;
  await upsertApplicationRecords('survey_response', rows, surveyResponseRecordId, { ownRecords: true }, client);
  assert.equal(calls.length, 1);
  assert.equal((calls[0][0] as unknown[]).length, 650);
  assert.equal((calls[0][0] as Array<{ owner_id: string }>)[0].owner_id, 'owner');
  await assert.rejects(upsertApplicationRecords('survey_response', [...rows, { ...rows[0], rating: 'invalid' as unknown as SurveyResponse['rating'] }], surveyResponseRecordId, undefined, client));
  assert.equal(calls.length, 1, 'invalid last row must reject before any write');
  failure = true;
  await assert.rejects(upsertApplicationRecords('survey_response', rows, surveyResponseRecordId, undefined, client), /write rejected/);
  assert.equal(calls.length, 2, 'failed bulk write cannot have committed an earlier chunk');
});

test('unchanged refreshed records retain references, including full reconnect reconciliation', () => {
  const rows = [{ id: 'a', value: 1 }, { id: 'b', value: 2 }];
  const merged = mergeApplicationRecordsById(rows, rows.map((r) => ({ ...r })), ['a', 'b'], (r) => r.id);
  assert.equal(merged, rows);
});

test('a changed submission loads every answer across server-capped pages, not only the event row', async () => {
  const answers = Array.from({ length: 5 }, (_, index) => ({
    record_id: `r:q${index}`, created_at: now,
    payload: { responseId: 'r', surveyType: 'Supplier', respondentType: 'Employee', submissionDate: now,
      company: 'Synthetic supplier', questionId: `q${index}`, questionNumber: index + 1,
      question: 'Quality', questionCategory: 'Quality', rating: 0, comment: '' },
  }));
  let requests = 0;
  const query = {
    select: () => query,
    eq: (column: string, value: string) => { assert.deepEqual([column, value], ['record_type', 'survey_response']); return query; },
    in: (column: string, ids: string[]) => { assert.equal(column, 'payload->>responseId'); assert.deepEqual(ids, ['r']); return query; },
    gt: (column: string, id: string) => { assert.equal(column, 'record_id'); assert.match(id, /^r:q/); return query; },
    order: () => query,
    limit: async () => { const from = (requests++) * 2; return { data: answers.slice(from, from + 2), error: null }; },
  };
  const client = { from: () => query } as unknown as SupabaseClient;
  const rows = await loadApplicationRecordsByIds<SurveyResponse>('survey_response', ['r'], 'payload->>responseId', client);
  assert.equal(rows.length, 5);
  assert.equal(requests, 4);
  const concurrentLocalRows = [rows[0]];
  const merged = mergeApplicationRecordsById(concurrentLocalRows, rows, [], surveyResponseRecordId);
  assert.equal(merged.length, 5, 'a locally saved row during the fetch cannot be duplicated');
});

const validApplicationRecords: Record<(typeof APPLICATION_RECORD_TYPES)[number], { id: string; payload: unknown }> = {
  partner_company: { id: 'company-1', payload: { id: 'company-1', name: 'Supplier One', type: 'Supplier', createdAt: now, branches: [] } },
  survey: { id: 'survey-1', payload: { id: 'survey-1', title: 'Supplier Survey', surveyType: 'Supplier', description: '', createdAt: now, archivedAt: now, status: 'Archived', questions: [{ questionId: 'q1', questionNumber: 1, question: 'Quality?', questionCategory: 'Quality' }] } },
  survey_response: { id: 'response-1:q1', payload: { responseId: 'response-1', surveyType: 'Supplier', respondentType: 'Employee', submissionDate: now, company: 'Supplier One', questionId: 'q1', questionNumber: 1, question: 'Quality?', questionCategory: 'Quality', rating: 4, comment: '' } },
  archive_series: { id: 'series-1', payload: { id: 'series-1', label: 'First Half', createdAt: now } },
  department_permission: { id: 'Logistics', payload: { department: 'Logistics', pages: ['dashboard'], surveyTypes: ['Courier'] } },
  category_labels: { id: 'global', payload: { Courier: ['Delivery'], Supplier: ['Quality'], Subcontractor: ['Safety'] } },
  feedback_contact: { id: 'contact-1', payload: { id: 'contact-1', companyName: 'Supplier One', partnerType: 'Supplier', contactPerson: '', email: '', ccEmails: [], updatedAt: now } },
  feedback_report: { id: 'report-1', payload: { id: 'report-1', surveyId: 'survey-1', surveyTitle: 'Survey', companyName: 'Supplier One', surveyType: 'Supplier', periodCovered: '2026', recipientEmail: 'partner@example.com', ccEmails: [], subject: 'Report', body: 'Body', status: 'Queued', queuedAt: now, timerDurationMinutes: 30, expiresAt: now, queuedBy: 'admin@mgenesis.com', responseCount: 3, overallScore: 90, history: [] } },
  feedback_settings: { id: 'global', payload: { defaultTimerMinutes: 30 } },
  document_notification_rule: { id: 'AFS', payload: { docName: 'AFS', label: 'AFS', origin: 'Both', mode: 'fiscal-year', enabled: true, earlyMilestoneDays: [], note: '' } },
  notification_read_state: { id: 'user-uuid', payload: { userEmail: 'user@mgenesis.com', readNotificationIds: [], updatedAt: now } },
  admin_activity: { id: 'activity-1', payload: { id: 'activity-1', action: 'Updated settings', timestamp: now } },
  document_modification: { id: 'change-1', payload: { id: 'change-1', actorEmail: 'admin@mgenesis.com', category: 'Supplier', companyName: 'Supplier One', docName: 'AFS', change: 'Renewed', timestamp: now } },
  export_history: { id: 'export-1', payload: { id: 'export-1', title: 'Report', format: 'pdf', filename: 'report.pdf', exportedAt: now } },
  supplier_ranking_history: { id: 'rank-1', payload: { id: 'rank-1', actorEmail: 'admin@mgenesis.com', timestamp: now, changedCount: 1, snapshot: [{ rank: 1, companyId: 'company-1', companyName: 'Supplier One' }] } },
  employee_notification_state: { id: 'user@mgenesis.com', payload: { id: 'user@mgenesis.com', userEmail: 'user@mgenesis.com', readIds: [], deletedIds: [], updatedAt: now } },
  reminder_settings: { id: 'global', payload: { id: 'global', frequencyHours: '24', updatedAt: now } },
  compliance_snapshot: { id: 'Supplier', payload: { id: 'Supplier', snapshots: [{ date: now, rate: 95, total: 20 }] } },
  active_company_snapshot: { id: 'supplier-snapshot-1', payload: { id: 'supplier-snapshot-1', surveyType: 'Supplier', uploadedAt: now, uploadedBy: 'admin@mgenesis.com', sourceFileName: 'suppliers.xlsx', companies: ['Supplier One'] } },
  evaluation_import_archive: { id: 'import-archive-1', payload: { id: 'import-archive-1', surveyType: 'Supplier', uploadedAt: now, uploadedBy: 'admin@mgenesis.com', sourceFileName: 'supplier-results.xlsx', storagePath: 'supplier/2026-09-24/import-archive-1.xlsx', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', fileSize: 128, importBatchId: 'client-csv:supplier:sha256' } },
};

test('uses the submission and question IDs as the stable response-row key', () => {
  const response = {
    responseId: 'response-1',
    questionId: 'Q-SUP-01',
  } as SurveyResponse;
  assert.equal(surveyResponseRecordId(response), 'response-1:Q-SUP-01');
});

test('merges changed application records and removes changed IDs absent from the RLS result', () => {
  const oldResponse = { ...validApplicationRecords.survey_response.payload as SurveyResponse };
  const keepResponse = { ...oldResponse, responseId: 'response-2' };
  const updatedResponse = { ...oldResponse, rating: 5 };
  const merged = mergeApplicationRecordsById(
    [oldResponse, keepResponse],
    [updatedResponse],
    ['response-1:q1', 'deleted-response:q1'],
    surveyResponseRecordId,
  );

  assert.deepEqual(merged, [updatedResponse, keepResponse]);
});

test('shows the realtime warning only after three consecutive failures and clears it on reconnect', () => {
  let state = { consecutiveFailures: 0, warningVisible: false };
  state = advanceRealtimeSyncState(state, 'CHANNEL_ERROR');
  assert.deepEqual(state, { consecutiveFailures: 1, warningVisible: false });
  state = advanceRealtimeSyncState(state, 'TIMED_OUT');
  assert.deepEqual(state, { consecutiveFailures: 2, warningVisible: false });
  state = advanceRealtimeSyncState(state, 'CHANNEL_ERROR');
  assert.deepEqual(state, { consecutiveFailures: 3, warningVisible: true });
  assert.deepEqual(advanceRealtimeSyncState(state, 'SUBSCRIBED'), { consecutiveFailures: 0, warningVisible: false });
});

test('keeps frontend application record types aligned with the latest database constraint', () => {
  const migration = readFileSync(
    new URL('../../supabase/migrations/202609300001_evaluation_import_archives.sql', import.meta.url),
    'utf8',
  );
  const constraint = migration.match(/add constraint application_records_record_type_check check \(record_type in \(([\s\S]*?)\)\);/i);
  assert.ok(constraint, 'latest application-record constraint was not found');
  const databaseTypes = [...constraint[1].matchAll(/'([^']+)'/g)].map((match) => match[1]).sort();
  assert.deepEqual(databaseTypes, [...APPLICATION_RECORD_TYPES].sort());
});

test('validates and normalizes profiles at the repository boundary', () => {
  assert.deepEqual(parsePersistedProfile({
    email: '  EMPLOYEE@MGENESIS.COM ',
    role: 'Employee',
    designation: 'Supervisory',
    department: 'Logistics',
    permission_pages: ['dashboard', 'analytics', 'dashboard'],
    permission_survey_types: ['Courier', 'Supplier'],
  }), {
    email: 'employee@mgenesis.com',
    role: 'Employee',
    designation: 'Supervisory',
    department: 'Logistics',
    permissions: {
      pages: ['dashboard', 'analytics'],
      surveyTypes: ['Courier', 'Supplier'],
    },
  });
});

test('rejects unsupported profile authorization values', () => {
  const base = {
    email: 'employee@mgenesis.com',
    role: 'Employee',
    designation: 'Rank & File',
    department: 'Logistics',
  };

  assert.throws(() => parsePersistedProfile({ ...base, role: 'SuperAdmin' }), /role is invalid/);
  assert.throws(() => parsePersistedProfile({ ...base, designation: 'Owner' }), /designation is invalid/);
  assert.throws(() => parsePersistedProfile({ ...base, department: 'Unknown' }), /department is invalid/);
  assert.throws(() => parsePersistedProfile({ ...base, permission_pages: ['database-admin'] }), /permission_pages/);
  assert.throws(() => parsePersistedProfile({ ...base, permission_survey_types: ['All'] }), /permission_survey_types/);
  assert.throws(() => parsePersistedProfile({ ...base, email: 'employee@example.com' }), /@mgenesis\.com/);
});

test('validates every application record type at the repository boundary', () => {
  assert.deepEqual(Object.keys(validApplicationRecords).sort(), [...APPLICATION_RECORD_TYPES].sort());
  for (const recordType of APPLICATION_RECORD_TYPES) {
    const { id, payload } = validApplicationRecords[recordType];
    assert.doesNotThrow(() => parseApplicationRecordPayload(recordType, payload, id), recordType);
  }
});

test('rejects malformed and mismatched application records without trusting TypeScript casts', () => {
  assert.throws(() => parseApplicationRecordPayload('partner_company', { id: 'other' }, 'company-1'), /record ID|name/);
  assert.throws(() => parseApplicationRecordPayload('survey_response', { ...validApplicationRecords.survey_response.payload as object, rating: Number.NaN }, 'response-1:q1'), /finite number/);
  assert.throws(() => parseApplicationRecordPayload('department_permission', { department: 'Logistics', pages: ['database-admin'], surveyTypes: ['Courier'] }, 'Logistics'), /unsupported value/);
  assert.throws(() => parseApplicationRecordPayload('reminder_settings', { id: 'global', frequencyHours: '-1', updatedAt: now }, 'global'), /positive/);
});

test('validates archived survey timestamps at the persistence boundary', () => {
  const survey = validApplicationRecords.survey;
  assert.doesNotThrow(() => parseApplicationRecordPayload('survey', survey.payload, survey.id));
  assert.throws(
    () => parseApplicationRecordPayload('survey', { ...survey.payload as object, archivedAt: 'not-a-date' }, survey.id),
    /archivedAt/,
  );
});

test('normalizes supported legacy survey-response fields before hydration', () => {
  const legacy = {
    ...validApplicationRecords.survey_response.payload as object,
    surveyType: 'Contractor',
    respondentType: null,
    submissionDate: null,
    questionCategory: 'General',
    rating: null,
    comment: null,
  };
  const parsed = parseApplicationRecordPayload('survey_response', legacy, 'response-1:q1', {
    recordCreatedAt: '2026-09-20T10:30:00.000Z',
  }) as Record<string, unknown>;
  assert.equal(parsed.surveyType, 'Courier');
  assert.equal(parsed.respondentType, 'Unspecified');
  assert.equal(parsed.submissionDate, '2026-09-20T10:30:00.000Z');
  assert.equal(parsed.submissionDateInferredFrom, 'recordCreatedAt');
  assert.equal(parsed.questionCategory, 'Overall');
  assert.equal(parsed.rating, 'N/A');
  assert.equal(parsed.comment, '');
  assert.throws(() => parseApplicationRecordPayload('survey_response', {
    ...legacy,
    surveyType: 'Unknown',
  }, 'response-1:q1'), /surveyType has an unsupported value/);
  assert.throws(() => parseApplicationRecordPayload('survey_response', {
    ...legacy,
    respondentType: 42,
  }, 'response-1:q1', { recordCreatedAt: now }), /respondentType must be text/);
  assert.throws(() => parseApplicationRecordPayload(
    'survey_response',
    legacy,
    'response-1:q1',
  ), /no trustworthy fallback timestamp/);
  assert.throws(() => parseApplicationRecordPayload('survey_response', {
    ...legacy,
    submissionDate: 'not-a-date',
  }, 'response-1:q1', { recordCreatedAt: now }), /submissionDate must be a valid date/);
});

test('rejects invalid dates and oversized collections while accepting the supported legacy date shape', () => {
  const company = validApplicationRecords.partner_company.payload as Record<string, unknown>;
  assert.doesNotThrow(() => parseApplicationRecordPayload('partner_company', {
    ...company,
    registeredAt: '24/09/2026',
  }, 'company-1'));
  assert.throws(() => parseApplicationRecordPayload('partner_company', {
    ...company,
    registeredAt: '31/02/2026',
  }, 'company-1'), /valid date/);
  assert.throws(() => parseApplicationRecordPayload('partner_company', {
    ...company,
    branches: Array.from({ length: 501 }, (_, index) => ({ id: `branch-${index}`, bpCode: '' })),
  }, 'company-1'), /bounded list/);
  assert.throws(() => parseApplicationRecordPayload('active_company_snapshot', {
    ...validApplicationRecords.active_company_snapshot.payload as object,
    companies: Array.from({ length: 10_001 }, (_, index) => `Company ${index}`),
  }, 'supplier-snapshot-1'), /invalid stored shape/i);
});
