import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { Cron, CronExpression } from '@nestjs/schedule';
import { UserStatus } from '@prisma/client';

@Injectable()
export class NotificationsService {
  constructor(private prisma: PrismaService) {}

  async create(organizationId: string, dto: any) {
    return this.prisma.notification.create({
      data: {
        type: dto.type,
        title: dto.title,
        message: dto.message,
        entityType: dto.entityType,
        entityId: dto.entityId,
        userId: dto.userId,
        organizationId,
      },
    });
  }

  async createForUser(userId: string, organizationId: string, type: string, title: string, message: string, entityInfo?: { entityType?: string; entityId?: string }) {
    return this.prisma.notification.create({
      data: {
        type,
        title,
        message,
        entityType: entityInfo?.entityType,
        entityId: entityInfo?.entityId,
        userId,
        organizationId,
      },
    });
  }

  async createForAllUsers(organizationId: string, type: string, title: string, message: string, entityInfo?: { entityType?: string; entityId?: string }) {
    const users = await this.prisma.user.findMany({
      where: { organizationId, status: UserStatus.ACTIVE },
      select: { id: true },
    });

    const notifications = await this.prisma.notification.createMany({
      data: users.map((user) => ({
        type,
        title,
        message,
        entityType: entityInfo?.entityType,
        entityId: entityInfo?.entityId,
        userId: user.id,
        organizationId,
      })),
    });

    return { created: notifications.count };
  }

  async findAllForUser(organizationId: string, userId: string, query: { isRead?: boolean; type?: string }) {
    const where: any = { organizationId, userId };
    if (query.isRead !== undefined) where.isRead = query.isRead;
    if (query.type) where.type = query.type;

    return this.prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async getUnreadCount(organizationId: string, userId: string) {
    const count = await this.prisma.notification.count({
      where: { organizationId, userId, isRead: false },
    });
    return { count };
  }

  async markAsRead(organizationId: string, userId: string, id: string) {
    const notification = await this.prisma.notification.findFirst({
      where: { id, organizationId, userId },
    });
    if (!notification) throw new NotFoundException('Notification not found');

    return this.prisma.notification.update({
      where: { id },
      data: { isRead: true },
    });
  }

  async markAllAsRead(organizationId: string, userId: string) {
    const result = await this.prisma.notification.updateMany({
      where: { organizationId, userId, isRead: false },
      data: { isRead: true },
    });
    return { updated: result.count };
  }

  async delete(organizationId: string, userId: string, id: string) {
    const notification = await this.prisma.notification.findFirst({
      where: { id, organizationId, userId },
    });
    if (!notification) throw new NotFoundException('Notification not found');

    await this.prisma.notification.delete({ where: { id } });
    return { message: 'Notification deleted' };
  }

  async deleteAllRead(organizationId: string, userId: string) {
    const result = await this.prisma.notification.deleteMany({
      where: { organizationId, userId, isRead: true },
    });
    return { deleted: result.count };
  }

  // Scheduled notification checks
  @Cron(CronExpression.EVERY_HOUR)
  async checkOverdueInvoices() {
    const overdueInvoices = await this.prisma.invoice.findMany({
      where: {
        deletedAt: null,
        dueDate: { lt: new Date() },
        balanceDue: { gt: 0 },
        status: { not: 'OVERDUE' },
      },
      include: { organization: { include: { users: { where: { status: UserStatus.ACTIVE }, take: 1 } } } },
    });

    for (const invoice of overdueInvoices) {
      const adminUser = invoice.organization.users[0];
      if (adminUser) {
        await this.createForUser(
          adminUser.id,
          invoice.organizationId,
          'INVOICE_OVERDUE',
          'Invoice Overdue',
          `Invoice ${invoice.invoiceNumber} is now overdue.`,
          { entityType: 'invoice', entityId: invoice.id },
        );
      }
    }
  }

  @Cron(CronExpression.EVERY_DAY_AT_9AM)
  async checkUpcomingBillPayments() {
    const threeDaysFromNow = new Date();
    threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);

    const upcomingBills = await this.prisma.bill.findMany({
      where: {
        deletedAt: null,
        dueDate: { gte: new Date(), lte: threeDaysFromNow },
        balanceDue: { gt: 0 },
      },
      include: { organization: { include: { users: { where: { status: UserStatus.ACTIVE }, take: 1 } } } },
    });

    for (const bill of upcomingBills) {
      const adminUser = bill.organization.users[0];
      if (adminUser) {
        await this.createForUser(
          adminUser.id,
          bill.organizationId,
          'BILL_DUE',
          'Bill Payment Due Soon',
          `Bill ${bill.billNumber} is due in ${Math.ceil((bill.dueDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))} days.`,
          { entityType: 'bill', entityId: bill.id },
        );
      }
    }
  }

  @Cron(CronExpression.EVERY_DAY_AT_8AM)
  async checkLowInventory() {
    const items = await this.prisma.item.findMany({
      where: { type: 'GOODS' },
      include: { organization: { include: { users: { where: { status: UserStatus.ACTIVE }, take: 1 } } } },
    });

    for (const item of items) {
      const movements = await this.prisma.inventoryMovement.findMany({
        where: { itemId: item.id },
      });
      const currentStock = movements.reduce((sum, m) => sum + parseFloat(m.quantity.toString()), 0);
      const reorderPoint = item.reorderPoint || 10;

      if (currentStock <= reorderPoint) {
        const adminUser = item.organization.users[0];
        if (adminUser) {
          await this.createForUser(
            adminUser.id,
            item.organizationId,
            'LOW_STOCK',
            'Low Stock Alert',
            `${item.name} is running low (${currentStock} remaining).`,
            { entityType: 'item', entityId: item.id },
          );
        }
      }
    }
  }
}
