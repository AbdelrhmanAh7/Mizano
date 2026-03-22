import { Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { CurrentOrg } from '../../../common/decorators/current-org.decorator';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { KnowledgeAssistantService } from '../services/knowledge-assistant.service';
import {
  KnowledgeSearchResponseDto,
  KnowledgeSuggestionDto,
  IndexResultDto,
} from '../dto/knowledge-assistant.dto';

@ApiTags('AI - Knowledge Assistant')
@ApiBearerAuth()
@Controller('ai/knowledge')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class KnowledgeAssistantController {
  constructor(private readonly knowledgeAssistantService: KnowledgeAssistantService) {}

  @Get('search')
  @Permissions('accounting.view')
  @ApiOperation({ summary: 'Search the knowledge base' })
  @ApiQuery({
    name: 'q',
    required: true,
    type: String,
    description: 'Search query string',
    example: 'how to reconcile bank transactions',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Maximum number of results to return',
    example: 10,
  })
  @ApiResponse({
    status: 200,
    description: 'Search results with relevance scores',
    type: KnowledgeSearchResponseDto,
  })
  search(@CurrentOrg() orgId: string, @Query('q') query: string, @Query('limit') limit?: number) {
    return this.knowledgeAssistantService.search(orgId, query, limit || 10);
  }

  @Post('index')
  @Permissions('accounting.manage')
  @ApiOperation({ summary: 'Index organization documents into the knowledge base' })
  @ApiResponse({
    status: 200,
    description: 'Indexing completed with results',
    type: IndexResultDto,
  })
  indexDocuments(@CurrentOrg() orgId: string) {
    return this.knowledgeAssistantService.indexDocuments(orgId);
  }

  @Get('suggestions')
  @Permissions('accounting.view')
  @ApiOperation({ summary: 'Get contextual knowledge suggestions' })
  @ApiQuery({
    name: 'context',
    required: true,
    type: String,
    description: 'Current context or page the user is on',
    example: 'invoice_creation',
  })
  @ApiResponse({
    status: 200,
    description: 'List of contextual suggestions',
    type: [KnowledgeSuggestionDto],
  })
  getSuggestions(@CurrentOrg() orgId: string, @Query('context') context: string) {
    return this.knowledgeAssistantService.getSuggestions(orgId, context);
  }

  @Post('rebuild-index')
  @Permissions('accounting.manage')
  @ApiOperation({ summary: 'Rebuild the entire knowledge base index' })
  @ApiResponse({
    status: 200,
    description: 'Index rebuild completed',
    type: IndexResultDto,
  })
  rebuildIndex(@CurrentOrg() orgId: string) {
    return this.knowledgeAssistantService.rebuildIndex(orgId);
  }
}
