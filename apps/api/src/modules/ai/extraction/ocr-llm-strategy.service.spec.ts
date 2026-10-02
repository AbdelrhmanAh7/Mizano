import { OcrLlmStrategy } from './ocr-llm-strategy.service';
import type { OllamaService } from '../services/ollama.service';
import type { PaddleOcrService } from '../services/paddle-ocr.service';

const createWorker = jest.fn();
jest.mock('tesseract.js', () => ({
  createWorker: (...args: unknown[]): unknown => createWorker(...args),
}));

type TesseractRunner = {
  runTesseract(buffer: Buffer, language: string): Promise<{ text: string; confidence: number }>;
};

function newStrategy(): TesseractRunner {
  return new OcrLlmStrategy(
    {} as unknown as OllamaService,
    {} as unknown as PaddleOcrService,
  ) as unknown as TesseractRunner;
}

describe('OcrLlmStrategy tesseract worker', () => {
  const originalDir = process.env.INTAKE_TESSDATA_DIR;

  afterEach(() => {
    if (originalDir === undefined) delete process.env.INTAKE_TESSDATA_DIR;
    else process.env.INTAKE_TESSDATA_DIR = originalDir;
    createWorker.mockReset();
  });

  it('loads the bundled traineddata from INTAKE_TESSDATA_DIR', async () => {
    process.env.INTAKE_TESSDATA_DIR = '/app/tessdata';
    createWorker.mockResolvedValue({
      recognize: jest.fn().mockResolvedValue({ data: { text: 'total 10', confidence: 88 } }),
    });

    const result = await newStrategy().runTesseract(Buffer.from('img'), 'ar+en');

    expect(createWorker).toHaveBeenCalledWith('ara+eng', undefined, {
      langPath: '/app/tessdata',
      cachePath: '/app/tessdata',
      gzip: false,
    });
    expect(result).toEqual({ text: 'total 10', confidence: 88 });
  });

  it('falls back to the tesseract.js defaults when INTAKE_TESSDATA_DIR is unset', async () => {
    delete process.env.INTAKE_TESSDATA_DIR;
    createWorker.mockResolvedValue({
      recognize: jest.fn().mockResolvedValue({ data: { text: '', confidence: 0 } }),
    });

    await newStrategy().runTesseract(Buffer.from('img'), 'en');

    expect(createWorker).toHaveBeenCalledWith('eng', undefined, undefined);
  });

  it('reuses one worker across calls', async () => {
    process.env.INTAKE_TESSDATA_DIR = '/app/tessdata';
    createWorker.mockResolvedValue({
      recognize: jest.fn().mockResolvedValue({ data: { text: 'x', confidence: 1 } }),
    });
    const strategy = newStrategy();

    await strategy.runTesseract(Buffer.from('a'), 'en');
    await strategy.runTesseract(Buffer.from('b'), 'en');

    expect(createWorker).toHaveBeenCalledTimes(1);
  });
});
