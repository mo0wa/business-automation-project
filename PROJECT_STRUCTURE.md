# BusinessPro - 프로젝트 구조 상세 가이드

## 📁 전체 프로젝트 구조

```
business-automation-project/
│
├── README.md                                    # 프로젝트 메인 문서
├── .gitignore                                   # Git 제외 파일 목록
│
├── backend/                                     # 백엔드 (Node.js + Express)
│   ├── package.json                            # 백엔드 의존성 및 스크립트
│   ├── .env                                    # 환경 변수 (포트, 환경 설정)
│   ├── server.js                               # Express 서버 메인 파일
│   ├── database.js                             # SQLite 데이터베이스 설정 및 헬퍼
│   └── business.db                             # SQLite 데이터베이스 파일 (자동 생성)
│
└── frontend/                                    # 프론트엔드 (React + Vite)
    ├── package.json                            # 프론트엔드 의존성 및 스크립트
    ├── vite.config.js                          # Vite 빌드 도구 설정
    ├── tailwind.config.js                      # Tailwind CSS 설정
    ├── postcss.config.js                       # PostCSS 설정
    ├── index.html                              # HTML 엔트리 포인트
    │
    └── src/                                    # 소스 코드
        ├── main.jsx                            # React 엔트리 포인트
        ├── App.jsx                             # 메인 앱 컴포넌트
        ├── index.css                           # 글로벌 스타일 (Tailwind + 커스텀)
        │
        ├── components/                         # UI 컴포넌트
        │   ├── QuoteForm.jsx                   # 견적서 생성/수정 폼
        │   └── ProjectForm.jsx                 # 프로젝트 생성/수정 폼
        │
        ├── hooks/                              # 커스텀 React 훅
        │   └── useData.js                      # 데이터 관리 훅 (quotes, projects, stats)
        │
        └── services/                           # API 서비스
            └── api.js                          # Axios 기반 API 클라이언트
```

---

## 📄 각 파일 상세 설명

### 🔹 루트 디렉토리

#### `README.md`
- **역할**: 프로젝트 소개, 설치 방법, 사용 가이드
- **내용**:
  - 프로젝트 개요
  - 기술 스택
  - 설치 및 실행 방법
  - API 엔드포인트 문서
  - 디렉토리 구조 설명

#### `.gitignore`
- **역할**: Git 버전 관리에서 제외할 파일/폴더 정의
- **제외 항목**:
  - `node_modules/` (의존성 패키지)
  - `*.db` (데이터베이스 파일)
  - `.env` (환경 변수)
  - `dist/`, `build/` (빌드 결과물)

---

### 🔹 Backend (백엔드)

#### `backend/package.json`
```json
{
  "name": "business-automation-backend",
  "version": "1.0.0",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",      // 프로덕션 실행
    "dev": "nodemon server.js"       // 개발 모드 (자동 재시작)
  },
  "dependencies": {
    "express": "^4.18.2",            // 웹 프레임워크
    "cors": "^2.8.5",                // CORS 미들웨어
    "sqlite3": "^5.1.6",             // SQLite 데이터베이스
    "body-parser": "^1.20.2",        // 요청 본문 파싱
    "dotenv": "^16.3.1"              // 환경 변수 관리
  }
}
```

#### `backend/.env`
```env
PORT=5000                            # 서버 포트
NODE_ENV=development                 # 환경 (development/production)
```

#### `backend/server.js` (메인 서버 파일)
- **역할**: Express 서버 설정 및 API 라우트 정의
- **주요 기능**:
  - CORS, Body Parser 미들웨어 설정
  - 견적서 CRUD API (`/api/quotes`)
  - 프로젝트 CRUD API (`/api/projects`)
  - 통계 API (`/api/stats`, `/api/stats/monthly`)
  - 서버 시작 및 포트 리스닝
