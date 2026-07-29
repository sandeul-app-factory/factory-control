# Sandeul App Factory v2 — Legacy Inventory

## 조사 기준

- 조사일: 2026-07-29 (Asia/Seoul)
- 대상 경로: `C:\Users\user\Desktop\SH\dev\sandeul-app-factory`
- 조사 시점 Git 상태: 새 로컬 저장소, 커밋 및 원격 없음
- 초기 기본 브랜치: `main`

## 기존 구현

대상 폴더는 사용자의 지시에 따라 새로 생성되었다. 이전 Factory 소스, 설정, 데이터베이스
마이그레이션, 빌드 산출물, 인프라 파일은 대상 폴더에 존재하지 않았다.

상위 `dev` 폴더에는 Factory와 무관한 여러 프로젝트와 개인 파일이 존재한다. 이들은 본
저장소 범위 밖이며 이동, 삭제, 수정하지 않는다.

## 유지해야 하는 외부 자원

다음 자원은 저장소 외부에 이미 존재하는 것으로 간주하며 자동 삭제·재생성·덮어쓰기를
금지한다.

- 기존 GitHub 계정 또는 조직
- 기존 GitHub 저장소와 앱별 Repository 관리 방식
- 기존 서버
- `factory.sandeul.work` 도메인
- 기존 Cloudflare 또는 리버스 프록시 구성
- 기존 DNS 레코드
- 기존 GitHub Secrets

## 복구 기준점

이 문서를 포함한 `main` 최초 커밋을 새 구축 전 기준점으로 사용한다. 실제 구현은
`rebuild/factory-v2` 브랜치에서 수행한다. Force push는 사용하지 않는다.

## 발견된 제한

- 아직 연결할 원격 Git 저장소 URL이 제공되지 않았다.
- 실제 외부 Secret과 GitHub App 자격 증명은 제공되지 않았다.
- 로컬 호스트에 Node.js와 pnpm이 설치되어 있지 않다.
- Docker CLI와 Docker Compose는 설치되어 있다.

Secret이 없어도 `.env.example`과 Adapter 경계를 작성하고 Fake Adapter를 사용한 로컬
검증을 계속한다.
