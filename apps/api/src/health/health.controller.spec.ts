import { HealthController } from './health.controller';
import { PrismaService } from '../prisma/prisma.service';
import { IntakeQueueService } from '../modules/ai/intake/intake-queue.service';

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

  it('reports worker module cache as unavailable when intake queue is not provided', async () => {
    const workerModules = await controller.checkWorkerModules();
    expect(workerModules.status).toBe('unavailable');
    expect(workerModules.tesseractLoaded).toBe(false);
    expect(workerModules.pdfParseLoaded).toBe(false);
    expect(workerModules.ocrModules).toEqual([]);
  });

  it('reports worker module cache as healthy with empty modules when queue has no cached state', async () => {
    const queue = {
      getWorkerModuleCache: jest.fn().mockResolvedValue(null),
    } as unknown as IntakeQueueService;
    const controllerWithQueue = new HealthController(prisma, undefined, queue);
    const workerModules = await controllerWithQueue.checkWorkerModules();
    expect(workerModules.status).toBe('healthy');
    expect(workerModules.tesseractLoaded).toBe(false);
    expect(workerModules.pdfParseLoaded).toBe(false);
    expect(workerModules.ocrModules).toEqual([]);
  });

  it('reports worker module cache state when worker has processed documents with pdf-parse', async () => {
    const queue = {
      getWorkerModuleCache: jest
        .fn()
        .mockResolvedValue(['/node_modules/pdf-parse/lib/pdf-parse.js']),
    } as unknown as IntakeQueueService;
    const controllerWithQueue = new HealthController(prisma, undefined, queue);
    const workerModules = await controllerWithQueue.checkWorkerModules();
    expect(workerModules.status).toBe('healthy');
    expect(workerModules.tesseractLoaded).toBe(false);
    expect(workerModules.pdfParseLoaded).toBe(true);
    expect(workerModules.ocrModules).toEqual(['/node_modules/pdf-parse/lib/pdf-parse.js']);
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
