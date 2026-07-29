import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Res,
} from "@nestjs/common";
import type { CookieOptions, Response } from "express";
import { changePasswordSchema, loginSchema } from "@sandeul/contracts";
import { CurrentAuth, CurrentRequest, Public } from "../common/decorators.js";
import type { FactoryRequest, RequestAuth } from "../common/request-context.js";
import { AuthService } from "./auth.service.js";

function cookieOptions(expires: Date): CookieOptions {
  const sameSiteValue = process.env.SESSION_SAME_SITE ?? "lax";
  const sameSite: "lax" | "strict" | "none" =
    sameSiteValue === "strict" || sameSiteValue === "none" ? sameSiteValue : ("lax" as const);
  return {
    httpOnly: true,
    secure: (process.env.SESSION_SECURE ?? "true") === "true",
    sameSite,
    expires,
    path: "/",
  };
}

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post("login")
  async login(
    @Body() body: unknown,
    @CurrentRequest() request: FactoryRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);

    const result = await this.authService.login(parsed.data, request);
    response.cookie(
      process.env.SESSION_COOKIE_NAME ?? "factory_session",
      result.sessionToken,
      cookieOptions(result.expiresAt),
    );
    return {
      user: result.user,
      csrfToken: result.csrfToken,
      expiresAt: result.expiresAt.toISOString(),
    };
  }

  @Get("me")
  me(@CurrentAuth() auth: RequestAuth) {
    return {
      user: {
        id: auth.userId,
        loginId: auth.loginId,
        email: auth.email,
        role: auth.role,
      },
      csrfToken: auth.csrfToken,
    };
  }

  @Post("logout")
  async logout(
    @CurrentAuth() auth: RequestAuth,
    @CurrentRequest() request: FactoryRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.authService.logout(auth, request);
    response.clearCookie(process.env.SESSION_COOKIE_NAME ?? "factory_session", cookieOptions(new Date(0)));
    return { ok: true };
  }

  @Post("password")
  async changePassword(
    @Body() body: unknown,
    @CurrentAuth() auth: RequestAuth,
    @CurrentRequest() request: FactoryRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    const parsed = changePasswordSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    await this.authService.changePassword(
      auth,
      parsed.data.currentPassword,
      parsed.data.newPassword,
      request,
    );
    response.clearCookie(process.env.SESSION_COOKIE_NAME ?? "factory_session", cookieOptions(new Date(0)));
    return { ok: true, message: "비밀번호가 변경되어 모든 세션이 종료되었습니다." };
  }

  @Post("sessions/revoke-all")
  async revokeAll(
    @CurrentAuth() auth: RequestAuth,
    @CurrentRequest() request: FactoryRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    const revokedCount = await this.authService.revokeAllSessions(auth, request);
    response.clearCookie(process.env.SESSION_COOKIE_NAME ?? "factory_session", cookieOptions(new Date(0)));
    return { ok: true, revokedCount };
  }
}
