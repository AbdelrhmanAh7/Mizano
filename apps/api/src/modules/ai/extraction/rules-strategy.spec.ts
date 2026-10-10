import Decimal from 'decimal.js';
import * as invoiceRules from './rules/invoice-rules-extractor';
import { Logger } from '@nestjs/common';
import { resolve } from 'path';
import { accessSync, statSync } from 'fs';

jest.mock('fs', () => ({ accessSync: jest.fn(), statSync: jest.fn(), constants: { R_OK: 4 } }));
import { RulesStrategy } from './rules-strategy.service';
import { ExtractionContext } from './extraction-strategy.interface';

jest.mock('./offline-tesseract', () => ({ createOfflineTesseractWorker: jest.fn() }));

jest.mock('../utils/image-preprocessor.util', () => ({
  preprocessForOcr: jest.fn(async (buffer: Buffer) => buffer),
}));
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createOfflineTesseractWorker } = require('./offline-tesseract') as {
  createOfflineTesseractWorker: jest.Mock;
};
const context: ExtractionContext = {
  fileBuffer: Buffer.from('image'),
  mimeType: 'image/png',
  language: 'en',
  isPdf: false,
};
const worker = () => ({
  terminate: jest.fn().mockResolvedValue(undefined),
  recognize: jest.fn().mockResolvedValue({ data: { text: 'Total: 100.00', confidence: 90 } }),
  loadLanguage: jest.fn().mockResolvedValue(undefined),
  initialize: jest.fn().mockResolvedValue(undefined),
  setParameters: jest.fn().mockResolvedValue(undefined),
});

