import {
  PrismaClient,
  AccountType,
  InvoiceStatus,
  BillStatus,
  LeadSource,
  LeadStatus,
} from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

/**
 * Seed AI training data for all trainable models.
 * Called from seed.ts after core data is created.
 */
export async function seedAiTrainingData(
  prisma: PrismaClient,
  orgId: string,
  accountMap: Record<string, string>,
  custMap: Record<string, string>,
  vendMap: Record<string, string>,
  itemMap: Record<string, string>,
  whMap: Record<string, string>,
) {
  console.log('\n12. Seeding AI training data...');

  // ──────────────────────────────────────────────────────────────────
  // 12a. Additional expense accounts for categorization diversity
  // ──────────────────────────────────────────────────────────────────
  console.log('  → Creating additional accounts...');
  const extraAccounts = [
    { code: '6000', name: 'Office Supplies', type: AccountType.EXPENSE },
    { code: '6100', name: 'Utilities', type: AccountType.EXPENSE },
    { code: '6200', name: 'Meals & Entertainment', type: AccountType.EXPENSE },
    { code: '6300', name: 'Travel', type: AccountType.EXPENSE },
    { code: '6400', name: 'Marketing & Advertising', type: AccountType.EXPENSE },
    { code: '6500', name: 'Insurance', type: AccountType.EXPENSE },
    { code: '6600', name: 'Rent & Lease', type: AccountType.EXPENSE },
    { code: '6700', name: 'Professional Fees', type: AccountType.EXPENSE },
    { code: '1200', name: 'Accounts Receivable', type: AccountType.ASSET },
  ];

  for (const accData of extraAccounts) {
    const acc = await prisma.account.upsert({
      where: { code_organizationId: { code: accData.code, organizationId: orgId } },
      update: {},
      create: { ...accData, organizationId: orgId },
    });
    accountMap[accData.code] = acc.id;
  }
  console.log(`  ✓ ${extraAccounts.length} additional accounts created`);

  // ──────────────────────────────────────────────────────────────────
  // 12b. Additional vendors for diversity
  // ──────────────────────────────────────────────────────────────────
  console.log('  → Creating additional vendors...');
  const extraVendors = [
    {
      id: 'vend-003',
      name: 'Staples Office Supply',
      email: 'orders@staples.com',
      phone: '+201001112233',
    },
    {
      id: 'vend-004',
      name: 'Egypt Telecom',
      email: 'billing@egypttelecom.com',
      phone: '+201001113344',
    },
    {
      id: 'vend-005',
      name: 'Cairo Catering Co',
      email: 'events@cairocatering.com',
      phone: '+201001114455',
    },
    {
      id: 'vend-006',
      name: 'EgyptAir Corporate',
      email: 'corporate@egyptair.com',
      phone: '+201001115566',
    },
    {
      id: 'vend-007',
      name: 'Digital Marketing Pro',
      email: 'ads@dmpro.com',
      phone: '+201001116677',
    },
    {
      id: 'vend-008',
      name: 'Nile Insurance Group',
      email: 'claims@nileinsurance.com',
      phone: '+201001117788',
    },
    {
      id: 'vend-009',
      name: 'Cairo Properties LLC',
      email: 'leasing@cairoprop.com',
      phone: '+201001118899',
    },
    {
      id: 'vend-010',
      name: 'Baker McKenzie Egypt',
      email: 'billing@bakermckenzie.eg',
      phone: '+201001119900',
    },
  ];

  for (const vd of extraVendors) {
    const v = await prisma.vendor.upsert({
      where: { id: vd.id },
      update: {},
      create: { ...vd, billingCity: 'Cairo', billingCountry: 'Egypt', organizationId: orgId },
    });
    vendMap[vd.id] = v.id;
  }
  console.log(`  ✓ ${extraVendors.length} additional vendors created`);

  // ──────────────────────────────────────────────────────────────────
  // 12c. CATEGORIZATION training data (~120 records)
  // Maps transaction descriptions → account codes
  // ──────────────────────────────────────────────────────────────────
  console.log('  → Seeding categorization training data...');
  const categorizationRecords: Array<{ inputData: Record<string, any>; label: string }> = [];

  const categorizationSamples: Array<{
    descriptions: string[];
    vendorName?: string;
    accountCode: string;
    direction: string;
    amountRange: [number, number];
  }> = [
    // Office Supplies → 6000
    {
      descriptions: [
        'Office supplies from Staples',
        'Printer paper and toner',
        'Desk organizer and stationery',
        'Whiteboard markers and erasers',
        'Filing cabinets order',
        'Office furniture delivery',
        'Staples monthly supply order',
        'Pens, notebooks and folders',
        'Computer peripherals - keyboards',
        'Office chair replacement',
        'Desk lamp and accessories',
        'Printer cartridge refill',
      ],
      vendorName: 'Staples Office Supply',
      accountCode: '6000',
      direction: 'expense',
      amountRange: [15, 500],
    },
    // Utilities → 6100
    {
      descriptions: [
        'Monthly internet subscription',
        'Electricity bill - office',
        'Water utility payment',
        'Phone and internet bundle',
        'Internet service - fiber',
        'Office electricity Q1',
        'Telephone line rental',
        'Egypt Telecom monthly bill',
        'Building utility charges',
        'Heating and cooling bill',
        'Office internet upgrade',
        'Mobile plan - business',
      ],
      vendorName: 'Egypt Telecom',
      accountCode: '6100',
      direction: 'expense',
      amountRange: [50, 800],
    },
    // Meals & Entertainment → 6200
    {
      descriptions: [
        'Team lunch meeting',
        'Client dinner - TechCorp',
        'Coffee and snacks for office',
        'Team building event catering',
        'Business lunch - investor meeting',
        'Company celebration dinner',
        'Weekly team lunch order',
        'Catering for quarterly meeting',
        'Client entertainment expenses',
        'Office breakfast supplies',
        'Holiday party catering',
        'Staff appreciation lunch',
      ],
      vendorName: 'Cairo Catering Co',
      accountCode: '6200',
      direction: 'expense',
      amountRange: [20, 2000],
    },
    // Travel → 6300
    {
      descriptions: [
        'Flight to Alexandria - business trip',
        'Hotel stay - Cairo conference',
        'Taxi and ride-sharing expenses',
        'Business trip - Aswan meeting',
        'Airport transfer service',
        'Train tickets - team offsite',
        'Per diem - business travel',
        'Car rental for site visits',
        'Flight booking - sales meeting',
        'Hotel accommodation 3 nights',
        'Corporate travel - regional office',
        'Transportation to client site',
      ],
      vendorName: 'EgyptAir Corporate',
      accountCode: '6300',
      direction: 'expense',
      amountRange: [100, 5000],
    },
    // Marketing → 6400
    {
      descriptions: [
        'Google Ads campaign Q1',
        'Facebook advertising spend',
        'Marketing brochure printing',
        'Trade show booth rental',
        'Social media management fee',
        'Email marketing subscription',
        'SEO optimization service',
        'Brand merchandise order',
        'Video production - product demo',
        'Billboard advertising - Cairo',
        'Digital marketing retainer',
        'Marketing analytics tools',
      ],
      vendorName: 'Digital Marketing Pro',
      accountCode: '6400',
      direction: 'expense',
      amountRange: [200, 10000],
    },
    // Insurance → 6500
    {
      descriptions: [
        'Annual business insurance premium',
        'Liability insurance renewal',
        'Workers compensation insurance',
        'Property insurance - office',
        'Health insurance - staff',
        'Vehicle fleet insurance',
        'Professional indemnity cover',
        'Equipment insurance premium',
        'Business interruption policy',
        'Cyber liability insurance',
        'Insurance deductible payment',
        'Insurance broker fee',
      ],
      vendorName: 'Nile Insurance Group',
      accountCode: '6500',
      direction: 'expense',
      amountRange: [500, 15000],
    },
    // Rent → 6600
    {
      descriptions: [
        'Monthly office rent - Cairo HQ',
        'Warehouse lease payment',
        'Parking space rental',
        'Office rent - Q1 advance',
        'Building maintenance fee',
        'Common area charges',
        'Equipment lease payment',
        'Co-working space membership',
        'Storage unit rental',
        'Office expansion - new floor',
        'Monthly rent - downtown office',
        'Lease renewal deposit',
      ],
      vendorName: 'Cairo Properties LLC',
      accountCode: '6600',
      direction: 'expense',
      amountRange: [1000, 20000],
    },
    // Professional Fees → 6700
    {
      descriptions: [
        'Legal consultation fee',
        'Annual audit services',
        'Tax advisory - quarterly',
        'Accounting firm retainer',
        'HR consulting services',
        'IT consulting - system setup',
        'Legal review - contract',
        'Patent filing legal fees',
        'Business valuation report',
        'Regulatory compliance advisory',
        'Management consulting fee',
        'Financial advisory services',
      ],
      vendorName: 'Baker McKenzie Egypt',
      accountCode: '6700',
      direction: 'expense',
      amountRange: [300, 25000],
    },
    // Salary → 5100
    {
      descriptions: [
        'Monthly payroll - January',
        'Salary payment - engineering team',
        'Overtime payment - warehouse staff',
        'Staff bonus - Q4 performance',
        'Payroll processing - February',
        'Employee salary advances',
        'Commission payment - sales team',
        'End of service gratuity',
        'Freelancer payment - design work',
        'Part-time staff wages',
        'Annual bonus distribution',
        'Salary adjustment - promotion',
      ],
      accountCode: '5100',
      direction: 'expense',
      amountRange: [1000, 50000],
    },
    // COGS → 5000
    {
      descriptions: [
        'Raw materials purchase',
        'Wholesale inventory purchase',
        'Product packaging materials',
        'Manufacturing supplies order',
        'Shipping and freight charges',
        'Import duties and customs',
        'Product components - electronics',
        'Inventory restock - laptops',
        'Supplier payment - monitors',
        'Direct materials - cables',
        'Cost of goods - Q1 purchase',
        'Production materials order',
      ],
      vendorName: 'Supplier Alpha',
      accountCode: '5000',
      direction: 'expense',
      amountRange: [500, 30000],
    },
    // Sales Revenue → 4000 (income)
    {
      descriptions: [
        'Product sales - TechCorp order',
        'Service revenue - consulting',
        'Subscription payment received',
        'Project completion payment',
        'Recurring service fee',
        'Hardware sales - retail',
        'Software license revenue',
        'Maintenance contract payment',
        'Installation service fee',
        'Annual service agreement',
        'Product sale - Global Solutions',
        'Custom development invoice',
      ],
      accountCode: '4000',
      direction: 'income',
      amountRange: [200, 50000],
    },
  ];

  for (const sample of categorizationSamples) {
    for (const desc of sample.descriptions) {
      const amount =
        Math.round(
          (sample.amountRange[0] +
            Math.random() * (sample.amountRange[1] - sample.amountRange[0])) *
            100,
        ) / 100;

      categorizationRecords.push({
        inputData: {
          description: desc,
          vendorName: sample.vendorName || null,
          amount,
          direction: sample.direction,
        },
        label: accountMap[sample.accountCode],
      });
    }
  }

  await prisma.aiTrainingData.createMany({
    data: categorizationRecords.map((r) => ({
      organizationId: orgId,
      feature: 'CATEGORIZATION' as const,
      inputData: r.inputData,
      label: r.label,
      source: 'SEED' as const,
    })),
    skipDuplicates: true,
  });
  console.log(`  ✓ ${categorizationRecords.length} categorization training records created`);

  // ──────────────────────────────────────────────────────────────────
  // 12d. RECONCILIATION training data (~40 records)
  // Bank descriptions → matched entity patterns
  // ──────────────────────────────────────────────────────────────────
  console.log('  → Seeding reconciliation training data...');
  const reconciliationRecords = [
    // Invoice matches
    {
      inputData: {
        description: 'TRF FROM TECHCORP EGYPT REF INV-001',
        amount: 1299.99,
        date: '2025-12-15',
      },
      label: 'invoice:INV-001',
    },
    {
      inputData: {
        description: 'DEPOSIT TECHCORP PAYMENT INV001',
        amount: 1299.99,
        date: '2025-12-16',
      },
      label: 'invoice:INV-001',
    },
    {
      inputData: {
        description: 'GLOBAL SOLUTIONS WIRE TRANSFER',
        amount: 699.98,
        date: '2025-12-20',
      },
      label: 'invoice:INV-002',
    },
    {
      inputData: {
        description: 'CHQ DEP - GLOBAL SOLUTIONS INV-002',
        amount: 699.98,
        date: '2025-12-22',
      },
      label: 'invoice:INV-002',
    },
    {
      inputData: { description: 'ACH RECEIPT RETAIL PLUS', amount: 500.0, date: '2025-11-15' },
      label: 'invoice:INV-003',
    },
    {
      inputData: { description: 'WIRE IN FROM RETAIL PLUS CO', amount: 500.0, date: '2025-11-16' },
      label: 'invoice:INV-003',
    },
    // Bill matches
    {
      inputData: { description: 'PAYMENT TO SUPPLIER ALPHA', amount: -5000.0, date: '2025-12-01' },
      label: 'bill:BILL-001',
    },
    {
      inputData: { description: 'CHQ 1234 SUPPLIER ALPHA', amount: -5000.0, date: '2025-12-02' },
      label: 'bill:BILL-001',
    },
    {
      inputData: { description: 'SUPPLIER BETA WIRE OUT', amount: -3500.0, date: '2025-12-05' },
      label: 'bill:BILL-002',
    },
    {
      inputData: { description: 'TRF TO SUPPLIER BETA ACCT', amount: -3500.0, date: '2025-12-06' },
      label: 'bill:BILL-002',
    },
    // Expense matches - rent
    {
      inputData: {
        description: 'CAIRO PROPERTIES MONTHLY RENT',
        amount: -8000.0,
        date: '2025-12-01',
      },
      label: 'expense:rent',
    },
    {
      inputData: { description: 'RENT PAYMENT DEC 2025', amount: -8000.0, date: '2025-12-01' },
      label: 'expense:rent',
    },
    {
      inputData: { description: 'STANDING ORDER CAIRO PROP', amount: -8000.0, date: '2025-11-01' },
      label: 'expense:rent',
    },
    // Expense matches - utilities
    {
      inputData: { description: 'EGYPT TELECOM DD', amount: -350.0, date: '2025-12-15' },
      label: 'expense:utilities',
    },
    {
      inputData: { description: 'ELECTRICITY BILL AUTO PAY', amount: -450.0, date: '2025-12-10' },
      label: 'expense:utilities',
    },
    {
      inputData: { description: 'INTERNET SERVICE PROVIDER', amount: -199.99, date: '2025-12-14' },
      label: 'expense:utilities',
    },
    // Expense matches - insurance
    {
      inputData: { description: 'NILE INSURANCE PREMIUM', amount: -2500.0, date: '2025-12-01' },
      label: 'expense:insurance',
    },
    {
      inputData: { description: 'INS PREMIUM Q4 NILE GROUP', amount: -2500.0, date: '2025-09-01' },
      label: 'expense:insurance',
    },
    // Payroll
    {
      inputData: { description: 'PAYROLL JAN 2026', amount: -45000.0, date: '2026-01-28' },
      label: 'expense:payroll',
    },
    {
      inputData: { description: 'SALARY TRANSFER BATCH JAN', amount: -45000.0, date: '2026-01-28' },
      label: 'expense:payroll',
    },
    {
      inputData: { description: 'MONTHLY WAGES DEC 2025', amount: -42000.0, date: '2025-12-28' },
      label: 'expense:payroll',
    },
    // Bank charges
    {
      inputData: { description: 'BANK FEE - MONTHLY SERVICE', amount: -25.0, date: '2025-12-31' },
      label: 'expense:bank_charges',
    },
    {
      inputData: { description: 'WIRE TRANSFER FEE', amount: -15.0, date: '2025-12-05' },
      label: 'expense:bank_charges',
    },
    {
      inputData: { description: 'ATM WITHDRAWAL FEE', amount: -5.0, date: '2025-12-15' },
      label: 'expense:bank_charges',
    },
    // Card payments
    {
      inputData: { description: 'POS TXN STAPLES CAIRO', amount: -89.5, date: '2025-12-08' },
      label: 'expense:office_supplies',
    },
    {
      inputData: { description: 'AMAZON BUSINESS PURCHASE', amount: -245.0, date: '2025-12-10' },
      label: 'expense:office_supplies',
    },
    {
      inputData: { description: 'POS CAIRO CATERING', amount: -320.0, date: '2025-12-12' },
      label: 'expense:meals',
    },
    // Unknown / uncategorized
    {
      inputData: { description: 'MISC DEBIT REF 99881', amount: -150.0, date: '2025-12-20' },
      label: 'unknown',
    },
    {
      inputData: { description: 'REVERSAL ADJUSTMENT', amount: 75.0, date: '2025-12-21' },
      label: 'unknown',
    },
    {
      inputData: { description: 'CASH DEPOSIT', amount: 1000.0, date: '2025-12-22' },
      label: 'unknown',
    },
    // Transfers between accounts
    {
      inputData: { description: 'TRF TO SAVINGS ACCT', amount: -10000.0, date: '2025-12-15' },
      label: 'transfer:internal',
    },
    {
      inputData: { description: 'INTERNAL TRANSFER', amount: -5000.0, date: '2025-12-20' },
      label: 'transfer:internal',
    },
    {
      inputData: { description: 'TRF FROM SAVINGS', amount: 5000.0, date: '2025-12-25' },
      label: 'transfer:internal',
    },
    // Tax payments
    {
      inputData: { description: 'VAT PAYMENT Q4 2025', amount: -8500.0, date: '2025-12-31' },
      label: 'expense:tax',
    },
    {
      inputData: { description: 'TAX AUTHORITY PAYMENT', amount: -3200.0, date: '2025-12-31' },
      label: 'expense:tax',
    },
    // Refunds
    {
      inputData: { description: 'REFUND FROM SUPPLIER ALPHA', amount: 250.0, date: '2025-12-18' },
      label: 'refund:vendor',
    },
    {
      inputData: { description: 'CREDIT NOTE - STAPLES', amount: 45.0, date: '2025-12-19' },
      label: 'refund:vendor',
    },
    // Loan
    {
      inputData: { description: 'LOAN REPAYMENT - BANK', amount: -5000.0, date: '2025-12-15' },
      label: 'expense:loan_repayment',
    },
    {
      inputData: { description: 'MORTGAGE INSTALLMENT', amount: -12000.0, date: '2025-12-01' },
      label: 'expense:loan_repayment',
    },
    // Subscriptions
    {
      inputData: { description: 'GOOGLE WORKSPACE MONTHLY', amount: -72.0, date: '2025-12-01' },
      label: 'expense:subscriptions',
    },
    {
      inputData: { description: 'SLACK BUSINESS PLAN', amount: -125.0, date: '2025-12-01' },
      label: 'expense:subscriptions',
    },
  ];

  await prisma.aiTrainingData.createMany({
    data: reconciliationRecords.map((r) => ({
      organizationId: orgId,
      feature: 'RECONCILIATION' as const,
      inputData: r.inputData,
      label: r.label,
      source: 'SEED' as const,
    })),
    skipDuplicates: true,
  });
  console.log(`  ✓ ${reconciliationRecords.length} reconciliation training records created`);

  // ──────────────────────────────────────────────────────────────────
  // 12e. LEADS for Lead Scoring (~60 records, WON + LOST)
  // ──────────────────────────────────────────────────────────────────
  console.log('  → Seeding leads for lead scoring...');
  const sources: LeadSource[] = [
    'WEBSITE',
    'FACEBOOK_ADS',
    'GOOGLE_ADS',
    'REFERRAL',
    'COLD_CALL',
    'OTHER',
  ];
  const leadData: Array<{
    leadName: string;
    companyName: string;
    email: string;
    source: LeadSource;
    status: LeadStatus;
    notes: string;
    daysAgo: number;
  }> = [];

  // 30 WON leads
  const wonCompanies = [
    'Alpha Industries',
    'Beta Corp',
    'Gamma Solutions',
    'Delta Technologies',
    'Epsilon Group',
    'Zeta Innovations',
    'Eta Partners',
    'Theta Systems',
    'Iota Digital',
    'Kappa Ventures',
    'Lambda Networks',
    'Mu Analytics',
    'Nu Consulting',
    'Xi Enterprises',
    'Omicron Labs',
    'Pi Software',
    'Rho Dynamics',
    'Sigma Holdings',
    'Tau Resources',
    'Upsilon Tech',
    'Phi Electronics',
    'Chi Manufacturing',
    'Psi Global',
    'Omega Services',
    'Atlas Corp',
    'Nexus Systems',
    'Prime Logic',
    'Vertex AI',
    'Quantum Labs',
    'Stellar Solutions',
  ];

  for (let i = 0; i < 30; i++) {
    leadData.push({
      leadName: `Contact at ${wonCompanies[i]}`,
      companyName: wonCompanies[i],
      email: `contact@${wonCompanies[i].toLowerCase().replace(/\s/g, '')}.com`,
      source: sources[i % sources.length],
      status: 'WON',
      notes:
        i % 3 === 0
          ? 'Scheduled demo, converted after follow-up'
          : i % 3 === 1
            ? 'Referral lead, quick close'
            : 'Inbound from website, good fit',
      daysAgo: 30 + Math.floor(Math.random() * 330),
    });
  }

  // 30 LOST leads
  const lostCompanies = [
    'Acme Industries',
    'Budget Corp',
    'Cheap Solutions',
    'Discount Tech',
    'Economy Group',
    'Frugal Inc',
    'Ghost Partners',
    'Half Systems',
    'Idle Digital',
    'Jolt Ventures',
    'Keen Networks',
    'Lost Analytics',
    'Mute Consulting',
    'Nope Enterprises',
    'Off Labs',
    'Pass Software',
    'Quiet Dynamics',
    'Reject Holdings',
    'Skip Resources',
    'Try Tech',
    'Undo Electronics',
    'Void Manufacturing',
    'Wait Global',
    'Xero Services',
    'Yield Corp',
    'Zero Systems',
    'Archive Logic',
    'Backup AI',
    'Cache Labs',
    'Debug Solutions',
  ];

  for (let i = 0; i < 30; i++) {
    leadData.push({
      leadName: `Contact at ${lostCompanies[i]}`,
      companyName: lostCompanies[i],
      email: `info@${lostCompanies[i].toLowerCase().replace(/\s/g, '')}.com`,
      source: sources[i % sources.length],
      status: 'LOST',
      notes:
        i % 3 === 0
          ? 'Budget constraints, went with competitor'
          : i % 3 === 1
            ? 'No response after initial contact'
            : 'Not a good fit, too small',
      daysAgo: 30 + Math.floor(Math.random() * 330),
    });
  }

  for (let i = 0; i < leadData.length; i++) {
    const ld = leadData[i];
    const createdDate = new Date(Date.now() - ld.daysAgo * 86400000);
    await prisma.lead.upsert({
      where: { id: `lead-seed-${i.toString().padStart(3, '0')}` },
      update: {},
      create: {
        id: `lead-seed-${i.toString().padStart(3, '0')}`,
        leadName: ld.leadName,
        companyName: ld.companyName,
        email: ld.email,
        source: ld.source,
        status: ld.status,
        notes: ld.notes,
        organizationId: orgId,
        createdAt: createdDate,
        updatedAt: new Date(createdDate.getTime() + Math.random() * 30 * 86400000),
      },
    });
  }
  console.log(`  ✓ ${leadData.length} leads created (30 WON, 30 LOST)`);

  // ──────────────────────────────────────────────────────────────────
  // 12f. EXPENSES for anomaly detection baselines (~60 records)
  // ──────────────────────────────────────────────────────────────────
  console.log('  → Seeding expenses for anomaly detection...');
  const expenseTemplates = [
    {
      accountCode: '6000',
      vendorId: 'vend-003',
      desc: 'Office supplies',
      baseAmount: 150,
      stdDev: 30,
    },
    {
      accountCode: '6100',
      vendorId: 'vend-004',
      desc: 'Utility bill',
      baseAmount: 400,
      stdDev: 50,
    },
    { accountCode: '6200', vendorId: 'vend-005', desc: 'Team meals', baseAmount: 250, stdDev: 80 },
    {
      accountCode: '6300',
      vendorId: 'vend-006',
      desc: 'Travel expense',
      baseAmount: 1500,
      stdDev: 500,
    },
    {
      accountCode: '6400',
      vendorId: 'vend-007',
      desc: 'Marketing spend',
      baseAmount: 3000,
      stdDev: 800,
    },
    { accountCode: '6600', vendorId: 'vend-009', desc: 'Office rent', baseAmount: 8000, stdDev: 0 },
  ];

  let expenseCount = 0;
  for (const tmpl of expenseTemplates) {
    // 8 normal expenses over 8 months
    for (let month = 0; month < 8; month++) {
      const date = new Date();
      date.setMonth(date.getMonth() - month - 1);
      date.setDate(15);

      // Normal amount with small variation
      const amount = Math.max(
        10,
        Math.round((tmpl.baseAmount + (Math.random() - 0.5) * 2 * tmpl.stdDev) * 100) / 100,
      );

      await prisma.expense.upsert({
        where: { id: `exp-seed-${tmpl.accountCode}-${month}` },
        update: {},
        create: {
          id: `exp-seed-${tmpl.accountCode}-${month}`,
          date,
          accountId: accountMap[tmpl.accountCode],
          vendorId: vendMap[tmpl.vendorId],
          amount: new Decimal(amount),
          paidThroughAccountId: accountMap['1010'],
          description: `${tmpl.desc} - ${date.toLocaleString('default', { month: 'short', year: 'numeric' })}`,
          status: 'RECORDED',
          organizationId: orgId,
        },
      });
      expenseCount++;
    }

    // 1-2 outlier expenses (anomalies) for training
    if (tmpl.stdDev > 0) {
      const outlierDate = new Date();
      outlierDate.setMonth(outlierDate.getMonth() - 2);
      outlierDate.setDate(20);

      const outlierAmount = Math.round(tmpl.baseAmount * (2.5 + Math.random()) * 100) / 100;

      await prisma.expense.upsert({
        where: { id: `exp-seed-${tmpl.accountCode}-outlier` },
        update: {},
        create: {
          id: `exp-seed-${tmpl.accountCode}-outlier`,
          date: outlierDate,
          accountId: accountMap[tmpl.accountCode],
          vendorId: vendMap[tmpl.vendorId],
          amount: new Decimal(outlierAmount),
          paidThroughAccountId: accountMap['1010'],
          description: `${tmpl.desc} - LARGE unusual purchase`,
          status: 'RECORDED',
          organizationId: orgId,
        },
      });
      expenseCount++;
    }
  }
  console.log(`  ✓ ${expenseCount} expenses created (with outliers for anomaly detection)`);

  // ──────────────────────────────────────────────────────────────────
  // 12g. INVENTORY MOVEMENTS for demand forecasting (~200+ records)
  // 3 items × 24 months with seasonal patterns
  // ──────────────────────────────────────────────────────────────────
  console.log('  → Seeding inventory movements for demand forecasting...');
  const itemIds = [itemMap['item-001'], itemMap['item-002'], itemMap['item-003']];
  const warehouseId = whMap['wh-001'];

  // Base monthly demand per item + seasonal multipliers
  const itemDemandProfiles = [
    { itemId: itemIds[0], baseDemand: 20, seasonalPeak: 11 }, // item-001: peaks in December (month 11)
    { itemId: itemIds[1], baseDemand: 35, seasonalPeak: 8 }, // item-002: peaks in September (back-to-school)
    { itemId: itemIds[2], baseDemand: 100, seasonalPeak: 11 }, // item-003: peaks in December
  ];

  let movementCount = 0;
  for (const profile of itemDemandProfiles) {
    for (let monthsAgo = 1; monthsAgo <= 24; monthsAgo++) {
      const date = new Date();
      date.setMonth(date.getMonth() - monthsAgo);

      // Seasonal multiplier: 2x in peak month, 1.3x in adjacent months
      const month = date.getMonth();
      let seasonalMultiplier = 1.0;
      if (month === profile.seasonalPeak) {
        seasonalMultiplier = 2.0;
      } else if (
        month === (profile.seasonalPeak + 1) % 12 ||
        month === (profile.seasonalPeak + 11) % 12
      ) {
        seasonalMultiplier = 1.3;
      }

      // Add some random noise (±20%)
      const noise = 0.8 + Math.random() * 0.4;
      const quantity = Math.max(1, Math.round(profile.baseDemand * seasonalMultiplier * noise));

      // Create 3-5 sale movements per month to simulate individual sales
      const salesPerMonth = 3 + Math.floor(Math.random() * 3);
      let remaining = quantity;

      for (let s = 0; s < salesPerMonth && remaining > 0; s++) {
        const saleDate = new Date(date);
        saleDate.setDate(1 + Math.floor(Math.random() * 28));

        const saleQty =
          s === salesPerMonth - 1
            ? remaining
            : Math.max(1, Math.floor((remaining / (salesPerMonth - s)) * (0.5 + Math.random())));

        remaining -= saleQty;

        await prisma.inventoryMovement.create({
          data: {
            itemId: profile.itemId,
            warehouseId,
            quantity: new Decimal(-saleQty),
            type: 'sale',
            movementType: 'OUT',
            referenceType: 'invoice',
            reference: `INV-SEED-${monthsAgo}-${s}`,
            costPerUnit: new Decimal(0),
            organizationId: orgId,
            createdAt: saleDate,
          },
        });
        movementCount++;
      }

      // Also create a purchase movement to replenish (roughly matching demand)
      const purchaseDate = new Date(date);
      purchaseDate.setDate(1);

      await prisma.inventoryMovement.create({
        data: {
          itemId: profile.itemId,
          warehouseId,
          quantity: new Decimal(quantity + Math.floor(Math.random() * 10)),
          type: 'purchase',
          movementType: 'IN',
          referenceType: 'bill',
          reference: `BILL-SEED-${monthsAgo}`,
          costPerUnit: new Decimal(0),
          organizationId: orgId,
          createdAt: purchaseDate,
        },
      });
      movementCount++;
    }
  }
  console.log(`  ✓ ${movementCount} inventory movements created (24 months × 3 items)`);

  // ──────────────────────────────────────────────────────────────────
  // 12h. PAID INVOICES + PAYMENTS for payment prediction (~45 invoices)
  // 15 per customer with varying payment timing
  // ──────────────────────────────────────────────────────────────────
  console.log('  → Seeding paid invoices for payment prediction...');
  const customerIds = [custMap['cust-001'], custMap['cust-002'], custMap['cust-003']];
  const customerNames = ['TechCorp Egypt', 'Global Solutions', 'Retail Plus'];

  // Payment behavior profiles per customer
  const paymentProfiles = [
    { avgDaysToPayment: 25, stdDev: 3 }, // TechCorp: reliable, pays ~25 days
    { avgDaysToPayment: 35, stdDev: 10 }, // Global: somewhat late, variable
    { avgDaysToPayment: 45, stdDev: 15 }, // Retail: often late, very variable
  ];

  let invoiceIdx = 100;
  let paymentIdx = 100;

  for (let c = 0; c < customerIds.length; c++) {
    const custId = customerIds[c];
    const profile = paymentProfiles[c];

    for (let i = 0; i < 15; i++) {
      const invoiceDate = new Date();
      invoiceDate.setMonth(invoiceDate.getMonth() - (15 - i));
      invoiceDate.setDate(1 + Math.floor(Math.random() * 20));

      const dueDate = new Date(invoiceDate);
      dueDate.setDate(dueDate.getDate() + 30);

      const amount = Math.round((500 + Math.random() * 4500) * 100) / 100;
      const invoiceNum = `INV-SEED-${invoiceIdx++}`;
      const invoiceId = `inv-seed-${invoiceNum}`;

      // Payment date: invoice date + avgDays ± stdDev
      const daysToPayment = Math.max(
        5,
        Math.round(profile.avgDaysToPayment + (Math.random() - 0.5) * 2 * profile.stdDev),
      );
      const paymentDate = new Date(invoiceDate);
      paymentDate.setDate(paymentDate.getDate() + daysToPayment);

      // Create PAID invoice
      await prisma.invoice.upsert({
        where: { id: invoiceId },
        update: {},
        create: {
          id: invoiceId,
          invoiceNumber: invoiceNum,
          customerId: custId,
          date: invoiceDate,
          dueDate,
          status: InvoiceStatus.PAID,
          subtotal: new Decimal(amount),
          grandTotal: new Decimal(amount),
          balanceDue: new Decimal(0),
          organizationId: orgId,
        },
      });

      // Create payment
      const paymentId = `pay-seed-${paymentIdx}`;
      const paymentNum = `PAY-SEED-${paymentIdx++}`;

      await prisma.paymentReceived.upsert({
        where: { id: paymentId },
        update: {},
        create: {
          id: paymentId,
          paymentNumber: paymentNum,
          customerId: custId,
          date: paymentDate,
          amount: new Decimal(amount),
          paymentMode: i % 3 === 0 ? 'BANK_TRANSFER' : i % 3 === 1 ? 'CHEQUE' : 'ONLINE',
          depositToAccountId: accountMap['1010'],
          organizationId: orgId,
        },
      });

      // Link payment to invoice
      await prisma.paymentAllocation.upsert({
        where: { id: `pa-seed-${paymentIdx}` },
        update: {},
        create: {
          id: `pa-seed-${paymentIdx}`,
          paymentId,
          invoiceId,
          amount: new Decimal(amount),
        },
      });
    }
  }
  console.log(`  ✓ 45 paid invoices with payments created (15 per customer)`);

  // ──────────────────────────────────────────────────────────────────
  // 12i. OUTSTANDING INVOICES + BILLS for cash flow prediction
  // ──────────────────────────────────────────────────────────────────
  console.log('  → Seeding outstanding invoices and bills for cash flow...');

  // 10 outstanding invoices
  for (let i = 0; i < 10; i++) {
    const date = new Date();
    date.setDate(date.getDate() - (10 + i * 5));

    const dueDate = new Date(date);
    dueDate.setDate(dueDate.getDate() + 30);

    const amount = Math.round((1000 + Math.random() * 9000) * 100) / 100;
    const status = dueDate < new Date() ? InvoiceStatus.OVERDUE : InvoiceStatus.SENT;

    await prisma.invoice.upsert({
      where: { id: `inv-outstanding-${i}` },
      update: {},
      create: {
        id: `inv-outstanding-${i}`,
        invoiceNumber: `INV-OUT-${(200 + i).toString().padStart(3, '0')}`,
        customerId: customerIds[i % 3],
        date,
        dueDate,
        status,
        subtotal: new Decimal(amount),
        grandTotal: new Decimal(amount),
        balanceDue: new Decimal(amount),
        organizationId: orgId,
      },
    });
  }

  // 10 outstanding bills
  for (let i = 0; i < 10; i++) {
    const date = new Date();
    date.setDate(date.getDate() - (5 + i * 4));

    const dueDate = new Date(date);
    dueDate.setDate(dueDate.getDate() + 30);

    const amount = Math.round((500 + Math.random() * 7000) * 100) / 100;
    const status = dueDate < new Date() ? BillStatus.OVERDUE : BillStatus.OPEN;

    await prisma.bill.upsert({
      where: { id: `bill-outstanding-${i}` },
      update: {},
      create: {
        id: `bill-outstanding-${i}`,
        billNumber: `BILL-OUT-${(200 + i).toString().padStart(3, '0')}`,
        vendorId: vendMap[`vend-00${(i % 2) + 1}`],
        date,
        dueDate,
        status,
        subtotal: new Decimal(amount),
        grandTotal: new Decimal(amount),
        balanceDue: new Decimal(amount),
        organizationId: orgId,
      },
    });
  }
  console.log('  ✓ 10 outstanding invoices + 10 outstanding bills created');

  // ──────────────────────────────────────────────────────────────────
  // 12j. RECURRING EXPENSES for pattern detection
  // 4 vendors × 6 months of recurring expenses
  // ──────────────────────────────────────────────────────────────────
  console.log('  → Seeding recurring expenses for pattern detection...');
  const recurringExpenses = [
    { vendorId: 'vend-009', accountCode: '6600', desc: 'Monthly office rent', amount: 8000 },
    { vendorId: 'vend-004', accountCode: '6100', desc: 'Monthly internet service', amount: 350 },
    { vendorId: 'vend-008', accountCode: '6500', desc: 'Monthly insurance premium', amount: 2500 },
    {
      vendorId: 'vend-003',
      accountCode: '6000',
      desc: 'Monthly office supplies subscription',
      amount: 120,
    },
  ];

  let recurringCount = 0;
  for (const re of recurringExpenses) {
    for (let month = 1; month <= 6; month++) {
      const date = new Date();
      date.setMonth(date.getMonth() - month);
      date.setDate(1);

      // Small variation (±2%) to make it realistic
      const variation = 1 + (Math.random() - 0.5) * 0.04;
      const amount = Math.round(re.amount * variation * 100) / 100;

      await prisma.expense.upsert({
        where: { id: `exp-recurring-${re.vendorId}-${month}` },
        update: {},
        create: {
          id: `exp-recurring-${re.vendorId}-${month}`,
          date,
          accountId: accountMap[re.accountCode],
          vendorId: vendMap[re.vendorId],
          amount: new Decimal(amount),
          paidThroughAccountId: accountMap['1010'],
          description: `${re.desc} - ${date.toLocaleString('default', { month: 'short', year: 'numeric' })}`,
          status: 'RECORDED',
          organizationId: orgId,
        },
      });
      recurringCount++;
    }
  }
  console.log(`  ✓ ${recurringCount} recurring expenses created (4 patterns × 6 months)`);

  console.log('\n  ✅ AI training data seeding complete!');
  console.log(`  Summary:`);
  console.log(`    • ${categorizationRecords.length} categorization training records`);
  console.log(`    • ${reconciliationRecords.length} reconciliation training records`);
  console.log(`    • ${leadData.length} leads (30 WON + 30 LOST)`);
  console.log(`    • ${expenseCount} expenses (with anomaly outliers)`);
  console.log(`    • ${movementCount} inventory movements (24 months)`);
  console.log(`    • 45 paid invoices + payments (payment prediction)`);
  console.log(`    • 20 outstanding invoices/bills (cash flow)`);
  console.log(`    • ${recurringCount} recurring expenses (pattern detection)`);
}
