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
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { CurrentOrg, Permissions } from '../../common/decorators';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { PaginationDto } from '../../common/dto/pagination.dto';

@ApiTags('Users')
@ApiBearerAuth()
@Controller('users')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @Permissions('settings.create')
  @ApiOperation({ summary: 'Create a new user' })
  create(@CurrentOrg() orgId: string, @Body() createUserDto: CreateUserDto) {
    return this.usersService.create(orgId, createUserDto);
  }

  @Get()
  @Permissions('settings.view')
  @ApiOperation({ summary: 'Get all users' })
  findAll(@CurrentOrg() orgId: string, @Query() query: PaginationDto) {
    return this.usersService.findAll(orgId, query);
  }

  @Get(':id')
  @Permissions('settings.view')
  @ApiOperation({ summary: 'Get user by ID' })
  findOne(@CurrentOrg() orgId: string, @Param('id') id: string) {
    return this.usersService.findOne(orgId, id);
  }

  @Patch(':id')
  @Permissions('settings.edit')
  @ApiOperation({ summary: 'Update user' })
  update(
    @CurrentOrg() orgId: string,
    @Param('id') id: string,
    @Body() updateUserDto: UpdateUserDto,
  ) {
    return this.usersService.update(orgId, id, updateUserDto);
  }

  @Delete(':id')
  @Permissions('settings.delete')
  @ApiOperation({ summary: 'Delete user' })
  remove(@CurrentOrg() orgId: string, @Param('id') id: string) {
    return this.usersService.remove(orgId, id);
  }
}
