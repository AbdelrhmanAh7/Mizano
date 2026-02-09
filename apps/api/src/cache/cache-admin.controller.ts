import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CurrentOrg, Permissions } from '../common/decorators';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { CacheService } from './cache.service';
import {
  CacheKeysResponseDto,
  CacheStatsResponseDto,
  DeletePatternResponseDto,
  FlushCacheResponseDto,
} from './dto/cache.dto';

@ApiTags('Cache Admin')
@ApiBearerAuth()
@Controller('cache')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CacheAdminController {
  constructor(private readonly cacheService: CacheService) {}

  @Get('stats')
  @Permissions('settings.view')
  @ApiOperation({ summary: 'Get cache statistics (type, connection, key count, memory, hit rate)' })
  async getStats(): Promise<CacheStatsResponseDto> {
    return this.cacheService.getStats();
  }

  @Get('keys')
  @Permissions('settings.view')
  @ApiOperation({ summary: 'List cache keys for the current organization' })
  @ApiQuery({ name: 'cursor', required: false, description: 'SCAN cursor for pagination' })
  @ApiQuery({ name: 'count', required: false, description: 'Max keys to return per page' })
  async getKeys(
    @CurrentOrg() orgId: string,
    @Query('cursor') cursor?: string,
    @Query('count') count?: string,
  ): Promise<CacheKeysResponseDto> {
    return this.cacheService.getKeys(orgId, cursor || '0', count ? parseInt(count, 10) : 100);
  }

  @Delete('flush')
  @Permissions('settings.view')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Flush all cache for the current organization' })
  async flush(@CurrentOrg() orgId: string): Promise<FlushCacheResponseDto> {
    const keysRemoved = await this.cacheService.clearOrganization(orgId);
    return { success: true, keysRemoved };
  }

  @Delete('keys/:pattern')
  @Permissions('settings.view')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete cache keys matching a pattern for the current organization' })
  async deletePattern(
    @CurrentOrg() orgId: string,
    @Param('pattern') pattern: string,
  ): Promise<DeletePatternResponseDto> {
    const keysDeleted = await this.cacheService.deletePattern(pattern, orgId);
    return { success: true, keysDeleted, pattern };
  }
}
