// Run inside the API image (`node -` with this file on stdin) by verify-docker-image.sh.
// The production extraction of the dedicated worker, unmodified: the real supervisor starts the
// real child under /usr/bin/prlimit in its own process group, and the child reads the stored
// original through checksum-verified storage. It is run on each path of the child: an image
// (pinned OCR assets), a PDF with a text layer (Poppler) and a scanned PDF (Poppler renders the
// page, then OCR). The deterministic rules turn each text into fields. The documents are synthetic
// crisp text, so this proves that the compiled code, its dependencies, the bundled assets, the PDF
// tools and the process limits work in this image on this architecture, not extraction accuracy on
// real documents. Failures name fields only: recognized text is never printed.
const { randomBytes } = require('crypto');
const { ConfigService } = require('@nestjs/config');
const sharp = require('sharp');

const intake = '/app/apps/api/dist/modules/ai/intake';
const { IntakeExecutorService } = require(`${intake}/intake-executor.service.js`);
const { LocalFsIntakeStorage, sha256Hex } = require(`${intake}/intake-storage.js`);

const config = new ConfigService({
  INTAKE_STORAGE_DIR: '/tmp/intake-check-storage',
  INTAKE_JOB_DEADLINE_MS: '90000',
});
const storage = new LocalFsIntakeStorage(config);
const executor = new IntakeExecutorService(config);

const LINES = [
  'Cairo Office Supplies Co.',
  'Tax Invoice',
  'Invoice No: INV-2024-0042',
  'Invoice Date: 15/03/2024',
  'Due Date: 14/04/2024',
  'Tax Registration No: 123-456-789',
  'Sub Total: EGP 1,000.00',
  'VAT 14%: EGP 140.00',
  'Total: EGP 1,140.00',
];
const EXPECTED = {
  documentNumber: 'INV-2024-0042',
  date: '2024-03-15',
  subtotal: 1000,
  tax: 140,
  total: 1140,
  currency: 'EGP',
};

/** A minimal valid PDF: `objects` are the bodies of objects 1..n, numbered in order. */
function buildPdf(objects) {
  const parts = [Buffer.from('%PDF-1.4\n')];
  let length = parts[0].length;
  const offsets = [];
  objects.forEach((body, index) => {
    offsets.push(length);
    const chunk = Buffer.concat([
      Buffer.from(`${index + 1} 0 obj\n`),
      body,
      Buffer.from('\nendobj\n'),
    ]);
    parts.push(chunk);
    length += chunk.length;
  });
  const entries = offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`);
  parts.push(
    Buffer.from(
      `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${entries.join('')}` +
        `trailer\n<</Size ${objects.length + 1}/Root 1 0 R>>\nstartxref\n${length}\n%%EOF\n`,
    ),
  );
  return Buffer.concat(parts);
}

function stream(dictionary, data) {
  return Buffer.concat([
    Buffer.from(`<<${dictionary}/Length ${data.length}>>\nstream\n`),
    data,
    Buffer.from('\nendstream'),
  ]);
}

function textLayerPdf(lines) {
  const shown = lines.map((line, index) => `${index ? 'T* ' : ''}(${line}) Tj`).join(' ');
  return buildPdf([
    Buffer.from('<</Type/Catalog/Pages 2 0 R>>'),
    Buffer.from('<</Type/Pages/Kids[3 0 R]/Count 1>>'),
    Buffer.from(
      '<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>',
    ),
    stream('', Buffer.from(`BT /F1 14 Tf 20 TL 40 780 Td ${shown} ET`)),
    Buffer.from('<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>'),
  ]);
}

async function scannedPdf(png) {
  const jpeg = await sharp(png).flatten({ background: '#ffffff' }).jpeg({ quality: 92 }).toBuffer();
  const { width, height } = await sharp(jpeg).metadata();
  return buildPdf([
    Buffer.from('<</Type/Catalog/Pages 2 0 R>>'),
    Buffer.from('<</Type/Pages/Kids[3 0 R]/Count 1>>'),
    Buffer.from(
      `<</Type/Page/Parent 2 0 R/MediaBox[0 0 ${width} ${height}]/Contents 4 0 R/Resources<</XObject<</Im0 5 0 R>>>>>>`,
    ),
    stream('', Buffer.from(`q ${width} 0 0 ${height} 0 0 cm /Im0 Do Q`)),
    stream(
      `/Type/XObject/Subtype/Image/Width ${width}/Height ${height}` +
        '/ColorSpace/DeviceRGB/BitsPerComponent 8/Filter/DCTDecode',
      jpeg,
    ),
  ]);
}

async function check(name, buffer, mimeType) {
  const organizationId = 'org-check';
  const sha256 = sha256Hex(buffer);
  const storageKey = `${organizationId}/2026/10/${randomBytes(16).toString('hex')}`;
  await storage.put(storageKey, buffer);
  const result = await executor.run(
    { storageKey, sha256, mimeType, organizationId },
    new AbortController().signal,
  );
  const fields = result.extractedFields;
  const wrong = Object.keys(EXPECTED).filter((key) => fields[key] !== EXPECTED[key]);
  if (result.extractionMethod !== 'rules' || result.documentType !== 'BILL' || wrong.length > 0) {
    throw new Error(
      `${name}: unexpected extraction (method=${result.extractionMethod}, ` +
        `type=${result.documentType}, wrong fields: ${wrong.join(',') || 'none'})`,
    );
  }
  console.log(`worker extraction ok: ${name}`);
}

(async () => {
  const encoded = process.env.FIXTURE_PNG_BASE64;
  if (!encoded) throw new Error('FIXTURE_PNG_BASE64 is unset');
  const png = Buffer.from(encoded, 'base64');
  // The worker refuses to start without Linux and an executable prlimit; so does this check.
  await executor.onModuleInit();
  try {
    await check('image', png, 'image/png');
    await check('pdf text layer', textLayerPdf(LINES), 'application/pdf');
    await check('scanned pdf', await scannedPdf(png), 'application/pdf');
  } finally {
    executor.onModuleDestroy();
  }
})().catch((error) => {
  // The executor's errors carry a stable code only (INTAKE_TIMEOUT, INTAKE_WORKER_FAILED, ...).
  console.error('worker extraction failed:', error.message);
  process.exit(1);
});
