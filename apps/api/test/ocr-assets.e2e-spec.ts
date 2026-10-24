import { execFile } from 'child_process';
import { copyFile, mkdtemp, readdir, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { resolve } from 'path';
import { promisify } from 'util';

const run = promisify(execFile);
const apiRoot = resolve(__dirname, '..');

// Run the built production adapter in a bounded subprocess. The preload blocks
// network APIs in the child AND its OCR worker thread, recording every attempt.
const initialize = `
  const { createOfflineTesseractWorker } = require(process.env.OCR_MODULE);
  createOfflineTesseractWorker().then(async worker => {
    await worker.terminate();
    process.stdout.write('initialized');
  }).catch(() => process.exit(2));
`;

const blockNetwork = `
  const blocked = () => {
    require('fs').appendFileSync(process.env.OCR_NETWORK_MARKER, 'attempt\\n');
    throw new Error('Network access is forbidden in the offline OCR test');
  };
  for (const module of ['http', 'https']) {
    const api = require(module);
    api.request = blocked;
    api.get = blocked;
  }
  const net = require('net');
  net.connect = blocked;
  net.createConnection = blocked;
  require('tls').connect = blocked;
  require('dns').lookup = blocked;
  globalThis.fetch = blocked;
`;

describe('bundled Arabic/English OCR engine integration (no database)', () => {
  let directory: string;
  let preload: string;

  beforeEach(async () => {
    directory = await mkdtemp(resolve(tmpdir(), 'mizano-runtime-ocr-'));
    preload = resolve(directory, 'block-network.cjs');
    await writeFile(preload, blockNetwork);
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  function initializeWith(assets: string): Promise<{ stdout: string; stderr: string }> {
    return run(process.execPath, ['--require', preload, '-e', initialize], {
      cwd: directory,
      timeout: 45000,
      env: {
        SystemRoot: process.env.SystemRoot,
        WINDIR: process.env.WINDIR,
        TEMP: process.env.TEMP,
        TMP: process.env.TMP,
        OCR_MODULE: resolve(apiRoot, 'dist/modules/ai/extraction/offline-tesseract.js'),
        INTAKE_TESSDATA_DIR: assets,
        OCR_NETWORK_MARKER: resolve(directory, 'network.marker'),
      },
    });
  }

  it('initializes both pinned languages outside the API cwd with network access blocked', async () => {
    const result = await initializeWith(apiRoot);
    expect(result.stdout).toBe('initialized');
    expect(result.stderr).toBe('');
    expect(await readdir(directory)).toEqual(['block-network.cjs']);
  });

  it('fails when local assets are absent instead of fetching language data', async () => {
    await expect(initializeWith(directory)).rejects.toMatchObject({ code: 2 });
    expect(await readdir(directory)).toEqual(['block-network.cjs']);
  });

  it.each(['ara', 'eng'])(
    'rejects corrupt %s data without attempting a download',
    async (language) => {
      await Promise.all(
        ['ara', 'eng'].map((code) =>
          copyFile(
            resolve(apiRoot, `${code}.traineddata`),
            resolve(directory, `${code}.traineddata`),
          ),
        ),
      );
      await writeFile(resolve(directory, `${language}.traineddata`), 'corrupt synthetic bytes');
      await expect(initializeWith(directory)).rejects.toMatchObject({ code: 2 });
      expect((await readdir(directory)).sort()).toEqual([
        'ara.traineddata',
        'block-network.cjs',
        'eng.traineddata',
      ]);
    },
  );
});
