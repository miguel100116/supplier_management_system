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
    question: 'Products or Services (e.g., Access Control System, CCTV, Civil Works, Electrical, etc.)',
    questionCategory: 'General',
    section: 'SECTION 1',
    inputType: 'text'
  },
  {
    questionId: 'Q-SUB-03',
    questionNumber: 3,
    question: 'Project Duration (From - To)',
    questionCategory: 'General',
    section: 'SECTION 1',
    inputType: 'text'
  },
  {
    questionId: 'Q-SUB-04',
    questionNumber: 4,
    question: 'Except for circumstances beyond the contractor\'s control, tasks and deliverables were completed on time or ahead of the schedule in the contact. (2=Always, 1=<2wks late, 0=>2wks late, N/A=Not Applicable)',
    questionCategory: 'Delivery',
    section: 'SECTION 4: Delivery / Project Timeliness',
    inputType: 'typed-rating',
    validationRange: { min: 0, max: 2, allowNa: true }
  },
  {
    questionId: 'Q-SUB-05',
    questionNumber: 5,
    question: 'Delivers and use all resources required to the project and turnover all excess materials to MBS Project Manager. (2=Consistently, 1=Inconsistent, 0=Not at all, N/A=Not Applicable)',
    questionCategory: 'Delivery',
    section: 'SECTION 4: Delivery / Project Timeliness',
    inputType: 'typed-rating',
    validationRange: { min: 0, max: 2, allowNa: true }
  },
  {
    questionId: 'Q-SUB-06',
    questionNumber: 6,
    question: 'Delivery / Project Timeliness Remarks',
    questionCategory: 'Delivery',
    section: 'SECTION 4: Delivery / Project Timeliness',
    inputType: 'text'
  },
  {
    questionId: 'Q-SUB-07',
    questionNumber: 7,
    question: 'The subcontractor\'s invoices/billing were correct, accurate and contained all information of references. (2=Always, 1=Limited correction/tolerable, 0=Multiple important corrections/delays, N/A=Not Applicable)',
    questionCategory: 'Documentation',
    section: 'SECTION 5: Documentation / Invoicing',
    inputType: 'typed-rating',
    validationRange: { min: 0, max: 2, allowNa: true }
  },
  {
    questionId: 'Q-SUB-08',
    questionNumber: 8,
    question: 'All required documents are submitted on time or within the time frames of agreement e.g. Service report, billing, COC, etc. (2=Very timely, 1=<1 week, 0=>1 week, N/A=Not Applicable)',
    questionCategory: 'Documentation',
    section: 'SECTION 5: Documentation / Invoicing',
    inputType: 'typed-rating',
    validationRange: { min: 0, max: 2, allowNa: true }
  },
  {
    questionId: 'Q-SUB-09',
    questionNumber: 9,
    question: 'The proposal provides a clear breakdown matched with what MBS requires. (2=Consistently, 1=Scope inaccurate but no price increase, 0=Incomplete/leads to price increase, N/A=Not Applicable)',
    questionCategory: 'Documentation',
    section: 'SECTION 5: Documentation / Invoicing',
    inputType: 'typed-rating',
    validationRange: { min: 0, max: 2, allowNa: true }
  },
  {
    questionId: 'Q-SUB-10',
    questionNumber: 10,
    question: 'Documentation / Invoicing Remarks',
    questionCategory: 'Documentation',
    section: 'SECTION 5: Documentation / Invoicing',
    inputType: 'text'
  },
  {
    questionId: 'Q-SUB-11',
    questionNumber: 11,
    question: 'Give competitive prices, discount, and reasonable prices. (2=Yes/accommodate within MBS budget, 1=No, 0=(unused), N/A=Not Applicable)',
    questionCategory: 'Cost',
    section: 'SECTION 6: Cost Control / Pricing',
    inputType: 'typed-rating',
    validationRange: { min: 0, max: 2, allowNa: true }
  },
  {
    questionId: 'Q-SUB-12',
    questionNumber: 12,
    question: 'Request for change of orders for additional works/cost ONLY outside the scope of contract. (2=Yes, 1=Seldom requests, 0=Does not accommodate)',
    questionCategory: 'Cost',
    section: 'SECTION 6: Cost Control / Pricing',
    inputType: 'typed-rating',
    validationRange: { min: 0, max: 2, allowNa: true }
  },
  {
    questionId: 'Q-SUB-13',
    questionNumber: 13,
    question: 'Indication that the subcontractor has financial problem which cannot meet the terms and conditions stated in contract. (2=Healthy financial position, 1=Liquid for at least <1M, 0=Always needs fund to mobilize project, N/A=Not Applicable)',
    questionCategory: 'Cost',
    section: 'SECTION 6: Cost Control / Pricing',
    inputType: 'typed-rating',
    validationRange: { min: 0, max: 2, allowNa: true }
  },
  {
    questionId: 'Q-SUB-14',
    questionNumber: 14,
    question: 'Cost Control / Pricing Remarks',
    questionCategory: 'Cost',
    section: 'SECTION 6: Cost Control / Pricing',
    inputType: 'text'
  },
  {
    questionId: 'Q-SUB-15',
    questionNumber: 15,
    question: 'The Subcontractor work products complied with the contract, PO scope of work, rules and applicable program guidance. (2=Consistently met, no re-work; 1=Mostly met/minor re-work; 0=Substandard; N/A=Not Applicable)',
    questionCategory: 'Quality',
    section: 'SECTION 7: Quality and Technical Competence',
    inputType: 'typed-rating',
    validationRange: { min: 0, max: 2, allowNa: true }
  },
  {
    questionId: 'Q-SUB-16',
    questionNumber: 16,
    question: 'The subcontractor performed site assessment tasks efficiently and effectively, proposed cost-effective changes in scope, provided an accurate summary and proposed cost-effective recommendations for future work and course of action. (2=Consistently; 1=Minor ineffective/inaccurate summary; 0=Summaries had to be re-worked; N/A=Not Applicable)',
    questionCategory: 'Quality',
    section: 'SECTION 7: Quality and Technical Competence',
    inputType: 'typed-rating',
    validationRange: { min: 0, max: 2, allowNa: true }
  },
  {
    questionId: 'Q-SUB-17',
    questionNumber: 17,
    question: 'The subcontractor proposed appropriate changes to monitoring points, parameters, and or frequency based on changing site conditions. (2=Consistently; 1=Minor changes not proposed; 0=Changes not proposed though warranted; N/A=Not Applicable)',
    questionCategory: 'Quality',
    section: 'SECTION 7: Quality and Technical Competence',
    inputType: 'typed-rating',
    validationRange: { min: 0, max: 2, allowNa: true }
  },
  {
    questionId: 'Q-SUB-18',
    questionNumber: 18,
    question: 'The remedial action plan adequately and cost-effectively addressed the site conditions. (2=Always; 1=Minor inconsistent guidelines; 0=Remedial action had to be reworked; N/A=Not Applicable)',
    questionCategory: 'Quality',
    section: 'SECTION 7: Quality and Technical Competence',
    inputType: 'typed-rating',
    validationRange: { min: 0, max: 2, allowNa: true }
  },
  {
    questionId: 'Q-SUB-19',
    questionNumber: 19,
    question: 'The subcontractor initiates Certificate of Completion when the project has been done. (2=Yes; 1=Only when prompted by MBS accounting/PM; 0=Not at all; N/A=Not Applicable)',
    questionCategory: 'Quality',
    section: 'SECTION 7: Quality and Technical Competence',
    inputType: 'typed-rating',
    validationRange: { min: 0, max: 2, allowNa: true }
  },
  {
    questionId: 'Q-SUB-20',
    questionNumber: 20,
    question: 'Quality and Technical Competence Remarks',
    questionCategory: 'Quality',
    section: 'SECTION 7: Quality and Technical Competence',
    inputType: 'text'
  },
  {
    questionId: 'Q-SUB-21',
    questionNumber: 21,
    question: 'The subcontractor communicated and proposed solutions of project changes, problems, delays and issues to MBS representative as they occurred and ahead of deadlines. (2=Always; 1=Some untimely/less helpful; 0=Problems from untimely/poor comms; N/A=Not Applicable)',
    questionCategory: 'Communication',
    section: 'SECTION 7 (cont\'d): Communication',
    inputType: 'typed-rating',
    validationRange: { min: 0, max: 2, allowNa: true }
  },
  {
    questionId: 'Q-SUB-22',
    questionNumber: 22,
    question: 'The subcontractor responded within a reasonable time frame to telephone messages and emails from MBS representative. (2=Within 2 business days; 1=Within 3-5 days; 0=More than 5 days; N/A=Not Applicable)',
    questionCategory: 'Communication',
    section: 'SECTION 7 (cont\'d): Communication',
    inputType: 'typed-rating',
    validationRange: { min: 0, max: 2, allowNa: true }
  },
  {
    questionId: 'Q-SUB-23',
    questionNumber: 23,
    question: 'The subcontractor is professional in their approach, provide assistance whenever needed, courteous and polite. (2=Always regardless of who; 1=Depends on position; 0=Unprofessional at all times; N/A=Not Applicable)',
    questionCategory: 'Communication',
    section: 'SECTION 7 (cont\'d): Communication',
    inputType: 'typed-rating',
    validationRange: { min: 0, max: 2, allowNa: true }
  },
  {
    questionId: 'Q-SUB-24',
    questionNumber: 24,
    question: 'Communication Remarks',
    questionCategory: 'Communication',
    section: 'SECTION 7 (cont\'d): Communication',
    inputType: 'text'
  }
];

console.log(JSON.stringify(subQuestions, null, 2));
