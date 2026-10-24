import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { copyFile, mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { resolve } from 'path';
import { createOfflineTesseractWorker } from './offline-tesseract';

const createWorker = jest.fn();
jest.mock('tesseract.js', () => ({
  OEM: { LSTM_ONLY: 1 },
  createWorker: (...args: unknown[]): unknown => createWorker(...args),
}));

const apiRoot = resolve(__dirname, '../../../..');
const manifest = readFileSync(resolve(apiRoot, 'ocr-assets.sha256'), 'utf8');
const dockerfile = readFileSync(resolve(apiRoot, 'Dockerfile'), 'utf8');

describe('CPU OCR image asset contract', () => {
  it('pins exactly English and Arabic with SHA-256 digests', () => {
    const entries = manifest.trim().split('\n');
    expect(entries).toHaveLength(2);
    expect(entries.map((entry) => entry.trim().split(/\s+/)[1]).sort()).toEqual([
      'ara.traineddata',
      'eng.traineddata',
    ]);
    for (const entry of entries) {
      expect(entry.trim()).toMatch(/^[a-f0-9]{64}  (eng|ara)\.traineddata$/);
    }
  });

  it.each(['eng', 'ara'])('matches the bundled %s bytes to the committed pin', (language) => {
    const bytes = readFileSync(resolve(apiRoot, `${language}.traineddata`));
    const expected = manifest
      .trim()
      .split('\n')
      .find((entry) => entry.trim().endsWith(`  ${language}.traineddata`))
      ?.split(/\s+/)[0];
    expect(expected).toBeDefined();
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(expected);
  });

  it('verifies exact-version assets in the disposable build stage before runtime copy', () => {
    const assetStage = dockerfile.split(' AS ocr-assets')[1].split('# ---------- Stage 2')[0];
    expect(assetStage).toContain('@tesseract.js-data/eng@1.0.0');
    expect(assetStage).toContain('@tesseract.js-data/ara@1.0.0');
    expect(assetStage).toContain('/4.0.0_best_int/');
    expect(assetStage).toContain('sha256sum -c /ocr-assets.sha256');
    const runtimeStage = dockerfile.split(' AS runtime')[1];
    expect(runtimeStage).toContain('INTAKE_TESSDATA_DIR=/app/tessdata');
    expect(runtimeStage).toContain('--from=ocr-assets /tessdata/ ./tessdata/');
    expect(runtimeStage).toContain('/ocr-assets.sha256 ./apps/api/ocr-assets.sha256');
    expect(runtimeStage).not.toMatch(/npm install|traineddata\.gz|paddleocr|pip install/);
  });
});

describe('CPU OCR runtime integrity', () => {
  const originalDirectory = process.env.INTAKE_TESSDATA_DIR;
  let directory: string;

  beforeEach(async () => {
    createWorker.mockReset();
    directory = await mkdtemp(resolve(tmpdir(), 'mizano-asset-integrity-'));
    process.env.INTAKE_TESSDATA_DIR = directory;
  });

  afterEach(async () => {
    if (originalDirectory === undefined) delete process.env.INTAKE_TESSDATA_DIR;
    else process.env.INTAKE_TESSDATA_DIR = originalDirectory;
    await rm(directory, { recursive: true, force: true });
  });

  it('rejects missing local assets before engine creation', async () => {
    await expect(createOfflineTesseractWorker()).rejects.toMatchObject({ code: 'ENOENT' });
    expect(createWorker).not.toHaveBeenCalled();
  });

  it.each(['ara', 'eng'])('rejects corrupt %s assets before engine creation', async (language) => {
    await Promise.all(
      ['ara', 'eng'].map((code) =>
        copyFile(
          resolve(apiRoot, `${code}.traineddata`),
          resolve(directory, `${code}.traineddata`),
        ),
      ),
    );
    const bytes = readFileSync(resolve(directory, `${language}.traineddata`));
    await writeFile(
      resolve(directory, `${language}.traineddata`),
      bytes.subarray(0, bytes.length - 1),
    );
    await expect(createOfflineTesseractWorker()).rejects.toThrow('OCR asset checksum mismatch');
    expect(createWorker).not.toHaveBeenCalled();
  });
});
