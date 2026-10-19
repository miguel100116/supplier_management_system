import * as XLSX from 'xlsx';
import { PartnerCompany, Rating, SurveyResponse, SurveyType } from '../../../types/survey';
import { normalizeCompanyName, nameSimilarity } from '../../partner-companies/services/masterListImport';
import { testImportCompanyId, testImportResponseId, testImportToken } from '../domain/testImport';

// Parses the raw Microsoft Forms exports for the three official MBS
// evaluation forms (20-002 Form 2/3/4) directly into SurveyResponse rows,
// using the exact same questionId scheme (Q-SUP-xx / Q-CON-xx / Q-SUB-xx-y)
// and matrix-remark convention that SurveyFillerPage produces for a live
// submission - see questionWeights.ts's ID_MAPPING for how these canonicalize
// into the Qxx ids the scoring engine actually keys off of.

type RatingColumn = {
  kind: 'rating';
  col: number;
  questionId: string;
  questionNumber: number;
  question: string;
  questionCategory: string;
  // Verbatim header text from the official Microsoft Forms export (this
  // exact column, whitespace-collapsed) - kept distinct from `question`
  // (the app's own paraphrased/display wording) so the Raw Data Export can
  // reproduce the original form's header row exactly. See rawResponseExport.ts.
  originalHeader: string;
};

type TextColumn = {
  kind: 'text';
  col: number;
  questionId: string;
  questionNumber: number;
  question: string;
  questionCategory: string;
  originalHeader: string;
};

type MetadataColumn = Omit<TextColumn, 'kind'> & {
  kind: 'metadata';
};

// Subcontractor-only: a shared remarks column that attaches its text as the
// `comment` on the matrix sub-question rows already built for this row,
// instead of producing its own response row (mirrors SurveyFillerPage, where
// a matrix question's comment textarea is shared across all its subQuestions).
type MatrixRemarkColumn = {
  kind: 'matrix-remark';
  col: number;
  appliesTo: string[];
  originalHeader: string;
};

export type ColumnDef = RatingColumn | TextColumn | MetadataColumn | MatrixRemarkColumn;

// Ordered slot kinds behind each of FormSpec's `metaHeaders` entries - lets
// the Raw Data Export fill every metadata column generically (see
// rawResponseExport.ts's metaCellValue) instead of hardcoding per-surveyType
// column positions in two places. 'start'/'name'/'lastModified' have no
// backing data in this app's SurveyResponse model (Microsoft Forms captures
// them; nothing here does yet), so those columns are always exported blank.
export type MetaFieldKind = 'id' | 'start' | 'completion' | 'email' | 'name' | 'lastModified' | 'designation' | 'department' | 'address' | 'company';

export interface FormSpec {
  surveyType: SurveyType;
  idCol: number;
  startTimeCol: number;
  completionTimeCol: number;
  emailCol: number;
  designationCol?: number;
  departmentCol?: number;
  nameCol: number;
  addressCol?: number;
  headerAnchor: { col: number; text: string };
  // Verbatim headers for the non-question columns (ID..company name/address),
  // in the same order as the official form - see MetaFieldKind above.
  metaHeaders: string[];
  metaFields: MetaFieldKind[];
  columns: ColumnDef[];
}

