import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { CompositeItemsService } from '../services/composite-items.service';
import { CreateCompositeItemDto, UpdateCompositeItemDto } from '../dto/composite-item.dto';
import { CurrentOrg, Permissions } from '../../../common/decorators';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { CursorPaginationDto } from '../../../common/dto/cursor-pagination.dto';

@ApiTags('Composite Items')
@ApiBearerAuth()
@Controller('composite-items')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CompositeItemsController {
  constructor(private readonly compositeItemsService: CompositeItemsService) {}

  @Post()
  @Permissions('inventory.create')
  @ApiOperation({ summary: 'Create a composite item (bundle)' })
  create(@CurrentOrg() orgId: string, @Body() dto: CreateCompositeItemDto) {
    return this.compositeItemsService.create(orgId, dto);
  }

  @Get()
  @Permissions('inventory.view')
  @ApiOperation({ summary: 'List composite items' })
  findAll(@CurrentOrg() orgId: string, @Query() query: PaginationDto) {
    return this.compositeItemsService.findAll(orgId, query);
  }

  @Get('cursor')
  @Permissions('inventory.view')
  @ApiOperation({ summary: 'List composite items with cursor-based pagination' })
  findAllCursor(@CurrentOrg() orgId: string, @Query() query: CursorPaginationDto) {
    return this.compositeItemsService.findAllCursor(orgId, query);
  }

  @Get(':id')
  @Permissions('inventory.view')
  @ApiOperation({ summary: 'Get a composite item by ID' })
  findOne(@CurrentOrg() orgId: string, @Param('id') id: string) {
    return this.compositeItemsService.findOne(orgId, id);
  }

  @Patch(':id')
  @Permissions('inventory.edit')
  @ApiOperation({ summary: 'Update a composite item' })
  update(
    @CurrentOrg() orgId: string,
    @Param('id') id: string,
    @Body() dto: UpdateCompositeItemDto,
  ) {
    return this.compositeItemsService.update(orgId, id, dto);
  }

  @Delete(':id')
  @Permissions('inventory.delete')
  @ApiOperation({ summary: 'Delete a composite item' })
  remove(@CurrentOrg() orgId: string, @Param('id') id: string) {
    return this.compositeItemsService.remove(orgId, id);
  }

  @Get(':id/availability')
  @Permissions('inventory.view')
  @ApiOperation({ summary: 'Check component availability for assembly' })
  checkAvailability(
    @CurrentOrg() orgId: string,
    @Param('id') id: string,
    @Query('quantity') quantity?: string,
  ) {
    return this.compositeItemsService.checkAvailability(
      orgId,
      id,
      quantity ? parseInt(quantity, 10) : 1,
    );
  }

  @Post(':id/assemble')
  @Permissions('inventory.create')
  @ApiOperation({ summary: 'Assemble a composite item (consume component stock)' })
  assemble(
    @CurrentOrg() orgId: string,
    @Param('id') id: string,
    @Body() dto: { quantity: number; warehouseId: string },
  ) {
    return this.compositeItemsService.assemble(orgId, id, dto);
  }
}
