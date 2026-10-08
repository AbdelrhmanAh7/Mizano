import { Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { readFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { resolve } from 'path';
import { OcrLlmStrategy } from './ocr-llm-strategy.service';
import type { OllamaService } from '../services/ollama.service';
import type { PaddleOcrService } from '../services/paddle-ocr.service';

const createWorker = jest.fn();
jest.mock('tesseract.js', () => ({
  OEM: { LSTM_ONLY: 1 },
  createWorker: (...args: unknown[]): unknown => createWorker(...args),
}));
jest.mock('../utils/image-preprocessor.util', () => ({
  preprocessForOcr: (buffer: Buffer): Promise<Buffer> => Promise.resolve(buffer),
}));

type TesseractRunner = {
  runTesseract(buffer: Buffer, language: string): Promise<{ text: string; confidence: number }>;
  onModuleDestroy(): Promise<void>;
  extract: OcrLlmStrategy['extract'];
};

function newStrategy(): TesseractRunner {
  return new OcrLlmStrategy(
    { extractFromOcrText: async () => null } as unknown as OllamaService,
    { isAvailable: async () => false } as unknown as PaddleOcrService,
  ) as unknown as TesseractRunner;
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let complete!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    complete = resolvePromise;
  });
  return { promise, resolve: complete };
}

