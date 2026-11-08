# 협업 가이드 — 두 PC에서 함께 개발 · 배포하기

이 문서 하나면 **새 PC에서 프로젝트를 받아 실행하고, 서로 겹치지 않게 작업하고, 배포까지** 할 수 있습니다.
처음 세팅하는 사람은 [2. 새 PC 최초 세팅](#2-새-pc-최초-세팅-1회만)부터, 매일 작업은 [3. 매일 작업 흐름](#3-매일-작업-흐름--겹침-방지-핵심)을 보세요.

> ⚠️ **먼저 채워야 할 빈칸이 있습니다.** 아래 표의 `❓` 값은 코드에 없고 **Render / Neon / Cloudflare 대시보드에만** 있습니다.
> 이 값들을 아는 사람이 채운 뒤 커밋해 주세요. (비밀값 자체는 여기 적지 말고, 위치·계정만 적거나 별도 안전한 채널로 공유)

| 항목 | 값 | 어디서 확인 |
|------|-----|------------|
| GitHub 저장소 | `https://github.com/mo0wa/business-automation-project.git` | (확인됨) |
| 운영 사이트 URL | `https://business-automation-project.onrender.com` | (확인됨) |
| 호스팅 | Render (무료 플랜, 웹 서비스 1개) | (확인됨) |
| 자동배포 브랜치 | ❓ (보통 `main`) | Render → Service → Settings → Branch |
| Render Build Command | ❓ | Render → Settings → Build Command |
| Render Start Command | ❓ | Render → Settings → Start Command |
| DB | Neon (PostgreSQL) | (확인됨) |
| `DATABASE_URL` (Neon 접속 문자열) | ❓ **비밀** | Neon 대시보드 또는 Render 환경변수 |
| Neon 계정 로그인 | ❓ | (팀 내 공유) |
| Cloudflare 계정 (keepalive worker) | ❓ | (팀 내 공유) |

---

## 1. 시스템 구성 한눈에

```
        ┌──────────── 개발자 PC (집 / 회사) ─────────────┐
        │  git clone → npm install → 코드 수정          │
        │  로컬 실행:  프론트(vite:3000) + 백엔드(:5000) │
        └───────────────────┬──────────────────────────┘
                            │ git push  (브랜치: main)
                            ▼
                    GitHub 저장소 (mo0wa/…)
                            │ push 시 자동 배포
                            ▼
        ┌──────────────── Render 웹 서비스 ───────────────┐
        │  Express 백엔드 1개가:                          │
        │   · /api/*      → REST API 처리                 │
        │   · 그 외 경로  → frontend/dist(React 빌드) 서빙 │  ← 단일 서비스
        │  https://business-automation-project.onrender.com│
        └───────────────────┬─────────────────────────────┘
                            │ DATABASE_URL (SSL)
                            ▼
                    Neon (PostgreSQL, 클라우드 DB)
                            ▲
                            │ 업무시간 10분마다 /health 핑 (콜드스타트 방지)
                    Cloudflare Worker "businesspro-keepalive"
```

**핵심 3가지**
1. **프론트/백이 한 서비스** — 운영에선 Express가 React 빌드(`frontend/dist`)까지 서빙합니다. 그래서 CORS도 껐습니다. ([backend/server.js](backend/server.js) 하단 참고)
2. **DB는 클라우드에 하나뿐** — 로컬에서 실행해도 `DATABASE_URL`이 가리키는 **같은 Neon DB**에 붙습니다. → 두 PC가 로컬 개발만 해도 **같은 실데이터를 건드립니다.** ([7. 데이터베이스](#7-데이터베이스-neon)의 경고 참고)
3. **`main`에 push = 운영 배포** — 자동배포라서 push 즉시 실서비스에 반영됩니다. 함부로 push 금지.

---

## 2. 새 PC 최초 세팅 (1회만)

### 준비물
- **Git**, **Node.js 18 이상** (`node -v`로 확인)
- GitHub 저장소 접근 권한 (mo0wa 계정 협업자로 초대되어 있어야 함)

### 순서
```powershell
# 1) 원하는 위치에 클론  (경로는 자유지만 문서 예시는 C:\work 기준)
cd C:\work
git clone https://github.com/mo0wa/business-automation-project.git
cd business-automation-project

# 2) 백엔드 의존성 설치
cd backend
npm install

# 3) 프론트엔드 의존성 설치
cd ..\frontend
npm install
```

### 4) 백엔드 환경변수 파일 만들기 — `backend/.env`
`.env`는 git에 올라가지 않으므로(`.gitignore`) **PC마다 직접 만들어야** 합니다.
`backend/.env` 파일을 새로 만들고 아래 내용을 넣으세요:

```env
# Neon(PostgreSQL) 접속 문자열 — 팀원에게 받아서 채우기
DATABASE_URL=❓여기에_Neon_접속문자열

# 로컬 백엔드 포트 (기본 5000)
PORT=5000

# 개발 모드
NODE_ENV=development
```

> 🔑 `DATABASE_URL` 없이는 백엔드가 뜨지 않습니다. 값은 Render 환경변수나 Neon 대시보드에서 복사하세요.

### 5) 실행해 보기 → [4. 로컬 실행](#4-로컬-실행) 으로

---

## 3. 매일 작업 흐름 — 겹침 방지 핵심

두 PC가 같은 저장소를 만지므로 **순서**만 지키면 충돌이 거의 없습니다.

```powershell
# ── 작업 시작할 때 ──
git pull                     # ① 항상 최신부터. 다른 PC가 올린 내용 먼저 받기
#   → WORKLOG.md 를 열어 "지금 누가 뭘 작업 중"인지 확인
#   → 내가 시작하는 작업을 WORKLOG.md 맨 위에 한 줄 적고 커밋 (아래 규칙)

# ── 작업 중 ──
#   자잘하게 자주 커밋. 큰 덩어리 하나 끝나면 push.

# ── 작업 끝낼 때 ──
git add -A
git commit -m "무엇을 왜 바꿨는지 한 줄"
git pull                     # ② push 전에 한 번 더 받기(그새 상대가 올렸을 수 있음)
git push                     # ③ main 자동배포 → 몇 분 뒤 운영 반영
#   → WORKLOG.md 에 오늘 한 일 / 배포 여부 기록
```

### 겹침을 막는 3가지 습관
1. **시작 전 `git pull`, push 전 `git pull`** — 이것만 지켜도 충돌 대부분 예방.
2. **[WORKLOG.md](WORKLOG.md) 맨 위 "🚧 지금 작업 중" 칸을 갱신** — 상대 PC는 `git pull` 하면 내가 뭘 만지는지 바로 봅니다. 같은 파일 동시 수정만 피하면 됩니다.
3. **큰 변경은 브랜치 사용(선택)** — 여러 날 걸리는 작업이면
   `git checkout -b feature/견적서-개편` 으로 따로 하고, 다 되면 `main`에 합칩니다.
   (브랜치는 push해도 배포되지 않음 → 안전하게 실험 가능)

### 충돌(conflict)이 났다면
`git pull` 시 충돌 메시지가 뜨면 → 해당 파일을 열어 `<<<<<<<` `=======` `>>>>>>>` 표시 부분을
직접 정리 → `git add 파일` → `git commit`. 애매하면 커밋 전에 물어보세요.

---

## 4. 로컬 실행

### A. 일반(운영과 동일) 모드 — 실 DB에 붙음
창 2개를 띄웁니다.

```powershell
# 창 1 — 백엔드 (포트 5000)
cd C:\work\business-automation-project\backend
npm start          # 개발 중 자동재시작 원하면: npm run dev

# 창 2 — 프론트엔드 (포트 3000, /api 는 5000으로 프록시)
cd C:\work\business-automation-project\frontend
npm run dev
```
브라우저: **http://localhost:3000**

> ⚠️ 이 모드는 `DATABASE_URL`이 가리키는 **운영 Neon DB에 그대로 붙습니다.** 테스트하다 실데이터가 바뀔 수 있으니, 데이터 만지는 실험은 아래 데모/별도 DB로 하세요.

### B. 데모/테스트 모드 — 포트 3001/5001
저장소에 데모용 실행 스크립트가 있습니다:
- [start-demo-backend.ps1](start-demo-backend.ps1) — 백엔드 5001
- [start-demo-frontend.ps1](start-demo-frontend.ps1) — 프론트 3001
- [seed-demo.ps1](seed-demo.ps1) — 가짜 데이터 채우기 ([backend/seed-demo.js](backend/seed-demo.js))

> ⚠️ **주의:** 이 스크립트들은 예전 SQLite 시절 흔적(`DB_FILE=business_demo.db`)이 남아 있지만,
> 현재 DB 계층([backend/database.js](backend/database.js))은 **Postgres 전용**이라 `DB_FILE`을 무시하고
> 여전히 `DATABASE_URL`에 붙습니다. **즉 데모 모드도 결국 같은 Neon DB를 사용합니다.**
> 진짜로 분리된 테스트를 하려면 **Neon에서 별도 브랜치/DB를 만들어** 그 접속 문자열을 `DATABASE_URL`로 주고 실행하세요.

---

## 5. 환경변수 레퍼런스

| 변수 | 쓰는 곳 | 값 | 비고 |
|------|---------|-----|------|
| `DATABASE_URL` | 백엔드 전체 | Neon 접속 문자열 | **필수·비밀.** 로컬은 `.env`, 운영은 Render 환경변수 |
| `PORT` | 백엔드 | 로컬 5000 / 운영은 Render가 자동 주입 | [backend/server.js:12](backend/server.js#L12) |
| `NODE_ENV` | 백엔드 | `development` / `production` | 로그 표시용 |
| `FE_PORT` | 프론트 dev | 기본 3000 (데모 3001) | [frontend/vite.config.js](frontend/vite.config.js) |
| `API_TARGET` | 프론트 dev 프록시 | 기본 `http://localhost:5000` | 데모는 5001 |
| `DEMO_YEARS` / `DEMO_MAX_PER_DAY` / `DEMO_MAX_EXP_PER_DAY` | 시드 스크립트 | 데모 데이터 규모 조절 | [backend/seed-demo.js](backend/seed-demo.js) |

---

## 6. 배포 (Render)

- **방식:** GitHub `main` 브랜치에 push하면 Render가 자동으로 빌드·재배포합니다. (별도 명령 불필요)
- **저장소에 `render.yaml`이 없습니다** → Build/Start 명령이 **Render 대시보드에만** 저장돼 있습니다.
  아는 사람이 아래를 확인해서 위 [빈칸 표](#협업-가이드--두-pc에서-함께-개발--배포하기)에 적어주세요.
  - **Build Command** (예상): `npm install --prefix backend && npm install --prefix frontend && npm run build --prefix frontend`
  - **Start Command** (예상): `node backend/server.js`
  - **Root Directory**: (설정돼 있다면 그 값)
- **배포 상태/로그 보기:** Render 대시보드 → 해당 Service → **Logs / Events** 탭.
- **배포 확인:** 브라우저로 `https://business-automation-project.onrender.com/health` → `{"ok":true,...}` 나오면 정상.
- **무료 플랜 콜드스타트:** 15분 미접속 시 잠듦(첫 접속 30초 지연). → [8. Keepalive](#8-keepalive-cloudflare-worker)가 업무시간엔 깨워둡니다.

> 💡 **권장:** 이 Build/Start/환경변수 설정을 코드로 박아두는 `render.yaml`(Blueprint)을 만들면,
> 대시보드에만 있는 설정이 git으로 공유되어 이 문제가 근본적으로 사라집니다. 필요하면 요청하세요.

---

## 7. 데이터베이스 (Neon)

- **종류:** PostgreSQL (Neon 클라우드). 접속은 `DATABASE_URL` 하나로. ([backend/database.js:7](backend/database.js#L7))
- **스키마:** 서버 시작 시 `initDatabase()`가 없는 테이블을 자동 생성합니다. 별도 마이그레이션 도구 없음.
- **주요 테이블:** `users`, `company_settings`, `quotes`, `quote_items`, `expenses`,
  `fixed_expense_items`, `fixed_expense_checks`, `revenue_monthly_notes`, `sessions` 등.
- **사용량 확인:** 관리자 화면의 **‘DB 사용량’** 페이지에서 Neon 용량/테이블/행수를 볼 수 있습니다. ([frontend/src/components/DbStatus.jsx](frontend/src/components/DbStatus.jsx))
- **1회성 이전 스크립트:** [backend/migrate-to-postgres.js](backend/migrate-to-postgres.js) — 예전 SQLite(`business.db`) → Neon 이식용. (이미 이전 완료, 평소엔 안 씀. 실행하면 데이터 테이블을 비우고 다시 채우니 주의)

> ⚠️ **두 PC 공통 주의:** 운영 DB가 하나뿐이라, **로컬에서 지운/바꾼 데이터도 실데이터입니다.**
> - 데이터 구조를 크게 바꾸는 작업 전엔 **Neon 대시보드에서 백업(또는 브랜치)** 을 먼저 뜨세요.
> - 진짜 파괴적인 실험은 Neon **별도 브랜치 DB**의 접속 문자열로 실행하세요.

---

## 8. Keepalive (Cloudflare Worker)

- **역할:** Render 무료 인스턴스가 잠들지 않게, 업무시간(KST 08:00~21:59) **10분마다** `/health` 핑.
- **코드:** [keepalive/worker.js](keepalive/worker.js), 스케줄: [keepalive/wrangler.toml](keepalive/wrangler.toml) (크론은 UTC 기준).
- **배포법:** [keepalive/README.md](keepalive/README.md) 참고 — `wrangler login` 후 `keepalive` 폴더에서 `wrangler deploy`.
- 시간대·주기를 바꾸려면 `wrangler.toml`의 `crons` 수정 후 재배포.

> **2026-11-09 추가 — GitHub Actions keepalive 가동 중 (로그인 불필요)**
> 무료 인스턴스가 **잠든 뒤 못 깨어나는 현상**(재배포하면 복구)이 확인되어 [.github/workflows/keepalive.yml](.github/workflows/keepalive.yml)을 추가했습니다.
> - 업무시간(KST 07:52~21:57) 5분마다 `/health` 핑 → 잠들지 않게 유지
> - 무응답이면 `keepalive/last-redeploy.txt`를 갱신해 `main`에 push → Render 재배포로 **자동 복구**
>   (`/health`의 `commit` 값이 새 커밋으로 바뀌는 것으로 배포 반영 확인)
> - 그래서 `github-actions[bot]` 커밋이 보통 하루 1회(아침) 생깁니다. 작업 전 `git pull`만 하면 됩니다.
> - 실행 기록: GitHub 저장소 → **Actions** 탭 → keepalive. 끄려면 그 화면에서 *Disable workflow*.
> - 업무시간 밖(22시~익일 07:50)에는 잠들어서 접속이 안 될 수 있습니다. 근본 해결은 Render 유료 인스턴스(잠들지 않음).

---

## 9. 계정 · 접속정보 체크리스트

새 PC / 새 팀원에게 넘겨줄 것 (**값은 이 파일에 적지 말고 안전한 채널로**):

- [ ] GitHub 저장소 협업자 초대 (mo0wa)
- [ ] Render 대시보드 접근 (또는 Build/Start 명령·환경변수 목록 공유)
- [ ] Neon `DATABASE_URL` (또는 Neon 계정 로그인)
- [ ] Cloudflare 계정 (keepalive worker 관리 필요 시)
- [ ] 앱 관리자 계정(admin) 로그인 정보

---

## 10. 자주 겪는 문제

| 증상 | 원인 / 해결 |
|------|-------------|
| 백엔드가 바로 죽음 | `backend/.env`의 `DATABASE_URL` 없음/오타. 값 확인 |
| 첫 접속이 30초 걸림 | Render 무료 콜드스타트(정상). keepalive가 업무시간엔 완화 |
| `git push` 거부됨 | push 전에 `git pull` 안 함 → pull 후 다시 push |
| 화면은 뜨는데 데이터가 안 나옴 | 백엔드(5000) 안 켜졌거나 DB 접속 실패 → 백엔드 로그 확인 |
| 로그인 계속 실패 | 15분 10회 실패 시 IP 차단(레이트리밋). 잠시 후 재시도 |
| 상대와 같은 파일 충돌 | [3. 매일 작업 흐름](#3-매일-작업-흐름--겹침-방지-핵심)의 conflict 항목 참고 |

---

📌 **작업 기록은 [WORKLOG.md](WORKLOG.md)에.** 매 작업/배포마다 한 줄씩 남기면 두 PC가 서로 뭘 했는지 추적됩니다.
