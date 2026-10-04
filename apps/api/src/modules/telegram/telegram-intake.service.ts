import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { IntakeJobStatus, IntakeSource, TelegramDelivery, TelegramLink } from '@prisma/client';
import { describeError } from '../../common/utils/redact';
import { PrismaService } from '../../prisma/prisma.service';
import { IntakeJobsService } from '../ai/intake/intake-jobs.service';
import {
  TelegramClient,
  TelegramApiError,
  TelegramDocument,
  TelegramFileTooLargeError,
  TelegramMessage,
  TelegramUpdate,
} from './telegram.client';
import { TelegramLinkService } from './telegram-link.service';

const LONG_POLL_SECONDS = 25;
const MAX_FILE_BYTES = 15 * 1024 * 1024;
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 60_000;
const MAX_BACKOFF_MS = 60_000;
const MAX_DELIVERY_ATTEMPTS = 5;
const CURSOR_IDLE_MS = 7 * 24 * 60 * 60 * 1000;
/** How long a deferred delivery waits before it is tried again. */
const DEFER_MS = 30_000;
/** Deferred deliveries resumed per poll round, so one backlog cannot starve the poll loop. */
const SWEEP_BATCH = 10;

const STATUS_AR: Record<IntakeJobStatus, string> = {
  QUEUED: 'في الانتظار',
  PROCESSING: 'قيد المعالجة',
  EXTRACTED: 'تم الاستخراج',
  NEEDS_REVIEW: 'تحتاج إلى مراجعة',
  FAILED: 'تعذرت المعالجة',
  DEAD_LETTER: 'توقفت المحاولات',
  APPROVED: 'تم الاعتماد',
};

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const ALLOWED_MIMES = new Set(['application/pdf', 'image/jpeg', 'image/png', DOCX]);
const EXTENSION_MIME: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.docx': DOCX,
};

/** Every reply is English followed by Arabic. */
const MSG = {
  notLinked:
    'This chat is not linked to a Mizano organization, so nothing was saved. Ask an administrator for a link code, then send /link CODE.\n' +
    'هذه المحادثة غير مرتبطة بمؤسسة في ميزانو، ولم يتم حفظ أي شيء. اطلب رمز الربط من المسؤول ثم أرسل /link الرمز.',
  linked:
    'Linked. Send invoices as PDF, JPG, PNG or DOCX files.\nتم الربط. أرسل الفواتير بصيغة PDF أو JPG أو PNG أو DOCX.',
  alreadyLinked: 'This chat is already linked.\nهذه المحادثة مرتبطة بالفعل.',
  badCode: 'That link code is invalid or expired.\nرمز الربط غير صالح أو منتهي الصلاحية.',
  linkedElsewhere:
    'This chat is already linked to another organization.\nهذه المحادثة مرتبطة بمؤسسة أخرى.',
  privateLink:
    'Linking must be done in a private chat with the bot.\nيجب إجراء الربط في محادثة خاصة مع البوت.',
  usage: 'Usage: /link CODE [CHANNEL_ID]\nالاستخدام: /link الرمز [معرف_القناة]',
  channelDenied:
    'Use a private channel you administer, with the bot as an administrator.\nاستخدم قناة خاصة تديرها وأضف البوت كمسؤول.',
  edited:
    'Edits are not imported. Send the corrected file as a new message.\nلا يتم استيراد التعديلات. أرسل الملف المصحح في رسالة جديدة.',
  retrying:
    'Intake is temporarily unavailable; this delivery will be retried.\nالاستلام غير متاح مؤقتا؛ ستتم إعادة المحاولة.',
  hint: 'Send an invoice as a PDF, JPG, PNG or DOCX file.\nأرسل الفاتورة كملف PDF أو JPG أو PNG أو DOCX.',
  tooLarge: 'The file is too large (max 15 MB).\nالملف كبير جدا (الحد الأقصى 15 ميغابايت).',
  unsupported:
    'Unsupported file type. Send PDF, JPG, PNG or DOCX.\nنوع الملف غير مدعوم. أرسل PDF أو JPG أو PNG أو DOCX.',
  busy: 'Too many documents are waiting. Try again shortly.\nهناك مستندات كثيرة قيد الانتظار. حاول لاحقا.',
  failed:
    'The file could not be processed. Please send it again.\nتعذرت معالجة الملف. يرجى إرساله مرة أخرى.',
  rateLimited: 'Too many messages. Please slow down.\nرسائل كثيرة جدا. يرجى التمهل.',
  received: (status: IntakeJobStatus) =>
    `Received. Status: ${status}.\nتم الاستلام. الحالة: ${STATUS_AR[status]}.`,
  duplicate: (status: IntakeJobStatus) =>
    `This file was already received. Status: ${status}.\nتم استلام هذا الملف سابقا. الحالة: ${STATUS_AR[status]}.`,
};

