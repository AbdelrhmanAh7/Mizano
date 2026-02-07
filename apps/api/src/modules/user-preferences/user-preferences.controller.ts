import {
  Controller,
  Get,
  Patch,
  Post,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { UserPreferencesService } from './user-preferences.service';
import { UpdateTourProgressDto } from './dto/update-tour-progress.dto';
import { UserPreferencesDto } from './dto/user-preferences.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser, CurrentUserData } from '../../common/decorators';

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
    @Body() updateDto: UpdateTourProgressDto,
  ) {
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
  async dismissTour(
    @CurrentUser() user: CurrentUserData,
    @Param('tourId') tourId: string,
  ) {
    return this.userPreferencesService.dismissTour(user.id, tourId);
  }
}
