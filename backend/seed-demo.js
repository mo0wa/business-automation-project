/**
 * 데모(개발기) DB 생성/초기화 스크립트
 * - 운영 DB(business.db)는 건드리지 않고, 별도의 가짜 데이터 DB를 만듭니다.
 *
 * 실행 (PowerShell):
 *   cd C:\work\business-automation-project\backend
 *   $env:DB_FILE='business_demo.db'; node seed-demo.js
 *
 * 기본 계정: admin / admin123 ,  user / user123
 */

// 데모 DB 파일 지정 (인자/환경변수 없으면 business_demo.db)
process.env.DB_FILE = process.env.DB_FILE || 'business_demo.db';

const { db, initDatabase } = require('./database');

const STATUSES = ['임시저장', '작업 대기', '작업 중', '작업 요청 X', '미수금', '수금 완료'];
const COMPANIES = [
  '대한산업', '한빛테크', '미래엔지니어링', '서울상사', '그린물산', '동방기업',
  '제일건설', '우진테크', '바른상사', '한솔시스템', '태양물산', '광명기업',
];
const PERSONS = ['김민준', '이서연', '박지훈', '최수아', '정우진', '강하은', '윤도현', '임채원', '오세훈', '한지민'];
const PRODUCTS = [
  ['간판 제작', '아크릴 3T', 'EA'], ['현수막 출력', '500x70cm', 'EA'], ['명함 인쇄', '90x50mm', '박스'],
  ['스티커 제작', '원형 5cm', '롤'], ['배너 거치대', 'X배너', 'EA'], ['포스터 출력', 'A1', 'EA'],
  ['실사 출력', '1㎡', '㎡'], ['패널 제작', '폼보드 5T', 'EA'], ['로고 디자인', '시안 3종', '건'],
  ['브로슈어', '8p 양면', '부'],
];

const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick = (arr) => arr[rand(0, arr.length - 1)];
const pad2 = (n) => String(n).padStart(2, '0');

// 생성 규모(환경변수로 조절): 연도 수 / 하루 최대 건수
const DEMO_YEARS = Number(process.env.DEMO_YEARS) || 3;        // 과거 N년 + 올해
const MAX_QUOTES_PER_DAY = Number(process.env.DEMO_MAX_PER_DAY) || 3;
const MAX_EXP_PER_DAY = Number(process.env.DEMO_MAX_EXP_PER_DAY) || 2;

const dateStr = (y, m, d) => `${y}-${pad2(m)}-${pad2(d)}`;

async function clearAll() {
  const tables = ['quote_items', 'quote_attachments', 'quotes', 'expenses', 'revenue_monthly_notes', 'fixed_expense_checks'];
  for (const t of tables) {
    await db.runAsync(`DELETE FROM ${t}`).catch(() => {});
  }
}

