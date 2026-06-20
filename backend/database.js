const { Pool, types } = require('pg');
const { hashPassword } = require('./auth-util');

// DATE(OID 1082)는 'YYYY-MM-DD' 문자열 그대로 반환 (JS Date 변환 시 타임존 밀림 방지 → SQLite 시절과 동일 동작)
types.setTypeParser(1082, (v) => v);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 5,
});

pool.on('error', (err) => console.error('Postgres 풀 오류:', err.message));

// SQLite 시절 코드 호환: ? → $1,$2 ... 자동 변환
function toPg(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

const db = {
  query: (sql, params = []) => pool.query(toPg(sql), params),
  getAsync: async (sql, params = []) => (await pool.query(toPg(sql), params)).rows[0],
  allAsync: async (sql, params = []) => (await pool.query(toPg(sql), params)).rows,
  // INSERT는 lastID를 위해 RETURNING id 자동 부착 (SQLite this.lastID 호환)
  // 단, sessions 테이블은 PK가 token이라 id 컬럼이 없으므로 제외
  runAsync: async (sql, params = []) => {
    let q = toPg(sql);
    const isInsert = /^\s*insert/i.test(q);
    const intoSessions = /^\s*insert\s+into\s+sessions\b/i.test(q);
    if (isInsert && !intoSessions && !/returning/i.test(q)) q += ' RETURNING id';
    const r = await pool.query(q, params);
    return { lastID: r.rows && r.rows[0] ? r.rows[0].id : undefined, changes: r.rowCount };
  },
  pool,
};

async function initDatabase() {
  // 사용자
  await pool.query(`CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'employee' CHECK(role IN ('employee','admin')),
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  // 로그인 세션(토큰)
  await pool.query(`CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ
  )`);

  // 회사 설정
  await pool.query(`CREATE TABLE IF NOT EXISTS company_settings (
    id SERIAL PRIMARY KEY,
    company_name TEXT DEFAULT '',
    representative TEXT DEFAULT '',
    business_number TEXT DEFAULT '',
    address TEXT DEFAULT '',
    phone TEXT DEFAULT '',
    fax TEXT DEFAULT '',
    stamp_image TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    tax_rate DOUBLE PRECISION DEFAULT 10.0,
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  // 견적서 마스터 (전체 컬럼 포함)
  await pool.query(`CREATE TABLE IF NOT EXISTS quotes (
    id SERIAL PRIMARY KEY,
    title TEXT DEFAULT '',
    client_name TEXT DEFAULT '',
    client_company TEXT DEFAULT '',
    client_phone TEXT DEFAULT '',
    client_email TEXT DEFAULT '',
    client_address TEXT DEFAULT '',
    status TEXT NOT NULL DEFAULT '임시저장' CHECK(status IN ('임시저장','작업 대기','작업 중','작업 요청 X','미수금','수금 완료')),
    total_amount DOUBLE PRECISION DEFAULT 0,
    supply_amount DOUBLE PRECISION DEFAULT 0,
    tax_amount DOUBLE PRECISION DEFAULT 0,
    notes TEXT DEFAULT '',
    created_by INTEGER,
    quote_date DATE,
    deleted_at TIMESTAMPTZ,
    cash_payment INTEGER DEFAULT 0,
    card_payment INTEGER DEFAULT 0,
    payment_date DATE,
    electronic_tax_invoice INTEGER DEFAULT 0,
    cash_receipt INTEGER DEFAULT 0,
    issue_date DATE,
    transaction_date DATE,
    payment_date_confirmed INTEGER DEFAULT 0,
    issue_date_confirmed INTEGER DEFAULT 0,
    is_completed INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  // 견적 품목
  await pool.query(`CREATE TABLE IF NOT EXISTS quote_items (
    id SERIAL PRIMARY KEY,
    quote_id INTEGER NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
    category TEXT DEFAULT '',
    product_type TEXT DEFAULT '',
    product_name TEXT DEFAULT '',
    sub_category TEXT DEFAULT '',
    specification TEXT DEFAULT '',
    quantity DOUBLE PRECISION DEFAULT 0,
    unit_price DOUBLE PRECISION DEFAULT 0,
    supply_price DOUBLE PRECISION DEFAULT 0,
    tax DOUBLE PRECISION DEFAULT 0,
    raw_material_cost DOUBLE PRECISION DEFAULT 0,
    notes TEXT DEFAULT '',
    file_path TEXT DEFAULT '',
    image_path TEXT DEFAULT '',
    sort_order INTEGER DEFAULT 0,
    vat_inclusive INTEGER DEFAULT 0
  )`);

  // 고정 지출 항목 (지출 fixed_item_id가 참조하므로 먼저 생성)
  await pool.query(`CREATE TABLE IF NOT EXISTS fixed_expense_items (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL DEFAULT '',
    order_index INTEGER DEFAULT 0,
    default_day INTEGER,
    default_vendor TEXT DEFAULT '',
    default_description TEXT DEFAULT '',
    default_amount DOUBLE PRECISION DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  // 지출
  await pool.query(`CREATE TABLE IF NOT EXISTS expenses (
    id SERIAL PRIMARY KEY,
    expense_date DATE NOT NULL,
    reason TEXT DEFAULT '',
    description TEXT DEFAULT '',
    amount DOUBLE PRECISION DEFAULT 0,
    notes TEXT DEFAULT '',
    created_by INTEGER,
    fixed_item_id INTEGER REFERENCES fixed_expense_items(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  // 월별 고정 지출 체크 현황
  await pool.query(`CREATE TABLE IF NOT EXISTS fixed_expense_checks (
    id SERIAL PRIMARY KEY,
    item_id INTEGER NOT NULL REFERENCES fixed_expense_items(id) ON DELETE CASCADE,
    year INTEGER NOT NULL,
    month INTEGER NOT NULL,
    is_checked INTEGER DEFAULT 0,
    notes TEXT DEFAULT '',
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(item_id, year, month)
  )`);

  // 매출 장부 월별 비고
  await pool.query(`CREATE TABLE IF NOT EXISTS revenue_monthly_notes (
    id SERIAL PRIMARY KEY,
    year INTEGER NOT NULL,
    month INTEGER NOT NULL,
    note TEXT DEFAULT '',
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(year, month)
  )`);

  // 기본 관리자 계정 (해시 저장)
  await pool.query(
    `INSERT INTO users (username, password, name, role) VALUES ('admin', $1, '관리자', 'admin') ON CONFLICT (username) DO NOTHING`,
    [hashPassword('admin123')]
  );
  await pool.query(
    `INSERT INTO users (username, password, name, role) VALUES ('user', $1, '직원', 'employee') ON CONFLICT (username) DO NOTHING`,
    [hashPassword('user123')]
  );

  // 고정 지출 항목 기본값 (비어있을 때만)
  const fc = await pool.query('SELECT COUNT(*)::int AS count FROM fixed_expense_items');
  if (fc.rows[0].count === 0) {
    const defaultItems = [
      '월급', '고용보험', '산재보험', '국민연금', '건강보험',
      'KT(사무실 전화)', 'KT(사무실 인터넷)', 'KT(실장 전화)', '한전(전기요금)', '수도요금',
      '차량유지비(주유, 수리 등)', '보험료(트럭, 크레인)', '자동차세(연납1월)', '지방세', '국유지대부료',
      '기장료(세무서)', '종합소득세(5월)', '부가가치세(1, 7월)', '', '',
    ];
    for (let i = 0; i < defaultItems.length; i++) {
      await pool.query('INSERT INTO fixed_expense_items (name, order_index) VALUES ($1, $2)', [defaultItems[i], i + 1]);
    }
  }

  // 기본 회사 설정 (비어있을 때만)
  const cc = await pool.query('SELECT COUNT(*)::int AS count FROM company_settings');
  if (cc.rows[0].count === 0) {
    await pool.query(`INSERT INTO company_settings (company_name, representative, tax_rate) VALUES ('회사명을 입력하세요', '대표자명', 10.0)`);
  }

  console.log('✓ Postgres 테이블 초기화 완료');
}

module.exports = { db, initDatabase };