describe('OcrLlmStrategy offline worker', () => {
  const originalDir = process.env.INTAKE_TESSDATA_DIR;
  let worker: { recognize: jest.Mock; terminate: jest.Mock };

  beforeEach(() => {
    delete process.env.INTAKE_TESSDATA_DIR;
    worker = {
      recognize: jest.fn().mockResolvedValue({ data: { text: 'synthetic text', confidence: 88 } }),
      terminate: jest.fn().mockResolvedValue(undefined),
    };
    createWorker.mockReset().mockResolvedValue(worker);
  });

  afterEach(() => {
    if (originalDir === undefined) delete process.env.INTAKE_TESSDATA_DIR;
    else process.env.INTAKE_TESSDATA_DIR = originalDir;
  });

  it('passes verified local bytes for both languages and disables the cache', async () => {
    const apiRoot = resolve(__dirname, '../../../..');
    process.env.INTAKE_TESSDATA_DIR = apiRoot;
    createWorker.mockImplementationOnce(
      (_languages: string, _oem: number, options: { langPath: string }) => {
        for (const code of ['ara', 'eng']) {
          const snapshotHash = createHash('sha256')
            .update(readFileSync(resolve(options.langPath, `${code}.traineddata`)))
            .digest('hex');
          const sourceHash = createHash('sha256')
            .update(readFileSync(resolve(apiRoot, `${code}.traineddata`)))
            .digest('hex');
          expect(snapshotHash).toBe(sourceHash);
        }
        return Promise.resolve(worker);
      },
    );
    const result = await newStrategy().runTesseract(Buffer.from('img'), 'ar+en');
    expect(createWorker).toHaveBeenCalledWith('ara+eng', 1, {
      langPath: expect.any(String),
      cacheMethod: 'none',
      gzip: false,
      errorHandler: expect.any(Function),
    });
    const directory = createWorker.mock.calls[0][2].langPath as string;
    expect(directory.startsWith(resolve(tmpdir(), 'mizano-tesseract-'))).toBe(true);
    expect(existsSync(directory)).toBe(false);
    expect(result).toEqual({ text: 'synthetic text', confidence: 88 });
  });

  it('uses bundled local files when the directory is unset, without download defaults', async () => {
    await newStrategy().runTesseract(Buffer.from('img'), 'en');
    expect(createWorker).toHaveBeenCalledTimes(1);
    expect(createWorker.mock.calls[0][0]).toBe('ara+eng');
  });

  it.each(['https://example.invalid/ocr', '', 'file:///remote/ocr'])(
    'rejects nonlocal or empty configuration %s before starting an engine',
    async (directory) => {
      process.env.INTAKE_TESSDATA_DIR = directory;
      await expect(newStrategy().runTesseract(Buffer.from('img'), 'en')).rejects.toThrow(
        'local directory',
      );
      expect(createWorker).not.toHaveBeenCalled();
    },
  );

  it('rejects languages without pinned assets', async () => {
    await expect(newStrategy().runTesseract(Buffer.from('img'), 'fra')).rejects.toThrow(
      'Unsupported offline OCR language',
    );
    expect(createWorker).not.toHaveBeenCalled();
  });

  it('keeps Arabic and English available when later documents change language', async () => {
    const strategy = newStrategy();
    await strategy.runTesseract(Buffer.from('a'), 'en');
    await strategy.runTesseract(Buffer.from('b'), 'ara');
    expect(createWorker).toHaveBeenCalledTimes(1);
    expect(worker.recognize).toHaveBeenNthCalledWith(1, Buffer.from('a'));
    expect(worker.recognize).toHaveBeenNthCalledWith(2, Buffer.from('b'));
  });

  it('serializes concurrent initialization and recognition on one worker', async () => {
    const started = deferred<void>();
    const result = deferred<{ data: { text: string; confidence: number } }>();
    worker.recognize.mockImplementationOnce(() => {
      started.resolve();
      return result.promise;
    });
    const strategy = newStrategy();
    const first = strategy.runTesseract(Buffer.from('a'), 'en');
    const second = strategy.runTesseract(Buffer.from('b'), 'ara');
    await started.promise;
    expect(createWorker).toHaveBeenCalledTimes(1);
    expect(worker.recognize).toHaveBeenCalledTimes(1);
    result.resolve({ data: { text: 'first', confidence: 90 } });
    expect(await first).toEqual({ text: 'first', confidence: 90 });
    expect(await second).toEqual({ text: 'synthetic text', confidence: 88 });
    expect(createWorker).toHaveBeenCalledTimes(1);
  });

  it('permits a subsequent attempt after initialization rejects', async () => {
    createWorker.mockRejectedValueOnce(new Error('synthetic engine failure'));
    const strategy = newStrategy();
    await expect(strategy.runTesseract(Buffer.from('a'), 'en')).rejects.toThrow('engine failure');
    await expect(strategy.runTesseract(Buffer.from('b'), 'en')).resolves.toEqual({
      text: 'synthetic text',
      confidence: 88,
    });
    expect(createWorker).toHaveBeenCalledTimes(2);
  });

  it('terminates a failed engine before retrying with a fresh worker', async () => {
    worker.recognize.mockRejectedValueOnce(new Error('synthetic recognition failure'));
    const strategy = newStrategy();
    await expect(strategy.runTesseract(Buffer.from('a'), 'en')).rejects.toThrow(
      'recognition failure',
    );
    expect(worker.terminate).toHaveBeenCalledTimes(1);
    await strategy.runTesseract(Buffer.from('b'), 'en');
    expect(createWorker).toHaveBeenCalledTimes(2);
  });

  it('drains accepted work and terminates on shutdown, rejecting new work', async () => {
    const started = deferred<void>();
    const result = deferred<{ data: { text: string; confidence: number } }>();
    worker.recognize.mockImplementationOnce(() => {
      started.resolve();
      return result.promise;
    });
    const strategy = newStrategy();
    const task = strategy.runTesseract(Buffer.from('a'), 'en');
    await started.promise;
    const shutdown = strategy.onModuleDestroy();
    expect(worker.terminate).not.toHaveBeenCalled();
    await expect(strategy.runTesseract(Buffer.from('b'), 'en')).rejects.toThrow('shutting down');
    result.resolve({ data: { text: 'done', confidence: 90 } });
    await task;
    await shutdown;
    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });

  it('never logs a caller-supplied model override', async () => {
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    expect(
      await newStrategy().extract({
        fileBuffer: Buffer.from('image'),
        mimeType: 'image/png',
        language: 'en',
        isPdf: false,
        modelOverride: 'ZXQ total 8,765.43 token=secret-value',
      }),
    ).toBeNull();
    expect(log).toHaveBeenCalledWith(
      '[STEP 4] Sending OCR text to the configured Ollama model for JSON extraction',
    );
    const output = JSON.stringify(log.mock.calls);
    expect(output).not.toContain('ZXQ');
    expect(output).not.toContain('8,765.43');
    expect(output).not.toContain('secret-value');
  });

  it('falls back to native PDF text when Paddle yields too little, never Tesseract on PDF bytes', async () => {
    const extractFromOcrText = jest.fn().mockResolvedValue(null);
    const strategy = new OcrLlmStrategy(
      { extractFromOcrText } as unknown as OllamaService,
      {
        isAvailable: async () => true,
        recognize: async () => ({ text: 'short', confidence: 10 }),
      } as unknown as PaddleOcrService,
    );
    const pdfText = 'native pdf text longer than twenty characters';
    await strategy.extract({
      fileBuffer: Buffer.from('%PDF'),
      mimeType: 'application/pdf',
      language: 'en',
      isPdf: true,
      pdfText,
      pdfIsNativeText: false,
    });
    expect(extractFromOcrText).toHaveBeenCalledWith(pdfText, 90, undefined);
    expect(createWorker).not.toHaveBeenCalled();
  });

  it('returns null for a PDF without usable text and never starts Tesseract', async () => {
    const strategy = new OcrLlmStrategy(
      { extractFromOcrText: async () => null } as unknown as OllamaService,
      { isAvailable: async () => false } as unknown as PaddleOcrService,
    );
    expect(
      await strategy.extract({
        fileBuffer: Buffer.from('%PDF'),
        mimeType: 'application/pdf',
        language: 'en',
        isPdf: true,
        pdfText: 'tiny',
      }),
    ).toBeNull();
    expect(createWorker).not.toHaveBeenCalled();
  });

  it('logs metadata only when an OCR error contains document values', async () => {
    const errorLog = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    createWorker.mockRejectedValueOnce(new Error('ZXQ invoice total 8,765.43 token=secret-value'));
    expect(
      await newStrategy().extract({
        fileBuffer: Buffer.from('image'),
        mimeType: 'image/png',
        language: 'en',
        isPdf: false,
      }),
    ).toBeNull();
    expect(errorLog).toHaveBeenCalledWith('[STEP 2] Tesseract.js OCR failed: Error');
    const output = JSON.stringify(errorLog.mock.calls);
    expect(output).not.toContain('ZXQ');
    expect(output).not.toContain('8,765.43');
    expect(output).not.toContain('secret-value');
  });
});
