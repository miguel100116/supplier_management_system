const subQuestions = [
  {
    questionId: 'Q-SUB-01',
    questionNumber: 1,
    question: 'Project Name',
    questionCategory: 'General',
    section: 'SECTION 1',
    inputType: 'text'
  },
  {
    questionId: 'Q-SUB-02',
    questionNumber: 2,
    question: 'Products or Services',
    questionCategory: 'General',
    section: 'SECTION 1',
    inputType: 'checkbox',
    options: ['Access Control System', 'CCTV System', 'Civil Works', 'Electrical Works', 'Fire Suppression System', 'Mechanical Works', 'Structured Cabling System', 'Others']
  },
  {
    questionId: 'Q-SUB-03',
    questionNumber: 3,
    question: 'Project Duration',
    questionCategory: 'General',
    section: 'SECTION 1',
    inputType: 'date-range'
  },
  {
    questionId: 'Q-SUB-04',
    questionNumber: 4,
    question: 'Delivery / Project Timeliness',
    questionCategory: 'Delivery',
    section: 'SECTION 4',
    inputType: 'matrix',
    subQuestions: [
      { id: 'a', label: 'Except for circumstances beyond the contractor\'s control, tasks and deliverables were completed on time or ahead of the schedule in the contact.', description: 'Always = 2, <2wks late = 1, >2wks late = 0, Not Applicable = N/A', validationRange: { min: 0, max: 2, allowNa: true } },
      { id: 'b', label: 'Delivers and use all resources required to the project and turnover all excess materials to MBS Project Manager.', description: 'Consistently = 2, Inconsistent = 1, Not at all = 0, Not Applicable = N/A', validationRange: { min: 0, max: 2, allowNa: true } }
    ]
  },
  {
    questionId: 'Q-SUB-05',
    questionNumber: 5,
    question: 'Delivery / Project Timeliness Remarks',
    questionCategory: 'Delivery',
    section: 'SECTION 4',
    inputType: 'text'
  },
  {
    questionId: 'Q-SUB-06',
    questionNumber: 6,
    question: 'Documentation / Invoicing',
    questionCategory: 'Documentation',
    section: 'SECTION 5',
    inputType: 'matrix',
    subQuestions: [
      { id: 'a', label: 'The subcontractor\'s invoices/billing were correct, accurate and contained all information of references.', description: 'Always = 2, Limited correction/tolerable = 1, Multiple important corrections/delays = 0, Not Applicable = N/A', validationRange: { min: 0, max: 2, allowNa: true } },
      { id: 'b', label: 'All required documents are submitted on time or within the time frames of agreement e.g. Service report, billing, COC, etc.', description: 'Very timely = 2, <1 week = 1, >1 week = 0, Not Applicable = N/A', validationRange: { min: 0, max: 2, allowNa: true } },
      { id: 'c', label: 'The proposal provides a clear breakdown matched with what MBS requires.', description: 'Consistently = 2, Scope inaccurate but no price increase = 1, Incomplete/leads to price increase = 0, Not Applicable = N/A', validationRange: { min: 0, max: 2, allowNa: true } }
    ]
  },
  {
    questionId: 'Q-SUB-07',
    questionNumber: 7,
    question: 'Documentation / Invoicing Remarks',
    questionCategory: 'Documentation',
    section: 'SECTION 5',
    inputType: 'text'
  },
  {
    questionId: 'Q-SUB-08',
    questionNumber: 8,
    question: 'Cost Control / Pricing',
    questionCategory: 'Cost',
    section: 'SECTION 6',
    inputType: 'matrix',
    subQuestions: [
      { id: 'a', label: 'Give competitive prices, discount, and reasonable prices.', description: 'Yes/accommodate within MBS budget = 2, No = 1, (unused) = 0, Not Applicable = N/A', validationRange: { min: 0, max: 2, allowNa: true } },
      { id: 'b', label: 'Request for change of orders for additional works/cost ONLY outside the scope of contract.', description: 'Yes = 2, Seldom requests = 1, Does not accommodate = 0', validationRange: { min: 0, max: 2, allowNa: true } },
      { id: 'c', label: 'Indication that the subcontractor has financial problem which cannot meet the terms and conditions stated in contract.', description: 'Healthy financial position = 2, Liquid for at least <1M = 1, Always needs fund to mobilize project = 0, Not Applicable = N/A', validationRange: { min: 0, max: 2, allowNa: true } }
    ]
  },
  {
    questionId: 'Q-SUB-09',
    questionNumber: 9,
    question: 'Cost Control / Pricing Remarks',
    questionCategory: 'Cost',
    section: 'SECTION 6',
    inputType: 'text'
  },
  {
    questionId: 'Q-SUB-10',
    questionNumber: 10,
    question: 'Quality and Technical Competence',
    questionCategory: 'Quality',
    section: 'SECTION 7',
    inputType: 'matrix',
    subQuestions: [
      { id: 'a', label: 'The Subcontractor work products complied with the contract, PO scope of work, rules and applicable program guidance.', description: 'Consistently met, no re-work = 2, Mostly met/minor re-work = 1, Substandard = 0, Not Applicable = N/A', validationRange: { min: 0, max: 2, allowNa: true } },
      { id: 'b', label: 'The subcontractor performed site assessment tasks efficiently and effectively, proposed cost-effective changes in scope, provided an accurate summary and proposed cost-effective recommendations for future work and course of action.', description: 'Consistently = 2, Minor ineffective/inaccurate summary = 1, Summaries had to be re-worked = 0, Not Applicable = N/A', validationRange: { min: 0, max: 2, allowNa: true } },
      { id: 'c', label: 'The subcontractor proposed appropriate changes to monitoring points, parameters, and or frequency based on changing site conditions.', description: 'Consistently = 2, Minor changes not proposed = 1, Changes not proposed though warranted = 0, Not Applicable = N/A', validationRange: { min: 0, max: 2, allowNa: true } },
      { id: 'd', label: 'The remedial action plan adequately and cost-effectively addressed the site conditions.', description: 'Always = 2, Minor inconsistent guidelines = 1, Remedial action had to be reworked = 0, Not Applicable = N/A', validationRange: { min: 0, max: 2, allowNa: true } },
      { id: 'e', label: 'The subcontractor initiates Certificate of Completion when the project has been done.', description: 'Yes = 2, Only when prompted by MBS accounting/PM = 1, Not at all = 0, Not Applicable = N/A', validationRange: { min: 0, max: 2, allowNa: true } }
    ]
  },
  {
    questionId: 'Q-SUB-11',
    questionNumber: 11,
    question: 'Quality and Technical Competence Remarks',
    questionCategory: 'Quality',
    section: 'SECTION 7',
    inputType: 'text'
  },
  {
    questionId: 'Q-SUB-12',
    questionNumber: 12,
    question: 'Communication',
    questionCategory: 'Communication',
    section: 'SECTION 8',
    inputType: 'matrix',
    subQuestions: [
      { id: 'a', label: 'The subcontractor communicated and proposed solutions of project changes, problems, delays and issues to MBS representative as they occurred and ahead of deadlines.', description: 'Always = 2, Some untimely/less helpful = 1, Problems from untimely/poor comms = 0, Not Applicable = N/A', validationRange: { min: 0, max: 2, allowNa: true } },
      { id: 'b', label: 'The subcontractor responded within a reasonable time frame to telephone messages and emails from MBS representative.', description: 'Within 2 business days = 2, Within 3-5 days = 1, More than 5 days = 0, Not Applicable = N/A', validationRange: { min: 0, max: 2, allowNa: true } },
      { id: 'c', label: 'The subcontractor is professional in their approach, provide assistance whenever needed, courteous and polite.', description: 'Always regardless of who = 2, Depends on position = 1, Unprofessional at all times = 0, Not Applicable = N/A', validationRange: { min: 0, max: 2, allowNa: true } }
    ]
  },
  {
    questionId: 'Q-SUB-13',
    questionNumber: 13,
    question: 'Communication Remarks',
    questionCategory: 'Communication',
    section: 'SECTION 8',
    inputType: 'text'
  }
];

const fs = require('fs');
let content = fs.readFileSync('src/hooks/useSurveyData.ts', 'utf8');

const subStart = content.indexOf('const subcontractorQuestions =');
const subEndStr = 'loadedSurveys = [';
const subEnd = content.indexOf(subEndStr);

if (subStart > -1 && subEnd > -1) {
  const newSub = 'const subcontractorQuestions = ' + JSON.stringify(subQuestions, null, 2) + ';\n\n          ';
  content = content.substring(0, subStart) + newSub + content.substring(subEnd);
  // increment version to bust cache
  content = content.replace(/_v3/g, '_v4');
  fs.writeFileSync('src/hooks/useSurveyData.ts', content);
  console.log("Patched successfully!");
} else {
  console.log("Failed to find boundaries in useSurveyData.ts");
}
