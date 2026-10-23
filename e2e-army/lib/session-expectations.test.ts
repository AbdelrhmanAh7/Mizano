import {
  buildSessionExpectation,
  assertSessionMatches,
  SEED_EMAIL,
  SEED_USER,
} from './session-expectations';

describe('buildSessionExpectation', () => {
  const seedEmail = SEED_EMAIL;

  describe('override mode', () => {
    it('returns override mode for a non-seed email', () => {
      const env = { E2E_USER_EMAIL: 'qa.other@example.test', E2E_USER_PASSWORD: 'any' };
      const expectation = buildSessionExpectation(env);
      expect(expectation.mode).toBe('override');
    });

    it('expects non-empty strings for all six seed fields in override mode', () => {
      const env = { E2E_USER_EMAIL: 'qa.other@example.test', E2E_USER_PASSWORD: 'any' };
      const expectation = buildSessionExpectation(env);
      const fields = ['id', 'name', 'firstName', 'lastName', 'organizationId', 'role'] as const;
      for (const field of fields) {
        expect(expectation.user[field]).toEqual({ kind: 'nonEmptyString' });
      }
    });

    it('expects email to match the override (trimmed, case-insensitive)', () => {
      const env = { E2E_USER_EMAIL: '  QA.OTHER@EXAMPLE.TEST  ', E2E_USER_PASSWORD: 'any' };
      const expectation = buildSessionExpectation(env);
      expect(expectation.user.email).toEqual({ kind: 'email', value: 'qa.other@example.test' });
    });

    it('contains no seed literals in override mode', () => {
      const env = { E2E_USER_EMAIL: 'qa.other@example.test', E2E_USER_PASSWORD: 'any' };
      const expectation = buildSessionExpectation(env);
      const serialized = JSON.stringify(expectation);
      expect(serialized).not.toContain('user-admin');
      expect(serialized).not.toContain('seed-org-001');
      expect(serialized).not.toContain('Admin');
    });
  });

  describe('seed mode', () => {
    it('returns seed mode when E2E_USER_EMAIL is unset', () => {
      const env = { E2E_USER_PASSWORD: 'any' };
      const expectation = buildSessionExpectation(env);
      expect(expectation.mode).toBe('seed');
    });

    it('returns seed mode when E2E_USER_EMAIL is empty string', () => {
      const env = { E2E_USER_EMAIL: '', E2E_USER_PASSWORD: 'any' };
      const expectation = buildSessionExpectation(env);
      expect(expectation.mode).toBe('seed');
    });

    it('returns seed mode when E2E_USER_EMAIL is whitespace', () => {
      const env = { E2E_USER_EMAIL: '   ', E2E_USER_PASSWORD: 'any' };
      const expectation = buildSessionExpectation(env);
      expect(expectation.mode).toBe('seed');
    });

    it('returns seed mode when E2E_USER_EMAIL equals seed email (different case)', () => {
      const env = { E2E_USER_EMAIL: 'ADMIN@MIZANO.COM', E2E_USER_PASSWORD: 'any' };
      const expectation = buildSessionExpectation(env);
      expect(expectation.mode).toBe('seed');
    });

    it('returns seed mode when E2E_USER_EMAIL equals seed email (with whitespace)', () => {
      const env = { E2E_USER_EMAIL: '  admin@mizano.com  ', E2E_USER_PASSWORD: 'any' };
      const expectation = buildSessionExpectation(env);
      expect(expectation.mode).toBe('seed');
    });

    it('returns seed mode when only E2E_USER_PASSWORD is overridden', () => {
      const env = { E2E_USER_PASSWORD: 'different-password' };
      const expectation = buildSessionExpectation(env);
      expect(expectation.mode).toBe('seed');
    });

    it('expects exact seed literals in seed mode', () => {
      const env = { E2E_USER_PASSWORD: 'any' };
      const expectation = buildSessionExpectation(env);
      expect(expectation.user.id).toEqual({ kind: 'exact', value: SEED_USER.id });
      expect(expectation.user.email).toEqual({ kind: 'exact', value: SEED_EMAIL });
      expect(expectation.user.name).toEqual({ kind: 'exact', value: SEED_USER.name });
      expect(expectation.user.firstName).toEqual({ kind: 'exact', value: SEED_USER.firstName });
      expect(expectation.user.lastName).toEqual({ kind: 'exact', value: SEED_USER.lastName });
      expect(expectation.user.organizationId).toEqual({
        kind: 'exact',
        value: SEED_USER.organizationId,
      });
      expect(expectation.user.role).toEqual({ kind: 'exact', value: SEED_USER.role });
    });
  });
});

