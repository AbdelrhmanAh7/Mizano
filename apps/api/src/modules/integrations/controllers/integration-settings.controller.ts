import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentOrg, CurrentUser, Permissions } from '../../../common/decorators';
import type { CurrentUserData } from '../../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import {
  CreateApiKeyDto,
  CreateWebhookEndpointDto,
  DeliveryQueryDto,
  UpdateWebhookEndpointDto,
} from '../dto/integration-settings.dto';
import { IntegrationSettingsService } from '../services/integration-settings.service';

/** "Connect to FlowLine" settings screen: keys, webhook endpoints and the delivery log. */
@ApiTags('Integration settings')
@ApiBearerAuth()
@Controller('integration-settings')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class IntegrationSettingsController {
  constructor(private readonly settings: IntegrationSettingsService) {}

  @Get('catalog')
  @Permissions('settings.view')
  catalog() {
    return this.settings.catalog();
  }

  @Get('api-keys')
  @Permissions('settings.view')
  listKeys(@CurrentOrg() orgId: string) {
    return this.settings.listKeys(orgId);
  }

  @Post('api-keys')
  @Permissions('settings.edit')
  @ApiOperation({ summary: 'Create a key; the plaintext is in the response once' })
  createKey(
    @CurrentOrg() orgId: string,
    @CurrentUser() user: CurrentUserData,
    @Body() dto: CreateApiKeyDto,
  ) {
    return this.settings.createKey(orgId, user, dto);
  }

  @Post('api-keys/:id/revoke')
  @Permissions('settings.edit')
  revokeKey(@CurrentOrg() orgId: string, @Param('id') id: string) {
    return this.settings.revokeKey(orgId, id);
  }

  @Get('webhooks')
  @Permissions('settings.view')
  listEndpoints(@CurrentOrg() orgId: string) {
    return this.settings.listEndpoints(orgId);
  }

  @Post('webhooks')
  @Permissions('settings.edit')
  createEndpoint(
    @CurrentOrg() orgId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: CreateWebhookEndpointDto,
  ) {
    return this.settings.createEndpoint(orgId, userId, dto);
  }

  @Patch('webhooks/:id')
  @Permissions('settings.edit')
  updateEndpoint(
    @CurrentOrg() orgId: string,
    @Param('id') id: string,
    @Body() dto: UpdateWebhookEndpointDto,
  ) {
    return this.settings.updateEndpoint(orgId, id, dto);
  }

  @Delete('webhooks/:id')
  @Permissions('settings.edit')
  deleteEndpoint(@CurrentOrg() orgId: string, @Param('id') id: string) {
    return this.settings.deleteEndpoint(orgId, id);
  }

  @Post('webhooks/:id/test')
  @Permissions('settings.edit')
  @ApiOperation({ summary: 'Send a signed mizano.test event now' })
  sendTest(@CurrentOrg() orgId: string, @Param('id') id: string) {
    return this.settings.sendTest(orgId, id);
  }

  @Get('deliveries')
  @Permissions('settings.view')
  listDeliveries(@CurrentOrg() orgId: string, @Query() query: DeliveryQueryDto) {
    return this.settings.listDeliveries(orgId, query);
  }

  @Post('deliveries/:id/redeliver')
  @Permissions('settings.edit')
  redeliver(@CurrentOrg() orgId: string, @Param('id') id: string) {
    return this.settings.redeliver(orgId, id);
  }
}
