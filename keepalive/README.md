# Keepalive (Render 무료 인스턴스 깨우기)

Render 무료 플랜은 15분간 요청이 없으면 잠들어, 다음 접속 시 30초 안팎의 콜드스타트가 생긴다.
이 Cloudflare Worker가 **업무시간(KST 08:00~21:59)에 10분마다** `/health`를 호출해 깨어있게 유지한다.
(업무시간 외에는 호출하지 않아 그냥 잠들게 둔다 → 무료 자원 절약)

## 배포 방법 (Cloudflare, 무료)

1. Cloudflare 계정 생성/로그인 (https://dash.cloudflare.com)
2. wrangler(클라우드플레어 CLI) 설치:
   ```
   npm install -g wrangler
   ```
3. 로그인 (브라우저 인증 창이 뜸):
   ```
   wrangler login
   ```
4. 이 폴더에서 배포:
   ```
   cd keepalive
   wrangler deploy
   ```
   → 끝. 이후 Cloudflare가 알아서 크론으로 핑을 보낸다.

배포 후 워커 URL(예: `https://businesspro-keepalive.<계정>.workers.dev`)을 브라우저로 열면
즉시 한 번 핑이 가서 정상 동작을 바로 확인할 수 있다.

## 시간대를 바꾸려면
`wrangler.toml`의 `crons` 값을 수정 (UTC 기준, KST = UTC+9).
- 24시간 항상: `crons = ["*/10 * * * *"]`
- KST 09~18시: `crons = ["*/10 0-9 * * *"]`

## 더 간단한 대안 (코드 없이)
Cloudflare가 번거로우면 무료 모니터링 서비스로도 가능:
- https://uptimerobot.com (5분 간격, 무료) — Monitor 추가 → URL에 `https://business-automation-project.onrender.com/health`
- https://cron-job.org (분 단위, 무료) — 위 URL 등록
단, 이런 서비스는 보통 24시간 핑을 보낸다(업무시간 제한이 어려움).