async function seedCompany() {
  await db.runAsync('DELETE FROM company_settings').catch(() => {});
  await db.runAsync(
    `INSERT INTO company_settings (company_name, representative, business_number, address, phone, fax, notes, tax_rate)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ['주식회사 데모상사', '홍길동', '123-45-67890', '서울특별시 강남구 테헤란로 123, 4층',
      '02-1234-5678', '02-1234-5679', '본 견적은 발행일로부터 30일간 유효합니다.', 10.0]
  );
}

async function insertQuote({ quote_date, status }) {
  const company = pick(COMPANIES);
  const person = pick(PERSONS);
  const itemCount = rand(1, 4);

  let supply_amount = 0;
  let tax_amount = 0;
  const items = [];
  for (let i = 0; i < itemCount; i++) {
    const [name, spec, unit] = pick(PRODUCTS);
    const qty = rand(1, 12);
    const unit_price = rand(2, 60) * 10000; // 2만~60만
    const total = qty * unit_price;
    const raw = Math.round(total * (rand(35, 70) / 100));
    supply_amount += total;
    tax_amount += Math.round(total * 0.1);
    items.push({ name, spec, unit, qty, unit_price, total, raw });
  }
  const total_amount = supply_amount + tax_amount;

  // 수금완료/미수금만 결제·발행 정보 채움
  const settled = status === '수금 완료';
  const receivable = status === '미수금';
  const payment_date = settled ? quote_date : null;
  const issue_date = (settled || receivable) ? quote_date : null;

  const res = await db.runAsync(
    `INSERT INTO quotes (title, client_name, client_company, client_phone, status,
       total_amount, supply_amount, tax_amount, notes, quote_date,
       payment_date, issue_date, electronic_tax_invoice, payment_date_confirmed, issue_date_confirmed, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [`${company} ${pick(PRODUCTS)[0]} 건`, person, company, `010-${rand(1000,9999)}-${rand(1000,9999)}`,
      status, total_amount, supply_amount, tax_amount, '', quote_date,
      payment_date, issue_date, settled ? 1 : 0, settled ? 1 : 0, (settled || receivable) ? 1 : 0, 1]
  );
  const quoteId = res.lastID;
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    await db.runAsync(
      `INSERT INTO quote_items (quote_id, product_name, specification, quantity, unit_price, supply_price, tax, raw_material_cost, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [quoteId, it.name, it.spec, it.qty, it.unit_price, it.total, Math.round(it.total * 0.1), it.raw, i]
    );
  }
}

async function seedQuotes() {
  const now = new Date();
  const curY = now.getFullYear();
  const curM = now.getMonth() + 1;
  const curD = now.getDate();
  let total = 0;
  for (let y = curY - DEMO_YEARS; y <= curY; y++) {
    const isCurY = (y === curY);
    const recencyBoost = (curY - y); // 과거일수록 수금완료 비중↑
    for (let m = 1; m <= 12; m++) {
      if (isCurY && m > curM) break;
      const lastDay = (isCurY && m === curM) ? curD : 28; // 미래 날짜는 생성 안 함
      for (let d = 1; d <= lastDay; d++) {
        const dailyCount = rand(0, MAX_QUOTES_PER_DAY);
        for (let c = 0; c < dailyCount; c++) {
          const roll = Math.random() + recencyBoost * 0.12;
          let status;
          if (roll < 0.45) status = '수금 완료';
          else if (roll < 0.65) status = '미수금';
          else if (roll < 0.8) status = '작업 중';
          else status = pick(STATUSES);
          await insertQuote({ quote_date: dateStr(y, m, d), status });
          total++;
        }
      }
    }
  }
  return total;
}

async function seedExpenses() {
  const now = new Date();
  const curY = now.getFullYear();
  const curM = now.getMonth() + 1;
  const curD = now.getDate();
  const reasons = [
    ['한국전력', '전기요금'], ['KT', '인터넷/전화'], ['건물주', '사무실 임대료'],
    ['주유소', '차량 주유'], ['자재상', '원자재 구매'], ['식당', '직원 식대'],
    ['세무사', '기장료'], ['보험사', '4대보험'], ['문구점', '사무용품'], ['택배', '배송비'],
  ];
  let total = 0;
  for (let y = curY - DEMO_YEARS; y <= curY; y++) {
    const isCurY = (y === curY);
    for (let m = 1; m <= 12; m++) {
      if (isCurY && m > curM) break;
      const lastDay = (isCurY && m === curM) ? curD : 28;
      for (let d = 1; d <= lastDay; d++) {
        const cnt = rand(0, MAX_EXP_PER_DAY);
        for (let c = 0; c < cnt; c++) {
          const [reason, desc] = pick(reasons);
          await db.runAsync(
            `INSERT INTO expenses (expense_date, reason, description, amount, notes, created_by)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [dateStr(y, m, d), reason, desc, rand(3, 200) * 10000, '', 1]
          );
          total++;
        }
      }
    }
  }
  return total;
}

function run() {
  initDatabase();
  // 테이블/기본 시드(관리자 계정·고정지출 항목) 생성이 끝나도록 잠깐 대기 후 데이터 주입
  setTimeout(async () => {
    try {
      console.log(`데모 데이터 생성 중... (과거 ${DEMO_YEARS}년 + 올해, 일별 최대 견적 ${MAX_QUOTES_PER_DAY}건)`);
      await db.runAsync('BEGIN TRANSACTION');
      await clearAll();
      await seedCompany();
      const qc = await seedQuotes();
      const ec = await seedExpenses();
      await db.runAsync('COMMIT');
      console.log(`\n✅ 데모 데이터 생성 완료 → ${process.env.DB_FILE}`);
      console.log(`   견적서 ${qc}건, 지출 ${ec}건`);
      console.log('   계정: admin / admin123 , user / user123\n');
      db.close();
    } catch (err) {
      await db.runAsync('ROLLBACK').catch(() => {});
      console.error('데모 시드 실패:', err);
      process.exit(1);
    }
  }, 800);
}

run();
