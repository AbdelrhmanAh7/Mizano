import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditQueryDto } from './dto/audit-query.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}

  /**
   * Find all audit logs for an organization with filtering and pagination
   */
  async findAll(organizationId: string, query: AuditQueryDto) {
    const {
      page = 1,
      limit = 20,
      entityType,
      entityId,
      userId,
      action,
      startDate,
      endDate,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = query;

    const skip = (page - 1) * limit;

    // Build where clause
    const where: Prisma.AuditLogWhereInput = {
      organizationId,
    };

    if (entityType) {
      where.entityType = entityType;
    }

    if (entityId) {
      where.entityId = entityId;
    }

    if (userId) {
      where.userId = userId;
    }

    if (action) {
      where.action = action;
    }

    // Date range filtering
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) {
        where.createdAt.gte = new Date(startDate);
      }
      if (endDate) {
        where.createdAt.lte = new Date(endDate);
      }
    }

    // Search in entityType or entityId
    if (search) {
      where.OR = [
        { entityType: { contains: search, mode: 'insensitive' } },
        { entityId: { contains: search, mode: 'insensitive' } },
      ];
    }

    // Execute query with pagination
    const [logs, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              email: true,
              name: true,
            },
          },
        },
        orderBy: { [sortBy]: sortOrder },
        skip,
        take: limit,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      data: logs,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Find a single audit log by ID
   */
  async findOne(organizationId: string, id: string) {
    const log = await this.prisma.auditLog.findFirst({
      where: { id, organizationId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
      },
    });

    if (!log) {
      throw new NotFoundException('Audit log not found');
    }

    return log;
  }

  /**
   * Find audit logs for a specific entity
   */
  async findByEntity(
    organizationId: string,
    entityType: string,
    entityId: string,
    query: Pick<AuditQueryDto, 'page' | 'limit' | 'sortOrder'> = {},
  ) {
    const { page = 1, limit = 50, sortOrder = 'desc' } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.AuditLogWhereInput = {
      organizationId,
      entityType,
      entityId,
    };

    const [logs, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              email: true,
              name: true,
            },
          },
        },
        orderBy: { createdAt: sortOrder },
        skip,
        take: limit,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      data: logs,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        entityType,
        entityId,
      },
    };
  }

  /**
   * Get audit statistics for the organization
   */
  async getStats(organizationId: string, days: number = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const [totalLogs, actionCounts, topEntities, topUsers] = await Promise.all([
      // Total logs in period
      this.prisma.auditLog.count({
        where: {
          organizationId,
          createdAt: { gte: startDate },
        },
      }),

      // Count by action type
      this.prisma.auditLog.groupBy({
        by: ['action'],
        where: {
          organizationId,
          createdAt: { gte: startDate },
        },
        _count: { action: true },
      }),

      // Top modified entity types
      this.prisma.auditLog.groupBy({
        by: ['entityType'],
        where: {
          organizationId,
          createdAt: { gte: startDate },
        },
        _count: { entityType: true },
        orderBy: { _count: { entityType: 'desc' } },
        take: 10,
      }),

      // Most active users
      this.prisma.auditLog.groupBy({
        by: ['userId'],
        where: {
          organizationId,
          createdAt: { gte: startDate },
        },
        _count: { userId: true },
        orderBy: { _count: { userId: 'desc' } },
        take: 5,
      }),
    ]);

    // Get user details for top users
    const userIds = topUsers.map((u) => u.userId);
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, email: true, name: true },
    });

    const userMap = new Map(users.map((u) => [u.id, u]));

    return {
      period: { days, startDate, endDate: new Date() },
      totalLogs,
      byAction: actionCounts.map((a) => ({
        action: a.action,
        count: a._count.action,
      })),
      topEntities: topEntities.map((e) => ({
        entityType: e.entityType,
        count: e._count.entityType,
      })),
      topUsers: topUsers.map((u) => ({
        user: userMap.get(u.userId) || { id: u.userId },
        count: u._count.userId,
      })),
    };
  }
}
