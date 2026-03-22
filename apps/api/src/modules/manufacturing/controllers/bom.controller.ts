import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { BomService, CreateBomData, UpdateBomData } from '../services/bom.service';
import { CurrentOrg, Permissions } from '../../../common/decorators';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';

@ApiTags('Bill of Materials')
@ApiBearerAuth()
@Controller('manufacturing/bom')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class BomController {
  constructor(private readonly bomService: BomService) {}

  @Post()
  @Permissions('manufacturing.create')
  @ApiOperation({ summary: 'Create a new BOM' })
  create(@CurrentOrg() orgId: string, @Body() dto: CreateBomData) {
    return this.bomService.create(orgId, dto);
  }

  @Get()
  @Permissions('manufacturing.view')
  @ApiOperation({ summary: 'Get all BOMs' })
  findAll(
    @CurrentOrg() orgId: string,
    @Query()
    query: {
      page?: number | string;
      limit?: number | string;
      sortBy?: string;
      sortOrder?: string;
      itemId?: string;
      isActive?: boolean;
    },
  ) {
    return this.bomService.findAll(orgId, query);
  }

  @Get(':id')
  @Permissions('manufacturing.view')
  @ApiOperation({ summary: 'Get BOM by ID' })
  findOne(@CurrentOrg() orgId: string, @Param('id') id: string) {
    return this.bomService.findOne(orgId, id);
  }

  @Patch(':id')
  @Permissions('manufacturing.edit')
  @ApiOperation({ summary: 'Update BOM' })
  update(@CurrentOrg() orgId: string, @Param('id') id: string, @Body() dto: UpdateBomData) {
    return this.bomService.update(orgId, id, dto);
  }

  @Delete(':id')
  @Permissions('manufacturing.delete')
  @ApiOperation({ summary: 'Delete BOM' })
  remove(@CurrentOrg() orgId: string, @Param('id') id: string) {
    return this.bomService.remove(orgId, id);
  }

  @Get(':id/requirements')
  @Permissions('manufacturing.view')
  @ApiOperation({ summary: 'Calculate material requirements' })
  calculateRequirements(
    @CurrentOrg() orgId: string,
    @Param('id') id: string,
    @Query('quantity') quantity: string,
  ) {
    return this.bomService.calculateMaterialRequirements(orgId, id, parseFloat(quantity || '1'));
  }

  @Post(':id/duplicate')
  @Permissions('manufacturing.create')
  @ApiOperation({ summary: 'Duplicate BOM' })
  duplicate(@CurrentOrg() orgId: string, @Param('id') id: string, @Body() dto: { name?: string }) {
    return this.bomService.duplicate(orgId, id, dto.name);
  }
}
