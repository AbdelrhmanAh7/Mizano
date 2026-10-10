import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  UseInterceptors,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentOrg } from '../../../common/decorators/current-org.decorator';
import { InvalidatesLedger } from '../../../common/decorators/invalidate-cache.decorator';
import { CacheInvalidationInterceptor } from '../../../common/interceptors/cache-invalidation.interceptor';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { CursorPaginationDto } from '../../../common/dto/cursor-pagination.dto';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import {
  AssetDetailResponse,
  AssetListResponse,
  AssetQueryDto,
  AssetResponse,
  AssetSummaryResponse,
  CreateAssetDto,
  DepreciationRunResponse,
  DepreciationScheduleResponse,
  DisposeAssetDto,
  UpdateAssetDto,
} from '../dto/assets.dto';
import { AssetsService } from '../services/assets.service';
import { DepreciationService } from '../services/depreciation.service';

@ApiTags('Fixed Assets')
@ApiBearerAuth()
@Controller('assets')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@UseInterceptors(CacheInvalidationInterceptor)
export class AssetsController {
  constructor(
    private readonly assetsService: AssetsService,
    private readonly depreciationService: DepreciationService,
  ) {}

  @Post()
  @Permissions('assets.create')
  @ApiOperation({ summary: 'Create a new fixed asset' })
  @ApiResponse({ status: 201, type: AssetResponse })
  async create(
    @CurrentOrg() organizationId: string,
    @Body() dto: CreateAssetDto,
  ): Promise<AssetResponse> {
    return this.assetsService.create(organizationId, dto) as Promise<AssetResponse>;
  }

  @Get()
  @Permissions('assets.view')
  @ApiOperation({ summary: 'Get all assets with filtering' })
  @ApiResponse({ status: 200, type: AssetListResponse })
  async findAll(@CurrentOrg() organizationId: string, @Query() query: AssetQueryDto) {
    return this.assetsService.findAll(organizationId, query);
  }

  @Get('cursor')
  @Permissions('assets.view')
  @ApiOperation({ summary: 'Get assets with cursor-based pagination' })
  async findAllCursor(@CurrentOrg() organizationId: string, @Query() query: CursorPaginationDto) {
    return this.assetsService.findAllCursor(organizationId, query);
  }

  @Get('summary')
  @Permissions('assets.view')
  @ApiOperation({ summary: 'Get asset summary/statistics' })
  @ApiResponse({ status: 200, type: AssetSummaryResponse })
  async getSummary(@CurrentOrg() organizationId: string): Promise<AssetSummaryResponse> {
    return this.assetsService.getSummary(organizationId) as Promise<AssetSummaryResponse>;
  }

  @Get('depreciation/forecast')
  @Permissions('assets.view')
  @ApiOperation({ summary: 'Get depreciation forecast for upcoming months' })
  async getDepreciationForecast(
    @CurrentOrg() organizationId: string,
    @Query('months') months?: number,
  ) {
    return this.depreciationService.getDepreciationForecast(organizationId, months || 12);
  }

  @Get(':id')
  @Permissions('assets.view')
  @ApiOperation({ summary: 'Get asset details with depreciation schedule' })
  @ApiParam({ name: 'id', description: 'Asset ID' })
  @ApiResponse({ status: 200, type: AssetDetailResponse })
  async findOne(
    @CurrentOrg() organizationId: string,
    @Param('id') assetId: string,
  ): Promise<AssetDetailResponse> {
    return this.assetsService.findOne(organizationId, assetId) as Promise<AssetDetailResponse>;
  }

  @Put(':id')
  @Permissions('assets.update')
  @ApiOperation({ summary: 'Update an asset' })
  @ApiParam({ name: 'id', description: 'Asset ID' })
  @ApiResponse({ status: 200, type: AssetResponse })
  async update(
    @CurrentOrg() organizationId: string,
    @Param('id') assetId: string,
    @Body() dto: UpdateAssetDto,
  ): Promise<AssetResponse> {
    return this.assetsService.update(organizationId, assetId, dto) as Promise<AssetResponse>;
  }

  @Post(':id/dispose')
  @Permissions('assets.delete')
  @InvalidatesLedger('assets:*')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Dispose an asset (sell or write off)' })
  @ApiParam({ name: 'id', description: 'Asset ID' })
  @ApiResponse({ status: 200, type: AssetResponse })
  async dispose(
    @CurrentOrg() organizationId: string,
    @Param('id') assetId: string,
    @Body() dto: DisposeAssetDto,
  ): Promise<AssetResponse> {
    return this.assetsService.dispose(organizationId, assetId, dto) as Promise<AssetResponse>;
  }

  @Get(':id/schedule')
  @Permissions('assets.view')
  @ApiOperation({ summary: 'Get depreciation schedule for an asset' })
  @ApiParam({ name: 'id', description: 'Asset ID' })
  @ApiResponse({ status: 200, type: [DepreciationScheduleResponse] })
  async getSchedule(
    @CurrentOrg() organizationId: string,
    @Param('id') assetId: string,
  ): Promise<DepreciationScheduleResponse[]> {
    return this.assetsService.getDepreciationSchedule(organizationId, assetId) as Promise<
      DepreciationScheduleResponse[]
    >;
  }

  @Post(':id/depreciate')
  @Permissions('assets.update')
  @InvalidatesLedger('assets:*')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Run depreciation for a specific asset' })
  @ApiParam({ name: 'id', description: 'Asset ID' })
  async runAssetDepreciation(
    @CurrentOrg() organizationId: string,
    @Param('id') assetId: string,
    @Query('month') month?: number,
    @Query('year') year?: number,
  ): Promise<{ journalId: string; amount: string }> {
    return this.depreciationService.runDepreciationForAsset(organizationId, assetId, month, year);
  }

  @Post('depreciation/run')
  @Permissions('assets.update')
  @InvalidatesLedger('assets:*')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Run monthly depreciation for all assets' })
  @ApiResponse({ status: 200, type: DepreciationRunResponse })
  async runMonthlyDepreciation(
    @CurrentOrg() organizationId: string,
  ): Promise<DepreciationRunResponse> {
    return this.depreciationService.runMonthlyDepreciation(organizationId);
  }

  @Post('schedule/:scheduleId/reverse')
  @Permissions('assets.update')
  @InvalidatesLedger('assets:*')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Reverse a depreciation entry' })
  @ApiParam({ name: 'scheduleId', description: 'Schedule ID' })
  async reverseDepreciation(
    @CurrentOrg() organizationId: string,
    @Param('scheduleId') scheduleId: string,
  ): Promise<void> {
    return this.depreciationService.reverseDepreciation(organizationId, scheduleId);
  }

  @Delete(':id')
  @Permissions('assets.delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete an asset (soft delete)' })
  @ApiParam({ name: 'id', description: 'Asset ID' })
  async remove(@CurrentOrg() organizationId: string, @Param('id') assetId: string): Promise<void> {
    return this.assetsService.remove(organizationId, assetId);
  }
}
