import { EventEmitter2 } from '@nestjs/event-emitter';
import { BulkOperationsService } from './bulk-operations.service';

describe('bulk cleanup timer lifecycle', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('does not keep the process alive and clears its interval on shutdown', () => {
    const intervals = jest.spyOn(global, 'setInterval');
    const service = new BulkOperationsService(new EventEmitter2());
    const timer = intervals.mock.results[0].value as NodeJS.Timeout;
    expect(timer.hasRef()).toBe(false);
    expect(jest.getTimerCount()).toBe(1);
    service.onModuleDestroy();
    service.onModuleDestroy();
    expect(jest.getTimerCount()).toBe(0);
    intervals.mockRestore();
  });

  it('does not retain timers across application restarts', () => {
    const first = new BulkOperationsService(new EventEmitter2());
    first.onModuleDestroy();
    const second = new BulkOperationsService(new EventEmitter2());
    expect(jest.getTimerCount()).toBe(1);
    second.onModuleDestroy();
    expect(jest.getTimerCount()).toBe(0);
  });
});
