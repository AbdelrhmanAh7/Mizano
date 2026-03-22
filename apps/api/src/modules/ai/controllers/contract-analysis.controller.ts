import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { CurrentOrg } from '../../../common/decorators/current-org.decorator';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { ContractAnalysisService } from '../services/contract-analysis.service';
import {
  AnalyzeContractDto,
  ContractAnalysisResultDto,
  ContractDatesDto,
  ContractObligationsDto,
  ContractRiskAnalysisDto,
} from '../dto/contract-analysis.dto';

@ApiTags('AI - Contract Analysis')
@ApiBearerAuth()
@Controller('ai/contracts')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ContractAnalysisController {
  constructor(private contractAnalysisService: ContractAnalysisService) {}

  @Post('analyze')
  @Permissions('accounting.view')
  @ApiOperation({ summary: 'Analyze a contract for key terms, clauses, and risks' })
  @ApiResponse({
    status: 200,
    description: 'Returns full contract analysis',
    type: ContractAnalysisResultDto,
  })
  async analyzeContract(@CurrentOrg() orgId: string, @Body() body: AnalyzeContractDto) {
    const result = await this.contractAnalysisService.analyzeContract(orgId, body.text);
    return { data: result };
  }

  @Post('extract-dates')
  @Permissions('accounting.view')
  @ApiOperation({ summary: 'Extract key dates from a contract' })
  @ApiResponse({
    status: 200,
    description: 'Returns contract dates and deadlines',
    type: ContractDatesDto,
  })
  async extractDates(@Body() body: AnalyzeContractDto) {
    const result = await this.contractAnalysisService.extractDates(body.text);
    return { data: result };
  }

  @Post('extract-obligations')
  @Permissions('accounting.view')
  @ApiOperation({ summary: 'Extract obligations from a contract' })
  @ApiResponse({
    status: 200,
    description: 'Returns contract obligations by party',
    type: [ContractObligationsDto],
  })
  async extractObligations(@Body() body: AnalyzeContractDto) {
    const result = await this.contractAnalysisService.extractObligations(body.text);
    return { data: result };
  }

  @Post('risk-analysis')
  @Permissions('accounting.view')
  @ApiOperation({ summary: 'Perform risk analysis on a contract' })
  @ApiResponse({
    status: 200,
    description: 'Returns contract risk assessment',
    type: ContractRiskAnalysisDto,
  })
  async riskAnalysis(@Body() body: AnalyzeContractDto) {
    const result = await this.contractAnalysisService.riskAnalysis(body.text);
    return { data: result };
  }
}
