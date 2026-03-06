import {
  PrismaClient,
  UserStatus,
  AccountType,
  InvoiceStatus,
  BillStatus,
  ItemType,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { Decimal } from '@prisma/client/runtime/library';
import { seedAiTrainingData } from './seed-ai-training';

const prisma = new PrismaClient();
const DEFAULT_PASSWORD = 'password123';

async function main() {
  console.log('='.repeat(60));
  console.log('Mizano ERP - Database Seed');
  console.log('='.repeat(60));

  // 1. ORGANIZATION
  console.log('\n1. Creating organization...');
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
    },
  });
  const orgId = org.id;
  console.log(`  ✓ Organization: ${org.name}`);

  // 2. ROLES
  console.log('\n2. Creating roles...');
  const admin = await prisma.role.upsert({
    where: { name_organizationId: { name: 'Admin', organizationId: orgId } },
    update: {},
    create: {
      name: 'Admin',
      description: 'Full system access',
      isDefault: true,
      organizationId: orgId,
    },
  });

  await prisma.role.upsert({
    where: { name_organizationId: { name: 'Manager', organizationId: orgId } },
    update: {},
    create: { name: 'Manager', description: 'Manager', isDefault: false, organizationId: orgId },
  });

  await prisma.role.upsert({
    where: { name_organizationId: { name: 'Accountant', organizationId: orgId } },
    update: {},
    create: {
      name: 'Accountant',
      description: 'Accountant',
      isDefault: false,
      organizationId: orgId,
    },
  });

  await prisma.role.upsert({
    where: { name_organizationId: { name: 'SalesRep', organizationId: orgId } },
    update: {},
    create: { name: 'SalesRep', description: 'Sales Rep', isDefault: false, organizationId: orgId },
  });

  await prisma.role.upsert({
    where: { name_organizationId: { name: 'StoreKeeper', organizationId: orgId } },
    update: {},
    create: {
      name: 'StoreKeeper',
      description: 'Store Keeper',
      isDefault: false,
      organizationId: orgId,
    },
  });

  console.log('  ✓ 5 roles created');

  // 2b. PERMISSIONS (Admin gets full access to all modules)
  console.log('\n2b. Creating permissions...');
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
  ];
  const allActions = ['view', 'create', 'edit', 'delete', 'export'];

  for (const module of allModules) {
    await prisma.permission.upsert({
      where: { roleId_module: { roleId: admin.id, module } },
      update: { actions: allActions },
      create: {
        roleId: admin.id,
        module,
        actions: allActions,
      },
    });
  }
  console.log(`  ✓ ${allModules.length} module permissions created for Admin`);

  // 3. USERS
  console.log('\n3. Creating users...');
  const users = [
    { email: 'admin@mizano.com', name: 'Admin User' },
    { email: 'manager@mizano.com', name: 'Manager' },
    { email: 'accountant@mizano.com', name: 'Accountant' },
    { email: 'sales@mizano.com', name: 'Sales Rep' },
    { email: 'storekeeper@mizano.com', name: 'Store Keeper' },
  ];

  for (const userData of users) {
    const hashedPassword = await bcrypt.hash(DEFAULT_PASSWORD, 10);
    await prisma.user.upsert({
      where: { email_organizationId: { email: userData.email, organizationId: orgId } },
      update: {},
      create: {
        email: userData.email,
        name: userData.name,
        passwordHash: hashedPassword,
        status: UserStatus.ACTIVE,
        roleId: admin.id,
        organizationId: orgId,
      },
    });
  }
  console.log(`  ✓ ${users.length} users created`);

  // 4. CHART OF ACCOUNTS
  console.log('\n4. Creating chart of accounts...');
  const accountsData = [
    { code: '1000', name: 'Cash', type: AccountType.ASSET },
    { code: '1010', name: 'Bank Account', type: AccountType.ASSET },
    { code: '1100', name: 'Inventory', type: AccountType.ASSET },
    { code: '1200', name: 'Accounts Receivable', type: AccountType.ASSET },
    { code: '2000', name: 'Accounts Payable', type: AccountType.LIABILITY },
    { code: '3000', name: 'Owner Capital', type: AccountType.EQUITY },
    { code: '4000', name: 'Sales Revenue', type: AccountType.REVENUE },
    { code: '5000', name: 'Cost of Goods Sold', type: AccountType.EXPENSE },
    { code: '5100', name: 'Salary Expense', type: AccountType.EXPENSE },
  ];

  const accountMap: Record<string, string> = {};
  for (const accData of accountsData) {
    const acc = await prisma.account.upsert({
      where: { code_organizationId: { code: accData.code, organizationId: orgId } },
      update: {},
      create: { ...accData, organizationId: orgId },
    });
    accountMap[accData.code] = acc.id;
  }
  console.log(`  ✓ ${accountsData.length} accounts created`);

  // 5. CUSTOMERS
  console.log('\n5. Creating customers...');
  const customers = [
    {
      id: 'cust-001',
      name: 'Nile Tech Solutions',
      email: 'hello@techcorp.eg',
      phone: '+201001234567',
      billingCity: 'Cairo',
      billingCountry: 'Egypt',
    },
    {
      id: 'cust-002',
      name: 'Delta Logistics Egypt',
      email: 'info@global.com',
      phone: '+201101234567',
      billingCity: 'Alexandria',
      billingCountry: 'Egypt',
    },
    {
      id: 'cust-003',
      name: 'Cairo Digital Store',
      email: 'contact@retail.eg',
      phone: '+201201234567',
      billingCity: 'Giza',
      billingCountry: 'Egypt',
    },
  ];

  const custMap: Record<string, string> = {};
  for (const custData of customers) {
    const cust = await prisma.customer.upsert({
      where: { id: custData.id },
      update: {},
      create: { ...custData, organizationId: orgId },
    });
    custMap[custData.id] = cust.id;
  }
  console.log(`  ✓ ${customers.length} customers created`);

  // 6. VENDORS
  console.log('\n6. Creating vendors...');
  const vendors = [
    {
      id: 'vend-001',
      name: 'Supplier Alpha',
      email: 'sales@alpha.com',
      phone: '+201001111111',
      billingCity: 'Cairo',
      billingCountry: 'Egypt',
    },
    {
      id: 'vend-002',
      name: 'Supplier Beta',
      email: 'contact@beta.com',
      phone: '+201101111111',
      billingCity: 'Alexandria',
      billingCountry: 'Egypt',
    },
  ];

  const vendMap: Record<string, string> = {};
  for (const vendData of vendors) {
    const vend = await prisma.vendor.upsert({
      where: { id: vendData.id },
      update: {},
      create: { ...vendData, organizationId: orgId },
    });
    vendMap[vendData.id] = vend.id;
  }
  console.log(`  ✓ ${vendors.length} vendors created`);

  // 7. ITEMS
  console.log('\n7. Creating inventory items...');
  const items = [
    {
      id: 'item-001',
      sku: 'ITEM-001',
      name: 'Laptop Pro 15"',
      type: ItemType.GOODS,
      sellingPrice: new Decimal(1299.99),
    },
    {
      id: 'item-002',
      sku: 'ITEM-002',
      name: 'Desktop Monitor',
      type: ItemType.GOODS,
      sellingPrice: new Decimal(349.99),
    },
    {
      id: 'item-003',
      sku: 'ITEM-003',
      name: 'USB Cable',
      type: ItemType.GOODS,
      sellingPrice: new Decimal(9.99),
    },
  ];

  const itemMap: Record<string, string> = {};
  for (const itemData of items) {
    const item = await prisma.item.upsert({
      where: { id: itemData.id },
      update: {},
      create: { ...itemData, organizationId: orgId },
    });
    itemMap[itemData.id] = item.id;
  }
  console.log(`  ✓ ${items.length} items created`);

  // 8. WAREHOUSES
  console.log('\n8. Creating warehouses...');
  const warehouses = [
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
  for (const whData of warehouses) {
    const wh = await prisma.warehouse.upsert({
      where: { id: whData.id },
      update: {},
      create: { ...whData, organizationId: orgId },
    });
    whMap[whData.id] = wh.id;
  }
  console.log(`  ✓ ${warehouses.length} warehouses created`);

  // 9. BANK ACCOUNTS
  console.log('\n9. Creating bank accounts...');
  const bankAccounts = [
    {
      id: 'bank-001',
      name: 'Business Checking',
      type: 'BANK' as const,
      accountNumber: '1234567890',
      linkedAccountId: accountMap['1010'],
    },
    {
      id: 'bank-002',
      name: 'Petty Cash',
      type: 'PETTY_CASH' as const,
      linkedAccountId: accountMap['1000'],
    },
  ];

  const bankMap: Record<string, string> = {};
  for (const baData of bankAccounts) {
    const ba = await prisma.bankAccount.upsert({
      where: { id: baData.id },
      update: {},
      create: { ...baData, organizationId: orgId },
    });
    bankMap[baData.id] = ba.id;
  }
  console.log(`  ✓ ${bankAccounts.length} bank accounts created`);

  // 10. INVOICES
  console.log('\n10. Creating invoices...');
  const invoices = [
    {
      invoiceNumber: 'INV-001',
      customerId: custMap['cust-001'],
      date: new Date(Date.now() - 30 * 86400000),
      dueDate: new Date(),
      status: InvoiceStatus.DRAFT,
      grandTotal: new Decimal(1299.99),
    },
    {
      invoiceNumber: 'INV-002',
      customerId: custMap['cust-002'],
      date: new Date(Date.now() - 20 * 86400000),
      dueDate: new Date(),
      status: InvoiceStatus.DRAFT,
      grandTotal: new Decimal(699.98),
    },
  ];

  for (const invData of invoices) {
    await prisma.invoice.upsert({
      where: { id: `inv-${invData.invoiceNumber}` },
      update: {},
      create: {
        id: `inv-${invData.invoiceNumber}`,
        ...invData,
        subtotal: invData.grandTotal,
        balanceDue: invData.grandTotal,
        organizationId: orgId,
      },
    });
  }
  console.log(`  ✓ ${invoices.length} invoices created`);

  // 10b. INVOICE LINES
  console.log('\n10b. Creating invoice lines...');
  await prisma.invoiceLine.upsert({
    where: { id: 'inv-line-001' },
    update: {},
    create: {
      id: 'inv-line-001',
      invoiceId: 'inv-INV-001',
      itemId: itemMap['item-001'],
      description: 'Laptop Pro 15"',
      quantity: new Decimal(1),
      rate: new Decimal(1299.99),
      amount: new Decimal(1299.99),
    },
  });
  await prisma.invoiceLine.upsert({
    where: { id: 'inv-line-002' },
    update: {},
    create: {
      id: 'inv-line-002',
      invoiceId: 'inv-INV-002',
      itemId: itemMap['item-002'],
      description: 'Desktop Monitor',
      quantity: new Decimal(2),
      rate: new Decimal(349.99),
      amount: new Decimal(699.98),
    },
  });
  console.log('  ✓ Invoice lines created for INV-001, INV-002');

  // 11. BILLS
  console.log('\n11. Creating bills...');
  const bills = [
    {
      billNumber: 'BILL-001',
      vendorId: vendMap['vend-001'],
      date: new Date(Date.now() - 25 * 86400000),
      dueDate: new Date(),
      status: BillStatus.DRAFT,
      grandTotal: new Decimal(5000),
    },
    {
      billNumber: 'BILL-002',
      vendorId: vendMap['vend-002'],
      date: new Date(Date.now() - 15 * 86400000),
      dueDate: new Date(),
      status: BillStatus.DRAFT,
      grandTotal: new Decimal(3500),
    },
  ];

  for (const billData of bills) {
    await prisma.bill.upsert({
      where: { id: `bill-${billData.billNumber}` },
      update: {},
      create: {
        id: `bill-${billData.billNumber}`,
        ...billData,
        subtotal: billData.grandTotal,
        balanceDue: billData.grandTotal,
        organizationId: orgId,
      },
    });
  }
  console.log(`  ✓ ${bills.length} bills created`);

  // 12. AI TRAINING DATA
  await seedAiTrainingData(prisma, orgId, accountMap, custMap, vendMap, itemMap, whMap, bankMap);

  // 13. SET ORGANIZATION DEFAULT ACCOUNTS
  console.log('\n13. Setting organization default accounts...');
  await prisma.organization.update({
    where: { id: orgId },
    data: {
      defaultArAccountId: accountMap['1200'],
      defaultRevenueAccountId: accountMap['4000'],
      defaultApAccountId: accountMap['2000'],
      defaultBankAccountId: accountMap['1010'],
      defaultCashAccountId: accountMap['1000'],
    },
  });
  console.log('  ✓ Organization default accounts configured');

  console.log('\n' + '='.repeat(60));
  console.log('✅ Seed completed successfully!');
  console.log('='.repeat(60));
  console.log('\nDemo Credentials:');
  console.log('  Email:    admin@mizano.com');
  console.log('  Password: password123');
  console.log('\nOther demo users:');
  console.log('  manager@mizano.com');
  console.log('  accountant@mizano.com');
  console.log('  sales@mizano.com');
  console.log('  storekeeper@mizano.com');
  console.log('='.repeat(60));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
