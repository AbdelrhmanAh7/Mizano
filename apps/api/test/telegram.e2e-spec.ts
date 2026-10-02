/**
 * Telegram intake (issue #20): real API, real login and PostgreSQL; only the Telegram Bot API
 * client is replaced. A linked chat's document becomes an intake job in that organization only.
 */
import { INestApplication } from '@nestjs/common';
import { IntakeSource } from '@prisma/client';
import { createTestApp, getPrisma, uniqueSuffix } from './helpers/app.helper';
import { registerTenant, TestTenant } from './helpers/tenant.helper';
import { ExtractionStrategyResolver } from '../src/modules/ai/extraction/extraction-strategy-resolver.service';
import { TelegramClient, TelegramUpdate } from '../src/modules/telegram/telegram.client';
import { TelegramIntakeService } from '../src/modules/telegram/telegram-intake.service';
import { PrismaService } from '../src/prisma/prisma.service';

const sent: { chatId: string; text: string }[] = [];
let files: Record<string, Buffer> = {};

const fakeClient: TelegramClient = {
  isEnabled: () => false,
  getUpdates: async () => [],
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
    await app.close();
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
    files = { y: Buffer.from(`%PDF after unlink ${uniqueSuffix()}`) };
    await sendDoc(chatA, 'y');
    expect(sent.at(-1)?.text).toContain('not linked');
    expect(await prisma.intakeJob.count({ where: { organizationId: a.organizationId } })).toBe(
      before,
    );
  });
});
