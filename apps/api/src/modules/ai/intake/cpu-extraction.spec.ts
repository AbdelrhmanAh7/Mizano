import { execFile } from 'child_process';
import { readFileSync } from 'fs';
import { readFile } from 'fs/promises';
import { join, sep } from 'path';
import { promisify } from 'util';
import { createOfflineTesseractWorker } from '../extraction/offline-tesseract';
import { writeSecureFile } from '../utils/secure-temp.util';
import { cpuReviewResult, extractCpuDocument, runPdfTool } from './cpu-extraction';
import { NATIVE_TEXT_CONFIDENCE, structuredCpuResult } from './cpu-structured';

// `execFile` is promisified once at import; the real one has a custom promisifier that
// resolves `{ stdout, stderr }`, so the mock provides the same shape.
jest.mock('child_process', () => {
  const { promisify: realPromisify } = jest.requireActual<typeof import('util')>('util');
  return { execFile: Object.assign(jest.fn(), { [realPromisify.custom]: jest.fn() }) };
});
jest.mock('fs/promises', () => ({ readFile: jest.fn() }));
jest.mock('../utils/secure-temp.util', () => ({ writeSecureFile: jest.fn() }));
jest.mock('../extraction/offline-tesseract', () => ({ createOfflineTesseractWorker: jest.fn() }));

const execute = (execFile as unknown as Record<symbol, jest.Mock>)[promisify.custom];

const fixture = (name: string): string =>
  readFileSync(join(__dirname, '../extraction/rules/__fixtures__', name), 'utf8');

/** The prlimit-wrapped tool name and arguments of every external tool call, in order. */
function toolCalls(): { tool: string; args: string[] }[] {
  return execute.mock.calls.map(([, args]: [string, string[]]) => {
    const split = args.indexOf('--');
    return { tool: args[split + 1], args: args.slice(split + 2) };
  });
}