- **API 엔드포인트**:
  ```
  GET    /api/quotes          - 모든 견적서 조회
  POST   /api/quotes          - 견적서 생성
  PUT    /api/quotes/:id      - 견적서 수정
  DELETE /api/quotes/:id      - 견적서 삭제
  
  GET    /api/projects        - 모든 프로젝트 조회
  POST   /api/projects        - 프로젝트 생성
  PUT    /api/projects/:id    - 프로젝트 수정
  DELETE /api/projects/:id    - 프로젝트 삭제
  
  GET    /api/stats           - 대시보드 통계
  GET    /api/stats/monthly   - 월별 매출 데이터
  ```

#### `backend/database.js` (데이터베이스 설정)
- **역할**: SQLite 데이터베이스 연결 및 헬퍼 함수 제공
- **주요 기능**:
  - 데이터베이스 초기화 및 테이블 생성
  - Promise 기반 쿼리 함수 (`runQuery`, `getOne`, `getAll`)
  - 견적서, 프로젝트, 고객 테이블 스키마 정의
- **테이블 구조**:
  - `quotes`: id, client_name, description, amount, status, created_at, updated_at
  - `projects`: id, name, description, start_date, end_date, manager, status, created_at, updated_at
  - `clients`: id, name, email, phone, company, created_at

#### `backend/business.db` (자동 생성)
- **역할**: SQLite 데이터베이스 파일
- **생성 시점**: 서버 최초 실행 시 자동 생성
- **데이터**: 견적서, 프로젝트, 고객 정보 저장

---

### 🔹 Frontend (프론트엔드)

#### `frontend/package.json`
```json
{
  "name": "business-automation-frontend",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",                   // 개발 서버 실행
    "build": "vite build",           // 프로덕션 빌드
    "preview": "vite preview"        // 빌드 결과 미리보기
  },
  "dependencies": {
    "react": "^18.2.0",              // React 라이브러리
    "react-dom": "^18.2.0",          // React DOM
    "axios": "^1.6.2",               // HTTP 클라이언트
    "recharts": "^2.10.3",           // 차트 라이브러리
    "lucide-react": "^0.263.1"       // 아이콘 라이브러리
  },
  "devDependencies": {
    "vite": "^5.0.8",                // 빌드 도구
    "@vitejs/plugin-react": "^4.2.1", // React 플러그인
    "tailwindcss": "^3.3.6",         // CSS 프레임워크
    "autoprefixer": "^10.4.16",      // CSS 자동 접두사
    "postcss": "^8.4.32"             // CSS 후처리
  }
}
```

#### `frontend/vite.config.js`
```javascript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,                      // 개발 서버 포트
    proxy: {
      '/api': {
        target: 'http://localhost:5000',  // API 프록시 설정
        changeOrigin: true
      }
    }
  }
})
```
- **역할**: Vite 빌드 도구 설정
- **주요 기능**:
  - React 플러그인 활성화
  - 개발 서버 포트 3000 설정
  - `/api` 요청을 백엔드 (5000 포트)로 프록시

#### `frontend/tailwind.config.js`
```javascript
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        'display': ['Playfair Display', 'serif'],  // 헤더용 폰트
        'sans': ['Inter', 'sans-serif'],           // 본문용 폰트
      },
    },
  },
  plugins: [],
}
```
- **역할**: Tailwind CSS 설정
- **주요 설정**:
  - 스캔할 파일 경로 지정
  - 커스텀 폰트 패밀리 정의

#### `frontend/postcss.config.js`
```javascript
export default {
  plugins: {
    tailwindcss: {},                 // Tailwind CSS 플러그인
    autoprefixer: {},                // 자동 접두사 플러그인
  },
}
```
- **역할**: PostCSS 설정 (CSS 후처리)

#### `frontend/index.html`
- **역할**: HTML 엔트리 포인트
- **주요 내용**:
  - `<div id="root"></div>` - React 앱 마운트 지점
  - Google Fonts 로드 (Playfair Display, Inter)
  - `<script src="/src/main.jsx">` - React 앱 로드

---

### 🔹 Frontend/src (소스 코드)

