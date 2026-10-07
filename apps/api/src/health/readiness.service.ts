import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import { PrismaService } from '../prisma/prisma.service';
import { describeError } from '../common/utils/redact';

export interface DiskReport {
  freeBytes: number;
  freePct: number;
}

export interface ReadinessReport {
  status: 'ok' | 'fail';
  db: 'ok' | 'fail';
  disk: DiskReport | 'fail';
}

const DEFAULT_MIN_FREE_PCT = 10;
const DEFAULT_DB_TIMEOUT_MS = 2000;

/** Parses a positive-number env var, falling back when it is unset, non-numeric or out of range. */
function envNumber(name: string, fallback: number, max: number): number {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed > 0 && parsed <= max ? parsed : fallback;
}

/**
 * Readiness probes for the Pi monitor (#43). Both probes always run so one failure cannot hide
 * the other, the DB probe is raced against a timeout so a hung database cannot hold the request
 * open, and the report only ever contains fixed strings and two numbers: error text and paths
 * stay in the (redacted) log.
 */
@Injectable()
export class ReadinessService {
  private readonly logger = new Logger(ReadinessService.name);

  constructor(private readonly prisma: PrismaService) {}

  async check(): Promise<ReadinessReport> {
    const [db, disk] = await Promise.all([this.probeDb(), this.probeDisk()]);
    const diskOk = disk !== 'fail';
    return { status: db === 'ok' && diskOk ? 'ok' : 'fail', db, disk };
  }

  private async probeDb(): Promise<'ok' | 'fail'> {
    const timeoutMs = envNumber('READY_DB_TIMEOUT_MS', DEFAULT_DB_TIMEOUT_MS, 60_000);
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('readiness db probe timed out')), timeoutMs);
    });
    try {
      await Promise.race([this.prisma.$queryRaw`SELECT 1`, timeout]);
      return 'ok';
    } catch (error) {
      this.logger.warn(`DB probe failed: ${describeError(error, { includeMessage: false })}`);
      return 'fail';
    } finally {
      clearTimeout(timer);
    }
  }

  private async probeDisk(): Promise<DiskReport | 'fail'> {
    const minFreePct = envNumber('READY_MIN_FREE_PCT', DEFAULT_MIN_FREE_PCT, 100);
    try {
      const stat = await fs.promises.statfs(process.env.DATA_DIR || process.cwd());
      const blocks = Number(stat.blocks);
      const bfree = Number(stat.bfree);
      const freePct = blocks > 0 ? Math.round((bfree / blocks) * 10_000) / 100 : 0;
      if (freePct < minFreePct) {
        this.logger.warn(`Disk probe below threshold: ${freePct}% free, minimum ${minFreePct}%`);
        return 'fail';
      }
      return { freeBytes: bfree * Number(stat.bsize), freePct };
    } catch (error) {
      this.logger.warn(`Disk probe failed: ${describeError(error, { includeMessage: false })}`);
      return 'fail';
    }
  }
}
