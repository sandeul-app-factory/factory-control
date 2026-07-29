# Quality, Build, and Release Boundary

## Trust boundary

Factory Web은 Shell 명령을 받지 않는다. CI, Codex Worker 또는 전용 Scanner Adapter는
승인된 명령을 실행한 뒤 구조화된 Test/Security/Build report만 API에 제출한다. API는
project, task, commit, artifact 종류와 hash를 다시 확인하며 결과를 감사 로그에 남긴다.

```text
CI / Codex Worker / Scanner Adapter
             |
             | structured report + immutable IDs
             v
        Factory API
             |
             +-- TestRun / TestResult
             +-- SecurityScan / Finding / SBOM reference
             +-- Build / APK or AAB hash
             |
             v
        Release Gate
             |
             +-- blocked -> GATE_BLOCKED
             `-- passed  -> CANDIDATE -> CEO APPROVED
                                             |
                                             v
                                      Signing Worker Stub
```

## Release Gate

Gate는 호출할 때마다 DB의 현재 기록으로 다시 계산한다.

- PRD가 `LOCKED`이고 Build의 PRD SHA-256과 일치
- Test Run, Security Scan, Build의 Commit SHA 일치
- Test Run `PASSED`, 실패 결과 0, Acceptance Criteria 충족
- Security Scan `PASSED`
- 미해결 CRITICAL 0
- 유효한 위험 수용이 없는 HIGH 0
- 프로젝트의 SBOM Artifact 존재
- Build `SUCCEEDED`
- APK/AAB ArtifactVersion과 저장된 SHA-256 일치

CRITICAL Finding은 위험 수용할 수 없다. HIGH 위험 수용에는 CEO 또는
SECURITY_REVIEWER의 사유가 필요하고 선택적으로 만료일을 기록한다. 만료되거나 철회된
위험 수용은 Gate에서 인정하지 않는다.

## Signing separation

Codex Worker는 Keystore에 접근하지 않는다. MVP의 `SigningWorker` interface는 승인된
Commit, PRD hash, Test Run, Security Scan, Release Candidate, Build hash를 입력으로
받지만 Stub은 항상 `NOT_CONFIGURED`를 반환한다. 실제 서명 구현 전까지 UI는 Artifact를
`미서명`으로 표시하고 Release 상태를 `SIGNED`로 바꾸지 않는다.

## State transitions

- 통과한 Test Run: `CODE_REVIEW -> QA_TESTING`
- 완료된 Security Scan: `QA_TESTING -> SECURITY_REVIEW`
- Gate 통과 Candidate: `SECURITY_REVIEW -> RELEASE_CANDIDATE`
- CEO 최종 승인: `RELEASE_CANDIDATE -> FINAL_APPROVAL`

각 전환은 기존 서버 상태 머신을 통과하고 ProjectStateHistory와 AuditLog를 생성한다.
