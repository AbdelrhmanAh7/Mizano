import * as jwt from 'jsonwebtoken';

/**
 * Generate a test JWT token for E2E tests.
 * Simulates a logged-in user with organization context.
 */
export function generateTestToken(overrides: {
  userId?: string;
  email?: string;
  organizationId?: string;
  roleId?: string;
  roleName?: string;
} = {}): string {
  const payload = {
    sub: overrides.userId || 'test-user-001',
    email: overrides.email || 'test@mizano.com',
    organizationId: overrides.organizationId || 'test-org-001',
    roleId: overrides.roleId || 'test-role-admin',
    roleName: overrides.roleName || 'Admin',
  };

  return jwt.sign(payload, process.env.JWT_SECRET || 'e2e-test-jwt-secret-key-that-is-long-enough', {
    expiresIn: '1h',
  });
}

/**
 * Generate a test token for a different organization (for multi-tenancy tests)
 */
export function generateOtherOrgToken(): string {
  return generateTestToken({
    userId: 'other-user-001',
    email: 'other@mizano.com',
    organizationId: 'other-org-002',
  });
}
