import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { IntakeProcessorService } from './modules/ai/intake/intake-processor.service';
import { IntakeQueueService } from './modules/ai/intake/intake-queue.service';
import { PrismaService } from './prisma/prisma.service';
import { ReadReplicaService } from './prisma/read-replica.service';
import { WorkerModule } from './worker.module';

describe('WorkerModule', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it('resolves every dependency the intake processor needs without the HTTP app', async () => {
    const db = { $connect: jest.fn(), $disconnect: jest.fn() };
    const moduleRef = await Test.createTestingModule({ imports: [WorkerModule] })
      .overrideProvider(PrismaService)
      .useValue(db)
      .overrideProvider(ReadReplicaService)
      .useValue(db)
      .compile();

    expect(moduleRef.get(IntakeProcessorService)).toBeInstanceOf(IntakeProcessorService);
    expect(moduleRef.get(IntakeQueueService)).toBeInstanceOf(IntakeQueueService);
    await moduleRef.close();
  });
});