#### `frontend/src/main.jsx` (React 엔트리)
```javascript
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
```
- **역할**: React 앱을 DOM에 렌더링
- **주요 기능**: StrictMode로 앱 래핑

#### `frontend/src/App.jsx` (메인 컴포넌트)
- **역할**: 애플리케이션의 메인 컴포넌트
- **주요 기능**:
  - 탭 네비게이션 (대시보드/견적서/프로젝트)
  - 대시보드 통계 카드 및 차트
  - 견적서/프로젝트 목록 렌더링
  - 폼 모달 제어
  - 데이터 CRUD 이벤트 처리
- **사용 훅**:
  - `useQuotes()` - 견적서 데이터 및 CRUD
  - `useProjects()` - 프로젝트 데이터 및 CRUD
  - `useStats()` - 통계 데이터
- **주요 상태**:
  - `activeTab` - 현재 활성 탭
  - `showQuoteForm` - 견적서 폼 표시 여부
  - `showProjectForm` - 프로젝트 폼 표시 여부
  - `editingQuote` - 수정 중인 견적서
  - `editingProject` - 수정 중인 프로젝트

#### `frontend/src/index.css` (글로벌 스타일)
- **역할**: 전역 CSS 및 커스텀 스타일
- **주요 내용**:
  - Tailwind CSS 임포트
  - 글래스모피즘 효과 (`.glass-panel`, `.stat-card`)
  - 인터랙티브 요소 스타일 (`.tab-button`, `.primary-button`)
  - 배지 스타일 (`.badge-*`)
  - 애니메이션 (`@keyframes slideIn`)
  - 카드 호버 효과

---

### 🔹 Frontend/src/components (UI 컴포넌트)

#### `frontend/src/components/QuoteForm.jsx`
- **역할**: 견적서 생성/수정 폼 모달
- **Props**:
  - `quote` - 수정할 견적서 객체 (없으면 신규 생성)
  - `onSubmit` - 폼 제출 핸들러
  - `onClose` - 모달 닫기 핸들러
- **주요 필드**:
  - `client_name` - 고객명 (text, required)
  - `description` - 프로젝트 설명 (textarea, required)
  - `amount` - 견적 금액 (number, required)
  - `status` - 상태 (select: 대기중/승인됨/거절됨)
- **UI 특징**:
  - 다크 모드 글래스 패널
  - 반응형 레이아웃
  - 폼 검증 (HTML5 required)

#### `frontend/src/components/ProjectForm.jsx`
- **역할**: 프로젝트 생성/수정 폼 모달
- **Props**:
  - `project` - 수정할 프로젝트 객체 (없으면 신규 생성)
  - `onSubmit` - 폼 제출 핸들러
  - `onClose` - 모달 닫기 핸들러
- **주요 필드**:
  - `name` - 프로젝트명 (text, required)
  - `description` - 설명 (textarea, required)
  - `start_date` - 시작일 (date, required)
  - `end_date` - 종료일 (date, required)
  - `manager` - 담당자 (text, required)
  - `status` - 상태 (select: 진행중/완료/보류)
- **UI 특징**:
  - 2열 그리드 레이아웃 (날짜 필드)
  - 일관된 스타일링

---

### 🔹 Frontend/src/hooks (커스텀 훅)

#### `frontend/src/hooks/useData.js`
- **역할**: 데이터 페칭 및 상태 관리 커스텀 훅
- **제공 훅**:

##### 1. `useQuotes()`
```javascript
const { 
  quotes,           // 견적서 목록
  loading,          // 로딩 상태
  error,            // 에러 메시지
  createQuote,      // 견적서 생성 함수
  updateQuote,      // 견적서 수정 함수
  deleteQuote,      // 견적서 삭제 함수
  refetch           // 데이터 재조회 함수
} = useQuotes();
```

##### 2. `useProjects()`
```javascript
const { 
  projects,         // 프로젝트 목록
  loading,          // 로딩 상태
  error,            // 에러 메시지
  createProject,    // 프로젝트 생성 함수
  updateProject,    // 프로젝트 수정 함수
  deleteProject,    // 프로젝트 삭제 함수
  refetch           // 데이터 재조회 함수
} = useProjects();
```

