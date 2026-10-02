import { resolve } from 'path';
import { RulesStrategy } from './rules-strategy.service';
import { ExtractionContext } from './extraction-strategy.interface';

jest.mock('tesseract.js', () => ({ createWorker: jest.fn() }));

jest.mock('../utils/image-preprocessor.util', () => ({
  preprocessForOcr: jest.fn(async (buffer: Buffer) => buffer),
}));
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createWorker } = require('tesseract.js') as { createWorker: jest.Mock };
const context: ExtractionContext = {
  fileBuffer: Buffer.from('image'),
  mimeType: 'image/png',
  language: 'en',
  isPdf: false,
};
const worker = () => ({
  recognize: jest.fn().mockResolvedValue({ data: { text: 'Total: 100.00', confidence: 90 } }),
});

describe('RulesStrategy worker cache', () => {
  const originalDir = process.env.INTAKE_TESSDATA_DIR;
  beforeEach(() => {
    delete process.env.INTAKE_TESSDATA_DIR;
    createWorker.mockReset();
  });
  afterEach(() => {
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
  it('retries after failed creation', async () => {
    createWorker.mockRejectedValueOnce(new Error('unavailable')).mockResolvedValueOnce(worker());
    const strategy = new RulesStrategy();
    expect(await strategy.extract(context)).toBeNull();
    expect(await strategy.extract(context)).not.toBeNull();
    expect(createWorker).toHaveBeenCalledTimes(2);
  });
  it('uses local read-only assets and fails without a download fallback', async () => {
    process.env.INTAKE_TESSDATA_DIR = './missing-tessdata';
    createWorker.mockRejectedValue(new Error('missing local asset'));
    expect(await new RulesStrategy().extract(context)).toBeNull();
    expect(createWorker).toHaveBeenCalledWith('eng', undefined, {
      langPath: resolve('./missing-tessdata'),
      cachePath: resolve('./missing-tessdata'),
      cacheMethod: 'readOnly',
      gzip: false,
    });
    expect(createWorker).toHaveBeenCalledTimes(1);
  });
});
