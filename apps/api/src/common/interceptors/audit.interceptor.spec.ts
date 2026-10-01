import { ExecutionContext } from '@nestjs/common';
import { AuditAction, Prisma } from '@prisma/client';
import { lastValueFrom, of } from 'rxjs';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditInterceptor } from './audit.interceptor';

interface FakeRequest {
  method: string;
  path: string;
  params?: Record<string, string>;
  body?: unknown;
  ip?: string;
  headers: Record<string, string>;
  user?: { id: string; organizationId?: string };
}

function makeContext(request: FakeRequest): ExecutionContext {
  return { switchToHttp: () => ({ getRequest: () => request }) } as unknown as ExecutionContext;
}

const flush = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

describe('AuditInterceptor', () => {
  let create: jest.Mock;
  let interceptor: AuditInterceptor;

  const baseRequest = (): FakeRequest => ({
    method: 'POST',
    path: '/api/customers',
    params: {},
    body: { name: 'Acme' },
    ip: '10.0.0.1',
    headers: { 'user-agent': 'jest' },
    user: { id: 'user-1', organizationId: 'org-1' },
  });

  const run = async (request: FakeRequest, response: unknown): Promise<unknown> => {
    const result = await lastValueFrom(
      interceptor.intercept(makeContext(request), { handle: () => of(response) }),
    );
    await flush();
    return result;
  };

  beforeEach(() => {
    create = jest.fn().mockResolvedValue({});
    interceptor = new AuditInterceptor({ auditLog: { create } } as unknown as PrismaService);
  });

  it('does not touch the response it passes through', async () => {
    const response = { id: 'c-1', passwordHash: 'x' };
    await expect(run(baseRequest(), response)).resolves.toBe(response);
  });

  it('stores entity, action, user and org with a minimal summary', async () => {
    await run(baseRequest(), { id: 'c-1', name: 'Acme', status: 'ACTIVE' });

    expect(create).toHaveBeenCalledTimes(1);
    const { data } = create.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(data).toMatchObject({
      userId: 'user-1',
      organizationId: 'org-1',
      action: AuditAction.CREATE,
      entityType: 'customers',
      entityId: 'c-1',
      ipAddress: '10.0.0.1',
      userAgent: 'jest',
    });
    expect(data.oldValues).toBe(Prisma.DbNull);
    expect(data.newValues).toEqual({
      fields: ['name'],
      status: 'ACTIVE',
    });
  });

  it('never persists the response or secrets from the request', async () => {
    const request = baseRequest();
    request.method = 'PATCH';
    request.params = { id: 'u-9' };
    request.body = {
      displayName: 'Sara',
      password: 'hunter2',
      refreshToken: 'refresh-123',
      settings: { apiKey: 'key-456', theme: 'dark' },
    };
    const response = {
      id: 'u-9',
      passwordHash: 'bcrypt-hash-value',
      accessToken: 'jwt-token-value',
      taxId: '999-888',
      lines: [{ description: 'confidential line' }],
    };

    await run(request, response);

    const { data } = create.mock.calls[0][0] as { data: Record<string, unknown> };
    const stored = JSON.stringify(data);
    for (const leaked of [
      'hunter2',
      'refresh-123',
      'key-456',
      'bcrypt-hash-value',
      'jwt-token-value',
      '999-888',
      'confidential line',
    ]) {
      expect(stored).not.toContain(leaked);
    }
    expect(data.action).toBe(AuditAction.UPDATE);
    // Request values are never stored, harmless ones included; only field names are.
    expect(stored).not.toContain('dark');
    expect(data.newValues).toEqual({
      fields: ['displayName', 'password', 'refreshToken', 'settings'],
    });
  });

  it('ignores a client-supplied _oldData snapshot', async () => {
    const request = baseRequest();
    request.method = 'PUT';
    request.body = { name: 'x', _oldData: { forged: 'snapshot', password: 'p' } };
    await run(request, { id: 'c-1' });
    const { data } = create.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(data.oldValues).toBe(Prisma.DbNull);
  });

  it('records deletes without any values', async () => {
    const request = baseRequest();
    request.method = 'DELETE';
    request.path = '/api/customers/c-7';
    request.params = { id: 'c-7' };
    request.body = {};
    await run(request, { id: 'c-7', secret: 'x' });
    const { data } = create.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(data).toMatchObject({ action: AuditAction.DELETE, entityId: 'c-7' });
    expect(data.newValues).toBe(Prisma.DbNull);
  });

  it.each([
    ['GET requests', (r: FakeRequest): void => void (r.method = 'GET')],
    ['unauthenticated requests', (r: FakeRequest): void => void (r.user = undefined)],
    ['users without an organization', (r: FakeRequest): void => void (r.user = { id: 'u' })],
    ['logger endpoints', (r: FakeRequest): void => void (r.path = '/api/logger/capture')],
  ])('does not audit %s', async (_label, mutate) => {
    const request = baseRequest();
    mutate(request);
    await run(request, { id: 'x' });
    expect(create).not.toHaveBeenCalled();
  });

  it('never fails the request and logs only a safe description when the audit write fails', async () => {
    create.mockRejectedValue(
      Object.assign(new Error('Invalid prisma.auditLog.create() args: {"password":"hunter2"}'), {
        name: 'PrismaClientValidationError',
      }),
    );
    const errorSpy = jest
      .spyOn((interceptor as unknown as { logger: { error: () => void } }).logger, 'error')
      .mockImplementation(() => undefined);

    await expect(run(baseRequest(), { id: 'c-1' })).resolves.toEqual({ id: 'c-1' });

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const logged = JSON.stringify(errorSpy.mock.calls);
    expect(logged).toContain('PrismaClientValidationError');
    expect(logged).not.toContain('hunter2');
  });
});
