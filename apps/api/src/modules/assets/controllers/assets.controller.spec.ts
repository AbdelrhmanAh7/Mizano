import { INTERCEPTORS_METADATA } from '@nestjs/common/constants';
import { INVALIDATE_CACHE_KEY } from '../../../common/decorators/invalidate-cache.decorator';
import { CacheInvalidationInterceptor } from '../../../common/interceptors/cache-invalidation.interceptor';
import { AssetsController } from './assets.controller';

describe('AssetsController ledger cache invalidation', () => {
  it.each([
    'dispose',
    'runAssetDepreciation',
    'runMonthlyDepreciation',
    'reverseDepreciation',
  ] as const)('%s invalidates ledger and asset caches', (handler) => {
    const patterns = Reflect.getMetadata(INVALIDATE_CACHE_KEY, AssetsController.prototype[handler]);
    expect(patterns).toEqual(expect.arrayContaining(['assets:*', 'reports:*', 'dashboard:*']));
  });

  it('registers the cache invalidation interceptor', () => {
    expect(Reflect.getMetadata(INTERCEPTORS_METADATA, AssetsController)).toContain(
      CacheInvalidationInterceptor,
    );
  });
});
