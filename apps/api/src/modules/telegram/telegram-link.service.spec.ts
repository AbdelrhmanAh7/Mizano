import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { hashLinkCode, TelegramLinkService } from './telegram-link.service';

interface CodeRow {
  organizationId: string;
  createdById: string;
  codeHash: string;
  expiresAt: Date;
  usedAt: Date | null;
}
interface LinkRow {
  id: string;
  organizationId: string;
  chatId: string;
  linkedById: string;
}

function setup() {
  const codes: CodeRow[] = [];
  const links: LinkRow[] = [];
  const delegates = {
    user: {
      findFirst: jest.fn(
        async () =>
          ({ role: { name: 'Admin', permissions: [] } }) as {
            role: { name: string; permissions: { module: string; actions: string[] }[] };
          } | null,
      ),
    },
    auditLog: { create: jest.fn(async () => ({})) },
    telegramLinkCode: {
      deleteMany: jest.fn(async () => ({ count: 0 })),
      create: jest.fn(async ({ data }: { data: Omit<CodeRow, 'usedAt'> }) => {
        codes.push({ ...data, usedAt: null });
      }),
      updateMany: jest.fn(
        async ({
          where,
          data,
        }: {
          where: { codeHash: string; expiresAt: { gt: Date } };
          data: { usedAt: Date };
        }) => {
          const hit = codes.filter(
            (c) => c.codeHash === where.codeHash && !c.usedAt && c.expiresAt > where.expiresAt.gt,
          );
          hit.forEach((c) => (c.usedAt = data.usedAt));
          return { count: hit.length };
        },
      ),
      findUnique: jest.fn(
        async ({ where }: { where: { codeHash: string } }) =>
          codes.find((c) => c.codeHash === where.codeHash) ?? null,
      ),
    },
    telegramLink: {
      findUnique: jest.fn(
        async ({ where }: { where: { chatId: string } }) =>
          links.find((l) => l.chatId === where.chatId) ?? null,
      ),
      findFirst: jest.fn(
        async ({ where }: { where: { id: string; organizationId: string } }) =>
          links.find((l) => l.id === where.id && l.organizationId === where.organizationId) ?? null,
      ),
      create: jest.fn(async ({ data }: { data: Omit<LinkRow, 'id'> }) => {
        const row = { id: `l${links.length + 1}`, ...data };
        links.push(row);
        return row;
      }),
      deleteMany: jest.fn(async ({ where }: { where: { id: string; organizationId: string } }) => {
        const before = links.length;
        const keep = links.filter(
          (l) => !(l.id === where.id && l.organizationId === where.organizationId),
        );
        links.length = 0;
        links.push(...keep);
        return { count: before - keep.length };
      }),
    },
  };
  const prisma = {
    ...delegates,
    $transaction: async <T>(fn: (tx: typeof delegates) => Promise<T>): Promise<T> => fn(delegates),
  } as unknown as PrismaService;
  return { svc: new TelegramLinkService(prisma), codes, links, delegates };
}

