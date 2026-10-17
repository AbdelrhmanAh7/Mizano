import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { describeError } from '../utils/redact';
import { CredentialAge, classifyCredentialAge } from './credential-age';

/** Host secret env names; each has a `<NAME>_CREDENTIAL_ROTATED_AT=YYYY-MM-DD` key (date only). */
export const HOST_CREDENTIALS = ['TELEGRAM_BOT_TOKEN', 'CLOUDFLARE_TUNNEL_TOKEN'] as const;
/**
 * Secrets the API container can see and that may legitimately be unset (the Pi compose file
 * allows an empty Telegram token): when unset they are left out. The tunnel token only reaches
 * the cloudflared container and is required there, so it is always classified.
 */
const OPTIONAL_HOST_CREDENTIALS: readonly string[] = ['TELEGRAM_BOT_TOKEN'];
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
    const results = HOST_CREDENTIALS.filter(
      (name) => !OPTIONAL_HOST_CREDENTIALS.includes(name) || !!this.config.get<string>(name),
    ).map((name) =>
      classifyCredentialAge(
        name,
        this.config.get<string>(`${name}_CREDENTIAL_ROTATED_AT`),
        now,
        MAX_AGE_DAYS,
      ),
    );
    results.push(...(await this.classifySmtpPasswords(now)));

    const summary = results.map((r) => `${r.name}=${r.status}`).join(', ');
    // Issue #104 requires one warning per boot regardless of the classifications, so a healthy
    // boot still surfaces the line (names and classifications only, never a value).
    this.logger.warn(`Credential age check (max ${MAX_AGE_DAYS} days): ${summary}`);
    return results;
  }

  /**
   * System-wide boot check: every organization that has an SMTP password set. A failing query
   * (for example a deploy that starts the API before `prisma migrate deploy` added the column)
   * must not hide the host lines, so it is reported as one `unknown` entry.
   */
  private async classifySmtpPasswords(now: Date): Promise<CredentialAge[]> {
    try {
      const orgs = await this.prisma.organization.findMany({
        where: { smtpPassword: { not: null }, NOT: { smtpPassword: '' } },
        select: { id: true, smtpPasswordRotatedAt: true },
        orderBy: { id: 'asc' },
      });
      return orgs.map((org) =>
        classifyCredentialAge(
          `SMTP_PASSWORD[org=${org.id}]`,
          org.smtpPasswordRotatedAt?.toISOString().slice(0, 10),
          now,
          MAX_AGE_DAYS,
        ),
      );
    } catch (error) {
      this.logger.error(
        `SMTP credential age lookup failed: ${describeError(error, { includeMessage: false })}`,
      );
      return [classifyCredentialAge('SMTP_PASSWORD', undefined, now, MAX_AGE_DAYS)];
    }
  }
}
