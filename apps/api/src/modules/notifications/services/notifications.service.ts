import { signedMovementQuantity } from '../../inventory/utils/movement-sign';
import { Prisma } from '@prisma/client';
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { Cron, CronExpression } from '@nestjs/schedule';
import { UserStatus } from '@prisma/client';

/** Bound each page of organizations fetched by the scheduled notification checks. */
export const NOTIFICATION_BATCH_SIZE = 50;
/** Bound the number of entities inspected per organization per run. */
export const NOTIFICATION_QUERY_LIMIT = 100;

@Injectable()
export class NotificationsService {
  constructor(private prisma: PrismaService) {}

  async create(organizationId: string, dto: Record<string, unknown>) {
    return this.prisma.notification.create({
      data: {
        type: dto.type as string,
        title: dto.title as string,
        message: dto.message as string,
        entityType: (dto.entityType as string) ?? undefined,
        entityId: (dto.entityId as string) ?? undefined,
        userId: dto.userId as string,
        organizationId,
      },
    });
  }

  async createForUser(
    userId: string,
    organizationId: string,
    type: string,
    title: string,
    message: string,
    entityInfo?: { entityType?: string; entityId?: string },
  ) {
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

  async createForAllUsers(
    organizationId: string,
    type: string,
    title: string,
    message: string,
    entityInfo?: { entityType?: string; entityId?: string },
  ) {
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

  async findAllForUser(
    organizationId: string,
    userId: string,
    query: { isRead?: boolean; type?: string },
  ) {
    const where: Prisma.NotificationWhereInput = { organizationId, userId };
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

  /**
   * Walk a query in id order, one bounded page at a time, until a page comes back
   * shorter than `pageSize`. Each page is requested with a cursor on the last id of
   * the previous page, so no row is skipped or repeated and memory stays bounded.
   */
  private async *eachPage<T extends { id: string }>(
    pageSize: number,
    fetchPage: (page: {
      take: number;
      orderBy: { id: 'asc' };
      cursor?: { id: string };
      skip?: number;
    }) => Promise<T[]>,
  ): AsyncGenerator<T[]> {
    let cursor: string | undefined;
    for (;;) {
      const page = await fetchPage({
        take: pageSize,
        orderBy: { id: 'asc' },
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
      if (page.length === 0) return;
      yield page;
      if (page.length < pageSize) return;
      cursor = page[page.length - 1].id;
    }
  }

  /** Every organization, in bounded id-ordered pages. */
  private eachOrganizationBatch(): AsyncGenerator<{ id: string }[]> {
    return this.eachPage(NOTIFICATION_BATCH_SIZE, (page) =>
      this.prisma.organization.findMany({ select: { id: true }, ...page }),
    );
  }

  // Scheduled notification checks
  @Cron(CronExpression.EVERY_HOUR)
  async checkOverdueInvoices() {
    // Orgs and each org's invoices are paged by id cursor: bounded memory on the Pi,
    // and no tenant or invoice past the first page is ever skipped.
    for await (const batch of this.eachOrganizationBatch()) {
      for (const org of batch) {
        const pages = this.eachPage(NOTIFICATION_QUERY_LIMIT, (page) =>
          this.prisma.invoice.findMany({
            where: {
              organizationId: org.id,
              deletedAt: null,
              dueDate: { lt: new Date() },
              balanceDue: { gt: 0 },
              status: { not: 'OVERDUE' },
            },
            include: {
              organization: {
                include: { users: { where: { status: UserStatus.ACTIVE }, take: 1 } },
              },
            },
            ...page,
          }),
        );
        for await (const overdueInvoices of pages) {
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
      }
    }
  }

  @Cron(CronExpression.EVERY_DAY_AT_9AM)
  async checkUpcomingBillPayments() {
    const threeDaysFromNow = new Date();
    threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);

    // See checkOverdueInvoices for the paging contract.
    for await (const batch of this.eachOrganizationBatch()) {
      for (const org of batch) {
        const pages = this.eachPage(NOTIFICATION_QUERY_LIMIT, (page) =>
          this.prisma.bill.findMany({
            where: {
              organizationId: org.id,
              deletedAt: null,
              dueDate: { gte: new Date(), lte: threeDaysFromNow },
              balanceDue: { gt: 0 },
            },
            include: {
              organization: {
                include: { users: { where: { status: UserStatus.ACTIVE }, take: 1 } },
              },
            },
            ...page,
          }),
        );
        for await (const upcomingBills of pages) {
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
      }
    }
  }

  @Cron(CronExpression.EVERY_DAY_AT_8AM)
  async checkLowInventory() {
    // See checkOverdueInvoices for the paging contract.
    for await (const batch of this.eachOrganizationBatch()) {
      for (const org of batch) {
        const pages = this.eachPage(NOTIFICATION_QUERY_LIMIT, (page) =>
          this.prisma.item.findMany({
            where: { organizationId: org.id, type: 'GOODS' },
            include: {
              organization: {
                include: { users: { where: { status: UserStatus.ACTIVE }, take: 1 } },
              },
            },
            ...page,
          }),
        );
        for await (const items of pages) {
          for (const item of items) {
            const movements = await this.prisma.inventoryMovement.findMany({
              where: { itemId: item.id, organizationId: item.organizationId },
              select: { quantity: true, movementType: true },
            });
            const currentStock = movements.reduce(
              (sum: number, m) => sum + signedMovementQuantity(m.quantity, m.movementType),
              0,
            );
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
    }
  }
}
