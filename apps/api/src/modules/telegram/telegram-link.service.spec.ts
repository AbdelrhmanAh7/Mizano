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
  return { svc: new TelegramLinkService(prisma), codes, links };
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

  it('unlink is scoped to the organization', async () => {
    const { svc, links } = setup();
    await svc.redeem((await svc.createCode('org-1', 'u1')).code, '42');
    await expect(svc.unlink(links[0].id, 'org-2')).rejects.toThrow(NotFoundException);
    await svc.unlink(links[0].id, 'org-1');
    expect(links).toHaveLength(0);
  });
});
