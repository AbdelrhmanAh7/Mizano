import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';

// ============ Types ============

export interface OcrTrainingExtractResult {
  date: string | null;
  total: number | null;
  subtotal: number | null;
  tax: number | null;
  invoiceNumber: string | null;
  vendorName: string | null;
  lineItems: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    total: number;
  }>;
  ocrConfidence: number;
  rawText: string;
  fieldConfidence: Record<string, number>;
}

export interface OcrTrainingSubmitData {
  vendorId: string;
  rawText: string;
  extractedFields: Record<string, any>;
  correctedFields: Record<string, any>;
}

export interface OcrTrainingSubmitResult {
  message: string;
  vendorId: string;
  sampleCount: number;
  isActive: boolean;
}

export interface BatchExtractionResult {
  filename: string;
  extraction: OcrTrainingExtractResult | null;
  error: string | null;
}

export interface VendorOcrHistory {
  vendorId: string;
  vendorName: string;
  layout: {
    fieldPositions: any;
    sampleCount: number;
    lastUsedAt: string;
    isActive: boolean;
  } | null;
  corrections: Array<{
    id: string;
    createdAt: string;
    aiSuggestion: any;
    userAnswer: string;
    userAction: string;
  }>;
  trainingDataCount: number;
}

export interface OcrTrainingStats {
  totalVendorLayouts: number;
  activeLayouts: number;
  totalSamples: number;
  avgSampleCount: number;
  totalFeedback: number;
  recentCorrections: number;
}

// ============ API Functions ============

const ocrTrainingApi = {
  extractForTraining: async (formData: FormData) => {
    const response = await api.post('/ai/ocr-training/extract', formData, {
      headers: { 'Content-Type': undefined },
      timeout: 60000,
    });
    return response.data;
  },

  submitCorrections: async (data: OcrTrainingSubmitData) => {
    const response = await api.post('/ai/ocr-training/submit', data);
    return response.data;
  },

  batchExtract: async (formData: FormData) => {
    const response = await api.post('/ai/ocr-training/batch', formData, {
      headers: { 'Content-Type': undefined },
      timeout: 120000,
    });
    return response.data;
  },

  getVendorHistory: async (vendorId: string) => {
    const response = await api.get(`/ai/ocr-training/vendor-history/${vendorId}`);
    return response.data;
  },

  getStats: async () => {
    const response = await api.get('/ai/ocr-training/stats');
    return response.data;
  },
};

// ============ Hooks ============

export function useOcrTrainingExtract() {
  return useMutation({
    mutationFn: ocrTrainingApi.extractForTraining,
  });
}

export function useOcrTrainingSubmit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ocrTrainingApi.submitCorrections,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ocr-training'] });
    },
  });
}

export function useOcrBatchExtract() {
  return useMutation({
    mutationFn: ocrTrainingApi.batchExtract,
  });
}

export function useVendorOcrHistory(vendorId?: string) {
  return useQuery({
    queryKey: ['ocr-training', 'vendor-history', vendorId],
    queryFn: () => ocrTrainingApi.getVendorHistory(vendorId!),
    enabled: !!vendorId,
  });
}

export function useOcrTrainingStats() {
  return useQuery({
    queryKey: ['ocr-training', 'stats'],
    queryFn: ocrTrainingApi.getStats,
    staleTime: 30000,
  });
}
