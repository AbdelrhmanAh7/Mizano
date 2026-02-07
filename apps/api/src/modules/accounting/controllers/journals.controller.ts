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
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JournalsService } from '../services/journals.service';
import { CreateJournalDto } from '../dto/create-journal.dto';
import { UpdateJournalDto } from '../dto/update-journal.dto';
import { CurrentOrg, Permissions } from '../../../common/decorators';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { JournalQueryDto } from '../dto/journal-query.dto';

@ApiTags('Journals')
@ApiBearerAuth()
@Controller('journals')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class JournalsController {
  constructor(private readonly journalsService: JournalsService) {}

  @Post()
  @Permissions('accounting.create')
  @ApiOperation({ summary: 'Create a new journal entry' })
  create(@CurrentOrg() orgId: string, @Body() createJournalDto: CreateJournalDto) {
    return this.journalsService.create(orgId, createJournalDto);
  }

  @Get()
  @Permissions('accounting.view')
  @ApiOperation({ summary: 'Get all journal entries' })
  findAll(@CurrentOrg() orgId: string, @Query() query: JournalQueryDto) {
    return this.journalsService.findAll(orgId, query);
  }

  @Get(':id')
  @Permissions('accounting.view')
  @ApiOperation({ summary: 'Get journal entry by ID' })
  findOne(@CurrentOrg() orgId: string, @Param('id') id: string) {
    return this.journalsService.findOne(orgId, id);
  }

  @Patch(':id')
  @Permissions('accounting.edit')
  @ApiOperation({ summary: 'Update journal entry' })
  update(
    @CurrentOrg() orgId: string,
    @Param('id') id: string,
    @Body() updateJournalDto: UpdateJournalDto,
  ) {
    return this.journalsService.update(orgId, id, updateJournalDto);
  }

  @Post(':id/reverse')
  @Permissions('accounting.create')
  @ApiOperation({ summary: 'Reverse a journal entry' })
  reverse(
    @CurrentOrg() orgId: string,
    @Param('id') id: string,
    @Body() dto: { date?: string },
  ) {
    return this.journalsService.reverse(orgId, id, dto);
  }

  @Delete(':id')
  @Permissions('accounting.delete')
  @ApiOperation({ summary: 'Delete journal entry (soft delete)' })
  remove(@CurrentOrg() orgId: string, @Param('id') id: string) {
    return this.journalsService.remove(orgId, id);
  }
}
