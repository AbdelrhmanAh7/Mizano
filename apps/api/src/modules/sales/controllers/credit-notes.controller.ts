import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { CreditNotesService } from '../services/credit-notes.service';
import { CreateCreditNoteDto } from '../dto/create-credit-note.dto';
import { CurrentOrg, Permissions } from '../../../common/decorators';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { PaginationDto } from '../../../common/dto/pagination.dto';

@ApiTags('Credit Notes')
@ApiBearerAuth()
@Controller('credit-notes')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CreditNotesController {
  constructor(private readonly creditNotesService: CreditNotesService) {}

  @Post()
  @Permissions('sales.create')
  @ApiOperation({ summary: 'Create a credit note' })
  create(@CurrentOrg() orgId: string, @Body() createCreditNoteDto: CreateCreditNoteDto) {
    return this.creditNotesService.create(orgId, createCreditNoteDto);
  }

  @Get()
  @Permissions('sales.view')
  @ApiOperation({ summary: 'Get all credit notes' })
  findAll(@CurrentOrg() orgId: string, @Query() query: PaginationDto) {
    return this.creditNotesService.findAll(orgId, query);
  }

  @Get(':id')
  @Permissions('sales.view')
  @ApiOperation({ summary: 'Get credit note by ID' })
  findOne(@CurrentOrg() orgId: string, @Param('id') id: string) {
    return this.creditNotesService.findOne(orgId, id);
  }

  @Put(':id')
  @Permissions('sales.edit')
  @ApiOperation({ summary: 'Update credit note' })
  update(@CurrentOrg() orgId: string, @Param('id') id: string, @Body() dto: any) {
    return this.creditNotesService.update(orgId, id, dto);
  }

  @Delete(':id')
  @Permissions('sales.delete')
  @ApiOperation({ summary: 'Delete credit note' })
  remove(@CurrentOrg() orgId: string, @Param('id') id: string) {
    return this.creditNotesService.remove(orgId, id);
  }

  @Post(':id/apply')
  @Permissions('sales.edit')
  @ApiOperation({ summary: 'Apply credit note to an invoice' })
  apply(@CurrentOrg() orgId: string, @Param('id') id: string, @Body() dto: { invoiceId: string }) {
    return this.creditNotesService.apply(orgId, id, dto.invoiceId);
  }
}
