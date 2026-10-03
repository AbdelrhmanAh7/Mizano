import { ConfigService } from '@nestjs/config';
import { TelegramApiError, TelegramFileTooLargeError, TelegramHttpClient } from './telegram.client';

const TOKEN = '123456:SECRET-BOT-TOKEN';

function client(token = TOKEN): TelegramHttpClient {
  return new TelegramHttpClient({ get: () => token } as unknown as ConfigService);
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

describe('TelegramHttpClient', () => {
  afterEach(() => jest.restoreAllMocks());

  it('is disabled without a token', () => {
    expect(client('').isEnabled()).toBe(false);
    expect(client().isEnabled()).toBe(true);
  });

  it('never leaks the token in errors', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(
        new Error(`connect failed https://api.telegram.org/bot${TOKEN}/getUpdates`),
      );
    const error = await client()
      .getUpdates(0, 0)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TelegramApiError);
    expect(String((error as Error).message)).not.toContain('SECRET');
    expect(JSON.stringify(error)).not.toContain('SECRET');
  });

  it('passes the offset to getUpdates', async () => {
    const spy = jest.spyOn(globalThis, 'fetch').mockResolvedValue(json({ ok: true, result: [] }));
    await client().getUpdates(55, 0);
    const init = spy.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(String(init.body))).toMatchObject({ offset: 55 });
  });

  it('refuses a declared or actual oversize download', async () => {
    const spy = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(json({ ok: true, result: { file_path: 'a/b.pdf', file_size: 999 } }));
    await expect(client().downloadFile('f', 10)).rejects.toBeInstanceOf(TelegramFileTooLargeError);
    expect(spy).toHaveBeenCalledTimes(1);

    spy
      .mockResolvedValueOnce(json({ ok: true, result: { file_path: 'a/b.pdf' } }))
      .mockResolvedValueOnce(new Response(Buffer.alloc(50)));
    await expect(client().downloadFile('f', 10)).rejects.toBeInstanceOf(TelegramFileTooLargeError);
  });

  it('cancels an oversized chunked response before reading the rest', async () => {
    const cancel = jest.fn();
    const stream = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          controller.enqueue(new Uint8Array(8));
        },
        cancel,
      },
      { highWaterMark: 0 },
    );
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(json({ ok: true, result: { file_path: 'a.pdf' } }))
      .mockResolvedValueOnce(new Response(stream));
    await expect(client().downloadFile('f', 10)).rejects.toBeInstanceOf(TelegramFileTooLargeError);
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('rejects content-length before consuming a response body', async () => {
    const pull = jest.fn();
    const cancel = jest.fn();
    const stream = new ReadableStream<Uint8Array>({ pull, cancel }, { highWaterMark: 0 });
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(json({ ok: true, result: { file_path: 'a.pdf' } }))
      .mockResolvedValueOnce(new Response(stream, { headers: { 'Content-Length': '999' } }));
    await expect(client().downloadFile('f', 10)).rejects.toBeInstanceOf(TelegramFileTooLargeError);
    expect(pull).not.toHaveBeenCalled();
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('reads an exact-limit file without truncating it', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(json({ ok: true, result: { file_path: 'a.pdf' } }))
      .mockResolvedValueOnce(new Response(Buffer.from('1234567890')));
    expect(await client().downloadFile('f', 10)).toEqual(Buffer.from('1234567890'));
  });

  it('sanitizes response parsing and download stream failures', async () => {
    const spy = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(`invalid ${TOKEN}`));
    await expect(client().getUpdates(0, 0)).rejects.toMatchObject({
      name: 'TelegramApiError',
      message: 'Telegram getUpdates failed (status 200)',
    });
    spy
      .mockResolvedValueOnce(json({ ok: true, result: { file_path: 'a.pdf' } }))
      .mockResolvedValueOnce(
        new Response(
          new ReadableStream({
            start(controller) {
              controller.error(new Error(`download ${TOKEN}`));
            },
          }),
        ),
      );
    const error: unknown = await client()
      .downloadFile('f', 10)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TelegramApiError);
    expect(JSON.stringify(error)).not.toContain(TOKEN);
    expect(String(error)).not.toContain(TOKEN);
  });

  it('retains the numeric retry_after without retaining the API description', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        json({ ok: false, description: TOKEN, parameters: { retry_after: 120 } }, 429),
      );
    await expect(client().getUpdates(0, 0)).rejects.toMatchObject({
      status: 429,
      retryAfterSeconds: 120,
    });
  });

  it('uses a stable bot namespace on token rotation, isolated from other bots', () => {
    expect(client('123456:new-secret').pollKey()).toBe(client().pollKey());
    expect(client('654321:new-secret').pollKey()).not.toBe(client().pollKey());
    expect(client().pollKey()).not.toContain(TOKEN);
  });

  it.each(['creator', 'administrator', 'member'])(
    'checks private-channel administrator status (%s)',
    async (status) => {
      jest
        .spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(json({ ok: true, result: { type: 'channel' } }))
        .mockResolvedValueOnce(json({ ok: true, result: { status } }));
      expect(await client().canManageChannel('-10042', 42)).toBe(status !== 'member');
    },
  );

  it('rejects public channels and refuses redirects for token-bearing requests', async () => {
    const spy = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(json({ ok: true, result: { type: 'channel', username: 'public' } }));
    expect(await client().canManageChannel('-10042', 42)).toBe(false);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][1]).toMatchObject({ redirect: 'error' });
  });

  it('aborts in-flight polling on shutdown', async () => {
    const bot = client();
    jest.spyOn(globalThis, 'fetch').mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error(TOKEN)), { once: true });
        }),
    );
    const pending = bot.getUpdates(0, 25);
    bot.shutdown();
    await expect(pending).rejects.toMatchObject({
      name: 'TelegramApiError',
      message: 'Telegram getUpdates failed',
    });
  });
});
