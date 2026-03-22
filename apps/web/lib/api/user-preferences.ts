import api from '@/lib/api';

export interface UserPreferences {
  id: string;
  userId: string;
  tourProgress?: Record<string, unknown>;
  tourDismissed: string[];
  lastTourSeenAt?: string;
  theme?: string;
  sidebarCollapsed: boolean;
  createdAt: string;
  updatedAt: string;
}

export const userPreferencesApi = {
  get: (params?: Record<string, unknown>) => api.get('/user/preferences', { params }),

  updateTour: (tourId: string, data: { completed: boolean; currentStep?: number }) =>
    api.patch(`/user/preferences/tour/${tourId}`, data),

  dismissTour: (tourId: string) => api.post(`/user/preferences/tour/${tourId}/dismiss`),
};
