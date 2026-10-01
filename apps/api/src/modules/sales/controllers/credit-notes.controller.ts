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
  InvalidatesLedger,
  Permissions,
} from '../../../common/decorators';
import { BulkIdsDto } from '../../../common/dto/bulk-ids.dto';
import { CursorPaginationDto } from '../../../common/dto/cursor-pagination.dto';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { CacheInvalidationInterceptor } from '../../../common/interceptors/cache-invalidation.interceptor';
import { ApplyCreditNoteDto } from '../dto/apply-credit-note.dto';
import { CreateCreditNoteDto } from '../dto/create-credit-note.dto';
import { CreditNoteQueryDto } from '../dto/credit-note-query.dto';
import { UpdateCreditNoteDto } from '../dto/update-credit-note.dto';
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
  @InvalidatesLedger('credit-notes:*', 'invoices:*', 'customers:*')
  @ApiOperation({ summary: 'Create a credit note (posts Dr Sales Returns / VAT, Cr AR or refund)' })
  create(@CurrentOrg() orgId: string, @Body() createCreditNoteDto: CreateCreditNoteDto) {
    return this.creditNotesService.create(orgId, createCreditNoteDto);
  }

  @Get()
  @Permissions('sales.view')
  @CacheResponse('credit-notes:list')
  @CacheTTL(120)
  @ApiOperation({ summary: 'Get all credit notes' })
  findAll(@CurrentOrg() orgId: string, @Query() query: CreditNoteQueryDto) {
    return this.creditNotesService.findAll(orgId, query);
  }

  @Get('cursor')
  @Permissions('sales.view')
  @ApiOperation({ summary: 'List credit notes with cursor-based pagination' })
  findAllCursor(@CurrentOrg() orgId: string, @Query() query: CursorPaginationDto) {
    return this.creditNotesService.findAllCursor(orgId, query);
  }

  @Get('refund-accounts')
  @Permissions('sales.create')
  @ApiOperation({
    summary: 'Bank/cash accounts a REFUND credit note can be paid from (sales.create)',
  })
  refundAccounts(@CurrentOrg() orgId: string) {
    return this.creditNotesService.refundAccounts(orgId);
  }

  // Bulk Operations
  @Post('bulk-delete')
  @Permissions('sales.delete')
  @InvalidatesLedger('credit-notes:*', 'invoices:*', 'customers:*')
  @ApiOperation({ summary: 'Bulk void credit notes (restores balances, reverses journals)' })
  bulkDelete(@CurrentOrg() orgId: string, @Body() dto: BulkIdsDto) {
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
  @ApiOperation({ summary: 'Update the reason of a credit note (posted notes are immutable)' })
  update(@CurrentOrg() orgId: string, @Param('id') id: string, @Body() dto: UpdateCreditNoteDto) {
    return this.creditNotesService.update(orgId, id, dto);
  }

  @Delete(':id')
  @Permissions('sales.delete')
  @InvalidatesLedger('credit-notes:*', 'invoices:*', 'customers:*')
  @ApiOperation({ summary: 'Void a credit note (restores balance, reverses journal)' })
  remove(@CurrentOrg() orgId: string, @Param('id') id: string) {
    return this.creditNotesService.remove(orgId, id);
  }

  @Post(':id/apply')
  @Permissions('sales.edit')
  @InvalidateCache('credit-notes:*', 'invoices:*', 'customers:*')
  @ApiOperation({ summary: 'Apply an unapplied credit note to an invoice balance' })
  apply(@CurrentOrg() orgId: string, @Param('id') id: string, @Body() dto: ApplyCreditNoteDto) {
    return this.creditNotesService.apply(orgId, id, dto.invoiceId);
  }
}
