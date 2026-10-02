import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { RecurringProfilesService } from '../services/recurring-profiles.service';
import { CreateRecurringProfileDto } from '../dto/create-recurring-profile.dto';
import { RecurringProfileQueryDto } from '../dto/recurring-profile-query.dto';
import { ExecuteRecurringProfileDto } from '../dto/execute-recurring-profile.dto';
import { UpdateRecurringProfileDto } from '../dto/update-recurring-profile.dto';
import { CurrentOrg, Permissions } from '../../../common/decorators';
import { CurrentUser, CurrentUserData } from '../../../common/decorators/current-user.decorator';
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

  @Get('statistics')
  @Permissions('accounting.view')
  @ApiOperation({ summary: 'Get recurring profile statistics' })
  getStatistics(@CurrentOrg() orgId: string) {
    return this.recurringProfilesService.getStatistics(orgId);
  }

  @Get('upcoming')
  @Permissions('accounting.view')
  @ApiOperation({ summary: 'Get upcoming recurring profile executions' })
  getUpcoming(@CurrentOrg() orgId: string, @Query('days') days?: string) {
    return this.recurringProfilesService.getUpcoming(orgId, days ? parseInt(days, 10) : undefined);
  }

  @Get()
  @Permissions('accounting.view')
  @ApiOperation({ summary: 'Get all recurring profiles' })
  findAll(@CurrentOrg() orgId: string, @Query() query: RecurringProfileQueryDto) {
    return this.recurringProfilesService.findAll(orgId, query);
  }

  @Get(':id/executions')
  @Permissions('accounting.view')
  @ApiOperation({ summary: 'Get execution history for a recurring profile' })
  getExecutionHistory(
    @CurrentOrg() orgId: string,
    @Param('id') id: string,
    @Query('limit') limit?: string,
  ) {
    return this.recurringProfilesService.getExecutionHistory(
      orgId,
      id,
      limit ? parseInt(limit, 10) : undefined,
    );
  }

  @Post(':id/execute')
  @Permissions('accounting.edit')
  @ApiOperation({ summary: 'Manually execute a recurring profile' })
  executeProfile(
    @CurrentOrg() orgId: string,
    @CurrentUser() user: CurrentUserData,
    @Param('id') id: string,
    @Body() dto: ExecuteRecurringProfileDto,
  ) {
    return this.recurringProfilesService.executeProfile(orgId, id, dto.idempotencyKey, user.id);
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
