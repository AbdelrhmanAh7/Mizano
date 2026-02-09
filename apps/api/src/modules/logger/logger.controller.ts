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
} from '@nestjs/common';
import {
  IsString,
  IsOptional,
  IsArray,
  IsEnum,
  IsNumber,
  IsObject,
} from 'class-validator';
import { Type } from 'class-transformer';
import { LoggerService } from './logger.service';
import {
  LogLevel,
  LogSource,
  LogCategory,
  LogStatus,
  LogFilter,
} from '@mizano/shared-types';

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
  context?: Record<string, any>;

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
  @IsString()
  before?: string;
}

class GeneratePromptDto {
  @IsArray()
  @IsString({ each: true })
  logIds: string[];
}

@Controller('logger')
export class LoggerController {
  constructor(private readonly loggerService: LoggerService) {}

  @Post('capture')
  @HttpCode(HttpStatus.CREATED)
  capture(@Body() dto: CaptureLogDto) {
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
    });
  }

  @Get('logs')
  getLogs(
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

    return this.loggerService.getLogs(filter);
  }

  @Get('stats')
  getStats() {
    return this.loggerService.getStats();
  }

  @Get('logs/:id')
  getById(@Param('id') id: string) {
    return this.loggerService.getById(id);
  }

  @Post('update-status')
  @HttpCode(HttpStatus.OK)
  updateStatus(@Body() dto: UpdateStatusDto) {
    const updated = this.loggerService.updateStatus(dto.ids, dto.status);
    return { updated };
  }

  @Delete('clear')
  @HttpCode(HttpStatus.OK)
  clearLogs(@Body() dto?: ClearLogsDto) {
    const removed = this.loggerService.clearLogs(dto);
    return { removed };
  }

  @Post('generate-prompt')
  @HttpCode(HttpStatus.OK)
  generatePrompt(@Body() dto: GeneratePromptDto) {
    return this.loggerService.generatePrompt(dto.logIds);
  }
}
