import { INestApplication, Logger } from '@nestjs/common';
import * as request from 'supertest';
import * as fs from 'fs';
import { createTestApp, getPrisma } from './helpers/app.helper';
import { PrismaService } from '../src/prisma/prisma.service';

const okDisk = { bsize: 4096, blocks: 1000, bfree: 500, bavail: 500 } as fs.StatsFs;
const diskWith = (bfree: number): fs.StatsFs => ({ ...okDisk, bfree, bavail: bfree });
const SECRET_DSN = 'postgres://user:password@localhost/db';
const SECRET_PATH = '/data/secret_tenant_file';

describe('Health Ready Endpoint (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let statfsSpy: jest.SpyInstance;
  let queryRawSpy: jest.SpyInstance;
  let logSpy: jest.SpyInstance;
  const envBackup = { ...process.env };

  beforeAll(async () => {
    app = await createTestApp();
    prisma = getPrisma(app);
    statfsSpy = jest.spyOn(fs.promises, 'statfs');
    queryRawSpy = jest.spyOn(prisma, '$queryRaw');
    logSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterAll(async () => {
    statfsSpy.mockRestore();
    queryRawSpy.mockRestore();
    logSpy.mockRestore();
    await app.close();
  });

  afterEach(() => {
    jest.resetAllMocks();
    logSpy.mockImplementation(() => undefined);
    process.env = { ...envBackup };
  });

  const ready = (): request.Test => request(app.getHttpServer()).get('/health/ready');

  it('@e2e @health-ready @issue-110 AC1: A healthy DB and enough disk returns 200 with the documented JSON shape', async () => {
    queryRawSpy.mockResolvedValue([{ '?column?': 1 }]);
    statfsSpy.mockResolvedValue(okDisk);

    const response = await ready();

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      status: 'ok',
      db: 'ok',
      disk: { freeBytes: 500 * 4096, freePct: 50 },
    });
  });

  it('@e2e @health-ready @issue-110 AC1 boundary: free space exactly at the threshold still passes', async () => {
    queryRawSpy.mockResolvedValue([{ '?column?': 1 }]);
    statfsSpy.mockResolvedValue(diskWith(100));

    const response = await ready();

    expect(response.status).toBe(200);
    expect(response.body.disk).toEqual({ freeBytes: 100 * 4096, freePct: 10 });
  });

  it('@e2e @health-ready @issue-110 AC2: A failing DB check returns 503, and the body names db as failing', async () => {
    queryRawSpy.mockRejectedValue(new Error('Connection refused'));
    statfsSpy.mockResolvedValue(okDisk);

    const response = await ready();

    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      status: 'fail',
      db: 'fail',
      disk: { freeBytes: 500 * 4096, freePct: 50 },
    });
  });

  it('@e2e @health-ready @issue-110 AC2 timeout: a hung DB returns 503 within the configured timeout', async () => {
    process.env.READY_DB_TIMEOUT_MS = '100';
    queryRawSpy.mockReturnValue(new Promise(() => undefined));
    statfsSpy.mockResolvedValue(okDisk);

    const started = Date.now();
    const response = await ready();
    const elapsedMs = Date.now() - started;

    expect(response.status).toBe(503);
    expect(response.body.db).toBe('fail');
    expect(elapsedMs).toBeLessThan(2000);
  });

  it('@e2e @health-ready @issue-110 AC3: Free space below the threshold returns 503 and the body names disk as failing', async () => {
    queryRawSpy.mockResolvedValue([{ '?column?': 1 }]);
    statfsSpy.mockResolvedValue(diskWith(50));

    const response = await ready();

    expect(response.status).toBe(503);
    expect(response.body).toEqual({ status: 'fail', db: 'ok', disk: 'fail' });
  });

  it('@e2e @health-ready @issue-110 AC3: a disk probe error also reports disk as failing', async () => {
    queryRawSpy.mockResolvedValue([{ '?column?': 1 }]);
    statfsSpy.mockRejectedValue(new Error(`ENOENT ${SECRET_PATH}`));

    const response = await ready();

    expect(response.status).toBe(503);
    expect(response.body).toEqual({ status: 'fail', db: 'ok', disk: 'fail' });
  });

  it.each(['abc', '-5', '150'])(
    '@e2e @health-ready @issue-110 AC3 config: READY_MIN_FREE_PCT=%s falls back to the default of 10',
    async (raw) => {
      process.env.READY_MIN_FREE_PCT = raw;
      queryRawSpy.mockResolvedValue([{ '?column?': 1 }]);
      statfsSpy.mockResolvedValue(diskWith(99));

      const response = await ready();

      expect(response.status).toBe(503);
      expect(response.body.disk).toBe('fail');
    },
  );

  it('@e2e @health-ready @issue-110 AC3 config: READY_MIN_FREE_PCT=5 lowers the threshold', async () => {
    process.env.READY_MIN_FREE_PCT = '5';
    queryRawSpy.mockResolvedValue([{ '?column?': 1 }]);
    statfsSpy.mockResolvedValue(diskWith(60));

    const response = await ready();

    expect(response.status).toBe(200);
    expect(response.body.disk).toEqual({ freeBytes: 60 * 4096, freePct: 6 });
  });

  it('@e2e @health-ready @issue-110 AC4: both checks failing names both, and neither body nor logs leak secrets or paths', async () => {
    queryRawSpy.mockRejectedValue(new Error(SECRET_DSN));
    statfsSpy.mockRejectedValue(new Error(`EACCES ${SECRET_PATH}`));

    const response = await ready();

    expect(response.status).toBe(503);
    expect(response.body).toEqual({ status: 'fail', db: 'fail', disk: 'fail' });
    const logged = JSON.stringify(logSpy.mock.calls);
    expect(logSpy).toHaveBeenCalled();
    for (const text of [JSON.stringify(response.body), logged]) {
      expect(text).not.toContain('postgres://');
      expect(text).not.toContain('password');
      expect(text).not.toContain('secret_tenant_file');
      expect(text).not.toContain('/data');
    }
  });

  it('@e2e @health-ready @issue-110 AC1: /health liveness keeps its existing shape', async () => {
    queryRawSpy.mockResolvedValue([{ '?column?': 1 }]);

    const response = await request(app.getHttpServer()).get('/health');

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('healthy');
    expect(response.body.services.database.status).toBe('connected');
  });
});
