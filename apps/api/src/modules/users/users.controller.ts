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
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import type { Request } from 'express';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { CurrentOrg, CurrentUser, CurrentUserData, Permissions } from '../../common/decorators';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { PasswordResetService } from '../auth/password-reset.service';
import { MemberResetLinkDto } from '../auth/dto/password.dto';
import { requestLocale } from '../../common/i18n/request-locale';

@ApiTags('Users')
@ApiBearerAuth()
@Controller('users')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly passwordReset: PasswordResetService,
  ) {}

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

  @Post(':id/reset-link')
  @HttpCode(HttpStatus.OK)
  @Permissions('settings.edit')
  @ApiOperation({ summary: 'Create a one-time password reset link to hand to a member' })
  createResetLink(
    @CurrentOrg() orgId: string,
    @CurrentUser() actor: CurrentUserData,
    @Param('id') id: string,
    @Body() dto: MemberResetLinkDto,
    @Req() request: Request,
  ) {
    const locale = dto?.locale ?? requestLocale(request);
    return this.passwordReset.createLinkForMember(orgId, actor.id, id, locale);
  }

  @Delete(':id')
  @Permissions('settings.delete')
  @ApiOperation({ summary: 'Delete user' })
  remove(@CurrentOrg() orgId: string, @Param('id') id: string) {
    return this.usersService.remove(orgId, id);
  }
}
