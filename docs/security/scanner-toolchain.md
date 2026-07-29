# Factory Security Toolchain

Factory source SAST는
[`schemas/security/semgrep.yml`](../../schemas/security/semgrep.yml)의 고신뢰도 정책을
기본으로 사용한다. `eval`, unsafe Prisma raw SQL, shell 실행, `shell: true`, TLS 검증
비활성화, Codex `danger-full-access`를 ERROR로 차단한다. 조직 Semgrep Registry 정책은
CI에서 이 정책에 추가할 수 있지만 기본 정책을 대체하지 않는다.

2026-07-29 검증 환경에서는 공식 `semgrep/semgrep:1.164.0`의 RPC core가 종료되지 않아
동일 정책을 `semgrep/semgrep:1.150.0`으로 실행했다. 118개 tracked target, 6개 차단
규칙에서 Finding은 0건이었다. 운영 CI의 Scanner 버전 변경 시 이 회귀를 다시 확인한다.

## Commands

빠른 Phase gate:

```bash
pnpm security:baseline
```

설치된 외부 Scanner를 모두 요구하는 전체 검사:

```bash
pnpm security:full
```

전체 검사는 OSV Scanner v2 source scan, Semgrep Factory rules, Gitleaks git scan, Trivy
filesystem scan, Syft CycloneDX SBOM, pnpm dependency license report를 고정 인자와
`shell: false`로 실행한다. 결과는 `generated/security/`에 생성되며 Repository에
Commit하지 않고 Factory Artifact API로 업로드해야 한다.

도구가 하나라도 없거나 CRITICAL/HIGH 결과로 non-zero exit를 반환하면 스크립트도
실패한다. 도구 누락을 통과로 표시하지 않는다.

Scanner CLI 기준:

- OSV Scanner: <https://google.github.io/osv-scanner/usage/>
- Semgrep CLI: <https://semgrep.dev/docs/category/local-and-cli-scans>
- Gitleaks: <https://github.com/gitleaks/gitleaks>
- Trivy filesystem: <https://trivy.dev/docs/latest/guide/target/filesystem/>

## 2026-07-29 검증 버전

- OSV Scanner `2.3.8`
- Semgrep `1.150.0` (상단의 `1.164.0` RPC 회귀 사유 참조)
- Gitleaks `8.30.1`
- Trivy `0.72.0`
- Syft `1.44.0`

Trivy는 source filesystem과 API, Web, Worker, Migration 런타임 이미지를 각각 검사한다.
런타임 이미지는 서비스별 production dependency만 포함하며 `node` UID 1000으로 실행한다.
