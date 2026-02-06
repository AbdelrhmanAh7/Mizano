import {
  Controller,
  Get,
  Post,
  Param,
  UseGuards,
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
import { PaymentPredictionService } from '../services/payment-prediction.service';
import {
  PaymentPredictionResponse,
  CustomerPaymentProfileResponse,
  CollectionPriorityResponse,
  PaymentHistoryDetailResponse,
} from '../dto/payment-prediction.dto';

@ApiTags('AI')
@ApiBearerAuth()
@Controller('ai/payment-prediction')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PaymentPredictionController {
  constructor(private predictionService: PaymentPredictionService) {}

  @Get('invoice/:id')
  @Permissions('sales.view')
  @ApiOperation({ summary: 'Predict payment date for a specific invoice' })
  @ApiParam({ name: 'id', description: 'Invoice ID' })
  @ApiResponse({
    status: 200,
    description: 'Returns payment prediction for the invoice',
    type: PaymentPredictionResponse,
  })
  async predictForInvoice(
    @CurrentOrg() orgId: string,
    @Param('id') invoiceId: string,
  ): Promise<{ data: PaymentPredictionResponse | null }> {
    const prediction = await this.predictionService.predictPaymentDate(
      orgId,
      invoiceId,
    );
    return { data: prediction };
  }

  @Get('outstanding')
  @Permissions('sales.view')
  @ApiOperation({ summary: 'Predict payment dates for all outstanding invoices' })
  @ApiResponse({
    status: 200,
    description: 'Returns predictions for all outstanding invoices',
    type: [PaymentPredictionResponse],
  })
  async predictAllOutstanding(
    @CurrentOrg() orgId: string,
  ): Promise<{ data: PaymentPredictionResponse[] }> {
    const predictions = await this.predictionService.predictAllOutstanding(orgId);
    return { data: predictions };
  }

  @Get('customer/:id/profile')
  @Permissions('sales.view')
  @ApiOperation({ summary: 'Get customer payment behavior profile' })
  @ApiParam({ name: 'id', description: 'Customer ID' })
  @ApiResponse({
    status: 200,
    description: 'Returns customer payment profile',
    type: CustomerPaymentProfileResponse,
  })
  async getCustomerProfile(
    @CurrentOrg() orgId: string,
    @Param('id') customerId: string,
  ): Promise<{ data: CustomerPaymentProfileResponse | null }> {
    const profile = await this.predictionService.getCustomerPaymentProfile(
      orgId,
      customerId,
    );
    return { data: profile };
  }

  @Get('customer/:id/history')
  @Permissions('sales.view')
  @ApiOperation({ summary: 'Get detailed payment history for a customer' })
  @ApiParam({ name: 'id', description: 'Customer ID' })
  @ApiResponse({
    status: 200,
    description: 'Returns detailed payment history',
    type: PaymentHistoryDetailResponse,
  })
  async getCustomerHistory(
    @CurrentOrg() orgId: string,
    @Param('id') customerId: string,
  ): Promise<{ data: PaymentHistoryDetailResponse }> {
    const details = await this.predictionService.getPaymentHistoryDetails(
      orgId,
      customerId,
    );
    return { data: details };
  }

  @Get('collection-priority')
  @Permissions('sales.view')
  @ApiOperation({ summary: 'Get collection priority ranking for outstanding invoices' })
  @ApiResponse({
    status: 200,
    description: 'Returns prioritized list for collections',
    type: [CollectionPriorityResponse],
  })
  async getCollectionPriority(
    @CurrentOrg() orgId: string,
  ): Promise<{ data: CollectionPriorityResponse[] }> {
    const priority = await this.predictionService.getCollectionPriority(orgId);
    return { data: priority };
  }

  @Post('rebuild-profiles')
  @Permissions('settings.manage')
  @ApiOperation({ summary: 'Rebuild all customer payment profiles' })
  @ApiResponse({
    status: 200,
    description: 'Profiles rebuilt successfully',
  })
  async rebuildProfiles(
    @CurrentOrg() orgId: string,
  ): Promise<{ data: { updated: number } }> {
    const result = await this.predictionService.updatePredictions(orgId);
    return { data: result };
  }
}
