import api from '@/lib/api';
import { documentLocaleFor, downloadDocumentPdf, openDocumentPdfForPrint } from './use-documents';

jest.mock('@/lib/api', () => ({ __esModule: true, default: { get: jest.fn() } }));

const get = api.get as jest.Mock;

describe('document PDF actions (audit B3)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    get.mockReset().mockResolvedValue({ data: new Blob(['%PDF'], { type: 'application/pdf' }) });
    window.URL.createObjectURL = jest.fn(() => 'blob:pdf-1');
    window.URL.revokeObjectURL = jest.fn();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('maps the app locale to the document language', () => {
    expect(documentLocaleFor('ar')).toBe('ar');
    expect(documentLocaleFor('en')).toBe('en');
    expect(documentLocaleFor('fr')).toBe('en');
  });

  it('downloads the PDF in the requested language under the document number', async () => {
    let downloaded = '';
    jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      downloaded = this.download;
    });

    await downloadDocumentPdf('invoice', 'inv-1', 'INV-0001', 'ar');

    expect(get).toHaveBeenCalledWith('/documents/invoice/inv-1/pdf', {
      params: { locale: 'ar' },
      responseType: 'blob',
    });
    expect(downloaded).toBe('INV-0001.pdf');
    expect(window.URL.revokeObjectURL).toHaveBeenCalledWith('blob:pdf-1');
  });

  it('asks for quote and bill PDFs in the page language too', async () => {
    jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

    await downloadDocumentPdf('quote', 'q-1', 'QT-0001', 'ar');
    expect(get).toHaveBeenLastCalledWith('/documents/quote/q-1/pdf', {
      params: { locale: 'ar' },
      responseType: 'blob',
    });

    await downloadDocumentPdf('bill', 'b-1', 'BILL 7', 'en');
    expect(get).toHaveBeenLastCalledWith('/documents/bill/b-1/pdf', {
      params: { locale: 'en' },
      responseType: 'blob',
    });
  });

  it('opens the print tab before awaiting the PDF and closes it when generation fails', async () => {
    const tab = { location: { href: '' }, close: jest.fn() };
    const open = jest.spyOn(window, 'open').mockReturnValue(tab as unknown as Window);

    const printing = openDocumentPdfForPrint('bill', 'b-1', 'ar');
    expect(open).toHaveBeenCalledWith('', '_blank'); // still inside the click handler
    await printing;
    expect(get).toHaveBeenLastCalledWith('/documents/bill/b-1/pdf', {
      params: { locale: 'ar' },
      responseType: 'blob',
    });
    expect(tab.location.href).toBe('blob:pdf-1');
    expect(tab.close).not.toHaveBeenCalled();

    get.mockRejectedValueOnce(new Error('500'));
    await expect(openDocumentPdfForPrint('invoice', 'inv-1', 'en')).rejects.toThrow('500');
    expect(tab.close).toHaveBeenCalledTimes(1);
  });
});
