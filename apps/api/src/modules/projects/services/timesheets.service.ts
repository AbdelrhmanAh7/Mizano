import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { Decimal } from '@prisma/client/runtime/library';

@Injectable()
export class TimesheetsService {
  constructor(private prisma: PrismaService) {}

  async create(organizationId: string, userId: string, dto: any) {
    // Verify project
    const project = await this.prisma.project.findFirst({
      where: { id: dto.projectId, organizationId },
    });
    if (!project) throw new NotFoundException('Project not found');

    // Verify task if provided
    if (dto.taskId) {
      const task = await this.prisma.task.findFirst({
        where: { id: dto.taskId, projectId: dto.projectId, organizationId },
      });
      if (!task) throw new NotFoundException('Task not found');
    }

    return this.prisma.timesheetEntry.create({
      data: {
        userId,
        projectId: dto.projectId,
        taskId: dto.taskId,
        date: new Date(dto.date),
        duration: new Decimal(dto.hours),
        hours: new Decimal(dto.hours),
        description: dto.description,
        isBillable: dto.isBillable ?? true,
        isBilled: false,
        organizationId,
      },
      include: {
        project: { select: { id: true, name: true } },
        task: { select: { id: true, name: true } },
        user: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  }

  async startTimer(organizationId: string, userId: string, dto: { projectId: string; taskId?: string; description?: string }) {
    // Check for existing running timer
    const existing = await this.prisma.timesheetEntry.findFirst({
      where: { userId, organizationId, timerStartedAt: { not: null }, timerEndedAt: null },
    });
    if (existing) {
      throw new BadRequestException('A timer is already running. Stop it first.');
    }

    return this.prisma.timesheetEntry.create({
      data: {
        userId,
        projectId: dto.projectId,
        taskId: dto.taskId,
        date: new Date(),
        duration: new Decimal(0),
        hours: new Decimal(0),
        description: dto.description || '',
        isBillable: true,
        isBilled: false,
        timerStartedAt: new Date(),
        organizationId,
      },
      include: {
        project: { select: { id: true, name: true } },
        task: { select: { id: true, name: true } },
      },
    });
  }

  async stopTimer(organizationId: string, userId: string, entryId: string) {
    const entry = await this.prisma.timesheetEntry.findFirst({
      where: { id: entryId, userId, organizationId, timerStartedAt: { not: null }, timerEndedAt: null },
    });
    if (!entry) throw new NotFoundException('Running timer not found');

    const now = new Date();
    const hoursWorked = (now.getTime() - entry.timerStartedAt!.getTime()) / (1000 * 60 * 60);

    return this.prisma.timesheetEntry.update({
      where: { id: entryId },
      data: {
        timerEndedAt: now,
        hours: new Decimal(Math.round(hoursWorked * 100) / 100),
      },
      include: {
        project: { select: { id: true, name: true } },
        task: { select: { id: true, name: true } },
      },
    });
  }

  async getRunningTimer(organizationId: string, userId: string) {
    return this.prisma.timesheetEntry.findFirst({
      where: { userId, organizationId, timerStartedAt: { not: null }, timerEndedAt: null },
      include: {
        project: { select: { id: true, name: true, color: true } },
        task: { select: { id: true, name: true } },
      },
    });
  }

  async findAll(organizationId: string, query: { userId?: string; projectId?: string; startDate?: string; endDate?: string; isBilled?: boolean }) {
    const where: any = { organizationId };
    if (query.userId) where.userId = query.userId;
    if (query.projectId) where.projectId = query.projectId;
    if (query.isBilled !== undefined) where.isBilled = query.isBilled;
    if (query.startDate || query.endDate) {
      where.date = {};
      if (query.startDate) where.date.gte = new Date(query.startDate);
      if (query.endDate) where.date.lte = new Date(query.endDate);
    }

    return this.prisma.timesheetEntry.findMany({
      where,
      include: {
        user: { select: { id: true, firstName: true, lastName: true } },
        project: { select: { id: true, name: true, color: true } },
        task: { select: { id: true, name: true } },
      },
      orderBy: { date: 'desc' },
    });
  }

  async findOne(organizationId: string, id: string) {
    const entry = await this.prisma.timesheetEntry.findFirst({
      where: { id, organizationId },
      include: {
        user: true,
        project: true,
        task: true,
      },
    });
    if (!entry) throw new NotFoundException('Timesheet entry not found');
    return entry;
  }

  async update(organizationId: string, id: string, dto: any) {
    const entry = await this.findOne(organizationId, id);
    if (entry.isBilled) {
      throw new BadRequestException('Cannot update billed timesheet entry');
    }

    const data: any = { ...dto };
    if (dto.hours) data.hours = new Decimal(dto.hours);
    if (dto.date) data.date = new Date(dto.date);

    return this.prisma.timesheetEntry.update({
      where: { id },
      data,
      include: {
        project: { select: { id: true, name: true } },
        task: { select: { id: true, name: true } },
      },
    });
  }

  async remove(organizationId: string, id: string) {
    const entry = await this.findOne(organizationId, id);
    if (entry.isBilled) {
      throw new BadRequestException('Cannot delete billed timesheet entry');
    }

    await this.prisma.timesheetEntry.delete({ where: { id } });
    return { message: 'Timesheet entry deleted' };
  }

  async getWeeklySummary(organizationId: string, userId: string, weekStartDate: string) {
    const start = new Date(weekStartDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);

    const entries = await this.prisma.timesheetEntry.findMany({
      where: {
        userId,
        organizationId,
        date: { gte: start, lt: end },
      },
      include: {
        project: { select: { id: true, name: true, color: true } },
        task: { select: { id: true, name: true } },
      },
      orderBy: { date: 'asc' },
    });

    // Group by day
    const byDay: Record<string, any[]> = {};
    for (let i = 0; i < 7; i++) {
      const day = new Date(start.getTime() + i * 24 * 60 * 60 * 1000);
      byDay[day.toISOString().split('T')[0]] = [];
    }

    for (const entry of entries) {
      const day = entry.date.toISOString().split('T')[0];
      if (byDay[day]) byDay[day].push(entry);
    }

    // Calculate totals
    const totalHours = entries.reduce((sum, e) => sum + parseFloat((e.hours ?? e.duration).toString()), 0);
    const billableHours = entries.filter((e) => e.isBillable).reduce((sum, e) => sum + parseFloat((e.hours ?? e.duration).toString()), 0);

    // Group by project
    const byProject: Record<string, number> = {};
    for (const entry of entries) {
      const key = entry.project.name;
      byProject[key] = (byProject[key] || 0) + parseFloat((entry.hours ?? entry.duration).toString());
    }

    return {
      weekStart: start,
      weekEnd: end,
      byDay,
      byProject: Object.entries(byProject).map(([name, hours]) => ({ name, hours })),
      totalHours,
      billableHours,
      nonBillableHours: totalHours - billableHours,
    };
  }

  async getTimesheetReport(organizationId: string, startDate: string, endDate: string, groupBy: 'user' | 'project') {
    const entries = await this.prisma.timesheetEntry.findMany({
      where: {
        organizationId,
        date: { gte: new Date(startDate), lte: new Date(endDate) },
      },
      include: {
        user: { select: { id: true, firstName: true, lastName: true } },
        project: { select: { id: true, name: true, hourlyRate: true } },
      },
    });

    const grouped: Record<string, { name: string; totalHours: number; billableHours: number; billableAmount: number }> = {};

    for (const entry of entries) {
      const key = groupBy === 'user' ? entry.userId : entry.projectId;
      const name = groupBy === 'user' ? `${entry.user.firstName} ${entry.user.lastName}` : entry.project.name;
      const hours = parseFloat((entry.hours ?? entry.duration).toString());
      const hourlyRate = entry.project.hourlyRate ? parseFloat(entry.project.hourlyRate.toString()) : 0;

      if (!grouped[key]) {
        grouped[key] = { name, totalHours: 0, billableHours: 0, billableAmount: 0 };
      }
      grouped[key].totalHours += hours;
      if (entry.isBillable) {
        grouped[key].billableHours += hours;
        grouped[key].billableAmount += hours * hourlyRate;
      }
    }

    return {
      startDate,
      endDate,
      groupBy,
      data: Object.values(grouped),
      totals: {
        totalHours: Object.values(grouped).reduce((sum, g) => sum + g.totalHours, 0),
        billableHours: Object.values(grouped).reduce((sum, g) => sum + g.billableHours, 0),
        billableAmount: Object.values(grouped).reduce((sum, g) => sum + g.billableAmount, 0),
      },
    };
  }
}
