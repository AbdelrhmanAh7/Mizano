import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';

export interface TelegramFileRef {
  file_id: string;
  file_size?: number;
  width?: number;
  height?: number;
}

export interface TelegramDocument extends TelegramFileRef {
  file_name?: string;
  mime_type?: string;
}

export interface TelegramMessage {
  message_id: number;
  chat: { id: number | string; type?: 'private' | 'group' | 'supergroup' | 'channel' };
  from?: { id: number; username?: string };
  text?: string;
  caption?: string;
  document?: TelegramDocument;
  photo?: TelegramFileRef[];
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  channel_post?: TelegramMessage;
  edited_message?: TelegramMessage;
  edited_channel_post?: TelegramMessage;
}

/** Carries only the API method and HTTP status: never a URL (it contains the bot token). */
export class TelegramApiError extends Error {
  constructor(
    readonly method: string,
    readonly status?: number,
    readonly retryAfterSeconds?: number,
  ) {
    super(`Telegram ${method} failed${status ? ` (status ${status})` : ''}`);
    this.name = 'TelegramApiError';
  }
}

export class TelegramFileTooLargeError extends Error {
  constructor() {
    super('Telegram file exceeds the size limit');
    this.name = 'TelegramFileTooLargeError';
  }
}

/** Seam for the Telegram Bot API so the intake logic can be tested without network access. */
export abstract class TelegramClient {
  abstract isEnabled(): boolean;
  abstract pollKey(): string;
  abstract canManageChannel(chatId: string, userId: number): Promise<boolean>;
  abstract getUpdates(offset: number, timeoutSeconds: number): Promise<TelegramUpdate[]>;
  abstract downloadFile(fileId: string, maxBytes: number): Promise<Buffer>;
  abstract sendMessage(chatId: string, text: string): Promise<void>;
  /** Abort in-flight long polls on shutdown. */
  abstract shutdown(): void;
}

const API = 'https://api.telegram.org';
const REQUEST_TIMEOUT_MS = 30_000;

@Injectable()
export class TelegramHttpClient extends TelegramClient {
  private readonly token: string;
  private readonly controller = new AbortController();

  constructor(config: ConfigService) {
    super();
    this.token = (config.get<string>('TELEGRAM_BOT_TOKEN') ?? '').trim();
  }

  isEnabled(): boolean {
    return this.token.length > 0;
  }

  pollKey(): string {
    // The public bot ID survives token rotation; a different bot has its own cursor/receipts.
    return createHash('sha256').update(this.token.split(':')[0]).digest('hex');
  }

  async canManageChannel(chatId: string, userId: number): Promise<boolean> {
    const chat = await this.call<{ type: string; username?: string }>('getChat', {
      chat_id: chatId,
    });
    if (chat.type !== 'channel' || chat.username) return false;
    const member = await this.call<{ status: string }>('getChatMember', {
      chat_id: chatId,
      user_id: userId,
    });
    return member.status === 'creator' || member.status === 'administrator';
  }

  shutdown(): void {
    this.controller.abort();
  }

  private async request(
    method: string,
    url: string,
    init: RequestInit,
    timeoutMs: number,
  ): Promise<Response> {
    let res: Response;
    try {
      res = await fetch(url, {
        ...init,
        redirect: 'error',
        signal: AbortSignal.any([this.controller.signal, AbortSignal.timeout(timeoutMs)]),
      });
    } catch {
      // The underlying error can embed the request URL (and so the token): drop it.
      throw new TelegramApiError(method);
    }
    return res;
  }

  private async call<T>(
    method: string,
    body: Record<string, unknown>,
    timeoutMs = REQUEST_TIMEOUT_MS,
  ): Promise<T> {
    const res = await this.request(
      method,
      `${API}/bot${this.token}/${method}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
      timeoutMs,
    );
    try {
      const json = (await res.json()) as {
        ok: boolean;
        result: T;
        error_code?: number;
        parameters?: { retry_after?: number };
      };
      if (!res.ok || !json.ok) {
        const retry = json.parameters?.retry_after;
        throw new TelegramApiError(
          method,
          res.ok ? json.error_code : res.status,
          typeof retry === 'number' && Number.isSafeInteger(retry) && retry > 0 ? retry : undefined,
        );
      }
      return json.result;
    } catch (error) {
      if (error instanceof TelegramApiError) throw error;
      // JSON parsing and response-body I/O errors can contain URLs or document data too.
      throw new TelegramApiError(method, res.status);
    }
  }

  async getUpdates(offset: number, timeoutSeconds: number): Promise<TelegramUpdate[]> {
    return this.call<TelegramUpdate[]>(
      'getUpdates',
      {
        offset,
        timeout: timeoutSeconds,
        allowed_updates: ['message', 'channel_post', 'edited_message', 'edited_channel_post'],
      },
      timeoutSeconds * 1000 + REQUEST_TIMEOUT_MS,
    );
  }

  async downloadFile(fileId: string, maxBytes: number): Promise<Buffer> {
    const file = await this.call<{ file_path?: string; file_size?: number }>('getFile', {
      file_id: fileId,
    });
    if (!file.file_path) throw new TelegramApiError('getFile');
    if (file.file_size !== undefined && file.file_size > maxBytes) {
      throw new TelegramFileTooLargeError();
    }
    const res = await this.request(
      'downloadFile',
      `${API}/file/bot${this.token}/${file.file_path}`,
      { method: 'GET' },
      REQUEST_TIMEOUT_MS * 2,
    );
    if (!res.ok || !res.body) {
      await res.body?.cancel().catch(() => undefined);
      throw new TelegramApiError('downloadFile', res.status);
    }
    const reader = res.body.getReader();
    let complete = false;
    try {
      if (Number(res.headers.get('content-length')) > maxBytes) {
        throw new TelegramFileTooLargeError();
      }
      const chunks: Buffer[] = [];
      let size = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > maxBytes) throw new TelegramFileTooLargeError();
        chunks.push(Buffer.from(value));
      }
      complete = true;
      return Buffer.concat(chunks, size);
    } catch (error) {
      if (error instanceof TelegramFileTooLargeError) throw error;
      throw new TelegramApiError('downloadFile');
    } finally {
      if (!complete) await reader.cancel().catch(() => undefined);
      reader.releaseLock();
    }
  }

  async sendMessage(chatId: string, text: string): Promise<void> {
    await this.call('sendMessage', { chat_id: chatId, text });
  }
}
