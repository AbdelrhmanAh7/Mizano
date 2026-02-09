import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { CurrentOrg } from '../../../common/decorators/current-org.decorator';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { PatternDetectionService } from '../services/pattern-detection.service';
import {
  PatternQueryDto,
  SuggestionLimitDto,
  CheckDuplicateDto,
  AcceptSuggestionDto,
  DismissSuggestionDto,
  RecordTransactionDto,
  PatternListResponse,
  PatternDetailsResponse,
  PatternSuggestionResponse,
  DuplicateCheckResponse,
  RecordTransactionResponse,
  AcceptSuggestionResponse,
  AnalysisResultResponse,
} from '../dto/pattern-detection.dto';

@ApiTags('AI - Pattern Detection')
@ApiBearerAuth()
@Controller('ai/patterns')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PatternDetectionController {
  constructor(private readonly patternService: PatternDetectionService) {}

  @Get()
  @Permissions('ai.view')
  @ApiOperation({ summary: 'Get detected transaction patterns' })
  @ApiResponse({ status: 200, type: PatternListResponse })
  async getPatterns(
    @CurrentOrg() organizationId: string,
    @Query() query: PatternQueryDto,
  ) {
    return this.patternService.getPatterns(organizationId, {
      status: query.status,
      entityType: query.entityType,
      limit: query.limit,
      offset: query.offset,
    });
  }

  @Get('suggestions')
  @Permissions('ai.view')
  @ApiOperation({ summary: 'Get pending pattern suggestions' })
  @ApiResponse({ status: 200, type: [PatternSuggestionResponse] })
  async getPendingSuggestions(
    @CurrentOrg() organizationId: string,
    @Query() query: SuggestionLimitDto,
  ): Promise<any[]> {
    return this.patternService.getPendingSuggestions(organizationId, query.limit);
  }

  @Get(':id')
  @Permissions('ai.view')
  @ApiOperation({ summary: 'Get pattern details with occurrences' })
  @ApiParam({ name: 'id', description: 'Pattern ID' })
  @ApiResponse({ status: 200, type: PatternDetailsResponse })
  async getPatternDetails(
    @CurrentOrg() organizationId: string,
    @Param('id') patternId: string,
  ) {
    return this.patternService.getPatternDetails(organizationId, patternId);
  }

  @Post('analyze')
  @Permissions('ai.manage')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Run pattern analysis manually' })
  @ApiResponse({ status: 200, type: AnalysisResultResponse })
  async runAnalysis(
    @CurrentOrg() organizationId: string,
  ): Promise<AnalysisResultResponse> {
    return this.patternService.analyzePatterns(organizationId);
  }

  @Post('check-duplicate')
  @Permissions('ai.view')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Check if a transaction might be a duplicate' })
  @ApiResponse({ status: 200, type: DuplicateCheckResponse })
  async checkDuplicate(
    @CurrentOrg() organizationId: string,
    @Body() dto: CheckDuplicateDto,
  ): Promise<DuplicateCheckResponse> {
    const result = await this.patternService.checkForDuplicate(
      organizationId,
      dto.entityName,
      dto.amount,
      dto.date,
    );
    // Convert Date to string for response DTO and handle null description
    return {
      ...result,
      matchingTransaction: result.matchingTransaction
        ? {
            ...result.matchingTransaction,
            date: result.matchingTransaction.date.toISOString(),
            description: result.matchingTransaction.description ?? undefined,
          }
        : undefined,
    };
  }

  @Post('record')
  @Permissions('ai.view')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Record a transaction for pattern tracking' })
  @ApiResponse({ status: 200, type: RecordTransactionResponse })
  async recordTransaction(
    @CurrentOrg() organizationId: string,
    @Body() dto: RecordTransactionDto,
  ): Promise<RecordTransactionResponse> {
    return this.patternService.recordTransaction(organizationId, {
      ...dto,
      date: new Date(dto.date),
    });
  }

  @Post('suggestions/:id/accept')
  @Permissions('accounting.create')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Accept suggestion and create recurring profile' })
  @ApiParam({ name: 'id', description: 'Suggestion ID' })
  @ApiResponse({ status: 200, type: AcceptSuggestionResponse })
  async acceptSuggestion(
    @CurrentOrg() organizationId: string,
    @Param('id') suggestionId: string,
    @Body() dto: AcceptSuggestionDto,
  ): Promise<AcceptSuggestionResponse> {
    return this.patternService.acceptSuggestion(organizationId, suggestionId, dto);
  }

  @Post('suggestions/:id/dismiss')
  @Permissions('ai.manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Dismiss a pattern suggestion' })
  @ApiParam({ name: 'id', description: 'Suggestion ID' })
  @ApiResponse({ status: 204 })
  async dismissSuggestion(
    @CurrentOrg() organizationId: string,
    @Param('id') suggestionId: string,
    @Body() dto: DismissSuggestionDto,
  ): Promise<void> {
    await this.patternService.dismissSuggestion(
      organizationId,
      suggestionId,
      dto.reason,
    );
  }
}
