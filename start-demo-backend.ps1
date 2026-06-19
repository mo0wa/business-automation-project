# 데모(개발기) 백엔드 실행 — 포트 5001, DB는 business_demo.db
$env:PORT = '5001'
$env:DB_FILE = 'business_demo.db'
Set-Location "$PSScriptRoot\backend"
node server.js
