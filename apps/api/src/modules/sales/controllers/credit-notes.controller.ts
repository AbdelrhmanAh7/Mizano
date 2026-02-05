import { Controller, Get, Post, Body, Param, Query, UseGuards } from '@nestjs/common';
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
  findAll(@CurrentOrg() orgId: string, @Query() query: PaginationDto) {
    return this.creditNotesService.findAll(orgId, query);
  }

  @Get(':id')
  @Permissions('sales.view')
  findOne(@CurrentOrg() orgId: string, @Param('id') id: string) {
    return this.creditNotesService.findOne(orgId, id);
  }
}
