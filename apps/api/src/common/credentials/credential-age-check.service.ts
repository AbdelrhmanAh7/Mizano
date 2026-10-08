import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { describeError } from '../utils/redact';
import { CredentialAge, classifyCredentialAge } from './credential-age';

/** Host credentials; each has a `<NAME>_CREDENTIAL_ROTATED_AT=YYYY-MM-DD` key (date only). */
export const HOST_CREDENTIALS = ['TELEGRAM_BOT', 'CLOUDFLARE_TUNNEL'] as const;
const MAX_AGE_DAYS = 90;

/**
 * Logs one line per boot with each credential's name and age classification (#104). It reads
 * rotation dates only, never a credential value, and never blocks the boot.
 */
@Injectable()
export class CredentialAgeCheckService implements OnApplicationBootstrap {
  private readonly logger = new Logger(CredentialAgeCheckService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      await this.check(new Date());
    } catch (error) {
      this.logger.error(
        `Credential age check failed: ${describeError(error, { includeMessage: false })}`,
      );
    }
  }

  async check(now: Date): Promise<CredentialAge[]> {
    const results = HOST_CREDENTIALS.map((name) =>
      classifyCredentialAge(
        name,
        this.config.get<string>(`${name}_CREDENTIAL_ROTATED_AT`),
        now,
        MAX_AGE_DAYS,
      ),
    );
    // System-wide boot check: every organization that has an SMTP password set.
    const orgs = await this.prisma.organization.findMany({
      where: { smtpPassword: { not: null }, NOT: { smtpPassword: '' } },
      select: { id: true, smtpPasswordRotatedAt: true },
      orderBy: { id: 'asc' },
    });
    for (const org of orgs) {
      const rotatedAt = org.smtpPasswordRotatedAt?.toISOString().slice(0, 10);
      results.push(
        classifyCredentialAge(`SMTP_PASSWORD[org=${org.id}]`, rotatedAt, now, MAX_AGE_DAYS),
      );
    }

    const summary = results.map((r) => `${r.name}=${r.status}`).join(', ');
    const line = `Credential age check (max ${MAX_AGE_DAYS} days): ${summary}`;
    if (results.every((r) => r.status === 'ok')) this.logger.log(line);
    else this.logger.warn(line);
    return results;
  }
}
