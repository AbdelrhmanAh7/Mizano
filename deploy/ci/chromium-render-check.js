// Run inside the API image (`node -` with this file on stdin) by verify-docker-image.sh.
// Headless Chromium must render a PDF and a PNG offline. The page is right-to-left with an Arabic
// heading; the invoice templates' font stack has no Arabic glyphs, so the text must fall back to
// the bundled Noto Naskh Arabic, which then appears embedded in the PDF.
const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    timeout: 120000,
  });
  const page = await browser.newPage();
  await page.setContent(
    '<html><body dir="rtl" style="font-family: \'Helvetica Neue\', Helvetica, Arial, sans-serif">' +
      '<h1>فاتورة ضريبية 123</h1><p>Invoice total 1,234.50</p></body></html>',
  );
  const pdf = Buffer.from(await page.pdf({ format: 'A4' }));
  const png = await page.screenshot({ type: 'png' });
  await browser.close();
  if (pdf.length < 1000 || png.length < 1000) throw new Error('empty render output');
  if (!pdf.toString('latin1').includes('NotoNaskhArabic')) {
    throw new Error('Arabic text was not rendered with Noto Naskh Arabic');
  }
  console.log(
    `chromium render ok: pdf=${pdf.length} bytes png=${png.length} bytes, Noto Naskh Arabic embedded`,
  );
})().catch((error) => {
  console.error('chromium render failed:', error.message);
  process.exit(1);
});
