import { HttpException, HttpStatus, Logger } from '@nestjs/common';
import {
  IntakeJob,
  IntakeJobStatus,
  IntakeSource,
  TelegramDelivery,
  TelegramLink,
} from '@prisma/client';
import { IntakeJobsService } from '../ai/intake/intake-jobs.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  TelegramClient,
  TelegramApiError,
  TelegramFileTooLargeError,
  TelegramMessage,
  TelegramUpdate,
} from './telegram.client';
import { RedeemResult, TelegramLinkService } from './telegram-link.service';
import { TelegramIntakeService } from './telegram-intake.service';

const TOKEN = '123456:SECRET-BOT-TOKEN';
const CAPTION = 'INVOICE-CAPTION-SECRET';

const link: TelegramLink = {
  id: 'l1',
  organizationId: 'org-1',
  chatId: '42',
  linkedById: 'user-1',
  createdAt: new Date(),
};

function job(status: IntakeJobStatus = IntakeJobStatus.QUEUED): IntakeJob {
  return { id: 'job-1', status } as IntakeJob;
}

function doc(over: Partial<TelegramMessage> = {}): TelegramMessage {
  return {
    message_id: 7,
    chat: { id: 42, type: 'private' },
    caption: CAPTION,
    document: { file_id: 'f1', file_name: 'inv.pdf', mime_type: 'application/pdf', file_size: 100 },
    ...over,
  };
}

function setup(linked: TelegramLink | null = link) {
  let stored = 0;
  const deliveries = new Map<number, TelegramDelivery>();
  const prisma = {
    telegramPollState: {
      findUnique: jest.fn(async () =>
        stored ? { nextOffset: stored, updatedAt: new Date() } : null,
      ),
      upsert: jest.fn(async ({ create }: { create: { nextOffset: number } }) => {
        if (!stored) stored = create.nextOffset;
      }),
      updateMany: jest.fn(async ({ data }: { data: { nextOffset: number } }) => {
        stored = Math.max(stored, data.nextOffset);
        return { count: 1 };
      }),
    },
    telegramDelivery: {
      upsert: jest.fn(
        async ({
          create,
        }: {
          create: Omit<TelegramDelivery, 'attempts' | 'completedAt' | 'intakeJobId' | 'createdAt'>;
        }) => {
          const row = deliveries.get(create.updateId) ?? {
            ...create,
            attempts: 0,
            completedAt: null,
            intakeJobId: null,
            createdAt: new Date(),
          };
          deliveries.set(create.updateId, row);
          return { ...row };
        },
      ),
      updateMany: jest.fn(
        async ({
          where,
          data,
        }: {
          where: { updateId: number; organizationId: string };
          data: {
            attempts?: { increment: number };
            completedAt?: Date;
            intakeJobId?: string | null;
          };
        }) => {
          const row = deliveries.get(where.updateId);
          if (!row || row.organizationId !== where.organizationId || row.completedAt)
            return { count: 0 };
          if (data.attempts) row.attempts += data.attempts.increment;
          if (data.completedAt) row.completedAt = data.completedAt;
          if (data.intakeJobId !== undefined) row.intakeJobId = data.intakeJobId;
          return { count: 1 };
        },
      ),
    },
  } as unknown as PrismaService;
  const sent: { chatId: string; text: string }[] = [];
  const client = {
    isEnabled: jest.fn(() => true),
    pollKey: jest.fn(() => 'test-bot'),
    canManageChannel: jest.fn(async () => true),
    getUpdates: jest.fn(async (): Promise<TelegramUpdate[]> => []),
    downloadFile: jest.fn(async () => Buffer.from('%PDF-1.4 body')),
    sendMessage: jest.fn(async (chatId: string, text: string) => {
      sent.push({ chatId, text });
    }),
    shutdown: jest.fn(),
  };
  const links = {
    findByChat: jest.fn(async () => linked),
    redeem: jest.fn(async (): Promise<RedeemResult> => ({ status: 'invalid' })),
  };
  const jobs = {
    createFromUpload: jest.fn(async () => ({ job: job(), duplicate: false })),
  };
  const restart = () =>
    new TelegramIntakeService(
      prisma,
      client as unknown as TelegramClient,
      links as unknown as TelegramLinkService,
      jobs as unknown as IntakeJobsService,
    );
  return { svc: restart(), restart, client, links, jobs, prisma, sent, deliveries };
}