// Exported so the Raw Data Export (rawResponseExport.ts) can reproduce this
// exact official-form header/column layout instead of deriving headers from
// whatever's already in the response data.
export const FORM_SPECS: Record<SurveyType, FormSpec> = {
  Supplier: {
    surveyType: 'Supplier',
    idCol: 0,
    startTimeCol: 1,
    completionTimeCol: 2,
    emailCol: 3,
    designationCol: 6,
    departmentCol: 7,
    nameCol: 8,
    headerAnchor: { col: 8, text: 'Supplier Name' },
    metaHeaders: ['ID', 'Start time', 'Completion time', 'Email', 'Name', 'Last modified time', 'Designation:', 'Department:', 'Supplier Name:'],
    metaFields: ['id', 'start', 'completion', 'email', 'name', 'lastModified', 'designation', 'department', 'company'],
    columns: [
      { kind: 'metadata', col: 9, questionId: 'Q-SUP-03', questionNumber: 1, question: 'Period Covered', questionCategory: 'General', originalHeader: 'Period Covered:' },
      { kind: 'rating', col: 10, questionId: 'Q-SUP-05', questionNumber: 2, question: 'Does the supplier use the correct documents to facilitate the delivery of sale transaction? (BIR Registered, DR, SI/BS, OR/CR)', questionCategory: 'Documentation', originalHeader: 'Does the supplier use the correct documents to facilitate the delivery of sale transaction? (BIR Registered, DR, SI/BS, OR/CR)' },
      { kind: 'rating', col: 11, questionId: 'Q-SUP-06', questionNumber: 3, question: 'Are the required documents complete for every transaction?', questionCategory: 'Documentation', originalHeader: 'Are the required documents complete for every transaction?' },
      { kind: 'rating', col: 12, questionId: 'Q-SUP-07', questionNumber: 4, question: 'Are documents clean, neat and readable?', questionCategory: 'Documentation', originalHeader: 'Are documents clean, neat and readable ?' },
      { kind: 'rating', col: 13, questionId: 'Q-SUP-08', questionNumber: 5, question: 'Are documents presented/submitted upon delivery?', questionCategory: 'Documentation', originalHeader: 'Are documents presented/submitted upon delivery?' },
      { kind: 'rating', col: 14, questionId: 'Q-SUP-09', questionNumber: 6, question: 'Are documents presented/submitted upon payments?', questionCategory: 'Documentation', originalHeader: 'Are documents presented/submitted upon payments?' },
      { kind: 'text', col: 15, questionId: 'Q-SUP-10', questionNumber: 7, question: 'Documentation Remarks', questionCategory: 'Documentation', originalHeader: 'Documentation Remarks' },
      { kind: 'rating', col: 16, questionId: 'Q-SUP-11', questionNumber: 8, question: 'Does the supplier deliver the product on time based on the agreed schedule?', questionCategory: 'Delivery', originalHeader: 'Does the supplier deliver the product on time based on the agreed schedule?' },
      { kind: 'rating', col: 17, questionId: 'Q-SUP-12', questionNumber: 9, question: 'Does the supplier deliver the product in proper packaging and in good condition?', questionCategory: 'Delivery', originalHeader: 'Does the supplier deliver the product in proper packaging and in good condition?' },
      { kind: 'rating', col: 18, questionId: 'Q-SUP-13', questionNumber: 10, question: 'Does the supplier deliver the products sealed and safe and free for possible contamination?', questionCategory: 'Delivery', originalHeader: 'Does the supplier deliver the products sealed and safe and free for possible contamination?' },
      { kind: 'text', col: 19, questionId: 'Q-SUP-14', questionNumber: 11, question: 'Delivery Remarks', questionCategory: 'Delivery', originalHeader: 'Delivery Remarks' },
      { kind: 'rating', col: 20, questionId: 'Q-SUP-15', questionNumber: 12, question: 'Does the supplier change the price without any notice to MBS Procurement/BSM?', questionCategory: 'Price', originalHeader: 'Does the supplier change the price without any notice to MBS Procurement/BSM?' },
      { kind: 'rating', col: 21, questionId: 'Q-SUP-16', questionNumber: 13, question: 'Is the supplier open for negotiation in terms of price?', questionCategory: 'Price', originalHeader: 'Is the supplier open for negotiation in terms of price?' },
      { kind: 'rating', col: 22, questionId: 'Q-SUP-17', questionNumber: 14, question: 'Is the supplier pricing competitive with other suppliers?', questionCategory: 'Price', originalHeader: 'Is the supplier pricing competitive with other suppliers?' },
      { kind: 'text', col: 23, questionId: 'Q-SUP-18', questionNumber: 15, question: 'Price/Cost Effectiveness Remarks', questionCategory: 'Price', originalHeader: 'Price/Cost Effectiveness Remarks' },
      { kind: 'rating', col: 24, questionId: 'Q-SUP-19', questionNumber: 16, question: 'Does the supplier deliver the product with good quality?', questionCategory: 'Quality', originalHeader: 'Does the supplier deliver the product with good quality?' },
      { kind: 'rating', col: 25, questionId: 'Q-SUP-20', questionNumber: 17, question: 'Does the supplier take immediate action for defective product upon delivery/RMA?', questionCategory: 'Quality', originalHeader: 'Does the supplier take immediate action for defective product upon delivery/RMA?' },
      { kind: 'rating', col: 26, questionId: 'Q-SUP-21', questionNumber: 18, question: 'Does the supplier replace the defective product immediately?', questionCategory: 'Quality', originalHeader: 'Does the supplier replace the defective product immediately?' },
      { kind: 'text', col: 27, questionId: 'Q-SUP-22', questionNumber: 19, question: 'Quality Remarks', questionCategory: 'Quality', originalHeader: 'Quality Remarks' },
      { kind: 'rating', col: 28, questionId: 'Q-SUP-23', questionNumber: 20, question: 'Do supplier responsive and easy to contact?', questionCategory: 'Communication', originalHeader: 'Do supplier responsive and easy to contact?' },
      { kind: 'rating', col: 29, questionId: 'Q-SUP-24', questionNumber: 21, question: 'Does the supplier proactively communicate to MBS Representatives in terms of any discrepancy or changes in transaction?', questionCategory: 'Communication', originalHeader: 'Does the supplier proactively communicate to MBS Representatives in terms of any discrepancy or changes in transaction?' },
      { kind: 'rating', col: 30, questionId: 'Q-SUP-25', questionNumber: 22, question: 'Does the supplier proactively communicate to MBS Representatives fact-based concern on product/technology?', questionCategory: 'Communication', originalHeader: 'Does the supplier proactively communicate to MBS Representatives fact-based concern on product/ technology?' },
      { kind: 'text', col: 31, questionId: 'Q-SUP-26', questionNumber: 23, question: 'Communication Remarks', questionCategory: 'Communication', originalHeader: 'Communication Remarks' },
    ],
  },
  Courier: {
    surveyType: 'Courier',
    idCol: 0,
    startTimeCol: 1,
    completionTimeCol: 2,
    emailCol: 3,
    nameCol: 6,
    addressCol: 7,
    headerAnchor: { col: 6, text: 'Courier Name' },
    metaHeaders: ['ID', 'Start time', 'Completion time', 'Email', 'Name', 'Last modified time', 'Courier Name:', 'Courier Address:'],
    metaFields: ['id', 'start', 'completion', 'email', 'name', 'lastModified', 'company', 'address'],
    columns: [
      { kind: 'metadata', col: 8, questionId: 'Q-CON-03', questionNumber: 1, question: 'Period Covered', questionCategory: 'General', originalHeader: 'Period Covered:' },
      { kind: 'rating', col: 9, questionId: 'Q-CON-04', questionNumber: 2, question: 'Does the courier consistently deliver our goods to our customers on the agreed date or period?', questionCategory: 'Delivery', originalHeader: 'Does the courier consistently deliver our goods to our customers on the agreed date or period?' },
      { kind: 'rating', col: 10, questionId: 'Q-CON-05', questionNumber: 5, question: 'Does the courier service maintain a consistent level of acceptable service over time?', questionCategory: 'Delivery', originalHeader: 'Does the courier service maintain a consistent level of acceptable (define) service over time?' },
      { kind: 'text', col: 11, questionId: 'Q-CON-06', questionNumber: 6, question: 'Please provide any additional comments on Reliability and Delivery performance.', questionCategory: 'Delivery', originalHeader: 'Reliablity/Delivery Remarks' },
      { kind: 'rating', col: 12, questionId: 'Q-CON-07', questionNumber: 7, question: "Are the courier's rates competitive and transparent?", questionCategory: 'Commercial', originalHeader: "Are the courier's rates competitive and transparent?" },
      { kind: 'rating', col: 13, questionId: 'Q-CON-08', questionNumber: 8, question: 'Are there any hidden fees or surcharges?', questionCategory: 'Commercial', originalHeader: 'Are there any hidden fees or surcharges?' },
      { kind: 'rating', col: 14, questionId: 'Q-CON-09', questionNumber: 9, question: 'Are they offering flexible payment options, e.g., credit cards or invoicing, and payment credit line?', questionCategory: 'Commercial', originalHeader: 'Are they offering flexible payment options, e.g., credit cards or invoicing, and payment credit line?' },
      { kind: 'text', col: 15, questionId: 'Q-CON-10', questionNumber: 10, question: 'Please provide any additional comments on Cost and pricing.', questionCategory: 'Commercial', originalHeader: 'Cost Remarks:' },
      { kind: 'rating', col: 16, questionId: 'Q-CON-11', questionNumber: 11, question: 'Do they have advanced tracking systems allowing customers for real-time monitoring of the status and location of their packages?', questionCategory: 'Technology', originalHeader: 'Do they have advanced tracking systems allowing customers for real-time monitoring of the status and location of their packages?' },
      { kind: 'rating', col: 17, questionId: 'Q-CON-12', questionNumber: 12, question: 'Do they have online platforms and mobile apps provided to customers to schedule pickups, make payments, and arrange deliveries?', questionCategory: 'Technology', originalHeader: 'Do they have online platforms and mobile apps provided to customers to schedule pickups, make payments, and arrange deliveries?' },
      { kind: 'text', col: 18, questionId: 'Q-CON-13', questionNumber: 13, question: 'Please provide any additional comments on Technology and online tools.', questionCategory: 'Technology', originalHeader: 'Technology Remarks' },
      { kind: 'rating', col: 19, questionId: 'Q-CON-14', questionNumber: 14, question: 'Do they have a helpful and responsive customer support team?', questionCategory: 'Support', originalHeader: 'Do they have a helpful and responsive customer support team?' },
      { kind: 'rating', col: 20, questionId: 'Q-CON-15', questionNumber: 15, question: "Do they effectively handle the customer's issues, and complaints, e.g., lost shipment, item, defective items?", questionCategory: 'Support', originalHeader: "Do they effectively handle the customer's issues, and complaints, e.g., lost shipment, item, defective items?" },
      { kind: 'rating', col: 21, questionId: 'Q-CON-16', questionNumber: 16, question: 'Does the courier have a prompt payment process in case of mishandled goods, e.g., broken or missing goods?', questionCategory: 'Support', originalHeader: 'Does the courier have a prompt payment process in case of mishandled goods, e.g., broken or missing goods?' },
      { kind: 'text', col: 22, questionId: 'Q-CON-17', questionNumber: 17, question: 'Please provide any additional comments on Customer Service and support.', questionCategory: 'Support', originalHeader: 'Customer Service Remarks:' },
      { kind: 'rating', col: 23, questionId: 'Q-CON-18', questionNumber: 18, question: "Do they ensure the safety and security of our packages/parcels during transit and delivery to the client's site?", questionCategory: 'Security', originalHeader: "Do they ensure the safety and security of our packages/parcels during transit and delivery to the client's site?" },
      { kind: 'rating', col: 24, questionId: 'Q-CON-19', questionNumber: 19, question: 'Do they include insurance options to cover potential loss or damage to our items?', questionCategory: 'Security', originalHeader: 'Do they include insurance options to cover potential loss or damage to our items?' },
      { kind: 'text', col: 25, questionId: 'Q-CON-20', questionNumber: 20, question: 'Please provide any additional comments on Security and safety.', questionCategory: 'Security', originalHeader: 'Security Remarks:' },
    ],
  },
  Subcontractor: {
    surveyType: 'Subcontractor',
    idCol: 0,
    startTimeCol: 1,
    completionTimeCol: 2,
    emailCol: 3,
    designationCol: 6,
    departmentCol: 7,
    nameCol: 8,
    headerAnchor: { col: 8, text: 'Subcontractor Name' },
    metaHeaders: ['ID', 'Start time', 'Completion time', 'Email', 'Name', 'Last modified time', 'Designation:', 'Department:', 'Subcontractor Name:'],
    metaFields: ['id', 'start', 'completion', 'email', 'name', 'lastModified', 'designation', 'department', 'company'],
    columns: [
      { kind: 'metadata', col: 9, questionId: 'Q-SUB-01', questionNumber: 1, question: 'Project Name', questionCategory: 'General', originalHeader: 'Project Name:' },
      { kind: 'metadata', col: 10, questionId: 'Q-SUB-02', questionNumber: 2, question: 'Products or Services', questionCategory: 'General', originalHeader: 'Products or Services:' },
      { kind: 'metadata', col: 11, questionId: 'Q-SUB-03', questionNumber: 3, question: 'Project Duration', questionCategory: 'General', originalHeader: 'Project Duration (From To)' },

      { kind: 'rating', col: 12, questionId: 'Q-SUB-04-a', questionNumber: 4, question: "Delivery / Project Timeliness - Except for circumstances beyond the subcontractor's control, tasks and deliverables were completed on time or ahead of the schedule in the contact.", questionCategory: 'Delivery', originalHeader: "a. Except for circumstances beyond the contractor's control, tasks and deliverables were completed on time or ahead of the schedule in the contact. ..." },
      { kind: 'rating', col: 13, questionId: 'Q-SUB-04-b', questionNumber: 4.1, question: 'Delivery / Project Timeliness - Delivers and use all resources required to the project and turnover all excess materials to MBS Project Manager.', questionCategory: 'Delivery', originalHeader: 'b. Delivers and use all resources required to the project and turnover all excess materials to MBS Project Manager Consist...' },
      { kind: 'matrix-remark', col: 14, appliesTo: ['Q-SUB-04-a', 'Q-SUB-04-b'], originalHeader: 'Delivery / Project Timeliness Remarks:' },

      { kind: 'rating', col: 15, questionId: 'Q-SUB-06-a', questionNumber: 6, question: "Documentation / Invoicing - The subcontractor's invoices/billing were correct, accurate and contained all information of references.", questionCategory: 'Documentation', originalHeader: "a. The subcontractor's invoices/billing were correct, accurate and contained all information of references. Always = 2, limited correction and tolerabl..." },
      { kind: 'rating', col: 16, questionId: 'Q-SUB-06-b', questionNumber: 6.1, question: 'Documentation / Invoicing - All required documents are submitted on time or within the time frames of agreement e.g. Service report, billing, COC, etc.', questionCategory: 'Documentation', originalHeader: 'b. All required documents are submitted on time or within the time frames of agreement e.g. Service report, billing, COC, etc. ...' },
      { kind: 'rating', col: 17, questionId: 'Q-SUB-06-c', questionNumber: 6.2, question: 'Documentation / Invoicing - The proposal provides a clear breakdown matched with what MBS requires.', questionCategory: 'Documentation', originalHeader: 'c. The proposal provides a clear breakdown matched with what MBS requires. Consistently = 2, the scope is inaccurate but does not lead to price increase...' },
      { kind: 'matrix-remark', col: 18, appliesTo: ['Q-SUB-06-a', 'Q-SUB-06-b', 'Q-SUB-06-c'], originalHeader: 'Documentation / Invoicing Remarks:' },

      { kind: 'rating', col: 19, questionId: 'Q-SUB-08-a', questionNumber: 8, question: 'Cost Control / Pricing - Give competitive prices, discount, and reasonable prices.', questionCategory: 'Cost', originalHeader: 'a. Give competitive prices, discount, and reasonable prices ...' },
      { kind: 'rating', col: 20, questionId: 'Q-SUB-08-b', questionNumber: 8.1, question: 'Cost Control / Pricing - Request for change of orders for additional works/cost ONLY outside the scope of contract.', questionCategory: 'Cost', originalHeader: 'b. Request for change of orders for additional works/cost ONLY outside the scope of contract. Yes = 2, seldom request for cha...' },
      { kind: 'rating', col: 21, questionId: 'Q-SUB-08-c', questionNumber: 8.2, question: 'Cost Control / Pricing - Indication that the subcontractor has financial problem which cannot meet the terms and conditions stated in contract.', questionCategory: 'Cost', originalHeader: 'c. Indication that the subcontractor has financial problem which cannot meet the terms and conditions stated in contract. ...' },
      { kind: 'matrix-remark', col: 22, appliesTo: ['Q-SUB-08-a', 'Q-SUB-08-b', 'Q-SUB-08-c'], originalHeader: 'Cost Control / Pricing Remarks:' },

      { kind: 'rating', col: 23, questionId: 'Q-SUB-10-a', questionNumber: 10, question: 'Quality and Technical Competence - The Subcontractor work products complied with the contract, PO scope of work, rules and applicable program guidance.', questionCategory: 'Quality', originalHeader: 'a. The Subcontractor work products complied with the contract, PO scope of work, rules and applicable program guidance. Consistent...' },
      { kind: 'rating', col: 24, questionId: 'Q-SUB-10-b', questionNumber: 10.1, question: 'Quality and Technical Competence - The subcontractor performed site assessment tasks efficiently and effectively, proposed cost-effective changes in scope, provided an accurate summary and proposed cost-effective recommendations for future work and course of action.', questionCategory: 'Quality', originalHeader: 'b. The subcontractor performed site assessment tasks efficiently and effectively, proposed cost-effective changes in scope, provided an accurate summary and proposed cost-effective recommendations...' },
      { kind: 'rating', col: 25, questionId: 'Q-SUB-10-c', questionNumber: 10.2, question: 'Quality and Technical Competence - The subcontractor proposed appropriate changes to monitoring points, parameters, and or frequency based on changing site conditions.', questionCategory: 'Quality', originalHeader: 'c. The subcontractor proposed appropriate changes to monitoring points, parameters, and or frequency based on changing site conditions. ...' },
      { kind: 'rating', col: 26, questionId: 'Q-SUB-10-d', questionNumber: 10.3, question: 'Quality and Technical Competence - The remedial action plan adequately and cost-effectively addressed the site conditions.', questionCategory: 'Quality', originalHeader: 'd. The remedial action plan adequately and cost-effectively addressed the site conditions. ...' },
      { kind: 'rating', col: 27, questionId: 'Q-SUB-10-e', questionNumber: 10.4, question: 'Quality and Technical Competence - The subcontractor initiates Certificate of Completion when the project has been done.', questionCategory: 'Quality', originalHeader: 'e. The subcontractor initiates Certificate of Completion when the project has been done. Yes = 2, Only when...' },
      { kind: 'matrix-remark', col: 28, appliesTo: ['Q-SUB-10-a', 'Q-SUB-10-b', 'Q-SUB-10-c', 'Q-SUB-10-d', 'Q-SUB-10-e'], originalHeader: 'Quality and Technical Competence Remarks:' },

      { kind: 'rating', col: 29, questionId: 'Q-SUB-12-a', questionNumber: 12, question: 'Communication - The subcontractor communicated and proposed solutions of project changes, problems, delays and issues to MBS representative as they occurred and ahead of deadlines.', questionCategory: 'Communication', originalHeader: 'a. The subcontractor communicated and proposed solutions of project changes, problems, delays and issues to MBS representative as they occurred and ahead of deadlines. ...' },
      { kind: 'rating', col: 30, questionId: 'Q-SUB-12-b', questionNumber: 12.1, question: 'Communication - The subcontractor responded within a reasonable time frame to telephone messages and emails from MBS representative.', questionCategory: 'Communication', originalHeader: 'b. The subcontractor responded within a reasonable time frame to telephone messages and emails from MBS representative. G...' },
      { kind: 'rating', col: 31, questionId: 'Q-SUB-12-c', questionNumber: 12.2, question: 'Communication - The subcontractor is professional in their approach, provide assistance whenever needed, courteous and polite.', questionCategory: 'Communication', originalHeader: 'c. The subcontractor is professional in their approach, provide assistance whenever needed, courteous and polite. ...' },
      { kind: 'matrix-remark', col: 32, appliesTo: ['Q-SUB-12-a', 'Q-SUB-12-b', 'Q-SUB-12-c'], originalHeader: 'Communication Remarks:' },
    ],
  },
};

