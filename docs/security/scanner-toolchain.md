# Factory Security Toolchain

## Commands

빠른 Phase gate:

```bash
pnpm security:baseline
```

설치된 외부 Scanner를 모두 요구하는 전체 검사:

```bash
pnpm security:full
```

전체 검사는 OSV Scanner v2 source scan, Semgrep auto rules, Gitleaks git scan, Trivy
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
