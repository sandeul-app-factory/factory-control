# Cloudflare Tunnel 연결

공개 hostname은 `factory.sandeul.work`이고 origin은 loopback gateway
`http://127.0.0.1:8080`이다.

1. 기존 `/etc/cloudflared/config.yaml`, tunnel ID, credential JSON, DNS route를
   먼저 백업하고 확인한다.
2. [config.yaml.example](../../infra/cloudflared/config.yaml.example)을 복사본에서
   검토한다.
3. `EXISTING_TUNNEL_ID`와 credential 경로만 기존 값으로 치환한다.
4. 기존 ingress 규칙이 있다면 덮어쓰지 말고 `factory.sandeul.work` 항목과 마지막
   catch-all을 올바른 순서로 병합한다.
5. `cloudflared tunnel ingress validate`와
   `cloudflared tunnel ingress rule https://factory.sandeul.work`로 확인한 뒤
   서비스를 reload한다.

Cloudflare Access를 앞단에 둘 수 있지만 Factory 자체 로그인·세션·CSRF는 유지한다.
gateway 포트는 public interface에 bind하지 않는다. TLS 종료 후 원래 scheme/host가
전달되어 Secure cookie와 Origin 검사가 동작하는지 확인한다.

기존 DNS route 또는 tunnel을 삭제·재생성하지 않는다. 현재 서버의 구성 형식이 예제와
다르면 운영 구성을 기준으로 최소 변경한다.
