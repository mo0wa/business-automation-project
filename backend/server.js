require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
const { db, initDatabase } = require('./database');
const { hashPassword, verifyPassword, generateToken } = require('./auth-util');

const app = express();
const PORT = process.env.PORT || 5000;
const SESSION_DAYS = 7; // 로그인 유지 기간

// Render 등 리버스 프록시 뒤에서 실제 클라이언트 IP 인식 (레이트리밋용)
app.set('trust proxy', 1);
app.disable('x-powered-by');

// 미들웨어
// 보안 헤더 (CSP는 SPA 호환 위해 비활성화, 나머지 X-Frame-Options/HSTS 등 적용)
app.use(helmet({ contentSecurityPolicy: false }));
// 프론트를 같은 서버가 서빙하므로 CORS 불필요 — 제거(타 사이트의 API 호출 차단)
app.use(bodyParser.json({ limit: '5mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '5mb' }));

// 로그인 무차별 대입(brute-force) 방어: IP당 15분에 10회 실패 시 차단
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // 성공 로그인은 카운트 제외
  message: { error: '로그인 시도가 너무 많습니다. 잠시 후 다시 시도해주세요.' },
});

// 헬스체크 (keepalive 핑용, 인증 불필요)
app.get('/health', (req, res) => res.json({ ok: true, ts: Date.now() }));

// ===================== 인증 게이트 =====================
// /api/* 요청은 로그인(토큰) 필수. 단, 로그인 엔드포인트는 예외.
app.use(async (req, res, next) => {
  if (!req.path.startsWith('/api/')) return next();
  if (req.method === 'OPTIONS') return next();
  if (req.path === '/api/auth/login') return next();
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) return res.status(401).json({ error: '로그인이 필요합니다.' });
    const sess = await db.getAsync(
      `SELECT s.token, s.expires_at, u.id AS uid, u.username, u.name, u.role
       FROM sessions s JOIN users u ON s.user_id = u.id WHERE s.token = ?`,
      [token]
    );
    if (!sess) return res.status(401).json({ error: '세션이 유효하지 않습니다. 다시 로그인해주세요.' });
    if (sess.expires_at && new Date(sess.expires_at) < new Date()) {
      await db.runAsync('DELETE FROM sessions WHERE token = ?', [token]);
      return res.status(401).json({ error: '세션이 만료되었습니다. 다시 로그인해주세요.' });
    }
    req.user = { id: sess.uid, username: sess.username, name: sess.name, role: sess.role };
    next();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 관리자 전용 가드
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: '관리자 권한이 필요합니다.' });
  }
  next();
}

