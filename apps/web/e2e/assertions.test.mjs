import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  exactMoney,
  ledgerTotal,
  requiredStatus,
  reconcileTrialBalance,
  unchangedLedger,
} from './assertions.mjs';

test('exact money rejects wrong totals and numeric transport', () => {
  exactMoney('228', '228.0000');
  assert.throws(() => exactMoney('227.9999', '228.0000'));
  assert.throws(() => exactMoney(228, '228.0000'));
  assert.throws(() => exactMoney('228.00001', '228.0000'));
});

test('required route can never pass with a 404', () => {
  requiredStatus(201, 201);
  assert.throws(() => requiredStatus(404, 201));
  assert.throws(() => requiredStatus(500, 201));
});

test('ledger aggregation preserves sub-cent precision', () => {
  assert.equal(ledgerTotal([{ debit: '0.0001' }, { debit: '0.0002' }], 'debit'), '0.0003');
});

test('ledger aggregation rejects numeric or malformed money rather than coercing it', () => {
  for (const value of [0.01, undefined, 'NaN', 'Infinity', '1e2', '0.00001']) {
    assert.throws(() => ledgerTotal([{ debit: value }], 'debit'));
  }
});

const ledger = [
  {
    accountId: 'cash',
    accountCode: '1110',
    totalDebits: '100.0001',
    totalCredits: '0.0000',
    balance: '100.0001',
  },
  {
    accountId: 'equity',
    accountCode: '3100',
    totalDebits: '0.0000',
    totalCredits: '100.0001',
    balance: '100.0001',
  },
  {
    accountId: 'ar',
    accountCode: '1200',
    totalDebits: '1.0000',
    totalCredits: '1.0000',
    balance: '0.0000',
  },
];

function trialBalance() {
  return {
    accounts: [
      { accountId: 'cash', code: '1110', debit: '100.0001', credit: '0.0000' },
      { accountId: 'equity', code: '3100', debit: '0.0000', credit: '100.0001' },
    ],
    totals: { debit: '100.0001', credit: '100.0001' },
    totalDebits: '100.0001',
    totalCredits: '100.0001',
    difference: '0.0000',
    isBalanced: true,
  };
}

test('trial balance reconciles every account, excludes settled accounts and checks total aliases', () => {
  reconcileTrialBalance(trialBalance(), ledger);
  const wrong = trialBalance();
  // Balanced totals alone would miss an equal error on both sides.
  wrong.accounts[0].debit = '101.0001';
  wrong.accounts[1].credit = '101.0001';
  wrong.totals = { debit: '101.0001', credit: '101.0001' };
  assert.throws(() => reconcileTrialBalance(wrong, ledger));
  const alias = trialBalance();
  alias.totalDebits = '99.0001';
  assert.throws(() => reconcileTrialBalance(alias, ledger));
});

test('trial balance rejects omitted, extra, duplicate or misidentified accounts', () => {
  for (const change of [
    (report) => report.accounts.pop(),
    (report) => report.accounts.push({ ...report.accounts[0] }),
    (report) => {
      report.accounts[1] = { ...report.accounts[0] };
    },
    (report) => {
      report.accounts[0].code = '9999';
    },
  ]) {
    const report = trialBalance();
    change(report);
    assert.throws(() => reconcileTrialBalance(report, ledger));
  }
});

test('unchanged ledger checks each account even when gross totals still match', () => {
  unchangedLedger(ledger, [...ledger].reverse());
  const moved = ledger.map((account) => ({ ...account }));
  moved[0].totalDebits = '99.0001';
  moved[2].totalDebits = '2.0000';
  assert.throws(() => unchangedLedger(ledger, moved));
  assert.throws(() => unchangedLedger(ledger, ledger.slice(1)));
  assert.throws(() => unchangedLedger(ledger, [ledger[0], ledger[0], ledger[2]]));
});

test('wrong totals fail without exposing financial values', () => {
  assert.throws(
    () => exactMoney('987654.3210', '123456.7890'),
    (error) => {
      assert.ok(!String(error).includes('987654'));
      assert.ok(!String(error).includes('123456'));
      return true;
    },
  );
});
