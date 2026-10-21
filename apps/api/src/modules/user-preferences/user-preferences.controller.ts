import {
  Controller,
  Get,
  Put,
  Patch,
  Post,
  Body,
  Param,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Request } from 'express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { UserPreferencesService } from './user-preferences.service';
import { UpdateTourProgressDto } from './dto/update-tour-progress.dto';
import { UpdateDashboardLayoutDto } from './dto/update-dashboard-layout.dto';
import { UserPreferencesDto } from './dto/user-preferences.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser, CurrentUserData } from '../../common/decorators';
import { BadRequestException } from '@nestjs/common';

@ApiTags('User Preferences')
@Controller('user/preferences')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class UserPreferencesController {
  constructor(private readonly userPreferencesService: UserPreferencesService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get current user preferences' })
  @ApiResponse({
    status: 200,
    description: 'User preferences retrieved successfully',
    type: UserPreferencesDto,
  })
  async getUserPreferences(@CurrentUser() user: CurrentUserData) {
    return this.userPreferencesService.getUserPreferences(user.id);
  }

  @Get('dashboard-layout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get dashboard layout configuration' })
  @ApiResponse({
    status: 200,
    description: 'Dashboard layout retrieved successfully',
  })
  async getDashboardLayout(@CurrentUser() user: CurrentUserData) {
    return this.userPreferencesService.getDashboardLayout(user.id);
  }

  @Put('dashboard-layout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update dashboard layout configuration' })
  @ApiResponse({
    status: 200,
    description: 'Dashboard layout updated successfully',
  })
  async updateDashboardLayout(
    @CurrentUser() user: CurrentUserData,
    @Body() body: UpdateDashboardLayoutDto,
  ) {
    return this.userPreferencesService.updateDashboardLayout(user.id, body);
  }

  @Patch('tour/:tourId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update tour progress for a specific tour' })
  @ApiResponse({
    status: 200,
    description: 'Tour progress updated successfully',
    type: UserPreferencesDto,
  })
  async updateTourProgress(
    @CurrentUser() user: CurrentUserData,
    @Param('tourId') tourId: string,
    @Req() req: Request,
    @Body() updateDto: UpdateTourProgressDto,
  ) {
    // Strict boolean validation: check raw body before ValidationPipe transforms it
    const rawCompleted = req.body?.completed;
    if (typeof rawCompleted !== 'boolean') {
      throw new BadRequestException('completed must be a boolean (true or false)');
    }
    return this.userPreferencesService.updateTourProgress(user.id, tourId, updateDto);
  }

  @Post('tour/:tourId/dismiss')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Dismiss a tour' })
  @ApiResponse({
    status: 200,
    description: 'Tour dismissed successfully',
    type: UserPreferencesDto,
  })
  async dismissTour(@CurrentUser() user: CurrentUserData, @Param('tourId') tourId: string) {
    return this.userPreferencesService.dismissTour(user.id, tourId);
  }
}