##### 3. `useStats()`
```javascript
const { 
  stats,            // 통계 데이터 객체
  monthlyData,      // 월별 매출 배열
  loading,          // 로딩 상태
  error,            // 에러 메시지
  refetch           // 데이터 재조회 함수
} = useStats();
```

- **주요 기능**:
  - 컴포넌트 마운트 시 자동 데이터 페칭
  - CRUD 작업 후 자동 리페치
  - 에러 핸들링
  - 로딩 상태 관리

---

### 🔹 Frontend/src/services (API 서비스)

#### `frontend/src/services/api.js`
- **역할**: Axios 기반 HTTP 클라이언트
- **구성**:

##### Axios 인스턴스
```javascript
const api = axios.create({
  baseURL: 'http://localhost:5000/api',
  headers: { 'Content-Type': 'application/json' }
});
```

##### 견적서 API
```javascript
quotesAPI.getAll()           // GET /api/quotes
quotesAPI.create(data)       // POST /api/quotes
quotesAPI.update(id, data)   // PUT /api/quotes/:id
quotesAPI.delete(id)         // DELETE /api/quotes/:id
```

##### 프로젝트 API
```javascript
projectsAPI.getAll()         // GET /api/projects
projectsAPI.create(data)     // POST /api/projects
projectsAPI.update(id, data) // PUT /api/projects/:id
projectsAPI.delete(id)       // DELETE /api/projects/:id
```

##### 통계 API
```javascript
statsAPI.getStats()          // GET /api/stats
statsAPI.getMonthly()        // GET /api/stats/monthly
```

---

## 📊 데이터 흐름

```
사용자 액션 (UI)
    ↓
React 컴포넌트 (App.jsx)
    ↓
커스텀 훅 (useData.js)
    ↓
API 서비스 (api.js)
    ↓
Axios HTTP 요청
    ↓
Express 서버 (server.js)
    ↓
데이터베이스 (database.js)
    ↓
SQLite (business.db)
    ↓
응답 반환 (역순)
    ↓
UI 업데이트
```

---

## 🔄 개발 워크플로우

### 1. 백엔드 개발
```bash
cd backend
npm install           # 의존성 설치
npm run dev          # nodemon으로 개발 서버 실행
```

### 2. 프론트엔드 개발
```bash
cd frontend
npm install          # 의존성 설치
npm run dev         # Vite 개발 서버 실행
```

### 3. 프로덕션 빌드
```bash
cd frontend
npm run build       # dist/ 폴더에 빌드 결과 생성
```

---

## 🎯 파일별 주요 책임

| 파일 | 주요 책임 | 의존성 |
|------|----------|--------|
| `server.js` | API 라우팅, 비즈니스 로직 | database.js |
| `database.js` | 데이터베이스 CRUD | sqlite3 |
| `App.jsx` | UI 레이아웃, 탭 관리 | hooks, components |
| `useData.js` | 데이터 상태 관리 | api.js |
| `api.js` | HTTP 통신 | axios |
| `QuoteForm.jsx` | 견적서 폼 UI | lucide-react |
| `ProjectForm.jsx` | 프로젝트 폼 UI | lucide-react |

---

## 📝 추가 참고사항

### 환경 변수
- 백엔드 포트 변경: `backend/.env` 파일의 `PORT` 수정
- 프론트엔드 포트 변경: `frontend/vite.config.js`의 `server.port` 수정

### 데이터베이스
- 위치: `backend/business.db`
- 초기화: 파일 삭제 후 서버 재시작

### 스타일링
- Tailwind 유틸리티 클래스 + 커스텀 CSS
- 다크 테마 전용 디자인
- 글래스모피즘 효과

### 아이콘
- Lucide React 라이브러리 사용
- 트리 쉐이킹 지원 (필요한 아이콘만 임포트)

---

이 문서는 프로젝트의 모든 파일과 디렉토리 구조를 상세하게 설명합니다.
