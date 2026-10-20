import type { RequestHandler } from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ArchiveSeries, PartnerCompany, SurveyResponse, SurveyType } from '../src/types/survey';
import { parseApplicationRecordPayload } from '../src/services/applicationRecordSchemas';
import { parsePersistedProfile } from '../src/features/account-management/domain/accountProfile';
import { getProfilePermissions, type UserPermissions } from '../src/utils/rbac';
import { isOfficialAnalyticsResponse } from '../src/features/analytics/domain/responseProvenance';
import { buildAnalyticsViews } from '../src/features/analytics/domain/analyticsSnapshot';
import { DEFAULT_CATEGORIES } from '../src/data/questionCategories';
import { createImportedResponseFilter } from '../src/features/evaluation-imports/services/importedResponseIdentity';

function parseQuery(query: Record<string, unknown>) {
  if (Object.keys(query).some((key) => !['scope', 'types', 'series', 'from', 'to'].includes(key))) throw new Error('Invalid Analytics filter.');
  const scope = query.scope ?? 'current';
  if (scope !== 'current' && scope !== 'all-time' && scope !== 'custom') throw new Error('Invalid Analytics scope.');
  const list = (value: unknown): string[] => {
    if (value === undefined || value === '') return [];
    if (typeof value !== 'string' || value.length > 10_000) throw new Error('Invalid Analytics selection.');
    return [...new Set(value.split(','))];
  };
  const types = list(query.types);
  if (types.some((type) => !['Courier', 'Supplier', 'Subcontractor'].includes(type))) throw new Error('Invalid Analytics category.');
  const boundary = (value: unknown) => {
    if (value === undefined || value === '') return undefined;
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) throw new Error('Invalid Analytics date.');
    return Date.parse(value);
  };
  const from = boundary(query.from);
  const to = boundary(query.to);
  if (from !== undefined && to !== undefined && from >= to) throw new Error('Invalid Analytics date range.');
  return { scope, types: types as SurveyType[], series: list(query.series), from, to };
}

// Explicit pagination avoids silently calculating from Supabase's first page.
async function readRecords(client: SupabaseClient, types: string[]) {
  const query = (count?: 'exact') => client.from('application_records').select('record_type,record_id,payload,created_at', count ? { count } : {})
    .in('record_type', types).order('record_type').order('record_id');
  // This server-only client bypasses RLS; count once to bound parallel reads.
  const first = await query('exact').range(0, 999);
  if (first.error || !Array.isArray(first.data) || first.count === null || !Number.isInteger(first.count)
    || first.count < first.data.length || (first.count > 0 && !first.data.length)) throw new Error('Analytics read failed.');
  const records = [...first.data];
  const total = first.count;
  const pageSize = first.data.length;
  for (let from = pageSize; from < total; from += pageSize * 4) {
    const offsets = Array.from({ length: Math.min(4, Math.ceil((total - from) / pageSize)) }, (_, index) => from + index * pageSize);
    const pages = await Promise.all(offsets.map((offset) => query().range(offset, Math.min(offset + pageSize, total) - 1)));
    pages.forEach((page, index) => {
      const expected = Math.min(pageSize, total - offsets[index]);
      if (page.error || !Array.isArray(page.data) || page.data.length !== expected) throw new Error('Analytics read failed.');
      records.push(...page.data);
    });
  }
  return records;
}

export function analyticsHandler(client: SupabaseClient | null): RequestHandler {
  return async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const token = /^Bearer (\S+)$/i.exec(req.headers.authorization ?? '')?.[1];
    if (!token) { res.status(401).json({ error: 'Sign in again to load Analytics.' }); return; }
    if (!client) { res.status(503).json({ error: 'Company-wide Analytics requires the configured application server.' }); return; }
    let query: ReturnType<typeof parseQuery>;
    try { query = parseQuery(req.query); }
    catch { res.status(400).json({ error: 'Invalid Analytics filters or date range.' }); return; }
    try {
      const identity = await client.auth.getUser(token);
      const user = identity.data.user;
      if (identity.error || !user?.email_confirmed_at || !user.email?.toLowerCase().endsWith('@mgenesis.com')) {
        res.status(401).json({ error: 'Sign in with your confirmed company account.' }); return;
      }
      const actor = await client.from('app_profiles').select('email,role,designation,department,permission_pages,permission_survey_types')
        .eq('email', user.email.toLowerCase()).eq('user_id', user.id).maybeSingle();
      if (actor.error) throw new Error('Authorization check failed.');
      if (!actor.data) { res.status(403).json({ error: 'An authorized account is required for Analytics.' }); return; }
      const profile = parsePersistedProfile(actor.data);
      const departments: Record<string, UserPermissions> = {};
      for (const row of await readRecords(client, ['department_permission'])) {
        departments[row.record_id] = parseApplicationRecordPayload(row.record_type, row.payload, row.record_id) as UserPermissions;
      }
      const permissions = getProfilePermissions(profile, departments);
      if (!permissions.pages.includes('analytics') || query.types.some((type) => !permissions.surveyTypes.includes(type))) {
        res.status(403).json({ error: 'Your account does not have access to these Analytics.' }); return;
      }
      const types = query.types.length ? query.types : permissions.surveyTypes;
      const responses: SurveyResponse[] = [];
      const partners: PartnerCompany[] = [];
      const series: ArchiveSeries[] = [];
      let labels = DEFAULT_CATEGORIES;
      for (const row of await readRecords(client, ['survey_response', 'partner_company', 'archive_series', 'category_labels'])) {
        const parsed = parseApplicationRecordPayload(row.record_type, row.payload, row.record_id, { recordCreatedAt: row.created_at });
        if (row.record_type === 'survey_response') responses.push(parsed as SurveyResponse);
        else if (row.record_type === 'partner_company') partners.push(parsed as PartnerCompany);
        else if (row.record_type === 'archive_series') series.push(parsed as ArchiveSeries);
        else labels = parsed as Record<SurveyType, string[]>;
      }
      const uniqueResponses = responses.filter(await createImportedResponseFilter(responses));
      const scoped = uniqueResponses.filter((r) => {
        if (!types.includes(r.surveyType) || !isOfficialAnalyticsResponse(r)) return false;
        if (query.scope === 'current') return !r.archived;
        if (query.scope === 'all-time') return true;
        const timestamp = Date.parse(r.submissionDate);
        return (query.from === undefined || timestamp >= query.from) && (query.to === undefined || timestamp < query.to)
          && (!query.series.length || Boolean(r.seriesId && query.series.includes(r.seriesId)));
      });
      const views = buildAnalyticsViews(scoped, types, partners, series);
      const categories = new Set([views.all, ...views.categories.map((category) => category.snapshot)].flatMap((snapshot) => snapshot.analysis));
      for (const category of categories) {
        const rename = (name: string) => labels[category.type][DEFAULT_CATEGORIES[category.type].indexOf(name)] || name;
        category.peerAverages.forEach((section) => { section.section = rename(section.section); });
        category.companies.forEach((company) => company.sections.forEach((section) => { section.section = rename(section.section); }));
      }
      res.json({ ...views.all, categories: views.categories });
    } catch {
      // Never serve partial figures, provider diagnostics, or raw response data.
      res.status(502).json({ error: 'Unable to load complete company-wide Analytics. Please retry.' });
    }
  };
}
