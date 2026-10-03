import { execFile } from 'child_process';

const REQUIRED_TOOLS = [
  ['pdfinfo', '-v'],
  ['pdfimages', '-v'],
  ['pdftotext', '-v'],
  ['pdftoppm', '-v'],
  ['prlimit', '--version'],
] as const;

/** Fail once before booting DB/queue services; never skip Linux-image acceptance. */
export async function preflightFormatTools(): Promise<void> {
  const missing: string[] = [];
  for (const [tool, versionFlag] of REQUIRED_TOOLS) {
    const available = await new Promise<boolean>((resolve) => {
      execFile(
        tool,
        [versionFlag],
        {
          timeout: 5000,
          maxBuffer: 64 * 1024,
          windowsHide: true,
          env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, LANG: 'C.UTF-8' },
        },
        (error) => resolve(!error),
      );
    });
    if (!available) missing.push(tool);
  }
  if (missing.length) {
    throw new Error(
      `CPU format E2E preflight failed. Missing or unusable tools: ${missing.join(', ')}. Run these suites inside the built Alpine API image with poppler-utils and util-linux-misc.`,
    );
  }
}
