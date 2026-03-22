import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { CurrentUserData } from '../../common/decorators';
import { CurrentOrg, CurrentUser } from '../../common/decorators';
import { JwtAuthGuard, PermissionsGuard } from '../../common/guards';
import {
  GlobalSearchQueryDto,
  RecordSearchHistoryDto,
  SearchHistoryResponseDto,
  SearchResponseDto,
} from './dto';
import { SearchService } from './search.service';

@ApiTags('Search')
@ApiBearerAuth()
@Controller('search')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  @ApiOperation({ summary: 'Global fuzzy search across all entities' })
  @ApiResponse({ status: 200, description: 'Search results', type: SearchResponseDto })
  async search(
    @CurrentOrg() orgId: string,
    @Query() dto: GlobalSearchQueryDto,
  ): Promise<SearchResponseDto> {
    return this.searchService.search(orgId, dto);
  }

  @Get('history')
  @ApiOperation({ summary: 'Get recent search history for the current user' })
  @ApiResponse({ status: 200, description: 'Search history list', type: SearchHistoryResponseDto })
  async getHistory(
    @CurrentUser() user: CurrentUserData,
    @CurrentOrg() orgId: string,
  ): Promise<SearchHistoryResponseDto> {
    const data = await this.searchService.getSearchHistory(user.id, orgId);
    return { data };
  }

  @Post('history')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Record a search history entry (query + optional result click)' })
  @ApiResponse({ status: 201, description: 'Search history entry recorded' })
  async recordHistory(
    @CurrentUser() user: CurrentUserData,
    @CurrentOrg() orgId: string,
    @Body() dto: RecordSearchHistoryDto,
  ) {
    return this.searchService.recordSearchHistory(user.id, orgId, dto);
  }

  @Delete('history')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Clear all search history for the current user' })
  @ApiResponse({ status: 200, description: 'Search history cleared' })
  async clearHistory(@CurrentUser() user: CurrentUserData, @CurrentOrg() orgId: string) {
    return this.searchService.clearSearchHistory(user.id, orgId);
  }
}
