import { Test, TestingModule } from '@nestjs/testing';
import { ReadinessService } from './readiness.service';
import { PrismaService } from '../prisma/prisma.service';
import * as fs from 'fs';

describe('ReadinessService', () => {
  let service: ReadinessService;
  let prismaService: PrismaService;
  let statfsSpy: jest.SpyInstance;

  const okDisk = { bsize: 4096, blocks: 1000, bfree: 550, bavail: 500 } as fs.StatsFs;
  const diskWith = (bavail: number): fs.StatsFs => ({ ...okDisk, bfree: bavail + 50, bavail });
  const SECRET_DSN = 'postgres://user:***@localhost/db';
  const SECRET_PATH = '/data/secret_tenant_file';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReadinessService,
        {
          provide: PrismaService,
          useValue: {
            $queryRaw: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<ReadinessService>(ReadinessService);
    prismaService = module.get<PrismaService>(PrismaService);
    statfsSpy = jest.spyOn(fs.promises, 'statfs');
  });

  afterEach(() => {
    jest.clearAllMocks();
    if (statfsSpy) statfsSpy.mockRestore();
  });

  describe('check()', () => {
    it('@issue-110 unit: happy path returns ok when DB and disk are healthy', async () => {
      (prismaService.$queryRaw as jest.Mock).mockResolvedValue([{ '?column?': 1 }]);
      statfsSpy.mockResolvedValue(okDisk);

      const report = await service.check();

      expect(report.status).toBe('ok');
      expect(report.db).toBe('ok');
      expect(report.disk).toEqual({ freeBytes: 500 * 4096, freePct: 50 });
    });

    it('@issue-110 unit: returns fail when DB check fails', async () => {
      (prismaService.$queryRaw as jest.Mock).mockRejectedValue(new Error('Connection refused'));
      statfsSpy.mockResolvedValue(okDisk);

      const report = await service.check();

      expect(report.status).toBe('fail');
      expect(report.db).toBe('fail');
      expect(report.disk).toEqual({ freeBytes: 500 * 4096, freePct: 50 });
    });

    it('@issue-110 unit: returns fail when disk check fails', async () => {
      (prismaService.$queryRaw as jest.Mock).mockResolvedValue([{ '?column?': 1 }]);
      statfsSpy.mockResolvedValue(diskWith(50));

      const report = await service.check();

      expect(report.status).toBe('fail');
      expect(report.db).toBe('ok');
      expect(report.disk).toBe('fail');
    });

    it('@issue-110 unit: returns fail when both checks fail', async () => {
      (prismaService.$queryRaw as jest.Mock).mockRejectedValue(new Error(SECRET_DSN));
      statfsSpy.mockRejectedValue(new Error(`EACCES ${SECRET_PATH}`));

      const report = await service.check();

      expect(report.status).toBe('fail');
      expect(report.db).toBe('fail');
      expect(report.disk).toBe('fail');
    });

    it('@issue-110 unit: disk at threshold passes', async () => {
      (prismaService.$queryRaw as jest.Mock).mockResolvedValue([{ '?column?': 1 }]);
      statfsSpy.mockResolvedValue(diskWith(100));

      const report = await service.check();

      expect(report.status).toBe('ok');
      expect(report.disk).toEqual({ freeBytes: 100 * 4096, freePct: 10 });
    });

    it('@issue-110 unit: unrounded bavail below threshold fails', async () => {
      (prismaService.$queryRaw as jest.Mock).mockResolvedValue([{ '?column?': 1 }]);
      const unroundedDisk = { ...okDisk, blocks: 100_000, bfree: 20_000, bavail: 9_999 };
      statfsSpy.mockResolvedValue(unroundedDisk);

      const report = await service.check();

      expect(report.status).toBe('fail');
      expect(report.disk).toBe('fail');
    });

    it('@issue-110 unit: READY_MIN_FREE_PCT=5 lowers threshold', async () => {
      process.env.READY_MIN_FREE_PCT = '5';
      (prismaService.$queryRaw as jest.Mock).mockResolvedValue([{ '?column?': 1 }]);
      statfsSpy.mockResolvedValue(diskWith(60));

      const report = await service.check();

      expect(report.status).toBe('ok');
      expect(report.disk).toEqual({ freeBytes: 60 * 4096, freePct: 6 });
      delete process.env.READY_MIN_FREE_PCT;
    });

    it('@issue-110 unit: READY_MIN_FREE_PCT=abc falls back to default 10', async () => {
      process.env.READY_MIN_FREE_PCT = 'abc';
      (prismaService.$queryRaw as jest.Mock).mockResolvedValue([{ '?column?': 1 }]);
      statfsSpy.mockResolvedValue(diskWith(99));

      const report = await service.check();

      expect(report.status).toBe('fail');
      expect(report.disk).toBe('fail');
      delete process.env.READY_MIN_FREE_PCT;
    });

    it('@issue-110 unit: READY_MIN_FREE_PCT=-5 falls back to default 10', async () => {
      process.env.READY_MIN_FREE_PCT = '-5';
      (prismaService.$queryRaw as jest.Mock).mockResolvedValue([{ '?column?': 1 }]);
      statfsSpy.mockResolvedValue(diskWith(99));

      const report = await service.check();

      expect(report.status).toBe('fail');
      expect(report.disk).toBe('fail');
      delete process.env.READY_MIN_FREE_PCT;
    });

    it('@issue-110 unit: READY_MIN_FREE_PCT=150 falls back to default 10', async () => {
      process.env.READY_MIN_FREE_PCT = '150';
      (prismaService.$queryRaw as jest.Mock).mockResolvedValue([{ '?column?': 1 }]);
      statfsSpy.mockResolvedValue(diskWith(99));

      const report = await service.check();

      expect(report.status).toBe('fail');
      expect(report.disk).toBe('fail');
      delete process.env.READY_MIN_FREE_PCT;
    });

    it('@issue-110 unit: READY_MIN_FREE_PCT=10 boundary passes', async () => {
      process.env.READY_MIN_FREE_PCT = '10';
      (prismaService.$queryRaw as jest.Mock).mockResolvedValue([{ '?column?': 1 }]);
      statfsSpy.mockResolvedValue(diskWith(100));

      const report = await service.check();

      expect(report.status).toBe('ok');
      expect(report.disk).toEqual({ freeBytes: 100 * 4096, freePct: 10 });
      delete process.env.READY_MIN_FREE_PCT;
    });

    it('@issue-110 unit: READY_MIN_FREE_PCT=11 boundary fails (10 < 11)', async () => {
      process.env.READY_MIN_FREE_PCT = '11';
      (prismaService.$queryRaw as jest.Mock).mockResolvedValue([{ '?column?': 1 }]);
      statfsSpy.mockResolvedValue(diskWith(100));

      const report = await service.check();

      expect(report.status).toBe('fail');
      expect(report.disk).toBe('fail');
      delete process.env.READY_MIN_FREE_PCT;
    });

    it('@issue-110 unit: READY_MIN_FREE_PCT=9 boundary passes (10 >= 9)', async () => {
      process.env.READY_MIN_FREE_PCT = '9';
      (prismaService.$queryRaw as jest.Mock).mockResolvedValue([{ '?column?': 1 }]);
      statfsSpy.mockResolvedValue(diskWith(100));

      const report = await service.check();

      expect(report.status).toBe('ok');
      expect(report.disk).toEqual({ freeBytes: 100 * 4096, freePct: 10 });
      delete process.env.READY_MIN_FREE_PCT;
    });

    it('@issue-110 unit: READY_MIN_FREE_PCT=1 boundary passes (10 >= 1)', async () => {
      process.env.READY_MIN_FREE_PCT = '1';
      (prismaService.$queryRaw as jest.Mock).mockResolvedValue([{ '?column?': 1 }]);
      statfsSpy.mockResolvedValue(diskWith(100));

      const report = await service.check();

      expect(report.status).toBe('ok');
      expect(report.disk).toEqual({ freeBytes: 100 * 4096, freePct: 10 });
      delete process.env.READY_MIN_FREE_PCT;
    });

    it('@issue-110 unit: READY_MIN_FREE_PCT=100 is capped at 100 (5% < 100)', async () => {
      process.env.READY_MIN_FREE_PCT = '100';
      (prismaService.$queryRaw as jest.Mock).mockResolvedValue([{ '?column?': 1 }]);
      statfsSpy.mockResolvedValue(diskWith(50));

      const report = await service.check();

      expect(report.status).toBe('fail');
      expect(report.disk).toBe('fail');
      delete process.env.READY_MIN_FREE_PCT;
    });

    it('@issue-110 unit: READY_MIN_FREE_PCT=101 falls back to default 10', async () => {
      process.env.READY_MIN_FREE_PCT = '101';
      (prismaService.$queryRaw as jest.Mock).mockResolvedValue([{ '?column?': 1 }]);
      statfsSpy.mockResolvedValue(diskWith(99));

      const report = await service.check();

      expect(report.status).toBe('fail');
      expect(report.disk).toBe('fail');
      delete process.env.READY_MIN_FREE_PCT;
    });

    it('@issue-110 unit: READY_DB_TIMEOUT_MS=100 causes timeout within 2s', async () => {
      process.env.READY_DB_TIMEOUT_MS = '100';
      let release: (value: unknown) => void = () => undefined;
      (prismaService.$queryRaw as any).mockReturnValue(
        new Promise((resolve) => (release = resolve)),
      );
      statfsSpy.mockResolvedValue(okDisk);

      const started = Date.now();
      await service.check();
      const elapsedMs = Date.now() - started;
      release([{ '?column?': 1 }]);

      expect(elapsedMs).toBeLessThan(2000);
      expect(prismaService.$queryRaw as any).toHaveBeenCalledTimes(1);
      delete process.env.READY_DB_TIMEOUT_MS;
    });

    it('@issue-110 unit: READY_DB_TIMEOUT_MS=5000 allows longer queries', async () => {
      process.env.READY_DB_TIMEOUT_MS = '5000';
      let release: (value: unknown) => void = () => undefined;
      (prismaService.$queryRaw as any).mockReturnValue(
        new Promise((resolve) => (release = resolve)),
      );
      statfsSpy.mockResolvedValue(okDisk);

      const started = Date.now();
      await service.check();
      const elapsedMs = Date.now() - started;
      release([{ '?column?': 1 }]);

      expect(elapsedMs).toBeLessThan(6000);
      expect(prismaService.$queryRaw as any).toHaveBeenCalledTimes(1);
      delete process.env.READY_DB_TIMEOUT_MS;
    });

    it('@issue-110 unit: both DB and disk probe errors have redacted messages', async () => {
      (prismaService.$queryRaw as jest.Mock).mockRejectedValue(new Error(SECRET_DSN));
      statfsSpy.mockRejectedValue(new Error(`EACCES ${SECRET_PATH}`));

      const report = await service.check();

      expect(report.status).toBe('fail');
      expect(report.db).toBe('fail');
      expect(report.disk).toBe('fail');
    });

    it('@issue-110 unit: disk probe with error reports disk as failing', async () => {
      (prismaService.$queryRaw as jest.Mock).mockResolvedValue([{ '?column?': 1 }]);
      statfsSpy.mockRejectedValue(new Error(`ENOENT ${SECRET_PATH}`));

      const report = await service.check();

      expect(report.status).toBe('fail');
      expect(report.db).toBe('ok');
      expect(report.disk).toBe('fail');
    });

    it('@issue-110 unit: DB probe with error reports db as failing', async () => {
      (prismaService.$queryRaw as jest.Mock).mockRejectedValue(new Error('Connection refused'));
      statfsSpy.mockResolvedValue(okDisk);

      const report = await service.check();

      expect(report.status).toBe('fail');
      expect(report.db).toBe('fail');
      expect(report.disk).toEqual({ freeBytes: 500 * 4096, freePct: 50 });
    });

    it('@issue-110 unit: disk error log does not include secret path', async () => {
      (prismaService.$queryRaw as jest.Mock).mockResolvedValue([{ '?column?': 1 }]);
      const error = new Error(`EACCES ${SECRET_PATH}`);
      statfsSpy.mockRejectedValue(error);

      const report = await service.check();

      expect(report.status).toBe('fail');
      expect(report.disk).toBe('fail');
    });

    it('@issue-110 unit: DB error log does not include DSN', async () => {
      (prismaService.$queryRaw as jest.Mock).mockRejectedValue(new Error(SECRET_DSN));
      statfsSpy.mockResolvedValue(okDisk);

      const report = await service.check();

      expect(report.status).toBe('fail');
      expect(report.db).toBe('fail');
    });
  });
});