const upd = (message: TelegramMessage, id = 1): TelegramUpdate => ({ update_id: id, message });

describe('TelegramIntakeService', () => {
  let logged: string[];

  beforeEach(() => {
    logged = [];
    for (const level of ['log', 'warn', 'error'] as const) {
      jest.spyOn(Logger.prototype, level).mockImplementation((m: unknown) => {
        logged.push(String(m));
      });
    }
  });
  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('refuses an unlinked chat politely and stores nothing', async () => {
    const { svc, client, jobs, sent } = setup(null);
    await svc.handleUpdate(upd(doc()));
    expect(jobs.createFromUpload).not.toHaveBeenCalled();
    expect(client.downloadFile).not.toHaveBeenCalled();
    expect(sent).toHaveLength(1);
    expect(sent[0].text).toContain('not linked');
  });

  it('/link redeems the code and confirms', async () => {
    const { svc, links, sent } = setup(null);
    links.redeem.mockResolvedValueOnce({ status: 'linked', link });
    await svc.handleUpdate(
      upd({ message_id: 1, chat: { id: 42, type: 'private' }, text: '/link ABCD2345' }),
    );
    expect(links.redeem).toHaveBeenCalledWith('ABCD2345', '42');
    expect(sent[0].text).toContain('Linked');
  });

  it('/link with a bad code or no code is refused', async () => {
    const { svc, links, sent } = setup(null);
    await svc.handleUpdate(
      upd({ message_id: 1, chat: { id: 42, type: 'private' }, text: '/link@MizanoBot nope' }),
    );
    expect(links.redeem).toHaveBeenCalledWith('nope', '42');
    expect(sent[0].text).toContain('invalid or expired');
    await svc.handleUpdate(
      upd({ message_id: 2, chat: { id: 42, type: 'private' }, text: '/link' }, 2),
    );
    expect(sent[1].text).toContain('Usage');
  });

  it.each(['group', 'supergroup', 'channel', undefined] as const)(
    '/link refuses chat type %s without redeeming or storing anything',
    async (type) => {
      const { svc, links, jobs, client, sent } = setup();
      const message: TelegramMessage = {
        message_id: 1,
        chat: { id: 42, type },
        text: '/link@MizanoBot ABCD2345',
      };
      await svc.handleUpdate(
        type === 'channel' ? { update_id: 1, channel_post: message } : upd(message),
      );
      expect(links.redeem).not.toHaveBeenCalled();
      expect(links.findByChat).not.toHaveBeenCalled();
      expect(jobs.createFromUpload).not.toHaveBeenCalled();
      expect(client.downloadFile).not.toHaveBeenCalled();
      expect(sent).toEqual([
        { chatId: '42', text: expect.stringContaining('private chat with the bot') },
      ]);
    },
  );

  it('skips sender storage when upload options have no metadata and never logs the sender', async () => {
    const { svc, jobs } = setup();
    await svc.handleUpdate(upd(doc({ from: { id: 987654321, username: 'private_sender' } })));
    expect(jobs.createFromUpload).toHaveBeenCalledTimes(1);
    expect(jobs.createFromUpload.mock.calls[0]).toEqual([
      {
        organizationId: 'org-1',
        userId: 'user-1',
        buffer: Buffer.from('%PDF-1.4 body'),
        mimeType: 'application/pdf',
        fileName: 'inv.pdf',
        source: IntakeSource.TELEGRAM,
      },
    ]);
    expect(logged.join('\n')).not.toMatch(/987654321|private_sender|INVOICE-CAPTION-SECRET/);
  });

  it.each(['group', 'supergroup', 'channel', undefined] as const)(
    'refuses /link in a %s chat without redeeming or storing anything',
    async (type) => {
      const { svc, links, jobs, client, sent } = setup(null);
      const message = doc({ chat: { id: 42, type }, text: '/link@MizanoBot ABCD2345' });
      await svc.handleUpdate(
        type === 'channel' ? { update_id: 1, channel_post: message } : upd(message),
      );
      expect(links.redeem).not.toHaveBeenCalled();
      expect(links.findByChat).not.toHaveBeenCalled();
      expect(jobs.createFromUpload).not.toHaveBeenCalled();
      expect(client.downloadFile).not.toHaveBeenCalled();
      expect(sent).toHaveLength(1);
      expect(sent[0].text).toContain('private chat with the bot');
    },
  );

  it.each([false, true])(
    'keeps sender attribution only in the receipt (duplicate: %s)',
    async (duplicate) => {
      const { svc, jobs, sent } = setup();
      jobs.createFromUpload.mockResolvedValueOnce({ job: job(), duplicate });
      await svc.handleUpdate(upd(doc({ from: { id: 987654321 } })));
      expect(sent[0].text).toContain('Telegram sender: 987654321');
      expect(jobs.createFromUpload).toHaveBeenCalledWith({
        organizationId: 'org-1',
        userId: 'user-1',
        buffer: expect.any(Buffer),
        mimeType: 'application/pdf',
        fileName: 'inv.pdf',
        source: IntakeSource.TELEGRAM,
      });
      expect(logged.join('\n')).not.toContain('987654321');
      expect(logged.join('\n')).not.toContain(CAPTION);
    },
  );

  it('does not invent sender attribution when Telegram omits from', async () => {
    const { svc, sent } = setup();
    await svc.handleUpdate(upd(doc()));
    expect(sent[0].text).not.toContain('Telegram sender');
    expect(sent[0].text).not.toContain('undefined');
  });

  it('ingests a document into the linked organization as source TELEGRAM', async () => {
    const { svc, jobs, sent } = setup();
    await svc.handleUpdate(upd(doc()));
    expect(jobs.createFromUpload).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        userId: 'user-1',
        source: IntakeSource.TELEGRAM,
        mimeType: 'application/pdf',
        fileName: 'inv.pdf',
      }),
    );
    expect(sent[0].text).toContain('Received. Status: QUEUED');
  });

  it('takes the largest photo as a JPEG', async () => {
    const { svc, client, jobs } = setup();
    await svc.handleUpdate(
      upd({
        message_id: 9,
        chat: { id: 42, type: 'private' },
        photo: [
          { file_id: 'small', file_size: 10 },
          { file_id: 'big', file_size: 900 },
        ],
      }),
    );
    expect(client.downloadFile).toHaveBeenCalledWith('big', expect.any(Number));
    expect(jobs.createFromUpload).toHaveBeenCalledWith(
      expect.objectContaining({ mimeType: 'image/jpeg', fileName: 'telegram-9.jpg' }),
    );
  });

  it('reports a duplicate with the existing job status', async () => {
    const { svc, jobs, sent } = setup();
    jobs.createFromUpload.mockResolvedValueOnce({
      job: job(IntakeJobStatus.EXTRACTED),
      duplicate: true,
    });
    await svc.handleUpdate(upd(doc()));
    expect(sent[0].text).toContain('already received. Status: EXTRACTED');
  });

  it('rejects an oversize declared file without downloading', async () => {
    const { svc, client, jobs, sent } = setup();
    await svc.handleUpdate(
      upd(doc({ document: { file_id: 'f', mime_type: 'application/pdf', file_size: 99_000_000 } })),
    );
    expect(client.downloadFile).not.toHaveBeenCalled();
    expect(jobs.createFromUpload).not.toHaveBeenCalled();
    expect(sent[0].text).toContain('too large');
  });

  it('rejects a file that turns out oversize while downloading', async () => {
    const { svc, client, jobs, sent } = setup();
    client.downloadFile.mockRejectedValueOnce(new TelegramFileTooLargeError());
    await svc.handleUpdate(upd(doc()));
    expect(jobs.createFromUpload).not.toHaveBeenCalled();
    expect(sent[0].text).toContain('too large');
  });

  it('rejects unsupported types and accepts octet-stream by extension', async () => {
    const { svc, client, jobs, sent } = setup();
    await svc.handleUpdate(
      upd(
        doc({
          document: { file_id: 'f', file_name: 'a.exe', mime_type: 'application/x-msdownload' },
        }),
      ),
    );
    expect(client.downloadFile).not.toHaveBeenCalled();
    expect(sent[0].text).toContain('Unsupported');

    await svc.handleUpdate(
      upd(
        doc({
          document: { file_id: 'f', file_name: 'a.PNG', mime_type: 'application/octet-stream' },
        }),
        2,
      ),
    );
    expect(jobs.createFromUpload).toHaveBeenCalledWith(
      expect.objectContaining({ mimeType: 'image/png' }),
    );
  });

  it('tells the sender when the organization queue is full', async () => {
    const { svc, jobs, sent } = setup();
    jobs.createFromUpload.mockRejectedValueOnce(
      new HttpException('busy', HttpStatus.TOO_MANY_REQUESTS),
    );
    await expect(svc.handleUpdate(upd(doc()))).rejects.toMatchObject({ retryAfterSeconds: 60 });
    expect(sent[0].text).toContain('Too many documents');
  });

  it('defers excess documents, then accepts the entire 20-document batch after the window', async () => {
    jest.useFakeTimers();
    const { svc, jobs, sent } = setup();
    for (let i = 0; i < 10; i += 1) await svc.handleUpdate(upd(doc(), i + 1));
    for (let i = 10; i < 15; i += 1) {
      await expect(svc.handleUpdate(upd(doc(), i + 1))).rejects.toMatchObject({ status: 429 });
    }
    expect(jobs.createFromUpload).toHaveBeenCalledTimes(10);
    expect(sent.filter((s) => s.text.includes('Too many messages'))).toHaveLength(1);
    jest.advanceTimersByTime(60_000);
    for (let i = 10; i < 20; i += 1) await svc.handleUpdate(upd(doc(), i + 1));
    expect(jobs.createFromUpload).toHaveBeenCalledTimes(20);
  });

  it('persists the offset after each update and resumes from it', async () => {
    const { svc, client, jobs, prisma } = setup();
    client.getUpdates.mockResolvedValueOnce([upd(doc(), 100), upd(doc({ message_id: 8 }), 101)]);
    await expect(svc.pollOnce(0)).resolves.toBe(2);
    expect(client.getUpdates).toHaveBeenLastCalledWith(0, 0);
    expect(prisma.telegramPollState.upsert).toHaveBeenCalledTimes(2);
    expect(await svc.loadOffset()).toBe(102);

    // After a restart (fresh service, same store) already handled updates are skipped.
    client.getUpdates.mockResolvedValueOnce([upd(doc(), 101)]);
    await svc.pollOnce(0);
    expect(client.getUpdates).toHaveBeenLastCalledWith(102, 0);
    expect(jobs.createFromUpload).toHaveBeenCalledTimes(2);
  });

  it('retries a failing update before later updates, without acknowledging or logging content', async () => {
    const { svc, client, jobs, sent } = setup();
    jobs.createFromUpload.mockRejectedValueOnce(
      new Error(`boom ${TOKEN} ${CAPTION} api.telegram.org/bot${TOKEN}`),
    );
    client.getUpdates.mockResolvedValueOnce([upd(doc(), 1), upd(doc({ message_id: 8 }), 2)]);
    await expect(svc.pollOnce(0)).rejects.toThrow('boom');
    expect(await svc.loadOffset()).toBe(0);
    expect(jobs.createFromUpload).toHaveBeenCalledTimes(1);
    expect(sent[0].text).toContain('will be retried');
    client.getUpdates.mockResolvedValueOnce([upd(doc(), 1), upd(doc({ message_id: 8 }), 2)]);
    await svc.pollOnce(0);
    expect(jobs.createFromUpload).toHaveBeenCalledTimes(3);
    expect(await svc.loadOffset()).toBe(3);
    const all = logged.join('\n');
    expect(all).not.toContain(TOKEN);
    expect(all).not.toContain('SECRET');
    expect(all).not.toContain(CAPTION);
  });

  it('orders a batch before advancing the cursor so lower update IDs are not lost', async () => {
    const { svc, client, jobs } = setup();
    client.getUpdates.mockResolvedValueOnce([upd(doc(), 101), upd(doc(), 100)]);
    await svc.pollOnce(0);
    expect(jobs.createFromUpload).toHaveBeenCalledTimes(2);
    expect(await svc.loadOffset()).toBe(102);
  });

  it('resets a week-idle cursor before Telegram randomizes the next update ID', async () => {
    const { svc, client, jobs, prisma } = setup();
    jest.spyOn(prisma.telegramPollState, 'findUnique').mockResolvedValueOnce({
      id: 'test-bot',
      nextOffset: 9999,
      updatedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
    });
    client.getUpdates.mockResolvedValueOnce([upd(doc(), 10)]);
    await svc.pollOnce(0);
    expect(client.getUpdates).toHaveBeenCalledWith(0, 0);
    expect(jobs.createFromUpload).toHaveBeenCalledTimes(1);
    expect(prisma.telegramPollState.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'test-bot',
        OR: [{ nextOffset: { lt: 11 } }, { updatedAt: { lte: expect.any(Date) } }],
      },
      data: { nextOffset: 11 },
    });
  });

  it('replays a completed update after restart without another download, even if the chat is relinked', async () => {
    const { svc, restart, client, links, jobs, deliveries } = setup();
    await svc.handleUpdate(upd(doc()));
    expect(deliveries.get(1)).toMatchObject({ intakeJobId: 'job-1', organizationId: 'org-1' });
    links.findByChat.mockResolvedValue({ ...link, id: 'new-link', organizationId: 'org-2' });
    await restart().handleUpdate(upd(doc()));
    expect(client.downloadFile).toHaveBeenCalledTimes(1);
    expect(jobs.createFromUpload).toHaveBeenCalledTimes(1);
  });

  it('pins a failed delivery to its original organization across a relink', async () => {
    const { svc, restart, client, links, jobs } = setup();
    client.downloadFile.mockRejectedValueOnce(new TelegramApiError('getFile', 503));
    await expect(svc.handleUpdate(upd(doc()))).rejects.toBeInstanceOf(TelegramApiError);
    links.findByChat.mockResolvedValue({ ...link, id: 'new-link', organizationId: 'org-2' });
    await restart().handleUpdate(upd(doc()));
    expect(client.downloadFile).toHaveBeenCalledTimes(1);
    expect(jobs.createFromUpload).not.toHaveBeenCalled();
  });

  it('stops after five failed attempts and preserves terminal delivery evidence', async () => {
    const { svc, jobs, deliveries, sent } = setup();
    jobs.createFromUpload.mockRejectedValue(new Error('storage unavailable'));
    for (let i = 0; i < 5; i += 1) await expect(svc.handleUpdate(upd(doc()))).rejects.toThrow();
    await svc.handleUpdate(upd(doc()));
    expect(jobs.createFromUpload).toHaveBeenCalledTimes(5);
    expect(deliveries.get(1)).toMatchObject({
      attempts: 5,
      completedAt: expect.any(Date),
      intakeJobId: null,
    });
    expect(sent.at(-1)?.text).toContain('send it again');
  });

  it('rechecks the binding after download before persisting', async () => {
    const { svc, links, jobs } = setup();
    links.findByChat.mockResolvedValueOnce(link).mockResolvedValueOnce(null);
    await svc.handleUpdate(upd(doc()));
    expect(jobs.createFromUpload).not.toHaveBeenCalled();
  });

  it('links a private channel only after verifying the sender administers it', async () => {
    const { svc, client, links } = setup();
    const message = {
      message_id: 1,
      chat: { id: 42, type: 'private' as const },
      from: { id: 42 },
      text: '/link ABCD2345 -100123',
    };
    await svc.handleUpdate(upd(message));
    expect(client.canManageChannel).toHaveBeenCalledWith('-100123', 42);
    expect(links.redeem).toHaveBeenCalledWith('ABCD2345', '-100123');
    links.redeem.mockClear();
    client.canManageChannel.mockResolvedValueOnce(false);
    await svc.handleUpdate(upd(message, 2));
    expect(links.redeem).not.toHaveBeenCalled();
  });

  it('does not redeem channel codes without sender identity or with denied channel access', async () => {
    const { svc, client, links } = setup();
    await svc.handleUpdate(
      upd({ message_id: 1, chat: { id: 42, type: 'private' }, text: '/link ABCD2345 -100123' }),
    );
    expect(client.canManageChannel).not.toHaveBeenCalled();
    client.canManageChannel.mockRejectedValueOnce(new TelegramApiError('getChat', 403));
    await svc.handleUpdate(
      upd({
        message_id: 1,
        chat: { id: 42, type: 'private' },
        from: { id: 42 },
        text: '/link ABCD2345 -100123',
      }),
    );
    expect(links.redeem).not.toHaveBeenCalled();
  });

  it('handles edited posts explicitly without changing the original job', async () => {
    const { svc, jobs, sent } = setup();
    await svc.handleUpdate({ update_id: 1, edited_channel_post: doc() });
    expect(jobs.createFromUpload).not.toHaveBeenCalled();
    expect(sent[0].text).toContain('corrected file');
  });

  it('does not redeem link commands in edited messages', async () => {
    const { svc, links } = setup();
    await svc.handleUpdate({ update_id: 1, edited_message: doc({ text: '/link ABCD2345' }) });
    expect(links.redeem).not.toHaveBeenCalled();
  });

  it('selects the highest resolution photo when Telegram omits optional file sizes', async () => {
    const { svc, client } = setup();
    await svc.handleUpdate(
      upd({
        message_id: 1,
        chat: { id: 42 },
        photo: [
          { file_id: 'small', width: 100, height: 100 },
          { file_id: 'large', width: 1200, height: 1600 },
        ],
      }),
    );
    expect(client.downloadFile).toHaveBeenCalledWith('large', expect.any(Number));
  });

  it('uses Arabic status labels in the Arabic receipt', async () => {
    const { svc, sent } = setup();
    await svc.handleUpdate(upd(doc()));
    expect(sent[0].text).toContain('الحالة: في الانتظار');
  });

  it('honors Telegram retry_after and cancels backoff immediately at shutdown', async () => {
    jest.useFakeTimers();
    const { svc, client } = setup();
    client.getUpdates.mockRejectedValue(new TelegramApiError('getUpdates', 429, 120));
    svc.onApplicationBootstrap();
    await jest.advanceTimersByTimeAsync(119_999);
    expect(client.getUpdates).toHaveBeenCalledTimes(1);
    await svc.onModuleDestroy();
    await jest.advanceTimersByTimeAsync(120_000);
    expect(client.shutdown).toHaveBeenCalledTimes(1);
    expect(client.getUpdates).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('waits for the active poll and does not process its response after shutdown', async () => {
    const { svc, client, jobs } = setup();
    let release!: (updates: TelegramUpdate[]) => void;
    client.getUpdates.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    svc.onApplicationBootstrap();
    await Promise.resolve();
    await Promise.resolve();
    let stopped = false;
    const stopping = svc.onModuleDestroy().then(() => {
      stopped = true;
    });
    expect(stopped).toBe(false);
    release([upd(doc())]);
    await stopping;
    expect(jobs.createFromUpload).not.toHaveBeenCalled();
  });

  it('is disabled with a single warning when no token is configured', () => {
    const { svc, client } = setup();
    client.isEnabled.mockReturnValue(false);
    svc.onApplicationBootstrap();
    expect(client.getUpdates).not.toHaveBeenCalled();
    expect(logged.filter((l) => l.includes('TELEGRAM_BOT_TOKEN is not set'))).toHaveLength(1);
  });
});
