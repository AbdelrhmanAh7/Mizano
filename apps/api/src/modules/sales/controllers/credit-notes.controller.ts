import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  CacheResponse,
  CacheTTL,
  CurrentOrg,
  InvalidateCache,
  Permissions,
} from '../../../common/decorators';
import { CursorPaginationDto } from '../../../common/dto/cursor-pagination.dto';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { CacheInvalidationInterceptor } from '../../../common/interceptors/cache-invalidation.interceptor';
import { CreateCreditNoteDto } from '../dto/create-credit-note.dto';
import { CreditNotesService } from '../services/credit-notes.service';

@ApiTags('Credit Notes')
@ApiBearerAuth()
@Controller('credit-notes')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@UseInterceptors(CacheInvalidationInterceptor)
export class CreditNotesController {
  constructor(private readonly creditNotesService: CreditNotesService) {}

  @Post()
  @Permissions('sales.create')
  @InvalidateCache('credit-notes:*', 'invoices:*')
  @ApiOperation({ summary: 'Create a credit note' })
  create(@CurrentOrg() orgId: string, @Body() createCreditNoteDto: CreateCreditNoteDto) {
    return this.creditNotesService.create(orgId, createCreditNoteDto);
  }

  @Get()
  @Permissions('sales.view')
  @CacheResponse('credit-notes:list')
  @CacheTTL(120)
  @ApiOperation({ summary: 'Get all credit notes' })
  findAll(@CurrentOrg() orgId: string, @Query() query: PaginationDto) {
    return this.creditNotesService.findAll(orgId, query);
  }

  @Get('cursor')
  @Permissions('sales.view')
  @ApiOperation({ summary: 'List credit notes with cursor-based pagination' })
  findAllCursor(@CurrentOrg() orgId: string, @Query() query: CursorPaginationDto) {
    return this.creditNotesService.findAllCursor(orgId, query);
  }

  // Bulk Operations
  @Post('bulk-delete')
  @Permissions('sales.delete')
  @InvalidateCache('credit-notes:*')
  @ApiOperation({ summary: 'Bulk delete credit notes' })
  bulkDelete(@CurrentOrg() orgId: string, @Body() dto: { ids: string[] }) {
    return this.creditNotesService.bulkDelete(orgId, dto.ids);
  }

  @Get(':id')
  @Permissions('sales.view')
  @ApiOperation({ summary: 'Get credit note by ID' })
  findOne(@CurrentOrg() orgId: string, @Param('id') id: string) {
    return this.creditNotesService.findOne(orgId, id);
  }

  @Put(':id')
  @Permissions('sales.edit')
  @InvalidateCache('credit-notes:*')
  @ApiOperation({ summary: 'Update credit note' })
  update(
    @CurrentOrg() orgId: string,
    @Param('id') id: string,
    @Body() dto: Record<string, unknown>,
  ) {
    return this.creditNotesService.update(orgId, id, dto);
  }

  @Delete(':id')
  @Permissions('sales.delete')
  @InvalidateCache('credit-notes:*')
  @ApiOperation({ summary: 'Delete credit note' })
  remove(@CurrentOrg() orgId: string, @Param('id') id: string) {
    return this.creditNotesService.remove(orgId, id);
  }

  @Post(':id/apply')
  @Permissions('sales.edit')
  @InvalidateCache('credit-notes:*', 'invoices:*')
  @ApiOperation({ summary: 'Apply credit note to an invoice' })
  apply(@CurrentOrg() orgId: string, @Param('id') id: string, @Body() dto: { invoiceId: string }) {
    return this.creditNotesService.apply(orgId, id, dto.invoiceId);
  }
}
