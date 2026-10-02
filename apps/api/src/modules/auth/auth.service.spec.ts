import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { AuthService } from './auth.service';

interface StoredUser {
  id: string;
  email: string;
  name: string;
  organizationId: string;
  roleId: string;
  status: string;
  refreshToken: string | null;
}

describe('AuthService refresh rotation', () => {
  let users: Map<string, StoredUser>;
  let service: AuthService;

  const prisma = {
    user: {
      findUnique: jest.fn(({ where }: { where: { id: string } }) =>
        Promise.resolve(users.has(where.id) ? { ...users.get(where.id) } : null),
      ),
      update: jest.fn(({ where, data }: { where: { id: string }; data: Partial<StoredUser> }) => {
        const user = users.get(where.id);
        if (user) Object.assign(user, data);
        return Promise.resolve(user);
      }),
      updateMany: jest.fn(
        ({
          where,
          data,
        }: {
          where: { id: string; refreshToken: string; status: string };
          data: Partial<StoredUser>;
        }) => {
          const user = users.get(where.id);
          if (!user || user.refreshToken !== where.refreshToken || user.status !== where.status) {
            return Promise.resolve({ count: 0 });
          }
          Object.assign(user, data);
          return Promise.resolve({ count: 1 });
        },
      ),
    },
  };

  const jwt = new JwtService({});
  const config = {
    get: (key: string, fallback?: string): string | undefined =>
      ({ JWT_SECRET: 'a', JWT_REFRESH_SECRET: 'b' })[key] ?? fallback,
  } as unknown as ConfigService;

  async function seed(id: string): Promise<string> {
    const token = await jwt.signAsync({ sub: id }, { secret: 'b', jwtid: `seed-${id}` });
    users.set(id, {
      id,
      email: `${id}@x.test`,
      name: id,
      organizationId: `org-${id}`,
      roleId: 'r',
      status: 'ACTIVE',
      refreshToken: createHash('sha256').update(token).digest('hex'),
    });
    return token;
  }

  beforeEach(() => {
    users = new Map();
    service = new AuthService(prisma as never, jwt, config);
  });

  it('rotates per user and rejects the old token afterwards', async () => {
    const tokenA = await seed('a');
    const tokenB = await seed('b');

    const a = await service.refreshTokens('a', tokenA);
    const b = await service.refreshTokens('b', tokenB);

    expect(a.tokens.refreshToken).not.toEqual(tokenA);
    expect(a.tokens.refreshToken).not.toEqual(b.tokens.refreshToken);
    await expect(service.refreshTokens('a', tokenA)).rejects.toBeInstanceOf(UnauthorizedException);
    // B is unaffected by A's rotation and A's replay.
    await expect(service.refreshTokens('b', b.tokens.refreshToken)).resolves.toBeDefined();
  });

  it('lets only one of two concurrent refreshes with the same token win', async () => {
    const token = await seed('a');
    const results = await Promise.allSettled([
      service.refreshTokens('a', token),
      service.refreshTokens('a', token),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
  });

  it('issues distinct refresh tokens even within the same second', async () => {
    const token = await seed('a');
    const first = await service.refreshTokens('a', token);
    const second = await service.refreshTokens('a', first.tokens.refreshToken);
    expect(second.tokens.refreshToken).not.toEqual(first.tokens.refreshToken);
  });

  it('rejects after logout and for non-active users', async () => {
    const token = await seed('a');
    await service.logout('a');
    await expect(service.refreshTokens('a', token)).rejects.toBeInstanceOf(UnauthorizedException);

    const tokenB = await seed('b');
    const b = users.get('b');
    if (b) b.status = 'SUSPENDED';
    await expect(service.refreshTokens('b', tokenB)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects an unknown user and a wrong token', async () => {
    await seed('a');
    await expect(service.refreshTokens('zzz', 'x')).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(service.refreshTokens('a', 'wrong')).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
