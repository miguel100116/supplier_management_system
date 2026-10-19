const supQuestions = [
  {
    questionId: 'Q-SUP-03',
    questionNumber: 1,
    question: 'Period Covered',
    questionCategory: 'General',
    section: 'SECTION 1',
    inputType: 'select',
    options: ['1st Half', '2nd Half', 'Annual']
  },
  {
    questionId: 'Q-SUP-05',
    questionNumber: 2,
    question: 'Does the supplier use the correct documents to facilitate the delivery of sale transaction? (BIR Registered, DR, SI/BS, OR/CR)',
    questionCategory: 'Documentation',
    section: 'Documentation (20 points)',
    inputType: 'typed-rating',
    validationRange: { min: 0, max: 4, allowNa: true }
  },
  {
    questionId: 'Q-SUP-06',
    questionNumber: 3,
    question: 'Are the required documents complete for every transaction?',
    questionCategory: 'Documentation',
    section: 'Documentation (20 points)',
    inputType: 'typed-rating',
    validationRange: { min: 0, max: 4, allowNa: true }
  },
  {
    questionId: 'Q-SUP-07',
    questionNumber: 4,
    question: 'Are documents clean, neat and readable?',
    questionCategory: 'Documentation',
    section: 'Documentation (20 points)',
    inputType: 'typed-rating',
    validationRange: { min: 0, max: 4, allowNa: true }
  },
  {
    questionId: 'Q-SUP-08',
    questionNumber: 5,
    question: 'Are documents presented/submitted upon delivery?',
    questionCategory: 'Documentation',
    section: 'Documentation (20 points)',
    inputType: 'typed-rating',
    validationRange: { min: 0, max: 4, allowNa: true }
  },
  {
    questionId: 'Q-SUP-09',
    questionNumber: 6,
    question: 'Are documents presented/submitted upon payments?',
    questionCategory: 'Documentation',
    section: 'Documentation (20 points)',
    inputType: 'typed-rating',
    validationRange: { min: 0, max: 4, allowNa: true }
  },
  {
    questionId: 'Q-SUP-10',
    questionNumber: 7,
    question: 'Documentation Remarks',
    questionCategory: 'Documentation',
    section: 'Documentation (20 points)',
    inputType: 'text'
  },
  {
    questionId: 'Q-SUP-11',
    questionNumber: 8,
    question: 'Does the supplier deliver the product on time based on the agreed schedule?',
    questionCategory: 'Delivery',
    section: 'Delivery (20 points)',
    inputType: 'typed-rating',
    validationRange: { min: 0, max: 7, allowNa: true }
  },
  {
    questionId: 'Q-SUP-12',
    questionNumber: 9,
    question: 'Does the supplier deliver the product in proper packaging and in good condition?',
    questionCategory: 'Delivery',
    section: 'Delivery (20 points)',
    inputType: 'typed-rating',
    validationRange: { min: 0, max: 7, allowNa: true }
  },
  {
    questionId: 'Q-SUP-13',
    questionNumber: 10,
    question: 'Does the supplier deliver the products sealed and safe and free for possible contamination?',
    questionCategory: 'Delivery',
    section: 'Delivery (20 points)',
    inputType: 'typed-rating',
    validationRange: { min: 0, max: 6, allowNa: true }
  },
  {
    questionId: 'Q-SUP-14',
    questionNumber: 11,
    question: 'Delivery Remarks',
    questionCategory: 'Delivery',
    section: 'Delivery (20 points)',
    inputType: 'text'
  },
  {
    questionId: 'Q-SUP-15',
    questionNumber: 12,
    question: 'Does the supplier change the price without any notice to MBS Procurement/BSM?',
    questionCategory: 'Price',
    section: 'Price/Cost Effectiveness (20 points)',
    inputType: 'typed-rating',
    validationRange: { min: 0, max: 6, allowNa: true }
  },
  {
    questionId: 'Q-SUP-16',
    questionNumber: 13,
    question: 'Is the supplier open for negotiation in terms of price?',
    questionCategory: 'Price',
    section: 'Price/Cost Effectiveness (20 points)',
    inputType: 'typed-rating',
    validationRange: { min: 0, max: 7, allowNa: true }
  },
  {
    questionId: 'Q-SUP-17',
    questionNumber: 14,
    question: 'Is the supplier pricing competitive with other suppliers?',
    questionCategory: 'Price',
    section: 'Price/Cost Effectiveness (20 points)',
    inputType: 'typed-rating',
    validationRange: { min: 0, max: 7, allowNa: true }
  },
  {
    questionId: 'Q-SUP-18',
    questionNumber: 15,
    question: 'Price/Cost Effectiveness Remarks',
    questionCategory: 'Price',
    section: 'Price/Cost Effectiveness (20 points)',
    inputType: 'text'
  },
  {
    questionId: 'Q-SUP-19',
    questionNumber: 16,
    question: 'Does the supplier deliver the product with good quality?',
    questionCategory: 'Quality',
    section: 'Quality (20 points)',
    inputType: 'typed-rating',
    validationRange: { min: 0, max: 7, allowNa: true }
  },
  {
    questionId: 'Q-SUP-20',
    questionNumber: 17,
    question: 'Does the supplier take immediate action for defective product upon delivery/RMA?',
    questionCategory: 'Quality',
    section: 'Quality (20 points)',
    inputType: 'typed-rating',
    validationRange: { min: 0, max: 6, allowNa: true }
  },
  {
    questionId: 'Q-SUP-21',
    questionNumber: 18,
    question: 'Does the supplier replace the defective product immediately?',
    questionCategory: 'Quality',
    section: 'Quality (20 points)',
    inputType: 'typed-rating',
    validationRange: { min: 0, max: 7, allowNa: true }
  },
  {
    questionId: 'Q-SUP-22',
    questionNumber: 19,
    question: 'Quality Remarks',
    questionCategory: 'Quality',
    section: 'Quality (20 points)',
    inputType: 'text'
  },
  {
    questionId: 'Q-SUP-23',
    questionNumber: 20,
    question: 'Do supplier responsive and easy to contact?',
    questionCategory: 'Communication',
    section: 'Communication (20 points)',
    inputType: 'typed-rating',
    validationRange: { min: 0, max: 7, allowNa: true }
  },
  {
    questionId: 'Q-SUP-24',
    questionNumber: 21,
    question: 'Does the supplier proactively communicate to MBS Representatives in terms of any discrepancy or changes in transaction?',
    questionCategory: 'Communication',
    section: 'Communication (20 points)',
    inputType: 'typed-rating',
    validationRange: { min: 0, max: 6, allowNa: true }
  },
  {
    questionId: 'Q-SUP-25',
    questionNumber: 22,
    question: 'Does the supplier proactively communicate to MBS Representatives fact-based concern on product/technology?',
    questionCategory: 'Communication',
    section: 'Communication (20 points)',
    inputType: 'typed-rating',
    validationRange: { min: 0, max: 7, allowNa: true }
  },
  {
    questionId: 'Q-SUP-26',
    questionNumber: 23,
    question: 'Communication Remarks',
    questionCategory: 'Communication',
    section: 'Communication (20 points)',
    inputType: 'text'
  }
];

console.log(JSON.stringify(supQuestions, null, 2));
