const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { hashPassword, isHashed } = require('./auth-util');

// DB 파일을 환경변수로 교체 가능 (기본: business.db / 데모: DB_FILE=business_demo.db)
const DB_PATH = path.join(__dirname, process.env.DB_FILE || 'business.db');

const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('❌ 데이터베이스 연결 실패:', err.message);
  } else {
    console.log('✓ SQLite 데이터베이스 연결 성공');
  }
});

// Promise wrapper
db.runAsync = (sql, params = []) => new Promise((resolve, reject) => {
  db.run(sql, params, function (err) {
    if (err) reject(err);
    else resolve({ lastID: this.lastID, changes: this.changes });
  });
});

db.allAsync = (sql, params = []) => new Promise((resolve, reject) => {
  db.all(sql, params, (err, rows) => {
    if (err) reject(err);
    else resolve(rows);
  });
});

db.getAsync = (sql, params = []) => new Promise((resolve, reject) => {
  db.get(sql, params, (err, row) => {
    if (err) reject(err);
    else resolve(row);
  });
});

function initDatabase() {
  db.serialize(() => {
    // 사용자 테이블
    db.run(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'employee' CHECK(role IN ('employee', 'admin')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // 로그인 세션(토큰) 테이블
    db.run(`CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`);

    // 관리자 설정 (회사 정보)
    db.run(`CREATE TABLE IF NOT EXISTS company_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_name TEXT DEFAULT '',
      representative TEXT DEFAULT '',
      business_number TEXT DEFAULT '',
      address TEXT DEFAULT '',
      phone TEXT DEFAULT '',
      fax TEXT DEFAULT '',
      stamp_image TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      tax_rate REAL DEFAULT 10.0,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // 견적서 마스터 테이블
    db.run(`CREATE TABLE IF NOT EXISTS quotes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL DEFAULT '',
      client_name TEXT NOT NULL DEFAULT '',
      client_company TEXT DEFAULT '',
      client_phone TEXT DEFAULT '',
      client_email TEXT DEFAULT '',
      client_address TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT '임시저장' CHECK(status IN ('임시저장','작업 대기','작업 중','작업 요청 X','미수금','수금 완료')),
      total_amount REAL DEFAULT 0,
      supply_amount REAL DEFAULT 0,
      tax_amount REAL DEFAULT 0,
      notes TEXT DEFAULT '',
      created_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (created_by) REFERENCES users(id)
    )`);

    // 견적서 상세 아이템 테이블
    db.run(`CREATE TABLE IF NOT EXISTS quote_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      quote_id INTEGER NOT NULL,
      category TEXT DEFAULT '',
      product_type TEXT DEFAULT '',
      product_name TEXT NOT NULL DEFAULT '',
      specification TEXT DEFAULT '',
      quantity INTEGER DEFAULT 1,
      unit_price REAL DEFAULT 0,
      supply_price REAL DEFAULT 0,
      tax REAL DEFAULT 0,
      raw_material_cost REAL DEFAULT 0,
      notes TEXT DEFAULT '',
      file_path TEXT DEFAULT '',
      image_path TEXT DEFAULT '',
      sort_order INTEGER DEFAULT 0,
      FOREIGN KEY (quote_id) REFERENCES quotes(id) ON DELETE CASCADE
    )`);

    // 지출 테이블
    db.run(`CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      expense_date DATE NOT NULL,
      reason TEXT NOT NULL DEFAULT '',
      amount REAL NOT NULL DEFAULT 0,
      notes TEXT DEFAULT '',
      created_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (created_by) REFERENCES users(id)
    )`);

    // quote_date 컬럼 마이그레이션 (기존 DB 호환)
    db.run(`ALTER TABLE quotes ADD COLUMN quote_date DATE DEFAULT NULL`, [], (err) => {
      if (err && !err.message.includes('duplicate column name')) {
        console.error('마이그레이션 오류:', err.message);
      }
    });

    // deleted_at 컬럼 마이그레이션 (휴지통 기능)
    db.run(`ALTER TABLE quotes ADD COLUMN deleted_at DATETIME DEFAULT NULL`, [], (err) => {
      if (err && !err.message.includes('duplicate column name')) console.error('마이그레이션 오류:', err.message);
    });

    // 결제/세금계산서 관련 컬럼 마이그레이션
    const newCols = [
      `ALTER TABLE quotes ADD COLUMN card_payment INTEGER DEFAULT 0`,
      `ALTER TABLE quotes ADD COLUMN payment_date DATE DEFAULT NULL`,
      `ALTER TABLE quotes ADD COLUMN electronic_tax_invoice INTEGER DEFAULT 0`,
      `ALTER TABLE quotes ADD COLUMN cash_receipt INTEGER DEFAULT 0`,
      `ALTER TABLE quotes ADD COLUMN issue_date DATE DEFAULT NULL`,
      `ALTER TABLE quotes ADD COLUMN transaction_date DATE DEFAULT NULL`,
      `ALTER TABLE quotes ADD COLUMN payment_date_confirmed INTEGER DEFAULT 0`,
      `ALTER TABLE quotes ADD COLUMN issue_date_confirmed INTEGER DEFAULT 0`,
    ];
    newCols.forEach(sql => db.run(sql, [], (err) => {
      if (err && !err.message.includes('duplicate column name')) console.error('마이그레이션 오류:', err.message);
    }));

    // '작업 완료' 상태 폐기: 기존 데이터를 '미수금'으로 일괄 변경
    db.run(`UPDATE quotes SET status = '미수금' WHERE status = '작업 완료'`, [], (err) => {
      if (err) console.error('작업 완료 상태 마이그레이션 오류:', err.message);
    });

    // 지출 테이블 description 컬럼 마이그레이션
    db.run(`ALTER TABLE expenses ADD COLUMN description TEXT DEFAULT ''`, [], (err) => {
      if (err && !err.message.includes('duplicate column name')) console.error('마이그레이션 오류:', err.message);
    });

    // 지출 테이블 fixed_item_id 컬럼 마이그레이션 (고정 지출 항목 연결)
    db.run(`ALTER TABLE expenses ADD COLUMN fixed_item_id INTEGER REFERENCES fixed_expense_items(id) ON DELETE SET NULL`, [], (err) => {
      if (err && !err.message.includes('duplicate column name')) console.error('마이그레이션 오류:', err.message);
    });

    // 견적 완료 체크 컬럼 마이그레이션
    db.run(`ALTER TABLE quotes ADD COLUMN is_completed INTEGER DEFAULT 0`, [], (err) => {
      if (err && !err.message.includes('duplicate column name')) console.error('마이그레이션 오류:', err.message);
    });

    // 품목 세액포함 체크 컬럼 마이그레이션
    db.run(`ALTER TABLE quote_items ADD COLUMN vat_inclusive INTEGER DEFAULT 0`, [], (err) => {
      if (err && !err.message.includes('duplicate column name')) console.error('마이그레이션 오류:', err.message);
    });

    // 품목 소분류 컬럼 마이그레이션 (견적서/명세서에서 품명 병합 + 소분류 열)
    db.run(`ALTER TABLE quote_items ADD COLUMN sub_category TEXT DEFAULT ''`, [], (err) => {
      if (err && !err.message.includes('duplicate column name')) console.error('마이그레이션 오류:', err.message);
    });

    // 월별 고정 지출 항목 테이블
    db.run(`CREATE TABLE IF NOT EXISTS fixed_expense_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL DEFAULT '',
      order_index INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // 고정 지출 항목 템플릿 컬럼 마이그레이션 (지출 등록 자동 채움용)
    const fixedItemCols = [
      `ALTER TABLE fixed_expense_items ADD COLUMN default_day INTEGER DEFAULT NULL`,
      `ALTER TABLE fixed_expense_items ADD COLUMN default_vendor TEXT DEFAULT ''`,
      `ALTER TABLE fixed_expense_items ADD COLUMN default_description TEXT DEFAULT ''`,
      `ALTER TABLE fixed_expense_items ADD COLUMN default_amount REAL DEFAULT 0`,
    ];
    fixedItemCols.forEach(sql => db.run(sql, [], (err) => {
      if (err && !err.message.includes('duplicate column name')) console.error('마이그레이션 오류:', err.message);
    }));

    // 월별 고정 지출 체크 현황 테이블
    db.run(`CREATE TABLE IF NOT EXISTS fixed_expense_checks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id INTEGER NOT NULL,
      year INTEGER NOT NULL,
      month INTEGER NOT NULL,
      is_checked INTEGER DEFAULT 0,
      notes TEXT DEFAULT '',
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (item_id) REFERENCES fixed_expense_items(id) ON DELETE CASCADE,
      UNIQUE(item_id, year, month)
    )`);

    // 매출 장부 월별 비고 테이블
    db.run(`CREATE TABLE IF NOT EXISTS revenue_monthly_notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      year INTEGER NOT NULL,
      month INTEGER NOT NULL,
      note TEXT DEFAULT '',
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(year, month)
    )`);

    // 고정 지출 항목 기본값 시드
    db.get('SELECT COUNT(*) as count FROM fixed_expense_items', [], (err, row) => {
      if (!err && row && row.count === 0) {
        const defaultItems = [
          '월급', '고용보험', '산재보험', '국민연금', '건강보험',
          'KT(사무실 전화)', 'KT(사무실 인터넷)', 'KT(실장 전화)', '한전(전기요금)', '수도요금',
          '차량유지비(주유, 수리 등)', '보험료(트럭, 크레인)', '자동차세(연납1월)', '지방세', '국유지대부료',
          '기장료(세무서)', '종합소득세(5월)', '부가가치세(1, 7월)', '', '',
        ];
        defaultItems.forEach((name, i) => {
          db.run('INSERT INTO fixed_expense_items (name, order_index) VALUES (?, ?)', [name, i + 1]);
        });
      }
    });

    // 기본 관리자 계정 생성 (해시 저장)
    db.run(`INSERT OR IGNORE INTO users (username, password, name, role) VALUES ('admin', ?, '관리자', 'admin')`, [hashPassword('admin123')]);
    db.run(`INSERT OR IGNORE INTO users (username, password, name, role) VALUES ('user', ?, '직원', 'employee')`, [hashPassword('user123')]);

    // 기존 평문 비밀번호 → 해시로 일괄 마이그레이션 (이미 해시면 건너뜀)
    db.all('SELECT id, password FROM users', [], (err, rows) => {
      if (err || !rows) return;
      rows.forEach(u => {
        if (!isHashed(u.password)) {
          db.run('UPDATE users SET password = ? WHERE id = ?', [hashPassword(u.password), u.id]);
        }
      });
    });

    // 기본 회사 설정
    db.get(`SELECT COUNT(*) as count FROM company_settings`, [], (err, row) => {
      if (!err && row.count === 0) {
        db.run(`INSERT INTO company_settings (company_name, representative, tax_rate) VALUES ('회사명을 입력하세요', '대표자명', 10.0)`);
      }
    });

    console.log('✓ 데이터베이스 테이블 초기화 완료');
  });
}

module.exports = { db, initDatabase };
