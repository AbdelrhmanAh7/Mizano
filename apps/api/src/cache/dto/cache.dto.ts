import { ApiProperty } from '@nestjs/swagger';

export class CacheStatsResponseDto {
  @ApiProperty({ enum: ['redis', 'memory'], description: 'Cache backend type' })
  storeType!: 'redis' | 'memory';

  @ApiProperty({ description: 'Whether the cache backend is connected' })
  connected!: boolean;

  @ApiProperty({ description: 'Total number of keys in the cache store' })
  keyCount!: number;

  @ApiProperty({ description: 'Memory usage of the cache (e.g. "1.23M")' })
  memoryUsage!: string;

  @ApiProperty({ description: 'Cache server uptime in seconds' })
  uptime!: number;

  @ApiProperty({ description: 'Cache hit rate as a percentage (0-100)' })
  hitRate!: number;
}

export class CacheKeyInfoDto {
  @ApiProperty({ description: 'Full Redis key' })
  key!: string;

  @ApiProperty({ description: 'Remaining TTL in seconds (-1 = no expiry, -2 = expired)' })
  ttl!: number;
}

export class CacheKeysResponseDto {
  @ApiProperty({ type: [CacheKeyInfoDto], description: 'List of cache keys' })
  keys!: CacheKeyInfoDto[];

  @ApiProperty({ description: 'Cursor for next page of SCAN results ("0" means no more)' })
  nextCursor!: string;
}

export class FlushCacheResponseDto {
  @ApiProperty({ description: 'Whether the flush operation succeeded' })
  success!: boolean;

  @ApiProperty({ description: 'Number of keys removed' })
  keysRemoved!: number;
}

export class DeletePatternResponseDto {
  @ApiProperty({ description: 'Whether the deletion succeeded' })
  success!: boolean;

  @ApiProperty({ description: 'Number of keys deleted' })
  keysDeleted!: number;

  @ApiProperty({ description: 'Pattern that was deleted' })
  pattern!: string;
}
