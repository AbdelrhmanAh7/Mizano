/**
 * Pre-built training datasets for AI service tests.
 * Each dataset contains realistic input/label pairs.
 */

/** Lead scoring training data: leads with known outcomes */
export const LEAD_SCORING_TRAINING_DATA = [
  {
    inputData: {
      source: 'website',
      hasEmail: true,
      hasPhone: true,
      companyName: 'Big Corp',
      notesLength: 50,
    },
    label: 'converted',
  },
  {
    inputData: {
      source: 'website',
      hasEmail: true,
      hasPhone: false,
      companyName: '',
      notesLength: 0,
    },
    label: 'lost',
  },
  {
    inputData: {
      source: 'referral',
      hasEmail: true,
      hasPhone: true,
      companyName: 'Tech Inc',
      notesLength: 120,
    },
    label: 'converted',
  },
  {
    inputData: {
      source: 'cold_call',
      hasEmail: false,
      hasPhone: true,
      companyName: '',
      notesLength: 10,
    },
    label: 'lost',
  },
  {
    inputData: {
      source: 'trade_show',
      hasEmail: true,
      hasPhone: true,
      companyName: 'MedCo',
      notesLength: 80,
    },
    label: 'converted',
  },
  {
    inputData: {
      source: 'website',
      hasEmail: true,
      hasPhone: false,
      companyName: 'Small LLC',
      notesLength: 5,
    },
    label: 'lost',
  },
  {
    inputData: {
      source: 'referral',
      hasEmail: true,
      hasPhone: true,
      companyName: 'Enterprise Ltd',
      notesLength: 200,
    },
    label: 'converted',
  },
  {
    inputData: {
      source: 'cold_call',
      hasEmail: true,
      hasPhone: false,
      companyName: '',
      notesLength: 0,
    },
    label: 'lost',
  },
];

/** Churn prediction training data */
export const CHURN_TRAINING_DATA = [
  { inputData: { recency: 5, frequency: 12, monetary: 50000, tenure: 24 }, label: 'active' },
  { inputData: { recency: 90, frequency: 2, monetary: 1000, tenure: 3 }, label: 'churned' },
  { inputData: { recency: 15, frequency: 8, monetary: 30000, tenure: 18 }, label: 'active' },
  { inputData: { recency: 120, frequency: 1, monetary: 500, tenure: 6 }, label: 'churned' },
  { inputData: { recency: 3, frequency: 20, monetary: 100000, tenure: 36 }, label: 'active' },
  { inputData: { recency: 60, frequency: 3, monetary: 2000, tenure: 4 }, label: 'churned' },
];

/** Transaction categorization training data */
export const CATEGORIZATION_TRAINING_DATA = [
  { inputData: { description: 'Monthly office rent payment', amount: 5000 }, label: 'RENT' },
  {
    inputData: { description: 'AWS Cloud hosting services', amount: 1200 },
    label: 'CLOUD_SERVICES',
  },
  { inputData: { description: 'Employee salary - John Smith', amount: 8500 }, label: 'PAYROLL' },
  {
    inputData: { description: 'Office supplies - staples, paper', amount: 150 },
    label: 'OFFICE_SUPPLIES',
  },
  {
    inputData: { description: 'Electric utility bill - January', amount: 450 },
    label: 'UTILITIES',
  },
  { inputData: { description: 'Google Ads campaign Q1', amount: 3000 }, label: 'MARKETING' },
  {
    inputData: { description: 'Legal consultation fees', amount: 2500 },
    label: 'PROFESSIONAL_FEES',
  },
  {
    inputData: { description: 'Company dinner - team building', amount: 800 },
    label: 'MEALS_ENTERTAINMENT',
  },
];

