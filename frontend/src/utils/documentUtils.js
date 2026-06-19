// PDF 및 인쇄 유틸리티
import { toast } from '../services/toast';

export const formatCurrency = (amount) => {
  return new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 5 }).format(amount || 0);
};

export const formatDate = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
};

export const formatDateShort = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// 견적서 HTML 생성 (엑셀 디자인 기반)
export const generateQuoteHTML = (quote, items, settings, type = 'quote', transactionDate = null) => {
  const isTransaction = type === 'transaction';
  const title = isTransaction ? '거래명세서' : '견적서';
  const today = new Date();

  // 현금결제 거래명세서는 세액 열 전체 숨김
  const hideTax = isTransaction && !!quote.cash_payment;
  // 현금결제 견적서는 세액 열은 유지하되 값은 공백
  const blankTax = !isTransaction && !!quote.cash_payment;

  // 소분류: 하나라도 값이 있으면 소분류 열 표시 + 같은 품명끼리 품명 셀 세로 병합
  const hasSubcat = (items || []).some(it => (it.sub_category || '').trim() !== '');
  // 열 너비 (hideTax / hasSubcat 조합, 합계 100%)
  const W = hasSubcat
    ? (hideTax
      ? { name: '26%', subcat: '16%', spec: '12%', qty: '9%', price: '15%', supply: '22%', tax: '0%' }
      : { name: '23%', subcat: '14%', spec: '11%', qty: '8%', price: '13%', supply: '18%', tax: '13%' })
    : (hideTax
      ? { name: '38%', subcat: '0%', spec: '14%', qty: '10%', price: '16%', supply: '22%', tax: '0%' }
      : { name: '33%', subcat: '0%', spec: '13%', qty: '9%', price: '14%', supply: '18%', tax: '13%' });

  // 품목별 출력값 계산
  // 세액포함 품목: 출력 시 단가는 세포함가 그대로, 공급가액은 합계 그대로, 세액은 빈칸
  const calcDocItem = (qty, price, vatInclusive) => {
    const total = qty * price;
    if (vatInclusive && total > 0) {
      return { displayPrice: price, supply: total, tax: 0, taxBlank: true };
    }
    return { displayPrice: price, supply: total, tax: total > 0 ? Math.round(total * 0.1) : 0, taxBlank: false };
  };

  // 아이템 행 생성 (최대 20행)
  const MAX_ROWS = 20;
  const list = (items || []).slice(0, MAX_ROWS);

  // 품명 이후 공통 셀(소분류·규격·수량·단가·공급가액·세액)
  const rowCells = (item) => {
    const qty = Number(item.quantity) || 0;
    const price = Number(item.unit_price) || 0;
    const { displayPrice, supply, tax, taxBlank } = calcDocItem(qty, price, item.vat_inclusive);
    return `
      ${hasSubcat ? `<td class="cell-subcat">${item.sub_category || ''}</td>` : ''}
      <td class="cell-spec">${item.specification || ''}</td>
      <td class="cell-qty">${qty !== 0 ? formatCurrency(qty) : ''}</td>
      <td class="cell-price">${displayPrice !== 0 ? formatCurrency(displayPrice) : ''}</td>
      <td class="cell-supply">${supply !== 0 ? formatCurrency(supply) : ''}</td>
      ${hideTax ? '' : `<td class="cell-tax">${(!blankTax && !taxBlank && tax > 0) ? formatCurrency(tax) : ''}</td>`}`;
  };

  // 같은 품명끼리 항상 그룹화하여 품명 셀 세로 병합 (소분류 유무와 무관)
  // 첫 등장 순서 유지, 빈 품명은 병합 안 함
  const groups = [];
  const idxByKey = {};
  list.forEach((item, i) => {
    const nm = (item.product_name || '').trim();
    const key = nm !== '' ? 'n:' + nm : 'e:' + i;
    if (idxByKey[key] === undefined) { idxByKey[key] = groups.length; groups.push({ name: item.product_name || '', items: [] }); }
    groups[idxByKey[key]].items.push(item);
  });
  const itemRows = groups.map(g => g.items.map((item, idx) => `
    <tr class="item-row">
      ${idx === 0 ? `<td class="cell-name" rowspan="${g.items.length}">${g.name || ''}</td>` : ''}
      ${rowCells(item)}
    </tr>`).join('')).join('');

  // 빈 행 채우기 (전체 행 수는 항상 MAX_ROWS 유지)
  const emptyCount = Math.max(0, MAX_ROWS - list.length);
  const emptyRows = Array(emptyCount).fill(`
    <tr class="item-row empty-row">
      <td class="cell-name">&nbsp;</td>
      ${hasSubcat ? '<td class="cell-subcat"></td>' : ''}
      <td class="cell-spec"></td>
      <td class="cell-qty"></td>
      <td class="cell-price"></td>
      <td class="cell-supply"></td>
      ${hideTax ? '' : '<td class="cell-tax"></td>'}
    </tr>`).join('');

  // 합계 계산 — 세액포함 품목은 역산, 음수 품목은 세액 제외
  const supplyTotal = (items || []).reduce((s, item) => {
    const { supply } = calcDocItem(Number(item.quantity) || 0, Number(item.unit_price) || 0, item.vat_inclusive);
    return s + supply;
  }, 0);
  const taxTotal = quote.cash_payment ? 0 : (items || []).reduce((s, item) => {
    const { supply, tax, taxBlank } = calcDocItem(Number(item.quantity) || 0, Number(item.unit_price) || 0, item.vat_inclusive);
    return s + ((supply > 0 && !taxBlank) ? tax : 0);
  }, 0);
  const grandTotal = supplyTotal + taxTotal;

  // 날짜 설정
  const docDate = isTransaction
    ? formatDateShort(transactionDate || today)
    : formatDateShort(quote.quote_date || today);

  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<title>${title}</title>
<style>
  @page {
    size: A4 portrait;
    margin: 8mm;
  }
  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .page { padding: 0; }
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: '나눔고딕', 'Noto Sans KR', 'Malgun Gothic', '맑은 고딕', sans-serif;
    font-size: 9.5pt;
    color: #000;
    background: #fff;
    line-height: 1.4;
  }
  .page {
    width: 210mm;
    min-height: 292mm;
    padding: 10mm 12mm 8mm 12mm;
    margin: 0 auto;
    background: #fff;
    position: relative;
  }

  /* ====== 제목 (전체 너비 가운데 정렬) ====== */
  .doc-title {
    font-size: 30pt;
    font-weight: 900;
    letter-spacing: 14px;
    color: #000;
    text-align: center;
    margin-bottom: 10px;
  }

  /* ====== 상단 레이아웃 ====== */
  .header {
    display: flex;
    justify-content: space-between;
    align-items: stretch;
    gap: 20px;
    margin-bottom: 4px;
  }
  .header-left { flex: 1; min-width: 0; display: flex; flex-direction: column; justify-content: space-between; }
  /* 고정폭 제거 - 공급자 테이블 컨텐츠 크기에 따라 자동 확장 */
  .header-right { flex-shrink: 0; }

  /* ── 수신 ── */
  .recipient {
    font-size: 14pt;
    font-weight: 700;
    margin-bottom: 10px;
    color: #000;
  }
  .recipient-name {
    display: block;
  }
  .recipient-suffix {
    display: block;
  }

  /* ── 견적일 / 유효기간 ── */
  .meta-info {
    border-collapse: collapse;
    width: auto;
  }
  .meta-info td {
    padding: 4px 0;
    font-size: 9.5pt;
    vertical-align: middle;
  }
  .meta-info .m-label {
    font-weight: 700;
    width: 60px;
    color: #000;
  }
  .meta-info .m-value {
    color: #222;
    padding-left: 8px;
  }
  .meta-info tr.row-top td {
    border-bottom: 1px solid #aaa;
  }
  .meta-info tr.row-btm td {
    border-top: 1px solid #aaa;
    border-bottom: 1px solid #aaa;
  }

  /* ====== 공급자 블록 ====== */
  /* .supplier를 inline-block으로 만들어 테이블 크기에 맞게 자동 수축/확장 */
  .supplier {
    display: inline-block;
    vertical-align: top;
    position: relative;  /* 도장 절대 위치 기준 */
    border-top: 2px solid #888;
  }
  /* 고정폭 제거 - 컨텐츠(테이블) 너비에 맞게 자동 결정 */
  .supplier-grid {
    border-collapse: collapse;
    font-size: 9.5pt;
    /* table-layout: auto (기본값) → 셀 내용 기준으로 열 너비 자동 계산 */
  }
  /* "공급자" 헤더를 th로 통합 → 테이블 전체 너비에 맞게 자동으로 span */
  .supplier-grid th.supplier-header {
    background: #bfbfbf;
    padding: 3px 8px;
    font-size: 9.5pt;
    font-weight: 800;
    color: #222;
    text-align: left;
  }
  .supplier-grid td {
    padding: 4px 8px;
    vertical-align: middle;
  }
  /* 레이블: nowrap → 이 셀 너비가 열 최소 너비를 결정 */
  .s-label {
    font-weight: 700;
    color: #000;
    white-space: nowrap;
  }
  .s-value { color: #222; min-width: 60px; }
  .s-label2 {
    font-weight: 700;
    color: #000;
    white-space: nowrap;
    padding-left: 10px;
  }
  /* 도장: .supplier 기준 우상단 (대표자 위치) */
  .stamp-img {
    position: absolute;
    right: 4px;
    top: 20px;
    width: 62px;
    height: 62px;
    opacity: 0.85;
    z-index: 5;
  }
  /* 전화/팩스 줄 - nowrap → 이 행이 테이블 전체 최소 너비를 결정 */
  .tel-row td {
    background: #d8d8d8;
    border-bottom: 1px solid #888;
    white-space: nowrap;
  }

  /* ====== 견적금액 바 ====== */
  .amount-bar {
    background: #f2f2f2;
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 9px 12px;
    margin: 8px 0;
  }
  .amount-bar-label {
    font-size: 13pt;
    font-weight: 800;
    color: #000;
  }
  .amount-bar-value {
    font-size: 18pt;
    font-weight: 800;
    color: #000;
    letter-spacing: -0.3px;
  }

  /* ====== 품목 테이블 ====== */
  .items-tbl {
    width: 100%;
    border-collapse: collapse;
    font-size: 9.5pt;
  }
  .items-tbl thead th {
    background: #bfbfbf;
    color: #3f3f3f;
    font-weight: 800;
    padding: 5px 6px;
    border-top: 1px solid #888;
  }
  .items-tbl thead th.t-name   { text-align: left;   width: ${W.name}; }
  .items-tbl thead th.t-subcat { text-align: center;  width: ${W.subcat}; border-left: 1px solid #aaa; }
  .items-tbl thead th.t-spec   { text-align: center;  width: ${W.spec}; border-left: 1px solid #aaa; }
  .items-tbl thead th.t-qty    { text-align: right;   width: ${W.qty};  border-left: 1px solid #aaa; }
  .items-tbl thead th.t-price  { text-align: right;   width: ${W.price}; border-left: 1px solid #aaa; }
  .items-tbl thead th.t-supply { text-align: right;   width: ${W.supply}; border-left: 1px solid #aaa; }
  .items-tbl thead th.t-tax    { text-align: right;   width: ${W.tax}; border-left: 1px solid #aaa; }

  .item-row td {
    padding: 4px 6px;
    border-bottom: 1px solid #ddd;
  }
  .empty-row td { border-bottom: 1px solid #eee; }
  .cell-name   { text-align: left; vertical-align: middle; }
  .cell-subcat { text-align: center;  border-left: 1px solid #eee; }
  .cell-spec   { text-align: center;  border-left: 1px solid #eee; }
  .cell-qty    { text-align: right;   border-left: 1px solid #eee; }
  .cell-price  { text-align: right;   border-left: 1px solid #eee; }
  .cell-supply { text-align: right;   border-left: 1px solid #eee; font-weight: 500; }
  .cell-tax    { text-align: right;   border-left: 1px solid #eee; }

  /* ====== 합계 행 ====== */
  .total-bar {
    background: #bfbfbf;
    border-bottom: 1px solid #888;
    font-weight: 800;
    font-size: 9.5pt;
    color: #3f3f3f;
    display: flex;
  }
  .total-bar .tl { flex: 1; padding: 5px 6px; }
  .total-bar .ts { width: ${hideTax ? '22%' : '18%'}; text-align: right; padding: 5px 6px; }
  .total-bar .tt { width: 13%; text-align: right; padding: 5px 6px; }

  /* ====== 기타 ====== */
  .etc-block {
    margin-top: 5px;
    border-top: 1px solid #888;
  }
  .etc-title {
    background: #bfbfbf;
    padding: 3px 8px;
    font-weight: 800;
    font-size: 9.5pt;
    color: #3f3f3f;
  }
  .etc-body {
    padding: 6px 8px;
    font-size: 9.5pt;
    color: #333;
    line-height: 1.8;
    min-height: 40px;
    white-space: pre-line;
  }
</style>
</head>
<body>
<div class="page">

  <!-- ===== 제목 (전체 너비 가운데) ===== -->
  <div class="doc-title">${title}</div>

  <!-- ===== 상단 ===== -->
  <div class="header">
    <div class="header-left">
      <div class="recipient"><span class="recipient-name">${quote.client_company || quote.client_name || ''}</span><span class="recipient-suffix">귀하</span></div>
      <table class="meta-info">
        <tr class="row-top">
          <td class="m-label">${isTransaction ? '거래일' : '견적일'}</td>
          <td class="m-value">${docDate}</td>
        </tr>
        ${!isTransaction ? `<tr class="row-btm">
          <td class="m-label">유효기간</td>
          <td class="m-value">견적일로부터 1개월</td>
        </tr>` : ''}
      </table>
    </div>

    <div class="header-right">
      <div class="supplier">
        <table class="supplier-grid">
          <thead>
            <tr>
              <!-- "공급자" 헤더를 th로 통합: 테이블 전체 너비에 맞게 자동 확장 -->
              <th class="supplier-header" colspan="4">공급자</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td class="s-label">상호</td>
              <td class="s-value">${settings?.company_name || ''}</td>
              <td class="s-label2">대표자</td>
              <td class="s-value">${settings?.representative || ''}</td>
            </tr>
            <tr>
              <td class="s-label">등록번호</td>
              <td class="s-value" colspan="3">${settings?.business_number || ''}</td>
            </tr>
            <tr>
              <td class="s-label">주소</td>
              <td class="s-value" colspan="3">${settings?.address || ''}</td>
            </tr>
            <tr class="tel-row">
              <td class="s-label">전화</td>
              <td class="s-value">${settings?.phone || ''}</td>
              <td class="s-label2">팩스</td>
              <td class="s-value">${settings?.fax || ''}</td>
            </tr>
          </tbody>
        </table>
        ${settings?.stamp_image ? `<img class="stamp-img" src="${settings.stamp_image}" alt="직인"/>` : ''}
      </div>
    </div>
  </div>

  <!-- ===== 견적/거래금액 ===== -->
  <div class="amount-bar">
    <span class="amount-bar-label">${isTransaction ? '거래금액' : '견적금액'} (${(hideTax || blankTax) ? '공급가액' : '공급가액+세액'})</span>
    <span class="amount-bar-value">₩ ${formatCurrency(grandTotal)}</span>
  </div>

  <!-- ===== 품목 테이블 ===== -->
  <table class="items-tbl">
    <thead>
      <tr>
        <th class="t-name">품명</th>
        ${hasSubcat ? '<th class="t-subcat">소분류</th>' : ''}
        <th class="t-spec">규격(mm)</th>
        <th class="t-qty">수량</th>
        <th class="t-price">단가</th>
        <th class="t-supply">공급가액</th>
        ${hideTax ? '' : '<th class="t-tax">세액</th>'}
      </tr>
    </thead>
    <tbody>
      ${itemRows}
      ${emptyRows}
    </tbody>
  </table>

  <!-- ===== 합계 ===== -->
  <div class="total-bar">
    <div class="tl">합계</div>
    <div class="ts">${formatCurrency(supplyTotal)}</div>
    ${hideTax ? '' : `<div class="tt">${blankTax ? '' : formatCurrency(taxTotal)}</div>`}
  </div>

  <!-- ===== 기타 ===== -->
  <div class="etc-block">
    <div class="etc-title">기타</div>
    <div class="etc-body">${settings?.notes ? settings.notes.replace(/\n/g, '<br>') : ''}</div>
  </div>

</div>
</body>
</html>`;
};

// 새 창에서 인쇄
export const printDocument = (html) => {
  const printWindow = window.open('', '_blank');
  printWindow.document.write(html);
  printWindow.document.close();
  setTimeout(() => printWindow.print(), 500);
};

// 이미지로 저장 (html2canvas 필요)
export const saveAsImage = async (html, filename = 'document.png') => {
  const container = document.createElement('div');
  container.innerHTML = html;
  container.style.position = 'absolute';
  container.style.left = '-9999px';
  document.body.appendChild(container);

  try {
    const { default: html2canvas } = await import('html2canvas');
    const canvas = await html2canvas(container.querySelector('.page'), {
      scale: 2, useCORS: true, backgroundColor: '#fff'
    });
    const link = document.createElement('a');
    link.download = filename;
    link.href = canvas.toDataURL('image/png');
    link.click();
  } catch (e) {
    console.error('이미지 저장 실패:', e);
    toast.error('이미지 저장에 실패했습니다.');
  } finally {
    document.body.removeChild(container);
  }
};
