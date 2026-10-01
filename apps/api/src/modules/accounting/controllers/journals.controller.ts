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
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  CacheResponse,
  CacheTTL,
  CurrentOrg,
  HttpCache,
  InvalidatesLedger,
  Permissions,
} from '../../../common/decorators';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { CacheInvalidationInterceptor } from '../../../common/interceptors/cache-invalidation.interceptor';
import { CreateJournalDto } from '../dto/create-journal.dto';
import { JournalCursorQueryDto } from '../dto/journal-cursor-query.dto';
import { JournalQueryDto } from '../dto/journal-query.dto';
import { UpdateJournalDto } from '../dto/update-journal.dto';
import { JournalsService } from '../services/journals.service';

@ApiTags('Journals')
@ApiBearerAuth()
@Controller('journals')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@UseInterceptors(CacheInvalidationInterceptor)
export class JournalsController {
  constructor(private readonly journalsService: JournalsService) {}

  @Post()
  @Permissions('accounting.create')
  @InvalidatesLedger('journals:*')
  @ApiOperation({ summary: 'Create a new journal entry' })
  create(@CurrentOrg() orgId: string, @Body() createJournalDto: CreateJournalDto) {
    return this.journalsService.create(orgId, createJournalDto);
  }

  @Get()
  @Permissions('accounting.view')
  @CacheResponse('journals:list')
  @CacheTTL(120)
  @HttpCache('short')
  @ApiOperation({ summary: 'Get all journal entries' })
  findAll(@CurrentOrg() orgId: string, @Query() query: JournalQueryDto) {
    return this.journalsService.findAll(orgId, query);
  }

  @Get('cursor')
  @Permissions('accounting.view')
  @ApiOperation({ summary: 'List journals with cursor-based pagination' })
  findAllCursor(@CurrentOrg() orgId: string, @Query() query: JournalCursorQueryDto) {
    return this.journalsService.findAllCursor(orgId, query);
  }

  @Get(':id')
  @Permissions('accounting.view')
  @ApiOperation({ summary: 'Get journal entry by ID' })
  findOne(@CurrentOrg() orgId: string, @Param('id') id: string) {
    return this.journalsService.findOne(orgId, id);
  }

  @Patch(':id')
  @Permissions('accounting.edit')
  @InvalidatesLedger('journals:*')
  @ApiOperation({ summary: 'Update journal entry' })
  update(
    @CurrentOrg() orgId: string,
    @Param('id') id: string,
    @Body() updateJournalDto: UpdateJournalDto,
  ) {
    return this.journalsService.update(orgId, id, updateJournalDto);
  }

  @Post(':id/post')
  @Permissions('accounting.edit')
  @InvalidatesLedger('journals:*')
  @ApiOperation({ summary: 'Post a journal entry' })
  post(@CurrentOrg() orgId: string, @Param('id') id: string) {
    return this.journalsService.post(orgId, id);
  }

  @Post(':id/reverse')
  @Permissions('accounting.create')
  @InvalidatesLedger('journals:*')
  @ApiOperation({ summary: 'Reverse a journal entry' })
  reverse(@CurrentOrg() orgId: string, @Param('id') id: string, @Body() dto: { date?: string }) {
    return this.journalsService.reverse(orgId, id, dto);
  }

  @Delete(':id')
  @Permissions('accounting.delete')
  @InvalidatesLedger('journals:*')
  @ApiOperation({ summary: 'Delete journal entry (soft delete)' })
  remove(@CurrentOrg() orgId: string, @Param('id') id: string) {
    return this.journalsService.remove(orgId, id);
  }

  // Bulk Operations
  @Post('bulk-delete')
  @Permissions('accounting.delete')
  @InvalidatesLedger('journals:*')
  @ApiOperation({ summary: 'Bulk delete unposted journal entries' })
  bulkDelete(@CurrentOrg() orgId: string, @Body() dto: { ids: string[] }) {
    return this.journalsService.bulkDelete(orgId, dto.ids);
  }

  @Post('bulk-post')
  @Permissions('accounting.edit')
  @InvalidatesLedger('journals:*')
  @ApiOperation({ summary: 'Bulk post journal entries' })
  bulkPost(@CurrentOrg() orgId: string, @Body() dto: { ids: string[] }) {
    return this.journalsService.bulkPost(orgId, dto.ids);
  }
}
