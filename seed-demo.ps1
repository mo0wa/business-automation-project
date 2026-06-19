# 데모 DB(business_demo.db)를 가짜 데이터로 (재)생성
$env:DB_FILE = 'business_demo.db'
Set-Location "$PSScriptRoot\backend"
node seed-demo.js
