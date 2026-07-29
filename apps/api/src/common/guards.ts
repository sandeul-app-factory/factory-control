import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { prisma } from "@sandeul/database";
import { isAllowedOrigin, safeEqual, sha256 } from "@sandeul/security";
import type { Role } from "@sandeul/contracts";
import { IS_PUBLIC_KEY, ROLES_KEY } from "./decorators.js";
import type { FactoryRequest } from "./request-context.js";

function sessionCookie(request: FactoryRequest): string | undefined {
  const cookieName = process.env.SESSION_COOKIE_NAME ?? "factory_session";
  const cookies = request.cookies as Record<string, string> | undefined;
  return cookies?.[cookieName];
}

@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<FactoryRequest>();
    const token = sessionCookie(request);
    if (!token) throw new UnauthorizedException("로그인이 필요합니다.");

    const session = await prisma.session.findUnique({
      where: { tokenHash: sha256(token) },
      include: { user: true },
    });
    const now = new Date();
    if (
      !session ||
      session.revokedAt ||
      session.expiresAt <= now ||
      session.user.deletedAt ||
      session.user.status !== "ACTIVE"
    ) {
      throw new UnauthorizedException("세션이 만료되었거나 유효하지 않습니다.");
    }

    request.auth = {
      userId: session.user.id,
      loginId: session.user.loginId,
      email: session.user.email,
      role: session.user.role as Role,
      sessionId: session.id,
      csrfToken: session.csrfToken,
    };

    if (now.getTime() - session.lastSeenAt.getTime() > 60_000) {
      void prisma.session.update({
        where: { id: session.id },
        data: { lastSeenAt: now, version: { increment: 1 } },
      });
    }
    return true;
  }
}

@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<FactoryRequest>();
    if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return true;

    const allowedOrigins = (process.env.AUTH_ALLOWED_ORIGINS ?? "http://localhost:3000")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean);
    if (!isAllowedOrigin(request.header("origin"), allowedOrigins)) {
      throw new ForbiddenException("허용되지 않은 요청 출처입니다.");
    }

    const suppliedToken = request.header("x-csrf-token");
    if (!request.auth || !suppliedToken || !safeEqual(request.auth.csrfToken, suppliedToken)) {
      throw new ForbiddenException("CSRF 검증에 실패했습니다.");
    }
    return true;
  }
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required?.length) return true;

    const request = context.switchToHttp().getRequest<FactoryRequest>();
    if (!request.auth || !required.includes(request.auth.role)) {
      throw new ForbiddenException("이 작업을 수행할 권한이 없습니다.");
    }
    return true;
  }
}
