# Cloudflare Tunnel 연결

공개 hostname은 `factory.sandeul.work`이다. Factory gateway는 호스트의
`127.0.0.1:8080`에 바인드되며, Docker로 실행하는 전용 `factory-tunnel`
컨테이너에서는 `http://host.docker.internal:8080`으로 접근한다.

현재 Factory는 기존 Cloudflare tunnel `Sandeul_tunnel_v1`
(`0bcebddc-8c98-4921-ae4e-50f681bdfb2b`)을 사용한다. 이 터널은 원격 관리형이므로
Cloudflare에 저장된 ingress가 실행 시 적용된다. 저장소의
`config.yaml.example`은 검토 및 검증용 mirror다. `boss-guild-event` 터널과
설정 파일 및 컨테이너를 공유하지 않는다.

1. 기존 터널의 설정, credential JSON, DNS route를 먼저 확인한다.
2. Factory credential JSON을 저장소 밖에 보관한다.
3. `FACTORY_CLOUDFLARED_CREDENTIALS_FILE`에 그 절대 경로를 설정한다.
4. Cloudflare dashboard 또는 Tunnel Edit 권한을 가진 API에서 YAML과 동일한
   ingress를 적용한다. 마지막 catch-all 404 규칙을 유지한다.
5. 다음 명령으로 mirror를 검증하고 전용 컨테이너를 기동한다.

```powershell
$env:FACTORY_CLOUDFLARED_CREDENTIALS_FILE = `
  "$env:USERPROFILE\.cloudflared\factory\0bcebddc-8c98-4921-ae4e-50f681bdfb2b.json"
cloudflared tunnel --config infra/cloudflared/config.yaml.example ingress validate
docker compose -f infra/cloudflared/docker-compose.yml up -d
```

`factory.sandeul.work` DNS가 없을 때만 아래 route를 한 번 생성한다. 기존 레코드가
있다면 먼저 대상을 확인하며 `--overwrite-dns`를 사용하지 않는다.

```powershell
cloudflared tunnel route dns Sandeul_tunnel_v1 factory.sandeul.work
```

기존 `boss-guild-event` 컨테이너는 중단하거나 재생성하지 않는다. Factory tunnel
종료가 필요하면 전용 Compose 파일에만 `down`을 적용한다.

Cloudflare Access를 앞단에 둘 수 있지만 Factory 자체 로그인, 세션 쿠키, CSRF
방어는 유지한다. gateway 포트는 public interface에 bind하지 않는다. TLS 종료 후
원래 scheme과 host가 전달되어 Secure cookie와 Origin 검사가 동작하는지 확인한다.
