import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { Decimal } from '@prisma/client/runtime/library';
import { CreateBankAccountDto } from '../dto/create-bank-account.dto';
import { UpdateBankAccountDto } from '../dto/update-bank-account.dto';

@Injectable()
export class BankAccountsService {
  constructor(private prisma: PrismaService) {}

  async create(organizationId: string, dto: CreateBankAccountDto) {
    return this.prisma.bankAccount.create({
      data: {
        name: dto.name,
        accountNumber: dto.accountNumber,
        currency: dto.currency || 'USD',
        type: dto.type,
        systemBalance: new Decimal(dto.openingBalance || '0'),
        bankBalance: new Decimal(dto.openingBalance || '0'),
        linkedAccountId: dto.linkedAccountId,
        organizationId,
      },
    });
  }

  async findAll(organizationId: string) {
    return this.prisma.bankAccount.findMany({
      where: { organizationId, isActive: true, deletedAt: null },
      include: { linkedAccount: { select: { id: true, code: true, name: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(organizationId: string, id: string) {
    const account = await this.prisma.bankAccount.findFirst({
      where: { id, organizationId, deletedAt: null },
      include: { linkedAccount: true },
    });
    if (!account) throw new NotFoundException('Bank account not found');
    return account;
  }

  async update(organizationId: string, id: string, dto: UpdateBankAccountDto) {
    await this.findOne(organizationId, id);
    return this.prisma.bankAccount.update({ where: { id }, data: dto });
  }

  async remove(organizationId: string, id: string) {
    const account = await this.prisma.bankAccount.findFirst({
      where: { id, organizationId, deletedAt: null },
      include: { _count: { select: { transactions: true } } },
    });
    if (!account) throw new NotFoundException('Bank account not found');
    if (account._count.transactions > 0) throw new BadRequestException('Account has transactions');
    await this.prisma.bankAccount.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    return { message: 'Bank account deleted' };
  }

  async updateBalance(id: string, amount: number, type: 'add' | 'subtract') {
    const account = await this.prisma.bankAccount.findUnique({ where: { id } });
    if (!account) throw new NotFoundException(`Bank account ${id} not found for balance update`);
    const newBalance =
      type === 'add'
        ? parseFloat(account.systemBalance.toString()) + amount
        : parseFloat(account.systemBalance.toString()) - amount;
    await this.prisma.bankAccount.update({
      where: { id },
      data: { systemBalance: new Decimal(newBalance) },
    });
  }
}
