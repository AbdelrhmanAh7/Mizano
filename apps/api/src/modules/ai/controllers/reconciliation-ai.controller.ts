import { Controller, Get, Post, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { CurrentOrg } from '../../../common/decorators/current-org.decorator';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { ReconciliationMatcherService } from '../services/reconciliation-matcher.service';
import { CreateBankRuleDto } from '../dto/create-bank-rule.dto';

@ApiTags('AI')
@ApiBearerAuth()
@Controller('ai/reconciliation')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ReconciliationAiController {
  constructor(private matcherService: ReconciliationMatcherService) {}

  @Get('match/:transactionId')
  @Permissions('banking.view')
  @ApiOperation({ summary: 'Get AI-suggested matches for a bank transaction' })
  @ApiResponse({
    status: 200,
    description: 'Returns scored match candidates',
  })
  @ApiQuery({
    name: 'minConfidence',
    required: false,
    description: 'Minimum confidence threshold (default: 0.3)',
  })
  getMatches(
    @CurrentOrg() orgId: string,
    @Param('transactionId') transactionId: string,
    @Query('minConfidence') minConfidence?: number,
  ) {
    return this.matcherService.matchTransaction(orgId, transactionId, minConfidence || 0.3);
  }

  @Post('confirm/:transactionId')
  @Permissions('banking.manage')
  @ApiOperation({ summary: 'Confirm a match and learn from it' })
  @ApiResponse({
    status: 200,
    description: 'Match confirmed and pattern learned',
  })
  confirmMatch(
    @CurrentOrg() orgId: string,
    @Param('transactionId') transactionId: string,
    @Body() body: { entityType: string; entityId: string },
  ) {
    return this.matcherService.learnFromConfirmation(
      orgId,
      transactionId,
      body.entityType,
      body.entityId,
    );
  }

  @Get('patterns')
  @Permissions('banking.view')
  @ApiOperation({ summary: 'Get learned reconciliation patterns' })
  @ApiQuery({
    name: 'minMatchCount',
    required: false,
    description: 'Minimum match count filter (default: 1)',
  })
  getPatterns(@CurrentOrg() orgId: string, @Query('minMatchCount') minMatchCount?: number) {
    return this.matcherService.getLearnedPatterns(orgId, minMatchCount || 1);
  }

  @Post('rules')
  @Permissions('banking.manage')
  @ApiOperation({ summary: 'Create a bank rule for auto-matching' })
  @ApiResponse({
    status: 201,
    description: 'Bank rule created successfully',
  })
  createRule(@CurrentOrg() orgId: string, @Body() dto: CreateBankRuleDto) {
    return this.matcherService.createRule(orgId, {
      ...dto,
      conditions: dto.conditions.map((c) => ({
        ...c,
        operator: c.operator as
          | 'contains'
          | 'equals'
          | 'startsWith'
          | 'endsWith'
          | 'greaterThan'
          | 'lessThan',
      })),
      action: {
        ...dto.action,
        type: dto.action.type as 'categorize' | 'createExpense' | 'createIncome' | 'match',
      },
    });
  }

  @Get('rules')
  @Permissions('banking.view')
  @ApiOperation({ summary: 'List all bank rules' })
  getRules(@CurrentOrg() orgId: string) {
    return this.matcherService.getRules(orgId);
  }

  @Post('apply-rules/:transactionId')
  @Permissions('banking.manage')
  @ApiOperation({ summary: 'Apply bank rules to a transaction' })
  @ApiResponse({
    status: 200,
    description: 'Returns matching rule if found',
  })
  applyRules(@CurrentOrg() orgId: string, @Param('transactionId') transactionId: string) {
    return this.matcherService.applyRules(orgId, transactionId);
  }

  @Post('bulk-match')
  @Permissions('banking.manage')
  @ApiOperation({ summary: 'Auto-match multiple transactions using AI' })
  @ApiResponse({
    status: 200,
    description: 'Returns bulk match results',
  })
  @ApiQuery({
    name: 'minConfidence',
    required: false,
    description: 'Minimum confidence for auto-matching (default: 0.85)',
  })
  bulkMatch(
    @CurrentOrg() orgId: string,
    @Body() body: { transactionIds: string[] },
    @Query('minConfidence') minConfidence?: number,
  ) {
    return this.matcherService.bulkAutoMatch(orgId, body.transactionIds, minConfidence || 0.85);
  }
}
