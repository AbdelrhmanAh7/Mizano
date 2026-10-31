/** In-memory stand-in for the Prisma calls the auth services make, for unit specs. */

type Row = Record<string, unknown>;
type Where = Record<string, unknown>;

function matchesValue(value: unknown, condition: unknown): boolean {
  if (condition && typeof condition === 'object' && !(condition instanceof Date)) {
    const c = condition as { gt?: Date; gte?: Date; lt?: Date; in?: unknown[] };
    if (c.in) return c.in.includes(value);
    const time = value instanceof Date ? value.getTime() : NaN;
    if (c.gt && !(time > c.gt.getTime())) return false;
    if (c.gte && !(time >= c.gte.getTime())) return false;
    if (c.lt && !(time < c.lt.getTime())) return false;
    return true;
  }
  return (value ?? null) === (condition ?? null);
}

function matches(row: Row, where: Where = {}): boolean {
  return Object.entries(where).every(([key, condition]) => {
    if (key === 'OR') return (condition as Where[]).some((w) => matches(row, w));
    return matchesValue(row[key], condition);
  });
}

class Table {
  rows: Row[] = [];
  constructor(private readonly join?: (row: Row) => Row) {}

  private withJoin(row: Row): Row {
    return this.join ? { ...row, ...this.join(row) } : { ...row };
  }

  create = jest.fn(({ data }: { data: Row }) => {
    const row: Row = { id: `id-${this.rows.length + 1}`, createdAt: new Date(), ...data };
    row.lastUsedAt ??= new Date();
    row.revokedAt ??= null;
    row.usedAt ??= null;
    this.rows.push(row);
    return Promise.resolve({ ...row });
  });
  findFirst = jest.fn(({ where }: { where: Where }) => {
    const row = this.rows.find((r) => matches(r, where));
    return Promise.resolve(row ? this.withJoin(row) : null);
  });
  findUnique = this.findFirst;
  findMany = jest.fn(({ where, skip = 0 }: { where: Where; skip?: number }) =>
    Promise.resolve(
      this.rows
        .filter((r) => matches(r, where))
        .sort((a, b) => (b.lastUsedAt as Date).getTime() - (a.lastUsedAt as Date).getTime())
        .slice(skip)
        .map((r) => ({ ...r })),
    ),
  );
  count = jest.fn(({ where }: { where: Where }) =>
    Promise.resolve(this.rows.filter((r) => matches(r, where)).length),
  );
  updateMany = jest.fn(({ where, data }: { where: Where; data: Row }) => {
    const hits = this.rows.filter((r) => matches(r, where));
    hits.forEach((r) => Object.assign(r, data));
    return Promise.resolve({ count: hits.length });
  });
  update = jest.fn(({ where, data }: { where: Where; data: Row }) => {
    const row = this.rows.find((r) => matches(r, where));
    if (row) Object.assign(row, data);
    return Promise.resolve(row);
  });
  deleteMany = jest.fn(({ where }: { where: Where }) => {
    const before = this.rows.length;
    this.rows = this.rows.filter((r) => !matches(r, where));
    return Promise.resolve({ count: before - this.rows.length });
  });
}

export interface FakeAuthStore {
  user: Table;
  authSession: Table;
  passwordResetToken: Table;
  organization: { findUnique: jest.Mock };
  $transaction: jest.Mock;
}

export function createFakeAuthStore(): FakeAuthStore {
  const user = new Table();
  const userOf = (row: Row): Row => ({ user: user.rows.find((u) => u.id === row.userId) });
  const store: FakeAuthStore = {
    user,
    authSession: new Table(userOf),
    passwordResetToken: new Table(userOf),
    organization: { findUnique: jest.fn(() => Promise.resolve(null)) },
    $transaction: jest.fn((fn: (tx: FakeAuthStore) => Promise<unknown>) => fn(store)),
  };
  return store;
}
