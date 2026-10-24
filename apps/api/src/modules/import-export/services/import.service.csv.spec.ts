import { PrismaService } from '../../../prisma/prisma.service';
import { createMockPrisma } from '../../../test/mocks/prisma.mock';
import { ImportService } from './import.service';

describe('ImportService CSV parsing', () => {
  let service: ImportService;

  beforeEach(() => {
    service = new ImportService(
      createMockPrisma() as unknown as PrismaService,
      ...(Array.from({ length: 7 }, () => ({})) as [
        never,
        never,
        never,
        never,
        never,
        never,
        never,
      ]),
    );
  });

  const csv = Buffer.from('date,description,amount\n2026-03-01,Rent,-500\n2026-03-02,Sale,900\n');

  it('parseFile reads headers, preview and row count (regression: _csvparser is not a function)', async () => {
    const result = await service.parseFile(csv, 'statement.csv');

    expect(result.fileType).toBe('csv');
    expect(result.headers).toEqual(['date', 'description', 'amount']);
    expect(result.totalRows).toBe(2);
    expect(result.preview[0]).toMatchObject({ description: 'Rent', amount: '-500' });
  });

  it('getAllRows (used by bank-statement import) also parses CSV', async () => {
    const rows = await service.getAllRows(csv, 'statement.csv');
    expect(rows).toHaveLength(2);
  });
});
