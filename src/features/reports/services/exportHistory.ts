import { deleteApplicationRecords, loadApplicationRecords, upsertApplicationRecords } from '../../../services/applicationRepository';
import { supabase } from '../../../services/supabaseClient';
import { reportFilename, type ReportFormat, type ReportRecipe } from '../domain/reportHistory';

export interface ExportHistoryEntry {
  id: string;
  title: string;
  format: ReportFormat;
  filename: string;
  exportedAt: string;
  exportedBy?: string;
  recipe?: ReportRecipe;
  fileDataUrl?: string;
}

let history: ExportHistoryEntry[] = [];
let historyUser: string | null = null;
const notify = () => window.dispatchEvent(new Event('export-history-updated'));
supabase.auth.onAuthStateChange((_event, session) => {
  const userId = session?.user.id ?? null;
  if (historyUser !== userId) { history = []; historyUser = userId; if (typeof window !== 'undefined') notify(); }
});

export function getExportHistory(): ExportHistoryEntry[] { return history; }

export async function logExport(entry: Omit<ExportHistoryEntry, 'id' | 'exportedAt'>) {
  const userId = historyUser;
  try {
    const next = { ...entry, id: `EXP-${crypto.randomUUID()}`, exportedAt: new Date().toISOString() };
    await upsertApplicationRecords('export_history', [next], item => item.id, { ownRecords: true });
    if (userId !== historyUser) return;
    history = [next, ...history.filter(item => item.id !== next.id)].sort((a, b) => b.exportedAt.localeCompare(a.exportedAt));
    notify();
  } catch {
    window.dispatchEvent(new CustomEvent('supabase-persistence-error', { detail: 'The file was downloaded, but its export history could not be saved. Generate it again to retry.' }));
  }
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function saveReportDownload(blob: Blob, title: string, format: ReportFormat, recipe?: ReportRecipe) {
  const userId = historyUser;
  const filename = reportFilename(title, format);
  downloadBlob(blob, filename);
  try {
    // shortcut: file copies live in JSON records; use private object storage if reports exceed 15 MB.
    if (blob.size > 15 * 1024 * 1024) throw new Error('Report exceeds history file limit.');
    const fileDataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error('Unable to retain report file.'));
      reader.readAsDataURL(blob);
    });
    if (userId !== historyUser) return;
    await logExport({ title, format, filename, ...(recipe ? { recipe } : {}), fileDataUrl });
  } catch {
    window.dispatchEvent(new CustomEvent('supabase-persistence-error', { detail: 'The file was downloaded, but its copy could not be retained in History (maximum 15 MB). Generate it again to retry.' }));
  }
}

export function downloadExportAgain(entry: ExportHistoryEntry) {
  if (!entry.fileDataUrl) throw new Error('This legacy export has no saved file.');
  const [header, encoded] = entry.fileDataUrl.split(',');
  const bytes = Uint8Array.from(atob(encoded), char => char.charCodeAt(0));
  downloadBlob(new Blob([bytes], { type: header.slice(5).split(';')[0] }), entry.filename);
}

export async function clearExportHistory() {
  const userId = historyUser;
  const ids = history.map(entry => entry.id);
  await deleteApplicationRecords('export_history', ids, { ownRecords: true });
  if (userId !== historyUser) return;
  history = history.filter(entry => !ids.includes(entry.id));
  notify();
}

export async function hydrateExportHistoryFromSupabase(): Promise<void> {
  const { data } = await supabase.auth.getUser();
  const userId = data.user?.id ?? null;
  if (historyUser !== userId) { historyUser = userId; history = []; notify(); }
  const entries = await loadApplicationRecords<ExportHistoryEntry>('export_history', { ownRecords: true });
  if (userId !== historyUser) return;
  history = entries.sort((a, b) => b.exportedAt.localeCompare(a.exportedAt));
  notify();
}
