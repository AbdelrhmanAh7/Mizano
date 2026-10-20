import api from '@/lib/api';
import { documentsApi } from './use-documents';

jest.mock('@/lib/api', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
  },
}));

describe('use-documents / documentsApi.getPayslipPdf', () => {
  const mockGet = api.get as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('calls /payslips/:id/pdf with ar default language and blob responseType', async () => {
    const dummyBlob = new Blob(['%PDF-1.4'], { type: 'application/pdf' });
    mockGet.mockResolvedValueOnce({ data: dummyBlob });

    const result = await documentsApi.getPayslipPdf('ps-123');
    expect(mockGet).toHaveBeenCalledWith('/payslips/ps-123/pdf', {
      params: { lang: 'ar' },
      responseType: 'blob',
    });
    expect(result).toBe(dummyBlob);
  });

  it('calls /payslips/:id/pdf with specified lang=en', async () => {
    const dummyBlob = new Blob(['%PDF-1.4'], { type: 'application/pdf' });
    mockGet.mockResolvedValueOnce({ data: dummyBlob });

    const result = await documentsApi.getPayslipPdf('ps-456', 'en');
    expect(mockGet).toHaveBeenCalledWith('/payslips/ps-456/pdf', {
      params: { lang: 'en' },
      responseType: 'blob',
    });
    expect(result).toBe(dummyBlob);
  });
});
