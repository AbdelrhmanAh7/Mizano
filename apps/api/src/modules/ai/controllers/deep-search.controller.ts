import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  NotFoundException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { CurrentOrg } from '../../../common/decorators/current-org.decorator';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { DeepSearchService } from '../services/deep-search.service';
import { RunDeepSearchDto, UpdateSuggestionStatusDto } from '../dto/deep-search.dto';

@ApiTags('AI DeepSearch')
@ApiBearerAuth()
@Controller('ai/deep-search')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class DeepSearchController {
  constructor(private readonly deepSearchService: DeepSearchService) {}

  @Post('run')
  @Permissions('ai.manage')
  @ApiOperation({ summary: 'Start a new DeepSearch job' })
  @ApiResponse({ status: 201, description: 'Job created and pipeline started' })
  async run(
    @CurrentOrg() organizationId: string,
    @Body() dto: RunDeepSearchDto,
  ) {
    const job = await this.deepSearchService.runSearch(organizationId, dto);
    return { data: job };
  }

  @Get('jobs')
  @Permissions('ai.view')
  @ApiOperation({ summary: 'List all DeepSearch jobs' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async listJobs(
    @CurrentOrg() organizationId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.deepSearchService.getJobs(
      organizationId,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 10,
    );
  }

  @Get('jobs/:id')
  @Permissions('ai.view')
  @ApiOperation({ summary: 'Get a specific DeepSearch job with its suggestions' })
  @ApiParam({ name: 'id', description: 'Job ID' })
  async getJob(
    @CurrentOrg() organizationId: string,
    @Param('id') id: string,
  ) {
    const job = await this.deepSearchService.getJob(organizationId, id);
    if (!job) throw new NotFoundException('Job not found');
    return { data: job };
  }

  @Patch('suggestions/:id')
  @Permissions('ai.manage')
  @ApiOperation({ summary: 'Update suggestion status (accept/dismiss)' })
  @ApiParam({ name: 'id', description: 'Suggestion ID' })
  async updateSuggestion(
    @CurrentOrg() organizationId: string,
    @Param('id') id: string,
    @Body() dto: UpdateSuggestionStatusDto,
  ) {
    await this.deepSearchService.updateSuggestionStatus(organizationId, id, dto.status);
    return { data: { success: true } };
  }

  @Get('suggestions/:id/prompt')
  @Permissions('ai.view')
  @ApiOperation({ summary: 'Get the Claude Code prompt for a suggestion' })
  @ApiParam({ name: 'id', description: 'Suggestion ID' })
  async getSuggestionPrompt(
    @CurrentOrg() organizationId: string,
    @Param('id') id: string,
  ) {
    const result = await this.deepSearchService.getSuggestionPrompt(organizationId, id);
    if (!result) throw new NotFoundException('Suggestion not found');
    return { data: result };
  }
}
