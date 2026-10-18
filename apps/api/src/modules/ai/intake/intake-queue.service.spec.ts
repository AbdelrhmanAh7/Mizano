import { ConfigService } from '@nestjs/config';
import { IntakeQueueService } from './intake-queue.service';

describe('IntakeQueueService without REDIS_URL', () => {
  const payload = { jobId: 'job-1', organizationId: 'org-1' };
  let queue: IntakeQueueService;

  beforeEach(() => {
    queue = new IntakeQueueService({ get: () => undefined } as unknown as ConfigService);
  });

  afterEach(async () => {
    await queue.onModuleDestroy();
  });

  it('refuses to enqueue in a process with no handler (API without a worker-visible queue)', async () => {
    await expect(queue.enqueue(payload, 'job-1-a0')).rejects.toThrow(/REDIS_URL/);
  });

  it('runs inline when the same process registered the handler', async () => {
    const handler = jest.fn().mockResolvedValue(undefined);
    queue.registerHandler(handler);
    await queue.enqueue(payload, 'job-1-a0');
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(handler).toHaveBeenCalledWith(payload);
  });
});
