import { Injectable, Logger, UnauthorizedException, ConflictException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { AccountsService } from '../accounting/services/accounts.service';
import { describeError } from '../../common/utils/redact';
import { organizationRegion } from './organization-region';
import { AuthSessionsService } from './auth-sessions.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private sessions: AuthSessionsService,
    private accounts: AccountsService,
  ) {}

  async register(registerDto: RegisterDto) {
    const { email, password, firstName, lastName, organizationName, country } = registerDto;
    const region = organizationRegion(country);
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
          // Both currency fields stay equal; the country chosen at sign-up sets them.
          currency: region.baseCurrency,
          baseCurrency: region.baseCurrency,
          ...(region.country ? { country: region.country } : {}),
          ...(region.timezone ? { timezone: region.timezone } : {}),
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

    // A ready chart of accounts with its defaults linked, so the first invoice can be issued.
    // Sign-up still succeeds without it; the owner can add it from the chart of accounts.
    try {
      await this.accounts.seedDefaultAccounts(result.organization.id);
    } catch (error) {
      this.logger.warn(
        `Default chart of accounts not created: ${describeError(error, { includeMessage: false })}`,
      );
    }

    const tokens = await this.sessions.start(result.user);

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

    // A new session per sign-in: other devices stay signed in.
    const tokens = await this.sessions.start(user);

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

  /** Ends only the session the request was made with. */
  async logout(userId: string, sessionId: string | undefined) {
    if (sessionId) await this.sessions.end(userId, sessionId, 'logout');
    return { message: 'Logged out successfully' };
  }

  /** Ends every session of the user, on every device. */
  async logoutAll(userId: string) {
    const sessions = await this.sessions.endAll(userId, 'logout_all');
    return { message: 'Signed out on all devices', sessions };
  }

  async refreshTokens(userId: string, sessionId: string | undefined, refreshToken: string) {
    const tokens = await this.sessions.rotate(userId, sessionId, refreshToken);
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
}