// ===================== 인증 API =====================
app.post('/api/auth/login', loginLimiter, async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await db.getAsync('SELECT * FROM users WHERE username = ?', [username]);
    if (!user || !verifyPassword(password, user.password)) {
      return res.status(401).json({ error: '아이디 또는 비밀번호가 올바르지 않습니다.' });
    }
    // 만료 세션 정리 후 새 토큰 발급
    await db.runAsync("DELETE FROM sessions WHERE expires_at < NOW()").catch(() => {});
    const token = generateToken();
    const expires = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString();
    await db.runAsync('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)', [token, user.id, expires]);
    res.json({ success: true, token, user: { id: user.id, username: user.username, name: user.name, role: user.role } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 로그아웃 (현재 토큰 폐기)
app.post('/api/auth/logout', async (req, res) => {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (token) await db.runAsync('DELETE FROM sessions WHERE token = ?', [token]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 본인 비밀번호 변경 (로그인 사용자)
app.post('/api/auth/change-password', async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!newPassword || String(newPassword).length < 4) {
      return res.status(400).json({ error: '새 비밀번호는 4자 이상이어야 합니다.' });
    }
    const user = await db.getAsync('SELECT * FROM users WHERE id = ?', [req.user.id]);
    if (!user || !verifyPassword(currentPassword, user.password)) {
      return res.status(400).json({ error: '현재 비밀번호가 올바르지 않습니다.' });
    }
    await db.runAsync('UPDATE users SET password = ? WHERE id = ?', [hashPassword(newPassword), req.user.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/auth/users', requireAdmin, async (req, res) => {
  try {
    const users = await db.allAsync('SELECT id, username, name, role, created_at FROM users');
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/users', requireAdmin, async (req, res) => {
  try {
    const { username, password, name, role } = req.body;
    if (!username || !password || !name) {
      return res.status(400).json({ error: '아이디, 비밀번호, 이름은 필수입니다.' });
    }
    const result = await db.runAsync(
      'INSERT INTO users (username, password, name, role) VALUES (?, ?, ?, ?)',
      [username, hashPassword(password), name, role || 'employee']
    );
    res.json({ success: true, id: result.lastID });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 데이터베이스(Neon) 사용량 통계 — 관리자 전용
app.get('/api/admin/db-stats', requireAdmin, async (req, res) => {
  try {
    const sizeRow = await db.getAsync('SELECT pg_database_size(current_database()) AS bytes');
    const tables = await db.allAsync(
      `SELECT c.relname AS name,
              pg_total_relation_size(c.oid) AS total_bytes,
              pg_indexes_size(c.oid) AS index_bytes
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relkind = 'r'
       ORDER BY pg_total_relation_size(c.oid) DESC`
    );
    // 각 테이블 정확한 행 수 (테이블명은 카탈로그에서 온 값이라 안전)
    if (tables.length > 0) {
      const unionSql = tables
        .map((t) => `SELECT '${t.name}' AS name, COUNT(*)::int AS rows FROM "${t.name}"`)
        .join(' UNION ALL ');
      const counts = await db.allAsync(unionSql);
      const rowMap = Object.fromEntries(counts.map((c) => [c.name, c.rows]));
      tables.forEach((t) => { t.rows = rowMap[t.name] ?? 0; });
    }
    res.json({
      db_bytes: Number(sizeRow.bytes),
      limit_bytes: 512 * 1024 * 1024, // Neon 무료 플랜 약 0.5GB
      tables: tables.map((t) => ({
        name: t.name,
        total_bytes: Number(t.total_bytes),
        index_bytes: Number(t.index_bytes),
        rows: t.rows || 0,
      })),
      generated_at: Date.now(),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===================== 견적서 API =====================
// 견적서 목록
app.get('/api/quotes', async (req, res) => {
  try {
    const { status, search } = req.query;
    let sql = `SELECT q.*, u.name as creator_name,
      (SELECT COUNT(*)::int FROM quote_items WHERE quote_id = q.id) as item_count,
      (SELECT string_agg(
        sub.product_name || '<|>' || COALESCE(sub.specification,'') || '<|>' || CAST(COALESCE(sub.quantity,0) AS TEXT),
        '<||>' ORDER BY sub.sort_order
      ) FROM (SELECT product_name, specification, quantity, sort_order FROM quote_items WHERE quote_id = q.id AND TRIM(product_name) <> '' ORDER BY sort_order LIMIT 5) sub) as item_preview
      FROM quotes q LEFT JOIN users u ON q.created_by = u.id`;
    const params = [];
    const conditions = ['q.deleted_at IS NULL'];

    if (status && status !== '전체') {
      conditions.push('q.status = ?');
      params.push(status);
    }
    if (search) {
      conditions.push(`(
        q.title ILIKE ? OR
        q.client_name ILIKE ? OR
        q.client_company ILIKE ? OR
        CAST(q.total_amount AS TEXT) ILIKE ? OR
        EXISTS (SELECT 1 FROM quote_items qi WHERE qi.quote_id = q.id AND qi.product_name ILIKE ?) OR
        EXISTS (SELECT 1 FROM quote_items qi WHERE qi.quote_id = q.id AND qi.notes ILIKE ?)
      )`);
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (conditions.length > 0) sql += ' WHERE ' + conditions.join(' AND ');
    sql += ' ORDER BY q.updated_at DESC';

    const quotes = await db.allAsync(sql, params);
    res.json(quotes);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 거래처/담당자 자동완성 목록 (중복 제거, /:id 라우트보다 먼저 정의)
app.get('/api/quotes/clients', async (req, res) => {
  try {
    const companies = await db.allAsync(
      `SELECT DISTINCT client_company AS v FROM quotes
       WHERE deleted_at IS NULL AND TRIM(COALESCE(client_company,'')) != '' ORDER BY client_company`
    );
    const names = await db.allAsync(
      `SELECT DISTINCT client_name AS v FROM quotes
       WHERE deleted_at IS NULL AND TRIM(COALESCE(client_name,'')) != '' ORDER BY client_name`
    );
    res.json({ companies: companies.map(r => r.v), names: names.map(r => r.v) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 휴지통 목록 조회
app.get('/api/quotes/trash', async (req, res) => {
  try {
    const rows = await db.allAsync(
      `SELECT q.*, u.name as creator_name
       FROM quotes q
       LEFT JOIN users u ON q.created_by = u.id
       WHERE q.deleted_at IS NOT NULL
       ORDER BY q.deleted_at DESC`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 견적서 복원
app.post('/api/quotes/:id/restore', async (req, res) => {
  try {
    await db.runAsync(
      `UPDATE quotes SET deleted_at = NULL WHERE id = ?`,
      [req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 견적서 영구 삭제
app.delete('/api/quotes/:id/permanent', async (req, res) => {
  try {
    await db.runAsync('DELETE FROM quote_items WHERE quote_id = ?', [req.params.id]);
    await db.runAsync('DELETE FROM quotes WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 견적서 상세
app.get('/api/quotes/:id', async (req, res) => {
  try {
    const quote = await db.getAsync(
      `SELECT q.*, u.name as creator_name FROM quotes q 
       LEFT JOIN users u ON q.created_by = u.id WHERE q.id = ?`,
      [req.params.id]
    );
    if (!quote) return res.status(404).json({ error: '견적서를 찾을 수 없습니다.' });

    const items = await db.allAsync(
      'SELECT * FROM quote_items WHERE quote_id = ? ORDER BY sort_order',
      [req.params.id]
    );
    res.json({ ...quote, items });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 견적서 생성
app.post('/api/quotes', async (req, res) => {
  try {
    const { title, client_name, client_company, client_phone, client_email,
      client_address, status, notes, items, created_by, quote_date, cash_payment,
      card_payment, payment_date, electronic_tax_invoice, cash_receipt, issue_date, transaction_date,
      payment_date_confirmed, issue_date_confirmed } = req.body;

    // 아이템 합계 계산 (세액포함 품목은 단가에서 역산, 세액은 양수 품목에만 적용)
    let supply_amount = 0;
    let tax_amount_calc = 0;
    if (items && items.length > 0) {
      items.forEach(item => {
        const total = (item.quantity || 1) * (item.unit_price || 0);
        const vatInclusive = item.vat_inclusive ? 1 : 0;
        const itemSupply = vatInclusive && total > 0 ? Math.round(total / 1.1) : total;
        const itemTax = vatInclusive && total > 0 ? total - itemSupply : (total > 0 ? Math.round(total * 0.1) : 0);
        supply_amount += itemSupply;
        tax_amount_calc += itemTax;
      });
    }
    const isCash = cash_payment ? 1 : 0;
    const tax_amount = isCash ? 0 : tax_amount_calc;
    const total_amount = supply_amount + tax_amount;

    const result = await db.runAsync(
      `INSERT INTO quotes (title, client_name, client_company, client_phone, client_email,
        client_address, status, total_amount, supply_amount, tax_amount, notes, created_by, quote_date,
        cash_payment, card_payment, payment_date, electronic_tax_invoice, cash_receipt, issue_date, transaction_date,
        payment_date_confirmed, issue_date_confirmed)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [title || '', client_name || '', client_company || '', client_phone || '',
        client_email || '', client_address || '', status || '임시저장',
        total_amount, supply_amount, tax_amount, notes || '', created_by || null, quote_date || null,
        isCash, card_payment ? 1 : 0, payment_date || null,
        electronic_tax_invoice ? 1 : 0, cash_receipt ? 1 : 0, issue_date || null, transaction_date || null,
        payment_date_confirmed ? 1 : 0, issue_date_confirmed ? 1 : 0]
    );

    const quoteId = result.lastID;

    // 아이템 저장
    if (items && items.length > 0) {
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const qty = item.quantity || 1;
        const price = item.unit_price || 0;
        const vatInclusive = item.vat_inclusive ? 1 : 0;
        const total = qty * price;
        const itemSupply = vatInclusive && total > 0 ? Math.round(total / 1.1) : total;
        const itemTax = vatInclusive && total > 0 ? total - itemSupply : (total > 0 ? Math.round(total * 0.1) : 0);
        await db.runAsync(
          `INSERT INTO quote_items (quote_id, category, product_type, product_name, specification,
            quantity, unit_price, supply_price, tax, raw_material_cost, notes, file_path, image_path, sort_order, vat_inclusive, sub_category)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [quoteId, item.category || '', item.product_type || '', item.product_name || '',
            item.specification || '', qty, price,
            itemSupply, itemTax,
            item.raw_material_cost || 0, item.notes || '', item.file_path || '',
            item.image_path || '', i, vatInclusive, item.sub_category || '']
        );
      }
    }

    res.json({ success: true, id: quoteId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 견적서 수정
app.put('/api/quotes/:id', async (req, res) => {
  try {
    const { title, client_name, client_company, client_phone, client_email,
      client_address, status, notes, items, quote_date, cash_payment,
      card_payment, payment_date, electronic_tax_invoice, cash_receipt, issue_date, transaction_date,
      payment_date_confirmed, issue_date_confirmed } = req.body;

    // 아이템 합계 계산 (세액포함 품목은 단가에서 역산, 세액은 양수 품목에만 적용)
    let supply_amount = 0;
    let tax_amount_calc = 0;
    if (items && items.length > 0) {
      items.forEach(item => {
        const total = (item.quantity || 1) * (item.unit_price || 0);
        const vatInclusive = item.vat_inclusive ? 1 : 0;
        const itemSupply = vatInclusive && total > 0 ? Math.round(total / 1.1) : total;
        const itemTax = vatInclusive && total > 0 ? total - itemSupply : (total > 0 ? Math.round(total * 0.1) : 0);
        supply_amount += itemSupply;
        tax_amount_calc += itemTax;
      });
    }
    const isCash = cash_payment ? 1 : 0;
    const tax_amount = isCash ? 0 : tax_amount_calc;
    const total_amount = supply_amount + tax_amount;

    await db.runAsync(
      `UPDATE quotes SET title=?, client_name=?, client_company=?, client_phone=?,
        client_email=?, client_address=?, status=?, total_amount=?, supply_amount=?,
        tax_amount=?, notes=?, quote_date=?, cash_payment=?, card_payment=?, payment_date=?,
        electronic_tax_invoice=?, cash_receipt=?, issue_date=?, transaction_date=?,
        payment_date_confirmed=?, issue_date_confirmed=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`,
      [title || '', client_name || '', client_company || '', client_phone || '',
        client_email || '', client_address || '', status || '임시저장',
        total_amount, supply_amount, tax_amount, notes || '', quote_date || null,
        isCash, card_payment ? 1 : 0, payment_date || null,
        electronic_tax_invoice ? 1 : 0, cash_receipt ? 1 : 0, issue_date || null, transaction_date || null,
        payment_date_confirmed ? 1 : 0, issue_date_confirmed ? 1 : 0, req.params.id]
    );

    // 기존 아이템 삭제 후 재삽입
    await db.runAsync('DELETE FROM quote_items WHERE quote_id = ?', [req.params.id]);
    if (items && items.length > 0) {
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const qty = item.quantity || 1;
        const price = item.unit_price || 0;
        const vatInclusive = item.vat_inclusive ? 1 : 0;
        const total = qty * price;
        const itemSupply = vatInclusive && total > 0 ? Math.round(total / 1.1) : total;
        const itemTax = vatInclusive && total > 0 ? total - itemSupply : (total > 0 ? Math.round(total * 0.1) : 0);
        await db.runAsync(
          `INSERT INTO quote_items (quote_id, category, product_type, product_name, specification,
            quantity, unit_price, supply_price, tax, raw_material_cost, notes, file_path, image_path, sort_order, vat_inclusive, sub_category)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [req.params.id, item.category || '', item.product_type || '', item.product_name || '',
            item.specification || '', qty, price,
            itemSupply, itemTax,
            item.raw_material_cost || 0, item.notes || '', item.file_path || '',
            item.image_path || '', i, vatInclusive, item.sub_category || '']
        );
      }
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 견적서 상태 변경
app.patch('/api/quotes/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    await db.runAsync(
      'UPDATE quotes SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [status, req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 견적서 완료 체크 토글
app.patch('/api/quotes/:id/complete', async (req, res) => {
  try {
    const { is_completed } = req.body;
    await db.runAsync(
      'UPDATE quotes SET is_completed = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [is_completed ? 1 : 0, req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 견적서 삭제 (소프트 삭제 - 휴지통으로 이동)
app.delete('/api/quotes/:id', async (req, res) => {
  try {
    await db.runAsync(
      `UPDATE quotes SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===================== 지출 API =====================
app.get('/api/expenses', requireAdmin, async (req, res) => {
  try {
    const { year, month } = req.query;
    let sql = `SELECT e.*, u.name as creator_name, fi.name as fixed_item_name
               FROM expenses e
               LEFT JOIN users u ON e.created_by = u.id
               LEFT JOIN fixed_expense_items fi ON e.fixed_item_id = fi.id`;
    const params = [];
    const conditions = [];

    if (year) {
      conditions.push("to_char(e.expense_date, 'YYYY') = ?");
      params.push(String(year));
    }
    if (month) {
      conditions.push("to_char(e.expense_date, 'MM') = ?");
      params.push(String(month).padStart(2, '0'));
    }
    if (conditions.length > 0) sql += ' WHERE ' + conditions.join(' AND ');
    sql += ' ORDER BY e.expense_date DESC';

    const expenses = await db.allAsync(sql, params);
    res.json(expenses);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 고정 지출 항목 연결 시 해당 월 체크박스 자동 체크 헬퍼
async function autoCheckFixedItem(fixed_item_id, expense_date) {
  if (!fixed_item_id || !expense_date) return;
  const d = new Date(expense_date);
  const year = d.getFullYear();
  const month = d.getMonth() + 1;
  await db.runAsync(
    `INSERT INTO fixed_expense_checks (item_id, year, month, is_checked, notes, updated_at)
     VALUES (?, ?, ?, 1, '', CURRENT_TIMESTAMP)
     ON CONFLICT(item_id, year, month) DO UPDATE SET is_checked=1, updated_at=CURRENT_TIMESTAMP`,
    [fixed_item_id, year, month]
  );
}

app.post('/api/expenses', requireAdmin, async (req, res) => {
  try {
    const { expense_date, reason, description, amount, notes, created_by, fixed_item_id } = req.body;
    const result = await db.runAsync(
      'INSERT INTO expenses (expense_date, reason, description, amount, notes, created_by, fixed_item_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [expense_date, reason || '', description || '', amount || 0, notes || '', created_by || null, fixed_item_id || null]
    );
    if (fixed_item_id) await autoCheckFixedItem(fixed_item_id, expense_date);
    res.json({ success: true, id: result.lastID });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/expenses/:id', requireAdmin, async (req, res) => {
  try {
    const { expense_date, reason, description, amount, notes, fixed_item_id } = req.body;
    await db.runAsync(
      'UPDATE expenses SET expense_date=?, reason=?, description=?, amount=?, notes=?, fixed_item_id=?, updated_at=CURRENT_TIMESTAMP WHERE id=?',
      [expense_date, reason || '', description || '', amount || 0, notes || '', fixed_item_id || null, req.params.id]
    );
    if (fixed_item_id) await autoCheckFixedItem(fixed_item_id, expense_date);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/expenses/:id', requireAdmin, async (req, res) => {
  try {
    // 삭제 전에 fixed_item_id와 날짜 확인
    const expense = await db.getAsync('SELECT fixed_item_id, expense_date FROM expenses WHERE id = ?', [req.params.id]);
    await db.runAsync('DELETE FROM expenses WHERE id = ?', [req.params.id]);

    // 고정 항목 연결이 있었던 경우, 같은 월에 동일 항목 참조 지출이 없으면 체크 해제
    if (expense && expense.fixed_item_id) {
      const d = new Date(expense.expense_date);
      const year = d.getFullYear();
      const month = d.getMonth() + 1;
      const remaining = await db.getAsync(
        `SELECT COUNT(*)::int as cnt FROM expenses
         WHERE fixed_item_id = ?
           AND EXTRACT(YEAR FROM expense_date)::int = ?
           AND EXTRACT(MONTH FROM expense_date)::int = ?`,
        [expense.fixed_item_id, year, month]
      );
      if (!remaining || remaining.cnt === 0) {
        await db.runAsync(
          `UPDATE fixed_expense_checks SET is_checked = 0, updated_at = CURRENT_TIMESTAMP
           WHERE item_id = ? AND year = ? AND month = ?`,
          [expense.fixed_item_id, year, month]
        );
      }
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===================== 매출 장부 API =====================
app.get('/api/revenue/monthly', requireAdmin, async (req, res) => {
  try {
    const { year } = req.query;
    const targetYear = year || new Date().getFullYear().toString();

    // 월별 매출 (결제날짜 → 견적날짜 → 생성일 순으로 기준 적용)
    const revenue = await db.allAsync(`
      SELECT to_char(COALESCE(payment_date, quote_date, created_at::date), 'MM') as month,
        SUM(total_amount) as total_revenue,
        SUM(supply_amount) as total_supply,
        SUM(tax_amount) as total_tax,
        COUNT(*)::int as quote_count
      FROM quotes
      WHERE to_char(COALESCE(payment_date, quote_date, created_at::date), 'YYYY') = ?
        AND status IN ('미수금', '수금 완료')
        AND deleted_at IS NULL
      GROUP BY to_char(COALESCE(payment_date, quote_date, created_at::date), 'MM')
      ORDER BY month
    `, [String(targetYear)]);

    // 월별 지출
    const expenseData = await db.allAsync(`
      SELECT to_char(expense_date, 'MM') as month,
        SUM(amount) as total_expense,
        COUNT(*)::int as expense_count
      FROM expenses
      WHERE to_char(expense_date, 'YYYY') = ?
      GROUP BY to_char(expense_date, 'MM')
      ORDER BY month
    `, [String(targetYear)]);

    // 12개월 데이터 조합
    const monthly = [];
    for (let m = 1; m <= 12; m++) {
      const mm = m.toString().padStart(2, '0');
      const rev = revenue.find(r => r.month === mm) || {};
      const exp = expenseData.find(e => e.month === mm) || {};
      monthly.push({
        month: m,
        revenue: rev.total_revenue || 0,
        supply: rev.total_supply || 0,
        tax: rev.total_tax || 0,
        quote_count: rev.quote_count || 0,
        expense: exp.total_expense || 0,
        expense_count: exp.expense_count || 0,
        profit: (rev.total_revenue || 0) - (exp.total_expense || 0)
      });
    }

    res.json({ year: targetYear, monthly });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/revenue/yearly', requireAdmin, async (req, res) => {
  try {
    const revenue = await db.allAsync(`
      SELECT to_char(COALESCE(payment_date, quote_date, created_at::date), 'YYYY') as year,
        SUM(total_amount) as total_revenue,
        SUM(supply_amount) as total_supply,
        COUNT(*)::int as quote_count
      FROM quotes
      WHERE status IN ('미수금', '수금 완료')
        AND deleted_at IS NULL
      GROUP BY to_char(COALESCE(payment_date, quote_date, created_at::date), 'YYYY')
      ORDER BY year DESC
    `);

    const expenses = await db.allAsync(`
      SELECT to_char(expense_date, 'YYYY') as year,
        SUM(amount) as total_expense,
        COUNT(*)::int as expense_count
      FROM expenses
      GROUP BY to_char(expense_date, 'YYYY')
      ORDER BY year DESC
    `);

    res.json({ revenue, expenses });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 대시보드 통계
app.get('/api/revenue/summary', requireAdmin, async (req, res) => {
  try {
    const year = req.query.year || new Date().getFullYear().toString();

    const stats = await db.getAsync(`
      SELECT
        COUNT(*)::int as total_quotes,
        SUM(CASE WHEN status = '수금 완료' THEN total_amount ELSE 0 END) as collected_amount,
        SUM(CASE WHEN status = '미수금' THEN total_amount ELSE 0 END) as uncollected_amount,
        SUM(CASE WHEN status IN ('미수금','수금 완료') THEN total_amount ELSE 0 END) as total_revenue,
        SUM(CASE WHEN status = '작업 중' THEN 1 ELSE 0 END)::int as working_count,
        SUM(CASE WHEN status = '작업 대기' THEN 1 ELSE 0 END)::int as waiting_count
      FROM quotes
      WHERE to_char(COALESCE(payment_date, quote_date, created_at::date), 'YYYY') = ?
        AND deleted_at IS NULL
    `, [String(year)]);

    const totalExpense = await db.getAsync(`
      SELECT SUM(amount) as total_expense FROM expenses
      WHERE to_char(expense_date, 'YYYY') = ?
    `, [String(year)]);

    res.json({
      ...stats,
      total_expense: totalExpense?.total_expense || 0,
      net_profit: (stats?.total_revenue || 0) - (totalExpense?.total_expense || 0)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 월별 견적 상세 목록 (수금완료 견적 + 해당 월 지출)
app.get('/api/revenue/monthly-quotes', requireAdmin, async (req, res) => {
  try {
    const { year, month } = req.query;
    const ym = `${year}-${String(month).padStart(2, '0')}`;

    // 수금완료 견적서 목록 (결제날짜 → 견적날짜 → 생성일 순으로 기준 적용, 월별 매출 집계와 동일)
    const quotes = await db.allAsync(`
      SELECT q.id, q.title, q.client_name, q.client_company, q.status,
        q.total_amount, q.supply_amount, q.tax_amount, q.quote_date, q.payment_date, q.created_at, q.notes,
        u.name as creator_name
      FROM quotes q
      LEFT JOIN users u ON q.created_by = u.id
      WHERE to_char(COALESCE(q.payment_date, q.quote_date, q.created_at::date), 'YYYY-MM') = ?
        AND q.status = '수금 완료'
        AND q.deleted_at IS NULL
      ORDER BY COALESCE(q.payment_date, q.quote_date, q.created_at::date) ASC, q.id ASC
    `, [ym]);

    // 각 견적서의 품목 상세 (가격 포함)
    for (const q of quotes) {
      q.items = await db.allAsync(`
        SELECT product_name, specification, quantity, unit_price, supply_price, tax, raw_material_cost, notes
        FROM quote_items
        WHERE quote_id = ? AND TRIM(product_name) <> ''
        ORDER BY sort_order
      `, [q.id]);
    }

    // 해당 월 지출 내역
    const expenses = await db.allAsync(`
      SELECT e.id, e.expense_date, e.reason, e.amount, e.notes, u.name as creator_name
      FROM expenses e
      LEFT JOIN users u ON e.created_by = u.id
      WHERE to_char(e.expense_date, 'YYYY-MM') = ?
      ORDER BY e.expense_date ASC, e.id ASC
    `, [ym]);

    res.json({ quotes, expenses });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 월별 비고 조회 (해당 연도 전체)
app.get('/api/revenue/notes', requireAdmin, async (req, res) => {
  try {
    const { year } = req.query;
    const rows = await db.allAsync(
      'SELECT year, month, note FROM revenue_monthly_notes WHERE year = ?',
      [Number(year)]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 월별 비고 저장 (upsert)
app.post('/api/revenue/notes', requireAdmin, async (req, res) => {
  try {
    const { year, month, note } = req.body;
    await db.runAsync(
      `INSERT INTO revenue_monthly_notes (year, month, note, updated_at)
       VALUES (?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(year, month) DO UPDATE SET note = excluded.note, updated_at = CURRENT_TIMESTAMP`,
      [year, month, note || '']
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===================== 일정(캘린더) API =====================
// 해당 월의 모든 일정 이벤트를 한 번에 반환 (견적/입금/발행/거래 + 실지출 + 고정지출 예정)
app.get('/api/calendar', requireAdmin, async (req, res) => {
  try {
    const now = new Date();
    const year = String(req.query.year || now.getFullYear());
    const month = String(req.query.month || (now.getMonth() + 1));
    const mm = month.padStart(2, '0');
    const ym = `${year}-${mm}`;
    const events = [];

    // 견적: quote_date / payment_date / issue_date / transaction_date 중 이번 달인 것
    const quotes = await db.allAsync(
      `SELECT id, title, client_name, client_company, status, total_amount,
              quote_date, payment_date, issue_date, transaction_date
       FROM quotes
       WHERE deleted_at IS NULL AND (
         to_char(quote_date, 'YYYY-MM') = ? OR to_char(payment_date, 'YYYY-MM') = ?
         OR to_char(issue_date, 'YYYY-MM') = ? OR to_char(transaction_date, 'YYYY-MM') = ?
       )`,
      [ym, ym, ym, ym]
    );
    quotes.forEach(q => {
      const client = q.client_company || q.client_name || '';
      const base = { quoteId: q.id, title: q.title || '', client, amount: q.total_amount || 0, status: q.status };
      if (q.quote_date && q.quote_date.startsWith(ym)) events.push({ ...base, type: 'quote', date: q.quote_date.slice(0, 10) });
      if (q.payment_date && q.payment_date.startsWith(ym)) events.push({ ...base, type: 'payment', date: q.payment_date.slice(0, 10) });
      if (q.issue_date && q.issue_date.startsWith(ym)) events.push({ ...base, type: 'issue', date: q.issue_date.slice(0, 10) });
      if (q.transaction_date && q.transaction_date.startsWith(ym)) events.push({ ...base, type: 'transaction', date: q.transaction_date.slice(0, 10) });
    });

    // 실제 지출
    const expenses = await db.allAsync(
      `SELECT id, expense_date, reason, description, amount FROM expenses WHERE to_char(expense_date, 'YYYY-MM') = ?`,
      [ym]
    );
    expenses.forEach(e => events.push({
      type: 'expense', date: String(e.expense_date).slice(0, 10),
      expenseId: e.id, reason: e.reason || '', description: e.description || '', amount: e.amount || 0,
    }));

    // 고정지출 예정 (반복): default_day가 있는 항목을 이번 달 그 날짜에 배치 + 납부 여부
    const fixed = await db.allAsync(
      `SELECT id, name, default_day, default_vendor, default_description, default_amount
       FROM fixed_expense_items WHERE default_day IS NOT NULL`
    );
    const checks = await db.allAsync(
      `SELECT item_id, is_checked FROM fixed_expense_checks WHERE year = ? AND month = ?`,
      [Number(year), Number(month)]
    );
    const checkMap = {};
    checks.forEach(c => { checkMap[c.item_id] = c.is_checked; });
    const daysInMonth = new Date(Number(year), Number(month), 0).getDate();
    fixed.forEach(f => {
      const day = Math.min(f.default_day, daysInMonth);
      events.push({
        type: 'fixed', date: `${ym}-${String(day).padStart(2, '0')}`,
        itemId: f.id, name: f.name || '', vendor: f.default_vendor || '',
        description: f.default_description || '', amount: f.default_amount || 0,
        checked: !!checkMap[f.id],
      });
    });

    res.json({ year: Number(year), month: Number(month), events });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===================== 관리자 설정 API =====================
app.get('/api/settings', async (req, res) => {
  try {
    const settings = await db.getAsync('SELECT * FROM company_settings LIMIT 1');
    res.json(settings || {});
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/settings', requireAdmin, async (req, res) => {
  try {
    const { company_name, representative, business_number, address,
      phone, fax, stamp_image, notes, tax_rate } = req.body;

    const existing = await db.getAsync('SELECT id FROM company_settings LIMIT 1');
    if (existing) {
      await db.runAsync(
        `UPDATE company_settings SET company_name=?, representative=?, business_number=?,
          address=?, phone=?, fax=?, stamp_image=?, notes=?, tax_rate=?,
          updated_at=CURRENT_TIMESTAMP WHERE id=?`,
        [company_name || '', representative || '', business_number || '',
          address || '', phone || '', fax || '', stamp_image || '',
          notes || '', tax_rate || 10.0, existing.id]
      );
    } else {
      await db.runAsync(
        `INSERT INTO company_settings (company_name, representative, business_number,
          address, phone, fax, stamp_image, notes, tax_rate)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [company_name || '', representative || '', business_number || '',
          address || '', phone || '', fax || '', stamp_image || '',
          notes || '', tax_rate || 10.0]
      );
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===================== 월별 고정 지출 체크리스트 =====================

// 항목 목록 조회
app.get('/api/fixed-expenses/items', requireAdmin, async (req, res) => {
  try {
    const items = await db.allAsync('SELECT * FROM fixed_expense_items ORDER BY order_index, id');
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 항목 추가
app.post('/api/fixed-expenses/items', requireAdmin, async (req, res) => {
  try {
    const { name, default_day, default_vendor, default_description, default_amount } = req.body;
    const maxOrder = await db.getAsync('SELECT MAX(order_index) as mo FROM fixed_expense_items');
    const orderIndex = (maxOrder?.mo || 0) + 1;
    const result = await db.runAsync(
      `INSERT INTO fixed_expense_items (name, order_index, default_day, default_vendor, default_description, default_amount)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [name || '', orderIndex,
        default_day != null && default_day !== '' ? Number(default_day) : null,
        default_vendor || '', default_description || '',
        default_amount ? Number(default_amount) : 0]
    );
    const item = await db.getAsync('SELECT * FROM fixed_expense_items WHERE id = ?', [result.lastID]);
    res.json(item);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 항목 순서 변경 (반드시 /:id PUT 보다 먼저 정의)
app.put('/api/fixed-expenses/items/reorder', requireAdmin, async (req, res) => {
  try {
    const { ids } = req.body; // 새 순서대로 정렬된 id 배열
    if (!Array.isArray(ids)) return res.status(400).json({ error: 'ids 배열이 필요합니다.' });
    for (let i = 0; i < ids.length; i++) {
      await db.runAsync('UPDATE fixed_expense_items SET order_index = ? WHERE id = ?', [i + 1, ids[i]]);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 항목 수정 (이름 + 템플릿)
app.put('/api/fixed-expenses/items/:id', requireAdmin, async (req, res) => {
  try {
    const { name, default_day, default_vendor, default_description, default_amount } = req.body;
    await db.runAsync(
      `UPDATE fixed_expense_items SET name = ?, default_day = ?, default_vendor = ?,
        default_description = ?, default_amount = ? WHERE id = ?`,
      [name || '',
        default_day != null && default_day !== '' ? Number(default_day) : null,
        default_vendor || '', default_description || '',
        default_amount ? Number(default_amount) : 0,
        req.params.id]
    );
    const item = await db.getAsync('SELECT * FROM fixed_expense_items WHERE id = ?', [req.params.id]);
    res.json(item);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 항목 삭제
app.delete('/api/fixed-expenses/items/:id', requireAdmin, async (req, res) => {
  try {
    await db.runAsync('DELETE FROM fixed_expense_items WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 월별 체크 현황 조회
app.get('/api/fixed-expenses/checks', requireAdmin, async (req, res) => {
  try {
    const { year, month } = req.query;
    const checks = await db.allAsync(
      `SELECT fec.*, COUNT(e.id)::int as linked_expense_count
       FROM fixed_expense_checks fec
       LEFT JOIN expenses e
         ON e.fixed_item_id = fec.item_id
         AND EXTRACT(YEAR FROM e.expense_date)::int = fec.year
         AND EXTRACT(MONTH FROM e.expense_date)::int = fec.month
       WHERE fec.year = ? AND fec.month = ?
       GROUP BY fec.id`,
      [Number(year), Number(month)]
    );
    res.json(checks);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 체크 상태 저장 (upsert)
app.post('/api/fixed-expenses/checks', requireAdmin, async (req, res) => {
  try {
    const { item_id, year, month, is_checked, notes } = req.body;
    await db.runAsync(
      `INSERT INTO fixed_expense_checks (item_id, year, month, is_checked, notes, updated_at)
       VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(item_id, year, month) DO UPDATE SET
         is_checked = excluded.is_checked,
         notes = excluded.notes,
         updated_at = CURRENT_TIMESTAMP`,
      [item_id, year, month, is_checked ? 1 : 0, notes || '']
    );
    const check = await db.getAsync(
      'SELECT * FROM fixed_expense_checks WHERE item_id = ? AND year = ? AND month = ?',
      [item_id, Number(year), Number(month)]
    );
    res.json(check);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===================== 프론트엔드(SPA) 서빙 =====================
// 배포 시 Express가 빌드된 React(frontend/dist)도 함께 서빙 → 단일 서비스로 운영.
// (로컬 개발은 vite 3000이 별도 서빙하므로 dist 없으면 건너뜀)
const distPath = path.join(__dirname, '..', 'frontend', 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  // API/health 외의 GET은 SPA 진입점으로 (새로고침/딥링크 대응)
  app.use((req, res, next) => {
    if (req.method !== 'GET') return next();
    if (req.path.startsWith('/api') || req.path === '/health') return next();
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

// ===================== 공통 에러 핸들러 =====================
// 예기치 못한 에러 — JSON으로 응답
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  res.status(400).json({ error: err.message || '요청 처리 중 오류가 발생했습니다.' });
});

// ===================== 서버 시작 =====================
// DB 초기화(테이블 생성/시드) 완료 후 서버 오픈
initDatabase()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`
╔═══════════════════════════════════════════╗
║   🚀 BusinessPro API Server v2.0         ║
║   Port: ${PORT}                              ║
║   DB: PostgreSQL                          ║
║   Mode: ${process.env.NODE_ENV || 'development'}                    ║
╚═══════════════════════════════════════════╝`);
    });
  })
  .catch((err) => {
    console.error('❌ DB 초기화 실패, 서버를 시작할 수 없습니다:', err.message);
    process.exit(1);
  });
