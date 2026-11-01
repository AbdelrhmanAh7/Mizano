import { Controller, Post, Body, UseGuards, HttpCode, HttpStatus, Req } from '@nestjs/common';
import type { Request } from 'express';
import { clientAddressOf } from '../../throttler-ip.guard';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { ForgotPasswordDto, ResetPasswordDto } from './dto/password.dto';
import { PasswordResetService } from './password-reset.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Public } from '../../common/decorators';
import { JwtRefreshGuard } from './guards/jwt-refresh.guard';
import { CurrentUser, CurrentUserData } from '../../common/decorators';

/**
 * Sign-ins and sign-ups per client address per minute. 5 by default (brute-force guard); a test
 * copy that many automated browsers reach from one address may raise it (AUTH_RATE_LIMIT_PER_MIN).
 */
export function authRateLimitPerMinute(
  raw: string | undefined = process.env.AUTH_RATE_LIMIT_PER_MIN,
): number {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 && n <= 1000 ? n : 5;
}

@ApiTags('Authentication')
@Controller('auth')
@Throttle({ short: { ttl: 60000, limit: authRateLimitPerMinute() } })
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly passwordReset: PasswordResetService,
  ) {}

  @Public()
  @Post('register')
  @ApiOperation({ summary: 'Register a new user and organization' })
  async register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login with email and password' })
  async login(@Body() loginDto: LoginDto, @Req() req: Request) {
    // The same client address the rate limit uses (the browser's, through the trusted proxies).
    return this.authService.login(
      loginDto,
      clientAddressOf(req as unknown as Record<string, unknown>),
    );
  }

  @Public()
  @Post('refresh')
  @SkipThrottle({ short: true, long: true })
  @UseGuards(JwtRefreshGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access token' })
  @ApiBearerAuth()
  async refreshToken(
    @CurrentUser() user: CurrentUserData,
    @Body() refreshTokenDto: RefreshTokenDto,
  ) {
    return this.authService.refreshTokens(user.id, user.sessionId, refreshTokenDto.refreshToken);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sign out this device only' })
  @ApiBearerAuth()
  async logout(@CurrentUser() user: CurrentUserData) {
    return this.authService.logout(user.id, user.sessionId);
  }

  @Post('logout-all')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sign out on every device' })
  @ApiBearerAuth()
  async logoutAll(@CurrentUser() user: CurrentUserData) {
    return this.authService.logoutAll(user.id);
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  // Per address: 5 requests per 15 minutes (the service also caps links per account).
  @Throttle({ short: { ttl: 15 * 60_000, limit: 5 } })
  @ApiOperation({ summary: 'Email a password reset link (same answer for unknown emails)' })
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.passwordReset.request(dto);
  }

  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Set a new password with a reset link' })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.passwordReset.reset(dto.token, dto.password);
  }
}
