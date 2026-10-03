/**
 * Telegram intake (issue #20): real API, login and PostgreSQL. The Telegram client and
 * extraction resolver are replaced; this verifies durable ingestion and tenant isolation.
 */
import { INestApplication } from '@nestjs/common';
import { IntakeSource } from '@prisma/client';
import { createTestApp, getPrisma, uniqueSuffix } from './helpers/app.helper';
import { registerTenant, TestTenant } from './helpers/tenant.helper';
import { ExtractionStrategyResolver } from '../src/modules/ai/extraction/extraction-strategy-resolver.service';
import { TelegramClient, TelegramUpdate } from '../src/modules/telegram/telegram.client';
import { TelegramIntakeService } from '../src/modules/telegram/telegram-intake.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { TelegramLinkService } from '../src/modules/telegram/telegram-link.service';
import { IntakeJobsService } from '../src/modules/ai/intake/intake-jobs.service';
import * as request from 'supertest';

const sent: { chatId: string; text: string }[] = [];
let files: Record<string, Buffer> = {};
let pending: TelegramUpdate[] = [];
// Deliveries are keyed by (bot, update id) and never deleted: a per-run bot key keeps reruns
// against the same database from replaying an earlier run's receipts.
const BOT_KEY = `telegram-e2e-${uniqueSuffix()}`;

const fakeClient: TelegramClient = {
  isEnabled: () => false,
  pollKey: () => BOT_KEY,
  canManageChannel: async () => true,
  getUpdates: async () => pending.splice(0),
  downloadFile: async (fileId: string) => files[fileId],
  sendMessage: async (chatId: string, text: string) => {
    sent.push({ chatId, text });
  },
  shutdown: () => undefined,
};

// Extraction is held open while a test runs (only ingestion matters) and released on close.
const held: ((error: Error) => void)[] = [];
const pendingResolver = {
  resolve: () =>
    new Promise<never>((_resolve, reject) => {
      held.push(reject);
    }),
};

