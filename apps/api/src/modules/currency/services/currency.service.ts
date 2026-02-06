import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { Decimal } from '@prisma/client/runtime/library';
import {
  CreateExchangeRateDto,
  UpdateExchangeRateDto,
  ExchangeRateQueryDto,
  ConvertAmountDto,
  ConversionResultDto,
  GainLossCalculationDto,
  GainLossResultDto,
  SUPPORTED_CURRENCIES,
} from '../dto/currency.dto';

@Injectable()
export class CurrencyService {
  constructor(private prisma: PrismaService) {}

  // ============ Exchange Rate CRUD ============

  async createExchangeRate(
    organizationId: string,
    dto: CreateExchangeRateDto,
  ) {
    // Validate currencies
    this.validateCurrencyCode(dto.fromCurrency);
    this.validateCurrencyCode(dto.toCurrency);

    if (dto.fromCurrency === dto.toCurrency) {
      throw new BadRequestException('From and To currencies cannot be the same');
    }

    const date = new Date(dto.date);
    date.setHours(0, 0, 0, 0);

    // Check if rate already exists for this date
    const existing = await this.prisma.exchangeRate.findFirst({
      where: {
        organizationId,
        fromCurrency: dto.fromCurrency.toUpperCase(),
        toCurrency: dto.toCurrency.toUpperCase(),
        date,
      },
    });

    if (existing) {
      // Update existing rate
      return this.prisma.exchangeRate.update({
        where: { id: existing.id },
        data: {
          rate: new Decimal(dto.rate),
          source: dto.source || 'MANUAL',
        },
      });
    }

    return this.prisma.exchangeRate.create({
      data: {
        fromCurrency: dto.fromCurrency.toUpperCase(),
        toCurrency: dto.toCurrency.toUpperCase(),
        rate: new Decimal(dto.rate),
        date,
        source: dto.source || 'MANUAL',
        organizationId,
      },
    });
  }

  async updateExchangeRate(
    organizationId: string,
    id: string,
    dto: UpdateExchangeRateDto,
  ) {
    const rate = await this.prisma.exchangeRate.findFirst({
      where: { id, organizationId },
    });

    if (!rate) {
      throw new NotFoundException('Exchange rate not found');
    }

    return this.prisma.exchangeRate.update({
      where: { id },
      data: {
        rate: new Decimal(dto.rate),
        source: dto.source,
      },
    });
  }

  async deleteExchangeRate(organizationId: string, id: string) {
    const rate = await this.prisma.exchangeRate.findFirst({
      where: { id, organizationId },
    });

    if (!rate) {
      throw new NotFoundException('Exchange rate not found');
    }

    await this.prisma.exchangeRate.delete({ where: { id } });
    return { message: 'Exchange rate deleted' };
  }

  async getExchangeRates(organizationId: string, query: ExchangeRateQueryDto) {
    const where: any = { organizationId };

    if (query.fromCurrency) {
      where.fromCurrency = query.fromCurrency.toUpperCase();
    }
    if (query.toCurrency) {
      where.toCurrency = query.toCurrency.toUpperCase();
    }
    if (query.dateFrom || query.dateTo) {
      where.date = {};
      if (query.dateFrom) where.date.gte = new Date(query.dateFrom);
      if (query.dateTo) where.date.lte = new Date(query.dateTo);
    }

    const [data, total] = await Promise.all([
      this.prisma.exchangeRate.findMany({
        where,
        orderBy: { date: 'desc' },
        take: query.limit || 50,
        skip: query.offset || 0,
      }),
      this.prisma.exchangeRate.count({ where }),
    ]);

    return {
      data: data.map((r) => ({
        ...r,
        rate: parseFloat(r.rate.toString()),
      })),
      total,
    };
  }

  // ============ Rate Retrieval ============

