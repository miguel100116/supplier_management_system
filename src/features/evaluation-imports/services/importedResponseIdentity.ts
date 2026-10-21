import type { SurveyResponse } from '../../../types/survey';
import { getResponseDataSource } from '../../analytics/domain/responseProvenance';

function scope(response: SurveyResponse): string {
  return JSON.stringify([response.surveyType, response.surveyId ?? `default-${response.surveyType.toLowerCase()}`,
    Boolean(response.archived), response.seriesId ?? null]);
}

// UUID v5 matches the original normalized importer; SHA-1 is used only for identity compatibility.
async function originalSubmissionId(type: string, sourceId: string): Promise<string> {
  const namespace = Uint8Array.from('6ba7b8119dad11d180b400c04fd430c8'.match(/../g)!, (byte) => parseInt(byte, 16));
  const name = new TextEncoder().encode(`supplier-management-system:evaluation-submission:evaluation-form-${type.toLowerCase()}:${sourceId}`);
  const input = new Uint8Array(namespace.length + name.length);
  input.set(namespace);
  input.set(name, namespace.length);
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-1', input)).slice(0, 16);
  bytes[6] = (bytes[6] & 15) | 80;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Prefer a standard CSV re-upload over its original UUID copy without deleting stored records. */
export async function createImportedResponseFilter(responses: readonly SurveyResponse[]): Promise<(response: SurveyResponse) => boolean> {
  const uploads = new Map<string, SurveyResponse[]>();
  for (const response of responses) {
    if (getResponseDataSource(response) !== 'client_csv') continue;
    const match = /^IMPORT-(COURIER|SUPPLIER|SUBCONTRACTOR)-(\d+)$/.exec(response.responseId);
    if (!match || match[1] !== response.surveyType.toUpperCase()) continue;
    const entries = uploads.get(response.responseId) ?? [];
    // One representative per scope/company is enough; do not hash every question row.
    if (!entries.some((entry) => scope(entry) === scope(response) && entry.company === response.company)) entries.push(response);
    uploads.set(response.responseId, entries);
  }
  const aliases = new Map(await Promise.all([...uploads].map(async ([id, entries]) => {
    const match = /^IMPORT-(COURIER|SUPPLIER|SUBCONTRACTOR)-(\d+)$/.exec(id)!;
    return [await originalSubmissionId(entries[0].surveyType, match[2]), entries] as const;
  })));
  return (response) => {
    if (getResponseDataSource(response) !== 'client_csv') return true;
    return !aliases.get(response.responseId)?.some((upload) => scope(upload) === scope(response)
      && Number.isFinite(Date.parse(response.submissionDate))
      && Date.parse(upload.submissionDate) === Date.parse(response.submissionDate)
      && (upload.respondentEmail ?? '').trim().toLowerCase() === (response.respondentEmail ?? '').trim().toLowerCase()
      && ((upload.companyId && upload.companyId === response.companyId)
        || upload.company.trim().toLowerCase() === response.company.trim().toLowerCase()));
  };
}
