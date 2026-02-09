import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { OrganizationGuard } from './organization.guard';

describe('OrganizationGuard', () => {
  let guard: OrganizationGuard;

  beforeEach(() => {
    guard = new OrganizationGuard();
  });

  function createMockContext(
    user: any,
    params: any = {},
    query: any = {},
    body: any = {},
  ): ExecutionContext {
    return {
      switchToHttp: () => ({
        getRequest: () => ({ user, params, query, body }),
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as any;
  }

  it('should throw ForbiddenException when user is null', () => {
    const context = createMockContext(null);
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('should throw ForbiddenException when user has no organizationId', () => {
    const context = createMockContext({ id: 'user-1' });
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    expect(() => guard.canActivate(context)).toThrow('User organization not found');
  });

  it('should allow when no organizationId in request (uses @CurrentOrg)', () => {
    const context = createMockContext({ id: 'user-1', organizationId: 'org-1' });
    expect(guard.canActivate(context)).toBe(true);
  });

  it('should allow when request orgId matches user orgId (via params)', () => {
    const context = createMockContext(
      { id: 'user-1', organizationId: 'org-1' },
      { organizationId: 'org-1' },
    );
    expect(guard.canActivate(context)).toBe(true);
  });

  it('should allow when request orgId matches user orgId (via query)', () => {
    const context = createMockContext(
      { id: 'user-1', organizationId: 'org-1' },
      {},
      { organizationId: 'org-1' },
    );
    expect(guard.canActivate(context)).toBe(true);
  });

  it('should allow when request orgId matches user orgId (via body)', () => {
    const context = createMockContext(
      { id: 'user-1', organizationId: 'org-1' },
      {},
      {},
      { organizationId: 'org-1' },
    );
    expect(guard.canActivate(context)).toBe(true);
  });

  it('should throw ForbiddenException when orgId does not match (params)', () => {
    const context = createMockContext(
      { id: 'user-1', organizationId: 'org-1' },
      { organizationId: 'org-2' },
    );
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    expect(() => guard.canActivate(context)).toThrow(
      'You do not have access to this organization',
    );
  });

  it('should throw ForbiddenException when orgId does not match (query)', () => {
    const context = createMockContext(
      { id: 'user-1', organizationId: 'org-1' },
      {},
      { organizationId: 'org-other' },
    );
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('should throw ForbiddenException when orgId does not match (body)', () => {
    const context = createMockContext(
      { id: 'user-1', organizationId: 'org-1' },
      {},
      {},
      { organizationId: 'org-other' },
    );
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('should prioritize params over query and body', () => {
    // params has matching orgId, query has wrong orgId
    const context = createMockContext(
      { id: 'user-1', organizationId: 'org-1' },
      { organizationId: 'org-1' },
      { organizationId: 'org-wrong' },
    );
    expect(guard.canActivate(context)).toBe(true);
  });
});
