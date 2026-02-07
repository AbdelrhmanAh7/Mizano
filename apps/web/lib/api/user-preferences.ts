import api from '@/lib/api';

export interface UserPreferences {
  id: string;
  userId: string;
  tourProgress?: Record<string, any>;
  tourDismissed: string[];
  lastTourSeenAt?: string;
  theme?: string;
  sidebarCollapsed: boolean;
  createdAt: string;
  updatedAt: string;
}

export const userPreferencesApi = {
  get: async (): Promise<{ data: UserPreferences }> => {
    const response = await api.get('/user/preferences');
    return response.data;
  },

  updateTour: async (
    tourId: string,
    data: { completed: boolean; currentStep?: number }
  ): Promise<{ data: UserPreferences }> => {
    const response = await api.patch(`/user/preferences/tour/${tourId}`, data);
    return response.data;
  },

  dismissTour: async (tourId: string): Promise<{ data: UserPreferences }> => {
    const response = await api.post(`/user/preferences/tour/${tourId}/dismiss`);
    return response.data;
  },
};
