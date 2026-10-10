import { execFile } from 'child_process';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { promisify } from 'util';
import { createOfflineTesseractWorker } from '../extraction/offline-tesseract';
import type { DocumentIntakeResult } from '../services/document-intake.service';
import { preprocessForOcr } from '../utils/image-preprocessor.util';
import { writeSecureFile } from '../utils/secure-temp.util';
import { NATIVE_TEXT_CONFIDENCE, structuredCpuResult } from './cpu-structured';

export { cpuReviewResult } from './cpu-structured';

const execute = promisify(execFile);
const MAX_PAGES = 20;

function toolCpuLimit(): string {
  const seconds = Number(process.env.INTAKE_TOOL_CPU_SECONDS ?? 60);
  if (!Number.isInteger(seconds) || seconds < 1 || seconds > 60)
    throw new Error('Invalid CPU limit');
  return `--cpu=${seconds}`;
}

/** No shell, bounded external tools, inherited child process group and CPU limit. */
export async function runPdfTool(tool: string, args: string[]): Promise<void> {
  await execute(
    '/usr/bin/prlimit',
    ['--as=536870912', toolCpuLimit(), '--fsize=33554432', '--nofile=64', '--', tool, ...args],
    { maxBuffer: 1024 * 1024, env: { PATH: '/usr/bin:/bin', OMP_THREAD_LIMIT: '1' } },
  );
}

export async function extractCpuDocument(
  buffer: Buffer,
  mimeType: string,
  directory: string,
): Promise<DocumentIntakeResult> {
  // Original and rendered pages remain private and are removed by the supervisor even on SIGKILL.
  const original = join(directory, 'original');
  await writeSecureFile(original, buffer);
  let pages = 1;
  if (mimeType === 'application/pdf') {
    const info = join(directory, 'info');
    // pdftotext processes the complete document; no silent first-N-page truncation.
    await runPdfTool('/usr/bin/pdftotext', ['-enc', 'UTF-8', original, info]);
    const text = await readFile(info, 'utf8');
    if (text.trim().length > 50) return structuredCpuResult(text, NATIVE_TEXT_CONFIDENCE);
    const output = await execute(
      '/usr/bin/prlimit',
      ['--as=536870912', toolCpuLimit(), '--', '/usr/bin/pdfinfo', original],
      { maxBuffer: 65536, env: { PATH: '/usr/bin:/bin', LC_ALL: 'C' } },
    );
    pages = Number(/^Pages:\s+(\d+)$/m.exec(output.stdout)?.[1]);
    if (!Number.isInteger(pages) || pages < 1 || pages > MAX_PAGES) throw new Error('Page limit');
  } else if (!mimeType.startsWith('image/')) {
    throw new Error('Unsupported CPU format');
  }
  const engine = await createOfflineTesseractWorker();
  try {
    const texts: string[] = [];
    let confidence = 1;
    for (let page = 1; page <= pages; page += 1) {
      let image = buffer;
      if (mimeType === 'application/pdf') {
        const prefix = join(directory, 'page');
        await runPdfTool('/usr/bin/pdftoppm', [
          '-f',
          String(page),
          '-l',
          String(page),
          '-singlefile',
          '-scale-to',
          '2000',
          '-png',
          original,
          prefix,
        ]);
        image = await readFile(`${prefix}.png`);
      } else {
        image = await preprocessForOcr(buffer, mimeType);
      }
      const result = await engine.recognize(image);
      texts.push(result.data.text);
      confidence = Math.min(confidence, result.data.confidence / 100);
    }
    return structuredCpuResult(texts.join('\n'), confidence);
  } finally {
    await engine.terminate();
  }
}