describe('TelegramLinkService', () => {
  it('stores only the hash of the generated code', async () => {
    const { svc, codes } = setup();
    const { code, expiresAt } = await svc.createCode('org-1', 'user-1');
    expect(code).toMatch(/^[A-Z2-9]{8}$/);
    expect(codes[0].codeHash).toBe(hashLinkCode(code));
    expect(JSON.stringify(codes)).not.toContain(code);
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('links a chat once; the code cannot be reused', async () => {
    const { svc, links } = setup();
    const { code } = await svc.createCode('org-1', 'user-1');
    const first = await svc.redeem(code.toLowerCase(), '42');
    expect(first.status).toBe('linked');
    expect(links[0]).toMatchObject({ organizationId: 'org-1', chatId: '42', linkedById: 'user-1' });
    expect((await svc.redeem(code, '43')).status).toBe('invalid');
    expect(links).toHaveLength(1);
  });

  it('rejects unknown and expired codes', async () => {
    const { svc, codes } = setup();
    expect((await svc.redeem('NOSUCH00', '42')).status).toBe('invalid');
    const { code } = await svc.createCode('org-1', 'user-1');
    codes[0].expiresAt = new Date(Date.now() - 1000);
    expect((await svc.redeem(code, '42')).status).toBe('invalid');
  });

  it('refuses to move a chat linked to another organization', async () => {
    const { svc, links } = setup();
    await svc.redeem((await svc.createCode('org-1', 'u1')).code, '42');
    const res = await svc.redeem((await svc.createCode('org-2', 'u2')).code, '42');
    expect(res.status).toBe('linked-elsewhere');
    expect(links).toHaveLength(1);
    expect(links[0].organizationId).toBe('org-1');
  });

  it('re-linking to the same organization is a no-op', async () => {
    const { svc } = setup();
    await svc.redeem((await svc.createCode('org-1', 'u1')).code, '42');
    const res = await svc.redeem((await svc.createCode('org-1', 'u1')).code, '42');
    expect(res.status).toBe('already-linked');
  });

  it('unlink is scoped to the organization and writes no audit entry when nothing is removed', async () => {
    const { svc, links, delegates } = setup();
    await svc.redeem((await svc.createCode('org-1', 'u1')).code, '42');
    delegates.auditLog.create.mockClear();
    await expect(svc.unlink(links[0].id, 'org-2', 'u9')).rejects.toThrow(NotFoundException);
    expect(delegates.auditLog.create).not.toHaveBeenCalled();
    expect(links).toHaveLength(1);
    await svc.unlink(links[0].id, 'org-1', 'u9');
    expect(links).toHaveLength(0);
  });

  it('audits an unlink with the acting user in the same transaction as the delete', async () => {
    const { svc, links, delegates } = setup();
    await svc.redeem((await svc.createCode('org-1', 'u1')).code, '42');
    const linkId = links[0].id;
    delegates.auditLog.create.mockClear();
    await svc.unlink(linkId, 'org-1', 'admin-2');
    expect(delegates.auditLog.create).toHaveBeenCalledTimes(1);
    expect(delegates.auditLog.create).toHaveBeenCalledWith({
      data: {
        organizationId: 'org-1',
        userId: 'admin-2',
        action: 'DELETE',
        entityType: 'TelegramLink',
        entityId: linkId,
        oldValues: { chatId: '42', linkedById: 'u1' },
      },
    });
  });

  it('rejects codes whose creator is no longer active and authorized in the tenant', async () => {
    const { svc, delegates, codes } = setup();
    const { code } = await svc.createCode('org-1', 'user-1');
    delegates.user.findFirst.mockResolvedValueOnce(null);
    expect(await svc.redeem(code, '42')).toEqual({ status: 'invalid' });
    expect(codes[0].usedAt).toBeNull();
    expect(delegates.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'user-1',
          organizationId: 'org-1',
          status: 'ACTIVE',
          role: { organizationId: 'org-1' },
        },
      }),
    );
  });

  it('stops an existing binding when its administrator loses settings.edit', async () => {
    const { svc, delegates } = setup();
    await svc.redeem((await svc.createCode('org-1', 'user-1')).code, '42');
    expect(await svc.findByChat('42')).not.toBeNull();
    delegates.user.findFirst.mockResolvedValue({ role: { name: 'Viewer', permissions: [] } });
    expect(await svc.findByChat('42')).toBeNull();
  });

  it('permits a non-admin with settings.edit and audits only link metadata', async () => {
    const { svc, delegates } = setup();
    const { code } = await svc.createCode('org-1', 'user-1');
    delegates.user.findFirst.mockResolvedValue({
      role: { name: 'Manager', permissions: [{ module: 'settings', actions: ['edit'] }] },
    });
    expect((await svc.redeem(code, '42')).status).toBe('linked');
    expect(delegates.auditLog.create).toHaveBeenCalledWith({
      data: {
        organizationId: 'org-1',
        userId: 'user-1',
        action: 'CREATE',
        entityType: 'TelegramLink',
        entityId: 'l1',
      },
    });
    expect(JSON.stringify(delegates.auditLog.create.mock.calls)).not.toContain(code);
  });
});
