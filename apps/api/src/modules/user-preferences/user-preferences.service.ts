import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateTourProgressDto } from './dto/update-tour-progress.dto';
import { UserPreferencesDto } from './dto/user-preferences.dto';

export interface DashboardWidget {
  id: string;
  visible: boolean;
  order: number;
}

export interface DashboardLayoutConfig {
  widgets: DashboardWidget[];
}

const DEFAULT_DASHBOARD_LAYOUT: DashboardLayoutConfig = {
  widgets: [
    { id: 'ai-pulse', visible: true, order: 0 },
    { id: 'kpi-row-1', visible: true, order: 1 },
    { id: 'kpi-row-2', visible: true, order: 2 },
    { id: 'ai-forecast', visible: true, order: 3 },
    { id: 'cash-flow-revenue', visible: true, order: 4 },
    { id: 'ar-ap-expenses', visible: true, order: 5 },
    { id: 'profit-customers', visible: true, order: 6 },
    { id: 'bank-inventory', visible: true, order: 7 },
    { id: 'insights-transactions', visible: true, order: 8 },
  ],
};

@Injectable()
export class UserPreferencesService {
  constructor(private prisma: PrismaService) {}

  async getUserPreferences(userId: string): Promise<UserPreferencesDto> {
    const preferences = await this.prisma.userPreferences.findUnique({
      where: { userId },
    });

    // If no preferences exist, create default ones
    if (!preferences) {
      const created = await this.prisma.userPreferences.create({
        data: {
          userId,
          tourProgress: {},
          tourDismissed: [],
        },
      });
      return this.formatPreferences(created);
    }

    return this.formatPreferences(preferences);
  }

  async getDashboardLayout(userId: string): Promise<DashboardLayoutConfig> {
    const prefs = await this.prisma.userPreferences.findUnique({
      where: { userId },
      select: { dashboardLayout: true },
    });
    return (prefs?.dashboardLayout as unknown as DashboardLayoutConfig) || DEFAULT_DASHBOARD_LAYOUT;
  }

  async updateDashboardLayout(
    userId: string,
    layout: DashboardLayoutConfig,
  ): Promise<DashboardLayoutConfig> {
    await this.prisma.userPreferences.upsert({
      where: { userId },
      update: { dashboardLayout: layout as any },
      create: {
        userId,
        tourProgress: {},
        tourDismissed: [],
        dashboardLayout: layout as any,
      },
    });
    return layout;
  }

  async updateTourProgress(
    userId: string,
    tourId: string,
    updateDto: UpdateTourProgressDto,
  ): Promise<UserPreferencesDto> {
    let preferences = await this.prisma.userPreferences.findUnique({
      where: { userId },
    });

    // Create default preferences if they don't exist
    if (!preferences) {
      preferences = await this.prisma.userPreferences.create({
        data: {
          userId,
          tourProgress: {},
          tourDismissed: [],
        },
      });
    }

    // Update tour progress
    const tourProgress = (preferences.tourProgress as Record<string, any>) || {};

    tourProgress[tourId] = {
      completed: updateDto.completed,
      currentStep: updateDto.currentStep || 0,
      completedAt: updateDto.completed ? new Date().toISOString() : null,
    };

    const updated = await this.prisma.userPreferences.update({
      where: { userId },
      data: {
        tourProgress,
        lastTourSeenAt: new Date(),
      },
    });

    return this.formatPreferences(updated);
  }

  async dismissTour(userId: string, tourId: string): Promise<UserPreferencesDto> {
    let preferences = await this.prisma.userPreferences.findUnique({
      where: { userId },
    });

    // Create default preferences if they don't exist
    if (!preferences) {
      preferences = await this.prisma.userPreferences.create({
        data: {
          userId,
          tourProgress: {},
          tourDismissed: [tourId],
        },
      });
    } else {
      // Add to dismissed list if not already there
      const tourDismissed = preferences.tourDismissed || [];
      if (!tourDismissed.includes(tourId)) {
        tourDismissed.push(tourId);
      }

      preferences = await this.prisma.userPreferences.update({
        where: { userId },
        data: {
          tourDismissed,
          lastTourSeenAt: new Date(),
        },
      });
    }

    return this.formatPreferences(preferences);
  }

  private formatPreferences(preferences: any): UserPreferencesDto {
    return {
      id: preferences.id,
      userId: preferences.userId,
      tourProgress: (preferences.tourProgress as Record<string, any>) || undefined,
      tourDismissed: preferences.tourDismissed || [],
      lastTourSeenAt: preferences.lastTourSeenAt,
      theme: preferences.theme,
      sidebarCollapsed: preferences.sidebarCollapsed,
      createdAt: preferences.createdAt,
      updatedAt: preferences.updatedAt,
    };
  }
}
