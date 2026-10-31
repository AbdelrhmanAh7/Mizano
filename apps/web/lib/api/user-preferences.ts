import api from '@/lib/api';

export const userPreferencesApi = {
  get: (params?: Record<string, unknown>) => api.get('/user/preferences', { params }),

  updateTour: (tourId: string, data: { completed: boolean; currentStep?: number }) =>
    api.patch(`/user/preferences/tour/${tourId}`, data),

  dismissTour: (tourId: string) => api.post(`/user/preferences/tour/${tourId}/dismiss`),
};
