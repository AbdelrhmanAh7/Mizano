import { Test, TestingModule } from '@nestjs/testing';
import { VatReturnDraftService } from './vat-return-draft.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { Prisma } from '@prisma/client';

describe('VatReturnDraftService', () => {
  let service: VatReturnDraftService;
  let prisma: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VatReturnDraftService,
        {
          provide: PrismaService,
          useValue: {
            organization: { findUnique: jest.fn() },
            invoice: { findMany: jest.fn() },
            bill: { findMany: jest.fn() },
          },
        },
      ],
    }).compile();

    service = module.get<VatReturnDraftService>(VatReturnDraftService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('Totals are correct for mixed rates', async () => {
    jest.spyOn(prisma.organization, 'findUnique').mockResolvedValue({ currency: 'EGP' } as any);
    jest.spyOn(prisma.invoice, 'findMany').mockResolvedValue([
      {
        id: '1',
        invoiceNumber: 'INV-1',
        taxAmount: new Prisma.Decimal('0.0000'),
        currencyCode: 'EGP',
      },
      {
        id: '2',
        invoiceNumber: 'INV-2',
        taxAmount: new Prisma.Decimal('50.0000'),
        currencyCode: 'EGP',
      },
      {
        id: '3',
        invoiceNumber: 'INV-3',
        taxAmount: new Prisma.Decimal('140.0000'),
        currencyCode: 'EGP',
      },
    ] as any);
    jest.spyOn(prisma.bill, 'findMany').mockResolvedValue([
      {
        id: '4',
        billNumber: 'BILL-1',
        taxAmount: new Prisma.Decimal('0.0000'),
        currencyCode: 'EGP',
      },
      {
        id: '5',
        billNumber: 'BILL-2',
        taxAmount: new Prisma.Decimal('20.0000'),
        currencyCode: 'EGP',
      },
    ] as any);

    const result = await service.getDraft('org_1', '2023-01-01', '2023-01-31');
    expect(result.outputTax).toBe('190.0000');
    expect(result.inputTax).toBe('20.0000');
    expect(result.netPayable).toBe('170.0000');
    expect(result.status).toBe('complete');
  });

  it('Decimal rounding is exact', async () => {
    jest.spyOn(prisma.organization, 'findUnique').mockResolvedValue({ currency: 'EGP' } as any);
    jest.spyOn(prisma.invoice, 'findMany').mockResolvedValue([
      {
        id: '1',
        invoiceNumber: 'INV-1',
        taxAmount: new Prisma.Decimal('0.1000'),
        currencyCode: 'EGP',
      },
      {
        id: '2',
        invoiceNumber: 'INV-2',
        taxAmount: new Prisma.Decimal('0.2000'),
        currencyCode: 'EGP',
      },
    ] as any);
    jest.spyOn(prisma.bill, 'findMany').mockResolvedValue([]);

    const result = await service.getDraft('org_1', '2023-01-01', '2023-01-31');
    expect(result.outputTax).toBe('0.3000');
  });

  it('Missing tax or foreign currency lands in exceptions', async () => {
    jest.spyOn(prisma.organization, 'findUnique').mockResolvedValue({ currency: 'EGP' } as any);
    jest.spyOn(prisma.invoice, 'findMany').mockResolvedValue([
      {
        id: '1',
        invoiceNumber: 'INV-1',
        taxAmount: new Prisma.Decimal('10.0000'),
        currencyCode: 'USD',
      },
    ] as any);
    jest
      .spyOn(prisma.bill, 'findMany')
      .mockResolvedValue([
        { id: '2', billNumber: 'BILL-1', taxAmount: null, currencyCode: 'EGP' },
      ] as any);

    const result = await service.getDraft('org_1', '2023-01-01', '2023-01-31');
    expect(result.status).toBe('incomplete');
    expect(result.exceptions).toHaveLength(2);
    expect(result.exceptions[0].id).toBe('1');
    expect(result.exceptions[1].id).toBe('2');
  });

  it('An empty period returns zeros as strings', async () => {
    jest.spyOn(prisma.organization, 'findUnique').mockResolvedValue({ currency: 'EGP' } as any);
    jest.spyOn(prisma.invoice, 'findMany').mockResolvedValue([]);
    jest.spyOn(prisma.bill, 'findMany').mockResolvedValue([]);

    const result = await service.getDraft('org_1', '2023-01-01', '2023-01-31');
    expect(result.outputTax).toBe('0.0000');
    expect(result.inputTax).toBe('0.0000');
    expect(result.netPayable).toBe('0.0000');
  });
});
