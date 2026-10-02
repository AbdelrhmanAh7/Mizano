import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface TelegramFileRef {
  file_id: string;
  file_size?: number;
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
}

/** Carries only the API method and HTTP status: never a URL (it contains the bot token). */
export class TelegramApiError extends Error {
  constructor(
    readonly method: string,
    readonly status?: number,
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
        signal: AbortSignal.any([this.controller.signal, AbortSignal.timeout(timeoutMs)]),
      });
    } catch {
      // The underlying error can embed the request URL (and so the token): drop it.
      throw new TelegramApiError(method);
    }
    if (!res.ok) throw new TelegramApiError(method, res.status);
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
    const json = (await res.json()) as { ok: boolean; result: T };
    if (!json.ok) throw new TelegramApiError(method);
    return json.result;
  }

  async getUpdates(offset: number, timeoutSeconds: number): Promise<TelegramUpdate[]> {
    return this.call<TelegramUpdate[]>(
      'getUpdates',
      { offset, timeout: timeoutSeconds, allowed_updates: ['message', 'channel_post'] },
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
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length > maxBytes) throw new TelegramFileTooLargeError();
    return buffer;
  }

  async sendMessage(chatId: string, text: string): Promise<void> {
    await this.call('sendMessage', { chat_id: chatId, text });
  }
}
