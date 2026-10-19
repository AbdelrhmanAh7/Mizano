import { runFormatTool } from '../intake/format-tools';
import { extractTextFromPdf, renderPdfPage } from './pdf-extractor.util';

jest.mock('../intake/format-tools', () => ({ runFormatTool: jest.fn() }));
const run = jest.mocked(runFormatTool);

describe('bounded per-page PDF extraction', () => {
  beforeEach(() => run.mockReset());
  it('retains later-page totals and text beyond 4000 characters', async () => {
    const first = 'supporting text '.repeat(350);
    const last = 'Invoice number: FMT-17\nInvoice date: 2026-09-01\nGrand total: 228.0000';
    run
      .mockResolvedValueOnce('Pages: 2\nEncrypted: no')
      .mockResolvedValueOnce('')
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce(last);
    const result = await extractTextFromPdf(Buffer.from('%PDF-1.4'));
    expect(result.text).toBe(first + '\n' + last);
    expect(result.text.indexOf('228.0000')).toBeGreaterThan(4000);
    expect(result.pages.map((p) => p.page)).toEqual([1, 2]);
    expect(run.mock.calls[3][1]).toEqual(expect.arrayContaining(['-f', '2', '-l', '2']));
  });
  it('routes each mixed page independently', async () => {
    run
      .mockResolvedValueOnce('Pages: 3\nEncrypted: no')
      .mockResolvedValueOnce('2 0 image 1200 600 rgb 3 8 jpeg no 7 0 100 100 50K 10%')
      .mockResolvedValueOnce('Native invoice text '.repeat(5))
      .mockResolvedValueOnce('')
      .mockResolvedValueOnce('Native summary text '.repeat(5));
    expect(
      (await extractTextFromPdf(Buffer.from('%PDF-1.4'))).pages.map((p) => p.isNativeText),
    ).toEqual([true, false, true]);
  });
  it('routes a page with a native header and raster totals to OCR, retaining its native text', async () => {
    const native =
      'Supplier: Formats Synthetic Supplier\nInvoice number: FMT-17\nInvoice date: 2026-09-01';
    run
      .mockResolvedValueOnce('Pages: 1\nEncrypted: no')
      .mockResolvedValueOnce('1 0 image 1200 600 rgb 3 8 jpeg no 7 0 100 100 50K 10%')
      .mockResolvedValueOnce(native);
    expect((await extractTextFromPdf(Buffer.from('%PDF-1.4'))).pages).toEqual([
      { page: 1, text: native, isNativeText: false },
    ]);
    expect(run.mock.calls[1][0]).toBe('pdfimages');
  });
  it('keeps short native text without requiring OCR', async () => {
    run
      .mockResolvedValueOnce('Pages: 1\nEncrypted: no')
      .mockResolvedValueOnce('')
      .mockResolvedValueOnce('Grand total: 228.0000');
    expect((await extractTextFromPdf(Buffer.from('%PDF-1.4'))).pages[0].isNativeText).toBe(true);
  });
  it('rejects image metadata referencing a nonexistent page', async () => {
    run.mockResolvedValueOnce('Pages: 1').mockResolvedValueOnce('2 0 image');
    await expect(extractTextFromPdf(Buffer.from('%PDF-1.4'))).rejects.toThrow('INTAKE_CORRUPT');
  });
  it.each([
    ['Pages: 1\nEncrypted: yes', 'ENCRYPTED'],
    ['Pages: 21\nEncrypted: no', 'TOO_LARGE'],
    ['Pages: 0', 'CORRUPT'],
  ])('rejects unsafe metadata %s', async (info, code) => {
    run.mockResolvedValueOnce(info);
    await expect(extractTextFromPdf(Buffer.from('%PDF-1.4'))).rejects.toThrow(`INTAKE_${code}`);
    expect(run).toHaveBeenCalledTimes(1);
  });
  it('rejects excess text instead of silently returning a partial PDF', async () => {
    run
      .mockResolvedValueOnce('Pages: 1')
      .mockResolvedValueOnce('')
      .mockResolvedValueOnce('x'.repeat(200001));
    await expect(extractTextFromPdf(Buffer.from('%PDF-1.4'))).rejects.toThrow('INTAKE_TOO_LARGE');
    await expect(renderPdfPage(Buffer.alloc(0), 21)).rejects.toThrow('INTAKE_TOO_LARGE');
  });
  it('bounds rasterization to the requested page and rejects a missing rendered output', async () => {
    run.mockResolvedValue('');
    await expect(renderPdfPage(Buffer.from('%PDF-1.4'), 2)).rejects.toThrow('INTAKE_CORRUPT');
    expect(run.mock.calls[0][0]).toBe('pdftoppm');
    expect(run.mock.calls[0][1]).toEqual(
      expect.arrayContaining(['-f', '2', '-l', '2', '-scale-to', '2400']),
    );
  });
});
