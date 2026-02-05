import { Controller, Get, Post, Body, Patch, Param, Delete, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { QuotesService } from '../services/quotes.service';
import { CreateQuoteDto } from '../dto/create-quote.dto';
import { UpdateQuoteDto } from '../dto/update-quote.dto';
import { CurrentOrg, Permissions } from '../../../common/decorators';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { PaginationDto } from '../../../common/dto/pagination.dto';

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
  findAll(@CurrentOrg() orgId: string, @Query() query: PaginationDto) {
    return this.quotesService.findAll(orgId, query);
  }

  @Get(':id')
  @Permissions('sales.view')
  findOne(@CurrentOrg() orgId: string, @Param('id') id: string) {
    return this.quotesService.findOne(orgId, id);
  }

  @Patch(':id')
  @Permissions('sales.edit')
  update(@CurrentOrg() orgId: string, @Param('id') id: string, @Body() updateQuoteDto: UpdateQuoteDto) {
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
