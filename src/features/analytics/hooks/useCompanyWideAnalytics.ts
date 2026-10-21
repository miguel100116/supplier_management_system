import { useEffect, useState } from 'react';
import { loadCompanyWideAnalytics, type AnalyticsQuery } from '../services/companyWideAnalytics';
import type { AnalyticsViews } from '../domain/analyticsSnapshot';
import { createCoalescedTaskRunner } from '../../../utils/coalescedTask';

export interface CompanyWideAnalyticsState {
  key: string;
  views?: AnalyticsViews;
  error?: string;
}

export function useCompanyWideAnalytics(query: AnalyticsQuery, accountKey: string, enabled: boolean): CompanyWideAnalyticsState {
  const key = JSON.stringify([accountKey, query]);
  const [state, setState] = useState<CompanyWideAnalyticsState>({ key: '' });
  useEffect(() => {
    if (!enabled) { setState({ key }); return; }
    const controller = new AbortController();
    setState((current) => current.key === key ? current : { key });
    const run = createCoalescedTaskRunner(async () => {
      try {
        const views = await loadCompanyWideAnalytics(query, controller.signal);
        if (!controller.signal.aborted) setState({ key, views });
      } catch (error) {
        if (!controller.signal.aborted) setState({ key, error: error instanceof Error ? error.message : 'Unable to load Analytics.' });
      }
    }, () => controller.signal.aborted);
    const reload = () => { void run(key); };
    reload();
    // RLS can hide other users' change events; polling still refreshes totals.
    const interval = window.setInterval(reload, 60_000);
    window.addEventListener('focus', reload);
    window.addEventListener('supabase-application-record-changed', reload);
    window.addEventListener('supabase-application-profiles-changed', reload);
    return () => {
      controller.abort();
      window.clearInterval(interval);
      window.removeEventListener('focus', reload);
      window.removeEventListener('supabase-application-record-changed', reload);
      window.removeEventListener('supabase-application-profiles-changed', reload);
    };
  }, [key, enabled]);
  return enabled && state.key === key ? state : { key };
}
