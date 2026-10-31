// Synthetic database graph for the isolated developer drill; never connect this to a live DB.
const { PrismaClient } = require('@prisma/client');
const { createHash, randomBytes } = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const bcrypt = require('bcrypt');

async function main() {
  if (process.env.MIZANO_DISPOSABLE_DRILL !== 'yes') throw new Error('Disposable drill required');
  const target = new URL(process.env.DATABASE_URL || '');
  if (target.hostname !== '127.0.0.1' || target.pathname !== '/source')
    throw new Error('Disposable local source required');
  const prisma = new PrismaClient();
  const day = new Date('2026-11-01T00:00:00Z');
  try {
    for (const label of ['A', 'B']) {
      const org = await prisma.organization.create({
        data: { name: `Synthetic restore ${label}`, currency: 'EGP', baseCurrency: 'EGP' },
      });
      const role = await prisma.role.create({
        data: { name: 'Synthetic operator', organizationId: org.id },
      });
      const user = await prisma.user.create({
        data: {
          name: 'Synthetic operator',
          email: `restore-${randomBytes(12).toString('hex')}@mizano.test`,
          passwordHash: await bcrypt.hash(randomBytes(32).toString('hex'), 4),
          organizationId: org.id,
          roleId: role.id,
        },
      });
      const accounts = {};
      for (const [code, type] of [
        ['1100', 'ASSET'],
        ['2100', 'LIABILITY'],
        ['4100', 'INCOME'],
        ['5100', 'EXPENSE'],
      ]) {
        accounts[code] = await prisma.account.create({
          data: { code, name: `Synthetic ${code}`, type, organizationId: org.id },
        });
      }
      const vendor = await prisma.vendor.create({
        data: { name: 'Synthetic vendor', organizationId: org.id },
      });
      const customer = await prisma.customer.create({
        data: { name: 'Synthetic customer', organizationId: org.id },
      });
      const bill = await prisma.bill.create({
        data: {
          billNumber: 'SYNTHETIC-BILL',
          currencyCode: 'EGP',
          vendorId: vendor.id,
          date: day,
          dueDate: day,
          status: 'OPEN',
          subtotal: '100.0000',
          grandTotal: '100.0000',
          balanceDue: '100.0000',
          organizationId: org.id,
          lines: {
            create: [
              {
                accountId: accounts['5100'].id,
                description: 'Synthetic line',
                quantity: '1.0000',
                rate: '100.0000',
                amount: '100.0000',
              },
            ],
          },
        },
      });
      await prisma.journal.create({
        data: {
          journalNumber: 'SYNTHETIC-JOURNAL',
          date: day,
          sourceType: 'BILL_APPROVAL',
          sourceId: bill.id,
          organizationId: org.id,
          isPosted: true,
          lines: {
            create: [
              { accountId: accounts['5100'].id, debit: '100.0000', credit: '0.0000' },
              { accountId: accounts['2100'].id, debit: '0.0000', credit: '100.0000' },
            ],
          },
        },
      });
      const invoice = await prisma.invoice.create({
        data: {
          invoiceNumber: 'SYNTHETIC-DRAFT',
          currencyCode: 'EGP',
          customerId: customer.id,
          date: day,
          dueDate: day,
          status: 'DRAFT',
          organizationId: org.id,
          subtotal: '100.0000',
          grandTotal: '100.0000',
          balanceDue: '100.0000',
          lines: {
            create: [
              {
                description: 'Synthetic line',
                quantity: '1.0000',
                rate: '100.0000',
                amount: '100.0000',
              },
            ],
          },
        },
      });
      for (const [type, document] of [
        ['bill', bill],
        ['invoice', invoice],
      ]) {
        const bytes = Buffer.from(`Synthetic ${label} ${type} original\n`);
        const key = `${org.id}/2026/11/${randomBytes(24).toString('hex')}`;
        const file = path.join(process.env.DATA_DIR, 'originals', key);
        await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
        await fs.writeFile(file, bytes, { mode: 0o600 });
        await prisma.intakeJob.create({
          data: {
            organizationId: org.id,
            createdById: user.id,
            status: 'APPROVED',
            source: 'WEB',
            originalFileName: 'synthetic.txt',
            mimeType: 'text/plain',
            sizeBytes: bytes.length,
            sha256: createHash('sha256').update(bytes).digest('hex'),
            storageKey: key,
            draftDocumentType: type,
            draftDocumentId: document.id,
          },
        });
      }
    }
  } finally {
    await prisma.$disconnect();
  }
}
main().catch((error) => {
  const code = /^P[0-9]{4}$/.test(error.code || '') ? error.code : 'fixture-error';
  process.stderr.write(`Synthetic restore fixture failed (${code}).\n`);
  process.exitCode = 1;
});
