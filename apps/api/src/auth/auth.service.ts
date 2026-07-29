import { Injectable, UnauthorizedException } from "@nestjs/common";
import argon2 from "argon2";
import { prisma } from "@sandeul/database";
import { randomToken, sha256 } from "@sandeul/security";
import type { LoginInput } from "@sandeul/contracts";
import type { FactoryRequest, RequestAuth } from "../common/request-context.js";
import { AuditService } from "../audit/audit.service.js";

export interface LoginResult {
  sessionToken: string;
  csrfToken: string;
  expiresAt: Date;
  user: {
    id: string;
    loginId: string;
    email: string;
    role: string;
  };
}

@Injectable()
export class AuthService {
  constructor(private readonly audit: AuditService) {}

  async login(input: LoginInput, request: FactoryRequest): Promise<LoginResult> {
    const user = await prisma.user.findFirst({
      where: {
        OR: [{ loginId: input.loginId }, { email: input.loginId.toLowerCase() }],
        deletedAt: null,
      },
    });
    const now = new Date();
    const genericFailure = "아이디 또는 비밀번호가 올바르지 않습니다.";

    if (!user || user.status !== "ACTIVE" || (user.lockedUntil && user.lockedUntil > now)) {
      await this.audit.record({
        action: "AUTH_LOGIN",
        resourceType: "User",
        resourceId: user?.id,
        requestId: request.requestId,
        ip: request.ip,
        userAgent: request.header("user-agent"),
        outcome: "FAILURE",
        reason:
          user?.lockedUntil && user.lockedUntil > now ? "ACCOUNT_LOCKED" : "INVALID_CREDENTIALS",
      });
      throw new UnauthorizedException(genericFailure);
    }

    const verified = await argon2.verify(user.passwordHash, input.password);
    if (!verified) {
      const maxFailures = Number(process.env.LOGIN_MAX_FAILURES ?? 5);
      const lockMinutes = Number(process.env.LOGIN_LOCK_MINUTES ?? 15);
      const nextFailures = user.failedLoginCount + 1;
      await prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginCount: nextFailures,
          lockedUntil:
            nextFailures >= maxFailures
              ? new Date(now.getTime() + lockMinutes * 60_000)
              : user.lockedUntil,
          version: { increment: 1 },
        },
      });
      await this.audit.record({
        action: "AUTH_LOGIN",
        resourceType: "User",
        resourceId: user.id,
        requestId: request.requestId,
        ip: request.ip,
        userAgent: request.header("user-agent"),
        outcome: "FAILURE",
        reason: "INVALID_CREDENTIALS",
      });
      throw new UnauthorizedException(genericFailure);
    }

    const sessionToken = randomToken();
    const csrfToken = randomToken();
    const ttlHours = Number(process.env.SESSION_TTL_HOURS ?? 12);
    const expiresAt = new Date(now.getTime() + ttlHours * 60 * 60_000);
    const session = await prisma.$transaction(async (transaction) => {
      await transaction.user.update({
        where: { id: user.id },
        data: {
          failedLoginCount: 0,
          lockedUntil: null,
          lastLoginAt: now,
          version: { increment: 1 },
        },
      });
      return transaction.session.create({
        data: {
          userId: user.id,
          tokenHash: sha256(sessionToken),
          csrfToken,
          expiresAt,
          userAgent: request.header("user-agent")?.slice(0, 500) ?? null,
        },
      });
    });

    await this.audit.record({
      actor: {
        userId: user.id,
        loginId: user.loginId,
        email: user.email,
        role: user.role,
        sessionId: session.id,
        csrfToken,
      },
      action: "AUTH_LOGIN",
      resourceType: "Session",
      resourceId: session.id,
      requestId: request.requestId,
      ip: request.ip,
      userAgent: request.header("user-agent"),
      outcome: "SUCCESS",
    });

    return {
      sessionToken,
      csrfToken,
      expiresAt,
      user: { id: user.id, loginId: user.loginId, email: user.email, role: user.role },
    };
  }

  async logout(auth: RequestAuth, request: FactoryRequest): Promise<void> {
    await prisma.session.updateMany({
      where: { id: auth.sessionId, revokedAt: null },
      data: { revokedAt: new Date(), version: { increment: 1 } },
    });
    await this.audit.record({
      actor: auth,
      action: "AUTH_LOGOUT",
      resourceType: "Session",
      resourceId: auth.sessionId,
      requestId: request.requestId,
      outcome: "SUCCESS",
    });
  }

  async changePassword(
    auth: RequestAuth,
    currentPassword: string,
    newPassword: string,
    request: FactoryRequest,
  ): Promise<void> {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: auth.userId } });
    if (!(await argon2.verify(user.passwordHash, currentPassword))) {
      throw new UnauthorizedException("현재 비밀번호가 올바르지 않습니다.");
    }
    const passwordHash = await argon2.hash(newPassword, {
      type: argon2.argon2id,
      memoryCost: 65_536,
      timeCost: 3,
      parallelism: 1,
    });
    await prisma.$transaction([
      prisma.user.update({
        where: { id: auth.userId },
        data: { passwordHash, passwordChangedAt: new Date(), version: { increment: 1 } },
      }),
      prisma.session.updateMany({
        where: { userId: auth.userId, revokedAt: null },
        data: { revokedAt: new Date(), version: { increment: 1 } },
      }),
    ]);
    await this.audit.record({
      actor: auth,
      action: "AUTH_PASSWORD_CHANGE",
      resourceType: "User",
      resourceId: auth.userId,
      requestId: request.requestId,
      outcome: "SUCCESS",
    });
  }

  async revokeAllSessions(auth: RequestAuth, request: FactoryRequest): Promise<number> {
    const result = await prisma.session.updateMany({
      where: { userId: auth.userId, revokedAt: null },
      data: { revokedAt: new Date(), version: { increment: 1 } },
    });
    await this.audit.record({
      actor: auth,
      action: "AUTH_SESSION_REVOKE_ALL",
      resourceType: "User",
      resourceId: auth.userId,
      requestId: request.requestId,
      outcome: "SUCCESS",
      metadata: { revokedCount: result.count },
    });
    return result.count;
  }
}
