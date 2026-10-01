import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Query,
  Param,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  IsString,
  IsOptional,
  IsArray,
  IsDateString,
  IsEnum,
  IsNumber,
  IsObject,
  IsBoolean,
} from 'class-validator';
import { Type } from 'class-transformer';
import { LoggerService } from './logger.service';
import { LogLevel, LogSource, LogCategory, LogStatus, LogFilter } from '@mizano/shared-types';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OrganizationGuard } from '../../common/guards/organization.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { CurrentOrg } from '../../common/decorators/current-org.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';

/**
 * Capture is a lenient reporting channel (browsers send whatever they caught), so field
 * sizes are not rejected here: LoggerService truncates and redacts everything it stores.
 */
class CaptureLogDto {
  @IsEnum(LogLevel)
  level: LogLevel;

  @IsEnum(LogSource)
  source: LogSource;

  @IsString()
  message: string;

  @IsOptional()
  @IsString()
  stack?: string;

  @IsOptional()
  @IsObject()
  context?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  url?: string;

  @IsOptional()
  @IsString()
  method?: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  statusCode?: number;

  @IsOptional()
  @IsString()
  userAgent?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  filePaths?: string[];

  @IsOptional()
  @IsEnum(LogCategory)
  category?: LogCategory;
}

class UpdateStatusDto {
  @IsArray()
  @IsString({ each: true })
  ids: string[];

  @IsEnum(LogStatus)
  status: LogStatus;
}

class ClearLogsDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  ids?: string[];

  @IsOptional()
  @IsEnum(LogStatus)
  status?: LogStatus;

  @IsOptional()
  @IsDateString()
  before?: string;
}

class GeneratePromptDto {
  @IsArray()
  @IsString({ each: true })
  logIds: string[];

  @IsOptional()
  @IsBoolean()
  includeStacks?: boolean;

  @IsOptional()
  @IsBoolean()
  includeContext?: boolean;
}

/**
 * Error-log endpoints.
 *
 * - Everything requires a valid JWT (JwtAuthGuard) and an organization (OrganizationGuard).
 * - Reading and managing logs is admin-level: `settings.edit` (held by the Admin role, not by
 *   Manager, who only has `settings.view`) and `settings.delete` for clearing. These are
 *   existing permission names; no new permission was invented.
 * - Every read and delete is scoped to the caller's organization (see LoggerService).
 * - `POST /logger/capture` only needs authentication, because every signed-in browser
 *   reports its own frontend errors; the stored entry is tagged with the caller's
 *   organization/user from the token, never from the body.
 * - The whole controller is rate limited tighter than the global default.
 */
@Controller('logger')
@UseGuards(JwtAuthGuard, OrganizationGuard, PermissionsGuard)
@Throttle({ short: { ttl: 1000, limit: 5 }, long: { ttl: 60_000, limit: 60 } })
export class LoggerController {
  constructor(private readonly loggerService: LoggerService) {}

  @Post('capture')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ short: { ttl: 1000, limit: 2 }, long: { ttl: 60_000, limit: 20 } })
  capture(
    @CurrentOrg() organizationId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: CaptureLogDto,
  ) {
    return this.loggerService.capture({
      level: dto.level,
      source: dto.source,
      message: dto.message,
      stack: dto.stack,
      context: dto.context,
      url: dto.url,
      method: dto.method,
      statusCode: dto.statusCode,
      userAgent: dto.userAgent,
      filePaths: dto.filePaths,
      organizationId,
      userId,
    });
  }

  @Get('logs')
  @Permissions('settings.edit')
  getLogs(
    @CurrentOrg() organizationId: string,
    @Query('levels') levels?: string,
    @Query('sources') sources?: string,
    @Query('categories') categories?: string,
    @Query('statuses') statuses?: string,
    @Query('search') search?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const filter: LogFilter = {};
    if (levels) filter.levels = levels.split(',') as LogLevel[];
    if (sources) filter.sources = sources.split(',') as LogSource[];
    if (categories) filter.categories = categories.split(',') as LogCategory[];
    if (statuses) filter.statuses = statuses.split(',') as LogStatus[];
    if (search) filter.search = search;
    if (from) filter.from = from;
    if (to) filter.to = to;

    return this.loggerService.getLogs(organizationId, filter);
  }

  @Get('stats')
  @Permissions('settings.edit')
  getStats(@CurrentOrg() organizationId: string) {
    return this.loggerService.getStats(organizationId);
  }

  @Get('logs/:id')
  @Permissions('settings.edit')
  getById(@CurrentOrg() organizationId: string, @Param('id') id: string) {
    return this.loggerService.getById(organizationId, id);
  }

  @Post('update-status')
  @Permissions('settings.edit')
  @HttpCode(HttpStatus.OK)
  updateStatus(@CurrentOrg() organizationId: string, @Body() dto: UpdateStatusDto) {
    const updated = this.loggerService.updateStatus(organizationId, dto.ids, dto.status);
    return { updated };
  }

  @Delete('clear')
  @Permissions('settings.delete')
  @HttpCode(HttpStatus.OK)
  clearLogs(@CurrentOrg() organizationId: string, @Body() dto?: ClearLogsDto) {
    const removed = this.loggerService.clearLogs(organizationId, dto);
    return { removed };
  }

  @Post('generate-prompt')
  @Permissions('settings.edit')
  @HttpCode(HttpStatus.OK)
  generatePrompt(@CurrentOrg() organizationId: string, @Body() dto: GeneratePromptDto) {
    return this.loggerService.generatePrompt(organizationId, dto.logIds, {
      includeStacks: dto.includeStacks,
      includeContext: dto.includeContext,
    });
  }
}
