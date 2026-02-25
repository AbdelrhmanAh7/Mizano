import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { TaskStatus, TaskPriority } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

@Injectable()
export class TasksService {
  constructor(private prisma: PrismaService) {}

  async create(organizationId: string, dto: any) {
    // Verify project exists
    const project = await this.prisma.project.findFirst({
      where: { id: dto.projectId, organizationId },
    });
    if (!project) throw new NotFoundException('Project not found');

    // Get sort order
    const lastTask = await this.prisma.task.findFirst({
      where: { projectId: dto.projectId },
      orderBy: { sortOrder: 'desc' },
    });
    const sortOrder = (lastTask?.sortOrder || 0) + 1;

    return this.prisma.task.create({
      data: {
        name: dto.name,
        description: dto.description,
        projectId: dto.projectId,
        assigneeId: dto.assigneeId,
        status: dto.status || TaskStatus.TODO,
        priority: dto.priority || TaskPriority.MEDIUM,
        ratePerHour: dto.ratePerHour ? new Decimal(dto.ratePerHour) : new Decimal(0),
        isBillable: dto.isBillable ?? true,
        estimatedHours: dto.estimatedHours ? new Decimal(dto.estimatedHours) : null,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        sortOrder,
        tags: dto.tags || [],
        organizationId,
      },
      include: {
        project: { select: { id: true, name: true } },
        assignee: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  }

  async findAll(
    organizationId: string,
    query: { projectId?: string; status?: string; assigneeId?: string },
  ) {
    const where: any = { organizationId };
    if (query.projectId) where.projectId = query.projectId;
    if (query.status) where.status = query.status;
    if (query.assigneeId) where.assigneeId = query.assigneeId;

    return this.prisma.task.findMany({
      where,
      include: {
        project: { select: { id: true, name: true, color: true } },
        assignee: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async findOne(organizationId: string, id: string) {
    const task = await this.prisma.task.findFirst({
      where: { id, organizationId },
      include: {
        project: true,
        assignee: true,
        timesheetEntries: {
          take: 10,
          orderBy: { date: 'desc' },
          include: { user: { select: { id: true, firstName: true, lastName: true } } },
        },
      },
    });
    if (!task) throw new NotFoundException('Task not found');
    return task;
  }

  async update(organizationId: string, id: string, dto: any) {
    await this.findOne(organizationId, id);

    const data: any = { ...dto };
    if (dto.estimatedHours) data.estimatedHours = new Decimal(dto.estimatedHours);
    if (dto.dueDate) data.dueDate = new Date(dto.dueDate);

    // Handle completion
    if (dto.status === TaskStatus.DONE && !data.completedAt) {
      data.completedAt = new Date();
    } else if (dto.status && dto.status !== TaskStatus.DONE) {
      data.completedAt = null;
    }

    return this.prisma.task.update({
      where: { id },
      data,
      include: {
        project: { select: { id: true, name: true } },
        assignee: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  }

  async remove(organizationId: string, id: string) {
    const task = await this.prisma.task.findFirst({
      where: { id, organizationId },
      include: { timesheetEntries: { take: 1 } },
    });
    if (!task) throw new NotFoundException('Task not found');
    if (task.timesheetEntries.length > 0) {
      throw new BadRequestException('Cannot delete task with timesheet entries');
    }

    await this.prisma.task.delete({ where: { id } });
    return { message: 'Task deleted' };
  }

  async updateSortOrder(organizationId: string, taskOrders: { id: string; sortOrder: number }[]) {
    for (const item of taskOrders) {
      await this.prisma.task.updateMany({
        where: { id: item.id, organizationId },
        data: { sortOrder: item.sortOrder },
      });
    }
    return { message: 'Sort order updated' };
  }

  async getTasksByProject(organizationId: string, projectId: string) {
    return this.prisma.task.findMany({
      where: { projectId, organizationId },
      include: {
        assignee: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async getMyTasks(organizationId: string, userId: string) {
    return this.prisma.task.findMany({
      where: { assigneeId: userId, organizationId, status: { not: TaskStatus.DONE } },
      include: {
        project: { select: { id: true, name: true, color: true } },
      },
      orderBy: [{ priority: 'asc' }, { dueDate: 'asc' }],
    });
  }

  async getTaskStats(organizationId: string, projectId?: string) {
    const where: any = { organizationId };
    if (projectId) where.projectId = projectId;

    const tasks = await this.prisma.task.groupBy({
      by: ['status'],
      where,
      _count: { id: true },
    });

    const totalEstimated = await this.prisma.task.aggregate({
      where,
      _sum: { estimatedHours: true },
    });

    const timesheetWhere: any = { organizationId };
    if (projectId) timesheetWhere.projectId = projectId;

    const actualHours = await this.prisma.timesheetEntry.aggregate({
      where: timesheetWhere,
      _sum: { hours: true },
    });

    return {
      byStatus: tasks.map((t) => ({ status: t.status, count: t._count.id })),
      totalEstimatedHours: totalEstimated._sum.estimatedHours || 0,
      totalActualHours: actualHours._sum.hours || 0,
    };
  }
}
