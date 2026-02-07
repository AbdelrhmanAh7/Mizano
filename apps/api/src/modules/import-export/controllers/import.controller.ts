import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiConsumes,
  ApiBody,
  ApiParam,
} from '@nestjs/swagger';
import { ImportService } from '../services/import.service';
import {
  ImportConfigDto,
  ImportEntityType,
  ParseFileResultDto,
  ValidationResultDto,
  ImportResultDto,
  ENTITY_FIELD_DEFINITIONS,
} from '../dto/import-export.dto';
import { CurrentOrg } from '../../../common/decorators/current-org.decorator';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';

@ApiTags('Import')
@ApiBearerAuth()
@Controller('import')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ImportController {
  constructor(private readonly importService: ImportService) {}

  @Get('entity-types')
  @Permissions('settings.view')
  @ApiOperation({ summary: 'Get available entity types for import' })
  @ApiResponse({ status: 200, description: 'List of available entity types' })
  getEntityTypes(): string[] {
    return this.importService.getAvailableEntityTypes();
  }

  @Get('fields/:entityType')
  @Permissions('settings.view')
  @ApiOperation({ summary: 'Get field definitions for an entity type' })
  @ApiParam({ name: 'entityType', enum: ImportEntityType })
  @ApiResponse({ status: 200, description: 'Field definitions' })
  getFieldDefinitions(@Param('entityType') entityType: ImportEntityType) {
    if (!Object.values(ImportEntityType).includes(entityType)) {
      throw new BadRequestException('Invalid entity type');
    }
    return {
      entityType,
      fields: this.importService.getFieldDefinitions(entityType),
    };
  }

  @Post('parse')
  @Permissions('settings.manage')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Parse uploaded file and return headers/preview' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'CSV or Excel file to parse',
        },
      },
    },
  })
  @ApiResponse({ status: 200, type: ParseFileResultDto })
  async parseFile(
    @UploadedFile() file: Express.Multer.File,
  ): Promise<ParseFileResultDto> {
    if (!file) {
      throw new BadRequestException('File is required');
    }

    const allowedMimes = [
      'text/csv',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/x-ofx',
      'application/ofx',
      'text/ofx',
    ];

    // Check by MIME type or file extension (OFX MIME types are unreliable)
    const extension = file.originalname?.toLowerCase().split('.').pop();
    const isAllowedByExtension = ['csv', 'xlsx', 'xls', 'ofx', 'qfx'].includes(extension || '');

    if (!allowedMimes.includes(file.mimetype) && !isAllowedByExtension) {
      throw new BadRequestException('Only CSV, Excel, and OFX/QFX files are allowed');
    }

    return this.importService.parseFile(file.buffer, file.originalname);
  }

  @Post('validate')
  @Permissions('settings.manage')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Validate import data without importing' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
        config: {
          type: 'string',
          description: 'JSON string of ImportConfigDto',
        },
      },
    },
  })
  @ApiResponse({ status: 200, type: ValidationResultDto })
  async validateImport(
    @CurrentOrg() orgId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('config') configJson: string,
  ): Promise<ValidationResultDto> {
    if (!file) {
      throw new BadRequestException('File is required');
    }

    if (!configJson) {
      throw new BadRequestException('Config is required');
    }

    const config: ImportConfigDto = JSON.parse(configJson);
    return this.importService.validateImport(orgId, file.buffer, file.originalname, config);
  }

  @Post('execute')
  @Permissions('settings.manage')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Execute import' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
        config: {
          type: 'string',
          description: 'JSON string of ImportConfigDto',
        },
      },
    },
  })
  @ApiResponse({ status: 200, type: ImportResultDto })
  async executeImport(
    @CurrentOrg() orgId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('config') configJson: string,
  ): Promise<ImportResultDto> {
    if (!file) {
      throw new BadRequestException('File is required');
    }

    if (!configJson) {
      throw new BadRequestException('Config is required');
    }

    const config: ImportConfigDto = JSON.parse(configJson);
    return this.importService.importData(orgId, file.buffer, file.originalname, config);
  }
}
