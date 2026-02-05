import { PrismaClient, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

/**
 * Default roles and permissions for Mizano ERP
 */
const DEFAULT_ROLES = [
  {
    name: 'Admin',
    description: 'Full system access - can manage all modules and settings',
    isDefault: true,
    permissions: [
      { module: 'accounting', actions: ['view', 'create', 'edit', 'delete', 'export'] },
      { module: 'sales', actions: ['view', 'create', 'edit', 'delete', 'export'] },
      { module: 'purchases', actions: ['view', 'create', 'edit', 'delete', 'export'] },
      { module: 'inventory', actions: ['view', 'create', 'edit', 'delete', 'export'] },
      { module: 'banking', actions: ['view', 'create', 'edit', 'delete', 'export'] },
      { module: 'hr', actions: ['view', 'create', 'edit', 'delete', 'export'] },
      { module: 'manufacturing', actions: ['view', 'create', 'edit', 'delete', 'export'] },
      { module: 'projects', actions: ['view', 'create', 'edit', 'delete', 'export'] },
      { module: 'tax', actions: ['view', 'create', 'edit', 'delete', 'export'] },
      { module: 'reports', actions: ['view', 'export'] },
      { module: 'crm', actions: ['view', 'create', 'edit', 'delete', 'export'] },
      { module: 'settings', actions: ['view', 'create', 'edit', 'delete'] },
      { module: 'users', actions: ['view', 'create', 'edit', 'delete'] },
    ],
  },
  {
    name: 'Manager',
    description: 'Can manage most modules except system settings and user deletion',
    isDefault: false,
    permissions: [
      { module: 'accounting', actions: ['view', 'create', 'edit', 'export'] },
      { module: 'sales', actions: ['view', 'create', 'edit', 'delete', 'export'] },
      { module: 'purchases', actions: ['view', 'create', 'edit', 'delete', 'export'] },
      { module: 'inventory', actions: ['view', 'create', 'edit', 'delete', 'export'] },
      { module: 'banking', actions: ['view', 'create', 'edit', 'export'] },
      { module: 'hr', actions: ['view', 'create', 'edit', 'export'] },
      { module: 'manufacturing', actions: ['view', 'create', 'edit', 'export'] },
      { module: 'projects', actions: ['view', 'create', 'edit', 'delete', 'export'] },
      { module: 'tax', actions: ['view', 'export'] },
      { module: 'reports', actions: ['view', 'export'] },
      { module: 'crm', actions: ['view', 'create', 'edit', 'delete', 'export'] },
      { module: 'settings', actions: ['view'] },
      { module: 'users', actions: ['view'] },
    ],
  },
  {
    name: 'Accountant',
    description: 'Full access to accounting, banking, tax, and reports',
    isDefault: false,
    permissions: [
      { module: 'accounting', actions: ['view', 'create', 'edit', 'delete', 'export'] },
      { module: 'sales', actions: ['view', 'export'] },
      { module: 'purchases', actions: ['view', 'export'] },
      { module: 'banking', actions: ['view', 'create', 'edit', 'delete', 'export'] },
      { module: 'tax', actions: ['view', 'create', 'edit', 'delete', 'export'] },
      { module: 'reports', actions: ['view', 'export'] },
      { module: 'hr', actions: ['view'] },
    ],
  },
  {
    name: 'SalesRep',
    description: 'Manage customers, quotes, invoices, and CRM activities',
    isDefault: false,
    permissions: [
      { module: 'sales', actions: ['view', 'create', 'edit', 'export'] },
      { module: 'crm', actions: ['view', 'create', 'edit', 'export'] },
      { module: 'projects', actions: ['view'] },
      { module: 'inventory', actions: ['view'] },
      { module: 'reports', actions: ['view'] },
    ],
  },
  {
    name: 'StoreKeeper',
    description: 'Manage inventory, warehouses, and stock movements',
    isDefault: false,
    permissions: [
      { module: 'inventory', actions: ['view', 'create', 'edit', 'delete', 'export'] },
      { module: 'manufacturing', actions: ['view', 'create', 'edit'] },
      { module: 'purchases', actions: ['view'] },
      { module: 'sales', actions: ['view'] },
    ],
  },
];

/**
 * Demo users for testing - password is "password123" for all
 */
const DEMO_USERS = [
  {
    email: 'admin@mizano.com',
    name: 'Admin User',
    firstName: 'Admin',
    lastName: 'User',
    roleName: 'Admin',
  },
  {
    email: 'manager@mizano.com',
    name: 'Manager User',
    firstName: 'Manager',
    lastName: 'User',
    roleName: 'Manager',
  },
  {
    email: 'accountant@mizano.com',
    name: 'Accountant User',
    firstName: 'Accountant',
    lastName: 'User',
    roleName: 'Accountant',
  },
  {
    email: 'sales@mizano.com',
    name: 'Sales Rep',
    firstName: 'Sales',
    lastName: 'Rep',
    roleName: 'SalesRep',
  },
  {
    email: 'storekeeper@mizano.com',
    name: 'Store Keeper',
    firstName: 'Store',
    lastName: 'Keeper',
    roleName: 'StoreKeeper',
  },
];

/**
 * Default password for all demo users
 */
const DEFAULT_PASSWORD = 'password123';

async function seedRolesForOrganization(organizationId: string, orgName: string) {
  console.log(`\n  Seeding roles for organization: ${orgName} (${organizationId})`);

  let created = 0;
  let existing = 0;
  const rolesMap = new Map<string, string>();

  for (const roleData of DEFAULT_ROLES) {
    // Check if role already exists
    let role = await prisma.role.findFirst({
      where: { name: roleData.name, organizationId },
    });

    if (role) {
      console.log(`    - Role "${roleData.name}" already exists, skipping`);
      existing++;
      rolesMap.set(roleData.name, role.id);
      continue;
    }

    // Create role with permissions
    role = await prisma.role.create({
      data: {
        name: roleData.name,
        description: roleData.description,
        isDefault: roleData.isDefault,
        organizationId,
        permissions: {
          create: roleData.permissions.map((p) => ({
            module: p.module,
            actions: p.actions,
          })),
        },
      },
    });

    rolesMap.set(roleData.name, role.id);
    console.log(`    + Created role: ${roleData.name}`);
    created++;
  }

  return { created, existing, rolesMap };
}

async function seedUsersForOrganization(
  organizationId: string,
  orgName: string,
  rolesMap: Map<string, string>,
) {
  console.log(`\n  Seeding users for organization: ${orgName} (${organizationId})`);

  let created = 0;
  let existing = 0;

  // Hash the default password once
  const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 10);

  for (const userData of DEMO_USERS) {
    // Check if user already exists
    const existingUser = await prisma.user.findFirst({
      where: { email: userData.email, organizationId },
    });

    if (existingUser) {
      console.log(`    - User "${userData.email}" already exists, skipping`);
      existing++;
      continue;
    }

    // Get role ID
    const roleId = rolesMap.get(userData.roleName);
    if (!roleId) {
      console.log(`    ! Role "${userData.roleName}" not found for user "${userData.email}", skipping`);
      continue;
    }

    // Create user
    await prisma.user.create({
      data: {
        email: userData.email,
        passwordHash,
        name: userData.name,
        firstName: userData.firstName,
        lastName: userData.lastName,
        status: UserStatus.ACTIVE,
        roleId,
        organizationId,
      },
    });

    console.log(`    + Created user: ${userData.email} (${userData.roleName})`);
    created++;
  }

  return { created, existing };
}

