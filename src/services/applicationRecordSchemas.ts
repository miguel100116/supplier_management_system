import { parseActiveCompanySnapshot } from '../features/active-companies/domain/activeCompanySnapshots';
import { parseEvaluationImportArchive } from '../features/evaluation-imports/domain/importArchive';
import { LEGACY_OVERALL_CATEGORY, OVERALL_CATEGORY } from '../data/questionCategories';

type JsonObject = Record<string, unknown>;

export interface ApplicationRecordParseContext {
  recordCreatedAt?: string;
}

const SURVEY_TYPES = ['Courier', 'Supplier', 'Subcontractor'] as const;
const PARTNER_TYPES = [...SURVEY_TYPES, 'Uncategorized'] as const;
const PAGE_MODULES = [
  'dashboard', 'survey-forms', 'explorer', 'analytics', 'reports', 'present',
  'partner-companies', 'partners-feedback-hub', 'account-management', 'notifications',
  'archive', 'import-evaluations', 'document-register', 'renew-documents',
] as const;
const LEGACY_PAGE_MODULES = ['supplier-ranking'] as const;
const PROFILE_DEPARTMENTS = [
  'Accounts Payable - Trade', 'Business Solutions Manager', 'Executive Office',
  'Logistics', 'Procurement Group', 'TASS',
] as const;

function object(value: unknown, label: string): JsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as JsonObject;
}

function text(value: unknown, label: string, options?: { allowEmpty?: boolean; max?: number }): string {
  if (typeof value !== 'string') throw new Error(`${label} must be text.`);
  if (!options?.allowEmpty && !value.trim()) throw new Error(`${label} is required.`);
  if (value.length > (options?.max ?? 20_000)) throw new Error(`${label} is too long.`);
  return value;
}

function optionalText(value: unknown, label: string, max?: number): void {
  if (value !== undefined && value !== null) text(value, label, { allowEmpty: true, max });
}

function finiteNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${label} must be a finite number.`);
  return value;
}

function optionalNumber(value: unknown, label: string): void {
  if (value !== undefined && value !== null) finiteNumber(value, label);
}

function optionalBoolean(value: unknown, label: string): void {
  if (value !== undefined && value !== null && typeof value !== 'boolean') throw new Error(`${label} must be true or false.`);
}

function isoDate(value: unknown, label: string): string {
  const result = text(value, label, { max: 100 });
  if (Number.isNaN(Date.parse(result))) throw new Error(`${label} must be a valid date.`);
  return result;
}

function optionalDate(value: unknown, label: string): void {
  if (value === undefined || value === null || value === '') return;
  const result = text(value, label, { max: 100 });
  if (!Number.isNaN(Date.parse(result))) return;
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(result);
  if (match) {
    const day = Number(match[1]);
    const month = Number(match[2]);
    const year = Number(match[3]);
    const candidate = new Date(Date.UTC(year, month - 1, day));
    if (candidate.getUTCFullYear() === year && candidate.getUTCMonth() === month - 1 && candidate.getUTCDate() === day) return;
  }
  throw new Error(`${label} must be a valid date.`);
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], label: string): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) throw new Error(`${label} has an unsupported value.`);
  return value as T;
}

function stringArray(value: unknown, label: string, maxItems = 2_000): string[] {
  if (!Array.isArray(value) || value.length > maxItems) throw new Error(`${label} must be a bounded list.`);
  value.forEach((item, index) => text(item, `${label}[${index}]`, { allowEmpty: false, max: 2_000 }));
  return value as string[];
}

function optionalStringArray(value: unknown, label: string, maxItems?: number): void {
  if (value !== undefined && value !== null) stringArray(value, label, maxItems);
}

function assertRecordId(candidate: JsonObject, recordId: string, label: string, key = 'id'): void {
  if (text(candidate[key], `${label}.${key}`, { max: 500 }) !== recordId) {
    throw new Error(`${label}.${key} does not match its database record ID.`);
  }
}

function parsePartnerCompany(value: unknown, recordId: string, label: string): JsonObject {
  const candidate = object(value, label);
  assertRecordId(candidate, recordId, label);
  optionalText(candidate.testImportBatchId, `${label}.testImportBatchId`, 2_000);
  text(candidate.name, `${label}.name`, { max: 500 });
  oneOf(candidate.type, PARTNER_TYPES, `${label}.type`);
  isoDate(candidate.createdAt, `${label}.createdAt`);
  optionalDate(candidate.registeredAt, `${label}.registeredAt`);
  optionalBoolean(candidate.isArchived, `${label}.isArchived`);
  optionalDate(candidate.archivedAt, `${label}.archivedAt`);
  if (candidate.branches !== undefined) {
    if (!Array.isArray(candidate.branches) || candidate.branches.length > 500) throw new Error(`${label}.branches must be a bounded list.`);
    candidate.branches.forEach((branch, index) => {
      const parsed = object(branch, `${label}.branches[${index}]`);
      text(parsed.id, `${label}.branches[${index}].id`, { max: 500 });
      text(parsed.bpCode, `${label}.branches[${index}].bpCode`, { allowEmpty: true, max: 500 });
      optionalDate(parsed.dateAccredited, `${label}.branches[${index}].dateAccredited`);
      if (parsed.documents !== undefined) {
        const documents = object(parsed.documents, `${label}.branches[${index}].documents`);
        Object.entries(documents).forEach(([name, document]) => {
          text(name, `${label}.documentName`, { max: 500 });
          const parsedDocument = object(document, `${label}.documents.${name}`);
          optionalBoolean(parsedDocument.provided, `${label}.documents.${name}.provided`);
          optionalDate(parsedDocument.expiryDate, `${label}.documents.${name}.expiryDate`);
        });
      }
    });
  }
  return candidate;
}

function parseSurvey(value: unknown, recordId: string, label: string): JsonObject {
  const candidate = object(value, label);
  assertRecordId(candidate, recordId, label);
  text(candidate.title, `${label}.title`, { max: 500 });
  oneOf(candidate.surveyType, SURVEY_TYPES, `${label}.surveyType`);
  isoDate(candidate.createdAt, `${label}.createdAt`);
  optionalDate(candidate.archivedAt, `${label}.archivedAt`);
  optionalDate(candidate.deadlineDate, `${label}.deadlineDate`);
  if (!Array.isArray(candidate.questions) || candidate.questions.length > 1_000) throw new Error(`${label}.questions must be a bounded list.`);
  candidate.questions.forEach((question, index) => {
    const parsed = object(question, `${label}.questions[${index}]`);
    text(parsed.questionId, `${label}.questions[${index}].questionId`, { max: 500 });
    finiteNumber(parsed.questionNumber, `${label}.questions[${index}].questionNumber`);
    text(parsed.question, `${label}.questions[${index}].question`, { max: 10_000 });
    text(parsed.questionCategory, `${label}.questions[${index}].questionCategory`, { max: 500 });
  });
  optionalStringArray(candidate.accessDepartments, `${label}.accessDepartments`, 100);
  optionalStringArray(candidate.accessRoles, `${label}.accessRoles`, 20);
  optionalStringArray(candidate.evaluationCompanyIds, `${label}.evaluationCompanyIds`, 10_000);
  return candidate;
}

function timestampFromResponseId(responseId: string): string | null {
  const match = /^RESP-(\d{13})-/.exec(responseId);
  if (!match) return null;
  const timestamp = Number(match[1]);
  const date = new Date(timestamp);
  if (!Number.isFinite(timestamp) || Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function parseSurveyResponse(
  value: unknown,
  recordId: string,
  label: string,
  context?: ApplicationRecordParseContext,
): JsonObject {
  const candidate = object(value, label);
  const responseId = text(candidate.responseId, `${label}.responseId`, { max: 500 });
  text(candidate.questionId, `${label}.questionId`, { max: 500 });
  if (`${candidate.responseId}:${candidate.questionId}` !== recordId) throw new Error(`${label} does not match its database record ID.`);
  const surveyType = candidate.surveyType === 'Contractor'
    ? 'Courier'
    : oneOf(candidate.surveyType, SURVEY_TYPES, `${label}.surveyType`);
  const respondentType = candidate.respondentType === null
    || candidate.respondentType === undefined
    || (typeof candidate.respondentType === 'string' && candidate.respondentType.trim() === '')
    ? 'Unspecified'
    : text(candidate.respondentType, `${label}.respondentType`, { max: 500 });
  let submissionDate: string;
  let submissionDateInferredFrom: 'startTime' | 'responseId' | 'recordCreatedAt' | undefined;
  if (candidate.submissionDate !== null && candidate.submissionDate !== undefined && candidate.submissionDate !== '') {
    submissionDate = isoDate(candidate.submissionDate, `${label}.submissionDate`);
  } else if (candidate.startTime !== null && candidate.startTime !== undefined && candidate.startTime !== '') {
    submissionDate = isoDate(candidate.startTime, `${label}.startTime`);
    submissionDateInferredFrom = 'startTime';
  } else {
    const responseTimestamp = timestampFromResponseId(responseId);
    if (responseTimestamp) {
      submissionDate = responseTimestamp;
      submissionDateInferredFrom = 'responseId';
    } else if (context?.recordCreatedAt) {
      submissionDate = isoDate(context.recordCreatedAt, `${label}.recordCreatedAt`);
      submissionDateInferredFrom = 'recordCreatedAt';
    } else {
      throw new Error(`${label}.submissionDate is required and no trustworthy fallback timestamp is available.`);
    }
  }
  text(candidate.company, `${label}.company`, { max: 500 });
  finiteNumber(candidate.questionNumber, `${label}.questionNumber`);
  text(candidate.question, `${label}.question`, { max: 10_000 });
  const questionCategory = text(candidate.questionCategory, `${label}.questionCategory`, { max: 500 });
  const rating = candidate.rating === null || candidate.rating === undefined ? 'N/A' : candidate.rating;
  if (rating !== 'N/A') finiteNumber(rating, `${label}.rating`);
  const comment = candidate.comment === null || candidate.comment === undefined
    ? ''
    : text(candidate.comment, `${label}.comment`, { allowEmpty: true, max: 20_000 });
  optionalDate(candidate.startTime, `${label}.startTime`);
  optionalDate(candidate.archivedAt, `${label}.archivedAt`);
  optionalBoolean(candidate.archived, `${label}.archived`);
  optionalText(candidate.respondentEmail, `${label}.respondentEmail`, 500);
  optionalText(candidate.surveyId, `${label}.surveyId`, 500);
  optionalText(candidate.companyId, `${label}.companyId`, 500);
  optionalText(candidate.importBatchId, `${label}.importBatchId`, 2_000);
  if (candidate.dataSource !== undefined && candidate.dataSource !== null) {
    oneOf(candidate.dataSource, ['client_csv', 'production_submission', 'test_submission'], `${label}.dataSource`);
  }
  if (candidate.submissionDateInferredFrom !== undefined && candidate.submissionDateInferredFrom !== null) {
    oneOf(candidate.submissionDateInferredFrom, ['startTime', 'responseId', 'recordCreatedAt'], `${label}.submissionDateInferredFrom`);
  }
  return {
    ...candidate,
    surveyType,
    respondentType,
    submissionDate,
    ...(submissionDateInferredFrom ? { submissionDateInferredFrom } : {}),
    questionCategory: questionCategory === LEGACY_OVERALL_CATEGORY ? OVERALL_CATEGORY : questionCategory,
    rating,
    comment,
  };
}

function parseArchiveSeries(value: unknown, recordId: string, label: string): JsonObject {
  const candidate = object(value, label);
  assertRecordId(candidate, recordId, label);
  text(candidate.label, `${label}.label`, { max: 500 });
  isoDate(candidate.createdAt, `${label}.createdAt`);
  return candidate;
}

function parseDepartmentPermission(value: unknown, recordId: string, label: string): JsonObject {
  const candidate = object(value, label);
  if (oneOf(candidate.department, PROFILE_DEPARTMENTS, `${label}.department`) !== recordId) {
    throw new Error(`${label}.department does not match its database record ID.`);
  }
  const pages = stringArray(candidate.pages, `${label}.pages`, 100);
  pages.forEach((page, index) => oneOf(page, [...PAGE_MODULES, ...LEGACY_PAGE_MODULES], `${label}.pages[${index}]`));
  const surveyTypes = stringArray(candidate.surveyTypes, `${label}.surveyTypes`, 10);
  surveyTypes.forEach((type, index) => oneOf(type, SURVEY_TYPES, `${label}.surveyTypes[${index}]`));
  return { ...candidate, pages: pages.filter((page) => page !== 'supplier-ranking') };
}

function parseCategoryLabels(value: unknown, recordId: string, label: string): JsonObject {
  if (recordId !== 'global') throw new Error(`${label} must use the global record ID.`);
  const candidate = object(value, label);
  SURVEY_TYPES.forEach((type) => stringArray(candidate[type], `${label}.${type}`, 500));
  return candidate;
}

function parseSimpleIdRecord(value: unknown, recordId: string, label: string): JsonObject {
  const candidate = object(value, label);
  assertRecordId(candidate, recordId, label);
  return candidate;
}

function parseFeedbackContact(value: unknown, recordId: string, label: string): JsonObject {
  const candidate = parseSimpleIdRecord(value, recordId, label);
  text(candidate.companyName, `${label}.companyName`, { max: 500 });
  oneOf(candidate.partnerType, SURVEY_TYPES, `${label}.partnerType`);
  text(candidate.contactPerson, `${label}.contactPerson`, { allowEmpty: true, max: 500 });
  text(candidate.email, `${label}.email`, { allowEmpty: true, max: 500 });
  stringArray(candidate.ccEmails, `${label}.ccEmails`, 100);
  isoDate(candidate.updatedAt, `${label}.updatedAt`);
  return candidate;
}

function parseFeedbackReport(value: unknown, recordId: string, label: string): JsonObject {
  const candidate = parseSimpleIdRecord(value, recordId, label);
  text(candidate.surveyId, `${label}.surveyId`, { max: 500 });
  text(candidate.companyName, `${label}.companyName`, { max: 500 });
  oneOf(candidate.surveyType, SURVEY_TYPES, `${label}.surveyType`);
  oneOf(candidate.status, ['Queued', 'Returned', 'Sent', 'Failed'], `${label}.status`);
  isoDate(candidate.queuedAt, `${label}.queuedAt`);
  isoDate(candidate.expiresAt, `${label}.expiresAt`);
  finiteNumber(candidate.responseCount, `${label}.responseCount`);
  finiteNumber(candidate.overallScore, `${label}.overallScore`);
  if (!Array.isArray(candidate.history) || candidate.history.length > 1_000) throw new Error(`${label}.history must be a bounded list.`);
  return candidate;
}

function parseFeedbackSettings(value: unknown, recordId: string, label: string): JsonObject {
  if (recordId !== 'global') throw new Error(`${label} must use the global record ID.`);
  const candidate = object(value, label);
  finiteNumber(candidate.defaultTimerMinutes, `${label}.defaultTimerMinutes`);
  return candidate;
}

function parseNotificationRule(value: unknown, recordId: string, label: string): JsonObject {
  const candidate = object(value, label);
  if (text(candidate.docName, `${label}.docName`, { max: 500 }) !== recordId) throw new Error(`${label}.docName does not match its database record ID.`);
  text(candidate.label, `${label}.label`, { max: 500 });
  oneOf(candidate.origin, ['Local', 'Foreign', 'Both'], `${label}.origin`);
  oneOf(candidate.mode, ['fiscal-year', 'day-milestones'], `${label}.mode`);
  if (typeof candidate.enabled !== 'boolean') throw new Error(`${label}.enabled must be true or false.`);
  if (!Array.isArray(candidate.earlyMilestoneDays) || candidate.earlyMilestoneDays.some((day) => typeof day !== 'number' || !Number.isFinite(day))) {
    throw new Error(`${label}.earlyMilestoneDays must contain finite numbers.`);
  }
  return candidate;
}

function parseNotificationReadState(value: unknown, recordId: string, label: string): JsonObject {
  const candidate = object(value, label);
  if (!recordId) throw new Error(`${label} requires a record ID.`);
  text(candidate.userEmail, `${label}.userEmail`, { max: 500 });
  stringArray(candidate.readNotificationIds, `${label}.readNotificationIds`, 20_000);
  isoDate(candidate.updatedAt, `${label}.updatedAt`);
  return candidate;
}

function parseAdminActivity(value: unknown, recordId: string, label: string): JsonObject {
  const candidate = parseSimpleIdRecord(value, recordId, label);
  text(candidate.action, `${label}.action`, { max: 2_000 });
  isoDate(candidate.timestamp, `${label}.timestamp`);
  return candidate;
}

function parseDocumentModification(value: unknown, recordId: string, label: string): JsonObject {
  const candidate = parseSimpleIdRecord(value, recordId, label);
  ['actorEmail', 'category', 'companyName', 'docName', 'change'].forEach((key) => text(candidate[key], `${label}.${key}`, { max: 2_000 }));
  isoDate(candidate.timestamp, `${label}.timestamp`);
  return candidate;
}

function parseExportHistory(value: unknown, recordId: string, label: string): JsonObject {
  const candidate = parseSimpleIdRecord(value, recordId, label);
  text(candidate.title, `${label}.title`, { max: 2_000 });
  oneOf(candidate.format, ['pdf', 'csv', 'excel', 'docx'], `${label}.format`);
  text(candidate.filename, `${label}.filename`, { max: 2_000 });
  isoDate(candidate.exportedAt, `${label}.exportedAt`);
  return candidate;
}

function parseRankingHistory(value: unknown, recordId: string, label: string): JsonObject {
  const candidate = parseSimpleIdRecord(value, recordId, label);
  text(candidate.actorEmail, `${label}.actorEmail`, { max: 500 });
  isoDate(candidate.timestamp, `${label}.timestamp`);
  finiteNumber(candidate.changedCount, `${label}.changedCount`);
  if (!Array.isArray(candidate.snapshot) || candidate.snapshot.length > 20) throw new Error(`${label}.snapshot must contain at most 20 entries.`);
  candidate.snapshot.forEach((slot, index) => finiteNumber(object(slot, `${label}.snapshot[${index}]`).rank, `${label}.snapshot[${index}].rank`));
  return candidate;
}

function parseEmployeeNotificationState(value: unknown, recordId: string, label: string): JsonObject {
  const candidate = parseSimpleIdRecord(value, recordId, label);
  text(candidate.userEmail, `${label}.userEmail`, { max: 500 });
  stringArray(candidate.readIds, `${label}.readIds`, 20_000);
  stringArray(candidate.deletedIds, `${label}.deletedIds`, 20_000);
  isoDate(candidate.updatedAt, `${label}.updatedAt`);
  return candidate;
}

function parseReminderSettings(value: unknown, recordId: string, label: string): JsonObject {
  const candidate = parseSimpleIdRecord(value, recordId, label);
  if (recordId !== 'global') throw new Error(`${label} must use the global record ID.`);
  const frequency = text(candidate.frequencyHours, `${label}.frequencyHours`, { max: 20 });
  if (!Number.isFinite(Number(frequency)) || Number(frequency) <= 0) throw new Error(`${label}.frequencyHours must be positive.`);
  isoDate(candidate.updatedAt, `${label}.updatedAt`);
  return candidate;
}

function parseComplianceSnapshot(value: unknown, recordId: string, label: string): JsonObject {
  const candidate = parseSimpleIdRecord(value, recordId, label);
  if (!Array.isArray(candidate.snapshots) || candidate.snapshots.length > 5_000) throw new Error(`${label}.snapshots must be a bounded list.`);
  candidate.snapshots.forEach((snapshot, index) => {
    const parsed = object(snapshot, `${label}.snapshots[${index}]`);
    isoDate(parsed.date, `${label}.snapshots[${index}].date`);
    finiteNumber(parsed.rate, `${label}.snapshots[${index}].rate`);
    finiteNumber(parsed.total, `${label}.snapshots[${index}].total`);
  });
  return candidate;
}

export function parseApplicationRecordPayload(
  recordType: string,
  value: unknown,
  recordId: string,
  context?: ApplicationRecordParseContext,
): unknown {
  const label = `${recordType}/${recordId}`;
  switch (recordType) {
    case 'partner_company': return parsePartnerCompany(value, recordId, label);
    case 'survey': return parseSurvey(value, recordId, label);
    case 'survey_response': return parseSurveyResponse(value, recordId, label, context);
    case 'archive_series': return parseArchiveSeries(value, recordId, label);
    case 'department_permission': return parseDepartmentPermission(value, recordId, label);
    case 'category_labels': return parseCategoryLabels(value, recordId, label);
    case 'feedback_contact': return parseFeedbackContact(value, recordId, label);
    case 'feedback_report': return parseFeedbackReport(value, recordId, label);
    case 'feedback_settings': return parseFeedbackSettings(value, recordId, label);
    case 'document_notification_rule': return parseNotificationRule(value, recordId, label);
    case 'notification_read_state': return parseNotificationReadState(value, recordId, label);
    case 'admin_activity': return parseAdminActivity(value, recordId, label);
    case 'document_modification': return parseDocumentModification(value, recordId, label);
    case 'export_history': return parseExportHistory(value, recordId, label);
    case 'supplier_ranking_history': return parseRankingHistory(value, recordId, label);
    case 'employee_notification_state': return parseEmployeeNotificationState(value, recordId, label);
    case 'reminder_settings': return parseReminderSettings(value, recordId, label);
    case 'compliance_snapshot': return parseComplianceSnapshot(value, recordId, label);
    case 'active_company_snapshot': {
      const snapshot = parseActiveCompanySnapshot(value);
      if (snapshot.id !== recordId) throw new Error(`${label}.id does not match its database record ID.`);
      return snapshot;
    }
    case 'evaluation_import_archive': {
      const archive = parseEvaluationImportArchive(value);
      if (archive.id !== recordId) throw new Error(`${label}.id does not match its database record ID.`);
      return archive;
    }
    default: throw new Error(`Unsupported application record type: ${recordType}.`);
  }
}
