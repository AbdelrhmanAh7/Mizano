import {
  Controller,
  Get,
  Patch,
  Body,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { OrganizationsService } from './organizations.service';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { UpdateAccountSettingsDto } from './dto/update-account-settings.dto';
import { CurrentOrg, Permissions } from '../../common/decorators';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';

@ApiTags('Organization')
@ApiBearerAuth()
@Controller('organization')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @Get()
  @Permissions('settings.view')
  @ApiOperation({ summary: 'Get current organization details' })
  findOne(@CurrentOrg() orgId: string) {
    return this.organizationsService.findOne(orgId);
  }

  @Patch()
  @Permissions('settings.edit')
  @ApiOperation({ summary: 'Update organization details' })
  update(
    @CurrentOrg() orgId: string,
    @Body() updateOrganizationDto: UpdateOrganizationDto,
  ) {
    return this.organizationsService.update(orgId, updateOrganizationDto);
  }

  @Patch('lock-date')
  @Permissions('settings.edit')
  @ApiOperation({ summary: 'Set transaction lock date' })
  setLockDate(@CurrentOrg() orgId: string, @Body('lockDate') lockDate: Date) {
    return this.organizationsService.setLockDate(orgId, lockDate);
  }

  @Get('account-settings')
  @Permissions('settings.view')
  @ApiOperation({ summary: 'Get default account settings for accounting entries' })
  getAccountSettings(@CurrentOrg() orgId: string) {
    return this.organizationsService.getAccountSettings(orgId);
  }

  @Patch('account-settings')
  @Permissions('settings.edit')
  @ApiOperation({ summary: 'Update default account settings' })
  updateAccountSettings(
    @CurrentOrg() orgId: string,
    @Body() updateAccountSettingsDto: UpdateAccountSettingsDto,
  ) {
    return this.organizationsService.updateAccountSettings(orgId, updateAccountSettingsDto);
  }
}
