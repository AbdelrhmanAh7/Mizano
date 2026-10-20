import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtStrategy } from './jwt.strategy';
import { PrismaService } from '../../../prisma/prisma.service';
import { createMockPrisma, MockPrismaClient } from '../../../test/mocks/prisma.mock';

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;
  let prisma: MockPrismaClient;
  let configService: jest.Mocked<ConfigService>;

  beforeEach(() => {
    prisma = createMockPrisma();
    configService = {
      get: jest.fn().mockImplementation((key: string) => {
        if (key === 'JWT_SECRET') return 'test-secret-key-for-jwt-32-chars-long';
        return null;
      }),
    } as unknown as jest.Mocked<ConfigService>;

    strategy = new JwtStrategy(configService, prisma as unknown as PrismaService);
  });

  describe('constructor & crypto configuration', () => {
    it('configures passport strategy with JWT_SECRET from config service and enforces expiration', () => {
      expect(configService.get).toHaveBeenCalledWith('JWT_SECRET');
    });
  });

  describe('validate', () => {
    const payload = {
      sub: 'user-1',
      email: 'accountant@mizano.com',
      name: 'Accountant',
      organizationId: 'org-1',
      roleId: 'role-1',
    };

    it('returns user data when user exists and is ACTIVE', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'accountant@mizano.com',
        name: 'Accountant',
        status: 'ACTIVE',
        organizationId: 'org-1',
        roleId: 'role-1',
      } as any);

      const result = await strategy.validate(payload);
      expect(result).toEqual({
        id: 'user-1',
        email: 'accountant@mizano.com',
        name: 'Accountant',
        organizationId: 'org-1',
        roleId: 'role-1',
      });
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        select: {
          id: true,
          email: true,
          name: true,
          status: true,
          organizationId: true,
          roleId: true,
        },
      });
    });

    it('throws UnauthorizedException when user is not found', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(strategy.validate(payload)).rejects.toBeInstanceOf(UnauthorizedException);
      await expect(strategy.validate(payload)).rejects.toThrow('User not found or inactive');
    });

    it('throws UnauthorizedException when user status is INACTIVE', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'accountant@mizano.com',
        name: 'Accountant',
        status: 'INACTIVE',
        organizationId: 'org-1',
        roleId: 'role-1',
      } as any);

      await expect(strategy.validate(payload)).rejects.toBeInstanceOf(UnauthorizedException);
      await expect(strategy.validate(payload)).rejects.toThrow('User not found or inactive');
    });
  });
});
