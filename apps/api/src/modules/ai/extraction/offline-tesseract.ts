import { createHash } from 'crypto';
import { readFile } from 'fs/promises';
import { resolve } from 'path';
import { createWorker, OEM, type Worker } from 'tesseract.js';
import { withSecureTempDir, writeSecureFile } from '../utils/secure-temp.util';

const apiRoot = resolve(__dirname, '../../../..');
const languages = ['ara', 'eng'] as const;

/** Load verified private snapshots; never fall back to a CDN or runtime cache. */
export async function createOfflineTesseractWorker(): Promise<Worker> {
  const directory = process.env.INTAKE_TESSDATA_DIR ?? apiRoot;
  if (!directory.trim() || /^[a-z][a-z0-9+.-]*:\/\//i.test(directory)) {
    throw new Error('OCR assets require a local directory');
  }
  const manifest = await readFile(resolve(apiRoot, 'ocr-assets.sha256'), 'utf8');
  const entries = manifest.trim().split('\n');
  if (
    entries.length !== languages.length ||
    entries.some((entry) => !/^[a-f0-9]{64}  (ara|eng)\.traineddata$/.test(entry)) ||
    new Set(entries.map((entry) => entry.split('  ')[1])).size !== languages.length
  ) {
    throw new Error('Invalid pinned OCR asset manifest');
  }
  const assets = await Promise.all(
    languages.map(async (code) => {
      const data = await readFile(resolve(directory, `${code}.traineddata`));
      const pin = entries.find((entry) => entry.endsWith(`  ${code}.traineddata`))!;
      if (createHash('sha256').update(data).digest('hex') !== pin.split('  ')[0]) {
        throw new Error('OCR asset checksum mismatch');
      }
      return { code, data };
    }),
  );
  // Tesseract 7's Lang[] type is not usable: initialization joins l.data
  // rather than l.code. Use a private local snapshot of the verified buffers,
  // then remove it once both languages are loaded into the engine.
  return withSecureTempDir('mizano-tesseract-', async (langPath) => {
    await Promise.all(
      assets.map(({ code, data }) =>
        writeSecureFile(resolve(langPath, `${code}.traineddata`), data),
      ),
    );
    return createWorker(languages.join('+'), OEM.LSTM_ONLY, {
      langPath,
      cacheMethod: 'none',
      gzip: false,
      // Recognition rejects its promise; the default handler also throws
      // the raw engine error from a message callback, outside our catch.
      errorHandler: (_error: unknown): void => undefined,
    });
  });
}
