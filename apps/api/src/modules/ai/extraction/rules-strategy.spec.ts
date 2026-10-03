import { resolve } from 'path';
import { accessSync } from 'fs';
import { createWorker as createTesseractWorker } from 'tesseract.js';

jest.mock('fs', () => ({ accessSync: jest.fn(), constants: { R_OK: 4 } }));
import { RulesStrategy } from './rules-strategy.service';
import { ExtractionContext } from './extraction-strategy.interface';
import { renderPdfPage } from '../utils/pdf-extractor.util';
import { MAX_INTAKE_TEXT } from '../intake/format-error';

jest.mock('../utils/pdf-extractor.util', () => ({ renderPdfPage: jest.fn() }));

jest.mock('tesseract.js', () => ({ createWorker: jest.fn() }));

jest.mock('../utils/image-preprocessor.util', () => ({
  preprocessForOcr: jest.fn(async (buffer: Buffer) => buffer),
}));
const createWorker = createTesseractWorker as unknown as jest.Mock;
const context: ExtractionContext = {
  fileBuffer: Buffer.from('image'),
  mimeType: 'image/png',
  language: 'en',
  isPdf: false,
};
const worker = () => ({
  terminate: jest.fn().mockResolvedValue(undefined),
  recognize: jest.fn().mockResolvedValue({ data: { text: 'Total: 100.00', confidence: 90 } }),
});

