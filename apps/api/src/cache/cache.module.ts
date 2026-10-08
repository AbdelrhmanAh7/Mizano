import { CacheModule as NestCacheModule } from '@nestjs/cache-manager';
import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { redisStore } from 'cache-manager-redis-yet';
import { CacheAdminController } from './cache-admin.controller';
import { CacheInvalidationListener } from './cache-invalidation.listener';
import { CacheService } from './cache.service';
import { redisUrlFromConfig } from './redis-url';

@Global()
@Module({
  imports: [
    NestCacheModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (config: ConfigService) => {
        const redisUrl = redisUrlFromConfig(config);

        if (!redisUrl) {
          // Fallback to in-memory cache if Redis URL is not provided
          return {
            ttl: 300 * 1000, // 5 minutes default TTL
            max: 1000, // Maximum number of items in cache
          };
        }

        return {
          store: redisStore,
          url: redisUrl,
          ttl: 300 * 1000, // 5 minutes default TTL
        };
      },
    }),
  ],
  controllers: [CacheAdminController],
  providers: [CacheService, CacheInvalidationListener],
  exports: [NestCacheModule, CacheService],
})
export class CacheModule {}
