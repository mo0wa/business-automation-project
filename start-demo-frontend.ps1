# 데모(개발기) 프론트엔드 실행 — 포트 3001, API는 데모 백엔드(5001)로 프록시
$env:FE_PORT = '3001'
$env:API_TARGET = 'http://localhost:5001'
$env:IS_DEMO = 'true'
Set-Location "$PSScriptRoot\frontend"
npm run dev
