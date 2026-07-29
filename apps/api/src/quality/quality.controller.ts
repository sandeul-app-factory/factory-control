import { BadRequestException, Body, Controller, Get, Param, Post } from "@nestjs/common";
import {
  buildReportSchema,
  releaseApprovalSchema,
  releaseCandidateSchema,
  riskAcceptanceInputSchema,
  securityScanReportSchema,
  testRunReportSchema,
} from "@sandeul/contracts";
import { CurrentAuth, CurrentRequest, Roles } from "../common/decorators.js";
import type { FactoryRequest, RequestAuth } from "../common/request-context.js";
import { QualityService } from "./quality.service.js";

function parseBody<T>(
  schema: {
    safeParse(
      value: unknown,
    ): { success: true; data: T } | { success: false; error: { issues: unknown } };
  },
  body: unknown,
): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new BadRequestException(parsed.error.issues);
  return parsed.data;
}

@Controller()
export class QualityController {
  constructor(private readonly quality: QualityService) {}

  @Get("quality/overview")
  overview() {
    return this.quality.overview();
  }

  @Get("projects/:projectId/test-runs")
  tests(@Param("projectId") projectId: string) {
    return this.quality.listTests(projectId);
  }

  @Roles("CEO", "DEVELOPER", "REVIEWER")
  @Post("projects/:projectId/test-runs")
  recordTest(
    @Param("projectId") projectId: string,
    @Body() body: unknown,
    @CurrentAuth() actor: RequestAuth,
    @CurrentRequest() request: FactoryRequest,
  ) {
    return this.quality.recordTest(projectId, parseBody(testRunReportSchema, body), actor, request);
  }

  @Get("projects/:projectId/security-scans")
  scans(@Param("projectId") projectId: string) {
    return this.quality.listSecurityScans(projectId);
  }

  @Roles("CEO", "SECURITY_REVIEWER")
  @Post("projects/:projectId/security-scans")
  recordScan(
    @Param("projectId") projectId: string,
    @Body() body: unknown,
    @CurrentAuth() actor: RequestAuth,
    @CurrentRequest() request: FactoryRequest,
  ) {
    return this.quality.recordSecurityScan(
      projectId,
      parseBody(securityScanReportSchema, body),
      actor,
      request,
    );
  }

  @Roles("CEO", "SECURITY_REVIEWER")
  @Post("projects/:projectId/risk-acceptances")
  acceptRisk(
    @Param("projectId") projectId: string,
    @Body() body: unknown,
    @CurrentAuth() actor: RequestAuth,
    @CurrentRequest() request: FactoryRequest,
  ) {
    return this.quality.acceptRisk(
      projectId,
      parseBody(
        riskAcceptanceInputSchema,
        typeof body === "object" && body ? { ...body, projectId } : body,
      ),
      actor,
      request,
    );
  }

  @Get("projects/:projectId/builds")
  builds(@Param("projectId") projectId: string) {
    return this.quality.listBuilds(projectId);
  }

  @Roles("CEO", "DEVELOPER")
  @Post("projects/:projectId/builds")
  recordBuild(
    @Param("projectId") projectId: string,
    @Body() body: unknown,
    @CurrentAuth() actor: RequestAuth,
    @CurrentRequest() request: FactoryRequest,
  ) {
    return this.quality.recordBuild(projectId, parseBody(buildReportSchema, body), actor, request);
  }

  @Get("projects/:projectId/releases")
  releases(@Param("projectId") projectId: string) {
    return this.quality.listReleases(projectId);
  }

  @Post("projects/:projectId/release-gate")
  releaseGate(@Param("projectId") projectId: string, @Body() body: unknown) {
    return this.quality.releaseGate(projectId, parseBody(releaseCandidateSchema, body));
  }

  @Roles("CEO")
  @Post("projects/:projectId/releases")
  createRelease(
    @Param("projectId") projectId: string,
    @Body() body: unknown,
    @CurrentAuth() actor: RequestAuth,
    @CurrentRequest() request: FactoryRequest,
  ) {
    return this.quality.createReleaseCandidate(
      projectId,
      parseBody(releaseCandidateSchema, body),
      actor,
      request,
    );
  }

  @Roles("CEO")
  @Post("releases/:releaseId/approve")
  approveRelease(
    @Param("releaseId") releaseId: string,
    @Body() body: unknown,
    @CurrentAuth() actor: RequestAuth,
    @CurrentRequest() request: FactoryRequest,
  ) {
    return this.quality.approveRelease(
      releaseId,
      parseBody(releaseApprovalSchema, body),
      actor,
      request,
    );
  }

  @Roles("CEO")
  @Post("releases/:releaseId/sign")
  sign(
    @Param("releaseId") releaseId: string,
    @CurrentAuth() actor: RequestAuth,
    @CurrentRequest() request: FactoryRequest,
  ) {
    return this.quality.requestSigning(releaseId, actor, request);
  }
}
