import { QuestionDefinition } from '../types/survey';

export const surveyQuestions: QuestionDefinition[] = [
  // ==========================================
  // 1. DELIVERY & TIMELINESS (Delivery)
  // ==========================================
  {
    questionId: 'Q01',
    questionNumber: 1,
    question: 'Does the courier consistently deliver our goods to our customers on the agreed date or period?',
    questionCategory: 'Delivery',
    surveyTypes: ['Courier'],
  },
  {
    questionId: 'Q02',
    questionNumber: 2,
    question: 'Does the courier service maintain a consistent level of acceptable service over time?',
    questionCategory: 'Delivery',
    surveyTypes: ['Courier'],
  },
  {
    questionId: 'Q03',
    questionNumber: 3,
    question: "Except for circumstances beyond the subcontractor's control, tasks and deliverables were completed on time or ahead of the contract schedule.",
    questionCategory: 'Delivery',
    surveyTypes: ['Subcontractor'],
  },
  {
    questionId: 'Q04',
    questionNumber: 4,
    question: 'Delivers and use all resources required to the project and turnover all excess materials to MBS Project Manager.',
    questionCategory: 'Delivery',
    surveyTypes: ['Subcontractor'],
  },
  {
    questionId: 'Q05',
    questionNumber: 5,
    question: 'Does the supplier deliver the product on time based on the agreed schedule?',
    questionCategory: 'Delivery',
    surveyTypes: ['Supplier'],
  },
  {
    questionId: 'Q06',
    questionNumber: 6,
    question: 'Does the supplier deliver the product in proper packaging and in good condition?',
    questionCategory: 'Delivery',
    surveyTypes: ['Supplier'],
  },
  {
    questionId: 'Q07',
    questionNumber: 7,
    question: 'Does the supplier deliver the products sealed and safe and free for possible contamination?',
    questionCategory: 'Delivery',
    surveyTypes: ['Supplier'],
  },

  // ==========================================
  // 2. COST CONTROL & PRICING (Commercial)
  // ==========================================
  {
    questionId: 'Q08',
    questionNumber: 8,
    question: "Are the courier's rates competitive and transparent?",
    questionCategory: 'Commercial',
    surveyTypes: ['Courier'],
  },
  {
    questionId: 'Q09',
    questionNumber: 9,
    question: 'Are there any hidden fees or surcharges?',
    questionCategory: 'Commercial',
    surveyTypes: ['Courier'],
  },
  {
    questionId: 'Q10',
    questionNumber: 10,
    question: 'Are they offering flexible payment options, e.g., credit cards or invoicing, and payment credit line?',
    questionCategory: 'Commercial',
    surveyTypes: ['Courier'],
  },
  {
    questionId: 'Q11',
    questionNumber: 11,
    question: 'Give competitive prices, discount, and reasonable prices.',
    questionCategory: 'Commercial',
    surveyTypes: ['Subcontractor'],
  },
  {
    questionId: 'Q12',
    questionNumber: 12,
    question: 'Request for change of orders for additional works/cost ONLY outside the scope of contract.',
    questionCategory: 'Commercial',
    surveyTypes: ['Subcontractor'],
  },
  {
    questionId: 'Q13',
    questionNumber: 13,
    question: 'Indication that the subcontractor has financial problem which cannot meet the terms and conditions stated in contract.',
    questionCategory: 'Commercial',
    surveyTypes: ['Subcontractor'],
  },
  {
    questionId: 'Q14',
    questionNumber: 14,
    question: 'Does the supplier change the price without any notice to MBS Procurement/BSM?',
    questionCategory: 'Commercial',
    surveyTypes: ['Supplier'],
  },
  {
    questionId: 'Q15',
    questionNumber: 15,
    question: 'Is the supplier open for negotiation in terms of price?',
    questionCategory: 'Commercial',
    surveyTypes: ['Supplier'],
  },
  {
    questionId: 'Q16',
    questionNumber: 16,
    question: 'Is the supplier pricing competitive with other suppliers?',
    questionCategory: 'Commercial',
    surveyTypes: ['Supplier'],
  },

  // ==========================================
  // 3. TECHNOLOGY (Technology)
  // ==========================================
  {
    questionId: 'Q17',
    questionNumber: 17,
    question: 'Do they have advanced tracking systems allowing customers for real-time monitoring of the status and location of their packages?',
    questionCategory: 'Technology',
    surveyTypes: ['Courier'],
  },
  {
    questionId: 'Q18',
    questionNumber: 18,
    question: 'Do they have online platforms and mobile apps provided to customers to schedule pickups, make payments, and arrange deliveries?',
    questionCategory: 'Technology',
    surveyTypes: ['Courier'],
  },

  // ==========================================
  // 4. CUSTOMER SERVICE (Support)
  // ==========================================
  {
    questionId: 'Q19',
    questionNumber: 19,
    question: 'Do they have a helpful and responsive customer support team?',
    questionCategory: 'Support',
    surveyTypes: ['Courier'],
  },
  {
    questionId: 'Q20',
    questionNumber: 20,
    question: "Do they effectively handle the customer's issues, and complaints, e.g., lost shipment, item, defective items?",
    questionCategory: 'Support',
    surveyTypes: ['Courier'],
  },
  {
    questionId: 'Q21',
    questionNumber: 21,
    question: 'Does the courier have a prompt payment process in case of mishandled goods, e.g., broken or missing goods?',
    questionCategory: 'Support',
    surveyTypes: ['Courier'],
  },

  // ==========================================
  // 5. COMMUNICATION (Communication)
  // ==========================================
  {
    questionId: 'Q22',
    questionNumber: 22,
    question: 'The subcontractor communicated and proposed solutions of project changes, problems, delays and issues to MBS representative as they occurred and ahead of deadlines.',
    questionCategory: 'Communication',
    surveyTypes: ['Subcontractor'],
  },
  {
    questionId: 'Q23',
    questionNumber: 23,
    question: 'The subcontractor responded within a reasonable time frame to telephone messages and emails from MBS representative.',
    questionCategory: 'Communication',
    surveyTypes: ['Subcontractor'],
  },
  {
    questionId: 'Q24',
    questionNumber: 24,
    question: 'The subcontractor is professional in their approach, provide assistance whenever needed, courteous and polite.',
    questionCategory: 'Communication',
    surveyTypes: ['Subcontractor'],
  },
  {
    questionId: 'Q25',
    questionNumber: 25,
    question: 'Is the supplier responsive and easy to contact?',
    questionCategory: 'Communication',
    surveyTypes: ['Supplier'],
  },
  {
    questionId: 'Q26',
    questionNumber: 26,
    question: 'Does the supplier proactively communicate to MBS Representatives in terms of any discrepancy or changes in transaction?',
    questionCategory: 'Communication',
    surveyTypes: ['Supplier'],
  },
  {
    questionId: 'Q27',
    questionNumber: 27,
    question: 'Does the supplier proactively communicate to MBS Representatives fact-based concern on product/ technology?',
    questionCategory: 'Communication',
    surveyTypes: ['Supplier'],
  },

  // ==========================================
  // 6. QUALITY & TECHNICAL COMPETENCE (Operations)
  // ==========================================
  {
    questionId: 'Q28',
    questionNumber: 28,
    question: 'The Subcontractor work products complied with the contract, PO scope of work, rules and applicable program guidance.',
    questionCategory: 'Operations',
    surveyTypes: ['Subcontractor'],
  },
  {
    questionId: 'Q29',
    questionNumber: 29,
    question: 'The subcontractor performed site assessment tasks efficiently and effectively, proposed cost-effective changes in scope, provided an accurate summary and proposed cost-effective recommendations for future work and course of action.',
    questionCategory: 'Operations',
    surveyTypes: ['Subcontractor'],
  },
  {
    questionId: 'Q30',
    questionNumber: 30,
    question: 'The subcontractor proposed appropriate changes to monitoring points, parameters, and or frequency based on changing site conditions.',
    questionCategory: 'Operations',
    surveyTypes: ['Subcontractor'],
  },
  {
    questionId: 'Q31',
    questionNumber: 31,
    question: 'The remedial action plan adequately and cost-effectively addressed the site conditions.',
    questionCategory: 'Operations',
    surveyTypes: ['Subcontractor'],
  },
  {
    questionId: 'Q32',
    questionNumber: 32,
    question: 'The subcontractor initiates Certificate of Completion when the project has been done.',
    questionCategory: 'Operations',
    surveyTypes: ['Subcontractor'],
  },
  {
    questionId: 'Q33',
    questionNumber: 33,
    question: 'Does the supplier deliver the product with good quality?',
    questionCategory: 'Operations',
    surveyTypes: ['Supplier'],
  },
  {
    questionId: 'Q34',
    questionNumber: 34,
    question: 'Does the supplier take immediate action for defective product upon delivery/RMA?',
    questionCategory: 'Operations',
    surveyTypes: ['Supplier'],
  },
  {
    questionId: 'Q35',
    questionNumber: 35,
    question: 'Does the supplier replace the defective product immediately?',
    questionCategory: 'Operations',
    surveyTypes: ['Supplier'],
  },

  // ==========================================
  // 7. DOCUMENTATION & INVOICING (Compliance)
  // ==========================================
  {
    questionId: 'Q36',
    questionNumber: 36,
    question: "The subcontractor's invoices/billing were correct, accurate and contained all information of references.",
    questionCategory: 'Compliance',
    surveyTypes: ['Subcontractor'],
  },
  {
    questionId: 'Q37',
    questionNumber: 37,
    question: 'All required documents are submitted on time or within the time frames of agreement e.g. Service report, billing, COC, etc.',
    questionCategory: 'Compliance',
    surveyTypes: ['Subcontractor'],
  },
  {
    questionId: 'Q38',
    questionNumber: 38,
    question: 'The proposal provides a clear breakdown matched with what MBS requires.',
    questionCategory: 'Compliance',
    surveyTypes: ['Subcontractor'],
  },
  {
    questionId: 'Q39',
    questionNumber: 39,
    question: 'Does the supplier use the correct documents to facilitate the delivery of sale transaction? (BIR Registered, DR, SI/BS, OR/CR)',
    questionCategory: 'Compliance',
    surveyTypes: ['Supplier'],
  },
  {
    questionId: 'Q40',
    questionNumber: 40,
    question: 'Are the required documents complete for every transaction?',
    questionCategory: 'Compliance',
    surveyTypes: ['Supplier'],
  },
  {
    questionId: 'Q41',
    questionNumber: 41,
    question: 'Are documents clean, neat and readable?',
    questionCategory: 'Compliance',
    surveyTypes: ['Supplier'],
  },
  {
    questionId: 'Q42',
    questionNumber: 42,
    question: 'Are documents presented/submitted upon delivery?',
    questionCategory: 'Compliance',
    surveyTypes: ['Supplier'],
  },
  {
    questionId: 'Q43',
    questionNumber: 43,
    question: 'Are documents presented/submitted upon payments?',
    questionCategory: 'Compliance',
    surveyTypes: ['Supplier'],
  },

  // ==========================================
  // 8. SECURITY & SAFETY (Security)
  // ==========================================
  {
    questionId: 'Q44',
    questionNumber: 44,
    question: 'Do they ensure the safety and security of our packages/parcels during transit and delivery to the client\'s site?',
    questionCategory: 'Security',
    surveyTypes: ['Courier'],
  },
  {
    questionId: 'Q45',
    questionNumber: 45,
    question: 'Do they include insurance options to cover potential loss or damage to our items?',
    questionCategory: 'Security',
    surveyTypes: ['Courier'],
  },
  // ==========================================
  // OVERALL COMMENTS & FEEDBACK (General)
  // ==========================================
  {
    questionId: 'Q-CON-OVERALL-FEEDBACK',
    questionNumber: 46,
    question: 'Overall Comments and Feedback on the Partner',
    questionCategory: 'General',
    surveyTypes: ['Courier'],
  },
  {
    questionId: 'Q-SUP-OVERALL-FEEDBACK',
    questionNumber: 47,
    question: 'Overall Comments and Feedback on the Partner',
    questionCategory: 'General',
    surveyTypes: ['Supplier'],
  },
  {
    questionId: 'Q-SUB-OVERALL-FEEDBACK',
    questionNumber: 48,
    question: 'Overall Comments and Feedback on the Partner',
    questionCategory: 'General',
    surveyTypes: ['Subcontractor'],
  }
];
