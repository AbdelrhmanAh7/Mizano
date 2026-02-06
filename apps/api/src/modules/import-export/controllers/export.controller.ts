import {
  Controller,
  Get,
  Param,
  Query,
  Res,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { Response } from 'express';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { ExportService } from '../services/export.service';
import { ImportEntityType, ExportFormat, ExportQueryDto } from '../dto/import-export.dto';
import { CurrentOrg } from '../../../common/decorators/current-org.decorator';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';

@ApiTags('Export')
@ApiBearerAuth()
@Controller('export')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ExportController {
  constructor(private readonly exportService: ExportService) {}

  @Get(':entityType')
  @Permissions('settings.view')
  @ApiOperation({ summary: 'Export data for an entity type' })
  @ApiParam({ name: 'entityType', enum: ImportEntityType })
  @ApiQuery({ name: 'format', enum: ExportFormat, required: false })
  @ApiQuery({ name: 'dateFrom', required: false, description: 'Filter from date (YYYY-MM-DD)' })
  @ApiQuery({ name: 'dateTo', required: false, description: 'Filter to date (YYYY-MM-DD)' })
  @ApiQuery({ name: 'fields', required: false, description: 'Comma-separated list of fields to export' })
  @ApiQuery({ name: 'includeDeleted', required: false, description: 'Include soft-deleted records' })
  @ApiResponse({ status: 200, description: 'Export file' })
  async exportData(
    @Res() res: Response,
    @CurrentOrg() orgId: string,
    @Param('entityType') entityType: ImportEntityType,
    @Query('format') format: ExportFormat = ExportFormat.CSV,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('fields') fields?: string,
    @Query('includeDeleted') includeDeleted?: string,
  ): Promise<void> {
    if (!Object.values(ImportEntityType).includes(entityType)) {
      throw new BadRequestException('Invalid entity type');
    }

    if (format && !Object.values(ExportFormat).includes(format)) {
      throw new BadRequestException('Invalid export format');
    }

    const result = await this.exportService.exportData(orgId, entityType, {
      format,
      dateFrom: dateFrom ? new Date(dateFrom) : undefined,
      dateTo: dateTo ? new Date(dateTo) : undefined,
      fields: fields ? fields.split(',').map((f) => f.trim()) : undefined,
      includeDeleted: includeDeleted === 'true',
    });

    res.set({
      'Content-Type': result.contentType,
      'Content-Disposition': `attachment; filename="${result.filename}"`,
      'Content-Length': result.buffer.length,
    });

    res.send(result.buffer);
  }

  @Get('template/:entityType')
  @Permissions('settings.view')
  @ApiOperation({ summary: 'Download import template for an entity type' })
  @ApiParam({ name: 'entityType', enum: ImportEntityType })
  @ApiQuery({ name: 'format', enum: ExportFormat, required: false })
  @ApiResponse({ status: 200, description: 'Template file' })
  async downloadTemplate(
    @Param('entityType') entityType: ImportEntityType,
    @Query('format') format: ExportFormat = ExportFormat.XLSX,
    @Res() res: Response,
  ): Promise<void> {
    if (!Object.values(ImportEntityType).includes(entityType)) {
      throw new BadRequestException('Invalid entity type');
    }

    const result = await this.exportService.generateImportTemplate(entityType, format);

    res.set({
      'Content-Type': result.contentType,
      'Content-Disposition': `attachment; filename="${result.filename}"`,
      'Content-Length': result.buffer.length,
    });

    res.send(result.buffer);
  }
}
