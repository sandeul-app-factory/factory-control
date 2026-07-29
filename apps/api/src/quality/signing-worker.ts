export interface SigningRequest {
  releaseId: string;
  commitSha: string;
  prdSha256: string;
  testRunId: string;
  securityScanId: string;
  buildSha256: string;
}

export interface SigningResult {
  configured: boolean;
  status: "NOT_CONFIGURED";
  signed: false;
  message: string;
}

export interface SigningWorker {
  sign(request: SigningRequest): Promise<SigningResult>;
}

export class StubSigningWorker implements SigningWorker {
  sign(_request: SigningRequest): Promise<SigningResult> {
    return Promise.resolve({
      configured: false,
      status: "NOT_CONFIGURED",
      signed: false,
      message:
        "Signing Worker와 Keystore가 설정되지 않았습니다. unsigned 또는 debug Artifact까지만 사용할 수 있습니다.",
    });
  }
}
