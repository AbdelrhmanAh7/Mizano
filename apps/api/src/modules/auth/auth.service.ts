import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  async register(registerDto: RegisterDto) {
    const { email, password, firstName, lastName, organizationName } = registerDto;
    const name = `${firstName} ${lastName}`;

    // Check if email already exists
    const existingUser = await this.prisma.user.findFirst({
      where: { email },
    });

    if (existingUser) {
      throw new ConflictException('Email already registered');
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Create organization, default role, and user in a transaction
    const result = await this.prisma.$transaction(async (tx) => {
      // Create organization
      const organization = await tx.organization.create({
        data: {
          name: organizationName,
          currency: 'USD',
        },
      });

      // Create default admin role
      const adminRole = await tx.role.create({
        data: {
          name: 'Admin',
          description: 'Full system access',
          isDefault: true,
          organizationId: organization.id,
          permissions: {
            create: [
              { module: 'accounting', actions: ['view', 'create', 'edit', 'delete', 'export'] },
              { module: 'sales', actions: ['view', 'create', 'edit', 'delete', 'export'] },
              { module: 'purchases', actions: ['view', 'create', 'edit', 'delete', 'export'] },
              { module: 'inventory', actions: ['view', 'create', 'edit', 'delete', 'export'] },
              { module: 'banking', actions: ['view', 'create', 'edit', 'delete', 'export'] },
              { module: 'hr', actions: ['view', 'create', 'edit', 'delete', 'export'] },
              { module: 'manufacturing', actions: ['view', 'create', 'edit', 'delete', 'export'] },
              { module: 'projects', actions: ['view', 'create', 'edit', 'delete', 'export'] },
              { module: 'tax', actions: ['view', 'create', 'edit', 'delete', 'export'] },
              { module: 'reports', actions: ['view', 'export'] },
              { module: 'crm', actions: ['view', 'create', 'edit', 'delete', 'export'] },
              { module: 'settings', actions: ['view', 'create', 'edit', 'delete'] },
            ],
          },
        },
      });

      // Create user
      const user = await tx.user.create({
        data: {
          email,
          passwordHash,
          name,
          roleId: adminRole.id,
          organizationId: organization.id,
        },
      });

      return { organization, user };
    });

    // Generate tokens
    const tokens = await this.generateTokens(
      result.user.id,
      result.user.email,
      result.user.name,
      result.organization.id,
      result.user.roleId,
    );

    // Save refresh token
    await this.prisma.user.update({
      where: { id: result.user.id },
      data: { refreshToken: await bcrypt.hash(tokens.refreshToken, 10) },
    });

    return {
      user: {
        id: result.user.id,
        email: result.user.email,
        name: result.user.name,
        organizationId: result.organization.id,
      },
      organization: {
        id: result.organization.id,
        name: result.organization.name,
      },
      tokens,
    };
  }

  async login(loginDto: LoginDto) {
    const { email, password } = loginDto;

    // Find user
    const user = await this.prisma.user.findFirst({
      where: { email },
      include: {
        organization: true,
        role: {
          include: { permissions: true },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Account is not active');
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    // Generate tokens
    const tokens = await this.generateTokens(
      user.id,
      user.email,
      user.name,
      user.organizationId,
      user.roleId,
    );

    // Save refresh token
    await this.prisma.user.update({
      where: { id: user.id },
      data: { refreshToken: await bcrypt.hash(tokens.refreshToken, 10) },
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        status: user.status,
        organizationId: user.organizationId,
        role: {
          id: user.role.id,
          name: user.role.name,
          permissions: user.role.permissions,
        },
      },
      organization: {
        id: user.organization.id,
        name: user.organization.name,
        currency: user.organization.currency,
      },
      tokens,
    };
  }

  async logout(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshToken: null },
    });
    return { message: 'Logged out successfully' };
  }

  async refreshTokens(userId: string, refreshToken: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || !user.refreshToken) {
      throw new UnauthorizedException('Access denied');
    }

    const isRefreshTokenValid = await bcrypt.compare(refreshToken, user.refreshToken);
    if (!isRefreshTokenValid) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    // Generate new tokens
    const tokens = await this.generateTokens(
      user.id,
      user.email,
      user.name,
      user.organizationId,
      user.roleId,
    );

    // Save new refresh token
    await this.prisma.user.update({
      where: { id: user.id },
      data: { refreshToken: await bcrypt.hash(tokens.refreshToken, 10) },
    });

    return { tokens };
  }

  async validateUser(email: string, password: string) {
    const user = await this.prisma.user.findFirst({
      where: { email },
    });

    if (user && (await bcrypt.compare(password, user.passwordHash))) {
      const { passwordHash: _passwordHash, refreshToken: _refreshToken, ...result } = user;
      return result;
    }
    return null;
  }

  private async generateTokens(
    userId: string,
    email: string,
    name: string,
    organizationId: string,
    roleId: string,
  ) {
    const payload = {
      sub: userId,
      email,
      name,
      organizationId,
      roleId,
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.configService.get('JWT_SECRET'),
        expiresIn: this.configService.get('JWT_EXPIRATION', '15m'),
      }),
      this.jwtService.signAsync(payload, {
        secret: this.configService.get('JWT_REFRESH_SECRET'),
        expiresIn: this.configService.get('JWT_REFRESH_EXPIRATION', '7d'),
      }),
    ]);

    return {
      accessToken,
      refreshToken,
    };
  }
}
