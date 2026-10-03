import { PrismaService } from '../../../prisma/prisma.service';
import { createMockPrisma } from '../../../test/mocks/prisma.mock';
import { ImportService } from './import.service';

describe('ImportService CSV parser interoperability', () => {
  const service = new ImportService(
    createMockPrisma() as unknown as PrismaService,
    { create: jest.fn() } as never,
    { create: jest.fn() } as never,
    { create: jest.fn() } as never,
    { create: jest.fn() } as never,
    { create: jest.fn() } as never,
    { create: jest.fn() } as never,
    { create: jest.fn() } as never,
  );
  const rows = Array.from({ length: 12 }, (_, index) => ({
    name: `Customer ${index}, Cairo`,
    amount: '10.2500',
  }));
  const buffer = Buffer.from(
    ['name,amount', ...rows.map((row) => `"${row.name}",${row.amount}`), ''].join('\n'),
  );

  it('parses headers and a ten-row preview with the real CSV parser', async () => {
    await expect(service.parseFile(buffer, 'customers.csv')).resolves.toEqual({
      headers: ['name', 'amount'],
      preview: rows.slice(0, 10),
      totalRows: 12,
      fileType: 'csv',
    });
  });

  it('reads every import row, preserving quoted fields and decimal strings', async () => {
    await expect(service.getAllRows(buffer, 'customers.csv')).resolves.toEqual(rows);
  });
});
