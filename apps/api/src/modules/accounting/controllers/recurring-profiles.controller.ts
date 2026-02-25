import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { RecurringProfilesService } from '../services/recurring-profiles.service';
import { CreateRecurringProfileDto } from '../dto/create-recurring-profile.dto';
import { UpdateRecurringProfileDto } from '../dto/update-recurring-profile.dto';
import { CurrentOrg, Permissions } from '../../../common/decorators';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';

@ApiTags('Recurring Profiles')
@ApiBearerAuth()
@Controller('recurring-profiles')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class RecurringProfilesController {
  constructor(private readonly recurringProfilesService: RecurringProfilesService) {}

  @Post()
  @Permissions('accounting.create')
  @ApiOperation({ summary: 'Create a new recurring profile' })
  create(
    @CurrentOrg() orgId: string,
    @Body() createRecurringProfileDto: CreateRecurringProfileDto,
  ) {
    return this.recurringProfilesService.create(orgId, createRecurringProfileDto);
  }

  @Get()
  @Permissions('accounting.view')
  @ApiOperation({ summary: 'Get all recurring profiles' })
  findAll(@CurrentOrg() orgId: string) {
    return this.recurringProfilesService.findAll(orgId);
  }

  @Get(':id')
  @Permissions('accounting.view')
  @ApiOperation({ summary: 'Get recurring profile by ID' })
  findOne(@CurrentOrg() orgId: string, @Param('id') id: string) {
    return this.recurringProfilesService.findOne(orgId, id);
  }

  @Patch(':id')
  @Permissions('accounting.edit')
  @ApiOperation({ summary: 'Update recurring profile' })
  update(
    @CurrentOrg() orgId: string,
    @Param('id') id: string,
    @Body() updateRecurringProfileDto: UpdateRecurringProfileDto,
  ) {
    return this.recurringProfilesService.update(orgId, id, updateRecurringProfileDto);
  }

  @Patch(':id/toggle')
  @Permissions('accounting.edit')
  @ApiOperation({ summary: 'Toggle recurring profile active status' })
  toggle(@CurrentOrg() orgId: string, @Param('id') id: string) {
    return this.recurringProfilesService.toggle(orgId, id);
  }

  @Delete(':id')
  @Permissions('accounting.delete')
  @ApiOperation({ summary: 'Delete recurring profile' })
  remove(@CurrentOrg() orgId: string, @Param('id') id: string) {
    return this.recurringProfilesService.remove(orgId, id);
  }
}
