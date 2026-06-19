# BusinessPro v2.0 - 비즈니스 자동화 시스템

## 📋 주요 기능

### 1. 견적 리스트 (메인 화면) - 전체 접근
- **카드형 UI**로 견적서 목록 표시
- 상태별 필터링: 임시저장 → 작업 대기 → 작업 중 → 작업 요청 X → 미수금 → 수금 완료
- 검색 (고객명, 제목, 회사명)
- 카드에서 바로 견적서/거래명세서 인쇄, PNG 저장 가능
- 클릭 시 상세 화면으로 이동

### 2. 견적 상세 화면
- 고객 정보 및 품목 내역 수정
- 품목 컬럼: 분류, 품목, 품명, 규격, 수량, 단가, 공급가액, 원자재값, 비고
- **견적서 출력 시**: 품명, 규격, 수량, 단가, 공급가액, 세액만 포함 (원자재값 등 미포함)
- 우측 사이드바: 금액 요약, 원가 분석(마진율), 견적 정보

### 3. 지출 등록 (관리자 전용)
- 좌측: 그리드 리스트 | 우측: 상세/등록 패널
- 지출일(캘린더), 지출 이유/장소, 금액, 비고
- 신규 등록 시 우측 패널이 "신규 등록" 모드로 전환

### 4. 매출 장부 (관리자 전용)
- 월별/분기별/전년비교 뷰 전환
- 매출, 지출, 원자재비, 순이익 차트
- 비용 구조 파이 차트
- 월별 상세 테이블

### 5. 관리자 화면 (관리자 전용)
- 회사 정보: 상호, 대표자, 등록번호, 주소, 전화, 팩스, 세율, 비고
- 대표자 직인 도장 이미지 업로드
- 사용자 관리: 계정 추가 (관리자/직원)

## 🔐 권한 구조
| 메뉴 | 직원(employee) | 관리자(admin) |
|------|:-:|:-:|
| 견적 리스트 | ✅ | ✅ |
| 지출 등록 | ❌ | ✅ |
| 매출 장부 | ❌ | ✅ |
| 관리자 화면 | ❌ | ✅ |

## 🚀 설치 및 실행

### 1단계: 기존 파일 교체
기존 `C:\work\business-automation-project\` 폴더의 파일들을 이 프로젝트 파일로 교체합니다.

**주의**: `node_modules` 폴더는 교체하지 않습니다.

### 2단계: 백엔드 의존성 설치
```powershell
cd C:\work\business-automation-project\backend
npm install
```

### 3단계: 프론트엔드 의존성 설치
```powershell
cd C:\work\business-automation-project\frontend
npm install
```

### 4단계: 데이터베이스 초기화 (선택)
기존 DB를 초기화하려면:
```powershell
cd C:\work\business-automation-project\backend
del business.db
```
서버 시작 시 자동으로 새 DB가 생성됩니다.

### 5단계: 서버 실행

**PowerShell 창 #1 - 백엔드:**
```powershell
cd C:\work\business-automation-project\backend
npm start
```

**PowerShell 창 #2 - 프론트엔드:**
```powershell
cd C:\work\business-automation-project\frontend
npm run dev
```

### 6단계: 브라우저 접속
```
http://localhost:3000
```

## 🔑 테스트 계정
| 구분 | 아이디 | 비밀번호 |
|------|--------|----------|
| 관리자 | admin | admin123 |
| 직원 | user | user123 |

## 📦 기술 스택
- **Frontend**: React 18 + Vite + Recharts + Lucide Icons
- **Backend**: Node.js + Express + SQLite3
- **스타일**: 커스텀 CSS (Noto Sans KR + JetBrains Mono 폰트)

## 📡 API 엔드포인트

### 인증
- `POST /api/auth/login` - 로그인
- `GET /api/auth/users` - 사용자 목록
- `POST /api/auth/users` - 사용자 추가

### 견적서
- `GET /api/quotes` - 목록 (status, search 파라미터)
- `GET /api/quotes/:id` - 상세 (아이템 포함)
- `POST /api/quotes` - 생성
- `PUT /api/quotes/:id` - 수정
- `PATCH /api/quotes/:id/status` - 상태 변경
- `DELETE /api/quotes/:id` - 삭제

### 지출
- `GET /api/expenses` - 목록 (year, month 파라미터)
- `POST /api/expenses` - 등록
- `PUT /api/expenses/:id` - 수정
- `DELETE /api/expenses/:id` - 삭제

### 매출 장부
- `GET /api/revenue/monthly?year=2026` - 월별 매출/지출
- `GET /api/revenue/yearly` - 연도별
- `GET /api/revenue/summary?year=2026` - 요약 통계

### 설정
- `GET /api/settings` - 회사 정보 조회
- `PUT /api/settings` - 회사 정보 수정

## 💾 데이터베이스 구조
- `users` - 사용자 (username, password, name, role)
- `company_settings` - 회사 정보 (상호, 대표자, 등록번호, 주소, 직인 등)
- `quotes` - 견적서 마스터 (고객정보, 상태, 금액)
- `quote_items` - 견적서 품목 (분류, 품명, 규격, 수량, 단가, 원자재값 등)
- `expenses` - 지출 내역 (지출일, 이유, 금액, 비고)
