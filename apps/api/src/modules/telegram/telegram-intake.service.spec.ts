import { HttpException, HttpStatus, Logger } from '@nestjs/common';
import { IntakeJob, IntakeJobStatus, IntakeSource, TelegramLink } from '@prisma/client';
import { IntakeJobsService } from '../ai/intake/intake-jobs.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  TelegramClient,
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
  const prisma = {
    telegramPollState: {
      findUnique: jest.fn(async () => (stored ? { nextOffset: stored } : null)),
      upsert: jest.fn(async ({ update }: { update: { nextOffset: number } }) => {
        stored = update.nextOffset;
      }),
    },
  } as unknown as PrismaService;
  const sent: { chatId: string; text: string }[] = [];
  const client = {
    isEnabled: jest.fn(() => true),
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
  const svc = new TelegramIntakeService(
    prisma,
    client as unknown as TelegramClient,
    links as unknown as TelegramLinkService,
    jobs as unknown as IntakeJobsService,
  );
  return { svc, client, links, jobs, prisma, sent };
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
  afterEach(() => jest.restoreAllMocks());

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
    await svc.handleUpdate(upd(doc()));
    expect(sent[0].text).toContain('Too many documents');
  });

  it('rate-limits a chat: ten messages pass, the rest are dropped with one warning', async () => {
    const { svc, jobs, sent } = setup();
    for (let i = 0; i < 15; i += 1) await svc.handleUpdate(upd(doc(), i + 1));
    expect(jobs.createFromUpload).toHaveBeenCalledTimes(10);
    expect(sent.filter((s) => s.text.includes('Too many messages'))).toHaveLength(1);
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

  it('a failing update is answered, does not stop the batch and never logs content or tokens', async () => {
    const { svc, client, jobs, sent } = setup();
    jobs.createFromUpload.mockRejectedValueOnce(
      new Error(`boom ${TOKEN} ${CAPTION} api.telegram.org/bot${TOKEN}`),
    );
    client.getUpdates.mockResolvedValueOnce([upd(doc(), 1), upd(doc({ message_id: 8 }), 2)]);
    await svc.pollOnce(0);
    expect(jobs.createFromUpload).toHaveBeenCalledTimes(2);
    expect(sent[0].text).toContain('could not be processed');
    const all = logged.join('\n');
    expect(all).not.toContain(TOKEN);
    expect(all).not.toContain('SECRET');
    expect(all).not.toContain(CAPTION);
  });

  it('is disabled with a single warning when no token is configured', () => {
    const { svc, client } = setup();
    client.isEnabled.mockReturnValue(false);
    svc.onApplicationBootstrap();
    expect(client.getUpdates).not.toHaveBeenCalled();
    expect(logged.filter((l) => l.includes('TELEGRAM_BOT_TOKEN is not set'))).toHaveLength(1);
  });
});
