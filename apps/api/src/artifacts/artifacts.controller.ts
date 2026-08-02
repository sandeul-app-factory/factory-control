import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { artifactKindSchema, logicalFolderSchema } from "@sandeul/contracts";
import { CurrentAuth, CurrentRequest, Roles } from "../common/decorators.js";
import type { FactoryRequest, RequestAuth } from "../common/request-context.js";
import { ArtifactsService } from "./artifacts.service.js";

@Controller()
export class ArtifactsController {
  constructor(private readonly artifacts: ArtifactsService) {}

  @Get("projects/:projectId/artifacts")
  list(@Param("projectId") projectId: string) {
    return this.artifacts.list(projectId);
  }

  @Roles("CEO", "PM")
  @Post("projects/:projectId/artifacts/:kind/:logicalFolder")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 52_428_800, files: 1 } }))
  upload(
    @Param("projectId") projectId: string,
    @Param("kind") rawKind: string,
    @Param("logicalFolder") rawFolder: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body("description") rawDescription: string | undefined,
    @CurrentAuth() actor: RequestAuth,
    @CurrentRequest() request: FactoryRequest,
  ) {
    const kind = artifactKindSchema.safeParse(rawKind);
    const folder = logicalFolderSchema.safeParse(decodeURIComponent(rawFolder));
    if (!kind.success || !folder.success || !file) {
      throw new BadRequestException("파일, 종류 또는 논리 폴더가 올바르지 않습니다.");
    }
    const description = rawDescription?.trim();
    if (description && description.length > 4000) {
      throw new BadRequestException("설명은 4,000자 이하여야 합니다.");
    }
    return this.artifacts.store(
      projectId,
      kind.data,
      folder.data,
      file,
      actor,
      request,
      description,
    );
  }

  @Get("artifact-versions/:artifactVersionId/download")
  download(
    @Param("artifactVersionId") artifactVersionId: string,
    @CurrentAuth() actor: RequestAuth,
    @CurrentRequest() request: FactoryRequest,
  ) {
    return this.artifacts.signedDownload(artifactVersionId, actor, request);
  }
}
