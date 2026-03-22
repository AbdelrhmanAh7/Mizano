import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentOrg, Permissions } from '../../../common/decorators';
import { CursorPaginationDto } from '../../../common/dto/cursor-pagination.dto';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { CreateQuoteDto } from '../dto/create-quote.dto';
import { QuoteQueryDto } from '../dto/quote-query.dto';
import { UpdateQuoteDto } from '../dto/update-quote.dto';
import { QuotesService } from '../services/quotes.service';

@ApiTags('Quotes')
@ApiBearerAuth()
@Controller('quotes')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class QuotesController {
  constructor(private readonly quotesService: QuotesService) {}

  @Post()
  @Permissions('sales.create')
  @ApiOperation({ summary: 'Create a new quote' })
  create(@CurrentOrg() orgId: string, @Body() createQuoteDto: CreateQuoteDto) {
    return this.quotesService.create(orgId, createQuoteDto);
  }

  @Get()
  @Permissions('sales.view')
  findAll(@CurrentOrg() orgId: string, @Query() query: QuoteQueryDto) {
    return this.quotesService.findAll(orgId, query);
  }

  @Get('cursor')
  @Permissions('sales.view')
  @ApiOperation({ summary: 'List quotes with cursor-based pagination' })
  findAllCursor(@CurrentOrg() orgId: string, @Query() query: CursorPaginationDto) {
    return this.quotesService.findAllCursor(orgId, query);
  }

  // Bulk Operations
  @Post('bulk-delete')
  @Permissions('sales.delete')
  @ApiOperation({ summary: 'Bulk delete draft quotes' })
  bulkDelete(@CurrentOrg() orgId: string, @Body() dto: { ids: string[] }) {
    return this.quotesService.bulkDelete(orgId, dto.ids);
  }

  @Post('bulk-send')
  @Permissions('sales.edit')
  @ApiOperation({ summary: 'Bulk send quotes' })
  bulkSend(@CurrentOrg() orgId: string, @Body() dto: { ids: string[] }) {
    return this.quotesService.bulkSend(orgId, dto.ids);
  }

  @Post('bulk-decline')
  @Permissions('sales.edit')
  @ApiOperation({ summary: 'Bulk decline quotes' })
  bulkDecline(@CurrentOrg() orgId: string, @Body() dto: { ids: string[] }) {
    return this.quotesService.bulkDecline(orgId, dto.ids);
  }

  @Get(':id')
  @Permissions('sales.view')
  findOne(@CurrentOrg() orgId: string, @Param('id') id: string) {
    return this.quotesService.findOne(orgId, id);
  }

  @Patch(':id')
  @Permissions('sales.edit')
  update(
    @CurrentOrg() orgId: string,
    @Param('id') id: string,
    @Body() updateQuoteDto: UpdateQuoteDto,
  ) {
    return this.quotesService.update(orgId, id, updateQuoteDto);
  }

  @Patch(':id/send')
  @Permissions('sales.edit')
  @ApiOperation({ summary: 'Mark quote as sent' })
  send(@CurrentOrg() orgId: string, @Param('id') id: string) {
    return this.quotesService.send(orgId, id);
  }

  @Patch(':id/accept')
  @Permissions('sales.edit')
  @ApiOperation({ summary: 'Mark quote as accepted' })
  accept(@CurrentOrg() orgId: string, @Param('id') id: string) {
    return this.quotesService.accept(orgId, id);
  }

  @Patch(':id/decline')
  @Permissions('sales.edit')
  @ApiOperation({ summary: 'Mark quote as declined' })
  decline(@CurrentOrg() orgId: string, @Param('id') id: string) {
    return this.quotesService.decline(orgId, id);
  }

  @Post(':id/clone')
  @Permissions('sales.create')
  @ApiOperation({ summary: 'Clone a quote as a new draft' })
  clone(@CurrentOrg() orgId: string, @Param('id') id: string) {
    return this.quotesService.clone(orgId, id);
  }

  @Post(':id/convert-to-invoice')
  @Permissions('sales.create')
  @ApiOperation({ summary: 'Convert quote to invoice' })
  convertToInvoice(@CurrentOrg() orgId: string, @Param('id') id: string) {
    return this.quotesService.convertToInvoice(orgId, id);
  }

  @Delete(':id')
  @Permissions('sales.delete')
  remove(@CurrentOrg() orgId: string, @Param('id') id: string) {
    return this.quotesService.remove(orgId, id);
  }
}
