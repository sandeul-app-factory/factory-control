import { Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { prisma } from "@sandeul/database";
import { S3ObjectStorage, artifactObjectKey, validateUpload } from "@sandeul/storage";
import type { ArtifactKind, LogicalFolder } from "@sandeul/contracts";
import type { FactoryRequest, RequestAuth } from "../common/request-context.js";
import { AuditService } from "../audit/audit.service.js";

function objectStorage(): S3ObjectStorage {
  return new S3ObjectStorage(process.env.S3_BUCKET ?? "factory-artifacts", {
    ...(process.env.S3_ENDPOINT ? { endpoint: process.env.S3_ENDPOINT } : {}),
    region: process.env.S3_REGION ?? "auto",
    accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
    forcePathStyle: (process.env.S3_FORCE_PATH_STYLE ?? "true") === "true",
  });
}

@Injectable()
export class ArtifactsService {
  constructor(private readonly audit: AuditService) {}

  list(projectId: string) {
    return prisma.artifact.findMany({
      where: { projectId, deletedAt: null },
      include: { versions: { orderBy: { versionNumber: "desc" }, take: 1 } },
      orderBy: [{ logicalFolder: "asc" }, { updatedAt: "desc" }],
    });
  }

  async store(
    projectId: string,
    kind: ArtifactKind,
    logicalFolder: LogicalFolder,
    file: Express.Multer.File,
    actor: RequestAuth,
    request: FactoryRequest,
  ) {
    const maxBytes = Number(process.env.MAX_UPLOAD_BYTES ?? 52_428_800);
    const upload = await validateUpload(file.buffer, file.originalname, file.mimetype, maxBytes);
    const artifactId = randomUUID();
    const artifactVersionId = randomUUID();
    const key = artifactObjectKey(projectId, artifactId, 1, upload.sha256);
    await objectStorage().put(key, upload);

    const artifact = await prisma.artifact.create({
      data: {
        id: artifactId,
        projectId,
        kind,
        logicalFolder,
        name: upload.originalName,
        createdBy: actor.userId,
        versions: {
          create: {
            id: artifactVersionId,
            versionNumber: 1,
            objectKey: key,
            sha256: upload.sha256,
            originalName: upload.originalName,
            mimeType: upload.mimeType,
            extension: upload.extension,
            sizeBytes: BigInt(upload.sizeBytes),
            createdBy: actor.userId,
          },
        },
      },
      include: { versions: true },
    });
    await this.audit.record({
      actor,
      action: "FILE_UPLOAD",
      resourceType: "Artifact",
      resourceId: artifact.id,
      projectId,
      requestId: request.requestId,
      outcome: "SUCCESS",
      metadata: {
        kind,
        logicalFolder,
        sha256: upload.sha256,
        sizeBytes: upload.sizeBytes,
        mimeType: upload.mimeType,
      },
    });
    return artifact;
  }

  async signedDownload(artifactVersionId: string, actor: RequestAuth, request: FactoryRequest) {
    const version = await prisma.artifactVersion.findUnique({
      where: { id: artifactVersionId },
      include: { artifact: true },
    });
    if (!version || version.artifact.deletedAt) {
      throw new NotFoundException("파일을 찾을 수 없습니다.");
    }
    const url = await objectStorage().signedDownloadUrl(version.objectKey, version.originalName);
    await this.audit.record({
      actor,
      action: "FILE_DOWNLOAD",
      resourceType: "ArtifactVersion",
      resourceId: version.id,
      projectId: version.artifact.projectId,
      requestId: request.requestId,
      outcome: "SUCCESS",
      metadata: { sha256: version.sha256 },
    });
    return { url, expiresInSeconds: 60, sha256: version.sha256 };
  }
}
