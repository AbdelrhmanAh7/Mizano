import { Logger } from '@nestjs/common';
import type { PrismaService } from '../../prisma/prisma.service';
import type { AccountsService } from '../accounting/services/accounts.service';
import type { AuthSessionsService } from './auth-sessions.service';
import { AuthService } from './auth.service';
import type { RegisterDto } from './dto/register.dto';

jest.mock('bcrypt', () => ({ hash: jest.fn().mockResolvedValue('hashed') }));

const ORG = { id: 'org-1', name: 'Nile Trading' };
const USER = {
  id: 'user-1',
  email: 'owner@nile.test',
  name: 'Omar Hassan',
  organizationId: ORG.id,
  roleId: 'role-1',
};

function setup() {
  const tx = {
    organization: { create: jest.fn().mockResolvedValue(ORG) },
    role: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'role-1' }),
    },
    user: { create: jest.fn().mockResolvedValue(USER) },
  };
  const prisma = {
    user: { findFirst: jest.fn().mockResolvedValue(null) },
    $transaction: jest.fn((run: (client: typeof tx) => Promise<unknown>) => run(tx)),
  };
  const sessions = {
    start: jest.fn().mockResolvedValue({ accessToken: 'a', refreshToken: 'r' }),
  };
  const accounts = { seedDefaultAccounts: jest.fn().mockResolvedValue({ accounts: [] }) };
  const service = new AuthService(
    prisma as unknown as PrismaService,
    sessions as unknown as AuthSessionsService,
    accounts as unknown as AccountsService,
  );
  return { service, tx, accounts, sessions };
}

const dto: RegisterDto = {
  email: USER.email,
  password: 'Password1',
  firstName: 'Omar',
  lastName: 'Hassan',
  organizationName: ORG.name,
};

describe('AuthService.register', () => {
  let warn: jest.SpyInstance;

  beforeEach(() => {
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => warn.mockRestore());

  it('starts an Egyptian organization in EGP on Cairo time and prepares its accounts', async () => {
    const { service, tx, accounts } = setup();

    await service.register({ ...dto, country: 'EG' });

    expect(tx.organization.create).toHaveBeenCalledWith({
      data: {
        name: ORG.name,
        currency: 'EGP',
        baseCurrency: 'EGP',
        country: 'EG',
        timezone: 'Africa/Cairo',
      },
    });
    expect(accounts.seedDefaultAccounts).toHaveBeenCalledWith(ORG.id);
  });

  it('gives a new organization all five standard roles, so the accountant can have her own (#630)', async () => {
    const { service, tx } = setup();

    await service.register({ ...dto, country: 'EG' });

    const names = tx.role.create.mock.calls.map(
      ([arg]: [{ data: { name: string } }]) => arg.data.name,
    );
    expect(names).toEqual(['Admin', 'Manager', 'Accountant', 'SalesRep', 'StoreKeeper']);
    expect(tx.user.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ roleId: 'role-1' }) }),
    );
  });

  it('keeps the USD start and the default time zone without a country', async () => {
    const { service, tx, accounts } = setup();

    await service.register(dto);

    expect(tx.organization.create).toHaveBeenCalledWith({
      data: { name: ORG.name, currency: 'USD', baseCurrency: 'USD' },
    });
    expect(accounts.seedDefaultAccounts).toHaveBeenCalledWith(ORG.id);
  });

  it('still signs the owner up when the chart of accounts cannot be created', async () => {
    const { service, accounts, sessions } = setup();
    accounts.seedDefaultAccounts.mockRejectedValue(new Error('owner@nile.test secret detail'));

    const result = await service.register({ ...dto, country: 'SA' });

    expect(result.tokens).toEqual({ accessToken: 'a', refreshToken: 'r' });
    expect(sessions.start).toHaveBeenCalledWith(USER);
    expect(warn).toHaveBeenCalledTimes(1);
    // The failure is logged without its message, which may carry personal data.
    expect(String(warn.mock.calls[0][0])).not.toContain('secret detail');
  });
});

describe('AuthService.login failed-attempt cap (#639)', () => {
  it('refuses an account at one address after 10 failed sign-ins without reading the database again', async () => {
    const { service } = setup();
    const prisma = (service as unknown as { prisma: { user: { findFirst: jest.Mock } } }).prisma;
    for (let i = 0; i < 10; i++) {
      await expect(
        service.login({ email: 'Guess@Nile.test', password: 'x' }),
      ).rejects.toMatchObject({
        status: 401,
      });
    }
    prisma.user.findFirst.mockClear();
    await expect(service.login({ email: 'guess@nile.test', password: 'x' })).rejects.toMatchObject({
      status: 429,
    });
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
    // Another account is not affected, and neither is the same account from another address.
    await expect(service.login({ email: 'other@nile.test', password: 'x' })).rejects.toMatchObject({
      status: 401,
    });
    await expect(
      service.login({ email: 'guess@nile.test', password: 'x' }, '198.51.100.9'),
    ).rejects.toMatchObject({ status: 401 });
  });
});

describe('AuthService.login concurrent guesses (#639)', () => {
  it('lets at most 10 of many simultaneous guesses reach the password check', async () => {
    const { service } = setup();
    const prisma = (service as unknown as { prisma: { user: { findFirst: jest.Mock } } }).prisma;
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    prisma.user.findFirst.mockImplementation(async () => {
      await gate;
      return null;
    });
    const attempts = Array.from({ length: 25 }, () =>
      service
        .login({ email: 'race@nile.test', password: 'x' })
        .catch((e: { status: number }) => e.status),
    );
    release();
    const statuses = await Promise.all(attempts);
    expect(statuses.filter((s) => s === 401)).toHaveLength(10);
    expect(statuses.filter((s) => s === 429)).toHaveLength(15);
    expect(prisma.user.findFirst).toHaveBeenCalledTimes(10);
  });
});
