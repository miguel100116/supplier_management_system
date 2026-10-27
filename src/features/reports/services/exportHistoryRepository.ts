import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../../../services/supabaseClient';
import { parseApplicationRecordPayload } from '../../../services/applicationRecordSchemas';
import type { ExportHistoryEntry } from './exportHistory';

// Never select retained file bytes during startup or Realtime refresh.
const METADATA = 'record_id,id:payload->id,title:payload->title,format:payload->format,filename:payload->filename,exportedAt:payload->exportedAt,exportedBy:payload->exportedBy,recipe:payload->recipe';

export async function loadExportHistoryMetadata(ownerId: string, client: SupabaseClient = supabase, signal?: AbortSignal): Promise<ExportHistoryEntry[]> {
  const entries: ExportHistoryEntry[] = [];
  let cursor: string | undefined;
  while (true) {
    signal?.throwIfAborted();
    let query = client.from('application_records').select(METADATA)
      .eq('record_type', 'export_history').eq('owner_id', ownerId);
    if (cursor !== undefined) query = query.gt('record_id', cursor);
    if (signal) query = query.abortSignal(signal);
    const { data, error } = await query.order('record_id').limit(100);
    signal?.throwIfAborted();
    if (error) throw new Error(`Unable to load export_history details: ${error.message}`);
    if (!data?.length) return entries;
    let filesQuery = client.from('application_records').select('record_id')
      .eq('record_type', 'export_history').eq('owner_id', ownerId).in('record_id', data.map(row => row.record_id))
      .not('payload->>fileDataUrl', 'is', null);
    if (signal) filesQuery = filesQuery.abortSignal(signal);
    const { data: files, error: fileError } = await filesQuery;
    signal?.throwIfAborted();
    if (fileError) throw new Error(`Unable to check saved export files: ${fileError.message}`);
    const fileIds = new Set(files?.map(row => row.record_id));
    let invalid = 0;
    for (const row of data) {
      try {
        const { record_id: id, ...metadata } = row;
        const entry = parseApplicationRecordPayload('export_history', {
          ...metadata, ...(metadata.recipe === null ? { recipe: undefined } : {}),
        }, id) as unknown as ExportHistoryEntry;
        entries.push({ ...entry, hasSavedFile: fileIds.has(id) });
      } catch { invalid++; }
    }
    if (invalid && typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('supabase-persistence-error', {
      detail: `${invalid} invalid export_history details were quarantined during refresh.`,
    }));
    // Continue after short pages too: hosted PostgREST may enforce a smaller row cap.
    cursor = data.at(-1)!.record_id;
  }
}

export async function loadSavedExportFile(id: string, ownerId: string, client: SupabaseClient = supabase): Promise<ExportHistoryEntry> {
  const { data, error } = await client.from('application_records').select('record_id,payload')
    .eq('record_type', 'export_history').eq('owner_id', ownerId).eq('record_id', id).maybeSingle();
  if (error) throw new Error(`Unable to load the saved export file: ${error.message}`);
  if (!data) throw new Error('This saved export is no longer available.');
  return parseApplicationRecordPayload('export_history', data.payload, id) as unknown as ExportHistoryEntry;
}
