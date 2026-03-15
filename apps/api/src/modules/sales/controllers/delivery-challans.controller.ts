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
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { DeliveryChallansService } from '../services/delivery-challans.service';
import {
  CreateDeliveryChallanDto,
  UpdateDeliveryChallanDto,
  ChallanQueryDto,
  DeliveryChallanResponse,
  ChallanListResponse,
} from '../dto/delivery-challan.dto';
import { CurrentOrg } from '../../../common/decorators/current-org.decorator';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';

@ApiTags('Delivery Challans')
@ApiBearerAuth()
@Controller('delivery-challans')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class DeliveryChallansController {
  constructor(private readonly deliveryChallansService: DeliveryChallansService) {}

  @Post()
  @Permissions('sales.create')
  @ApiOperation({ summary: 'Create a new delivery challan' })
  @ApiResponse({ status: 201, type: DeliveryChallanResponse })
  create(@CurrentOrg() orgId: string, @Body() dto: CreateDeliveryChallanDto) {
    return this.deliveryChallansService.create(orgId, dto);
  }

  @Get()
  @Permissions('sales.view')
  @ApiOperation({ summary: 'Get all delivery challans' })
  @ApiResponse({ status: 200, type: ChallanListResponse })
  findAll(@CurrentOrg() orgId: string, @Query() query: ChallanQueryDto) {
    return this.deliveryChallansService.findAll(orgId, query);
  }

  // Bulk Operations
  @Post('bulk-delete')
  @Permissions('sales.delete')
  @ApiOperation({ summary: 'Bulk delete draft delivery challans' })
  bulkDelete(@CurrentOrg() orgId: string, @Body() dto: { ids: string[] }) {
    return this.deliveryChallansService.bulkDelete(orgId, dto.ids);
  }

  @Post('bulk-issue')
  @Permissions('sales.edit')
  @ApiOperation({ summary: 'Bulk issue draft delivery challans' })
  bulkIssue(@CurrentOrg() orgId: string, @Body() dto: { ids: string[] }) {
    return this.deliveryChallansService.bulkIssue(orgId, dto.ids);
  }

  @Get(':id')
  @Permissions('sales.view')
  @ApiOperation({ summary: 'Get delivery challan by ID' })
  @ApiParam({ name: 'id', description: 'Delivery challan ID' })
  @ApiResponse({ status: 200, type: DeliveryChallanResponse })
  findOne(@CurrentOrg() orgId: string, @Param('id') id: string) {
    return this.deliveryChallansService.findOne(orgId, id);
  }

  @Put(':id')
  @Permissions('sales.edit')
  @ApiOperation({ summary: 'Update delivery challan' })
  @ApiParam({ name: 'id', description: 'Delivery challan ID' })
  @ApiResponse({ status: 200, type: DeliveryChallanResponse })
  update(
    @CurrentOrg() orgId: string,
    @Param('id') id: string,
    @Body() dto: UpdateDeliveryChallanDto,
  ) {
    return this.deliveryChallansService.update(orgId, id, dto);
  }

  @Delete(':id')
  @Permissions('sales.delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete delivery challan' })
  @ApiParam({ name: 'id', description: 'Delivery challan ID' })
  remove(@CurrentOrg() orgId: string, @Param('id') id: string) {
    return this.deliveryChallansService.remove(orgId, id);
  }

  @Post(':id/issue')
  @Permissions('sales.edit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Issue delivery challan (decreases inventory)' })
  @ApiParam({ name: 'id', description: 'Delivery challan ID' })
  @ApiResponse({ status: 200, type: DeliveryChallanResponse })
  issue(@CurrentOrg() orgId: string, @Param('id') id: string) {
    return this.deliveryChallansService.issue(orgId, id);
  }

  @Post(':id/mark-returned')
  @Permissions('sales.edit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark delivery challan as returned (reverses inventory)' })
  @ApiParam({ name: 'id', description: 'Delivery challan ID' })
  @ApiResponse({ status: 200, type: DeliveryChallanResponse })
  markReturned(@CurrentOrg() orgId: string, @Param('id') id: string) {
    return this.deliveryChallansService.markReturned(orgId, id);
  }

  @Post('from-invoice/:invoiceId')
  @Permissions('sales.create')
  @ApiOperation({ summary: 'Create delivery challan from invoice' })
  @ApiParam({ name: 'invoiceId', description: 'Invoice ID' })
  @ApiResponse({ status: 201, type: DeliveryChallanResponse })
  createFromInvoice(@CurrentOrg() orgId: string, @Param('invoiceId') invoiceId: string) {
    return this.deliveryChallansService.createFromInvoice(orgId, invoiceId);
  }
}
