import { randomUUID } from "node:crypto";
import { prisma, type Prisma } from "@sandeul/database";
import { S3ObjectStorage, artifactObjectKey, validateUpload } from "@sandeul/storage";
import type { ArtifactKind, LogicalFolder } from "@sandeul/contracts";
import type { PipelineArtifact } from "./android-pipeline.js";

function objectStorage(): S3ObjectStorage {
  return new S3ObjectStorage(process.env.S3_BUCKET ?? "factory-artifacts", {
    ...(process.env.S3_ENDPOINT ? { endpoint: process.env.S3_ENDPOINT } : {}),
    ...(process.env.S3_PUBLIC_ENDPOINT ? { publicEndpoint: process.env.S3_PUBLIC_ENDPOINT } : {}),
    region: process.env.S3_REGION ?? "auto",
    accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
    forcePathStyle: (process.env.S3_FORCE_PATH_STYLE ?? "true") === "true",
  });
}

export async function storePipelineArtifact(input: {
  projectId: string;
  actorId: string;
  kind: ArtifactKind;
  logicalFolder: LogicalFolder;
  artifact: PipelineArtifact;
  metadata: Prisma.InputJsonValue;
}): Promise<{ artifactId: string; artifactVersionId: string; sha256: string }> {
  const upload = await validateUpload(
    input.artifact.buffer,
    input.artifact.name,
    input.artifact.mimeType,
    Number(
      input.kind === "APK" || input.kind === "AAB"
        ? (process.env.MAX_BUILD_ARTIFACT_BYTES ?? 536_870_912)
        : (process.env.MAX_UPLOAD_BYTES ?? 52_428_800),
    ),
  );
  if (upload.sha256 !== input.artifact.sha256) {
    throw new Error("Pipeline Artifact SHA-256 재검증에 실패했습니다.");
  }
  const artifactId = randomUUID();
  const artifactVersionId = randomUUID();
  const objectKey = artifactObjectKey(input.projectId, artifactId, 1, upload.sha256);
  await objectStorage().put(objectKey, upload);
  await prisma.artifact.create({
    data: {
      id: artifactId,
      projectId: input.projectId,
      kind: input.kind,
      logicalFolder: input.logicalFolder,
      name: upload.originalName,
      createdBy: input.actorId,
      versions: {
        create: {
          id: artifactVersionId,
          versionNumber: 1,
          objectKey,
          sha256: upload.sha256,
          originalName: upload.originalName,
          mimeType: upload.mimeType,
          extension: upload.extension,
          sizeBytes: BigInt(upload.sizeBytes),
          metadata: input.metadata,
          createdBy: input.actorId,
        },
      },
    },
  });
  return { artifactId, artifactVersionId, sha256: upload.sha256 };
}
