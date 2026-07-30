import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { androidBuildReadyPrdJsonSchema } from "@sandeul/contracts";
import { CurrentAuth, CurrentRequest, Roles } from "../common/decorators.js";
import type { FactoryRequest, RequestAuth } from "../common/request-context.js";
import { PrdService } from "./prd.service.js";

@Controller()
export class PrdController {
  constructor(private readonly prds: PrdService) {}

  @Get("projects/:projectId/prds")
  list(@Param("projectId") projectId: string) {
    return this.prds.list(projectId);
  }

  @Get("prd-versions/:prdVersionId")
  get(@Param("prdVersionId") prdVersionId: string) {
    return this.prds.get(prdVersionId);
  }

  @Get("prd-versions/:fromId/diff/:toId")
  diff(@Param("fromId") fromId: string, @Param("toId") toId: string) {
    return this.prds.diff(fromId, toId);
  }

  @Roles("CEO", "PM")
  @Post("projects/:projectId/prds")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 52_428_800, files: 1 } }))
  upload(
    @Param("projectId") projectId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body()
    body: {
      acceptanceCriteria?: string;
      includedArtifactIds?: string;
      excludedScope?: string;
      submitForReview?: string;
    },
    @CurrentAuth() actor: RequestAuth,
    @CurrentRequest() request: FactoryRequest,
  ) {
    if (!file) throw new BadRequestException("PRD 파일이 필요합니다.");
    return this.prds.upload(projectId, file, { ...body, ingestionSource: "WEB" }, actor, request);
  }

  @Get("prd-authoring/schema")
  @Header("Content-Disposition", 'attachment; filename="android-build-ready-v1.schema.json"')
  downloadSchema() {
    return androidBuildReadyPrdJsonSchema;
  }

  @Roles("CEO", "PM", "REVIEWER")
  @Post("prd-versions/:prdVersionId/request-review")
  requestReview(
    @Param("prdVersionId") prdVersionId: string,
    @CurrentAuth() actor: RequestAuth,
    @CurrentRequest() request: FactoryRequest,
  ) {
    return this.prds.requestReview(prdVersionId, actor, request);
  }

  @Roles("CEO", "PM", "REVIEWER")
  @Post("projects/:projectId/prd-comments")
  comment(
    @Param("projectId") projectId: string,
    @Body() body: unknown,
    @CurrentAuth() actor: RequestAuth,
    @CurrentRequest() request: FactoryRequest,
  ) {
    return this.prds.comment(projectId, body, actor, request);
  }

  @Roles("CEO")
  @Post("prd-versions/:prdVersionId/approvals")
  approve(
    @Param("prdVersionId") prdVersionId: string,
    @Body() body: unknown,
    @CurrentAuth() actor: RequestAuth,
    @CurrentRequest() request: FactoryRequest,
  ) {
    return this.prds.approve(prdVersionId, body, actor, request);
  }

  @Roles("CEO")
  @Post("prd-versions/:prdVersionId/lock")
  lock(
    @Param("prdVersionId") prdVersionId: string,
    @CurrentAuth() actor: RequestAuth,
    @CurrentRequest() request: FactoryRequest,
  ) {
    return this.prds.lock(prdVersionId, actor, request);
  }
}
