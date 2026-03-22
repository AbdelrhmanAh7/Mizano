/* eslint-disable no-console */
import {
  PrismaClient,
  UserStatus,
  AccountType,
  InvoiceStatus,
  BillStatus,
  ItemType,
  QuoteStatus,
  ExpenseStatus,
  PaymentMode,
  AdjustmentType,
  AdjustmentReason,
  TransferStatus,
  AttendanceStatus,
  PayrollStatus,
  WorkOrderStatus,
  BillingMethod,
  ProjectStatus,
  TimesheetStatus,
  TaskStatus,
  TaskPriority,
  TaxType,
  VATReturnStatus,
  RecurringFrequency,
  RecurringType,
  LeadStatus,
  LeadSource,
  DealStage,
  AuditAction,
  DepreciationMethod,
  AssetStatus,
  AssetType,
  CreditNoteType,
  PriceListType,
  ChallanType,
  ChallanStatus,
  BankAccountType,
  BankTransactionType,
  ReconciliationStatus,
  ActivityType,
  AnomalyType,
  AnomalySeverity,
  ReorderStatus,
  LeadTier,
  PatternStatus,
  SuggestionType,
  SuggestionStatus,
  AlertCategory,
  AlertPriority,
  AlertSource,
  DeepSearchStatus,
  SuggestionCategory,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { Decimal } from '@prisma/client/runtime/library';

const prisma = new PrismaClient();
const DEFAULT_PASSWORD = 'password123';

const d = (v: number) => new Decimal(v);
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);
const daysAhead = (n: number) => new Date(Date.now() + n * 86_400_000);

