import { Module, Global } from '@nestjs/common';
import { CacheModule as NestCacheModule } from '@nestjs/cache-manager';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { redisStore } from 'cache-manager-redis-yet';
import { CacheService } from './cache.service';

@Global()
@Module({
  imports: [
    NestCacheModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (config: ConfigService) => {
        const redisUrl = config.get<string>('REDIS_URL');

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
  providers: [CacheService],
  exports: [NestCacheModule, CacheService],
})
export class CacheModule {}
