import type { ComplianceDocument, PartnerCompany } from '../../../types/survey';
import { isSupabaseConfigured, supabase } from '../../../services/supabaseClient';
import { parseApplicationRecordPayload } from '../../../services/applicationRecordSchemas';

export const PARTNER_DOCUMENT_BUCKET = 'partner-compliance-documents';
export const MAX_PARTNER_DOCUMENT_FILE_BYTES = 10 * 1024 * 1024;

const MIME_TYPES_BY_EXTENSION: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
};

export function getPartnerDocumentFileContentType(fileName: string): string | null {
  const extension = fileName.split('.').pop()?.toLowerCase();
  return extension ? MIME_TYPES_BY_EXTENSION[extension] ?? null : null;
}

export function validatePartnerDocumentFile(file: Pick<File, 'name' | 'size' | 'type'>): string | null {
  if (!file.name.trim() || file.name.length > 255) return 'The file name must be 1 to 255 characters.';
  if (file.size < 1 || file.size > MAX_PARTNER_DOCUMENT_FILE_BYTES) return 'Choose a file between 1 byte and 10 MB.';
  const expectedType = getPartnerDocumentFileContentType(file.name);
  if (!expectedType) return 'Choose a PDF, Word, Excel, JPG, or PNG file.';
  if (file.type && file.type !== expectedType) return 'The file type does not match its extension.';
  return null;
}

export async function attachForeignSupplierDocumentFile(
  companyId: string,
  branchId: string,
  documentName: string,
  expectedDocument: ComplianceDocument,
  file: File,
): Promise<PartnerCompany> {
  if (!isSupabaseConfigured) throw new Error('Supabase is not configured. The document was not uploaded.');
  const validationError = validatePartnerDocumentFile(file);
  if (validationError) throw new Error(validationError);

  const storagePath = crypto.randomUUID();
  const contentType = getPartnerDocumentFileContentType(file.name)!;
  const { error: uploadError } = await supabase.storage.from(PARTNER_DOCUMENT_BUCKET)
    .upload(storagePath, file, { contentType, cacheControl: '3600', upsert: false });
  if (uploadError) throw new Error(`Unable to upload the document: ${uploadError.message}`);

  const { data, error } = await supabase.rpc('attach_foreign_supplier_document_file', {
    p_company_id: companyId,
    p_branch_id: branchId,
    p_document_name: documentName,
    p_expected_document: expectedDocument,
    p_document_file: { storagePath, originalName: file.name.trim(), contentType, fileSize: file.size },
  });
  if (error) {
    const { error: cleanupError } = await supabase.storage.from(PARTNER_DOCUMENT_BUCKET).remove([storagePath]);
    const cleanupNote = cleanupError ? ` Uploaded file cleanup also failed: ${cleanupError.message}` : '';
    throw new Error(`Unable to attach the document: ${error.message}.${cleanupNote}`);
  }
  return parseApplicationRecordPayload('partner_company', data, companyId) as PartnerCompany;
}

export async function removeSupplierSupportingDocument(
  companyId: string,
  branchId: string,
  documentName: string,
  expectedDocument: ComplianceDocument,
): Promise<PartnerCompany> {
  if (!isSupabaseConfigured) throw new Error('Supabase is not configured. The supporting document was not removed.');
  if (!documentName.startsWith('Other: ') || !documentName.slice(7).trim() || documentName.length > 127) {
    throw new Error('Only added supporting documents can be removed.');
  }

  const file = expectedDocument.file;
  let fileBackup: Blob | null = null;
  if (file) {
    const { data, error: downloadError } = await supabase.storage.from(PARTNER_DOCUMENT_BUCKET).download(file.storagePath);
    if (downloadError) throw new Error(`Unable to preserve the attached file before removal: ${downloadError.message}`);
    fileBackup = data;
    const { error: removeError } = await supabase.storage.from(PARTNER_DOCUMENT_BUCKET).remove([file.storagePath]);
    if (removeError) throw new Error(`Unable to remove the attached file: ${removeError.message}`);
  }

  const { data, error } = await supabase.rpc('remove_supplier_supporting_document', {
    p_company_id: companyId,
    p_branch_id: branchId,
    p_document_name: documentName,
    p_expected_document: expectedDocument,
  });
  if (error) {
    if (file && fileBackup) {
      const { error: restoreError } = await supabase.storage.from(PARTNER_DOCUMENT_BUCKET).upload(file.storagePath, fileBackup, {
        contentType: file.contentType,
        cacheControl: '3600',
        upsert: true,
      });
      if (restoreError) {
        throw new Error(`The supporting document could not be removed, and its attached file could not be restored: ${restoreError.message}`);
      }
    }
    throw new Error(`Unable to remove the supporting document: ${error.message}`);
  }
  return parseApplicationRecordPayload('partner_company', data, companyId) as PartnerCompany;
}

export async function downloadForeignSupplierDocumentFile(storagePath: string): Promise<Blob> {
  if (!isSupabaseConfigured) throw new Error('Supabase is not configured.');
  const { data, error } = await supabase.storage.from(PARTNER_DOCUMENT_BUCKET).download(storagePath);
  if (error) throw new Error(`Unable to download the document: ${error.message}`);
  return data;
}