describe('assertSessionMatches', () => {
  it('fails with field name when a required field is missing', () => {
    const expectation = buildSessionExpectation({
      E2E_USER_EMAIL: 'qa.other@example.test',
      E2E_USER_PASSWORD: 'any',
    });
    const user = {
      id: 'u1',
      name: 'Test',
      firstName: 'Test',
      lastName: 'User',
      organizationId: '',
      role: 'User',
      email: 'qa.other@example.test',
    };
    expect(() => assertSessionMatches(user, expectation)).toThrow(/organizationId/);
  });

  it('fails with field name when a required field is empty', () => {
    const expectation = buildSessionExpectation({
      E2E_USER_EMAIL: 'qa.other@example.test',
      E2E_USER_PASSWORD: 'any',
    });
    const user = {
      id: 'u1',
      name: 'Test',
      firstName: 'Test',
      lastName: 'User',
      organizationId: 'org-1',
      role: '',
      email: 'qa.other@example.test',
    };
    expect(() => assertSessionMatches(user, expectation)).toThrow(/role/);
  });

  it('passes for a valid override user with Arabic names', () => {
    const expectation = buildSessionExpectation({
      E2E_USER_EMAIL: 'qa.arabic@example.test',
      E2E_USER_PASSWORD: 'any',
    });
    const user = {
      id: 'u1',
      name: 'أحمد محمد',
      firstName: 'أحمد',
      lastName: 'محمد',
      organizationId: 'org-1',
      role: 'User',
      email: 'qa.arabic@example.test',
    };
    expect(() => assertSessionMatches(user, expectation)).not.toThrow();
  });

  it('fails with clear message when user is missing', () => {
    const expectation = buildSessionExpectation({
      E2E_USER_EMAIL: 'qa.other@example.test',
      E2E_USER_PASSWORD: 'any',
    });
    expect(() => assertSessionMatches(null as any, expectation)).toThrow(/user|session/i);
  });

  it('fails with clear message when user is undefined', () => {
    const expectation = buildSessionExpectation({
      E2E_USER_EMAIL: 'qa.other@example.test',
      E2E_USER_PASSWORD: 'any',
    });
    expect(() => assertSessionMatches(undefined as any, expectation)).toThrow(/user|session/i);
  });

  describe('seed mode assertions', () => {
    const seedExpectation = buildSessionExpectation({});

    it('passes for exact seed user', () => {
      const user = { ...SEED_USER, email: SEED_EMAIL };
      expect(() => assertSessionMatches(user, seedExpectation)).not.toThrow();
    });

    it('fails when id is altered', () => {
      const user = { ...SEED_USER, email: SEED_EMAIL, id: 'different-id' };
      expect(() => assertSessionMatches(user, seedExpectation)).toThrow(/id/);
    });

    it('fails when name is altered', () => {
      const user = { ...SEED_USER, email: SEED_EMAIL, name: 'Different Name' };
      expect(() => assertSessionMatches(user, seedExpectation)).toThrow(/name/);
    });

    it('fails when firstName is altered', () => {
      const user = { ...SEED_USER, email: SEED_EMAIL, firstName: 'Different' };
      expect(() => assertSessionMatches(user, seedExpectation)).toThrow(/firstName/);
    });

    it('fails when lastName is altered', () => {
      const user = { ...SEED_USER, email: SEED_EMAIL, lastName: 'Different' };
      expect(() => assertSessionMatches(user, seedExpectation)).toThrow(/lastName/);
    });

    it('fails when organizationId is altered', () => {
      const user = { ...SEED_USER, email: SEED_EMAIL, organizationId: 'different-org' };
      expect(() => assertSessionMatches(user, seedExpectation)).toThrow(/organizationId/);
    });

    it('fails when role is altered', () => {
      const user = { ...SEED_USER, email: SEED_EMAIL, role: 'Different' };
      expect(() => assertSessionMatches(user, seedExpectation)).toThrow(/role/);
    });

    it('fails when email is altered', () => {
      const user = { ...SEED_USER, email: 'different@email.com' };
      expect(() => assertSessionMatches(user, seedExpectation)).toThrow(/email/);
    });
  });
});
