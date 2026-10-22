import { HealthController } from './health.controller';
import { PrismaService } from '../prisma/prisma.service';

describe('HealthController', () => {
  let controller: HealthController;
  let prisma: PrismaService;

  beforeEach(() => {
    prisma = {
      $queryRaw: jest.fn().mockResolvedValue([{ 1: 1 }]),
    } as unknown as PrismaService;
    controller = new HealthController(prisma);
  });

  it('reports module cache state without tesseract.js or pdf-parse', () => {
    const modules = controller.checkModules();
    expect(modules.status).toBe('healthy');
    expect(modules.tesseractLoaded).toBe(false);
    expect(modules.pdfParseLoaded).toBe(false);
    expect(modules.ocrModules).toEqual([]);
  });

  it('reports liveness', () => {
    const live = controller.liveness();
    expect(live.alive).toBe(true);
    expect(typeof live.uptime).toBe('number');
  });

  it('reports readiness when DB query succeeds', async () => {
    const ready = await controller.readiness();
    expect(ready.ready).toBe(true);
  });
});
