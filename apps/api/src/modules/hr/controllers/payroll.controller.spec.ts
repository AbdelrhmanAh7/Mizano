import { INTERCEPTORS_METADATA } from '@nestjs/common/constants';
import { INVALIDATE_CACHE_KEY } from '../../../common/decorators/invalidate-cache.decorator';
import { CacheInvalidationInterceptor } from '../../../common/interceptors/cache-invalidation.interceptor';
import { PayrollController } from './payroll.controller';

describe('PayrollController ledger cache invalidation', () => {
  it('invalidates ledger caches after payroll is marked paid', () => {
    const patterns = Reflect.getMetadata(
      INVALIDATE_CACHE_KEY,
      PayrollController.prototype.markAsPaid,
    );
    expect(patterns).toEqual(expect.arrayContaining(['payroll:*', 'reports:*', 'dashboard:*']));
  });

  it('registers the cache invalidation interceptor', () => {
    expect(Reflect.getMetadata(INTERCEPTORS_METADATA, PayrollController)).toContain(
      CacheInvalidationInterceptor,
    );
  });
});