describe('RulesStrategy worker cache', () => {
  const originalDir = process.env.INTAKE_TESSDATA_DIR;
  beforeEach(() => {
    process.env.INTAKE_TESSDATA_DIR = './tessdata';
    createOfflineTesseractWorker.mockReset();
    jest.mocked(accessSync).mockReset();
    jest
      .mocked(statSync)
      .mockReset()
      .mockReturnValue({ isFile: () => true, size: 1 } as ReturnType<typeof statSync>);
  });
  afterEach(() => {
    jest.useRealTimers();
    if (originalDir === undefined) delete process.env.INTAKE_TESSDATA_DIR;
    else process.env.INTAKE_TESSDATA_DIR = originalDir;
  });
  it('rejects unset assets without attempting worker creation', async () => {
    delete process.env.INTAKE_TESSDATA_DIR;
    expect(await new RulesStrategy().extract(context)).toBeNull();
    expect(createOfflineTesseractWorker).not.toHaveBeenCalled();
  });
  it('preserves original Decimal money before the legacy numeric adapter', async () => {
    const rules = invoiceRules.extractInvoiceFields('Total: 1.23', 0.95);
    const spy = jest.spyOn(invoiceRules, 'extractInvoiceFields').mockReturnValue({
      ...rules,
      total: {
        value: new Decimal('1.23454'),
        confidence: 0.9,
        evidence: { text: 'fixture', lineIndex: 0 },
      },
    });
    const result = await new RulesStrategy().extract({
      ...context,
      isPdf: true,
      pdfText: 'Total: 1.23454',
      pdfIsNativeText: true,
    });
    expect(result?.exactMoney.total).toBe('1.2345');
    spy.mockRestore();
  });
  it('never logs document content in OCR errors', async () => {
    const spy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    createOfflineTesseractWorker.mockResolvedValue({
      ...worker(),
      recognize: jest.fn().mockRejectedValue(new Error('secret invoice value')),
    });
    expect(await new RulesStrategy().extract(context)).toBeNull();
    expect(spy).toHaveBeenCalledWith('Tesseract OCR failed: Error');
    expect(JSON.stringify(spy.mock.calls)).not.toContain('secret invoice value');
    spy.mockRestore();
  });
  it('shares pending creation across concurrent normalized language requests', async () => {
    const w = worker();
    let finish!: (value: typeof w) => void;
    createOfflineTesseractWorker.mockImplementation(
      () =>
        new Promise((done) => {
          finish = done;
        }),
    );
    const strategy = new RulesStrategy();
    const first = strategy.extract(context);
    const second = strategy.extract({ ...context, language: 'ENG' });
    await new Promise<void>((done) => setImmediate(done));
    expect(createOfflineTesseractWorker).toHaveBeenCalledTimes(1);
    finish(w);
    expect(await first).not.toBeNull();
    expect(await second).not.toBeNull();
    expect(w.recognize).toHaveBeenCalledTimes(2);
  });
  it('caches a matching worker for each language', async () => {
    const english = worker();
    const arabic = worker();
    createOfflineTesseractWorker.mockResolvedValueOnce(english).mockResolvedValueOnce(arabic);
    const strategy = new RulesStrategy();
    await strategy.extract(context);
    await strategy.extract({ ...context, language: 'ar' });
    await strategy.extract({ ...context, language: 'ara' });
    expect(createOfflineTesseractWorker).toHaveBeenCalledTimes(2);
    expect(english.recognize).toHaveBeenCalledTimes(1);
    expect(arabic.recognize).toHaveBeenCalledTimes(2);
  });
  it('retries after failed creation', async () => {
    createOfflineTesseractWorker
      .mockRejectedValueOnce(new Error('unavailable'))
      .mockResolvedValueOnce(worker());
    const strategy = new RulesStrategy();
    expect(await strategy.extract(context)).toBeNull();
    expect(await strategy.extract(context)).not.toBeNull();
    expect(createOfflineTesseractWorker).toHaveBeenCalledTimes(2);
  });
  it('rejects missing local assets before creating a worker', async () => {
    process.env.INTAKE_TESSDATA_DIR = './missing-tessdata';
    jest.mocked(accessSync).mockImplementation(() => {
      throw new Error('missing');
    });
    expect(await new RulesStrategy().extract(context)).toBeNull();
    expect(createOfflineTesseractWorker).not.toHaveBeenCalled();
  });
  it.each([
    { isFile: () => false, size: 1 },
    { isFile: () => true, size: 0 },
  ])('rejects a directory or empty asset before worker creation %#', async (stat) => {
    jest.mocked(statSync).mockReturnValue(stat as ReturnType<typeof statSync>);
    expect(await new RulesStrategy().extract(context)).toBeNull();
    expect(createOfflineTesseractWorker).not.toHaveBeenCalled();
  });
  it('checks every requested language and uses read-only local assets', async () => {
    process.env.INTAKE_TESSDATA_DIR = './tessdata';
    createOfflineTesseractWorker.mockResolvedValue(worker());
    expect(await new RulesStrategy().extract({ ...context, language: 'eng+ara' })).not.toBeNull();
    expect(accessSync).toHaveBeenCalledWith(resolve('./tessdata/eng.traineddata'), 4);
    expect(accessSync).toHaveBeenCalledWith(resolve('./tessdata/ara.traineddata'), 4);
  });
  it('handles callback failures even when creation never settles and retries', async () => {
    createOfflineTesseractWorker
      .mockImplementationOnce((_lang, _oem, options) => {
        options.errorHandler(new Error('language load failed'));
        return new Promise(() => undefined);
      })
      .mockResolvedValueOnce(worker());
    const strategy = new RulesStrategy();
    expect(await strategy.extract(context)).toBeNull();
    expect(await strategy.extract(context)).not.toBeNull();
  });
  it('bounds pending initialization and terminates a worker arriving after timeout', async () => {
    jest.useFakeTimers();
    const late = worker();
    let finish!: (value: typeof late) => void;
    createOfflineTesseractWorker
      .mockImplementationOnce(
        () =>
          new Promise((done) => {
            finish = done;
          }),
      )
      .mockResolvedValueOnce(worker());
    const strategy = new RulesStrategy();
    const first = strategy.extract(context);
    await jest.advanceTimersByTimeAsync(30_000);
    expect(await first).toBeNull();
    expect(await strategy.extract(context)).not.toBeNull();
    finish(late);
    await jest.advanceTimersByTimeAsync(0);
    expect(late.terminate).toHaveBeenCalledTimes(1);
    expect(late.recognize).not.toHaveBeenCalled();
  });
});
