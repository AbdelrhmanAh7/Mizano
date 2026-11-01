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