describe('CPU extraction without an LLM', () => {
  const recognize = jest.fn();
  const terminate = jest.fn().mockResolvedValue(undefined);
  beforeEach(() => {
    jest
      .mocked(createOfflineTesseractWorker)
      .mockResolvedValue({ recognize, terminate } as unknown as Awaited<
        ReturnType<typeof createOfflineTesseractWorker>
      >);
    recognize.mockResolvedValue({ data: { text: 'private text', confidence: 80 } });
    execute.mockResolvedValue({ stdout: '', stderr: '' });
  });
  afterEach(() => {
    jest.clearAllMocks();
    execute.mockReset();
    recognize.mockReset();
    jest.mocked(readFile).mockReset();
  });

  it('retains unknown money and classification rather than claiming extraction accuracy', () => {
    expect(cpuReviewResult('text', 0.8)).toMatchObject({
      documentType: 'OTHER',
      extractedFields: { total: null, tax: null, currency: null },
      extractionMethod: 'cpu-ocr',
    });
  });

  it('uses only the pinned local OCR engine for images and terminates it', async () => {
    const result = await extractCpuDocument(Buffer.from('image'), 'image/png', '/tmp/job');
    expect(result.rawText).toBe('private text');
    // Text without any invoice evidence yields no fields, hence no confidence in any of them.
    expect(result).toMatchObject({
      extractionMethod: 'rules',
      ocrConfidence: 0,
      extractedFields: { total: null, date: null },
    });
    expect(terminate).toHaveBeenCalledTimes(1);
    expect(writeSecureFile).toHaveBeenCalledWith(join('/tmp/job', 'original'), expect.any(Buffer));
    expect(execute).not.toHaveBeenCalled();
  });

  it('runs the deterministic rules on recognized image text and returns structured fields', async () => {
    recognize.mockResolvedValue({ data: { text: fixture('en-eg-invoice.txt'), confidence: 90 } });
    const result = await extractCpuDocument(Buffer.from('image'), 'image/png', '/tmp/job');
    expect(result).toMatchObject({
      documentType: 'BILL',
      extractionMethod: 'rules',
      extractedFields: {
        documentNumber: 'INV-2024-0042',
        date: '2024-03-15',
        subtotal: '1000.0000',
        tax: '140.0000',
        total: '1140.0000',
        currency: 'EGP',
        vendorName: 'Cairo Office Supplies Co.',
      },
    });
    // The engine's own score scales the rules' confidence; it is not replaced by it.
    expect(result).toEqual(structuredCpuResult(fixture('en-eg-invoice.txt'), 0.9));
    expect(result.ocrConfidence).toBeGreaterThanOrEqual(0.6);
    expect(terminate).toHaveBeenCalledTimes(1);
  });

  it('stays evidence-only when OCR returns no usable text', async () => {
    recognize.mockResolvedValue({ data: { text: ' . ', confidence: 12 } });
    const result = await extractCpuDocument(Buffer.from('image'), 'image/png', '/tmp/job');
    expect(result).toEqual({
      ...cpuReviewResult(' . ', 0.12),
      extractorVersion: expect.any(String),
    });
  });

  it('terminates the OCR engine after recognition failure', async () => {
    recognize.mockRejectedValueOnce(new Error('private text'));
    await expect(
      extractCpuDocument(Buffer.from('image'), 'image/png', '/tmp/job'),
    ).rejects.toThrow();
    expect(terminate).toHaveBeenCalledTimes(1);
  });

  it('caps external renderer address space and CPU without a shell', async () => {
    await runPdfTool('/usr/bin/pdftoppm', ['input', 'output']);
    expect(execute).toHaveBeenCalledWith(
      '/usr/bin/prlimit',
      expect.arrayContaining(['--as=536870912', '--cpu=60', '--', '/usr/bin/pdftoppm']),
      expect.objectContaining({ maxBuffer: 1048576 }),
    );
  });

  it('extracts native PDF text without initializing OCR or a model', async () => {
    jest.mocked(readFile).mockResolvedValue('Native invoice text '.repeat(10));
    const result = await extractCpuDocument(Buffer.from('pdf'), 'application/pdf', '/tmp/job');
    expect(result.rawText).toContain('Native invoice');
    expect(createOfflineTesseractWorker).not.toHaveBeenCalled();
    expect(toolCalls().map((c) => c.tool)).toEqual(['/usr/bin/pdftotext']);
  });

  it('parses a native Arabic PDF text layer into structured fields at text-layer confidence', async () => {
    jest.mocked(readFile).mockResolvedValue(fixture('ar-eg-invoice.txt'));
    const result = await extractCpuDocument(Buffer.from('pdf'), 'application/pdf', '/tmp/job');
    expect(result).toMatchObject({
      documentType: 'BILL',
      extractionMethod: 'rules',
      extractedFields: {
        documentNumber: 'INV-2024-0150',
        date: '2024-03-15',
        total: '1140.0000',
        currency: 'EGP',
        vendorName: 'شركة النيل للتوريدات',
      },
    });
    expect(result).toEqual(
      structuredCpuResult(fixture('ar-eg-invoice.txt'), NATIVE_TEXT_CONFIDENCE),
    );
    expect(result.ocrConfidence).toBeGreaterThanOrEqual(0.6);
    expect(createOfflineTesseractWorker).not.toHaveBeenCalled();
  });

  it('keeps external-tool CPU limits within a short inherited job deadline', async () => {
    const original = process.env.INTAKE_TOOL_CPU_SECONDS;
    process.env.INTAKE_TOOL_CPU_SECONDS = '2';
    try {
      await runPdfTool('/usr/bin/pdftotext', ['input', 'output']);
      expect(execute).toHaveBeenCalledWith(
        '/usr/bin/prlimit',
        expect.arrayContaining(['--cpu=2']),
        expect.any(Object),
      );
    } finally {
      if (original === undefined) delete process.env.INTAKE_TOOL_CPU_SECONDS;
      else process.env.INTAKE_TOOL_CPU_SECONDS = original;
    }
  });

  it.each(['0', '61', '1.5', 'soon'])('refuses an unsafe tool CPU limit %s', async (value) => {
    const original = process.env.INTAKE_TOOL_CPU_SECONDS;
    process.env.INTAKE_TOOL_CPU_SECONDS = value;
    try {
      await expect(runPdfTool('/usr/bin/pdftotext', ['input', 'output'])).rejects.toThrow(
        'Invalid CPU limit',
      );
      expect(execute).not.toHaveBeenCalled();
    } finally {
      if (original === undefined) delete process.env.INTAKE_TOOL_CPU_SECONDS;
      else process.env.INTAKE_TOOL_CPU_SECONDS = original;
    }
  });

  describe('scanned PDF', () => {
    function scanned(pages: number): void {
      // `info` is the pdftotext output file (blank for a scanned document); other reads are page PNGs.
      jest
        .mocked(readFile)
        .mockImplementation(((path: string) =>
          Promise.resolve(
            path.endsWith(`${sep}info`) ? ' ' : Buffer.from(`page ${path}`),
          )) as never);
      execute.mockImplementation((_prlimit: string, args: string[]) =>
        Promise.resolve({
          stdout: args.includes('/usr/bin/pdfinfo') ? `Title: x\nPages:          ${pages}\n` : '',
          stderr: '',
        }),
      );
    }

    it('renders and recognizes every page sequentially through one terminated engine', async () => {
      scanned(3);
      const pages = [
        'Cairo Office Supplies Co.\nTax Invoice\nInvoice No: INV-2024-0042',
        'Invoice Date: 15/03/2024\nSub Total: EGP 1,000.00\nVAT 14%: EGP 140.00',
        'Total: EGP 1,140.00',
      ];
      recognize
        .mockResolvedValueOnce({ data: { text: pages[0], confidence: 90 } })
        .mockResolvedValueOnce({ data: { text: pages[1], confidence: 55 } })
        .mockResolvedValueOnce({ data: { text: pages[2], confidence: 70 } });
      const result = await extractCpuDocument(Buffer.from('pdf'), 'application/pdf', '/tmp/job');
      expect(result.rawText).toBe(pages.join('\n'));
      // Fields found on any page, with the weakest page deciding the confidence: an accountant
      // must see the doubt, not an average of 90, 55 and 70.
      expect(result).toEqual(structuredCpuResult(pages.join('\n'), 0.55));
      expect(result.extractedFields).toMatchObject({
        documentNumber: 'INV-2024-0042',
        date: '2024-03-15',
        total: '1140.0000',
        currency: 'EGP',
      });
      expect(createOfflineTesseractWorker).toHaveBeenCalledTimes(1);
      expect(terminate).toHaveBeenCalledTimes(1);
      const calls = toolCalls();
      expect(calls.map((c) => c.tool)).toEqual([
        '/usr/bin/pdftotext',
        '/usr/bin/pdfinfo',
        '/usr/bin/pdftoppm',
        '/usr/bin/pdftoppm',
        '/usr/bin/pdftoppm',
      ]);
      const pagesRendered = calls.slice(2).map((c) => c.args.slice(0, 4));
      expect(pagesRendered).toEqual([
        ['-f', '1', '-l', '1'],
        ['-f', '2', '-l', '2'],
        ['-f', '3', '-l', '3'],
      ]);
    });

    it('runs every external tool through prlimit, by absolute path, with a minimal environment', async () => {
      scanned(1);
      await extractCpuDocument(Buffer.from('pdf'), 'application/pdf', '/tmp/job');
      expect(execute).toHaveBeenCalledTimes(3);
      for (const [program, args, options] of execute.mock.calls as [
        string,
        string[],
        { env: Record<string, string> },
      ][]) {
        expect(program).toBe('/usr/bin/prlimit');
        expect(args).toContain('--');
        expect(args.find((a) => a.startsWith('--cpu='))).toBeDefined();
        expect(args.find((a) => a.startsWith('--as='))).toBeDefined();
        expect(Object.keys(options.env)).not.toContain('DATABASE_URL');
        expect(options.env.PATH).toBe('/usr/bin:/bin');
      }
    });

    it.each([0, 21, 500])('rejects %s pages before starting OCR', async (pages) => {
      scanned(pages);
      await expect(
        extractCpuDocument(Buffer.from('pdf'), 'application/pdf', '/tmp/job'),
      ).rejects.toThrow('Page limit');
      expect(createOfflineTesseractWorker).not.toHaveBeenCalled();
    });

    it('accepts exactly the page limit', async () => {
      scanned(20);
      await extractCpuDocument(Buffer.from('pdf'), 'application/pdf', '/tmp/job');
      expect(recognize).toHaveBeenCalledTimes(20);
    });

    it('terminates the engine and stops when a page cannot be rendered', async () => {
      scanned(3);
      execute.mockImplementation((_prlimit: string, args: string[]) =>
        args.includes('/usr/bin/pdftoppm')
          ? Promise.reject(new Error('private text'))
          : Promise.resolve({
              stdout: args.includes('/usr/bin/pdfinfo') ? 'Pages: 3\n' : '',
              stderr: '',
            }),
      );
      await expect(
        extractCpuDocument(Buffer.from('pdf'), 'application/pdf', '/tmp/job'),
      ).rejects.toThrow();
      expect(recognize).not.toHaveBeenCalled();
      expect(terminate).toHaveBeenCalledTimes(1);
    });
  });

  it.each(['text/plain', 'application/zip', 'application/msword'])(
    'refuses %s before starting OCR',
    async (mimeType) => {
      await expect(extractCpuDocument(Buffer.from('x'), mimeType, '/tmp/job')).rejects.toThrow(
        'Unsupported CPU format',
      );
      expect(createOfflineTesseractWorker).not.toHaveBeenCalled();
    },
  );
});
