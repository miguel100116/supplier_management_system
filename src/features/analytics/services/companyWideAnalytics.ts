import type { SurveyType } from '../../../types/survey';
import type { AnalyticsDateRange } from '../domain/dateRange';
import { getAnalyticsDateRangeError } from '../domain/dateRange';
import { parseAnalyticsViews } from '../domain/analyticsSnapshot';
import { supabase } from '../../../services/supabaseClient';

export interface AnalyticsQuery {
  scope: 'current' | 'all-time' | 'custom';
  types: SurveyType[];
  dateRange: AnalyticsDateRange;
  series: string[];
}

export function analyticsQueryParams(query: AnalyticsQuery): URLSearchParams {
  const params = new URLSearchParams({ scope: query.scope, types: query.types.join(',') });
  if (query.scope === 'custom') {
    const error = getAnalyticsDateRangeError(query.dateRange);
    if (error) throw new Error(error);
    const { from, to } = query.dateRange;
    if (from) params.set('from', new Date(`${from}T00:00:00`).toISOString());
    if (to) {
      const end = new Date(`${to}T00:00:00`);
      end.setDate(end.getDate() + 1);
      params.set('to', end.toISOString());
    }
    params.set('series', query.series.join(','));
  }
  return params;
}

export async function loadCompanyWideAnalytics(query: AnalyticsQuery, signal: AbortSignal) {
  const params = analyticsQueryParams(query);
  const session = await supabase.auth.getSession();
  if (session.error || !session.data.session) throw new Error('Sign in again to load Analytics.');
  const response = await fetch(`/api/analytics?${params}`, {
    headers: { Authorization: `Bearer ${session.data.session.access_token}` }, cache: 'no-store', signal,
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error('Company-wide Analytics is unavailable. Please retry or contact your administrator.');
  }
  return parseAnalyticsViews(payload);
}
