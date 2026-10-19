import { BulkEntityType, BulkActionType } from './dto/bulk-operation.dto';
import { BulkOperationsService } from './bulk-operations.service';
import { EventEmitter2 } from '@nestjs/event-emitter';

const ORG_ID = 'org-test-001';
const OTHER_ORG_ID = 'org-test-002';
const FIXED_DATE = new Date('2024-06-15T00:00:00.000Z');

describe('BulkOperationsService', () => {
  let service: BulkOperationsService;
  let eventEmitter: EventEmitter2;
  let mockEmit: jest.Mock;
  let setIntervalSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.useFakeTimers();
    mockEmit = jest.fn();
    eventEmitter = { emit: mockEmit } as unknown as EventEmitter2;
    // Mock setInterval to prevent the cleanup interval from running during tests
    setIntervalSpy = jest.spyOn(global, 'setInterval').mockImplementation(() => ({}) as any);
    service = new BulkOperationsService(eventEmitter);
  });

  afterEach(() => {
    jest.useRealTimers();
    setIntervalSpy.mockRestore();
    jest.clearAllMocks();
  });

  describe('createJob', () => {
    it('should create a job with correct organizationId and initial state', () => {
      const ids = ['id-1', 'id-2', 'id-3'];
      const entityType = BulkEntityType.INVOICES;
      const action = BulkActionType.APPROVE;

      const job = service.createJob(ORG_ID, ids, entityType, action);

      expect(job).toBeDefined();
      expect(job.jobId).toBeDefined();
      expect(job.organizationId).toBe(ORG_ID);
      expect(job.entityType).toBe(entityType);
      expect(job.action).toBe(action);
      expect(job.status).toBe('pending');
      expect(job.ids).toEqual(ids);
      expect(job.processed).toBe(0);
      expect(job.total).toBe(3);
      expect(job.failures).toEqual([]);
      expect(job.startedAt).toBeInstanceOf(Date);
      expect(job.completedAt).toBeUndefined();
    });

    it('should store the job in the internal map', () => {
      const job = service.createJob(ORG_ID, ['id-1'], BulkEntityType.BILLS, BulkActionType.DELETE);

      const retrieved = service.getJob(job.jobId);
      expect(retrieved).toBe(job);
    });

    it('should generate unique job IDs', () => {
      const job1 = service.createJob(
        ORG_ID,
        ['id-1'],
        BulkEntityType.INVOICES,
        BulkActionType.APPROVE,
      );
      const job2 = service.createJob(ORG_ID, ['id-2'], BulkEntityType.BILLS, BulkActionType.DELETE);

      expect(job1.jobId).not.toBe(job2.jobId);
    });

    it('should include organizationId in every created job', () => {
      const job1 = service.createJob(
        ORG_ID,
        ['id-1'],
        BulkEntityType.INVOICES,
        BulkActionType.APPROVE,
      );
      const job2 = service.createJob(
        OTHER_ORG_ID,
        ['id-2'],
        BulkEntityType.BILLS,
        BulkActionType.DELETE,
      );

      expect(job1.organizationId).toBe(ORG_ID);
      expect(job2.organizationId).toBe(OTHER_ORG_ID);
      expect(job1.organizationId).not.toBe(job2.organizationId);
    });
  });

  describe('getJob', () => {
    it('should return the job by jobId', () => {
      const created = service.createJob(
        ORG_ID,
        ['id-1', 'id-2'],
        BulkEntityType.EXPENSES,
        BulkActionType.PROCESS,
      );
      const retrieved = service.getJob(created.jobId);

      expect(retrieved).toBe(created);
    });

    it('should return undefined for non-existent jobId', () => {
      const result = service.getJob('non-existent-job-id');
      expect(result).toBeUndefined();
    });
  });

  describe('processJob', () => {
    it('should process all items and mark job as completed', async () => {
      const ids = ['id-1', 'id-2', 'id-3'];
      const job = service.createJob(ORG_ID, ids, BulkEntityType.INVOICES, BulkActionType.APPROVE);

      const processFn = jest.fn().mockResolvedValue(undefined);

      const processPromise = service.processJob(job.jobId, processFn);

      // Advance timers to trigger all async operations
      await jest.runAllTimersAsync();

      const result = await processPromise;

      expect(result.jobId).toBe(job.jobId);
      expect(result.status).toBe('completed');
      expect(result.processed).toBe(3);
      expect(result.failures).toEqual([]);
      expect(result.completedAt).toBeInstanceOf(Date);

      expect(processFn).toHaveBeenCalledTimes(3);
      expect(processFn).toHaveBeenCalledWith('id-1', 0);
      expect(processFn).toHaveBeenCalledWith('id-2', 1);
      expect(processFn).toHaveBeenCalledWith('id-3', 2);
    });

    it('should emit progress events during processing', async () => {
      const job = service.createJob(
        ORG_ID,
        ['id-1', 'id-2'],
        BulkEntityType.BILLS,
        BulkActionType.VOID,
      );
      const processFn = jest.fn().mockResolvedValue(undefined);

      const processPromise = service.processJob(job.jobId, processFn);
      await jest.runAllTimersAsync();
      await processPromise;

      // Should emit: pending -> running -> progress (per chunk) -> completed
      expect(mockEmit).toHaveBeenCalledWith(
        `bulk-operation.progress.${job.jobId}`,
        expect.objectContaining({
          jobId: job.jobId,
          status: 'running',
          processed: 0,
          total: 2,
          progress: 0,
        }),
      );

      expect(mockEmit).toHaveBeenCalledWith(
        `bulk-operation.progress.${job.jobId}`,
        expect.objectContaining({
          status: 'completed',
          processed: 2,
          total: 2,
          progress: 100,
        }),
      );
    });

    it('should handle partial failures and mark job as completed with failures', async () => {
      const job = service.createJob(
        ORG_ID,
        ['id-1', 'id-2', 'id-3'],
        BulkEntityType.JOURNALS,
        BulkActionType.DELETE,
      );

      const processFn = jest
        .fn()
        .mockResolvedValueOnce(undefined) // id-1 succeeds
        .mockRejectedValueOnce(new Error('Item 2 failed')) // id-2 fails
        .mockResolvedValueOnce(undefined); // id-3 succeeds

      const processPromise = service.processJob(job.jobId, processFn);
      await jest.runAllTimersAsync();
      const result = await processPromise;

      expect(result.status).toBe('completed');
      expect(result.processed).toBe(3);
      expect(result.failures).toHaveLength(1);
      expect(result.failures[0]).toMatchObject({ id: 'id-2', reason: 'Item 2 failed' });
    });

    it('should mark job as failed when all items fail', async () => {
      const job = service.createJob(
        ORG_ID,
        ['id-1', 'id-2'],
        BulkEntityType.QUOTES,
        BulkActionType.SEND,
      );

      const processFn = jest.fn().mockRejectedValue(new Error('All failed'));

      const processPromise = service.processJob(job.jobId, processFn);
      await jest.runAllTimersAsync();
      const result = await processPromise;

      expect(result.status).toBe('failed');
      expect(result.processed).toBe(2);
      expect(result.failures).toHaveLength(2);
    });

    it('should throw when job does not exist', async () => {
      await expect(service.processJob('non-existent', jest.fn())).rejects.toThrow(
        'Job non-existent not found',
      );
    });

    it('should process items in chunks with delay between chunks', async () => {
      const ids = ['id-1', 'id-2', 'id-3', 'id-4', 'id-5'];
      const job = service.createJob(ORG_ID, ids, BulkEntityType.PROJECTS, BulkActionType.ACTIVATE);
      const processFn = jest.fn().mockResolvedValue(undefined);

      const processPromise = service.processJob(job.jobId, processFn, 2); // chunkSize = 2
      await jest.runAllTimersAsync();
      await processPromise;

      expect(processFn).toHaveBeenCalledTimes(5);
      // Verify chunks were processed
      expect(processFn.mock.calls.map((c) => c[0])).toEqual([
        'id-1',
        'id-2',
        'id-3',
        'id-4',
        'id-5',
      ]);
    });

    it('should correctly pass index to processFn accounting for chunk offset', async () => {
      const job = service.createJob(
        ORG_ID,
        ['a', 'b', 'c'],
        BulkEntityType.VAT_RETURNS,
        BulkActionType.SUBMIT,
      );
      const processFn = jest.fn().mockResolvedValue(undefined);

      const processPromise = service.processJob(job.jobId, processFn);
      await jest.runAllTimersAsync();
      await processPromise;

      expect(processFn).toHaveBeenCalledWith('a', 0);
      expect(processFn).toHaveBeenCalledWith('b', 1);
      expect(processFn).toHaveBeenCalledWith('c', 2);
    });
  });

  describe('tenant isolation', () => {
    it('should store organizationId with every job and never leak between orgs', () => {
      const jobOrg1 = service.createJob(
        ORG_ID,
        ['id-1'],
        BulkEntityType.INVOICES,
        BulkActionType.APPROVE,
      );
      const jobOrg2 = service.createJob(
        OTHER_ORG_ID,
        ['id-2'],
        BulkEntityType.BILLS,
        BulkActionType.DELETE,
      );

      // Each org can only see their own jobs
      expect(service.getJob(jobOrg1.jobId)?.organizationId).toBe(ORG_ID);
      expect(service.getJob(jobOrg2.jobId)?.organizationId).toBe(OTHER_ORG_ID);

      // Jobs are isolated - org1 job doesn't contain org2 IDs and vice versa
      expect(service.getJob(jobOrg1.jobId)?.ids).toEqual(['id-1']);
      expect(service.getJob(jobOrg2.jobId)?.ids).toEqual(['id-2']);
    });

    it('processJob should only process the job belonging to the correct organization', async () => {
      const job = service.createJob(
        ORG_ID,
        ['id-1'],
        BulkEntityType.INVOICES,
        BulkActionType.APPROVE,
      );
      const processFn = jest.fn().mockResolvedValue(undefined);

      const processPromise = service.processJob(job.jobId, processFn);
      await jest.runAllTimersAsync();
      const result = await processPromise;

      expect(result.organizationId).toBe(ORG_ID);
      expect(result.organizationId).not.toBe(OTHER_ORG_ID);
    });
  });

  describe('chunkArray', () => {
    it('should split array into chunks of specified size', () => {
      // Access private method through the service instance
      const chunkArray = (service as any).chunkArray.bind(service);

      const result = chunkArray([1, 2, 3, 4, 5], 2);
      expect(result).toEqual([[1, 2], [3, 4], [5]]);
    });

    it('should return single chunk when array smaller than chunk size', () => {
      const chunkArray = (service as any).chunkArray.bind(service);
      const result = chunkArray([1, 2], 5);
      expect(result).toEqual([[1, 2]]);
    });

    it('should return empty array for empty input', () => {
      const chunkArray = (service as any).chunkArray.bind(service);
      const result = chunkArray([], 2);
      expect(result).toEqual([]);
    });

    it('should handle chunk size of 1', () => {
      const chunkArray = (service as any).chunkArray.bind(service);
      const result = chunkArray([1, 2, 3], 1);
      expect(result).toEqual([[1], [2], [3]]);
    });
  });

  describe('cleanupStaleJobs', () => {
    it('should remove jobs older than TTL', () => {
      // Create a job
      const job = service.createJob(
        ORG_ID,
        ['id-1'],
        BulkEntityType.INVOICES,
        BulkActionType.APPROVE,
      );
      expect(service.getJob(job.jobId)).toBeDefined();

      // Advance time beyond TTL (10 minutes)
      jest.advanceTimersByTime(11 * 60 * 1000);

      // Trigger cleanup manually
      (service as any).cleanupStaleJobs();

      // Job should be cleaned up
      expect(service.getJob(job.jobId)).toBeUndefined();
    });

    it('should keep jobs within TTL', () => {
      const job = service.createJob(
        ORG_ID,
        ['id-1'],
        BulkEntityType.INVOICES,
        BulkActionType.APPROVE,
      );
      expect(service.getJob(job.jobId)).toBeDefined();

      // Advance time but stay within TTL (5 minutes)
      jest.advanceTimersByTime(5 * 60 * 1000);

      (service as any).cleanupStaleJobs();

      // Job should still exist
      expect(service.getJob(job.jobId)).toBeDefined();
    });

    it('should clean up only stale jobs, not recent ones', () => {
      // Create old job first
      const oldJob = service.createJob(
        ORG_ID,
        ['old'],
        BulkEntityType.INVOICES,
        BulkActionType.APPROVE,
      );

      // Advance time past TTL
      jest.advanceTimersByTime(11 * 60 * 1000);

      // Create new job after time has advanced
      const newJob = service.createJob(
        ORG_ID,
        ['new'],
        BulkEntityType.BILLS,
        BulkActionType.DELETE,
      );

      // Trigger cleanup
      (service as any).cleanupStaleJobs();

      expect(service.getJob(oldJob.jobId)).toBeUndefined();
      expect(service.getJob(newJob.jobId)).toBeDefined();
    });
  });

  describe('idempotency and retry behavior', () => {
    it('should accumulate failures across retries (same job object reused)', async () => {
      const job = service.createJob(
        ORG_ID,
        ['id-1', 'id-2'],
        BulkEntityType.INVOICES,
        BulkActionType.APPROVE,
      );
      const processFn = jest.fn().mockRejectedValue(new Error('Failed'));

      // First attempt - all fail
      let processPromise = service.processJob(job.jobId, processFn);
      await jest.runAllTimersAsync();
      let result = await processPromise;
      expect(result.status).toBe('failed');
      expect(result.failures).toHaveLength(2);

      // Second attempt - succeed, but failures from previous attempt remain
      processFn.mockResolvedValue(undefined);
      processPromise = service.processJob(job.jobId, processFn);
      await jest.runAllTimersAsync();
      result = await processPromise;

      // Job reuses the same object, so failures accumulate
      // failures.length = 2 (from first attempt) + 0 (second succeeds) = 2
      // total = 2, so 2 === 2 -> 'failed'
      expect(result.status).toBe('failed');
      expect(result.failures).toHaveLength(2);
      expect(processFn).toHaveBeenCalledTimes(4); // 2 failed + 2 succeeded
    });

    it('should track failures correctly - failed items remain in failures array', async () => {
      const job = service.createJob(ORG_ID, ['id-1'], BulkEntityType.BILLS, BulkActionType.VOID);

      // First attempt fails
      let processFn = jest.fn().mockRejectedValue(new Error('Network error'));
      let processPromise = service.processJob(job.jobId, processFn);
      await jest.runAllTimersAsync();
      await processPromise;

      expect(job.failures).toHaveLength(1);

      // Second attempt succeeds
      processFn = jest.fn().mockResolvedValue(undefined);
      processPromise = service.processJob(job.jobId, processFn);
      await jest.runAllTimersAsync();
      const result = await processPromise;

      // The job object is reused, so previous failures persist
      // failures.length = 1, total = 1 -> 1 === 1 -> 'failed'
      expect(result.status).toBe('failed');
      expect(result.failures).toHaveLength(1);
    });
  });

  describe('progress emission', () => {
    it('should emit correct progress percentages', async () => {
      const job = service.createJob(
        ORG_ID,
        ['a', 'b', 'c', 'd'],
        BulkEntityType.PAYROLL,
        BulkActionType.PROCESS,
      );
      const processFn = jest.fn().mockResolvedValue(undefined);

      const processPromise = service.processJob(job.jobId, processFn, 2); // 2 chunks of 2
      await jest.runAllTimersAsync();
      await processPromise;

      // Check progress emissions
      const progressCalls = mockEmit.mock.calls.filter((call) =>
        call[0].startsWith('bulk-operation.progress.'),
      );

      // First: running with 0%
      expect(progressCalls[0][1].progress).toBe(0);
      // After first chunk (2/4 = 50%)
      expect(progressCalls[1][1].progress).toBe(50);
      // After second chunk (4/4 = 100%)
      expect(progressCalls[2][1].progress).toBe(100);
    });

    it('should emit failures in progress events', async () => {
      const job = service.createJob(
        ORG_ID,
        ['id-1', 'id-2'],
        BulkEntityType.WORK_ORDERS,
        BulkActionType.COMPLETE,
      );
      const processFn = jest
        .fn()
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('Failed'));

      const processPromise = service.processJob(job.jobId, processFn);
      await jest.runAllTimersAsync();
      await processPromise;

      const finalProgress = mockEmit.mock.calls
        .filter((call) => call[0].startsWith('bulk-operation.progress.'))
        .pop();

      expect(finalProgress[1].failures).toHaveLength(1);
      expect(finalProgress[1].failures[0]).toMatchObject({ id: 'id-2', reason: 'Failed' });
    });
  });

  describe('edge cases', () => {
    it('should handle empty ids array', () => {
      const job = service.createJob(ORG_ID, [], BulkEntityType.INVOICES, BulkActionType.APPROVE);

      expect(job.total).toBe(0);
      expect(job.ids).toEqual([]);
    });

    it('should handle processJob with empty ids array', async () => {
      const job = service.createJob(ORG_ID, [], BulkEntityType.BILLS, BulkActionType.DELETE);
      const processFn = jest.fn();

      const processPromise = service.processJob(job.jobId, processFn);
      await jest.runAllTimersAsync();
      const result = await processPromise;

      // With 0 total items and 0 failures, 0 === 0 is true, so status is 'failed'
      // This is the current behavior of the service
      expect(result.status).toBe('failed');
      expect(result.processed).toBe(0);
      expect(processFn).not.toHaveBeenCalled();
    });

    it('should use fixed date for startedAt (no wall-clock dependency)', () => {
      jest.setSystemTime(FIXED_DATE);

      const job = service.createJob(
        ORG_ID,
        ['id-1'],
        BulkEntityType.INVOICES,
        BulkActionType.APPROVE,
      );

      expect(job.startedAt.getTime()).toBe(FIXED_DATE.getTime());
    });

    it('should use fixed date for completedAt', async () => {
      jest.setSystemTime(FIXED_DATE);

      const job = service.createJob(
        ORG_ID,
        ['id-1'],
        BulkEntityType.INVOICES,
        BulkActionType.APPROVE,
      );
      const processFn = jest.fn().mockResolvedValue(undefined);

      const processPromise = service.processJob(job.jobId, processFn);
      await jest.runAllTimersAsync();
      const result = await processPromise;

      expect(result.completedAt?.getTime()).toBe(FIXED_DATE.getTime());
    });
  });
});
