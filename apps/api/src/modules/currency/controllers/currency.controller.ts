import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
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
  ApiQuery,
} from '@nestjs/swagger';
import { CurrencyService } from '../services/currency.service';
import {
  CreateExchangeRateDto,
  UpdateExchangeRateDto,
  ExchangeRateQueryDto,
  ConvertAmountDto,
  ConversionResultDto,
  GainLossCalculationDto,
  GainLossResultDto,
  ExchangeRateResponse,
  ExchangeRateListResponse,
  CurrencyInfoResponse,
} from '../dto/currency.dto';
import { CurrentOrg } from '../../../common/decorators/current-org.decorator';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';

@ApiTags('Currency')
@ApiBearerAuth()
@Controller('currency')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CurrencyController {
  constructor(private readonly currencyService: CurrencyService) {}

  // ============ Currency Info ============

  @Get('info')
  @Permissions('settings.view')
  @ApiOperation({ summary: 'Get currency configuration info' })
  @ApiResponse({ status: 200, type: CurrencyInfoResponse })
  getCurrencyInfo(@CurrentOrg() orgId: string) {
    return this.currencyService.getCurrencyInfo(orgId);
  }

  @Get('supported')
  @ApiOperation({ summary: 'Get list of supported currencies' })
  @ApiResponse({ status: 200, type: [String] })
  getSupportedCurrencies(): string[] {
    return this.currencyService.getSupportedCurrencies();
  }

  // ============ Exchange Rates CRUD ============

  @Post('exchange-rates')
  @Permissions('settings.manage')
  @ApiOperation({ summary: 'Create or update exchange rate' })
  @ApiResponse({ status: 201, type: ExchangeRateResponse })
  createExchangeRate(@CurrentOrg() orgId: string, @Body() dto: CreateExchangeRateDto) {
    return this.currencyService.createExchangeRate(orgId, dto);
  }

  @Get('exchange-rates')
  @Permissions('settings.view')
  @ApiOperation({ summary: 'Get exchange rates' })
  @ApiResponse({ status: 200, type: ExchangeRateListResponse })
  getExchangeRates(@CurrentOrg() orgId: string, @Query() query: ExchangeRateQueryDto) {
    return this.currencyService.getExchangeRates(orgId, query);
  }

  @Get('exchange-rates/latest')
  @Permissions('settings.view')
  @ApiOperation({ summary: 'Get latest exchange rates from base currency' })
  @ApiQuery({ name: 'baseCurrency', required: false })
  getLatestRates(@CurrentOrg() orgId: string, @Query('baseCurrency') baseCurrency?: string) {
    return this.currencyService.getLatestRates(orgId, baseCurrency);
  }

  @Put('exchange-rates/:id')
  @Permissions('settings.manage')
  @ApiOperation({ summary: 'Update exchange rate' })
  @ApiParam({ name: 'id', description: 'Exchange rate ID' })
  @ApiResponse({ status: 200, type: ExchangeRateResponse })
  updateExchangeRate(
    @CurrentOrg() orgId: string,
    @Param('id') id: string,
    @Body() dto: UpdateExchangeRateDto,
  ) {
    return this.currencyService.updateExchangeRate(orgId, id, dto);
  }

  @Delete('exchange-rates/:id')
  @Permissions('settings.manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete exchange rate' })
  @ApiParam({ name: 'id', description: 'Exchange rate ID' })
  deleteExchangeRate(@CurrentOrg() orgId: string, @Param('id') id: string) {
    return this.currencyService.deleteExchangeRate(orgId, id);
  }

  // ============ Rate Lookup ============

  @Get('rate/:from/:to')
  @Permissions('settings.view')
  @ApiOperation({ summary: 'Get exchange rate between two currencies' })
  @ApiParam({ name: 'from', description: 'Source currency code' })
  @ApiParam({ name: 'to', description: 'Target currency code' })
  @ApiQuery({ name: 'date', required: false, description: 'Rate date (YYYY-MM-DD)' })
  getRate(
    @CurrentOrg() orgId: string,
    @Param('from') from: string,
    @Param('to') to: string,
    @Query('date') date?: string,
  ) {
    return this.currencyService.getRate(orgId, from, to, date ? new Date(date) : undefined);
  }

  // ============ Conversion ============

  @Post('convert')
  @Permissions('settings.view')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Convert amount between currencies' })
  @ApiResponse({ status: 200, type: ConversionResultDto })
  convertAmount(
    @CurrentOrg() orgId: string,
    @Body() dto: ConvertAmountDto,
  ): Promise<ConversionResultDto> {
    return this.currencyService.convertAmount(orgId, dto);
  }

  // ============ Gain/Loss Calculation ============

  @Post('calculate-gain-loss')
  @Permissions('accounting.view')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Calculate foreign exchange gain/loss' })
  @ApiResponse({ status: 200, type: GainLossResultDto })
  calculateGainLoss(@Body() dto: GainLossCalculationDto): GainLossResultDto {
    return this.currencyService.calculateGainLoss(dto);
  }

  @Get('unrealized-gain-loss')
  @Permissions('accounting.view')
  @ApiOperation({ summary: 'Calculate unrealized forex gain/loss for all open positions' })
  @ApiQuery({ name: 'date', required: false, description: 'As of date (YYYY-MM-DD)' })
  getUnrealizedGainLoss(@CurrentOrg() orgId: string, @Query('date') date?: string) {
    return this.currencyService.calculateUnrealizedGainLoss(
      orgId,
      date ? new Date(date) : undefined,
    );
  }
}