/** Document classification training data */
export const DOCUMENT_CLASSIFICATION_DATA = [
  {
    inputData: { text: 'Invoice Number INV-001 Amount Due $5000 Payment Terms Net 30' },
    label: 'INVOICE',
  },
  { inputData: { text: 'RECEIPT Thank you for your purchase Total: $42.99' }, label: 'RECEIPT' },
  {
    inputData: { text: 'Purchase Order PO-789 Ship To: Warehouse Delivery Date: March 15' },
    label: 'PURCHASE_ORDER',
  },
  {
    inputData: {
      text: 'This Agreement entered into between Party A and Party B effective January 1',
    },
    label: 'CONTRACT',
  },
  {
    inputData: { text: 'VAT Return Period Q1 2024 Total Output Tax Total Input Tax' },
    label: 'TAX_DOCUMENT',
  },
  {
    inputData: {
      text: 'Bank Statement Account 1234 Period January Opening Balance Closing Balance',
    },
    label: 'BANK_STATEMENT',
  },
  { inputData: { text: 'Payslip Employee ID Basic Salary Deductions Net Pay' }, label: 'PAYSLIP' },
];

/** Fraud detection training data */
export const FRAUD_DETECTION_DATA = [
  {
    inputData: { amount: 500, timeOfDay: 14, dayOfWeek: 2, frequency: 1, isRoundNumber: false },
    label: 'legitimate',
  },
  {
    inputData: { amount: 9999, timeOfDay: 3, dayOfWeek: 0, frequency: 5, isRoundNumber: false },
    label: 'suspicious',
  },
  {
    inputData: { amount: 1200, timeOfDay: 10, dayOfWeek: 3, frequency: 1, isRoundNumber: false },
    label: 'legitimate',
  },
  {
    inputData: { amount: 10000, timeOfDay: 23, dayOfWeek: 6, frequency: 3, isRoundNumber: true },
    label: 'suspicious',
  },
  {
    inputData: { amount: 350, timeOfDay: 15, dayOfWeek: 1, frequency: 1, isRoundNumber: false },
    label: 'legitimate',
  },
  {
    inputData: { amount: 49999, timeOfDay: 2, dayOfWeek: 5, frequency: 1, isRoundNumber: false },
    label: 'suspicious',
  },
];

/** Employee attrition training data */
export const ATTRITION_TRAINING_DATA = [
  {
    inputData: { tenure: 60, salaryRatio: 1.1, absenceRate: 0.02, departmentTurnover: 0.05 },
    label: 'stayed',
  },
  {
    inputData: { tenure: 6, salaryRatio: 0.7, absenceRate: 0.15, departmentTurnover: 0.2 },
    label: 'left',
  },
  {
    inputData: { tenure: 36, salaryRatio: 1.0, absenceRate: 0.03, departmentTurnover: 0.08 },
    label: 'stayed',
  },
  {
    inputData: { tenure: 12, salaryRatio: 0.8, absenceRate: 0.1, departmentTurnover: 0.15 },
    label: 'left',
  },
  {
    inputData: { tenure: 48, salaryRatio: 1.2, absenceRate: 0.01, departmentTurnover: 0.03 },
    label: 'stayed',
  },
  {
    inputData: { tenure: 3, salaryRatio: 0.6, absenceRate: 0.2, departmentTurnover: 0.25 },
    label: 'left',
  },
];

/** Anomaly detection: normal transaction amounts by account */
export const NORMAL_TRANSACTION_AMOUNTS = [
  1200, 1150, 1300, 1250, 1180, 1220, 1275, 1190, 1230, 1260, 1210, 1240, 1195, 1235, 1270, 1205,
  1225, 1255, 1185, 1245,
];

/** Anomaly detection: amounts with an outlier */
export const AMOUNTS_WITH_OUTLIER = [
  1200,
  1150,
  1300,
  1250,
  1180,
  1220,
  1275,
  1190,
  1230,
  1260,
  1210,
  1240,
  1195,
  1235,
  1270,
  1205,
  1225,
  1255,
  1185,
  15000, // outlier
];