async function createDemoOrganization() {
  console.log('\nChecking for demo organization...');

  // Check if demo organization exists
  let org = await prisma.organization.findFirst({
    where: { name: 'Mizano Demo' },
  });

  if (org) {
    console.log('  Demo organization already exists');
    return org;
  }

  // Create demo organization
  org = await prisma.organization.create({
    data: {
      name: 'Mizano Demo',
      email: 'demo@mizano.com',
      phone: '+1-555-123-4567',
      address: '123 Demo Street, Demo City, DC 12345',
      currency: 'USD',
      taxId: 'DEMO-TAX-123',
    },
  });

  console.log('  + Created demo organization: Mizano Demo');
  return org;
}

async function main() {
  console.log('='.repeat(50));
  console.log('Starting Mizano ERP database seed...');
  console.log('='.repeat(50));

  // Create demo organization if none exist
  const organizations = await prisma.organization.findMany({
    select: { id: true, name: true },
  });

  let orgsToSeed = organizations;

  if (organizations.length === 0) {
    console.log('\nNo organizations found. Creating demo organization...');
    const demoOrg = await createDemoOrganization();
    orgsToSeed = [{ id: demoOrg.id, name: demoOrg.name }];
  }

  console.log(`\nFound ${orgsToSeed.length} organization(s) to seed`);

  let totalRolesCreated = 0;
  let totalRolesExisting = 0;
  let totalUsersCreated = 0;
  let totalUsersExisting = 0;

  for (const org of orgsToSeed) {
    // Seed roles first
    const roleResult = await seedRolesForOrganization(org.id, org.name);
    totalRolesCreated += roleResult.created;
    totalRolesExisting += roleResult.existing;

    // Seed users with roles
    const userResult = await seedUsersForOrganization(org.id, org.name, roleResult.rolesMap);
    totalUsersCreated += userResult.created;
    totalUsersExisting += userResult.existing;
  }

  console.log('\n' + '='.repeat(50));
  console.log('Seed Summary');
  console.log('='.repeat(50));
  console.log(`Roles created:        ${totalRolesCreated}`);
  console.log(`Roles already exist:  ${totalRolesExisting}`);
  console.log(`Users created:        ${totalUsersCreated}`);
  console.log(`Users already exist:  ${totalUsersExisting}`);
  console.log('='.repeat(50));
  console.log('\nDemo Credentials:');
  console.log('  Email: admin@mizano.com');
  console.log('  Password: password123');
  console.log('\nOther demo users:');
  DEMO_USERS.forEach((u) => console.log(`  - ${u.email} (${u.roleName})`));
  console.log('\nSeed completed successfully!');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