  async getRate(
    organizationId: string,
    fromCurrency: string,
    toCurrency: string,
    date?: Date,
  ): Promise<{ rate: number; date: Date; source: string }> {
    const from = fromCurrency.toUpperCase();
    const to = toCurrency.toUpperCase();

    // Same currency - rate is 1
    if (from === to) {
      return { rate: 1, date: date || new Date(), source: 'SAME_CURRENCY' };
    }

    const queryDate = date ? new Date(date) : new Date();
    queryDate.setHours(23, 59, 59, 999);

    // Try direct rate
    let exchangeRate = await this.prisma.exchangeRate.findFirst({
      where: {
        organizationId,
        fromCurrency: from,
        toCurrency: to,
        date: { lte: queryDate },
      },
      orderBy: { date: 'desc' },
    });

    if (exchangeRate) {
      return {
        rate: parseFloat(exchangeRate.rate.toString()),
        date: exchangeRate.date,
        source: exchangeRate.source,
      };
    }

    // Try inverse rate
    const inverseRate = await this.prisma.exchangeRate.findFirst({
      where: {
        organizationId,
        fromCurrency: to,
        toCurrency: from,
        date: { lte: queryDate },
      },
      orderBy: { date: 'desc' },
    });

    if (inverseRate) {
      return {
        rate: 1 / parseFloat(inverseRate.rate.toString()),
        date: inverseRate.date,
        source: `${inverseRate.source}_INVERSE`,
      };
    }

    // Try triangulation through base currency
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { baseCurrency: true },
    });

    const baseCurrency = org?.baseCurrency || 'SAR';

    if (from !== baseCurrency && to !== baseCurrency) {
      // Get from -> base rate
      const fromToBase = await this.getRate(organizationId, from, baseCurrency, date);
      // Get base -> to rate
      const baseToTo = await this.getRate(organizationId, baseCurrency, to, date);

      if (fromToBase && baseToTo) {
        return {
          rate: fromToBase.rate * baseToTo.rate,
          date: fromToBase.date > baseToTo.date ? fromToBase.date : baseToTo.date,
          source: 'TRIANGULATED',
        };
      }
    }

    throw new NotFoundException(
      `No exchange rate found for ${from} to ${to} on or before ${queryDate.toISOString().split('T')[0]}`,
    );
  }

  async getLatestRates(organizationId: string, baseCurrency?: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { baseCurrency: true },
    });

    const base = baseCurrency?.toUpperCase() || org?.baseCurrency || 'SAR';

    // Get latest rates from base currency
    const rates = await this.prisma.$queryRaw<Array<any>>`
      SELECT DISTINCT ON (to_currency) *
      FROM exchange_rates
      WHERE organization_id = ${organizationId}
        AND from_currency = ${base}
      ORDER BY to_currency, date DESC
    `;

    return rates.map((r) => ({
      fromCurrency: r.from_currency,
      toCurrency: r.to_currency,
      rate: parseFloat(r.rate),
      date: r.date,
      source: r.source,
    }));
  }

  // ============ Currency Conversion ============

  async convertAmount(
    organizationId: string,
    dto: ConvertAmountDto,
  ): Promise<ConversionResultDto> {
    const date = dto.date ? new Date(dto.date) : new Date();

    const rateInfo = await this.getRate(
      organizationId,
      dto.fromCurrency,
      dto.toCurrency,
      date,
    );

    const convertedAmount = dto.amount * rateInfo.rate;

    return {
      originalAmount: dto.amount,
      convertedAmount: Math.round(convertedAmount * 10000) / 10000,
      fromCurrency: dto.fromCurrency.toUpperCase(),
      toCurrency: dto.toCurrency.toUpperCase(),
      rate: rateInfo.rate,
      rateDate: rateInfo.date,
      rateSource: rateInfo.source,
    };
  }

  async convertToBaseCurrency(
    organizationId: string,
    amount: number,
    fromCurrency: string,
    date?: Date,
  ): Promise<{ baseAmount: number; rate: number }> {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { baseCurrency: true },
    });

    const baseCurrency = org?.baseCurrency || 'SAR';

    if (fromCurrency.toUpperCase() === baseCurrency) {
      return { baseAmount: amount, rate: 1 };
    }

    const rateInfo = await this.getRate(organizationId, fromCurrency, baseCurrency, date);
    return {
      baseAmount: Math.round(amount * rateInfo.rate * 10000) / 10000,
      rate: rateInfo.rate,
    };
  }

  // ============ Gain/Loss Calculation ============

  calculateGainLoss(dto: GainLossCalculationDto): GainLossResultDto {
    const originalBaseAmount = dto.originalAmount * dto.originalRate;
    const currentBaseAmount = dto.originalAmount * dto.currentRate;

    // For receivables: gain if current rate > original rate (we receive more base currency)
    // For payables: gain if current rate < original rate (we pay less base currency)
    let gainLoss: number;
    if (dto.transactionType === 'receivable') {
      gainLoss = currentBaseAmount - originalBaseAmount;
    } else {
      gainLoss = originalBaseAmount - currentBaseAmount;
    }

    const percentageChange = originalBaseAmount !== 0
      ? ((dto.currentRate - dto.originalRate) / dto.originalRate) * 100
      : 0;

    return {
      originalBaseAmount: Math.round(originalBaseAmount * 10000) / 10000,
      currentBaseAmount: Math.round(currentBaseAmount * 10000) / 10000,
      gainLoss: Math.round(gainLoss * 10000) / 10000,
      isGain: gainLoss >= 0,
      percentageChange: Math.round(percentageChange * 100) / 100,
    };
  }

  async calculateUnrealizedGainLoss(
    organizationId: string,
    date?: Date,
  ): Promise<{
    receivablesGainLoss: number;
    payablesGainLoss: number;
    totalGainLoss: number;
    details: Array<{
      type: 'receivable' | 'payable';
      entityType: string;
      entityId: string;
      currency: string;
      originalAmount: number;
      originalRate: number;
      currentRate: number;
      gainLoss: number;
    }>;
  }> {
    const asOfDate = date || new Date();
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { baseCurrency: true },
    });

    const baseCurrency = org?.baseCurrency || 'SAR';
    const details: Array<any> = [];
    let receivablesGainLoss = 0;
    let payablesGainLoss = 0;

    // Get unpaid invoices in foreign currency
    const invoices = await this.prisma.invoice.findMany({
      where: {
        organizationId,
        status: { in: ['SENT', 'PARTIALLY_PAID', 'OVERDUE'] },
        currencyCode: { not: baseCurrency },
        deletedAt: null,
      },
    });

    for (const invoice of invoices) {
      if (!invoice.currencyCode || invoice.currencyCode === baseCurrency) continue;

      try {
        const currentRateInfo = await this.getRate(
          organizationId,
          invoice.currencyCode,
          baseCurrency,
          asOfDate,
        );

        const originalRate = parseFloat(invoice.exchangeRate?.toString() || '1');
        const balanceDue = parseFloat(invoice.balanceDue.toString());

        const result = this.calculateGainLoss({
          originalAmount: balanceDue,
          originalRate,
          currentRate: currentRateInfo.rate,
          transactionType: 'receivable',
        });

        receivablesGainLoss += result.gainLoss;
        details.push({
          type: 'receivable',
          entityType: 'invoice',
          entityId: invoice.id,
          currency: invoice.currencyCode,
          originalAmount: balanceDue,
          originalRate,
          currentRate: currentRateInfo.rate,
          gainLoss: result.gainLoss,
        });
      } catch (error) {
        // Rate not found, skip
      }
    }

    // Get unpaid bills in foreign currency
    const bills = await this.prisma.bill.findMany({
      where: {
        organizationId,
        status: { in: ['PENDING', 'PARTIALLY_PAID', 'OVERDUE'] },
        currencyCode: { not: baseCurrency },
        deletedAt: null,
      },
    });

    for (const bill of bills) {
      if (!bill.currencyCode || bill.currencyCode === baseCurrency) continue;

      try {
        const currentRateInfo = await this.getRate(
          organizationId,
          bill.currencyCode,
          baseCurrency,
          asOfDate,
        );

        const originalRate = parseFloat(bill.exchangeRate?.toString() || '1');
        const balanceDue = parseFloat(bill.balanceDue.toString());

        const result = this.calculateGainLoss({
          originalAmount: balanceDue,
          originalRate,
          currentRate: currentRateInfo.rate,
          transactionType: 'payable',
        });

        payablesGainLoss += result.gainLoss;
        details.push({
          type: 'payable',
          entityType: 'bill',
          entityId: bill.id,
          currency: bill.currencyCode,
          originalAmount: balanceDue,
          originalRate,
          currentRate: currentRateInfo.rate,
          gainLoss: result.gainLoss,
        });
      } catch (error) {
        // Rate not found, skip
      }
    }

    return {
      receivablesGainLoss: Math.round(receivablesGainLoss * 10000) / 10000,
      payablesGainLoss: Math.round(payablesGainLoss * 10000) / 10000,
      totalGainLoss: Math.round((receivablesGainLoss + payablesGainLoss) * 10000) / 10000,
      details,
    };
  }

  // ============ Currency Info ============

  async getCurrencyInfo(organizationId: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { baseCurrency: true },
    });

    const latestRates = await this.getLatestRates(organizationId);

    return {
      baseCurrency: org?.baseCurrency || 'SAR',
      supportedCurrencies: SUPPORTED_CURRENCIES,
      latestRates,
    };
  }

  getSupportedCurrencies() {
    return SUPPORTED_CURRENCIES;
  }

  // ============ Helpers ============

  private validateCurrencyCode(code: string) {
    if (!code || code.length !== 3) {
      throw new BadRequestException(`Invalid currency code: ${code}. Must be 3 characters.`);
    }
  }
}
