import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import * as fs from 'fs';
import { createTestApp, getPrisma } from './helpers/app.helper';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Health Ready Endpoint (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let statfsSpy: jest.SpyInstance;
  let queryRawSpy: jest.SpyInstance;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = getPrisma(app);

    // Mock the statfs and prisma queries to avoid real disk/db checks in the readiness tests,
    // though we could let the DB pass in healthy cases. We will mock them explicitly per test.
    statfsSpy = jest.spyOn(fs.promises, 'statfs');
    queryRawSpy = jest.spyOn(prisma as any, '$queryRaw');
  });

  afterAll(async () => {
    statfsSpy.mockRestore();
    queryRawSpy.mockRestore();
    await app.close();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('@e2e @health-ready @issue-110 AC1: A healthy DB and enough disk returns 200 with the documented JSON shape', async () => {
    // Mock DB ok
    queryRawSpy.mockResolvedValue([{ '?column?': 1 }]);
    // Mock Disk ok (50% free)
    statfsSpy.mockResolvedValue({
      type: 0,
      bsize: 4096,
      blocks: 1000,
      bfree: 500, // 50% free
      bavail: 500,
      files: 1000,
      ffree: 500,
    });

    const response = await request(app.getHttpServer()).get('/health/ready');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      status: 'ok',
      db: 'ok',
      disk: {
        freeBytes: 500 * 4096,
        freePct: 50,
      },
    });
  });

  it('@e2e @health-ready @issue-110 AC2: A failing DB check returns 503 within the timeout, and the body names db as failing', async () => {
    // Mock DB failure
    queryRawSpy.mockRejectedValue(new Error('Connection timeout'));
    // Mock Disk ok
    statfsSpy.mockResolvedValue({
      bsize: 4096,
      blocks: 1000,
      bfree: 500,
      bavail: 500,
    } as any);

    const response = await request(app.getHttpServer()).get('/health/ready');

    expect(response.status).toBe(503);
    expect(response.body.db).not.toBe('ok');
    // Ensure it names db as failing somehow, for example "down" or "failed"
  });

  it('@e2e @health-ready @issue-110 AC3: Free space below the threshold returns 503 and the body names disk as failing', async () => {
    // Mock DB ok
    queryRawSpy.mockResolvedValue([{ '?column?': 1 }]);
    // Mock Disk low (5% free, below threshold 10)
    statfsSpy.mockResolvedValue({
      bsize: 4096,
      blocks: 1000,
      bfree: 50,
      bavail: 50,
    } as any);

    const response = await request(app.getHttpServer()).get('/health/ready');

    expect(response.status).toBe(503);
    expect(response.body.disk).toBeDefined();
    // the status could be 'error' or 'disk_full' etc. but it should not be ok
    if (typeof response.body.disk === 'object') {
      expect(response.body.disk.freePct).toBe(5);
    } else {
      expect(response.body.disk).not.toBe('ok');
    }
  });

  it('@e2e @health-ready @issue-110 AC4: The response contains no connection strings, paths with credentials or tenant data', async () => {
    queryRawSpy.mockRejectedValue(new Error('postgres://user:password@localhost/db'));
    statfsSpy.mockRejectedValue(new Error('EACCES /data/secret_tenant_file'));

    const response = await request(app.getHttpServer()).get('/health/ready');

    expect(response.status).toBe(503);
    const bodyStr = JSON.stringify(response.body);
    expect(bodyStr).not.toContain('postgres://');
    expect(bodyStr).not.toContain('password');
    expect(bodyStr).not.toContain('secret_tenant_file');
    expect(bodyStr).not.toContain('/data');
  });
});
