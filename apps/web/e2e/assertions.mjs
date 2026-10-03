import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const requireApi = createRequire(new URL('../../api/package.json', import.meta.url));
const Decimal = requireApi('decimal.js');

function decimalMoney(value) {
  assert.equal(typeof value, 'string', 'Money must use decimal string transport');
  assert.ok(/^-?\d+(\.\d{1,4})?$/.test(value), 'Invalid decimal money transport');
  return new Decimal(value);
}

export function exactMoney(actual, expected) {
  // Boolean assertions keep financial values out of failure diagnostics.
  assert.ok(decimalMoney(actual).toFixed(4) === expected, 'Money total does not reconcile');
}

export function ledgerTotal(accounts, side) {
  return accounts
    .reduce((sum, account) => sum.plus(decimalMoney(account[side])), new Decimal(0))
    .toFixed(4);
}

/** Check every net account and both totals, so balanced but incorrect reports still fail. */
export function reconcileTrialBalance(report, ledger) {
  const expected = new Map();
  for (const account of ledger) {
    assert.ok(!expected.has(account.accountId), 'Duplicate ledger account');
    const net = decimalMoney(account.totalDebits).minus(decimalMoney(account.totalCredits));
    if (!net.isZero()) {
      expected.set(account.accountId, {
        code: account.accountCode,
        debit: Decimal.max(net, 0).toFixed(4),
        credit: Decimal.max(net.negated(), 0).toFixed(4),
      });
    }
  }
  assert.equal(report.accounts.length, expected.size, 'Trial balance account count mismatch');
  for (const account of report.accounts) {
    const net = expected.get(account.accountId);
    assert.ok(net, 'Trial balance contains an unexpected or duplicate account');
    assert.equal(account.code, net.code, 'Trial balance account code mismatch');
    exactMoney(account.debit, net.debit);
    exactMoney(account.credit, net.credit);
    expected.delete(account.accountId);
  }
  exactMoney(report.totals.debit, ledgerTotal(report.accounts, 'debit'));
  exactMoney(report.totals.credit, ledgerTotal(report.accounts, 'credit'));
  exactMoney(report.totalDebits, decimalMoney(report.totals.debit).toFixed(4));
  exactMoney(report.totalCredits, decimalMoney(report.totals.credit).toFixed(4));
  exactMoney(report.difference, '0.0000');
  assert.equal(report.isBalanced, true, 'Trial balance must balance');
}

/** Compare per-account turnover, not just gross totals that could hide mispostings. */
export function unchangedLedger(before, after) {
  assert.equal(after.length, before.length, 'Ledger account count changed after rejection');
  const accounts = new Map(before.map((account) => [account.accountId, account]));
  for (const account of after) {
    const prior = accounts.get(account.accountId);
    assert.ok(prior, 'Ledger account changed after rejection');
    for (const side of ['totalDebits', 'totalCredits', 'balance']) {
      exactMoney(account[side], decimalMoney(prior[side]).toFixed(4));
    }
    accounts.delete(account.accountId);
  }
}

export function requiredStatus(actual, expected) {
  assert.equal(actual, expected, 'Required route returned an unexpected status');
}
