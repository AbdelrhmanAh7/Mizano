import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { digestsEqual, hashToken } from './token-hash';

/**
 * A rotated-out token presented this soon after its rotation is a race (two tabs, a lost
 * response), not theft: refuse it without ending the session.
 */
const ROTATION_GRACE_MS = 30_000;
/** Oldest sessions beyond this many active ones are ended at the next sign-in. */
const MAX_ACTIVE_SESSIONS = 10;
/** Ended and expired sessions are kept this long for support, then deleted. */
const ENDED_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export interface TokenSubject {
  id: string;
  email: string;
  name: string;
  organizationId: string;
  roleId: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export type SessionEndReason = 'logout' | 'logout_all' | 'reuse' | 'limit' | 'password_reset';

type Db = PrismaService | Prisma.TransactionClient;

/**
 * One refresh session per signed-in device. Signing in elsewhere starts another session instead
 * of replacing this one; each refresh rotates the session's token, and presenting an old token
 * after the grace window ends that session (reuse detection).
 */
@Injectable()
export class AuthSessionsService {
  private readonly logger = new Logger(AuthSessionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  /** Starts a new session for a fresh sign-in and returns its first token pair. */
  async start(user: TokenSubject): Promise<AuthTokens> {
    const sessionId = randomUUID();
    const tokens = await this.sign(user, sessionId);
    await this.prisma.$transaction(async (tx) => {
      await tx.authSession.create({
        data: {
          id: sessionId,
          userId: user.id,
          organizationId: user.organizationId,
          refreshTokenHash: hashToken(tokens.refreshToken),
          expiresAt: this.expiryOf(tokens.refreshToken),
        },
      });
      await this.prune(tx, user.id);
    });
    return tokens;
  }

  /** Exchanges the session's current refresh token for a new pair. */
  async rotate(userId: string, sessionId: string | undefined, refreshToken: string) {
    if (!sessionId) throw new UnauthorizedException('Invalid refresh token');
    const now = new Date();
    const session = await this.prisma.authSession.findFirst({
      where: { id: sessionId, userId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            organizationId: true,
            roleId: true,
            status: true,
          },
        },
      },
    });
    if (
      !session ||
      session.revokedAt ||
      session.expiresAt <= now ||
      session.user.status !== 'ACTIVE'
    ) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const presented = hashToken(refreshToken);
    if (!digestsEqual(presented, session.refreshTokenHash)) {
      const racedRotation =
        digestsEqual(presented, session.previousTokenHash) &&
        !!session.rotatedAt &&
        now.getTime() - session.rotatedAt.getTime() < ROTATION_GRACE_MS;
      if (!racedRotation) {
        await this.end(userId, session.id, 'reuse');
        this.logger.warn(`Refresh token reuse detected; session ${session.id} ended`);
      }
      throw new UnauthorizedException('Invalid refresh token');
    }

    const tokens = await this.sign(session.user, session.id);
    // Only the request that still holds the current token wins a concurrent rotation.
    const rotated = await this.prisma.authSession.updateMany({
      where: { id: session.id, refreshTokenHash: presented, revokedAt: null },
      data: {
        previousTokenHash: presented,
        refreshTokenHash: hashToken(tokens.refreshToken),
        rotatedAt: now,
        lastUsedAt: now,
        expiresAt: this.expiryOf(tokens.refreshToken),
      },
    });
    if (rotated.count !== 1) throw new UnauthorizedException('Invalid refresh token');
    return tokens;
  }

  /** The user behind an access token, if its session is still open. */
  async activeUser(userId: string, sessionId: string | undefined) {
    if (!sessionId) return null;
    const session = await this.prisma.authSession.findFirst({
      where: { id: sessionId, userId, revokedAt: null, expiresAt: { gt: new Date() } },
      select: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            status: true,
            organizationId: true,
            roleId: true,
          },
        },
      },
    });
    return session?.user ?? null;
  }

  /** Ends one session of the user. */
  async end(userId: string, sessionId: string, reason: SessionEndReason): Promise<void> {
    await this.prisma.authSession.updateMany({
      where: { id: sessionId, userId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
  }

  /** Ends every open session of the user; returns how many were open. */
  async endAll(userId: string, reason: SessionEndReason, db: Db = this.prisma): Promise<number> {
    const result = await db.authSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
    return result.count;
  }

  private async prune(tx: Prisma.TransactionClient, userId: string): Promise<void> {
    const now = new Date();
    await tx.authSession.deleteMany({
      where: {
        userId,
        OR: [
          { expiresAt: { lt: new Date(now.getTime() - ENDED_RETENTION_MS) } },
          { revokedAt: { lt: new Date(now.getTime() - ENDED_RETENTION_MS) } },
        ],
      },
    });
    const surplus = await tx.authSession.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: now } },
      orderBy: { lastUsedAt: 'desc' },
      skip: MAX_ACTIVE_SESSIONS,
      select: { id: true },
    });
    if (surplus.length > 0) {
      await tx.authSession.updateMany({
        where: { id: { in: surplus.map((s) => s.id) }, userId, revokedAt: null },
        data: { revokedAt: now, revokedReason: 'limit' },
      });
    }
  }

  private async sign(user: TokenSubject, sessionId: string): Promise<AuthTokens> {
    const payload = {
      sub: user.id,
      sid: sessionId,
      email: user.email,
      name: user.name,
      organizationId: user.organizationId,
      roleId: user.roleId,
    };
    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.configService.get('JWT_SECRET'),
        expiresIn: this.configService.get('JWT_EXPIRATION', '15m'),
      }),
      // Unique jti so two refresh tokens minted in the same second never collide.
      this.jwtService.signAsync(payload, {
        jwtid: randomUUID(),
        secret: this.configService.get('JWT_REFRESH_SECRET'),
        expiresIn: this.configService.get('JWT_REFRESH_EXPIRATION', '7d'),
      }),
    ]);
    return { accessToken, refreshToken };
  }

  private expiryOf(refreshToken: string): Date {
    const decoded = this.jwtService.decode<{ exp?: number } | null>(refreshToken);
    if (!decoded?.exp) throw new Error('Refresh token has no expiry');
    return new Date(decoded.exp * 1000);
  }
}