/** Demand forecasting: 24 months of sales data with seasonality */
export const SEASONAL_SALES_DATA = [
  100,
  110,
  130,
  150,
  160,
  180,
  170,
  165,
  140,
  120,
  105,
  95, // Year 1
  105,
  115,
  135,
  155,
  165,
  190,
  175,
  170,
  145,
  125,
  110,
  100, // Year 2
];

/** Demand forecasting: trending up data */
export const TRENDING_UP_DATA = [100, 108, 115, 122, 130, 138, 145, 153, 160, 168, 175, 183];

/** Demand forecasting: flat/stable data */
export const FLAT_DATA = [100, 102, 98, 101, 99, 103, 97, 100, 102, 99, 101, 98];

/** Sentiment analysis test data */
export const SENTIMENT_TEST_DATA = [
  {
    text: 'Excellent service! Very happy with the product quality and fast delivery.',
    expected: 'positive',
  },
  {
    text: 'Terrible experience. Product arrived broken and customer support was unhelpful.',
    expected: 'negative',
  },
  { text: 'The order was delivered on time. Standard packaging.', expected: 'neutral' },
  {
    text: 'Amazing results! This exceeded all our expectations. Highly recommended!',
    expected: 'positive',
  },
  {
    text: 'Worst purchase ever. Completely waste of money. Never buying again.',
    expected: 'negative',
  },
];

/** Payment history for payment prediction tests */
export const PAYMENT_HISTORY = [
  {
    invoiceDate: new Date('2023-06-01'),
    dueDate: new Date('2023-07-01'),
    paidDate: new Date('2023-07-05'),
    amount: 5000,
  },
  {
    invoiceDate: new Date('2023-07-01'),
    dueDate: new Date('2023-08-01'),
    paidDate: new Date('2023-08-03'),
    amount: 4500,
  },
  {
    invoiceDate: new Date('2023-08-01'),
    dueDate: new Date('2023-09-01'),
    paidDate: new Date('2023-09-02'),
    amount: 5200,
  },
  {
    invoiceDate: new Date('2023-09-01'),
    dueDate: new Date('2023-10-01'),
    paidDate: new Date('2023-10-07'),
    amount: 4800,
  },
  {
    invoiceDate: new Date('2023-10-01'),
    dueDate: new Date('2023-11-01'),
    paidDate: new Date('2023-11-04'),
    amount: 5100,
  },
  {
    invoiceDate: new Date('2023-11-01'),
    dueDate: new Date('2023-12-01'),
    paidDate: new Date('2023-12-06'),
    amount: 4900,
  },
];

/** Cash flow historical data */
export const CASH_FLOW_HISTORY = {
  receivables: [
    { date: new Date('2024-01-15'), amount: 10000 },
    { date: new Date('2024-01-28'), amount: 8500 },
    { date: new Date('2024-02-10'), amount: 12000 },
    { date: new Date('2024-02-25'), amount: 9000 },
  ],
  payables: [
    { date: new Date('2024-01-20'), amount: 5000 },
    { date: new Date('2024-02-01'), amount: 7500 },
    { date: new Date('2024-02-15'), amount: 3000 },
  ],
  currentBalance: 25000,
};

/** Reconciliation test data: bank transactions and potential matches */
export const RECONCILIATION_DATA = {
  bankTransaction: {
    id: 'bt-001',
    description: 'Wire from Acme Corp',
    amount: 5000,
    date: new Date('2024-01-15'),
    type: 'CREDIT',
  },
  invoices: [
    {
      id: 'inv-001',
      number: 'INV-001',
      customerName: 'Acme Corporation',
      amount: 5000,
      date: new Date('2024-01-10'),
    },
    {
      id: 'inv-002',
      number: 'INV-002',
      customerName: 'Acme Corp Ltd',
      amount: 5100,
      date: new Date('2024-01-12'),
    },
    {
      id: 'inv-003',
      number: 'INV-003',
      customerName: 'Global Tech',
      amount: 5000,
      date: new Date('2024-02-01'),
    },
  ],
};