describe('Telegram intake (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let intake: TelegramIntakeService;
  let a: TestTenant;
  let b: TestTenant;
  const chatA = `${Date.now()}1`;
  const chatB = `${Date.now()}2`;
  let updateId = 1;

  const msg = (chat: string, extra: Record<string, unknown>): TelegramUpdate => ({
    update_id: updateId++,
    message: { message_id: updateId, chat: { id: chat, type: 'private' }, ...extra },
  });
  const sendDoc = (chat: string, fileId: string, name = 'inv.pdf') =>
    intake.handleUpdate(
      msg(chat, {
        document: { file_id: fileId, file_name: name, mime_type: 'application/pdf', file_size: 50 },
      }),
    );

  async function link(tenant: TestTenant, chat: string): Promise<void> {
    const res = await tenant.api.post('/telegram/link-code');
    expect(res.status).toBe(201);
    await intake.handleUpdate(msg(chat, { text: res.body.data.command }));
  }

  beforeAll(async () => {
    app = await createTestApp((builder) =>
      builder
        .overrideProvider(TelegramClient)
        .useValue(fakeClient)
        .overrideProvider(ExtractionStrategyResolver)
        .useValue(pendingResolver),
    );
    prisma = getPrisma(app);
    intake = app.get(TelegramIntakeService);
    a = await registerTenant(app, 'TgA');
    b = await registerTenant(app, 'TgB');
  });

  afterAll(async () => {
    held.forEach((release) => release(new Error('test teardown')));
    await app?.close();
  });

  it('refuses an unlinked chat and stores nothing', async () => {
    files = { f0: Buffer.from(`%PDF unlinked ${uniqueSuffix()}`) };
    await sendDoc(chatA, 'f0');
    expect(sent.at(-1)?.text).toContain('not linked');
    expect(await prisma.intakeJob.count({ where: { organizationId: a.organizationId } })).toBe(0);
  });

  it('links via a one-time code; the code cannot be replayed', async () => {
    const res = await a.api.post('/telegram/link-code');
    expect(res.status).toBe(201);
    const { code } = res.body.data as { code: string };
    const stored = await prisma.telegramLinkCode.findMany({
      where: { organizationId: a.organizationId },
    });
    expect(stored.some((c) => c.codeHash === code)).toBe(false);

    await intake.handleUpdate(msg(chatA, { text: `/link ${code}` }));
    expect(sent.at(-1)?.text).toContain('Linked');
    await intake.handleUpdate(msg(chatB, { text: `/link ${code}` }));
    expect(sent.at(-1)?.text).toContain('invalid or expired');
    await link(b, chatB);

    const links = await a.api.get('/telegram/links');
    expect(links.body.data).toHaveLength(1);
    expect(links.body.data[0].chatId).toBe(chatA);
  });

  it('creates the intake job in the linked organization only, and deduplicates', async () => {
    const content = Buffer.from(`%PDF-1.4 tg ${uniqueSuffix()}`);
    files = { f1: content };
    await sendDoc(chatA, 'f1');
    expect(sent.at(-1)?.text).toContain('Received');

    const jobs = await prisma.intakeJob.findMany({ where: { organizationId: a.organizationId } });
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      source: IntakeSource.TELEGRAM,
      createdById: a.userId,
      mimeType: 'application/pdf',
    });
    expect(await prisma.intakeJob.count({ where: { organizationId: b.organizationId } })).toBe(0);

    const own = await a.api.get(`/ai/document-intake/${jobs[0].id}/result`);
    expect(own.status).toBe(200);
    const other = await b.api.get(`/ai/document-intake/${jobs[0].id}/result`);
    expect(other.status).toBe(404);
    expect(JSON.stringify((await b.api.get('/ai/document-intake/jobs')).body)).not.toContain(
      jobs[0].id,
    );

    await sendDoc(chatA, 'f1');
    expect(sent.at(-1)?.text).toContain('already received');
    expect(await prisma.intakeJob.count({ where: { organizationId: a.organizationId } })).toBe(1);
  });

  it('the same file from the other tenant is its own job, not a duplicate', async () => {
    const content = Buffer.from(`%PDF-1.4 shared ${uniqueSuffix()}`);
    files = { s: content };
    await sendDoc(chatA, 's');
    await sendDoc(chatB, 's');
    expect(await prisma.intakeJob.count({ where: { organizationId: b.organizationId } })).toBe(1);
  });

  it('rejects unsupported types and unlinking stops ingestion', async () => {
    files = { x: Buffer.from('MZ') };
    const before = await prisma.intakeJob.count({ where: { organizationId: a.organizationId } });
    await intake.handleUpdate(
      msg(chatA, {
        document: { file_id: 'x', file_name: 'a.exe', mime_type: 'application/x-msdownload' },
      }),
    );
    expect(sent.at(-1)?.text).toContain('Unsupported');

    const [row] = (await a.api.get('/telegram/links')).body.data as { id: string }[];
    expect((await b.api.delete(`/telegram/links/${row.id}`)).status).toBe(404);
    expect((await a.api.delete(`/telegram/links/${row.id}`)).status).toBe(204);
    const audit = await prisma.auditLog.findMany({
      where: { organizationId: a.organizationId, entityType: 'TelegramLink', entityId: row.id },
    });
    expect(audit.map((entry) => [entry.action, entry.userId]).sort()).toEqual([
      ['CREATE', a.userId],
      ['DELETE', a.userId],
    ]);
    expect(
      await prisma.auditLog.count({
        where: { organizationId: b.organizationId, entityType: 'TelegramLink', entityId: row.id },
      }),
    ).toBe(0);
    files = { y: Buffer.from(`%PDF after unlink ${uniqueSuffix()}`) };
    await sendDoc(chatA, 'y');
    expect(sent.at(-1)?.text).toContain('not linked');
    expect(await prisma.intakeJob.count({ where: { organizationId: a.organizationId } })).toBe(
      before,
    );
  });

  it('requires authentication and rejects a foreign organization before issuing a code', async () => {
    expect((await request(app.getHttpServer()).post('/telegram/link-code')).status).toBe(401);
    expect((await request(app.getHttpServer()).get('/telegram/links')).status).toBe(401);
    expect(
      (await a.api.post('/telegram/link-code').send({ organizationId: b.organizationId })).status,
    ).toBe(403);
  });

  it('atomically consumes a code under concurrent redemption', async () => {
    const res = await a.api.post('/telegram/link-code');
    expect(res.status).toBe(201);
    const links = app.get(TelegramLinkService);
    const results = await Promise.all([
      links.redeem(res.body.data.code as string, `${chatA}10`),
      links.redeem(res.body.data.code as string, `${chatA}11`),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual(['invalid', 'linked']);
  });

  it('replays the exact update after restart/relink without copying it to another tenant', async () => {
    const chat = `${chatA}12`;
    await link(a, chat);
    const content = Buffer.from(`%PDF replay ${uniqueSuffix()}`);
    files = { replay: content };
    const update = msg(chat, {
      document: { file_id: 'replay', mime_type: 'application/pdf', file_name: 'replay.pdf' },
    });
    await intake.handleUpdate(update);
    const receipt = await prisma.telegramDelivery.findFirst({
      where: {
        organizationId: a.organizationId,
        botKey: fakeClient.pollKey(),
        updateId: BigInt(update.update_id),
      },
    });
    expect(receipt?.intakeJobId).toEqual(expect.any(String));
    const links = app.get(TelegramLinkService);
    const bound = await links.findByChat(chat);
    expect(bound).not.toBeNull();
    await links.unlink(bound!.id, a.organizationId, a.userId);
    await link(b, chat);
    const beforeB = await prisma.intakeJob.count({ where: { organizationId: b.organizationId } });
    const restarted = new TelegramIntakeService(
      prisma,
      fakeClient,
      links,
      app.get(IntakeJobsService),
    );
    await restarted.handleUpdate(update);
    expect(await prisma.intakeJob.count({ where: { organizationId: b.organizationId } })).toBe(
      beforeB,
    );
    expect((await a.api.get(`/ai/document-intake/${receipt!.intakeJobId}/result`)).status).toBe(
      200,
    );
    expect((await b.api.get(`/ai/document-intake/${receipt!.intakeJobId}/result`)).status).toBe(
      404,
    );
  });

  it('links an authorized private channel and accepts a channel_post exactly once', async () => {
    const channel = `-${chatA}13`;
    const res = await a.api.post('/telegram/link-code');
    expect(res.status).toBe(201);
    await intake.handleUpdate(
      msg('42', { from: { id: 42 }, text: `${res.body.data.command} ${channel}` }),
    );
    expect(sent.at(-1)?.text).toContain('Linked');
    const before = await prisma.intakeJob.count({ where: { organizationId: a.organizationId } });
    files = { channel: Buffer.from(`%PDF channel ${uniqueSuffix()}`) };
    const update: TelegramUpdate = {
      update_id: updateId++,
      channel_post: {
        message_id: updateId,
        chat: { id: channel, type: 'channel' },
        document: { file_id: 'channel', mime_type: 'application/pdf' },
      },
    };
    await intake.handleUpdate(update);
    await intake.handleUpdate(update);
    expect(await prisma.intakeJob.count({ where: { organizationId: a.organizationId } })).toBe(
      before + 1,
    );
  });

  it('rolls back code consumption when a different tenant already owns the chat', async () => {
    const links = app.get(TelegramLinkService);
    const res = await a.api.post('/telegram/link-code');
    expect(res.status).toBe(201);
    const code = res.body.data.code as string;
    expect((await links.redeem(code, chatB)).status).toBe('linked-elsewhere');
    expect((await links.redeem(code, `${chatA}14`)).status).toBe('linked');
  });

  it('reuses the durable original after a crash before delivery completion', async () => {
    const chat = `${chatA}15`;
    await link(a, chat);
    files = { crash: Buffer.from(`%PDF crash ${uniqueSuffix()}`) };
    const update = msg(chat, { document: { file_id: 'crash', mime_type: 'application/pdf' } });
    const before = await prisma.intakeJob.count({ where: { organizationId: a.organizationId } });
    const realUpdate = prisma.telegramDelivery.updateMany.bind(prisma.telegramDelivery);
    const fault = jest.spyOn(prisma.telegramDelivery, 'updateMany').mockImplementation((args) => {
      if (args.data.completedAt) throw new Error('injected receipt write failure');
      return realUpdate(args);
    });
    try {
      await expect(intake.handleUpdate(update)).rejects.toThrow('injected receipt write failure');
    } finally {
      fault.mockRestore();
    }
    expect(await prisma.intakeJob.count({ where: { organizationId: a.organizationId } })).toBe(
      before + 1,
    );
    const restarted = new TelegramIntakeService(
      prisma,
      fakeClient,
      app.get(TelegramLinkService),
      app.get(IntakeJobsService),
    );
    await restarted.handleUpdate(update);
    expect(await prisma.intakeJob.count({ where: { organizationId: a.organizationId } })).toBe(
      before + 1,
    );
    const receipt = await prisma.telegramDelivery.findFirst({
      where: {
        organizationId: a.organizationId,
        botKey: fakeClient.pollKey(),
        updateId: BigInt(update.update_id),
      },
    });
    expect(receipt).toMatchObject({
      completedAt: expect.any(Date),
      intakeJobId: expect.any(String),
    });
  });

  it('defers a rate-limited chat durably, never holds back another tenant, and resumes after a restart', async () => {
    const chat = `${chatA}16`;
    await link(a, chat);
    const beforeA = await prisma.intakeJob.count({ where: { organizationId: a.organizationId } });
    const beforeB = await prisma.intakeJob.count({ where: { organizationId: b.organizationId } });
    files = {};
    const flood: TelegramUpdate[] = [];
    for (let i = 0; i < 12; i += 1) {
      files[`flood-${i}`] = Buffer.from(`%PDF flood ${i} ${uniqueSuffix()}`);
      flood.push(
        msg(chat, {
          document: {
            file_id: `flood-${i}`,
            file_name: `flood-${i}.pdf`,
            mime_type: 'application/pdf',
          },
        }),
      );
    }
    files.other = Buffer.from(`%PDF other ${uniqueSuffix()}`);
    const other = msg(chatB, {
      document: { file_id: 'other', file_name: 'other.pdf', mime_type: 'application/pdf' },
    });
    pending = [...flood, other];

    // One poll batch: the linking message used one of the chat's ten hits this minute, so nine
    // flood documents are ingested and three are recorded as deferred. Tenant B's later document
    // is ingested in the same batch and the cursor moves past everything.
    await expect(intake.pollOnce(0)).resolves.toBe(13);
    expect(await intake.loadOffset()).toBe(other.update_id + 1);
    expect(await prisma.intakeJob.count({ where: { organizationId: b.organizationId } })).toBe(
      beforeB + 1,
    );
    expect(await prisma.intakeJob.count({ where: { organizationId: a.organizationId } })).toBe(
      beforeA + 9,
    );
    const waiting = await prisma.telegramDelivery.findMany({
      where: {
        botKey: BOT_KEY,
        organizationId: a.organizationId,
        completedAt: null,
        deferredUntil: { not: null },
      },
      orderBy: { updateId: 'asc' },
    });
    expect(waiting.map((row) => row.fileId)).toEqual(['flood-9', 'flood-10', 'flood-11']);
    expect(waiting.every((row) => row.chatId === chat && row.attempts === 0)).toBe(true);

    // A fresh process (empty rate windows) resumes them from the database alone.
    await prisma.telegramDelivery.updateMany({
      where: { botKey: BOT_KEY, completedAt: null },
      data: { deferredUntil: new Date(Date.now() - 1000) },
    });
    const restarted = new TelegramIntakeService(
      prisma,
      fakeClient,
      app.get(TelegramLinkService),
      app.get(IntakeJobsService),
    );
    await expect(restarted.drainDeferred()).resolves.toBe(3);
    expect(await prisma.intakeJob.count({ where: { organizationId: a.organizationId } })).toBe(
      beforeA + 12,
    );
    const resumed = await prisma.telegramDelivery.findMany({
      where: {
        botKey: BOT_KEY,
        organizationId: a.organizationId,
        fileId: { startsWith: 'flood-' },
      },
    });
    expect(resumed).toHaveLength(12);
    expect(
      resumed.every((row) => row.completedAt !== null && typeof row.intakeJobId === 'string'),
    ).toBe(true);
    await expect(restarted.drainDeferred()).resolves.toBe(0);
  });
});
