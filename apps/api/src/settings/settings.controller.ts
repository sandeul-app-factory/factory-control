import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { CurrentAuth, CurrentRequest, Roles } from "../common/decorators.js";
import type { FactoryRequest, RequestAuth } from "../common/request-context.js";
import { SettingsService } from "./settings.service.js";

@Roles("CEO")
@Controller("settings")
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  get() {
    return this.settings.get();
  }

  @Get("mcp-credentials")
  credentials() {
    return this.settings.credentials();
  }

  @Post("mcp-credentials")
  createCredential(
    @Body() body: unknown,
    @CurrentAuth() actor: RequestAuth,
    @CurrentRequest() request: FactoryRequest,
  ) {
    return this.settings.createCredential(body, actor, request);
  }

  @Post("mcp-credentials/:credentialId/revoke")
  revokeCredential(
    @Param("credentialId") credentialId: string,
    @CurrentAuth() actor: RequestAuth,
    @CurrentRequest() request: FactoryRequest,
  ) {
    return this.settings.revokeCredential(credentialId, actor, request);
  }
}