async function main() {
  console.log('='.repeat(60));
  console.log('Mizano ERP - Full Database Seed');
  console.log('='.repeat(60));

  // ─────────────────────────────────────────────────────────
  // 1. ORGANIZATION
  // ─────────────────────────────────────────────────────────
  console.log('\n1. Organization...');
  const org = await prisma.organization.upsert({
    where: { id: 'seed-org-001' },
    update: {},
    create: {
      id: 'seed-org-001',
      name: 'Mizano Demo Company',
      email: 'demo@mizano.com',
      phone: '+201234567890',
      address: '123 Tahrir Square, Downtown',
      city: 'Cairo',
      country: 'Egypt',
      currency: 'USD',
      taxId: 'TAX-DEMO-2024',
      website: 'https://mizano.com',
      industry: 'technology',
      fiscalYearStartMonth: 1,
      defaultPaymentTermsDays: 30,
      baseCurrency: 'USD',
    },
  });
  const orgId = org.id;
  console.log(`  ✓ ${org.name}`);

  // ─────────────────────────────────────────────────────────
  // 2. ROLES + PERMISSIONS
  // ─────────────────────────────────────────────────────────
  console.log('\n2. Roles & permissions...');
  const roleNames = ['Admin', 'Manager', 'Accountant', 'SalesRep', 'StoreKeeper', 'HR Manager'];
  const roleMap: Record<string, string> = {};
  for (const name of roleNames) {
    const r = await prisma.role.upsert({
      where: { name_organizationId: { name, organizationId: orgId } },
      update: {},
      create: { name, description: name, isDefault: name === 'Admin', organizationId: orgId },
    });
    roleMap[name] = r.id;
  }
  const allModules = [
    'sales',
    'purchases',
    'accounting',
    'inventory',
    'banking',
    'projects',
    'manufacturing',
    'hr',
    'tax',
    'crm',
    'reports',
    'settings',
    'assets',
    'ai',
    'notifications',
  ];
  const allActions = ['view', 'create', 'edit', 'delete', 'export'];
  for (const mod of allModules) {
    await prisma.permission.upsert({
      where: { roleId_module: { roleId: roleMap['Admin'], module: mod } },
      update: { actions: allActions },
      create: { roleId: roleMap['Admin'], module: mod, actions: allActions },
    });
  }
  console.log(`  ✓ ${roleNames.length} roles, ${allModules.length} permissions`);

  // ─────────────────────────────────────────────────────────
  // 3. USERS + PREFERENCES
  // ─────────────────────────────────────────────────────────
  console.log('\n3. Users...');
  const usersData = [
    { id: 'user-admin', email: 'admin@mizano.com', name: 'Admin User', role: 'Admin' },
    { id: 'user-mgr', email: 'manager@mizano.com', name: 'Ahmed Hassan', role: 'Manager' },
    { id: 'user-acc', email: 'accountant@mizano.com', name: 'Sara Khalil', role: 'Accountant' },
    { id: 'user-sales', email: 'sales@mizano.com', name: 'Omar Farouk', role: 'SalesRep' },
    { id: 'user-store', email: 'storekeeper@mizano.com', name: 'Mona Adel', role: 'StoreKeeper' },
    { id: 'user-hr', email: 'hr@mizano.com', name: 'Layla Nasser', role: 'HR Manager' },
  ];
  const hashedPwd = await bcrypt.hash(DEFAULT_PASSWORD, 10);
  const userMap: Record<string, string> = {};
  for (const u of usersData) {
    const user = await prisma.user.upsert({
      where: { email_organizationId: { email: u.email, organizationId: orgId } },
      update: {},
      create: {
        id: u.id,
        email: u.email,
        name: u.name,
        passwordHash: hashedPwd,
        status: UserStatus.ACTIVE,
        roleId: roleMap[u.role],
        organizationId: orgId,
      },
    });
    userMap[u.id] = user.id;
    await prisma.userPreferences.upsert({
      where: { userId: user.id },
      update: {},
      create: {
        userId: user.id,
        theme: 'light',
        sidebarCollapsed: false,
        notificationPrefs: { email: true, inApp: true },
      },
    });
  }
  console.log(`  ✓ ${usersData.length} users`);

  // ─────────────────────────────────────────────────────────
  // 4. CHART OF ACCOUNTS
  // ─────────────────────────────────────────────────────────
  console.log('\n4. Chart of accounts...');
  const accountsData = [
    // Assets
    { code: '1000', name: 'Cash', type: AccountType.ASSET },
    { code: '1010', name: 'Bank Account', type: AccountType.ASSET },
    { code: '1100', name: 'Inventory', type: AccountType.ASSET },
    { code: '1200', name: 'Accounts Receivable', type: AccountType.ASSET },
    { code: '1300', name: 'VAT Receivable', type: AccountType.ASSET },
    { code: '1400', name: 'Prepaid Expenses', type: AccountType.ASSET },
    { code: '1500', name: 'Fixed Assets', type: AccountType.ASSET },
    { code: '1510', name: 'Accumulated Depreciation', type: AccountType.ASSET },
    // Liabilities
    { code: '2000', name: 'Accounts Payable', type: AccountType.LIABILITY },
    { code: '2100', name: 'VAT Payable', type: AccountType.LIABILITY },
    { code: '2200', name: 'Accrued Liabilities', type: AccountType.LIABILITY },
    { code: '2300', name: 'Salaries Payable', type: AccountType.LIABILITY },
    // Equity
    { code: '3000', name: 'Owner Capital', type: AccountType.EQUITY },
    { code: '3100', name: 'Retained Earnings', type: AccountType.EQUITY },
    // Revenue
    { code: '4000', name: 'Sales Revenue', type: AccountType.REVENUE },
    { code: '4100', name: 'Service Revenue', type: AccountType.REVENUE },
    // Expenses
    { code: '5000', name: 'Cost of Goods Sold', type: AccountType.EXPENSE },
    { code: '5100', name: 'Salary Expense', type: AccountType.EXPENSE },
    { code: '5200', name: 'Depreciation Expense', type: AccountType.EXPENSE },
    { code: '5300', name: 'Rent Expense', type: AccountType.EXPENSE },
    { code: '6000', name: 'Office Supplies', type: AccountType.EXPENSE },
    { code: '6100', name: 'Utilities', type: AccountType.EXPENSE },
    { code: '6200', name: 'Meals & Entertainment', type: AccountType.EXPENSE },
    { code: '6300', name: 'Travel', type: AccountType.EXPENSE },
    { code: '6400', name: 'Marketing & Advertising', type: AccountType.EXPENSE },
    { code: '6500', name: 'Insurance', type: AccountType.EXPENSE },
    { code: '6600', name: 'Rent & Lease', type: AccountType.EXPENSE },
    { code: '6700', name: 'Professional Fees', type: AccountType.EXPENSE },
  ];
  const accountMap: Record<string, string> = {};
  for (const a of accountsData) {
    const acc = await prisma.account.upsert({
      where: { code_organizationId: { code: a.code, organizationId: orgId } },
      update: {},
      create: { ...a, organizationId: orgId },
    });
    accountMap[a.code] = acc.id;
  }
  console.log(`  ✓ ${accountsData.length} accounts`);

  // ─────────────────────────────────────────────────────────
  // 5. DOCUMENT SEQUENCES
  // ─────────────────────────────────────────────────────────
  console.log('\n5. Document sequences...');
  const prefixes = [
    { prefix: 'INV', nextNumber: 10 },
    { prefix: 'BILL', nextNumber: 5 },
    { prefix: 'JRN', nextNumber: 5 },
    { prefix: 'QT', nextNumber: 5 },
    { prefix: 'CN', nextNumber: 3 },
    { prefix: 'PMT', nextNumber: 3 },
    { prefix: 'VPMT', nextNumber: 3 },
    { prefix: 'ADJ', nextNumber: 3 },
    { prefix: 'WO', nextNumber: 3 },
    { prefix: 'DC', nextNumber: 3 },
    { prefix: 'VC', nextNumber: 3 },
    { prefix: 'AST', nextNumber: 3 },
    { prefix: 'TRF', nextNumber: 3 },
  ];
  for (const seq of prefixes) {
    await prisma.documentSequence.upsert({
      where: { organizationId_prefix: { organizationId: orgId, prefix: seq.prefix } },
      update: {},
      create: { prefix: seq.prefix, nextNumber: seq.nextNumber, organizationId: orgId },
    });
  }
  console.log(`  ✓ ${prefixes.length} sequences`);

  // ─────────────────────────────────────────────────────────
  // 6. TAX RATES
  // ─────────────────────────────────────────────────────────
  console.log('\n6. Tax rates...');
  const taxRate15 = await prisma.taxRate.upsert({
    where: { id: 'tax-vat-15' },
    update: {},
    create: {
      id: 'tax-vat-15',
      name: 'VAT 15%',
      code: 'VAT15',
      rate: d(15),
      type: TaxType.BOTH,
      isDefault: true,
      linkedAccountId: accountMap['1300'],
      collectAccountId: accountMap['2100'],
      organizationId: orgId,
    },
  });
  await prisma.taxRate.upsert({
    where: { id: 'tax-vat-5' },
    update: {},
    create: {
      id: 'tax-vat-5',
      name: 'VAT 5%',
      code: 'VAT5',
      rate: d(5),
      type: TaxType.SALES,
      linkedAccountId: accountMap['1300'],
      collectAccountId: accountMap['2100'],
      organizationId: orgId,
    },
  });
  console.log('  ✓ 2 tax rates');

  // ─────────────────────────────────────────────────────────
  // 7. EXCHANGE RATES
  // ─────────────────────────────────────────────────────────
  console.log('\n7. Exchange rates...');
  const rateDate = new Date('2026-03-01');
  const rates = [
    { from: 'USD', to: 'EGP', rate: d(48.5) },
    { from: 'USD', to: 'SAR', rate: d(3.75) },
    { from: 'EUR', to: 'USD', rate: d(1.08) },
  ];
  for (const r of rates) {
    await prisma.exchangeRate.upsert({
      where: {
        organizationId_fromCurrency_toCurrency_date: {
          organizationId: orgId,
          fromCurrency: r.from,
          toCurrency: r.to,
          date: rateDate,
        },
      },
      update: {},
      create: {
        fromCurrency: r.from,
        toCurrency: r.to,
        rate: r.rate,
        date: rateDate,
        source: 'MANUAL',
        organizationId: orgId,
      },
    });
  }
  console.log('  ✓ 3 exchange rates');

  // ─────────────────────────────────────────────────────────
  // 8. CUSTOMERS
  // ─────────────────────────────────────────────────────────
  console.log('\n8. Customers...');
  const customersData = [
    {
      id: 'cust-001',
      name: 'Nile Tech Solutions',
      email: 'hello@niletech.eg',
      phone: '+201001234567',
      billingCity: 'Cairo',
      billingCountry: 'Egypt',
      paymentTerms: 30,
    },
    {
      id: 'cust-002',
      name: 'Delta Logistics Egypt',
      email: 'info@delta.eg',
      phone: '+201101234567',
      billingCity: 'Alexandria',
      billingCountry: 'Egypt',
      paymentTerms: 45,
    },
    {
      id: 'cust-003',
      name: 'Cairo Digital Store',
      email: 'contact@cds.eg',
      phone: '+201201234567',
      billingCity: 'Giza',
      billingCountry: 'Egypt',
      paymentTerms: 15,
    },
    {
      id: 'cust-004',
      name: 'Red Sea Trading Co.',
      email: 'sales@redsea.eg',
      phone: '+201301234567',
      billingCity: 'Hurghada',
      billingCountry: 'Egypt',
      paymentTerms: 30,
    },
  ];
  const custMap: Record<string, string> = {};
  for (const c of customersData) {
    const cust = await prisma.customer.upsert({
      where: { id: c.id },
      update: {},
      create: { ...c, organizationId: orgId },
    });
    custMap[c.id] = cust.id;
  }
  console.log(`  ✓ ${customersData.length} customers`);

  // ─────────────────────────────────────────────────────────
  // 9. VENDORS
  // ─────────────────────────────────────────────────────────
  console.log('\n9. Vendors...');
  const vendorsData = [
    {
      id: 'vend-001',
      name: 'Supplier Alpha',
      email: 'sales@alpha.eg',
      phone: '+201001111111',
      billingCity: 'Cairo',
      billingCountry: 'Egypt',
    },
    {
      id: 'vend-002',
      name: 'Supplier Beta',
      email: 'contact@beta.eg',
      phone: '+201101111111',
      billingCity: 'Alexandria',
      billingCountry: 'Egypt',
    },
    {
      id: 'vend-003',
      name: 'Gamma Industrial',
      email: 'info@gamma.eg',
      phone: '+201201111111',
      billingCity: 'Cairo',
      billingCountry: 'Egypt',
    },
  ];
  const vendMap: Record<string, string> = {};
  for (const v of vendorsData) {
    const vend = await prisma.vendor.upsert({
      where: { id: v.id },
      update: {},
      create: { ...v, organizationId: orgId },
    });
    vendMap[v.id] = vend.id;
  }
  console.log(`  ✓ ${vendorsData.length} vendors`);

  // ─────────────────────────────────────────────────────────
  // 10. ITEMS
  // ─────────────────────────────────────────────────────────
  console.log('\n10. Items...');
  const itemsData = [
    {
      id: 'item-001',
      sku: 'ITEM-001',
      name: 'Laptop Pro 15"',
      type: ItemType.GOODS,
      sellingPrice: d(1299.99),
      costPrice: d(900),
      reorderPoint: 5,
      currentStock: 25,
    },
    {
      id: 'item-002',
      sku: 'ITEM-002',
      name: 'Desktop Monitor 24"',
      type: ItemType.GOODS,
      sellingPrice: d(349.99),
      costPrice: d(220),
      reorderPoint: 10,
      currentStock: 40,
    },
    {
      id: 'item-003',
      sku: 'ITEM-003',
      name: 'USB-C Cable',
      type: ItemType.GOODS,
      sellingPrice: d(9.99),
      costPrice: d(3),
      reorderPoint: 50,
      currentStock: 200,
    },
    {
      id: 'item-004',
      sku: 'ITEM-004',
      name: 'Wireless Mouse',
      type: ItemType.GOODS,
      sellingPrice: d(49.99),
      costPrice: d(25),
      reorderPoint: 20,
      currentStock: 80,
    },
    {
      id: 'item-005',
      sku: 'ITEM-005',
      name: 'IT Support Service',
      type: ItemType.SERVICE,
      sellingPrice: d(150),
      costPrice: d(0),
      trackInventory: false,
    },
    {
      id: 'item-006',
      sku: 'ITEM-006',
      name: 'Keyboard Mechanical',
      type: ItemType.GOODS,
      sellingPrice: d(89.99),
      costPrice: d(50),
      reorderPoint: 10,
      currentStock: 35,
    },
  ];
  const itemMap: Record<string, string> = {};
  for (const it of itemsData) {
    const item = await prisma.item.upsert({
      where: { id: it.id },
      update: {},
      create: {
        ...it,
        salesAccountId: accountMap['4000'],
        purchaseAccountId: accountMap['5000'],
        inventoryAccountId: accountMap['1100'],
        organizationId: orgId,
      },
    });
    itemMap[it.id] = item.id;
  }
  console.log(`  ✓ ${itemsData.length} items`);

  // ─────────────────────────────────────────────────────────
  // 11. COMPOSITE ITEM
  // ─────────────────────────────────────────────────────────
  console.log('\n11. Composite items...');
  const ci = await prisma.compositeItem.upsert({
    where: { id: 'ci-001' },
    update: {},
    create: {
      id: 'ci-001',
      name: 'Workstation Bundle',
      sku: 'BUNDLE-001',
      sellingPrice: d(1599.99),
      description: 'Laptop + Monitor + Mouse bundle',
      organizationId: orgId,
    },
  });
  for (const [itemId, qty] of [
    ['item-001', 1],
    ['item-002', 1],
    ['item-004', 1],
  ] as [string, number][]) {
    await prisma.compositeItemComponent.upsert({
      where: { id: `ci-comp-${itemId}` },
      update: {},
      create: {
        id: `ci-comp-${itemId}`,
        compositeItemId: ci.id,
        itemId: itemMap[itemId],
        quantity: qty,
      },
    });
  }
  console.log('  ✓ 1 composite item (3 components)');

  // ─────────────────────────────────────────────────────────
  // 12. PRICE LISTS
  // ─────────────────────────────────────────────────────────
  console.log('\n12. Price lists...');
  const pl = await prisma.priceList.upsert({
    where: { id: 'pl-001' },
    update: {},
    create: {
      id: 'pl-001',
      name: 'VIP Customer Pricing',
      description: '10% discount for VIP customers',
      type: PriceListType.PERCENTAGE,
      adjustment: d(-10),
      organizationId: orgId,
    },
  });
  await prisma.priceListItem.upsert({
    where: { priceListId_itemId: { priceListId: pl.id, itemId: itemMap['item-001'] } },
    update: {},
    create: { priceListId: pl.id, itemId: itemMap['item-001'], customPrice: d(1169.99) },
  });
  await prisma.priceListItem.upsert({
    where: { priceListId_itemId: { priceListId: pl.id, itemId: itemMap['item-002'] } },
    update: {},
    create: { priceListId: pl.id, itemId: itemMap['item-002'], customPrice: d(314.99) },
  });
  console.log('  ✓ 1 price list');

  // ─────────────────────────────────────────────────────────
  // 13. WAREHOUSES
  // ─────────────────────────────────────────────────────────
  console.log('\n13. Warehouses...');
  const warehousesData = [
    {
      id: 'wh-001',
      code: 'WH-MAIN',
      name: 'Main Warehouse',
      street: '10 Industrial Zone',
      city: 'Cairo',
      country: 'Egypt',
      isDefault: true,
    },
    {
      id: 'wh-002',
      code: 'WH-NORTH',
      name: 'North Center',
      street: '55 Alex-Cairo Rd',
      city: 'Alexandria',
      country: 'Egypt',
      isDefault: false,
    },
  ];
  const whMap: Record<string, string> = {};
  for (const wh of warehousesData) {
    const w = await prisma.warehouse.upsert({
      where: { id: wh.id },
      update: {},
      create: { ...wh, organizationId: orgId },
    });
    whMap[wh.id] = w.id;
  }
  console.log('  ✓ 2 warehouses');

  // ─────────────────────────────────────────────────────────
  // 14. INVENTORY LEVELS + COST LAYERS + MOVEMENTS
  // ─────────────────────────────────────────────────────────
  console.log('\n14. Inventory levels, cost layers, movements...');
  const stockItems = [
    { itemId: 'item-001', wh: 'wh-001', qty: 20, cost: d(900) },
    { itemId: 'item-001', wh: 'wh-002', qty: 5, cost: d(900) },
    { itemId: 'item-002', wh: 'wh-001', qty: 35, cost: d(220) },
    { itemId: 'item-002', wh: 'wh-002', qty: 5, cost: d(220) },
    { itemId: 'item-003', wh: 'wh-001', qty: 150, cost: d(3) },
    { itemId: 'item-003', wh: 'wh-002', qty: 50, cost: d(3) },
    { itemId: 'item-004', wh: 'wh-001', qty: 60, cost: d(25) },
    { itemId: 'item-006', wh: 'wh-001', qty: 35, cost: d(50) },
  ];
  for (const s of stockItems) {
    await prisma.inventoryLevel.upsert({
      where: { itemId_warehouseId: { itemId: itemMap[s.itemId], warehouseId: whMap[s.wh] } },
      update: { quantity: s.qty },
      create: {
        itemId: itemMap[s.itemId],
        warehouseId: whMap[s.wh],
        quantity: d(s.qty),
        organizationId: orgId,
      },
    });
    await prisma.inventoryCostLayer.upsert({
      where: { id: `cost-${s.itemId}-${s.wh}` },
      update: {},
      create: {
        id: `cost-${s.itemId}-${s.wh}`,
        itemId: itemMap[s.itemId],
        warehouseId: whMap[s.wh],
        quantity: d(s.qty),
        originalQty: d(s.qty),
        costPerUnit: s.cost,
        referenceType: 'opening',
        organizationId: orgId,
      },
    });
    await prisma.inventoryMovement.upsert({
      where: { id: `mv-opening-${s.itemId}-${s.wh}` },
      update: {},
      create: {
        id: `mv-opening-${s.itemId}-${s.wh}`,
        itemId: itemMap[s.itemId],
        warehouseId: whMap[s.wh],
        quantity: d(s.qty),
        type: 'purchase',
        movementType: 'IN',
        referenceType: 'opening',
        costPerUnit: s.cost,
        organizationId: orgId,
      },
    });
  }
  console.log('  ✓ Inventory levels, cost layers, movements');

  // ─────────────────────────────────────────────────────────
  // 15. INVENTORY ADJUSTMENT
  // ─────────────────────────────────────────────────────────
  console.log('\n15. Inventory adjustments...');
  await prisma.inventoryAdjustment.upsert({
    where: {
      adjustmentNumber_organizationId: { adjustmentNumber: 'ADJ-001', organizationId: orgId },
    },
    update: {},
    create: {
      adjustmentNumber: 'ADJ-001',
      date: daysAgo(10),
      warehouseId: whMap['wh-001'],
      itemId: itemMap['item-003'],
      type: AdjustmentType.DECREASE,
      quantity: 10,
      reason: AdjustmentReason.DAMAGED,
      accountId: accountMap['5000'],
      notes: 'Damaged cables found during stocktake',
      organizationId: orgId,
    },
  });
  console.log('  ✓ 1 adjustment');

  // ─────────────────────────────────────────────────────────
  // 16. INVENTORY TRANSFER
  // ─────────────────────────────────────────────────────────
  console.log('\n16. Inventory transfers...');
  const transfer = await prisma.inventoryTransfer.upsert({
    where: { transferNumber_organizationId: { transferNumber: 'TRF-001', organizationId: orgId } },
    update: {},
    create: {
      transferNumber: 'TRF-001',
      fromWarehouseId: whMap['wh-001'],
      toWarehouseId: whMap['wh-002'],
      date: daysAgo(5),
      status: TransferStatus.COMPLETED,
      notes: 'Replenish north center stock',
      organizationId: orgId,
    },
  });
  await prisma.inventoryTransferLine.upsert({
    where: { id: 'trf-line-001' },
    update: {},
    create: {
      id: 'trf-line-001',
      transferId: transfer.id,
      itemId: itemMap['item-004'],
      quantity: d(10),
    },
  });
  console.log('  ✓ 1 transfer');

  // ─────────────────────────────────────────────────────────
  // 17. BANK ACCOUNTS
  // ─────────────────────────────────────────────────────────
  console.log('\n17. Bank accounts...');
  const bankAccountsData = [
    {
      id: 'bank-001',
      name: 'Business Checking',
      type: BankAccountType.BANK,
      accountNumber: '1234567890',
      linkedAccountId: accountMap['1010'],
      systemBalance: d(50000),
      bankBalance: d(50000),
    },
    {
      id: 'bank-002',
      name: 'Petty Cash',
      type: BankAccountType.PETTY_CASH,
      linkedAccountId: accountMap['1000'],
      systemBalance: d(2000),
      bankBalance: d(2000),
    },
    {
      id: 'bank-003',
      name: 'Business Credit Card',
      type: BankAccountType.CREDIT_CARD,
      accountNumber: '9876543210',
      linkedAccountId: accountMap['1010'],
      systemBalance: d(-3500),
      bankBalance: d(-3500),
    },
  ];
  const bankMap: Record<string, string> = {};
  for (const ba of bankAccountsData) {
    const b = await prisma.bankAccount.upsert({
      where: { id: ba.id },
      update: {},
      create: { ...ba, organizationId: orgId },
    });
    bankMap[ba.id] = b.id;
  }
  console.log('  ✓ 3 bank accounts');

  // ─────────────────────────────────────────────────────────
  // 18. BANK TRANSACTIONS
  // ─────────────────────────────────────────────────────────
  console.log('\n18. Bank transactions...');
  const txns = [
    {
      id: 'btx-001',
      date: daysAgo(25),
      type: BankTransactionType.DEPOSIT,
      amount: d(5000),
      description: 'Client payment - Nile Tech',
      payee: 'Nile Tech Solutions',
    },
    {
      id: 'btx-002',
      date: daysAgo(20),
      type: BankTransactionType.WITHDRAWAL,
      amount: d(2500),
      description: 'Supplier Alpha invoice payment',
      payee: 'Supplier Alpha',
    },
    {
      id: 'btx-003',
      date: daysAgo(15),
      type: BankTransactionType.DEPOSIT,
      amount: d(7500),
      description: 'Delta Logistics payment',
      payee: 'Delta Logistics Egypt',
    },
    {
      id: 'btx-004',
      date: daysAgo(10),
      type: BankTransactionType.WITHDRAWAL,
      amount: d(1200),
      description: 'Office rent payment',
      payee: 'Cairo Real Estate',
    },
    {
      id: 'btx-005',
      date: daysAgo(5),
      type: BankTransactionType.DEPOSIT,
      amount: d(3000),
      description: 'Cairo Digital Store payment',
      payee: 'Cairo Digital Store',
    },
    {
      id: 'btx-006',
      date: daysAgo(3),
      type: BankTransactionType.WITHDRAWAL,
      amount: d(800),
      description: 'Utility bill payment',
      payee: 'Egypt Electric',
    },
  ];
  for (const tx of txns) {
    await prisma.bankTransaction.upsert({
      where: { id: tx.id },
      update: {},
      create: {
        ...tx,
        bankAccountId: bankMap['bank-001'],
        status: ReconciliationStatus.PENDING,
        organizationId: orgId,
      },
    });
  }
  console.log(`  ✓ ${txns.length} bank transactions`);

  // ─────────────────────────────────────────────────────────
  // 19. BANK RULES
  // ─────────────────────────────────────────────────────────
  console.log('\n19. Bank rules...');
  await prisma.bankRule.upsert({
    where: { id: 'rule-001' },
    update: {},
    create: {
      id: 'rule-001',
      name: 'Match Nile Tech deposits',
      bankAccountId: bankMap['bank-001'],
      conditions: [{ field: 'payee', operator: 'contains', value: 'Nile Tech' }],
      action: {
        type: 'categorize',
        accountId: accountMap['4000'],
        entityType: 'customer',
        entityId: custMap['cust-001'],
      },
      organizationId: orgId,
    },
  });
  await prisma.bankRule.upsert({
    where: { id: 'rule-002' },
    update: {},
    create: {
      id: 'rule-002',
      name: 'Rent payments',
      conditions: [{ field: 'description', operator: 'contains', value: 'rent' }],
      action: { type: 'categorize', accountId: accountMap['6600'] },
      organizationId: orgId,
    },
  });
  console.log('  ✓ 2 bank rules');

  // ─────────────────────────────────────────────────────────
  // 20. RECONCILIATION
  // ─────────────────────────────────────────────────────────
  console.log('\n20. Reconciliation...');
  await prisma.reconciliation.upsert({
    where: { id: 'recon-001' },
    update: {},
    create: {
      id: 'recon-001',
      bankAccountId: bankMap['bank-001'],
      reconciliationDate: daysAgo(1),
      statementDate: daysAgo(1),
      statementBalance: d(51000),
      systemBalance: d(50000),
      reconciledBalance: d(50000),
      difference: d(1000),
      isCompleted: false,
      organizationId: orgId,
    },
  });
  await prisma.reconciliationPattern.upsert({
    where: {
      organizationId_descriptionHash: { organizationId: orgId, descriptionHash: 'nile-tech-hash' },
    },
    update: {},
    create: {
      descriptionHash: 'nile-tech-hash',
      pattern: 'nile tech',
      matchedEntity: 'customer',
      matchedEntityId: custMap['cust-001'],
      accountId: accountMap['4000'],
      confidence: d(95),
      matchCount: 5,
      organizationId: orgId,
    },
  });
  console.log('  ✓ 1 reconciliation, 1 pattern');

  // ─────────────────────────────────────────────────────────
  // 22. QUOTES
  // ─────────────────────────────────────────────────────────
  console.log('\n22. Quotes...');
  const quote1 = await prisma.quote.upsert({
    where: { quoteNumber_organizationId: { quoteNumber: 'QT-001', organizationId: orgId } },
    update: {},
    create: {
      id: 'quote-001',
      quoteNumber: 'QT-001',
      customerId: custMap['cust-001'],
      date: daysAgo(45),
      expiryDate: daysAgo(15),
      status: QuoteStatus.INVOICED,
      subtotal: d(1299.99),
      grandTotal: d(1299.99),
      organizationId: orgId,
    },
  });
  const quote2 = await prisma.quote.upsert({
    where: { quoteNumber_organizationId: { quoteNumber: 'QT-002', organizationId: orgId } },
    update: {},
    create: {
      id: 'quote-002',
      quoteNumber: 'QT-002',
      customerId: custMap['cust-003'],
      date: daysAgo(10),
      expiryDate: daysAhead(20),
      status: QuoteStatus.SENT,
      subtotal: d(449.97),
      grandTotal: d(449.97),
      organizationId: orgId,
    },
  });
  await prisma.quoteLine.upsert({
    where: { id: 'ql-001' },
    update: {},
    create: {
      id: 'ql-001',
      quoteId: quote1.id,
      itemId: itemMap['item-001'],
      description: 'Laptop Pro 15"',
      quantity: d(1),
      rate: d(1299.99),
      amount: d(1299.99),
    },
  });
  await prisma.quoteLine.upsert({
    where: { id: 'ql-002' },
    update: {},
    create: {
      id: 'ql-002',
      quoteId: quote2.id,
      itemId: itemMap['item-002'],
      description: 'Desktop Monitor 24"',
      quantity: d(1),
      rate: d(349.99),
      amount: d(349.99),
    },
  });
  await prisma.quoteLine.upsert({
    where: { id: 'ql-003' },
    update: {},
    create: {
      id: 'ql-003',
      quoteId: quote2.id,
      itemId: itemMap['item-003'],
      description: 'USB-C Cable x10',
      quantity: d(10),
      rate: d(9.99),
      amount: d(99.9),
    },
  });
  console.log('  ✓ 2 quotes');

  // ─────────────────────────────────────────────────────────
  // 23. INVOICES
  // ─────────────────────────────────────────────────────────
  console.log('\n23. Invoices...');
  const invoicesData = [
    {
      id: 'inv-INV-001',
      num: 'INV-001',
      cust: 'cust-001',
      daysAgoDate: 30,
      daysAgoDue: 0,
      status: InvoiceStatus.PAID,
      total: d(1299.99),
    },
    {
      id: 'inv-INV-002',
      num: 'INV-002',
      cust: 'cust-002',
      daysAgoDate: 20,
      daysAgoDue: 10,
      status: InvoiceStatus.PARTIALLY_PAID,
      total: d(699.98),
    },
    {
      id: 'inv-INV-003',
      num: 'INV-003',
      cust: 'cust-003',
      daysAgoDate: 10,
      daysAgoDue: -20,
      status: InvoiceStatus.SENT,
      total: d(449.97),
    },
    {
      id: 'inv-INV-004',
      num: 'INV-004',
      cust: 'cust-004',
      daysAgoDate: 60,
      daysAgoDue: 30,
      status: InvoiceStatus.OVERDUE,
      total: d(2599.98),
    },
    {
      id: 'inv-INV-005',
      num: 'INV-005',
      cust: 'cust-001',
      daysAgoDate: 5,
      daysAgoDue: -25,
      status: InvoiceStatus.DRAFT,
      total: d(149.99),
    },
  ];
  const invMap: Record<string, string> = {};
  for (const inv of invoicesData) {
    const i = await prisma.invoice.upsert({
      where: { id: inv.id },
      update: {},
      create: {
        id: inv.id,
        invoiceNumber: inv.num,
        customerId: custMap[inv.cust],
        date: daysAgo(inv.daysAgoDate),
        dueDate: daysAhead(-inv.daysAgoDue),
        status: inv.status,
        subtotal: inv.total,
        grandTotal: inv.total,
        balanceDue: inv.status === InvoiceStatus.PAID ? d(0) : inv.total,
        organizationId: orgId,
      },
    });
    invMap[inv.id] = i.id;
  }
  const invoiceLines = [
    {
      id: 'il-001',
      invoiceId: 'inv-INV-001',
      itemId: 'item-001',
      desc: 'Laptop Pro 15"',
      qty: d(1),
      rate: d(1299.99),
      amt: d(1299.99),
    },
    {
      id: 'il-002',
      invoiceId: 'inv-INV-002',
      itemId: 'item-002',
      desc: 'Desktop Monitor x2',
      qty: d(2),
      rate: d(349.99),
      amt: d(699.98),
    },
    {
      id: 'il-003',
      invoiceId: 'inv-INV-003',
      itemId: 'item-002',
      desc: 'Desktop Monitor',
      qty: d(1),
      rate: d(349.99),
      amt: d(349.99),
    },
    {
      id: 'il-004',
      invoiceId: 'inv-INV-003',
      itemId: 'item-003',
      desc: 'USB-C Cable x10',
      qty: d(10),
      rate: d(9.99),
      amt: d(99.9),
    },
    {
      id: 'il-005',
      invoiceId: 'inv-INV-004',
      itemId: 'item-001',
      desc: 'Laptop Pro x2',
      qty: d(2),
      rate: d(1299.99),
      amt: d(2599.98),
    },
    {
      id: 'il-006',
      invoiceId: 'inv-INV-005',
      itemId: 'item-005',
      desc: 'IT Support 1hr',
      qty: d(1),
      rate: d(149.99),
      amt: d(149.99),
    },
  ];
  for (const il of invoiceLines) {
    await prisma.invoiceLine.upsert({
      where: { id: il.id },
      update: {},
      create: {
        id: il.id,
        invoiceId: invMap[il.invoiceId],
        itemId: itemMap[il.itemId],
        description: il.desc,
        quantity: il.qty,
        rate: il.rate,
        amount: il.amt,
      },
    });
  }
  console.log(`  ✓ ${invoicesData.length} invoices`);

  // ─────────────────────────────────────────────────────────
  // 24. PAYMENTS RECEIVED
  // ─────────────────────────────────────────────────────────
  console.log('\n24. Payments received...');
  const pmt1 = await prisma.paymentReceived.upsert({
    where: { paymentNumber_organizationId: { paymentNumber: 'PMT-001', organizationId: orgId } },
    update: {},
    create: {
      id: 'pmt-001',
      paymentNumber: 'PMT-001',
      customerId: custMap['cust-001'],
      date: daysAgo(28),
      amount: d(1299.99),
      paymentMode: PaymentMode.BANK_TRANSFER,
      depositToAccountId: accountMap['1010'],
      reference: 'TXN-0001',
      organizationId: orgId,
    },
  });
  await prisma.paymentAllocation.upsert({
    where: { id: 'pa-001' },
    update: {},
    create: {
      id: 'pa-001',
      paymentId: pmt1.id,
      invoiceId: invMap['inv-INV-001'],
      amount: d(1299.99),
    },
  });
  const pmt2 = await prisma.paymentReceived.upsert({
    where: { paymentNumber_organizationId: { paymentNumber: 'PMT-002', organizationId: orgId } },
    update: {},
    create: {
      id: 'pmt-002',
      paymentNumber: 'PMT-002',
      customerId: custMap['cust-002'],
      date: daysAgo(15),
      amount: d(350),
      paymentMode: PaymentMode.CHEQUE,
      depositToAccountId: accountMap['1010'],
      organizationId: orgId,
    },
  });
  await prisma.paymentAllocation.upsert({
    where: { id: 'pa-002' },
    update: {},
    create: { id: 'pa-002', paymentId: pmt2.id, invoiceId: invMap['inv-INV-002'], amount: d(350) },
  });
  console.log('  ✓ 2 payments received');

  // ─────────────────────────────────────────────────────────
  // 25. CREDIT NOTES
  // ─────────────────────────────────────────────────────────
  console.log('\n25. Credit notes...');
  await prisma.creditNote.upsert({
    where: {
      creditNoteNumber_organizationId: { creditNoteNumber: 'CN-001', organizationId: orgId },
    },
    update: {},
    create: {
      id: 'cn-001',
      creditNoteNumber: 'CN-001',
      customerId: custMap['cust-002'],
      invoiceId: invMap['inv-INV-002'],
      date: daysAgo(12),
      reason: 'Defective item returned',
      amount: d(349.99),
      type: CreditNoteType.REFUND,
      organizationId: orgId,
    },
  });
  console.log('  ✓ 1 credit note');

  // ─────────────────────────────────────────────────────────
  // 26. DELIVERY CHALLANS
  // ─────────────────────────────────────────────────────────
  console.log('\n26. Delivery challans...');
  const challan = await prisma.deliveryChallan.upsert({
    where: { organizationId_challanNumber: { organizationId: orgId, challanNumber: 'DC-001' } },
    update: {},
    create: {
      challanNumber: 'DC-001',
      customerId: custMap['cust-001'],
      invoiceId: invMap['inv-INV-001'],
      challanType: ChallanType.SUPPLY,
      date: daysAgo(29),
      status: ChallanStatus.ISSUED,
      organizationId: orgId,
    },
  });
  await prisma.deliveryChallanLine.upsert({
    where: { id: 'dcl-001' },
    update: {},
    create: {
      id: 'dcl-001',
      challanId: challan.id,
      itemId: itemMap['item-001'],
      quantity: d(1),
      description: 'Laptop Pro 15"',
      warehouseId: whMap['wh-001'],
    },
  });
  console.log('  ✓ 1 delivery challan');

  // ─────────────────────────────────────────────────────────
  // 27. EXPENSES
  // ─────────────────────────────────────────────────────────
  console.log('\n27. Expenses...');
  const expensesData = [
    {
      id: 'exp-001',
      date: daysAgo(20),
      accountId: '6600',
      amount: d(1500),
      desc: 'Office rent - March 2026',
      vendorId: 'vend-003',
    },
    {
      id: 'exp-002',
      date: daysAgo(18),
      accountId: '6100',
      amount: d(350),
      desc: 'Electricity bill',
      vendorId: 'vend-003',
    },
    {
      id: 'exp-003',
      date: daysAgo(15),
      accountId: '6300',
      amount: d(800),
      desc: 'Team travel - Alexandria visit',
    },
    {
      id: 'exp-004',
      date: daysAgo(10),
      accountId: '6000',
      amount: d(200),
      desc: 'Office supplies purchase',
    },
    {
      id: 'exp-005',
      date: daysAgo(7),
      accountId: '6400',
      amount: d(1200),
      desc: 'Google Ads campaign',
    },
  ];
  for (const exp of expensesData) {
    await prisma.expense.upsert({
      where: { id: exp.id },
      update: {},
      create: {
        id: exp.id,
        date: exp.date,
        accountId: accountMap[exp.accountId],
        vendorId: exp.vendorId ? vendMap[exp.vendorId] : undefined,
        amount: exp.amount,
        paidThroughAccountId: accountMap['1010'],
        description: exp.desc,
        status: ExpenseStatus.RECORDED,
        organizationId: orgId,
      },
    });
  }
  console.log(`  ✓ ${expensesData.length} expenses`);

  // ─────────────────────────────────────────────────────────
  // 28. BILLS
  // ─────────────────────────────────────────────────────────
  console.log('\n28. Bills...');
  const billsData = [
    {
      id: 'bill-BILL-001',
      num: 'BILL-001',
      vend: 'vend-001',
      daysAgo: 25,
      status: BillStatus.PAID,
      total: d(5000),
    },
    {
      id: 'bill-BILL-002',
      num: 'BILL-002',
      vend: 'vend-002',
      daysAgo: 15,
      status: BillStatus.OPEN,
      total: d(3500),
    },
    {
      id: 'bill-BILL-003',
      num: 'BILL-003',
      vend: 'vend-001',
      daysAgo: 45,
      status: BillStatus.OVERDUE,
      total: d(8000),
    },
  ];
  const billMap: Record<string, string> = {};
  for (const b of billsData) {
    const bill = await prisma.bill.upsert({
      where: { id: b.id },
      update: {},
      create: {
        id: b.id,
        billNumber: b.num,
        vendorId: vendMap[b.vend],
        date: daysAgo(b.daysAgo),
        dueDate: daysAhead(30 - b.daysAgo),
        status: b.status,
        subtotal: b.total,
        grandTotal: b.total,
        balanceDue: b.status === BillStatus.PAID ? d(0) : b.total,
        organizationId: orgId,
      },
    });
    billMap[b.id] = bill.id;
  }
  const billLines = [
    {
      id: 'bl-001',
      billId: 'bill-BILL-001',
      desc: 'Laptop inventory restock x5',
      qty: d(5),
      rate: d(900),
      amt: d(4500),
      accountId: '5000',
    },
    {
      id: 'bl-002',
      billId: 'bill-BILL-001',
      desc: 'Shipping & handling',
      qty: d(1),
      rate: d(500),
      amt: d(500),
      accountId: '6300',
    },
    {
      id: 'bl-003',
      billId: 'bill-BILL-002',
      desc: 'Monitor restock x10',
      qty: d(10),
      rate: d(220),
      amt: d(2200),
      accountId: '5000',
    },
    {
      id: 'bl-004',
      billId: 'bill-BILL-002',
      desc: 'USB Cables x300',
      qty: d(300),
      rate: d(4.33),
      amt: d(1300),
      accountId: '5000',
    },
    {
      id: 'bl-005',
      billId: 'bill-BILL-003',
      desc: 'Laptop inventory batch x8',
      qty: d(8),
      rate: d(900),
      amt: d(7200),
      accountId: '5000',
    },
    {
      id: 'bl-006',
      billId: 'bill-BILL-003',
      desc: 'Freight costs',
      qty: d(1),
      rate: d(800),
      amt: d(800),
      accountId: '6300',
    },
  ];
  for (const bl of billLines) {
    await prisma.billLine.upsert({
      where: { id: bl.id },
      update: {},
      create: {
        id: bl.id,
        billId: billMap[bl.billId],
        description: bl.desc,
        quantity: bl.qty,
        rate: bl.rate,
        amount: bl.amt,
        accountId: accountMap[bl.accountId],
      },
    });
  }
  console.log(`  ✓ ${billsData.length} bills`);

  // ─────────────────────────────────────────────────────────
  // 29. VENDOR CREDITS
  // ─────────────────────────────────────────────────────────
  console.log('\n29. Vendor credits...');
  await prisma.vendorCredit.upsert({
    where: { creditNumber_organizationId: { creditNumber: 'VC-001', organizationId: orgId } },
    update: {},
    create: {
      id: 'vc-001',
      creditNumber: 'VC-001',
      vendorId: vendMap['vend-001'],
      billId: billMap['bill-BILL-001'],
      date: daysAgo(22),
      reason: '2 defective units returned to supplier',
      amount: d(1800),
      organizationId: orgId,
    },
  });
  console.log('  ✓ 1 vendor credit');

  // ─────────────────────────────────────────────────────────
  // 30. PAYMENTS MADE
  // ─────────────────────────────────────────────────────────
  console.log('\n30. Payments made...');
  const vpmt1 = await prisma.paymentMade.upsert({
    where: { paymentNumber_organizationId: { paymentNumber: 'VPMT-001', organizationId: orgId } },
    update: {},
    create: {
      id: 'vpmt-001',
      paymentNumber: 'VPMT-001',
      vendorId: vendMap['vend-001'],
      date: daysAgo(23),
      amount: d(5000),
      paymentMode: PaymentMode.BANK_TRANSFER,
      paidFromAccountId: accountMap['1010'],
      reference: 'TXN-VPMT-001',
      organizationId: orgId,
    },
  });
  await prisma.billAllocation.upsert({
    where: { id: 'ba-001' },
    update: {},
    create: {
      id: 'ba-001',
      paymentId: vpmt1.id,
      billId: billMap['bill-BILL-001'],
      amount: d(5000),
    },
  });
  console.log('  ✓ 1 payment made');

  // ─────────────────────────────────────────────────────────
  // 31. JOURNALS
  // ─────────────────────────────────────────────────────────
  console.log('\n31. Journals...');
  const jrnl1 = await prisma.journal.upsert({
    where: { journalNumber_organizationId: { journalNumber: 'JRN-001', organizationId: orgId } },
    update: {},
    create: {
      id: 'jrn-001',
      journalNumber: 'JRN-001',
      date: daysAgo(30),
      reference: 'Opening balance entry',
      notes: 'Initial capital injection',
      isPosted: true,
      organizationId: orgId,
    },
  });
  await prisma.journalLine.upsert({
    where: { id: 'jl-001' },
    update: {},
    create: {
      id: 'jl-001',
      journalId: jrnl1.id,
      accountId: accountMap['1010'],
      debit: d(100000),
      credit: d(0),
      description: 'Opening bank balance',
    },
  });
  await prisma.journalLine.upsert({
    where: { id: 'jl-002' },
    update: {},
    create: {
      id: 'jl-002',
      journalId: jrnl1.id,
      accountId: accountMap['3000'],
      debit: d(0),
      credit: d(100000),
      description: 'Owner capital',
    },
  });

  const jrnl2 = await prisma.journal.upsert({
    where: { journalNumber_organizationId: { journalNumber: 'JRN-002', organizationId: orgId } },
    update: {},
    create: {
      id: 'jrn-002',
      journalNumber: 'JRN-002',
      date: daysAgo(15),
      reference: 'Rent payment March',
      notes: 'Monthly office rent',
      isPosted: true,
      organizationId: orgId,
    },
  });
  await prisma.journalLine.upsert({
    where: { id: 'jl-003' },
    update: {},
    create: {
      id: 'jl-003',
      journalId: jrnl2.id,
      accountId: accountMap['5300'],
      debit: d(1500),
      credit: d(0),
      description: 'Office rent expense',
    },
  });
  await prisma.journalLine.upsert({
    where: { id: 'jl-004' },
    update: {},
    create: {
      id: 'jl-004',
      journalId: jrnl2.id,
      accountId: accountMap['1010'],
      debit: d(0),
      credit: d(1500),
      description: 'Paid via bank',
    },
  });

  const jrnl3 = await prisma.journal.upsert({
    where: { journalNumber_organizationId: { journalNumber: 'JRN-003', organizationId: orgId } },
    update: {},
    create: {
      id: 'jrn-003',
      journalNumber: 'JRN-003',
      date: daysAgo(5),
      reference: 'Depreciation entry',
      notes: 'Monthly fixed asset depreciation',
      isPosted: true,
      organizationId: orgId,
    },
  });
  await prisma.journalLine.upsert({
    where: { id: 'jl-005' },
    update: {},
    create: {
      id: 'jl-005',
      journalId: jrnl3.id,
      accountId: accountMap['5200'],
      debit: d(500),
      credit: d(0),
      description: 'Depreciation expense',
    },
  });
  await prisma.journalLine.upsert({
    where: { id: 'jl-006' },
    update: {},
    create: {
      id: 'jl-006',
      journalId: jrnl3.id,
      accountId: accountMap['1510'],
      debit: d(0),
      credit: d(500),
      description: 'Accumulated depreciation',
    },
  });
  console.log('  ✓ 3 journals');

  // ─────────────────────────────────────────────────────────
  // 32. RECURRING PROFILE
  // ─────────────────────────────────────────────────────────
  console.log('\n32. Recurring profiles...');
  const rp = await prisma.recurringProfile.upsert({
    where: { id: 'rp-001' },
    update: {},
    create: {
      id: 'rp-001',
      name: 'Monthly Rent Journal',
      type: RecurringType.JOURNAL,
      frequency: RecurringFrequency.MONTHLY,
      startDate: new Date('2026-01-01'),
      nextRunDate: new Date('2026-04-01'),
      isActive: true,
      autoPost: false,
      templateData: {
        lines: [
          { accountCode: '5300', debit: 1500, credit: 0, description: 'Monthly rent' },
          { accountCode: '1010', debit: 0, credit: 1500, description: 'Bank payment' },
        ],
      },
      entityType: 'journal',
      executionCount: 2,
      lastExecutedAt: daysAgo(15),
      organizationId: orgId,
    },
  });
  await prisma.recurringExecution.upsert({
    where: { id: 're-001' },
    update: {},
    create: {
      id: 're-001',
      profileId: rp.id,
      createdEntityType: 'journal',
      createdEntityId: jrnl2.id,
      status: 'success',
      organizationId: orgId,
    },
  });
  console.log('  ✓ 1 recurring profile');

  // ─────────────────────────────────────────────────────────
  // 33. EMPLOYEES
  // ─────────────────────────────────────────────────────────
  console.log('\n33. Employees...');
  const employeesData = [
    {
      id: 'emp-001',
      employeeId: 'EMP-001',
      name: 'Khaled Mostafa',
      email: 'khaled@mizano.com',
      department: 'Engineering',
      jobTitle: 'Senior Developer',
      basicSalary: d(8000),
    },
    {
      id: 'emp-002',
      employeeId: 'EMP-002',
      name: 'Dina Samir',
      email: 'dina@mizano.com',
      department: 'Sales',
      jobTitle: 'Sales Manager',
      basicSalary: d(6500),
    },
    {
      id: 'emp-003',
      employeeId: 'EMP-003',
      name: 'Youssef Ali',
      email: 'youssef@mizano.com',
      department: 'Finance',
      jobTitle: 'Accountant',
      basicSalary: d(5500),
    },
    {
      id: 'emp-004',
      employeeId: 'EMP-004',
      name: 'Nadia Ibrahim',
      email: 'nadia@mizano.com',
      department: 'HR',
      jobTitle: 'HR Specialist',
      basicSalary: d(5000),
    },
  ];
  const empMap: Record<string, string> = {};
  for (const e of employeesData) {
    const emp = await prisma.employee.upsert({
      where: { employeeId_organizationId: { employeeId: e.employeeId, organizationId: orgId } },
      update: {},
      create: {
        ...e,
        dateOfJoining: new Date('2024-01-01'),
        allowances: { housing: 1000, transport: 500 },
        deductions: { insurance: 100 },
        organizationId: orgId,
      },
    });
    empMap[e.id] = emp.id;
  }
  console.log(`  ✓ ${employeesData.length} employees`);

  // ─────────────────────────────────────────────────────────
  // 34. ATTENDANCE
  // ─────────────────────────────────────────────────────────
  console.log('\n34. Attendance records...');
  const attRecords = [];
  for (let day = 7; day >= 1; day--) {
    for (const empId of ['emp-001', 'emp-002', 'emp-003']) {
      const date = daysAgo(day);
      const isWeekend = date.getDay() === 5 || date.getDay() === 6;
      if (!isWeekend) {
        attRecords.push({
          id: `att-${empId}-${day}`,
          employeeId: empMap[empId],
          date,
          status: AttendanceStatus.PRESENT,
          checkIn: new Date(date.getFullYear(), date.getMonth(), date.getDate(), 9, 0),
          checkOut: new Date(date.getFullYear(), date.getMonth(), date.getDate(), 17, 30),
          organizationId: orgId,
        });
      }
    }
  }
  for (const att of attRecords) {
    await prisma.attendance.upsert({
      where: { employeeId_date: { employeeId: att.employeeId, date: att.date } },
      update: {},
      create: att,
    });
  }
  console.log(`  ✓ ${attRecords.length} attendance records`);

  // ─────────────────────────────────────────────────────────
  // 35. PAYROLL RUN + PAYSLIPS
  // ─────────────────────────────────────────────────────────
  console.log('\n35. Payroll run...');
  const payroll = await prisma.payrollRun.upsert({
    where: { month_year_organizationId: { month: 2, year: 2026, organizationId: orgId } },
    update: {},
    create: {
      id: 'payroll-feb-2026',
      month: 2,
      year: 2026,
      periodStart: new Date('2026-02-01'),
      periodEnd: new Date('2026-02-28'),
      payDate: new Date('2026-02-28'),
      status: PayrollStatus.PAID,
      paidAt: new Date('2026-02-28'),
      totalGross: d(25000),
      totalDeductions: d(1600),
      totalNet: d(23400),
      organizationId: orgId,
    },
  });
  const payslipsData = [
    {
      empId: 'emp-001',
      basic: d(8000),
      gross: d(9500),
      deduct: d(600),
      net: d(8900),
      housing: d(1000),
      transport: d(500),
    },
    {
      empId: 'emp-002',
      basic: d(6500),
      gross: d(8000),
      deduct: d(500),
      net: d(7500),
      housing: d(1000),
      transport: d(500),
    },
    {
      empId: 'emp-003',
      basic: d(5500),
      gross: d(7000),
      deduct: d(500),
      net: d(6500),
      housing: d(1000),
      transport: d(500),
    },
  ];
  for (const ps of payslipsData) {
    await prisma.payslip.upsert({
      where: {
        payrollRunId_employeeId: { payrollRunId: payroll.id, employeeId: empMap[ps.empId] },
      },
      update: {},
      create: {
        payrollRunId: payroll.id,
        employeeId: empMap[ps.empId],
        basicSalary: ps.basic,
        allowances: { housing: ps.housing.toNumber(), transport: ps.transport.toNumber() },
        housingAllowance: ps.housing,
        transportAllowance: ps.transport,
        grossSalary: ps.gross,
        lop: d(0),
        deductions: { insurance: ps.deduct.toNumber() },
        gosiEmployee: ps.deduct,
        totalDeductions: ps.deduct,
        taxes: d(0),
        netSalary: ps.net,
      },
    });
  }
  console.log('  ✓ 1 payroll run, 3 payslips');

  // ─────────────────────────────────────────────────────────
  // 36. BOMs + WORK ORDERS
  // ─────────────────────────────────────────────────────────
  console.log('\n36. BOMs & work orders...');
  const bom = await prisma.bOM.upsert({
    where: { id: 'bom-001' },
    update: {},
    create: {
      id: 'bom-001',
      name: 'Workstation Assembly BOM',
      outputItemId: itemMap['item-001'],
      outputQuantity: 1,
      operationsCost: d(50),
      organizationId: orgId,
    },
  });
  await prisma.bOMItem.upsert({
    where: { bomId_itemId: { bomId: bom.id, itemId: itemMap['item-002'] } },
    update: {},
    create: { bomId: bom.id, itemId: itemMap['item-002'], quantity: d(1) },
  });
  await prisma.bOMItem.upsert({
    where: { bomId_itemId: { bomId: bom.id, itemId: itemMap['item-004'] } },
    update: {},
    create: { bomId: bom.id, itemId: itemMap['item-004'], quantity: d(1) },
  });
  const wo = await prisma.workOrder.upsert({
    where: { workOrderNumber_organizationId: { workOrderNumber: 'WO-001', organizationId: orgId } },
    update: {},
    create: {
      id: 'wo-001',
      workOrderNumber: 'WO-001',
      bomId: bom.id,
      quantity: 5,
      status: WorkOrderStatus.IN_PROCESS,
      plannedStartDate: daysAgo(7),
      actualStartDate: daysAgo(6),
      notes: 'Workstation batch for Q1 orders',
      organizationId: orgId,
    },
  });
  await prisma.productionEntry.upsert({
    where: { id: 'pe-001' },
    update: {},
    create: {
      id: 'pe-001',
      workOrderId: wo.id,
      date: daysAgo(3),
      quantityProduced: 3,
      quantityRejected: 0,
      wastageQuantity: 0,
      notes: 'First batch completed',
      createdById: userMap['user-store'],
      organizationId: orgId,
    },
  });
  console.log('  ✓ 1 BOM, 1 work order, 1 production entry');

  // ─────────────────────────────────────────────────────────
  // 37. PROJECTS + TASKS + TIMESHEETS
  // ─────────────────────────────────────────────────────────
  console.log('\n37. Projects, tasks, timesheets...');
  const proj1 = await prisma.project.upsert({
    where: { id: 'proj-001' },
    update: {},
    create: {
      id: 'proj-001',
      name: 'Nile Tech ERP Implementation',
      projectNumber: 'PRJ-001',
      customerId: custMap['cust-001'],
      billingMethod: BillingMethod.HOURLY,
      budgetAmount: d(50000),
      hourlyRate: d(150),
      status: ProjectStatus.ACTIVE,
      startDate: new Date('2026-01-01'),
      endDate: new Date('2026-06-30'),
      description: 'Full ERP system implementation for Nile Tech',
      color: '#3B82F6',
      organizationId: orgId,
    },
  });
  const proj2 = await prisma.project.upsert({
    where: { id: 'proj-002' },
    update: {},
    create: {
      id: 'proj-002',
      name: 'Delta Logistics Mobile App',
      projectNumber: 'PRJ-002',
      customerId: custMap['cust-002'],
      billingMethod: BillingMethod.FIXED,
      budgetAmount: d(30000),
      fixedPrice: d(28000),
      status: ProjectStatus.PLANNING,
      startDate: new Date('2026-03-01'),
      description: 'Mobile app development for delivery tracking',
      color: '#10B981',
      organizationId: orgId,
    },
  });
  const task1 = await prisma.task.upsert({
    where: { id: 'task-001' },
    update: {},
    create: {
      id: 'task-001',
      name: 'Requirements Analysis',
      projectId: proj1.id,
      ratePerHour: d(150),
      isBillable: true,
      status: TaskStatus.DONE,
      priority: TaskPriority.HIGH,
      estimatedHours: d(40),
      organizationId: orgId,
    },
  });
  const task2 = await prisma.task.upsert({
    where: { id: 'task-002' },
    update: {},
    create: {
      id: 'task-002',
      name: 'System Design',
      projectId: proj1.id,
      ratePerHour: d(150),
      isBillable: true,
      status: TaskStatus.IN_PROGRESS,
      priority: TaskPriority.HIGH,
      estimatedHours: d(80),
      assigneeId: userMap['user-admin'],
      organizationId: orgId,
    },
  });
  await prisma.task.upsert({
    where: { id: 'task-003' },
    update: {},
    create: {
      id: 'task-003',
      name: 'Scope Definition',
      projectId: proj2.id,
      ratePerHour: d(120),
      isBillable: false,
      status: TaskStatus.TODO,
      priority: TaskPriority.MEDIUM,
      estimatedHours: d(20),
      organizationId: orgId,
    },
  });
  const tsEntries = [
    {
      id: 'ts-001',
      taskId: task1.id,
      projectId: proj1.id,
      duration: d(8),
      desc: 'Stakeholder interviews',
    },
    {
      id: 'ts-002',
      taskId: task1.id,
      projectId: proj1.id,
      duration: d(6),
      desc: 'Document requirements',
    },
    {
      id: 'ts-003',
      taskId: task2.id,
      projectId: proj1.id,
      duration: d(10),
      desc: 'Architecture design',
    },
  ];
  for (let i = 0; i < tsEntries.length; i++) {
    const ts = tsEntries[i];
    await prisma.timesheetEntry.upsert({
      where: { id: ts.id },
      update: {},
      create: {
        id: ts.id,
        userId: userMap['user-admin'],
        projectId: ts.projectId,
        taskId: ts.taskId,
        date: daysAgo(i + 3),
        duration: ts.duration,
        description: ts.desc,
        isBillable: true,
        status: TimesheetStatus.UNBILLED,
        organizationId: orgId,
      },
    });
  }
  console.log('  ✓ 2 projects, 3 tasks, 3 timesheet entries');

  // ─────────────────────────────────────────────────────────
  // 38. VAT RETURN + PAYMENT
  // ─────────────────────────────────────────────────────────
  console.log('\n38. VAT returns...');
  const vatReturn = await prisma.vATReturn.upsert({
    where: { period_organizationId: { period: '2026-Q1', organizationId: orgId } },
    update: {},
    create: {
      id: 'vat-001',
      returnNumber: 'VAT-001',
      period: '2026-Q1',
      periodStart: new Date('2026-01-01'),
      periodEnd: new Date('2026-03-31'),
      startDate: new Date('2026-01-01'),
      endDate: new Date('2026-03-31'),
      dueDate: new Date('2026-04-30'),
      status: VATReturnStatus.CALCULATED,
      totalSales: d(15000),
      outputVAT: d(2250),
      totalPurchases: d(8000),
      inputVAT: d(1200),
      netPayable: d(1050),
      organizationId: orgId,
    },
  });
  await prisma.vATPayment.upsert({
    where: { vatReturnId: vatReturn.id },
    update: {},
    create: {
      vatReturnId: vatReturn.id,
      date: new Date('2026-04-25'),
      amount: d(1050),
      paidFromAccountId: accountMap['1010'],
      reference: 'VAT-PAY-001',
      organizationId: orgId,
    },
  });
  console.log('  ✓ 1 VAT return + payment');

  // ─────────────────────────────────────────────────────────
  // 39. FIXED ASSETS
  // ─────────────────────────────────────────────────────────
  console.log('\n39. Fixed assets...');
  const asset1 = await prisma.asset.upsert({
    where: { organizationId_assetNumber: { organizationId: orgId, assetNumber: 'FA-001' } },
    update: {},
    create: {
      id: 'asset-001',
      assetNumber: 'FA-001',
      name: 'Dell Server Rack',
      description: 'Main data center server',
      assetType: AssetType.ELECTRONICS,
      purchaseDate: new Date('2024-01-15'),
      purchasePrice: d(25000),
      salvageValue: d(2000),
      usefulLifeYears: 5,
      depreciationMethod: DepreciationMethod.STRAIGHT_LINE,
      monthlyDepreciation: d(383.33),
      accumulatedDepreciation: d(4600),
      currentBookValue: d(20400),
      status: AssetStatus.ACTIVE,
      assetAccountId: accountMap['1500'],
      depreciationAccountId: accountMap['5200'],
      accumulatedDeprAccountId: accountMap['1510'],
      organizationId: orgId,
    },
  });
  await prisma.asset.upsert({
    where: { organizationId_assetNumber: { organizationId: orgId, assetNumber: 'FA-002' } },
    update: {},
    create: {
      id: 'asset-002',
      assetNumber: 'FA-002',
      name: 'Office Furniture Set',
      assetType: AssetType.FURNITURE,
      purchaseDate: new Date('2024-03-01'),
      purchasePrice: d(8000),
      salvageValue: d(500),
      usefulLifeYears: 7,
      depreciationMethod: DepreciationMethod.STRAIGHT_LINE,
      monthlyDepreciation: d(89.28),
      accumulatedDepreciation: d(1071.36),
      currentBookValue: d(6928.64),
      status: AssetStatus.ACTIVE,
      assetAccountId: accountMap['1500'],
      depreciationAccountId: accountMap['5200'],
      accumulatedDeprAccountId: accountMap['1510'],
      organizationId: orgId,
    },
  });
  // Depreciation schedules (last 3 months)
  for (const [month, year, accum, bookVal] of [
    [12, 2025, d(3833.33), d(21166.67)],
    [1, 2026, d(4216.67), d(20783.33)],
    [2, 2026, d(4600), d(20400)],
  ] as [number, number, Decimal, Decimal][]) {
    await prisma.depreciationSchedule.upsert({
      where: { assetId_month_year: { assetId: asset1.id, month, year } },
      update: {},
      create: {
        assetId: asset1.id,
        month,
        year,
        amount: d(383.33),
        accumulatedTotal: accum,
        bookValue: bookVal,
        executedAt: new Date(year, month - 1, 28),
        organizationId: orgId,
      },
    });
  }
  console.log('  ✓ 2 assets, 3 depreciation schedules');

  // ─────────────────────────────────────────────────────────
  // 40. CRM - LEADS + DEALS + ACTIVITIES
  // ─────────────────────────────────────────────────────────
  console.log('\n40. CRM leads, deals, activities...');
  const lead1 = await prisma.lead.upsert({
    where: { id: 'lead-001' },
    update: {},
    create: {
      id: 'lead-001',
      leadName: 'Mahmoud Fathy',
      companyName: 'Sinai Mining Corp',
      email: 'mfathy@sinai.eg',
      phone: '+201400000001',
      source: LeadSource.WEBSITE,
      status: LeadStatus.QUALIFIED,
      assignedToId: userMap['user-sales'],
      notes: 'Interested in full ERP suite',
      organizationId: orgId,
    },
  });
  const lead2 = await prisma.lead.upsert({
    where: { id: 'lead-002' },
    update: {},
    create: {
      id: 'lead-002',
      leadName: 'Rania Soliman',
      companyName: 'Luxor Tourism LLC',
      email: 'rsoliman@luxortour.eg',
      source: LeadSource.REFERRAL,
      status: LeadStatus.CONTACTED,
      assignedToId: userMap['user-sales'],
      organizationId: orgId,
    },
  });
  const lead3 = await prisma.lead.upsert({
    where: { id: 'lead-003' },
    update: {},
    create: {
      id: 'lead-003',
      leadName: 'Hisham Youssef',
      companyName: 'Alexandria Textiles',
      email: 'hyoussef@altex.eg',
      source: LeadSource.COLD_CALL,
      status: LeadStatus.NEW,
      organizationId: orgId,
    },
  });
  // Lead scores
  await prisma.leadScore.upsert({
    where: { leadId: lead1.id },
    update: {},
    create: {
      leadId: lead1.id,
      totalScore: 78,
      demographicScore: 25,
      behavioralScore: 30,
      engagementScore: 23,
      tier: LeadTier.HOT,
      conversionProbability: d(0.72),
      lastActivityAt: daysAgo(2),
      scoreHistory: [
        { date: daysAgo(7).toISOString(), score: 65 },
        { date: daysAgo(2).toISOString(), score: 78 },
      ],
      organizationId: orgId,
    },
  });
  await prisma.leadScore.upsert({
    where: { leadId: lead2.id },
    update: {},
    create: {
      leadId: lead2.id,
      totalScore: 45,
      demographicScore: 15,
      behavioralScore: 18,
      engagementScore: 12,
      tier: LeadTier.WARM,
      conversionProbability: d(0.38),
      scoreHistory: [],
      organizationId: orgId,
    },
  });
  await prisma.leadScore.upsert({
    where: { leadId: lead3.id },
    update: {},
    create: {
      leadId: lead3.id,
      totalScore: 20,
      tier: LeadTier.COLD,
      conversionProbability: d(0.12),
      scoreHistory: [],
      organizationId: orgId,
    },
  });
  // Deals
  const deal1 = await prisma.deal.upsert({
    where: { id: 'deal-001' },
    update: {},
    create: {
      id: 'deal-001',
      dealName: 'Sinai Mining - Full ERP',
      leadId: lead1.id,
      stage: DealStage.PROPOSAL_SENT,
      expectedAmount: d(120000),
      probability: 65,
      expectedCloseDate: daysAhead(30),
      assignedToId: userMap['user-sales'],
      organizationId: orgId,
    },
  });
  await prisma.deal.upsert({
    where: { id: 'deal-002' },
    update: {},
    create: {
      id: 'deal-002',
      dealName: 'Nile Tech - Phase 2',
      customerId: custMap['cust-001'],
      stage: DealStage.NEGOTIATION,
      expectedAmount: d(45000),
      probability: 80,
      expectedCloseDate: daysAhead(15),
      assignedToId: userMap['user-sales'],
      organizationId: orgId,
    },
  });
  // Activity logs
  await prisma.activityLog.upsert({
    where: { id: 'act-001' },
    update: {},
    create: {
      id: 'act-001',
      leadId: lead1.id,
      type: ActivityType.CALL,
      description: 'Initial discovery call - very interested, needs full demo',
      date: daysAgo(5),
      userId: userMap['user-sales'],
      organizationId: orgId,
    },
  });
  await prisma.activityLog.upsert({
    where: { id: 'act-002' },
    update: {},
    create: {
      id: 'act-002',
      leadId: lead1.id,
      dealId: deal1.id,
      type: ActivityType.MEETING,
      description: 'Product demo conducted - sent proposal afterwards',
      date: daysAgo(2),
      userId: userMap['user-sales'],
      organizationId: orgId,
    },
  });
  await prisma.activityLog.upsert({
    where: { id: 'act-003' },
    update: {},
    create: {
      id: 'act-003',
      leadId: lead2.id,
      type: ActivityType.EMAIL,
      description: 'Sent product brochure and pricing sheet',
      date: daysAgo(3),
      userId: userMap['user-sales'],
      organizationId: orgId,
    },
  });
  console.log('  ✓ 3 leads, 2 deals, 3 activities, 3 lead scores');

  // ─────────────────────────────────────────────────────────
  // 41. NOTIFICATIONS
  // ─────────────────────────────────────────────────────────
  console.log('\n41. Notifications...');
  const notifs = [
    {
      id: 'notif-001',
      title: 'Invoice Overdue',
      message: 'INV-004 for Red Sea Trading is 30 days overdue ($2,599.98)',
      type: 'warning',
    },
    {
      id: 'notif-002',
      title: 'Bill Due Soon',
      message: 'BILL-002 from Supplier Beta due in 3 days',
      type: 'info',
    },
    {
      id: 'notif-003',
      title: 'Low Stock Alert',
      message: 'Laptop Pro 15" stock below reorder point (25 units)',
      type: 'alert',
    },
    {
      id: 'notif-004',
      title: 'New Lead Assigned',
      message: 'Lead "Sinai Mining Corp" assigned to Omar Farouk',
      type: 'info',
    },
  ];
  for (const n of notifs) {
    await prisma.notification.upsert({
      where: { id: n.id },
      update: {},
      create: { ...n, userId: userMap['user-admin'], organizationId: orgId },
    });
  }
  console.log(`  ✓ ${notifs.length} notifications`);

  // ─────────────────────────────────────────────────────────
  // 42. AI INSIGHTS
  // ─────────────────────────────────────────────────────────
  console.log('\n42. AI insights...');
  const insights = [
    {
      id: 'ins-001',
      type: 'cash_flow_alert',
      title: 'Cash Flow Warning: Week 3 March',
      description:
        'Projected cash balance drops to $8,200 in week 3 due to BILL-003 payment of $8,000',
      severity: 'warning',
      category: AlertCategory.FINANCIAL,
      priority: AlertPriority.HIGH,
      aiSource: AlertSource.CASH_FLOW,
      actionUrl: '/banking',
      actionLabel: 'Review Cash Flow',
    },
    {
      id: 'ins-002',
      type: 'anomaly_detected',
      title: 'Unusual Expense Pattern Detected',
      description: 'Travel expenses in February are 3.2x higher than the 6-month average',
      severity: 'warning',
      category: AlertCategory.FINANCIAL,
      priority: AlertPriority.MEDIUM,
      aiSource: AlertSource.ANOMALY,
      actionUrl: '/purchases/expenses',
      actionLabel: 'Review Expenses',
    },
    {
      id: 'ins-003',
      type: 'overdue_collection',
      title: 'Collection Alert: 2 Overdue Invoices',
      description: '$11,199.96 outstanding in overdue invoices. Oldest is 60 days past due.',
      severity: 'critical',
      category: AlertCategory.COLLECTION,
      priority: AlertPriority.CRITICAL,
      aiSource: AlertSource.PAYMENT_PREDICTION,
      actionUrl: '/sales/invoices?status=OVERDUE',
      actionLabel: 'View Overdue Invoices',
    },
    {
      id: 'ins-004',
      type: 'reorder_alert',
      title: 'Reorder Point Reached: 1 Item',
      description:
        'Laptop Pro 15" current stock (25) is approaching reorder point (5). Consider restocking.',
      severity: 'info',
      category: AlertCategory.INVENTORY,
      priority: AlertPriority.LOW,
      aiSource: AlertSource.REORDER,
      actionUrl: '/inventory/items',
      actionLabel: 'View Items',
    },
  ];
  for (const ins of insights) {
    await prisma.aIInsight.upsert({
      where: { id: ins.id },
      update: {},
      create: { ...ins, organizationId: orgId },
    });
  }
  console.log(`  ✓ ${insights.length} AI insights`);

  // ─────────────────────────────────────────────────────────
  // 43. AI ANOMALIES
  // ─────────────────────────────────────────────────────────
  console.log('\n43. AI anomalies...');
  await prisma.aiAnomaly.upsert({
    where: { id: 'anom-001' },
    update: {},
    create: {
      id: 'anom-001',
      type: AnomalyType.SPENDING,
      severity: AnomalySeverity.MEDIUM,
      entityType: 'expense',
      entityId: 'exp-003',
      value: d(800),
      expectedValue: d(250),
      zScore: d(3.4),
      description: 'Travel expense significantly above historical average',
      organizationId: orgId,
    },
  });
  await prisma.aiAnomaly.upsert({
    where: { id: 'anom-002' },
    update: {},
    create: {
      id: 'anom-002',
      type: AnomalyType.REVENUE,
      severity: AnomalySeverity.LOW,
      entityType: 'invoice',
      entityId: invMap['inv-INV-004'],
      value: d(2599.98),
      expectedValue: d(1300),
      zScore: d(2.1),
      description: 'Invoice amount 2x higher than customer average order',
      organizationId: orgId,
    },
  });
  console.log('  ✓ 2 anomalies');

  // ─────────────────────────────────────────────────────────
  // 44. CASH FLOW FORECASTS
  // ─────────────────────────────────────────────────────────
  console.log('\n44. Cash flow forecasts...');
  for (let w = 1; w <= 4; w++) {
    const fd = daysAhead(w * 7);
    await prisma.cashFlowForecast.upsert({
      where: { id: `cf-w${w}` },
      update: {},
      create: {
        id: `cf-w${w}`,
        forecastDate: fd,
        openingBalance: d(50000 - (w - 1) * 2000),
        expectedInflows: d(8000 - w * 500),
        expectedOutflows: d(10000 - w * 300),
        closingBalanceP10: d(45000 - w * 2500),
        closingBalanceP50: d(48000 - w * 2000),
        closingBalanceP90: d(51000 - w * 1500),
        lowCashAlert: w === 3,
        negativeCashAlert: false,
        organizationId: orgId,
      },
    });
  }
  console.log('  ✓ 4 cash flow forecasts');

  // ─────────────────────────────────────────────────────────
  // 45. ITEM REORDER ANALYSIS
  // ─────────────────────────────────────────────────────────
  console.log('\n45. Item reorder analysis...');
  const reorderData = [
    {
      itemId: 'item-001',
      avg: d(0.8),
      std: d(0.3),
      safety: 3,
      reorder: 9,
      eoq: 20,
      status: ReorderStatus.OK,
    },
    {
      itemId: 'item-002',
      avg: d(1.5),
      std: d(0.5),
      safety: 5,
      reorder: 16,
      eoq: 30,
      status: ReorderStatus.OK,
    },
    {
      itemId: 'item-003',
      avg: d(6),
      std: d(2),
      safety: 20,
      reorder: 62,
      eoq: 120,
      status: ReorderStatus.OK,
    },
    {
      itemId: 'item-004',
      avg: d(2),
      std: d(0.8),
      safety: 7,
      reorder: 21,
      eoq: 40,
      status: ReorderStatus.OK,
    },
  ];
  for (const r of reorderData) {
    await prisma.itemReorderAnalysis.upsert({
      where: { itemId: itemMap[r.itemId] },
      update: {},
      create: {
        itemId: itemMap[r.itemId],
        avgDailyDemand: r.avg,
        demandStdDev: r.std,
        leadTimeDays: 7,
        safetyStock: r.safety,
        reorderPoint: r.reorder,
        economicOrderQty: r.eoq,
        status: r.status,
        lastSaleDate: daysAgo(3),
        daysSinceLastSale: 3,
        organizationId: orgId,
      },
    });
  }
  console.log('  ✓ 4 reorder analyses');

  // ─────────────────────────────────────────────────────────
  // 46. ITEM DEMAND FORECASTS
  // ─────────────────────────────────────────────────────────
  console.log('\n46. Item demand forecasts...');
  for (let m = 1; m <= 3; m++) {
    const fd = new Date(2026, 2 + m, 1);
    for (const [itemId, qty, trend] of [
      ['item-001', 25, d(0.5)],
      ['item-002', 45, d(0.8)],
    ] as [string, number, Decimal][]) {
      await prisma.itemDemandForecast.upsert({
        where: { id: `df-${itemId}-m${m}` },
        update: {},
        create: {
          id: `df-${itemId}-m${m}`,
          itemId: itemMap[itemId],
          forecastDate: fd,
          predictedQuantity: d(qty + m * 2),
          lowerBound: d(qty - 5),
          upperBound: d(qty + 10),
          seasonalIndex: d(1.05),
          trendComponent: trend,
          confidence: d(0.82),
          organizationId: orgId,
        },
      });
    }
  }
  console.log('  ✓ 6 demand forecasts');

  // ─────────────────────────────────────────────────────────
  // 47. CUSTOMER AI PROFILES
  // ─────────────────────────────────────────────────────────
  console.log('\n47. Customer AI profiles...');
  const custProfiles = [
    {
      custId: 'cust-001',
      churn: d(0.08),
      clv: d(45000),
      segment: 'VIP',
      recency: 5,
      freq: 12,
      monetary: d(15000),
    },
    {
      custId: 'cust-002',
      churn: d(0.32),
      clv: d(18000),
      segment: 'Regular',
      recency: 20,
      freq: 5,
      monetary: d(6000),
    },
    {
      custId: 'cust-003',
      churn: d(0.55),
      clv: d(5000),
      segment: 'At Risk',
      recency: 45,
      freq: 2,
      monetary: d(900),
    },
  ];
  for (const cp of custProfiles) {
    await prisma.customerAiProfile.upsert({
      where: { customerId: custMap[cp.custId] },
      update: {},
      create: {
        customerId: custMap[cp.custId],
        churnRisk: cp.churn,
        churnFactors: cp.churn.greaterThan(d(0.3)) ? ['declining_orders', 'payment_delays'] : [],
        lifetimeValue: cp.clv,
        clvSegment: cp.segment,
        rfmRecency: cp.recency,
        rfmFrequency: cp.freq,
        rfmMonetary: cp.monetary,
        lastPurchaseDate: daysAgo(cp.recency),
        crossSellItems: [itemMap['item-004'], itemMap['item-006']],
        upsellItems: [itemMap['item-001']],
        organizationId: orgId,
      },
    });
  }
  console.log('  ✓ 3 customer AI profiles');

  // ─────────────────────────────────────────────────────────
  // 48. EMPLOYEE AI PROFILES
  // ─────────────────────────────────────────────────────────
  console.log('\n48. Employee AI profiles...');
  const empProfiles = [
    {
      empId: 'emp-001',
      attrition: d(0.12),
      skills: { typescript: 90, nestjs: 85, react: 80 },
      gaps: ['kubernetes', 'ml-ops'],
    },
    {
      empId: 'emp-002',
      attrition: d(0.28),
      skills: { salesforce: 70, negotiation: 85 },
      gaps: ['data-analysis', 'crm-advanced'],
    },
    {
      empId: 'emp-003',
      attrition: d(0.08),
      skills: { accounting: 90, excel: 85, erp: 75 },
      gaps: ['advanced-tax', 'ifrs'],
    },
  ];
  for (const ep of empProfiles) {
    await prisma.employeeAiProfile.upsert({
      where: { employeeId: empMap[ep.empId] },
      update: {},
      create: {
        employeeId: empMap[ep.empId],
        attritionRisk: ep.attrition,
        attritionFactors: ep.attrition.greaterThan(d(0.2)) ? ['market_demand', 'salary_gap'] : [],
        compensationIndex: d(0.95),
        skillsProfile: ep.skills,
        skillsGaps: ep.gaps,
        organizationId: orgId,
      },
    });
  }
  console.log('  ✓ 3 employee AI profiles');

  // ─────────────────────────────────────────────────────────
  // 49. FRAUD ALERTS
  // ─────────────────────────────────────────────────────────
  console.log('\n49. Fraud alerts...');
  await prisma.fraudAlert.upsert({
    where: { id: 'fraud-001' },
    update: {},
    create: {
      id: 'fraud-001',
      entityType: 'bill',
      entityId: billMap['bill-BILL-003'],
      fraudScore: d(0.72),
      signals: ['large_amount', 'vendor_new', 'duplicate_invoice_pattern'],
      velocityCheck: true,
      amountAnomaly: true,
      timeAnomaly: false,
      duplicateCheck: false,
      isConfirmedFraud: false,
      organizationId: orgId,
    },
  });
  console.log('  ✓ 1 fraud alert');

  // ─────────────────────────────────────────────────────────
  // 50. TRANSACTION PATTERNS
  // ─────────────────────────────────────────────────────────
  console.log('\n50. Transaction patterns...');
  const pattern = await prisma.transactionPattern.upsert({
    where: {
      organizationId_entityName_amountCluster: {
        organizationId: orgId,
        entityName: 'cairo real estate',
        amountCluster: d(1500),
      },
    },
    update: {},
    create: {
      entityType: 'vendor',
      entityName: 'cairo real estate',
      amountCluster: d(1500),
      frequency: RecurringFrequency.MONTHLY,
      frequencyDays: 30,
      occurrenceCount: 3,
      firstOccurrence: new Date('2026-01-01'),
      lastOccurrence: daysAgo(15),
      descriptionPattern: 'rent payment',
      confidence: d(0.95),
      status: PatternStatus.DETECTED,
      organizationId: orgId,
    },
  });
  await prisma.patternOccurrence.upsert({
    where: { id: 'po-001' },
    update: {},
    create: {
      id: 'po-001',
      patternId: pattern.id,
      sourceType: 'journal',
      sourceId: jrnl2.id,
      amount: d(1500),
      date: daysAgo(15),
      description: 'Office rent payment March',
      organizationId: orgId,
    },
  });
  await prisma.patternSuggestion.upsert({
    where: { id: 'ps-001' },
    update: {},
    create: {
      id: 'ps-001',
      patternId: pattern.id,
      suggestionType: SuggestionType.CREATE_RECURRING,
      suggestedFrequency: RecurringFrequency.MONTHLY,
      suggestedAmount: d(1500),
      confidence: d(0.95),
      status: SuggestionStatus.PENDING,
      organizationId: orgId,
    },
  });
  console.log('  ✓ 1 transaction pattern + occurrence + suggestion');

  // ─────────────────────────────────────────────────────────
  // 51. ASSET MAINTENANCE PREDICTIONS
  // ─────────────────────────────────────────────────────────
  console.log('\n51. Asset maintenance predictions...');
  await prisma.assetMaintenancePrediction.upsert({
    where: { id: 'amp-001' },
    update: {},
    create: {
      id: 'amp-001',
      assetId: asset1.id,
      predictedFailureDate: daysAhead(180),
      riskScore: d(0.25),
      healthScore: d(0.82),
      factors: ['age_2years', 'high_utilization'],
      recommendedAction: 'Schedule maintenance check in 6 months',
      organizationId: orgId,
    },
  });
  console.log('  ✓ 1 maintenance prediction');

  // ─────────────────────────────────────────────────────────
  // 52. DEEP SEARCH JOB
  // ─────────────────────────────────────────────────────────
  console.log('\n52. Deep search job...');
  const dsJob = await prisma.deepSearchJob.upsert({
    where: { id: 'ds-001' },
    update: {},
    create: {
      id: 'ds-001',
      status: DeepSearchStatus.COMPLETED,
      progress: 100,
      progressMessage: 'Analysis complete',
      webSourcesScraped: 45,
      codeFilesAnalyzed: 120,
      suggestionsCount: 3,
      startedAt: daysAgo(3),
      completedAt: daysAgo(3),
      organizationId: orgId,
    },
  });
  const suggestions = [
    {
      cat: SuggestionCategory.FEATURE_GAP,
      title: 'AI-Powered Invoice Approval Workflow',
      desc: 'Implement automated approval routing based on amount thresholds and department',
      impact: 'High - reduces approval time by 70%',
      effort: 'Medium',
      priority: 1,
    },
    {
      cat: SuggestionCategory.AI_CAPABILITY,
      title: 'Predictive Customer Churn Intervention',
      desc: 'Trigger automated outreach when churn risk exceeds 40%',
      impact: 'High - prevent 30% churn cases',
      effort: 'Low',
      priority: 2,
    },
    {
      cat: SuggestionCategory.PERFORMANCE_UX,
      title: 'Real-time Dashboard Refresh',
      desc: 'Implement WebSocket-based live updates for KPI dashboard',
      impact: 'Medium - improved user engagement',
      effort: 'Medium',
      priority: 3,
    },
  ];
  for (let i = 0; i < suggestions.length; i++) {
    const s = suggestions[i];
    await prisma.deepSearchSuggestion.upsert({
      where: { id: `dss-00${i + 1}` },
      update: {},
      create: {
        id: `dss-00${i + 1}`,
        category: s.cat,
        title: s.title,
        description: s.desc,
        impact: s.impact,
        effort: s.effort,
        priority: s.priority,
        tags: ['ai', 'automation'],
        prompt: `Implement: ${s.title}`,
        status: 'pending',
        jobId: dsJob.id,
        organizationId: orgId,
      },
    });
  }
  console.log('  ✓ 1 deep search job, 3 suggestions');

  // ─────────────────────────────────────────────────────────
  // 53. ORGANIZATION ONBOARDING
  // ─────────────────────────────────────────────────────────
  console.log('\n53. Organization onboarding...');
  await prisma.organizationOnboarding.upsert({
    where: { organizationId: orgId },
    update: {},
    create: {
      organizationId: orgId,
      companyInfoCompleted: true,
      chartOfAccountsCompleted: true,
      taxConfigCompleted: true,
      openingBalancesCompleted: true,
      importDataCompleted: false,
      aiFeaturesCompleted: true,
      tourCompleted: false,
      selectedIndustry: 'technology',
      selectedCoaTemplate: 'standard',
      skippedSteps: ['import_data'],
    },
  });
  await prisma.organization.update({
    where: { id: orgId },
    data: {
      defaultArAccountId: accountMap['1200'],
      defaultRevenueAccountId: accountMap['4000'],
      defaultApAccountId: accountMap['2000'],
      defaultBankAccountId: accountMap['1010'],
      defaultCashAccountId: accountMap['1000'],
      defaultVatPayableAccountId: accountMap['2100'],
      defaultVatReceivableAccountId: accountMap['1300'],
      defaultTaxRateId: taxRate15.id,
      onboardingCompleted: true,
    },
  });
  console.log('  ✓ Onboarding completed');

  // ─────────────────────────────────────────────────────────
  // 54. EMAIL LOGS
  // ─────────────────────────────────────────────────────────
  console.log('\n54. Email logs...');
  await prisma.emailLog.upsert({
    where: { id: 'email-001' },
    update: {},
    create: {
      id: 'email-001',
      to: 'hello@niletech.eg',
      subject: 'Invoice INV-001 from Mizano Demo Company',
      entityType: 'invoice',
      entityId: invMap['inv-INV-001'],
      status: 'sent',
      organizationId: orgId,
    },
  });
  await prisma.emailLog.upsert({
    where: { id: 'email-002' },
    update: {},
    create: {
      id: 'email-002',
      to: 'info@delta.eg',
      subject: 'Quote QT-002 from Mizano Demo Company',
      entityType: 'quote',
      entityId: quote2.id,
      status: 'sent',
      organizationId: orgId,
    },
  });
  console.log('  ✓ 2 email logs');

  // ─────────────────────────────────────────────────────────
  // 55. SEARCH HISTORY
  // ─────────────────────────────────────────────────────────
  console.log('\n55. Search history...');
  const searches = [
    {
      query: 'nile tech',
      resultType: 'customer',
      resultId: custMap['cust-001'],
      resultTitle: 'Nile Tech Solutions',
    },
    {
      query: 'INV-001',
      resultType: 'invoice',
      resultId: invMap['inv-INV-001'],
      resultTitle: 'Invoice INV-001',
    },
    {
      query: 'laptop',
      resultType: 'item',
      resultId: itemMap['item-001'],
      resultTitle: 'Laptop Pro 15"',
    },
  ];
  for (let i = 0; i < searches.length; i++) {
    const s = searches[i];
    await prisma.searchHistory.upsert({
      where: {
        organizationId_userId_query: {
          organizationId: orgId,
          userId: userMap['user-admin'],
          query: s.query,
        },
      },
      update: {},
      create: {
        id: `sh-00${i + 1}`,
        query: s.query,
        resultType: s.resultType,
        resultId: s.resultId,
        resultTitle: s.resultTitle,
        userId: userMap['user-admin'],
        organizationId: orgId,
      },
    });
  }
  console.log('  ✓ 3 search histories');

  // ─────────────────────────────────────────────────────────
  // 56. AUDIT LOGS
  // ─────────────────────────────────────────────────────────
  console.log('\n56. Audit logs...');
  const auditEntries = [
    {
      id: 'audit-001',
      entityType: 'invoice',
      entityId: invMap['inv-INV-001'],
      action: AuditAction.CREATE,
    },
    {
      id: 'audit-002',
      entityType: 'customer',
      entityId: custMap['cust-001'],
      action: AuditAction.UPDATE,
    },
    {
      id: 'audit-003',
      entityType: 'bill',
      entityId: billMap['bill-BILL-001'],
      action: AuditAction.CREATE,
    },
  ];
  for (const a of auditEntries) {
    await prisma.auditLog.upsert({
      where: { id: a.id },
      update: {},
      create: {
        id: a.id,
        userId: userMap['user-admin'],
        action: a.action,
        entityType: a.entityType,
        entityId: a.entityId,
        newValues: { status: 'created' },
        organizationId: orgId,
      },
    });
  }
  console.log('  ✓ 3 audit logs');

  // ─────────────────────────────────────────────────────────
  // DONE
  // ─────────────────────────────────────────────────────────
  console.log('\n' + '='.repeat(60));
  console.log('✅ Full seed completed!');
  console.log('='.repeat(60));
  console.log('\nDemo Credentials:');
  console.log('  Email:    admin@mizano.com');
  console.log('  Password: password123');
  console.log('\nOther users: manager@, accountant@, sales@, storekeeper@, hr@mizano.com');
  console.log('='.repeat(60));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
