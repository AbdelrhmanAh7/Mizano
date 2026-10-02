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
});