describe('RulesStrategy worker cache', () => {
  const originalDir = process.env.INTAKE_TESSDATA_DIR;
  beforeEach(() => {
    process.env.INTAKE_TESSDATA_DIR = './tessdata';
    createWorker.mockReset();
    jest.mocked(accessSync).mockReset();
    jest.mocked(renderPdfPage).mockReset().mockResolvedValue(Buffer.from('scanned'));
  });
  afterEach(() => {
    jest.useRealTimers();
    if (originalDir === undefined) delete process.env.INTAKE_TESSDATA_DIR;
    else process.env.INTAKE_TESSDATA_DIR = originalDir;
  });
  it('shares pending creation across concurrent normalized language requests', async () => {
    const w = worker();
    let finish!: (value: typeof w) => void;
    createWorker.mockImplementation(
      () =>
        new Promise((done) => {
          finish = done;
        }),
    );
    const strategy = new RulesStrategy();
    const first = strategy.extract(context);
    const second = strategy.extract({ ...context, language: 'ENG' });
    await new Promise<void>((done) => setImmediate(done));
    expect(createWorker).toHaveBeenCalledTimes(1);
    finish(w);
    expect(await first).not.toBeNull();
    expect(await second).not.toBeNull();
    expect(w.recognize).toHaveBeenCalledTimes(2);
  });
  it('caches a matching worker for each language', async () => {
    const english = worker();
    const arabic = worker();
    createWorker.mockResolvedValueOnce(english).mockResolvedValueOnce(arabic);
    const strategy = new RulesStrategy();
    await strategy.extract(context);
    await strategy.extract({ ...context, language: 'ar' });
    await strategy.extract({ ...context, language: 'ara' });
    expect(createWorker.mock.calls.map((call: unknown[]) => call[0])).toEqual(['eng', 'ara']);
    expect(english.recognize).toHaveBeenCalledTimes(1);
    expect(arabic.recognize).toHaveBeenCalledTimes(2);
  });
  it('canonicalizes language order and duplicates to one cached worker', async () => {
    const w = worker();
    createWorker.mockResolvedValue(w);
    const strategy = new RulesStrategy();
    await strategy.extract({ ...context, language: 'ar+en' });
    await strategy.extract({ ...context, language: 'eng+ara+eng' });
    expect(createWorker).toHaveBeenCalledTimes(1);
    expect(createWorker.mock.calls[0][0]).toBe('eng+ara');
    await strategy.onModuleDestroy();
  });
  it.each(['fra', 'eng+fra', '', '../eng'])(
    'rejects unbundled OCR language %s offline',
    async (language) => {
      await expect(new RulesStrategy().extract({ ...context, language })).rejects.toThrow(
        'INTAKE_UNSUPPORTED_LANGUAGE',
      );
      expect(createWorker).not.toHaveBeenCalled();
      expect(accessSync).not.toHaveBeenCalled();
    },
  );
  it('preserves both sources and flags review for native text and scanned totals on one page', async () => {
    const w = worker();
    w.recognize.mockResolvedValue({ data: { text: 'Grand total: 228.0000', confidence: 90 } });
    createWorker.mockResolvedValue(w);
    const native = 'Invoice number: FMT-17\nInvoice date: 2026-09-01\nCurrency: EGP';
    const strategy = new RulesStrategy();
    const output = await strategy.extract({
      ...context,
      isPdf: true,
      pdfPages: [{ page: 1, text: native, isNativeText: false }],
    });
    expect(output?.extraction.rawText).toBe(native + '\nGrand total: 228.0000');
    expect(output?.extraction.invoiceNumber).toBe('FMT-17');
    expect(output?.extraction.total).toBe('228.0000');
    expect(output?.extraction.extractionWarnings).toContain('PDF_MIXED_CONTENT');
    await strategy.onModuleDestroy();
  });
  it('uses native text on pages 1 and 3 and OCR only on scanned page 2', async () => {
    const w = worker();
    w.recognize.mockResolvedValue({ data: { text: 'VAT: 28.0000', confidence: 90 } });
    createWorker.mockResolvedValue(w);
    jest.mocked(renderPdfPage).mockResolvedValue(Buffer.from('rendered-page-2'));
    const first = 'supporting text '.repeat(350);
    const last = 'Invoice number: FMT-17\nInvoice date: 2026-09-01\nGrand total: 228.0000';
    const result = await new RulesStrategy().extract({
      ...context,
      isPdf: true,
      pdfPages: [
        { page: 1, text: first, isNativeText: true },
        { page: 2, text: '', isNativeText: false },
        { page: 3, text: last, isNativeText: true },
      ],
    });
    expect(renderPdfPage).toHaveBeenCalledWith(context.fileBuffer, 2);
    expect(w.recognize).toHaveBeenCalledWith(Buffer.from('rendered-page-2'), { rotateAuto: true });
    expect(result?.extraction.rawText).toBe(first + '\nVAT: 28.0000\n' + last);
    expect(result?.extraction.total).toBe('228.0000');
  });
  it.each([
    { text: '', confidence: 90 },
    { text: 'Total: 228.0000', confidence: 12 },
  ])('rejects unreadable images with a repair rather than false completion', async (ocr) => {
    const w = worker();
    w.recognize.mockResolvedValue({ data: ocr });
    createWorker.mockResolvedValue(w);
    await expect(new RulesStrategy().extract(context)).rejects.toThrow(
      'Retake the whole page upright in good light',
    );
  });
  it('retries after failed creation', async () => {
    createWorker.mockRejectedValueOnce(new Error('unavailable')).mockResolvedValueOnce(worker());
    const strategy = new RulesStrategy();
    await expect(strategy.extract(context)).rejects.toThrow('INTAKE_TOOL_UNAVAILABLE');
    expect(await strategy.extract(context)).not.toBeNull();
    expect(createWorker).toHaveBeenCalledTimes(2);
  });
  it('rejects missing local assets before creating a worker', async () => {
    process.env.INTAKE_TESSDATA_DIR = './missing-tessdata';
    jest.mocked(accessSync).mockImplementation(() => {
      throw new Error('missing');
    });
    await expect(new RulesStrategy().extract(context)).rejects.toThrow('INTAKE_TOOL_UNAVAILABLE');
    expect(createWorker).not.toHaveBeenCalled();
  });
  it('returns the same operator repair when a scanned PDF has missing local OCR assets', async () => {
    delete process.env.INTAKE_TESSDATA_DIR;
    await expect(
      new RulesStrategy().extract({
        ...context,
        isPdf: true,
        pdfPages: [{ page: 1, text: '', isNativeText: false }],
      }),
    ).rejects.toThrow('INTAKE_TOOL_UNAVAILABLE');
    expect(createWorker).not.toHaveBeenCalled();
  });
  it('checks every requested language and uses read-only local assets', async () => {
    process.env.INTAKE_TESSDATA_DIR = './tessdata';
    createWorker.mockResolvedValue(worker());
    expect(await new RulesStrategy().extract({ ...context, language: 'eng+ara' })).not.toBeNull();
    expect(accessSync).toHaveBeenCalledWith(resolve('./tessdata/eng.traineddata'), 4);
    expect(accessSync).toHaveBeenCalledWith(resolve('./tessdata/ara.traineddata'), 4);
    expect(createWorker).toHaveBeenCalledWith('eng+ara', undefined, {
      langPath: resolve('./tessdata'),
      cachePath: resolve('./tessdata'),
      cacheMethod: 'readOnly',
      gzip: false,
      errorHandler: expect.any(Function),
    });
  });
  it('handles callback failures even when creation never settles and retries', async () => {
    createWorker
      .mockImplementationOnce((_lang, _oem, options) => {
        options.errorHandler(new Error('language load failed'));
        return new Promise(() => undefined);
      })
      .mockResolvedValueOnce(worker());
    const strategy = new RulesStrategy();
    await expect(strategy.extract(context)).rejects.toThrow('INTAKE_TOOL_UNAVAILABLE');
    expect(await strategy.extract(context)).not.toBeNull();
  });
  it('bounds pending initialization and terminates a worker arriving after timeout', async () => {
    jest.useFakeTimers();
    const late = worker();
    let finish!: (value: typeof late) => void;
    createWorker
      .mockImplementationOnce(
        () =>
          new Promise((done) => {
            finish = done;
          }),
      )
      .mockResolvedValueOnce(worker());
    const strategy = new RulesStrategy();
    const first = expect(strategy.extract(context)).rejects.toThrow('INTAKE_TOOL_UNAVAILABLE');
    await jest.advanceTimersByTimeAsync(30_000);
    await first;
    expect(await strategy.extract(context)).not.toBeNull();
    finish(late);
    await jest.advanceTimersByTimeAsync(0);
    expect(late.terminate).toHaveBeenCalledTimes(1);
    expect(late.recognize).not.toHaveBeenCalled();
  });

  it('OCRs only the scanned page and preserves native text in page order', async () => {
    const w = worker();
    w.recognize.mockResolvedValue({
      data: { text: 'VAT: 28.0000\nGrand total: 228.0000', confidence: 90 },
    });
    createWorker.mockResolvedValue(w);
    const output = await new RulesStrategy().extract({
      ...context,
      isPdf: true,
      mimeType: 'application/pdf',
      pdfPages: [
        {
          page: 1,
          text: 'Supplier:\tFormats Synthetic Supplier\nInvoice number: FMT-17\nInvoice date: 2026-09-01\nCurrency: EGP\nSubtotal: 200.0000',
          isNativeText: true,
        },
        { page: 2, text: '', isNativeText: false },
        { page: 3, text: 'END-OF-DOCUMENT', isNativeText: true },
      ],
    });
    expect(renderPdfPage).toHaveBeenCalledTimes(1);
    expect(renderPdfPage).toHaveBeenCalledWith(context.fileBuffer, 2);
    expect(w.recognize).toHaveBeenCalledWith(Buffer.from('scanned'), { rotateAuto: true });
    expect(output?.extraction).toMatchObject({
      total: '228.0000',
      tax: '28.0000',
      invoiceNumber: 'FMT-17',
      vendorName: 'Formats Synthetic Supplier',
    });
    expect(output?.extraction.rawText).toContain('228.0000\nEND-OF-DOCUMENT');
  });

  it.each([
    { text: '', confidence: 90 },
    { text: 'misread invoice text', confidence: 15 },
  ])('returns actionable repair for unreadable OCR %j', async (data) => {
    const w = worker();
    w.recognize.mockResolvedValue({ data });
    createWorker.mockResolvedValue(w);
    await expect(new RulesStrategy().extract(context)).rejects.toThrow('Retake the whole page');
  });

  it('rejects unreadable scanned pages rather than completing a partial PDF', async () => {
    const w = worker();
    w.recognize.mockResolvedValue({ data: { text: '', confidence: 0 } });
    createWorker.mockResolvedValue(w);
    await expect(
      new RulesStrategy().extract({
        ...context,
        isPdf: true,
        pdfPages: [
          { page: 1, text: 'Grand total: 228.0000', isNativeText: true },
          { page: 2, text: '', isNativeText: false },
        ],
      }),
    ).rejects.toThrow('INTAKE_UNREADABLE');
  });

  it('keeps all bounded Word text and rejects excessive text explicitly', async () => {
    const documentText = 'Supporting text. '.repeat(300) + '\nGrand total: 228.0000';
    const strategy = new RulesStrategy();
    const output = await strategy.extract({ ...context, documentText });
    expect(output?.extraction.rawText).toBe(documentText);
    expect(output?.extraction.total).toBe('228.0000');
    expect(createWorker).not.toHaveBeenCalled();
    await expect(
      strategy.extract({ ...context, documentText: 'x'.repeat(MAX_INTAKE_TEXT + 1) }),
    ).rejects.toThrow('INTAKE_TOO_LARGE');
  });

  it('serializes recognition on the shared CPU worker', async () => {
    const w = worker();
    let release!: (value: { data: { text: string; confidence: number } }) => void;
    w.recognize.mockImplementationOnce(
      () =>
        new Promise((done) => {
          release = done;
        }),
    );
    createWorker.mockResolvedValue(w);
    const strategy = new RulesStrategy();
    const first = strategy.extract(context);
    const second = strategy.extract(context);
    await new Promise<void>((done) => setImmediate(done));
    expect(w.recognize).toHaveBeenCalledTimes(1);
    release({ data: { text: 'Grand total: 228.0000', confidence: 90 } });
    await Promise.all([first, second]);
    expect(w.recognize).toHaveBeenCalledTimes(2);
    await strategy.onModuleDestroy();
    expect(w.terminate).toHaveBeenCalledTimes(1);
  });

  it('bounds recognition time and discards the stuck worker', async () => {
    jest.useFakeTimers();
    const w = worker();
    w.recognize.mockImplementation(() => new Promise(() => undefined));
    createWorker.mockResolvedValue(w);
    const strategy = new RulesStrategy();
    const check = expect(strategy.extract(context)).rejects.toThrow('INTAKE_TOO_LARGE');
    await jest.advanceTimersByTimeAsync(30000);
    await check;
    expect(w.terminate).toHaveBeenCalledTimes(1);
    await strategy.onModuleDestroy();
    expect(w.terminate).toHaveBeenCalledTimes(1);
  });
  it('does not send a queued request to a worker terminated by a preceding timeout', async () => {
    jest.useFakeTimers();
    const w = worker();
    w.recognize.mockImplementation(() => new Promise(() => undefined));
    createWorker.mockResolvedValue(w);
    const strategy = new RulesStrategy();
    const first = expect(strategy.extract(context)).rejects.toThrow('INTAKE_TOO_LARGE');
    const second = expect(strategy.extract(context)).rejects.toThrow('INTAKE_TOOL_UNAVAILABLE');
    await jest.advanceTimersByTimeAsync(30000);
    await Promise.all([first, second]);
    expect(w.recognize).toHaveBeenCalledTimes(1);
    expect(w.terminate).toHaveBeenCalledTimes(1);
  });
});