function textCell(raw: unknown): string {
  if (raw === null || raw === undefined) return '';
  return String(raw).trim();
}

async function sourceFileHash(buffer: ArrayBuffer, fileName: string): Promise<string> {
  const hashInput = fileName.toLowerCase().endsWith('.csv')
    ? new TextEncoder().encode(new TextDecoder().decode(buffer).replace(/\r\n/g, '\n'))
    : new Uint8Array(buffer);
  const digest = await crypto.subtle.digest('SHA-256', hashInput);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function parseRatingCell(raw: unknown): Rating {
  const str = textCell(raw);
  if (!str) return 'N/A';
  if (/^n\/?a\b/i.test(str)) return 'N/A';
  const num = Number(str);
  return Number.isFinite(num) ? num : 'N/A';
}

function toIso(raw: unknown): string | null {
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) return raw.toISOString();
  const str = textCell(raw);
  if (!str) return null;
  const parsed = new Date(str);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

type ResponseBase = Pick<
  SurveyResponse,
  'responseId' | 'companyId' | 'dataSource' | 'importBatchId' | 'surveyType' | 'respondentType' | 'startTime' | 'submissionDate' | 'company' | 'department' | 'address' | 'respondentEmail'
>;

function buildRowResponses(cells: unknown[], spec: FormSpec, base: ResponseBase): SurveyResponse[] {
  const byId = new Map<string, SurveyResponse>();
  const order: string[] = [];

  for (const col of spec.columns) {
    if (col.kind === 'matrix-remark') {
      const remark = textCell(cells[col.col]);
      if (!remark) continue;
      col.appliesTo.forEach((qid) => {
        const target = byId.get(qid);
        if (target) target.comment = remark;
      });
      continue;
    }

    const response: SurveyResponse = {
      ...base,
      questionId: col.questionId,
      questionNumber: col.questionNumber,
      question: col.question,
      questionCategory: col.questionCategory,
      rating: col.kind === 'rating' ? parseRatingCell(cells[col.col]) : 'N/A',
      comment: col.kind === 'rating' ? '' : textCell(cells[col.col]),
    };
    byId.set(col.questionId, response);
    order.push(col.questionId);
  }

  return order.map((id) => byId.get(id)!);
}

// A company match is resolved against the FULL registry (every type, active
// or archived) rather than only companies already classified as this
// surveyType. A perfect name match sitting in the registry as "Uncategorized"
// and archived (typically because the Master List's own Category column was
// left blank for that row) is still the same real company - it just needs
// its classification fixed in Partner Companies, not a brand new record. So
// "matched" means "found under any classification"; "needs-reclassification"
// flags the classification mismatch for the admin instead of silently
// creating a duplicate company or discarding the response.
export type CompanyMatchStatus =
  | { kind: 'matched'; companyId: string; canonicalName: string }
  | { kind: 'needs-reclassification'; companyId: string; canonicalName: string; currentType: PartnerCompany['type']; isArchived: boolean }
  | { kind: 'unmatched' };

function resolveCompanyMatch(rawName: string, surveyType: SurveyType, allCompanies: PartnerCompany[], threshold = 0.82): CompanyMatchStatus {
  const trimmed = rawName.trim();
  if (!trimmed) return { kind: 'unmatched' };

  const exact = allCompanies.find((c) => c.name.trim().toLowerCase() === trimmed.toLowerCase());
  let best: { company: PartnerCompany; score: number } | undefined = exact ? { company: exact, score: 1 } : undefined;

  if (!best) {
    const normTarget = normalizeCompanyName(trimmed);
    for (const candidate of allCompanies) {
      const score = nameSimilarity(normTarget, normalizeCompanyName(candidate.name));
      if (!best || score > best.score) best = { company: candidate, score };
    }
    if (!best || best.score < threshold) return { kind: 'unmatched' };
  }

  const company = best.company;
  if (company.type === surveyType && !company.isArchived) {
    return { kind: 'matched', companyId: company.id, canonicalName: company.name };
  }
  return { kind: 'needs-reclassification', companyId: company.id, canonicalName: company.name, currentType: company.type, isArchived: !!company.isArchived };
}

export interface RawEvalAccountProfile {
  email: string;
  designation: string;
  department: string;
}

export interface ReclassificationNotice {
  canonicalName: string;
  currentType: PartnerCompany['type'];
  isArchived: boolean;
}

export interface CompanyMatchInfo {
  rawName: string;
  normalizedName: string;
  status: CompanyMatchStatus['kind'];
  companyId?: string;
  canonicalName?: string;
  currentType?: PartnerCompany['type'];
  isArchived?: boolean;
}

interface ParsedRow {
  cells: unknown[];
  rawCompany: string;
  normalizedCompany: string;
  responseId: string;
  startTime?: string;
  submissionDate: string;
  respondentType: string;
  department: string;
  address?: string;
  respondentEmail?: string;
}

export interface RawEvalPreview {
  surveyType: SurveyType;
  sheetName: string;
  fileName: string;
  importBatchId: string;
  totalRows: number;
  skippedBlank: number;
  missingRespondentInfo: number;
  dateRange?: { earliest: string; latest: string };
  /** One entry per distinct company name found in the file. */
  companyMatches: CompanyMatchInfo[];
  /** Parsed row data, opaque to callers - pass back unchanged to commitRawEvaluationImport. */
  rows: ParsedRow[];
}

export type CompanyDecision = 'skip' | 'add-as-partner';

export interface RawEvalImportSummary {
  surveyType: SurveyType;
  fileName: string;
  totalRows: number;
  imported: number;
  skippedBlank: number;
  skippedByDecision: number;
  replaced: number;
  dateRange?: { earliest: string; latest: string };
  missingRespondentInfo: number;
  needsReclassification: ReclassificationNotice[];
  addedCompanies: string[];
  skippedCompanies: string[];
  /** The matching standard survey form was reopened after this import. */
  accessReactivated?: boolean;
  /** Responses were imported, but the matching form's access update failed. */
  accessReactivationError?: string;
}

export interface RawEvalCommitResult {
  responses: SurveyResponse[];
  newPartnerCompanies: PartnerCompany[];
  summary: RawEvalImportSummary;
}

export class EvaluationFormMismatchError extends Error {}

export async function previewRawEvaluationImport(
  file: File,
  surveyType: SurveyType,
  partnerCompanies: PartnerCompany[],
  accounts: RawEvalAccountProfile[] = []
): Promise<RawEvalPreview> {
  const spec = FORM_SPECS[surveyType];
  const buffer = await file.arrayBuffer();
  const fileHash = await sourceFileHash(buffer, file.name);
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
  if (workbook.SheetNames.length === 0) throw new Error('The uploaded file has no sheets.');

  const headerSearchRows = 25;
  const matchingSheets: Array<{ sheetName: string; rows: unknown[][]; headerRowIndex: number }> = [];
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;
    const candidateRows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    const candidateHeaderIndex = candidateRows
      .slice(0, headerSearchRows)
      .findIndex((row) => {
        const anchorText = textCell(row[spec.headerAnchor.col]).replace(/\s+/g, ' ');
        return anchorText.toLowerCase().includes(spec.headerAnchor.text.toLowerCase());
      });
    if (candidateHeaderIndex >= 0) matchingSheets.push({ sheetName, rows: candidateRows, headerRowIndex: candidateHeaderIndex });
  }

  if (matchingSheets.length === 0) {
    const colLetter = XLSX.utils.encode_col(spec.headerAnchor.col);
    throw new EvaluationFormMismatchError(
      `This doesn't look like the ${surveyType} Evaluation Form export - expected column ${colLetter} to contain "${spec.headerAnchor.text}" in a header row within the first ${headerSearchRows} rows of a worksheet.`
    );
  }

  if (matchingSheets.length > 1) {
    throw new Error(`The workbook has more than one worksheet that looks like a ${surveyType} evaluation. Keep only one ${surveyType} evaluation worksheet.`);
  }

  const [{ sheetName, rows: rawRows, headerRowIndex }] = matchingSheets;

  const header = rawRows[headerRowIndex];
  if (!header) throw new Error('The uploaded file has no header row.');

  const emailProfile = new Map(accounts.map((a) => [a.email.trim().toLowerCase(), a]));
  const matchByNormalized = new Map<string, CompanyMatchInfo>();
  const rows: ParsedRow[] = [];

  let skippedBlank = 0;
  let missingRespondentInfo = 0;
  let earliest: string | undefined;
  let latest: string | undefined;

  rawRows.slice(headerRowIndex + 1).forEach((cells, i) => {
    const sourceRow = headerRowIndex + i + 2;
    const rawCompany = textCell(cells[spec.nameCol]);
    if (!rawCompany) {
      skippedBlank += 1;
      return;
    }

    const excelId = textCell(cells[spec.idCol]);
    if (!excelId) {
      throw new Error(`${surveyType} worksheet "${sheetName}" has a response without an ID in column A (row ${sourceRow}). Each response needs its source ID for safe re-imports.`);
    }
    const responseId = `IMPORT-${surveyType.toUpperCase()}-${excelId}`;

    const startTime = toIso(cells[spec.startTimeCol]) ?? undefined;
    const submissionDate = toIso(cells[spec.completionTimeCol]) ?? startTime ?? new Date().toISOString();
    if (!earliest || submissionDate < earliest) earliest = submissionDate;
    if (!latest || submissionDate > latest) latest = submissionDate;

    const normalizedCompany = normalizeCompanyName(rawCompany);
    if (!matchByNormalized.has(normalizedCompany)) {
      const match = resolveCompanyMatch(rawCompany, surveyType, partnerCompanies);
      matchByNormalized.set(normalizedCompany, {
        rawName: rawCompany,
        normalizedName: normalizedCompany,
        status: match.kind,
        companyId: match.kind !== 'unmatched' ? match.companyId : undefined,
        canonicalName: match.kind !== 'unmatched' ? match.canonicalName : undefined,
        currentType: match.kind === 'needs-reclassification' ? match.currentType : undefined,
        isArchived: match.kind === 'needs-reclassification' ? match.isArchived : undefined,
      });
    }

    const email = textCell(cells[spec.emailCol]);
    const profile = emailProfile.get(email.trim().toLowerCase());

    let respondentType = spec.designationCol !== undefined ? textCell(cells[spec.designationCol]) : '';
    let department = spec.departmentCol !== undefined ? textCell(cells[spec.departmentCol]) : '';
    if (!respondentType && profile) respondentType = profile.designation;
    if (!department && profile) department = profile.department;
    if (!respondentType) {
      respondentType = 'Unspecified';
      missingRespondentInfo += 1;
    }
    if (!department) department = 'Unspecified';

    const address = spec.addressCol !== undefined ? textCell(cells[spec.addressCol]) || undefined : undefined;

    rows.push({
      cells,
      rawCompany,
      normalizedCompany,
      responseId,
      startTime,
      submissionDate,
      respondentType,
      department,
      address,
      respondentEmail: email || undefined,
    });
  });

  return {
    surveyType,
    sheetName,
    fileName: file.name,
    importBatchId: `client-csv:${surveyType.toLowerCase()}:${fileHash}`,
    totalRows: rawRows.length - headerRowIndex - 1,
    skippedBlank,
    missingRespondentInfo,
    dateRange: earliest && latest ? { earliest, latest } : undefined,
    companyMatches: [...matchByNormalized.values()],
    rows,
  };
}

