import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { PrismaService } from '../../prisma/prisma.service';
import { createMockPrisma, MockPrismaClient } from '../../test/mocks/prisma.mock';

jest.mock('bcrypt');

describe('AuthService', () => {
  let service: AuthService;
  let prisma: MockPrismaClient;
  let jwtService: { signAsync: jest.Mock };
  let configService: { get: jest.Mock };

  const mockedBcrypt = bcrypt as jest.Mocked<typeof bcrypt>;

  beforeEach(async () => {
    prisma = createMockPrisma();
    jwtService = {
      signAsync: jest.fn(),
    };
    configService = {
      get: jest.fn((key: string, defaultValue?: string) => {
        const map: Record<string, string> = {
          JWT_SECRET: 'test-jwt-secret',
          JWT_REFRESH_SECRET: 'test-refresh-secret',
          JWT_EXPIRATION: '15m',
          JWT_REFRESH_EXPIRATION: '7d',
        };
        return map[key] || defaultValue;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwtService },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);

    // Default bcrypt mocks
    (mockedBcrypt.hash as jest.Mock).mockResolvedValue('hashed-password');
    (mockedBcrypt.compare as jest.Mock).mockResolvedValue(true);
    jwtService.signAsync
      .mockResolvedValueOnce('access-token-value')
      .mockResolvedValueOnce('refresh-token-value');
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('register', () => {
    const registerDto = {
      email: 'new@mizano.com',
      password: 'Password123',
      firstName: 'John',
      lastName: 'Doe',
      organizationName: 'Acme Corp',
    };

    it('should register a new user with organization and tokens', async () => {
      prisma.user.findFirst.mockResolvedValue(null);

      const mockOrg = { id: 'org-1', name: 'Acme Corp', currency: 'USD' };
      const mockRole = { id: 'role-1', name: 'Admin' };
      const mockUser = {
        id: 'user-1',
        email: 'new@mizano.com',
        name: 'John Doe',
        roleId: 'role-1',
        organizationId: 'org-1',
      };

      // Transaction mocks (the mock passes the same prisma object to the callback)
      prisma.organization.create.mockResolvedValue(mockOrg as any);
      prisma.role.create.mockResolvedValue(mockRole as any);
      prisma.user.create.mockResolvedValue(mockUser as any);
      prisma.user.update.mockResolvedValue({} as any);

      const result = await service.register(registerDto);

      expect(result.user.id).toBe('user-1');
      expect(result.user.email).toBe('new@mizano.com');
      expect(result.user.name).toBe('John Doe');
      expect(result.organization.id).toBe('org-1');
      expect(result.organization.name).toBe('Acme Corp');
      expect(result.tokens.accessToken).toBe('access-token-value');
      expect(result.tokens.refreshToken).toBe('refresh-token-value');
    });

    it('should hash the password with bcrypt before storing', async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      prisma.organization.create.mockResolvedValue({ id: 'org-1', name: 'Acme Corp' } as any);
      prisma.role.create.mockResolvedValue({ id: 'role-1' } as any);
      prisma.user.create.mockResolvedValue({
        id: 'user-1',
        email: 'new@mizano.com',
        name: 'John Doe',
        roleId: 'role-1',
        organizationId: 'org-1',
      } as any);
      prisma.user.update.mockResolvedValue({} as any);

      await service.register(registerDto);

      expect(mockedBcrypt.hash).toHaveBeenCalledWith('Password123', 10);
    });

    it('should throw ConflictException when email already exists', async () => {
      prisma.user.findFirst.mockResolvedValue({ id: 'existing-user' } as any);

      await expect(service.register(registerDto)).rejects.toThrow(ConflictException);
      await expect(service.register(registerDto)).rejects.toThrow('Email already registered');
    });

    it('should create organization, role, and user in a transaction', async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      prisma.organization.create.mockResolvedValue({ id: 'org-1', name: 'Acme Corp' } as any);
      prisma.role.create.mockResolvedValue({ id: 'role-1' } as any);
      prisma.user.create.mockResolvedValue({
        id: 'user-1',
        email: 'new@mizano.com',
        name: 'John Doe',
        roleId: 'role-1',
        organizationId: 'org-1',
      } as any);
      prisma.user.update.mockResolvedValue({} as any);

      await service.register(registerDto);

      expect(prisma.$transaction).toHaveBeenCalled();
      expect(prisma.organization.create).toHaveBeenCalled();
      expect(prisma.role.create).toHaveBeenCalled();
      expect(prisma.user.create).toHaveBeenCalled();
    });

    it('should save hashed refresh token after registration', async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      prisma.organization.create.mockResolvedValue({ id: 'org-1', name: 'Acme Corp' } as any);
      prisma.role.create.mockResolvedValue({ id: 'role-1' } as any);
      prisma.user.create.mockResolvedValue({
        id: 'user-1',
        email: 'new@mizano.com',
        name: 'John Doe',
        roleId: 'role-1',
        organizationId: 'org-1',
      } as any);
      prisma.user.update.mockResolvedValue({} as any);

      await service.register(registerDto);

      // user.update should be called to save the hashed refresh token
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user-1' },
          data: { refreshToken: 'hashed-password' },
        }),
      );
    });

    it('should set user name as concatenation of firstName and lastName', async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      prisma.organization.create.mockResolvedValue({ id: 'org-1', name: 'Acme Corp' } as any);
      prisma.role.create.mockResolvedValue({ id: 'role-1' } as any);
      prisma.user.create.mockResolvedValue({
        id: 'user-1',
        email: 'new@mizano.com',
        name: 'John Doe',
        roleId: 'role-1',
        organizationId: 'org-1',
      } as any);
      prisma.user.update.mockResolvedValue({} as any);

      await service.register(registerDto);

      const createCall = prisma.user.create.mock.calls[0][0];
      expect(createCall.data.name).toBe('John Doe');
    });
  });

  describe('login', () => {
    const loginDto = { email: 'test@mizano.com', password: 'Password123' };

    const mockUser = {
      id: 'user-1',
      email: 'test@mizano.com',
      name: 'Test User',
      passwordHash: 'hashed-password',
      status: 'ACTIVE',
      organizationId: 'org-1',
      roleId: 'role-1',
      organization: { id: 'org-1', name: 'Test Org', currency: 'USD' },
      role: { id: 'role-1', name: 'Admin', permissions: [{ module: 'sales', actions: ['view'] }] },
    };

    it('should return user, organization, and tokens on successful login', async () => {
      prisma.user.findFirst.mockResolvedValue(mockUser as any);
      prisma.user.update.mockResolvedValue({} as any);

      const result = await service.login(loginDto);

      expect(result.user.id).toBe('user-1');
      expect(result.user.email).toBe('test@mizano.com');
      expect(result.user.role.name).toBe('Admin');
      expect(result.organization.id).toBe('org-1');
      expect(result.tokens.accessToken).toBe('access-token-value');
      expect(result.tokens.refreshToken).toBe('refresh-token-value');
    });

    it('should throw UnauthorizedException when user is not found', async () => {
      prisma.user.findFirst.mockResolvedValue(null);

      await expect(service.login(loginDto)).rejects.toThrow(UnauthorizedException);
      await expect(service.login(loginDto)).rejects.toThrow('Invalid email or password');
    });

    it('should throw UnauthorizedException when account is not active', async () => {
      prisma.user.findFirst.mockResolvedValue({ ...mockUser, status: 'INACTIVE' } as any);

      await expect(service.login(loginDto)).rejects.toThrow(UnauthorizedException);
      await expect(service.login(loginDto)).rejects.toThrow('Account is not active');
    });

    it('should throw UnauthorizedException when password is invalid', async () => {
      prisma.user.findFirst.mockResolvedValue(mockUser as any);
      (mockedBcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(service.login(loginDto)).rejects.toThrow(UnauthorizedException);
      await expect(service.login(loginDto)).rejects.toThrow('Invalid email or password');
    });

    it('should verify password with bcrypt.compare', async () => {
      prisma.user.findFirst.mockResolvedValue(mockUser as any);
      prisma.user.update.mockResolvedValue({} as any);

      await service.login(loginDto);

      expect(mockedBcrypt.compare).toHaveBeenCalledWith('Password123', 'hashed-password');
    });

    it('should save hashed refresh token after login', async () => {
      prisma.user.findFirst.mockResolvedValue(mockUser as any);
      prisma.user.update.mockResolvedValue({} as any);

      await service.login(loginDto);

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user-1' },
          data: { refreshToken: expect.any(String) },
        }),
      );
    });

    it('should include role permissions in login response', async () => {
      prisma.user.findFirst.mockResolvedValue(mockUser as any);
      prisma.user.update.mockResolvedValue({} as any);

      const result = await service.login(loginDto);

      expect(result.user.role.permissions).toEqual([{ module: 'sales', actions: ['view'] }]);
    });
  });

  describe('logout', () => {
    it('should clear the refresh token', async () => {
      prisma.user.update.mockResolvedValue({} as any);

      const result = await service.logout('user-1');

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { refreshToken: null },
      });
      expect(result.message).toBe('Logged out successfully');
    });
  });

  describe('refreshTokens', () => {
    const mockUser = {
      id: 'user-1',
      email: 'test@mizano.com',
      name: 'Test User',
      organizationId: 'org-1',
      roleId: 'role-1',
      refreshToken: 'hashed-refresh-token',
    };

    it('should generate new tokens when refresh token is valid', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser as any);
      prisma.user.update.mockResolvedValue({} as any);

      const result = await service.refreshTokens('user-1', 'valid-refresh-token');

      expect(result.tokens.accessToken).toBe('access-token-value');
      expect(result.tokens.refreshToken).toBe('refresh-token-value');
    });

    it('should throw UnauthorizedException when user is not found', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.refreshTokens('nonexistent', 'token')).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(service.refreshTokens('nonexistent', 'token')).rejects.toThrow('Access denied');
    });

    it('should throw UnauthorizedException when user has no stored refresh token', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...mockUser, refreshToken: null } as any);

      await expect(service.refreshTokens('user-1', 'token')).rejects.toThrow(UnauthorizedException);
      await expect(service.refreshTokens('user-1', 'token')).rejects.toThrow('Access denied');
    });

    it('should throw UnauthorizedException when refresh token does not match', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser as any);
      (mockedBcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(service.refreshTokens('user-1', 'wrong-token')).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(service.refreshTokens('user-1', 'wrong-token')).rejects.toThrow(
        'Invalid refresh token',
      );
    });

    it('should save new hashed refresh token after refresh', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser as any);
      prisma.user.update.mockResolvedValue({} as any);

      await service.refreshTokens('user-1', 'valid-refresh-token');

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user-1' },
          data: { refreshToken: 'hashed-password' },
        }),
      );
    });
  });

  describe('validateUser', () => {
    it('should return user without passwordHash and refreshToken when valid', async () => {
      const user = {
        id: 'user-1',
        email: 'test@mizano.com',
        name: 'Test User',
        passwordHash: 'hashed-pw',
        refreshToken: 'stored-rt',
        organizationId: 'org-1',
      };
      prisma.user.findFirst.mockResolvedValue(user as any);

      const result = await service.validateUser('test@mizano.com', 'Password123');

      expect(result).toBeDefined();
      expect(result).not.toHaveProperty('passwordHash');
      expect(result).not.toHaveProperty('refreshToken');
      expect(result).toHaveProperty('id', 'user-1');
      expect(result).toHaveProperty('email', 'test@mizano.com');
    });

    it('should return null when user is not found', async () => {
      prisma.user.findFirst.mockResolvedValue(null);

      const result = await service.validateUser('nonexistent@test.com', 'password');

      expect(result).toBeNull();
    });

    it('should return null when password does not match', async () => {
      prisma.user.findFirst.mockResolvedValue({
        id: 'user-1',
        passwordHash: 'hashed-pw',
      } as any);
      (mockedBcrypt.compare as jest.Mock).mockResolvedValue(false);

      const result = await service.validateUser('test@mizano.com', 'wrong-password');

      expect(result).toBeNull();
    });
  });

  describe('generateTokens (via login)', () => {
    it('should generate JWT tokens with correct payload', async () => {
      const mockUser = {
        id: 'user-1',
        email: 'test@mizano.com',
        name: 'Test User',
        passwordHash: 'hashed-password',
        status: 'ACTIVE',
        organizationId: 'org-1',
        roleId: 'role-1',
        organization: { id: 'org-1', name: 'Test Org', currency: 'USD' },
        role: { id: 'role-1', name: 'Admin', permissions: [] },
      };
      prisma.user.findFirst.mockResolvedValue(mockUser as any);
      prisma.user.update.mockResolvedValue({} as any);

      await service.login({ email: 'test@mizano.com', password: 'Password123' });

      const expectedPayload = {
        sub: 'user-1',
        email: 'test@mizano.com',
        name: 'Test User',
        organizationId: 'org-1',
        roleId: 'role-1',
      };

      // Access token
      expect(jwtService.signAsync).toHaveBeenCalledWith(expectedPayload, {
        secret: 'test-jwt-secret',
        expiresIn: '15m',
      });
      // Refresh token
      expect(jwtService.signAsync).toHaveBeenCalledWith(expectedPayload, {
        secret: 'test-refresh-secret',
        expiresIn: '7d',
      });
    });
  });
});
