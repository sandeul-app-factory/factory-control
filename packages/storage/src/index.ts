import {
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { fileTypeFromBuffer } from "file-type";
import { sha256 } from "@sandeul/security";

const extensionMimeMap: Readonly<Record<string, readonly string[]>> = {
  ".md": ["text/markdown", "text/plain"],
  ".json": ["application/json", "text/json", "text/plain"],
  ".pdf": ["application/pdf"],
  ".docx": ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  ".png": ["image/png"],
  ".jpg": ["image/jpeg"],
  ".jpeg": ["image/jpeg"],
  ".webp": ["image/webp"],
  ".apk": ["application/vnd.android.package-archive", "application/zip"],
  ".aab": ["application/octet-stream", "application/zip"],
  ".spdx.json": ["application/json", "text/plain"],
};

export interface ValidatedUpload {
  buffer: Buffer;
  originalName: string;
  extension: string;
  mimeType: string;
  sha256: string;
  sizeBytes: number;
}

export interface ObjectStorage {
  health(): Promise<void>;
  put(key: string, upload: ValidatedUpload): Promise<void>;
  signedDownloadUrl(key: string, downloadName: string): Promise<string>;
}

function normalizedExtension(name: string): string {
  const lowered = name.toLowerCase();
  if (lowered.endsWith(".spdx.json")) return ".spdx.json";
  const lastDot = lowered.lastIndexOf(".");
  return lastDot >= 0 ? lowered.slice(lastDot) : "";
}

export async function validateUpload(
  buffer: Buffer,
  originalName: string,
  claimedMimeType: string,
  maxBytes: number,
): Promise<ValidatedUpload> {
  if (buffer.length === 0 || buffer.length > maxBytes) {
    throw new Error(`파일 크기는 1~${maxBytes} bytes 범위여야 합니다.`);
  }
  if (/[/\\\0]/.test(originalName) || originalName.length > 500) {
    throw new Error("안전하지 않은 파일명입니다.");
  }

  const extension = normalizedExtension(originalName);
  const allowedMimes = extensionMimeMap[extension];
  if (!allowedMimes) {
    throw new Error("허용되지 않은 파일 확장자입니다.");
  }

  const detected = await fileTypeFromBuffer(buffer);
  const textual = extension === ".md" || extension === ".json" || extension === ".spdx.json";
  const effectiveMime = detected?.mime ?? claimedMimeType.toLowerCase();

  if (!textual && !detected) {
    throw new Error("파일 형식을 확인할 수 없습니다.");
  }
  if (!allowedMimes.includes(effectiveMime) && !allowedMimes.includes(claimedMimeType)) {
    throw new Error("파일 확장자와 MIME type이 일치하지 않습니다.");
  }

  if (extension === ".json" || extension === ".spdx.json") {
    try {
      JSON.parse(buffer.toString("utf8"));
    } catch {
      throw new Error("유효한 JSON 파일이 아닙니다.");
    }
  }

  return {
    buffer,
    originalName,
    extension,
    mimeType: effectiveMime,
    sha256: sha256(buffer),
    sizeBytes: buffer.length,
  };
}

export function artifactObjectKey(
  projectId: string,
  artifactId: string,
  versionNumber: number,
  digest: string,
): string {
  const uuidPattern = /^[0-9a-f-]{36}$/i;
  if (!uuidPattern.test(projectId) || !uuidPattern.test(artifactId) || versionNumber < 1) {
    throw new Error("잘못된 artifact object key 입력입니다.");
  }
  return `projects/${projectId}/artifacts/${artifactId}/v${versionNumber}/${digest}`;
}

export class S3ObjectStorage implements ObjectStorage {
  private readonly client: S3Client;

  constructor(
    private readonly bucket: string,
    options: {
      endpoint?: string;
      region: string;
      accessKeyId: string;
      secretAccessKey: string;
      forcePathStyle: boolean;
    },
  ) {
    this.client = new S3Client({
      ...(options.endpoint ? { endpoint: options.endpoint } : {}),
      region: options.region,
      forcePathStyle: options.forcePathStyle,
      credentials: {
        accessKeyId: options.accessKeyId,
        secretAccessKey: options.secretAccessKey,
      },
    });
  }

  async health(): Promise<void> {
    await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
  }

  async put(key: string, upload: ValidatedUpload): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: upload.buffer,
        ContentLength: upload.sizeBytes,
        ContentType: upload.mimeType,
        Metadata: { sha256: upload.sha256 },
      }),
    );
  }

  async signedDownloadUrl(key: string, downloadName: string): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ResponseContentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(downloadName)}`,
      }),
      { expiresIn: 60 },
    );
  }
}
