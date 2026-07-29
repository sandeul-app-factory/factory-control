import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { CurrentAuth, CurrentRequest, Roles } from "../common/decorators.js";
import type { FactoryRequest, RequestAuth } from "../common/request-context.js";
import { DecisionsService } from "./decisions.service.js";

@Controller("projects/:projectId")
export class DecisionsController {
  constructor(private readonly decisions: DecisionsService) {}

  @Get("constraints")
  constraints(@Param("projectId") projectId: string, @Query("history") history?: string) {
    return this.decisions.listConstraints(projectId, history === "true");
  }

  @Roles("CEO")
  @Post("constraints")
  createConstraint(
    @Param("projectId") projectId: string,
    @Body() body: unknown,
    @CurrentAuth() actor: RequestAuth,
    @CurrentRequest() request: FactoryRequest,
  ) {
    return this.decisions.createConstraint(projectId, body, actor, request);
  }

  @Roles("CEO")
  @Post("constraints/:logicalId/versions")
  reviseConstraint(
    @Param("projectId") projectId: string,
    @Param("logicalId") logicalId: string,
    @Body() body: unknown,
    @CurrentAuth() actor: RequestAuth,
    @CurrentRequest() request: FactoryRequest,
  ) {
    return this.decisions.reviseConstraint(projectId, logicalId, body, actor, request);
  }

  @Get("decisions")
  decisionRecords(@Param("projectId") projectId: string, @Query("history") history?: string) {
    return this.decisions.listDecisions(projectId, history === "true");
  }

  @Roles("CEO")
  @Post("decisions")
  createDecision(
    @Param("projectId") projectId: string,
    @Body() body: unknown,
    @CurrentAuth() actor: RequestAuth,
    @CurrentRequest() request: FactoryRequest,
  ) {
    return this.decisions.createDecision(projectId, body, actor, request);
  }

  @Roles("CEO")
  @Post("decisions/:logicalId/versions")
  reviseDecision(
    @Param("projectId") projectId: string,
    @Param("logicalId") logicalId: string,
    @Body() body: unknown,
    @CurrentAuth() actor: RequestAuth,
    @CurrentRequest() request: FactoryRequest,
  ) {
    return this.decisions.reviseDecision(projectId, logicalId, body, actor, request);
  }
}
