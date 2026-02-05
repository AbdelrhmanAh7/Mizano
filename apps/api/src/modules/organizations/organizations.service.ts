import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { UpdateAccountSettingsDto } from './dto/update-account-settings.dto';

@Injectable()
export class OrganizationsService {
  constructor(private prisma: PrismaService) {}

  async findOne(id: string) {
    const organization = await this.prisma.organization.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        address: true,
        currency: true,
        taxId: true,
        lockDate: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    return organization;
  }

  async update(id: string, updateOrganizationDto: UpdateOrganizationDto) {
    const organization = await this.prisma.organization.update({
      where: { id },
      data: updateOrganizationDto,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        address: true,
        currency: true,
        taxId: true,
        lockDate: true,
        updatedAt: true,
      },
    });

    return organization;
  }

  async setLockDate(id: string, lockDate: Date) {
    const organization = await this.prisma.organization.update({
      where: { id },
      data: { lockDate },
      select: {
        id: true,
        lockDate: true,
      },
    });

    return organization;
  }

  async getLockDate(id: string): Promise<Date | null> {
    const organization = await this.prisma.organization.findUnique({
      where: { id },
      select: { lockDate: true },
    });

    return organization?.lockDate || null;
  }

  async getAccountSettings(id: string) {
    const organization = await this.prisma.organization.findUnique({
      where: { id },
      select: {
        defaultArAccountId: true,
        defaultRevenueAccountId: true,
        defaultVatPayableAccountId: true,
        defaultApAccountId: true,
        defaultVatReceivableAccountId: true,
        defaultBankAccountId: true,
        defaultCashAccountId: true,
        defaultSalesReturnsAccountId: true,
      },
    });

    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    return organization;
  }

  async updateAccountSettings(id: string, updateAccountSettingsDto: UpdateAccountSettingsDto) {
    // Validate that all provided account IDs exist and belong to the organization
    const accountIds = Object.values(updateAccountSettingsDto).filter(Boolean) as string[];

    if (accountIds.length > 0) {
      const accounts = await this.prisma.account.findMany({
        where: {
          id: { in: accountIds },
          organizationId: id,
          isActive: true,
        },
        select: { id: true },
      });

      const foundIds = accounts.map(a => a.id);
      const invalidIds = accountIds.filter(aid => !foundIds.includes(aid));

      if (invalidIds.length > 0) {
        throw new BadRequestException(`Invalid or inactive account IDs: ${invalidIds.join(', ')}`);
      }
    }

    const organization = await this.prisma.organization.update({
      where: { id },
      data: updateAccountSettingsDto,
      select: {
        defaultArAccountId: true,
        defaultRevenueAccountId: true,
        defaultVatPayableAccountId: true,
        defaultApAccountId: true,
        defaultVatReceivableAccountId: true,
        defaultBankAccountId: true,
        defaultCashAccountId: true,
        defaultSalesReturnsAccountId: true,
      },
    });

    return organization;
  }
}
