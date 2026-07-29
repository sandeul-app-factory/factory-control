# 백업과 복구

## 백업 대상

- PostgreSQL: 프로젝트, PRD/의사결정/작업/감사 metadata
- MinIO/S3: PRD 원본, 보고서, SBOM, APK/AAB, source snapshot
- 배포 source의 commit SHA와 운영 Secret의 별도 Secret Manager backup
- 기존 Cloudflare/GitHub 설정은 각 공급자 절차로 별도 보존

Redis queue는 authoritative store가 아니다. 복구 후 DB의 Job/Task 상태를 검토해
필요한 작업만 명시적으로 재등록한다.

## 백업

```bash
sudo FACTORY_ENV_FILE=/etc/sandeul-factory/factory.env \
  FACTORY_COMPOSE_FILE=/opt/sandeul-app-factory/docker-compose.prod.yml \
  /opt/sandeul-app-factory/infra/scripts/backup.sh
```

스크립트는 timestamp 디렉터리에 custom-format `database.dump`, 현재 object,
`SHA256SUMS`를 저장한다. 기존 backup을 자동 삭제하지 않는다. 다른 host/account의
암호화된 저장소로 복제하고, 보존 주기 삭제는 복구 훈련 성공 후 별도 정책으로
수행한다.

## 복구 훈련

운영 DB에 바로 적용하지 말고 격리된 Compose project와 빈 volume에서 수행한다.

```bash
sudo FACTORY_ENV_FILE=/etc/sandeul-factory/factory.env \
  FACTORY_COMPOSE_FILE=/opt/sandeul-app-factory/docker-compose.prod.yml \
  /opt/sandeul-app-factory/infra/scripts/restore.sh \
  /srv/backups/sandeul-factory/20260101T000000Z --confirm
```

`--confirm`은 기존 Factory schema object를 교체하는 파괴적 동작을 명시한다. 스크립트는
적용 직전에 `pre-restore-*.dump`를 추가로 만든다.

## 복구 후 검증

1. SHA-256 manifest 검증
2. migration deploy와 `/api/health`
3. CEO 로그인과 session 강제 종료
4. 프로젝트/잠긴 PRD hash/상태 history/감사 chain 표본 확인
5. artifact 다운로드 후 DB의 SHA-256과 실제 파일 비교
6. 중단된 Codex Job을 자동 성공 처리하지 않고 수동 판정
7. Release gate를 다시 평가하고 signing을 자동 재실행하지 않음

정기적으로 RPO/RTO와 복구 훈련 날짜, backup SHA-256, 검증자를 외부 운영 기록에
남긴다.