/**
 * Applies the admin's per-company skip/add-as-partner decisions (only needed
 * for companies preview flagged "unmatched") and produces the final response
 * rows. Safe to call with an empty decisions map when nothing was unmatched.
 */
export function commitRawEvaluationImport(preview: RawEvalPreview, decisions: Record<string, CompanyDecision> = {}): RawEvalCommitResult {
  const spec = FORM_SPECS[preview.surveyType];
  const isTestImport = testImportToken(preview.importBatchId) !== null;
  const matchByNormalized = new Map(preview.companyMatches.map((m) => [m.normalizedName, m]));

  const needsReclassification: ReclassificationNotice[] = preview.companyMatches
    .filter((m) => m.status === 'needs-reclassification')
    .map((m) => ({ canonicalName: m.canonicalName!, currentType: m.currentType!, isArchived: !!m.isArchived }));

  const newCompanyByNormalized = new Map<string, PartnerCompany>();
  const skippedNames: string[] = [];
  let skippedByDecision = 0;

  const responses: SurveyResponse[] = [];

  for (const [rowIndex, row] of preview.rows.entries()) {
    const match = matchByNormalized.get(row.normalizedCompany);
    let company: string;
    let companyId: string;

    if (!match || match.status === 'unmatched') {
      const decision = decisions[row.normalizedCompany] ?? 'skip';
      if (decision === 'skip') {
        skippedByDecision += 1;
        if (!skippedNames.includes(row.rawCompany)) skippedNames.push(row.rawCompany);
        continue;
      }
      company = row.rawCompany;
      if (!newCompanyByNormalized.has(row.normalizedCompany)) {
        const now = new Date().toISOString();
        const id = isTestImport
          ? testImportCompanyId(preview.importBatchId, preview.surveyType, newCompanyByNormalized.size)
          : `pc-import-raw-${row.normalizedCompany.toLowerCase().replace(/\s+/g, '-').slice(0, 60)}-${Date.now()}-${newCompanyByNormalized.size}`;
        newCompanyByNormalized.set(row.normalizedCompany, {
          id,
          ...(isTestImport ? { testImportBatchId: preview.importBatchId } : {}),
          name: row.rawCompany,
          type: preview.surveyType,
          createdAt: now,
          // Test-only additions should not appear as active partners or survey choices.
          isArchived: isTestImport,
          accreditationStatus: 'Unaccredited',
          branches: [{ id: `${id}-branch-1`, bpCode: '' }],
        });
      }
      companyId = newCompanyByNormalized.get(row.normalizedCompany)!.id;
    } else {
      company = match.canonicalName!;
      companyId = match.companyId!;
    }

    const base: ResponseBase = {
      responseId: isTestImport
        ? testImportResponseId(preview.importBatchId, preview.surveyType, rowIndex)
        : row.responseId,
      companyId,
      dataSource: 'client_csv',
      importBatchId: preview.importBatchId,
      surveyType: preview.surveyType,
      respondentType: row.respondentType,
      startTime: row.startTime,
      submissionDate: row.submissionDate,
      company,
      department: row.department,
      address: row.address,
      respondentEmail: row.respondentEmail,
    };

    responses.push(...buildRowResponses(row.cells, spec, base));
  }

  const importedSubmissions = new Set(responses.map((r) => r.responseId)).size;

  return {
    responses,
    newPartnerCompanies: [...newCompanyByNormalized.values()],
    summary: {
      surveyType: preview.surveyType,
      fileName: preview.fileName,
      totalRows: preview.totalRows,
      imported: importedSubmissions,
      skippedBlank: preview.skippedBlank,
      skippedByDecision,
      replaced: 0,
      dateRange: preview.dateRange,
      missingRespondentInfo: preview.missingRespondentInfo,
      needsReclassification,
      addedCompanies: [...newCompanyByNormalized.values()].map((c) => c.name),
      skippedCompanies: skippedNames,
    },
  };
}
