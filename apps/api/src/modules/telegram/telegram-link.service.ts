import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, TelegramLink } from '@prisma/client';
import { createHash, randomInt } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 8;
export const LINK_CODE_TTL_MS = 15 * 60 * 1000;

export type RedeemResult =
  | { status: 'linked' | 'already-linked'; link: TelegramLink }
  | { status: 'invalid' }
  | { status: 'linked-elsewhere' };

export function hashLinkCode(code: string): string {
  return createHash('sha256').update(code.trim().toUpperCase()).digest('hex');
}

class LinkedElsewhere extends Error {}

@Injectable()
export class TelegramLinkService {
  constructor(private readonly prisma: PrismaService) {}

  /** The plaintext code is returned once; only its hash is stored. */
  async createCode(
    organizationId: string,
    userId: string,
  ): Promise<{ code: string; expiresAt: Date }> {
    const now = new Date();
    await this.prisma.telegramLinkCode.deleteMany({
      where: { organizationId, OR: [{ expiresAt: { lt: now } }, { usedAt: { not: null } }] },
    });
    const code = Array.from(
      { length: CODE_LENGTH },
      () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)],
    ).join('');
    const expiresAt = new Date(now.getTime() + LINK_CODE_TTL_MS);
    await this.prisma.telegramLinkCode.create({
      data: { organizationId, createdById: userId, codeHash: hashLinkCode(code), expiresAt },
    });
    return { code, expiresAt };
  }

  /** Consume a one-time code (guarded transition) and link the chat to its organization. */
  async redeem(rawCode: string, chatId: string): Promise<RedeemResult> {
    const codeHash = hashLinkCode(rawCode);
    try {
      return await this.prisma.$transaction(async (tx): Promise<RedeemResult> => {
        const claimed = await tx.telegramLinkCode.updateMany({
          where: { codeHash, usedAt: null, expiresAt: { gt: new Date() } },
          data: { usedAt: new Date() },
        });
        if (claimed.count === 0) return { status: 'invalid' };
        const code = await tx.telegramLinkCode.findUnique({ where: { codeHash } });
        if (!code) return { status: 'invalid' };
        const existing = await tx.telegramLink.findUnique({ where: { chatId } });
        if (existing) {
          if (existing.organizationId !== code.organizationId) throw new LinkedElsewhere();
          return { status: 'already-linked', link: existing };
        }
        const link = await tx.telegramLink.create({
          data: { organizationId: code.organizationId, chatId, linkedById: code.createdById },
        });
        return { status: 'linked', link };
      });
    } catch (error) {
      if (error instanceof LinkedElsewhere) return { status: 'linked-elsewhere' };
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return { status: 'linked-elsewhere' };
      }
      throw error;
    }
  }

  findByChat(chatId: string): Promise<TelegramLink | null> {
    return this.prisma.telegramLink.findUnique({ where: { chatId } });
  }

  list(organizationId: string): Promise<TelegramLink[]> {
    return this.prisma.telegramLink.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async unlink(id: string, organizationId: string): Promise<void> {
    const res = await this.prisma.telegramLink.deleteMany({ where: { id, organizationId } });
    if (res.count === 0) throw new NotFoundException('Telegram link not found');
  }
}
