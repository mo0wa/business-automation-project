/**
 * 로컬 SQLite(business.db) → Neon(Postgres) 1회성 데이터 이전 스크립트.
 *
 * 실행 (backend 폴더에서):
 *   node migrate-to-postgres.js
 *   (DATABASE_URL은 .env에서 읽음. 다른 SQLite 파일이면 SQLITE_PATH=xxx.db 지정)
 *
 * 동작: Neon 테이블 생성 보장 → 데이터 테이블 비우기(TRUNCATE) → business.db 내용을 id 보존하며 이식 → 시퀀스 재설정.
 * 재실행해도 안전(매번 비우고 다시 채움). 첨부파일/세션은 이식하지 않음.
 */
require('dotenv').config();
const sqlite3 = require('sqlite3').verbose();
const { Pool } = require('pg');
const { hashPassword, isHashed } = require('./auth-util');
const { initDatabase } = require('./database');

const SQLITE_PATH = process.env.SQLITE_PATH || 'business.db';
const DATE_COLS = new Set([
  'quote_date', 'payment_date', 'issue_date', 'transaction_date', 'expense_date',
  'created_at', 'updated_at', 'deleted_at', 'expires_at',
]);
// FK 순서대로 이식
const ORDER = ['users', 'company_settings', 'fixed_expense_items', 'quotes', 'quote_items', 'expenses', 'fixed_expense_checks', 'revenue_monthly_notes'];

const pg = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const sdb = new sqlite3.Database(SQLITE_PATH, sqlite3.OPEN_READONLY);
const sAll = (sql) => new Promise((res, rej) => sdb.all(sql, (e, r) => (e ? rej(e) : res(r || []))));

async function importTable(table, rows) {
  for (const row of rows) {
    const cols = Object.keys(row);
    const vals = cols.map((c) => {
      let v = row[c];
      if (v === '' && DATE_COLS.has(c)) v = null;                 // 빈 문자열 날짜 → null
      if (table === 'users' && c === 'password' && v && !isHashed(v)) v = hashPassword(v); // 평문이면 해시
      return v;
    });
    const ph = cols.map((_, i) => `$${i + 1}`).join(',');
    await pg.query(`INSERT INTO ${table} (${cols.map((c) => `"${c}"`).join(',')}) VALUES (${ph})`, vals);
  }
  return rows.length;
}

(async () => {
  console.log('▶ Neon 스키마 보장...');
  await initDatabase();

  console.log('▶ 기존 데이터 비우기...');
  await pg.query(`TRUNCATE quotes, quote_items, expenses, fixed_expense_items, fixed_expense_checks, company_settings, revenue_monthly_notes, users, sessions RESTART IDENTITY CASCADE`);

  console.log('▶ 이식 시작...');
  for (const t of ORDER) {
    let rows = [];
    try { rows = await sAll(`SELECT * FROM ${t}`); } catch (e) { console.log(`  (${t} 건너뜀: ${e.message})`); continue; }
    // 고아 데이터 정리 (SQLite는 FK 미강제라 끊긴 참조가 있을 수 있음)
    if (t === 'fixed_expense_checks') {
      const valid = new Set((await pg.query('SELECT id FROM fixed_expense_items')).rows.map((r) => r.id));
      const before = rows.length;
      rows = rows.filter((r) => valid.has(r.item_id));
      if (before !== rows.length) console.log(`  (fixed_expense_checks 고아 ${before - rows.length}건 제외)`);
    }
    const n = await importTable(t, rows);
    console.log(`  ${t}: ${n}건`);
  }

  console.log('▶ 시퀀스 재설정...');
  for (const t of ORDER) {
    await pg.query(
      `SELECT setval(pg_get_serial_sequence($1,'id'), COALESCE((SELECT MAX(id) FROM ${t}), 1), (SELECT COUNT(*) > 0 FROM ${t}))`,
      [t]
    );
  }

  console.log('✅ 이전 완료');
  sdb.close();
  await pg.end();
})().catch((e) => { console.error('❌ 이전 실패:', e.message); sdb.close(); pg.end(); process.exit(1); });
