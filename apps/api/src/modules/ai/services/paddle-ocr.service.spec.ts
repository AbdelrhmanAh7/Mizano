import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { PaddleOcrService } from './paddle-ocr.service';

type ExecCallback = (error: Error | null, stdout: string, stderr: string) => void;

const mockExecFile = jest.fn();
jest.mock('child_process', () => ({
  execFile: (...args: unknown[]) => mockExecFile(...args),
}));

const SENTINEL_TEXT = 'ZXQ confidential invoice line 8,765.43';

function buildService(): PaddleOcrService {
  const service = new PaddleOcrService({
    get: (_key: string, fallback?: string) => fallback,
  } as unknown as ConfigService);
  const internals = service as unknown as Record<string, unknown>;
  internals.ocrAvailable = true;
  internals.pdfRenderAvailable = true;
  internals.ocrScriptPath = 'ocr.py';
  internals.pdfScriptPath = 'pdf.py';
  return service;
}

describe('PaddleOcrService temp files', () => {
  let seenPaths: string[];
  let printed: jest.SpyInstance[];

  beforeEach(() => {
    seenPaths = [];
    mockExecFile.mockReset();
    printed = (['log', 'warn', 'error', 'debug'] as const).map((m) =>
      jest.spyOn(Logger.prototype, m).mockImplementation(() => undefined),
    );
  });

  afterEach(() => jest.restoreAllMocks());

  it('writes the upload into a private mkdtemp directory under a random name and removes it', async () => {
    mockExecFile.mockImplementation(
      (_py: string, args: string[], _o: unknown, cb: ExecCallback) => {
        const file = args[1];
        seenPaths.push(file);
        // exists while the engine runs, with the right content
        expect(fs.readFileSync(file).toString()).toBe('image-bytes');
        cb(null, JSON.stringify({ text: SENTINEL_TEXT, confidence: 90, regions: [] }), '');
      },
    );

    const result = await buildService().recognize(Buffer.from('image-bytes'));

    expect(result.text).toBe(SENTINEL_TEXT);
    const file = seenPaths[0];
    const dir = path.dirname(file);
    expect(path.dirname(dir)).toBe(path.resolve(os.tmpdir()));
    expect(path.basename(dir)).toMatch(/^mizano-ocr-[A-Za-z0-9]{6}$/);
    expect(path.basename(file)).toMatch(/^[0-9a-f-]{36}\.jpg$/);
    expect(path.basename(file)).not.toMatch(/mizano_ocr_\d+/); // the old predictable pattern
    expect(fs.existsSync(dir)).toBe(false);
  });

  it('uses a different directory and file name for every call', async () => {
    mockExecFile.mockImplementation(
      (_py: string, args: string[], _o: unknown, cb: ExecCallback) => {
        seenPaths.push(args[1]);
        cb(null, JSON.stringify({ text: '', confidence: 0, regions: [] }), '');
      },
    );
    const service = buildService();
    await service.recognize(Buffer.from('a'));
    await service.recognize(Buffer.from('b'));
    expect(seenPaths[0]).not.toBe(seenPaths[1]);
    expect(path.dirname(seenPaths[0])).not.toBe(path.dirname(seenPaths[1]));
  });

  it('still removes the directory when OCR fails, and logs neither text nor stderr details', async () => {
    mockExecFile.mockImplementation(
      (_py: string, args: string[], _o: unknown, cb: ExecCallback) => {
        seenPaths.push(args[1]);
        cb(
          new Error('Command failed'),
          '',
          `Traceback (most recent call last):\n  line = "${SENTINEL_TEXT}"\nValueError: bad page`,
        );
      },
    );

    const result = await buildService().recognize(Buffer.from('image-bytes'));

    expect(result.text).toBe('');
    expect(fs.existsSync(path.dirname(seenPaths[0]))).toBe(false);
    // stderr is reduced to its last line (the exception summary), not dumped
    const output = JSON.stringify(printed.flatMap((spy) => spy.mock.calls));
    expect(output).toContain('PaddleOCR failed');
    expect(output).toContain('ValueError: bad page');
    expect(output).not.toContain('ZXQ');
  });

  it('does not hand application secrets to the Python subprocess', async () => {
    process.env.JWT_SECRET = 'jwt-secret-value';
    process.env.DATABASE_URL = 'postgresql://user:db-password@db/x';
    process.env.SMTP_PASSWORD = 'smtp-password-value';
    let env: Record<string, string> | undefined;
    mockExecFile.mockImplementation(
      (
        _py: string,
        _args: string[],
        options: { env: Record<string, string> },
        cb: ExecCallback,
      ) => {
        env = options.env;
        cb(null, JSON.stringify({ text: '', confidence: 0, regions: [] }), '');
      },
    );

    await buildService().recognize(Buffer.from('x'));

    expect(env).toBeDefined();
    const passed = JSON.stringify(env);
    expect(passed).not.toContain('jwt-secret-value');
    expect(passed).not.toContain('db-password');
    expect(passed).not.toContain('smtp-password-value');
    expect(env?.PYTHONIOENCODING).toBe('utf-8');
    expect(env?.PYTHONPATH).toBeDefined();
  });

  it('does not log Python stderr lines that could quote the document', async () => {
    mockExecFile.mockImplementation(
      (_py: string, _args: string[], _o: unknown, cb: ExecCallback) => {
        cb(
          null,
          JSON.stringify({ text: '', confidence: 0, regions: [] }),
          `Downloading Arabic rec model to /models/x...\nWarning: line "${SENTINEL_TEXT}" skipped\n`,
        );
      },
    );

    await buildService().recognize(Buffer.from('x'));

    const output = JSON.stringify(printed.flatMap((spy) => spy.mock.calls));
    expect(output).toContain('Downloading Arabic rec model');
    expect(output).not.toContain('ZXQ');
  });

  it('does not log recognised region text or the OCR text', async () => {
    mockExecFile.mockImplementation(
      (_py: string, _args: string[], _o: unknown, cb: ExecCallback) => {
        cb(
          null,
          JSON.stringify({
            text: SENTINEL_TEXT,
            confidence: 90,
            regions: [{ text: SENTINEL_TEXT, bbox: [0, 0, 1, 1], confidence: 90 }],
          }),
          '',
        );
      },
    );

    await buildService().recognize(Buffer.from('image-bytes'));

    const output = JSON.stringify(printed.flatMap((spy) => spy.mock.calls));
    expect(output).toContain('regions=1');
    expect(output).not.toContain('ZXQ');
    expect(output).not.toContain('8,765.43');
  });

  it('pdfPageToImage uses a private directory for both files and cleans up (also on failure)', async () => {
    mockExecFile.mockImplementation(
      (_py: string, args: string[], _o: unknown, cb: ExecCallback) => {
        seenPaths.push(args[1], args[2]);
        fs.writeFileSync(args[2], 'png-bytes');
        cb(null, 'ok', '');
      },
    );
    const service = buildService();
    const image = await service.pdfPageToImage(Buffer.from('%PDF-1.4'));

    expect(image?.toString()).toBe('png-bytes');
    const [pdf, png] = seenPaths;
    expect(path.dirname(pdf)).toBe(path.dirname(png));
    expect(path.basename(path.dirname(pdf))).toMatch(/^mizano-pdf-/);
    expect(fs.existsSync(path.dirname(pdf))).toBe(false);

    seenPaths = [];
    mockExecFile.mockImplementation(
      (_py: string, args: string[], _o: unknown, cb: ExecCallback) => {
        seenPaths.push(args[1]);
        cb(new Error('boom'), '', 'RuntimeError: render failed');
      },
    );
    expect(await service.pdfPageToImage(Buffer.from('%PDF-1.4'))).toBeNull();
    expect(fs.existsSync(path.dirname(seenPaths[0]))).toBe(false);
  });

  it('keeps the helper scripts in a private directory that is removed on shutdown', async () => {
    mockExecFile.mockImplementation((_py: string, _args: string[], _o: unknown, cb: ExecCallback) =>
      cb(null, 'ok', ''),
    );
    const service = new PaddleOcrService({
      get: (_key: string, fallback?: string) => fallback,
    } as unknown as ConfigService);

    await service.onModuleInit();
    const ocrScript = (service as unknown as { ocrScriptPath: string }).ocrScriptPath;
    const dir = path.dirname(ocrScript);
    expect(path.basename(dir)).toMatch(/^mizano-ocr-scripts-/);
    expect(path.dirname(dir)).toBe(path.resolve(os.tmpdir()));
    expect(fs.existsSync(ocrScript)).toBe(true);
    expect(path.dirname(ocrScript)).not.toBe(path.resolve(os.tmpdir())); // not directly in /tmp

    await service.onModuleDestroy();
    expect(fs.existsSync(dir)).toBe(false);
  });
});
