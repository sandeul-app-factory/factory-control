import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { CurrentAuth, CurrentRequest, Public, Roles } from "../common/decorators.js";
import type { FactoryRequest, RequestAuth } from "../common/request-context.js";
import { RepositoriesService } from "./repositories.service.js";

@Controller()
export class RepositoriesController {
  constructor(private readonly repositories: RepositoriesService) {}

  @Get("github/organizations")
  organizations() {
    return this.repositories.listOrganizations();
  }

  @Get("github/repositories")
  remoteRepositories(@Query("owner") owner = "") {
    return this.repositories.listRemoteRepositories(owner);
  }

  @Get("projects/:projectId/repository")
  repository(@Param("projectId") projectId: string) {
    return this.repositories.get(projectId);
  }

  @Roles("CEO")
  @Post("projects/:projectId/repository/connect")
  connect(
    @Param("projectId") projectId: string,
    @Body() body: unknown,
    @CurrentAuth() actor: RequestAuth,
    @CurrentRequest() request: FactoryRequest,
  ) {
    return this.repositories.connect(projectId, body, actor, request);
  }

  @Roles("CEO")
  @Post("projects/:projectId/repository/create")
  create(
    @Param("projectId") projectId: string,
    @Body() body: Record<string, unknown>,
    @CurrentAuth() actor: RequestAuth,
    @CurrentRequest() request: FactoryRequest,
  ) {
    return this.repositories.create(projectId, body, actor, request);
  }

  @Public()
  @Post("webhooks/github")
  webhook(@CurrentRequest() request: FactoryRequest) {
    return this.repositories.processWebhook(request);
  }
}