/**
 * The organization's intake queue is full. A deferral is not a failure: the delivery stays
 * pending in the database, keeps its attempt budget and never blocks other tenants.
 */
class IntakeDeferred extends Error {
  constructor() {
    super('Telegram intake deferred');
    this.name = 'IntakeDeferred';
  }
}

interface RateWindow {
  hits: number[];
  warned: boolean;
}

interface FileCandidate {
  fileId: string;
  fileName: string;
  mimeType: string;
  size?: number;
}

@Injectable()
export class TelegramIntakeService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(TelegramIntakeService.name);
  private running = false;
  private stopping = false;
  private loop?: Promise<void>;
  private wakeBackoff?: () => void;
  private readonly windows = new Map<string, RateWindow>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly client: TelegramClient,
    private readonly links: TelegramLinkService,
    private readonly jobs: IntakeJobsService,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.client.isEnabled()) {
      this.logger.warn('TELEGRAM_BOT_TOKEN is not set: Telegram intake is disabled');
      return;
    }
    if (this.running) return;
    this.running = true;
    this.loop = this.pollLoop();
  }

  async onModuleDestroy(): Promise<void> {
    this.stopping = true;
    this.running = false;
    this.client.shutdown();
    this.wakeBackoff?.();
    await this.loop;
  }

  private async pollLoop(): Promise<void> {
    let failures = 0;
    while (this.running) {
      try {
        await this.pollOnce(LONG_POLL_SECONDS);
        failures = 0;
      } catch (error) {
        if (!this.running) return;
        failures += 1;
        this.logger.error(
          `Telegram poll failed: ${describeError(error, { includeMessage: false })}`,
        );
        const delay = Math.max(
          Math.min(MAX_BACKOFF_MS, 1000 * 2 ** Math.min(failures, 6)),
          error instanceof TelegramApiError ? (error.retryAfterSeconds ?? 0) * 1000 : 0,
        );
        await this.backoff(delay);
      }
    }
  }

  private backoff(delay: number): Promise<void> {
    return new Promise<void>((resolve) => {
      const done = (): void => {
        clearTimeout(timer);
        this.wakeBackoff = undefined;
        resolve();
      };
      const timer = setTimeout(done, Math.min(delay, 2_147_483_647));
      this.wakeBackoff = done;
      if (this.stopping) done();
    });
  }

  async loadOffset(): Promise<number> {
    const state = await this.prisma.telegramPollState.findUnique({
      where: { id: this.client.pollKey() },
    });
    // Telegram randomizes update IDs after a week without updates. Poll unconfirmed updates
    // again instead of acknowledging a newly generated ID below an obsolete high watermark.
    return state && state.updatedAt.getTime() > Date.now() - CURSOR_IDLE_MS
      ? Number(state.nextOffset)
      : 0;
  }

  /** Advance atomically; only an idle cursor can start a new Telegram update-ID sequence. */
  private async saveOffset(offset: number): Promise<void> {
    const nextOffset = BigInt(offset);
    await this.prisma.telegramPollState.upsert({
      where: { id: this.client.pollKey() },
      create: { id: this.client.pollKey(), nextOffset },
      update: {},
    });
    await this.prisma.telegramPollState.updateMany({
      where: {
        id: this.client.pollKey(),
        OR: [
          { nextOffset: { lt: nextOffset } },
          { updatedAt: { lte: new Date(Date.now() - CURSOR_IDLE_MS) } },
        ],
      },
      data: { nextOffset },
    });
  }

  /**
   * One poll round: resume deferred deliveries, then getUpdates. Updates are handled in order
   * and the offset is persisted after each one. A rate-limited or queue-blocked document is
   * recorded as a deferred delivery first, so the cursor moves on and one chat or tenant never
   * holds back the others. Other failures leave the cursor in place; durable delivery identity
   * and tenant file hashes make crash replay safe. Only one process may poll a bot (Telegram
   * rejects competing polls).
   */
  async pollOnce(timeoutSeconds: number): Promise<number> {
    await this.drainDeferred();
    const offset = await this.loadOffset();
    const updates = await this.client.getUpdates(offset, timeoutSeconds);
    let next = offset;
    for (const update of [...updates].sort((a, b) => a.update_id - b.update_id)) {
      if (this.stopping) break;
      if (update.update_id < next) continue;
      await this.handleUpdate(update);
      next = update.update_id + 1;
      await this.saveOffset(next);
    }
    return updates.length;
  }

  private allowed(chatId: string): { ok: boolean; warn: boolean } {
    const now = Date.now();
    const win = this.windows.get(chatId) ?? { hits: [], warned: false };
    win.hits = win.hits.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
    if (win.hits.length >= RATE_LIMIT_MAX) {
      const warn = !win.warned;
      win.warned = true;
      this.windows.set(chatId, win);
      return { ok: false, warn };
    }
    win.hits.push(now);
    if (win.hits.length === 1) win.warned = false;
    this.windows.set(chatId, win);
    if (this.windows.size > 5000) {
      this.pruneWindows(now);
      const oldest = this.windows.keys().next().value;
      if (this.windows.size > 5000 && oldest !== undefined) this.windows.delete(oldest);
    }
    return { ok: true, warn: false };
  }

  private pruneWindows(now: number): void {
    for (const [id, win] of this.windows) {
      if (win.hits.every((t) => now - t >= RATE_LIMIT_WINDOW_MS)) this.windows.delete(id);
    }
  }

  private async reply(chatId: string, text: string): Promise<void> {
    try {
      await this.client.sendMessage(chatId, text);
    } catch (error) {
      this.logger.warn(`Telegram reply failed: ${describeError(error, { includeMessage: false })}`);
    }
  }

  /**
   * Only a recorded outcome is acknowledged: completed, terminally failed or durably deferred.
   * Transient errors propagate to poll backoff and leave the cursor in place.
   */
  async handleUpdate(update: TelegramUpdate): Promise<void> {
    const message =
      update.message ?? update.channel_post ?? update.edited_message ?? update.edited_channel_post;
    if (!message) return;
    const chatId = String(message.chat.id);
    const edited = !update.message && !update.channel_post;

    const gate = this.allowed(chatId);
    if (!gate.ok) {
      if (gate.warn) await this.reply(chatId, MSG.rateLimited);
      // A 20-document batch is deferred instead of silently acknowledging its last ten files.
      // The delivery is stored first, so the cursor can move on without holding up other chats.
      const file = edited ? null : this.fileOf(message);
      const link = file ? await this.links.findByChat(chatId) : null;
      if (file && link) {
        const delivery = await this.recordDelivery(update, message, link, chatId, file);
        if (delivery) await this.deferDelivery(delivery);
      }
      return;
    }

    try {
      if (edited) {
        await this.reply(
          chatId,
          (await this.links.findByChat(chatId)) ? MSG.edited : MSG.notLinked,
        );
        return;
      }
      const command = this.parseCommand(message.text);
      if (command?.name === 'link') {
        if (message.chat.type !== 'private') {
          await this.reply(chatId, MSG.privateLink);
          return;
        }
        await this.handleLink(chatId, command.arg, message.from?.id);
        return;
      }

      const link = await this.links.findByChat(chatId);
      if (!link) {
        await this.reply(chatId, MSG.notLinked);
        return;
      }

      const file = this.fileOf(message);
      if (!file) {
        await this.reply(chatId, MSG.hint);
        return;
      }
      const delivery = await this.recordDelivery(update, message, link, chatId, file);
      if (delivery) await this.processDelivery(delivery, link);
    } catch (error) {
      this.logger.error(
        `Telegram update failed: ${describeError(error, { includeMessage: false })}`,
      );
      if (!this.stopping) await this.reply(chatId, MSG.retrying);
      throw error;
    }
  }

  /**
   * The receiver resolves an untrusted source identity once. Never move an old delivery to a
   * new binding, even after a crash between durable enqueue and cursor persistence. Returns
   * null for a finished or rebound delivery.
   */
  private async recordDelivery(
    update: TelegramUpdate,
    message: TelegramMessage,
    link: TelegramLink,
    chatId: string,
    file: FileCandidate,
  ): Promise<TelegramDelivery | null> {
    const botKey = this.client.pollKey();
    const updateId = BigInt(update.update_id);
    const delivery = await this.prisma.telegramDelivery.upsert({
      where: { botKey_updateId: { botKey, updateId } },
      create: {
        botKey,
        updateId,
        organizationId: link.organizationId,
        linkId: link.id,
        messageId: message.message_id,
        chatId,
        fileId: file.fileId,
        fileName: file.fileName,
        mimeType: file.mimeType,
        // Telegram sizes can exceed int4; only "larger than the limit" matters.
        fileSize: file.size === undefined ? null : Math.min(file.size, MAX_FILE_BYTES + 1),
        senderId: message.from?.id === undefined ? null : BigInt(message.from.id),
      },
      update: {},
    });
    if (
      delivery.completedAt ||
      delivery.linkId !== link.id ||
      delivery.organizationId !== link.organizationId
    )
      return null;
    return delivery;
  }

  private deliveryWhere(delivery: TelegramDelivery): {
    botKey: string;
    updateId: bigint;
    organizationId: string;
    completedAt: null;
  } {
    return {
      botKey: delivery.botKey,
      updateId: delivery.updateId,
      organizationId: delivery.organizationId,
      completedAt: null,
    };
  }

  private async deferDelivery(delivery: TelegramDelivery): Promise<void> {
    await this.prisma.telegramDelivery.updateMany({
      where: this.deliveryWhere(delivery),
      data: { deferredUntil: new Date(Date.now() + DEFER_MS) },
    });
  }

  /**
   * Run one delivery. Attempts are counted before the work for crash safety, and refunded when
   * the delivery is only deferred (full queue) or interrupted by shutdown: neither is a fault.
   */
  private async processDelivery(delivery: TelegramDelivery, link: TelegramLink): Promise<void> {
    const where = this.deliveryWhere(delivery);
    if (delivery.attempts >= MAX_DELIVERY_ATTEMPTS) {
      await this.prisma.telegramDelivery.updateMany({
        where,
        data: { completedAt: new Date(), deferredUntil: null },
      });
      await this.reply(delivery.chatId, MSG.failed);
      return;
    }
    const claimed = await this.prisma.telegramDelivery.updateMany({
      where,
      data: { attempts: { increment: 1 } },
    });
    if (claimed.count === 0) return;
    let intakeJobId: string | null;
    try {
      intakeJobId = await this.ingest(
        link,
        delivery.chatId,
        {
          fileId: delivery.fileId,
          fileName: delivery.fileName,
          mimeType: delivery.mimeType,
          size: delivery.fileSize ?? undefined,
        },
        delivery.senderId === null ? undefined : Number(delivery.senderId),
        // The sender is told once; later retries of the same deferral stay silent.
        delivery.deferredUntil !== null,
      );
    } catch (error) {
      const deferred = error instanceof IntakeDeferred;
      if (deferred || this.stopping) {
        await this.prisma.telegramDelivery.updateMany({
          where,
          data: {
            attempts: { decrement: 1 },
            ...(deferred ? { deferredUntil: new Date(Date.now() + DEFER_MS) } : {}),
          },
        });
      }
      if (deferred) return;
      throw error;
    }
    await this.prisma.telegramDelivery.updateMany({
      where,
      data: { completedAt: new Date(), deferredUntil: null, intakeJobId },
    });
  }

  /**
   * Resume deliveries whose cursor was already acknowledged (rate-limited chat or full queue).
   * Telegram cannot resend them, so the stored file reference is the only source. This is a
   * system-level lookup like the poll cursor; every row is pinned to its recorded tenant and is
   * re-verified against the chat's current binding before any download or write.
   */
  async drainDeferred(): Promise<number> {
    if (this.stopping) return 0;
    const due = await this.prisma.telegramDelivery.findMany({
      where: {
        botKey: this.client.pollKey(),
        completedAt: null,
        deferredUntil: { lte: new Date() },
      },
      orderBy: { updateId: 'asc' },
      take: SWEEP_BATCH,
    });
    for (const delivery of due) {
      if (this.stopping) break;
      await this.resumeDelivery(delivery);
    }
    return due.length;
  }

  private async resumeDelivery(delivery: TelegramDelivery): Promise<void> {
    const where = this.deliveryWhere(delivery);
    const link = await this.links.findByChat(delivery.chatId);
    if (!link || link.id !== delivery.linkId || link.organizationId !== delivery.organizationId) {
      // Unlinked or relinked while waiting: never rebind the old delivery to a new tenant.
      await this.prisma.telegramDelivery.updateMany({
        where,
        data: { completedAt: new Date(), deferredUntil: null },
      });
      if (!link) await this.reply(delivery.chatId, MSG.notLinked);
      return;
    }
    if (!this.allowed(delivery.chatId).ok) {
      await this.deferDelivery(delivery);
      return;
    }
    try {
      await this.processDelivery(delivery, link);
    } catch (error) {
      if (this.stopping) return;
      // Other deliveries and tenants continue; the attempt cap ends a delivery that keeps failing.
      this.logger.error(
        `Telegram deferred delivery failed: ${describeError(error, { includeMessage: false })}`,
      );
      await this.deferDelivery(delivery);
    }
  }

  private parseCommand(text?: string): { name: string; arg: string } | null {
    if (!text?.startsWith('/')) return null;
    const [head, ...rest] = text.trim().split(/\s+/);
    const name = head.slice(1).split('@')[0].toLowerCase();
    return { name, arg: rest.join(' ') };
  }

  private async handleLink(chatId: string, args: string, senderId?: number): Promise<void> {
    const [code, channelId, ...extra] = args.split(/\s+/);
    if (!code || extra.length || (channelId && !/^-\d+$/.test(channelId))) {
      await this.reply(chatId, MSG.usage);
      return;
    }
    if (channelId) {
      if (senderId === undefined || String(senderId) !== chatId) {
        await this.reply(chatId, MSG.channelDenied);
        return;
      }
      try {
        if (!(await this.client.canManageChannel(channelId, senderId))) {
          await this.reply(chatId, MSG.channelDenied);
          return;
        }
      } catch (error) {
        if (!(error instanceof TelegramApiError) || ![400, 403].includes(error.status ?? 0))
          throw error;
        await this.reply(chatId, MSG.channelDenied);
        return;
      }
    }
    const result = await this.links.redeem(code, channelId ?? chatId);
    switch (result.status) {
      case 'linked':
        this.logger.log(`Telegram chat linked to organization ${result.link.organizationId}`);
        await this.reply(chatId, MSG.linked);
        return;
      case 'already-linked':
        await this.reply(chatId, MSG.alreadyLinked);
        return;
      case 'linked-elsewhere':
        await this.reply(chatId, MSG.linkedElsewhere);
        return;
      default:
        await this.reply(chatId, MSG.badCode);
    }
  }

  private fileOf(message: TelegramMessage): FileCandidate | null {
    const doc: TelegramDocument | undefined = message.document;
    if (doc) {
      const fileName = (doc.file_name ?? `telegram-${message.message_id}`).slice(0, 255);
      return {
        fileId: doc.file_id,
        fileName,
        mimeType: this.resolveMime(doc.mime_type, fileName),
        size: doc.file_size,
      };
    }
    if (message.photo?.length) {
      const best = [...message.photo].sort(
        (a, b) =>
          (b.width ?? 0) * (b.height ?? 0) - (a.width ?? 0) * (a.height ?? 0) ||
          (b.file_size ?? 0) - (a.file_size ?? 0),
      )[0];
      return {
        fileId: best.file_id,
        fileName: `telegram-${message.message_id}.jpg`,
        mimeType: 'image/jpeg',
        size: best.file_size,
      };
    }
    return null;
  }

  private resolveMime(declared: string | undefined, fileName: string): string {
    const mime = (declared ?? '').toLowerCase();
    if (ALLOWED_MIMES.has(mime)) return mime;
    if (mime && mime !== 'application/octet-stream') return mime;
    const dot = fileName.lastIndexOf('.');
    return (dot >= 0 && EXTENSION_MIME[fileName.slice(dot).toLowerCase()]) || mime;
  }

  private async ingest(
    link: TelegramLink,
    chatId: string,
    file: FileCandidate,
    senderId?: number,
    quiet = false,
  ): Promise<string | null> {
    if (!ALLOWED_MIMES.has(file.mimeType)) {
      await this.reply(chatId, MSG.unsupported);
      return null;
    }
    if (file.size !== undefined && file.size > MAX_FILE_BYTES) {
      await this.reply(chatId, MSG.tooLarge);
      return null;
    }

    let buffer: Buffer;
    try {
      buffer = await this.client.downloadFile(file.fileId, MAX_FILE_BYTES);
    } catch (error) {
      if (error instanceof TelegramFileTooLargeError) {
        await this.reply(chatId, MSG.tooLarge);
        return null;
      }
      throw error;
    }

    if (this.stopping) throw new TelegramApiError('shutdown');
    // A revoke/unlink during a slow download must stop the write.
    const current = await this.links.findByChat(chatId);
    if (current?.id !== link.id) {
      await this.reply(chatId, MSG.notLinked);
      return null;
    }

    try {
      const { job, duplicate } = await this.jobs.createFromUpload({
        organizationId: link.organizationId,
        userId: link.linkedById,
        buffer,
        mimeType: file.mimeType,
        fileName: file.fileName,
        source: IntakeSource.TELEGRAM,
      });
      // IntakeJob.result is worker-owned extraction evidence, not upload metadata.
      // No suitable storage field exists; keep Telegram attribution only in the reply.
      const receipt = duplicate ? MSG.duplicate(job.status) : MSG.received(job.status);
      const sender =
        senderId === undefined
          ? ''
          : `\nTelegram sender: ${senderId}.\nمرسل تيليجرام: ${senderId}.`;
      await this.reply(chatId, receipt + sender);
      return job.id;
    } catch (error) {
      if (error instanceof HttpException && error.getStatus() === HttpStatus.TOO_MANY_REQUESTS) {
        if (!quiet) await this.reply(chatId, MSG.busy);
        throw new IntakeDeferred();
      }
      throw error;
    }
  }
}
