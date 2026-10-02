import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { IntakeSource, TelegramLink } from '@prisma/client';
import { describeError } from '../../common/utils/redact';
import { PrismaService } from '../../prisma/prisma.service';
import { IntakeJobsService } from '../ai/intake/intake-jobs.service';
import {
  TelegramClient,
  TelegramDocument,
  TelegramFileTooLargeError,
  TelegramMessage,
  TelegramUpdate,
} from './telegram.client';
import { TelegramLinkService } from './telegram-link.service';

const POLL_STATE_ID = 'default';
const LONG_POLL_SECONDS = 25;
const MAX_FILE_BYTES = 15 * 1024 * 1024;
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 60_000;
const MAX_BACKOFF_MS = 60_000;

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
  usage: 'Usage: /link CODE\nالاستخدام: /link الرمز',
  hint: 'Send an invoice as a PDF, JPG, PNG or DOCX file.\nأرسل الفاتورة كملف PDF أو JPG أو PNG أو DOCX.',
  tooLarge: 'The file is too large (max 15 MB).\nالملف كبير جدا (الحد الأقصى 15 ميغابايت).',
  unsupported:
    'Unsupported file type. Send PDF, JPG, PNG or DOCX.\nنوع الملف غير مدعوم. أرسل PDF أو JPG أو PNG أو DOCX.',
  busy: 'Too many documents are waiting. Try again shortly.\nهناك مستندات كثيرة قيد الانتظار. حاول لاحقا.',
  failed:
    'The file could not be processed. Please send it again.\nتعذرت معالجة الملف. يرجى إرساله مرة أخرى.',
  rateLimited: 'Too many messages. Please slow down.\nرسائل كثيرة جدا. يرجى التمهل.',
  received: (status: string) => `Received. Status: ${status}.\nتم الاستلام. الحالة: ${status}.`,
  duplicate: (status: string) =>
    `This file was already received. Status: ${status}.\nتم استلام هذا الملف سابقا. الحالة: ${status}.`,
};

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
    this.running = true;
    void this.pollLoop();
  }

  onModuleDestroy(): void {
    this.running = false;
    this.client.shutdown();
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
        const delay = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** Math.min(failures, 6));
        await new Promise<void>((resolve) => setTimeout(resolve, delay).unref());
      }
    }
  }

  async loadOffset(): Promise<number> {
    const state = await this.prisma.telegramPollState.findUnique({ where: { id: POLL_STATE_ID } });
    return state?.nextOffset ?? 0;
  }

  /** Persist the cursor only forwards. */
  private async saveOffset(nextOffset: number): Promise<void> {
    await this.prisma.telegramPollState.upsert({
      where: { id: POLL_STATE_ID },
      create: { id: POLL_STATE_ID, nextOffset },
      update: { nextOffset },
    });
  }

  /**
   * One getUpdates round. Updates are handled in order and the offset is persisted after each
   * one, so a restart never reprocesses a handled update. Reprocessing after a crash between
   * handling and saving is harmless: file dedup (sha256) and one-time codes are idempotent.
   */
  async pollOnce(timeoutSeconds: number): Promise<number> {
    const offset = await this.loadOffset();
    const updates = await this.client.getUpdates(offset, timeoutSeconds);
    let next = offset;
    for (const update of updates) {
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
    if (this.windows.size > 5000) this.pruneWindows(now);
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

  /** Never throws for per-message problems; never logs text, captions, files or tokens. */
  async handleUpdate(update: TelegramUpdate): Promise<void> {
    const message = update.message ?? update.channel_post;
    if (!message) return;
    const chatId = String(message.chat.id);

    const gate = this.allowed(chatId);
    if (!gate.ok) {
      if (gate.warn) await this.reply(chatId, MSG.rateLimited);
      return;
    }

    try {
      const command = this.parseCommand(message.text);
      if (command?.name === 'link') {
        if (message.chat.type !== 'private') {
          await this.reply(chatId, MSG.privateLink);
          return;
        }
        await this.handleLink(chatId, command.arg);
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
      await this.ingest(link, chatId, file, message.from?.id);
    } catch (error) {
      this.logger.error(
        `Telegram update failed: ${describeError(error, { includeMessage: false })}`,
      );
      await this.reply(chatId, MSG.failed);
    }
  }

  private parseCommand(text?: string): { name: string; arg: string } | null {
    if (!text?.startsWith('/')) return null;
    const [head, ...rest] = text.trim().split(/\s+/);
    const name = head.slice(1).split('@')[0].toLowerCase();
    return { name, arg: rest.join(' ') };
  }

  private async handleLink(chatId: string, code: string): Promise<void> {
    if (!code) {
      await this.reply(chatId, MSG.usage);
      return;
    }
    const result = await this.links.redeem(code, chatId);
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
      const best = [...message.photo].sort((a, b) => (b.file_size ?? 0) - (a.file_size ?? 0))[0];
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
  ): Promise<void> {
    if (!ALLOWED_MIMES.has(file.mimeType)) {
      await this.reply(chatId, MSG.unsupported);
      return;
    }
    if (file.size !== undefined && file.size > MAX_FILE_BYTES) {
      await this.reply(chatId, MSG.tooLarge);
      return;
    }

    let buffer: Buffer;
    try {
      buffer = await this.client.downloadFile(file.fileId, MAX_FILE_BYTES);
    } catch (error) {
      if (error instanceof TelegramFileTooLargeError) {
        await this.reply(chatId, MSG.tooLarge);
        return;
      }
      throw error;
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
    } catch (error) {
      if (error instanceof HttpException && error.getStatus() === HttpStatus.TOO_MANY_REQUESTS) {
        await this.reply(chatId, MSG.busy);
        return;
      }
      throw error;
    }
  }
}
