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
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { RolesService } from './roles.service';
import { CreateRoleDto, UpdateRoleDto, AssignRoleDto } from './dto';
import { JwtAuthGuard, PermissionsGuard } from '../../common/guards';
import { CurrentOrg, Permissions } from '../../common/decorators';

@ApiTags('Roles')
@ApiBearerAuth()
@Controller('roles')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new role' })
  @Permissions('settings.create')
  create(
    @CurrentOrg() organizationId: string,
    @Body() createRoleDto: CreateRoleDto,
  ) {
    return this.rolesService.create(organizationId, createRoleDto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all roles with pagination' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'sortBy', required: false, type: String })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['asc', 'desc'] })
  @Permissions('settings.view')
  findAll(
    @CurrentOrg() organizationId: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('search') search?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: 'asc' | 'desc',
  ) {
    return this.rolesService.findAll(organizationId, {
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      search,
      sortBy,
      sortOrder,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a role by ID' })
  @Permissions('settings.view')
  findOne(
    @CurrentOrg() organizationId: string,
    @Param('id') id: string,
  ) {
    return this.rolesService.findOne(organizationId, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a role' })
  @Permissions('settings.edit')
  update(
    @CurrentOrg() organizationId: string,
    @Param('id') id: string,
    @Body() updateRoleDto: UpdateRoleDto,
  ) {
    return this.rolesService.update(organizationId, id, updateRoleDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a role' })
  @Permissions('settings.delete')
  remove(
    @CurrentOrg() organizationId: string,
    @Param('id') id: string,
  ) {
    return this.rolesService.remove(organizationId, id);
  }

  @Post('seed-defaults')
  @ApiOperation({ summary: 'Seed default roles for the organization' })
  @Permissions('settings.create')
  seedDefaults(@CurrentOrg() organizationId: string) {
    return this.rolesService.seedDefaultRoles(organizationId);
  }

  @Post('assign')
  @ApiOperation({ summary: 'Assign a role to a user' })
  @Permissions('users.edit')
  assignRole(
    @CurrentOrg() organizationId: string,
    @Body() assignRoleDto: AssignRoleDto,
  ) {
    return this.rolesService.assignRole(organizationId, assignRoleDto);
  }
}
