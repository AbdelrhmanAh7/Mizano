import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { BankRulesService, BankRuleCondition } from '../services/bank-rules.service';
import { CreateBankRuleDto } from '../dto/create-bank-rule.dto';
import { UpdateBankRuleDto } from '../dto/update-bank-rule.dto';
import { BankRuleQueryDto } from '../dto/bank-rule-query.dto';
import { CurrentOrg, Permissions } from '../../../common/decorators';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';

@ApiTags('Bank Rules')
@ApiBearerAuth()
@Controller('bank-rules')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class BankRulesController {
  constructor(private readonly bankRulesService: BankRulesService) {}

  @Post()
  @Permissions('banking.create')
  @ApiOperation({ summary: 'Create a bank rule' })
  create(@CurrentOrg() orgId: string, @Body() dto: CreateBankRuleDto) {
    return this.bankRulesService.create(orgId, dto);
  }

  @Get()
  @Permissions('banking.view')
  @ApiOperation({ summary: 'Get all bank rules' })
  findAll(@CurrentOrg() orgId: string, @Query() query: BankRuleQueryDto) {
    return this.bankRulesService.findAll(orgId, query);
  }

  @Get(':id')
  @Permissions('banking.view')
  @ApiOperation({ summary: 'Get bank rule by ID' })
  findOne(@CurrentOrg() orgId: string, @Param('id') id: string) {
    return this.bankRulesService.findOne(orgId, id);
  }

  @Patch(':id')
  @Permissions('banking.edit')
  @ApiOperation({ summary: 'Update bank rule' })
  update(@CurrentOrg() orgId: string, @Param('id') id: string, @Body() dto: UpdateBankRuleDto) {
    return this.bankRulesService.update(orgId, id, dto);
  }

  @Delete(':id')
  @Permissions('banking.delete')
  @ApiOperation({ summary: 'Delete bank rule' })
  remove(@CurrentOrg() orgId: string, @Param('id') id: string) {
    return this.bankRulesService.remove(orgId, id);
  }

  @Post('test')
  @Permissions('banking.view')
  @ApiOperation({ summary: 'Test a bank rule against sample transaction' })
  test(
    @CurrentOrg() orgId: string,
    @Body() dto: { conditions: BankRuleCondition[]; transaction: Record<string, unknown> },
  ) {
    return this.bankRulesService.testRule(dto.conditions, dto.transaction);
  }

  @Post('reorder')
  @Permissions('banking.edit')
  @ApiOperation({ summary: 'Reorder bank rules' })
  reorder(@CurrentOrg() orgId: string, @Body() dto: { ids: string[] }) {
    return this.bankRulesService.reorder(orgId, dto.ids);
  }
}
