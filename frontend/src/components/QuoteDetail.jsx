import { useState, useEffect, useContext, useRef } from 'react';
import { quoteAPI, attachmentAPI } from '../services/api';
import { toast } from '../services/toast';
import { confirmDialog } from '../services/confirm';
import { SettingsContext } from '../App';
import { generateQuoteHTML, printDocument, formatCurrency } from '../utils/documentUtils';
import {
  ArrowLeft, Save, Printer, FileText, Image, Trash2, Plus, X,
  ChevronDown, GripVertical, Loader2, Check, AlertCircle,
  Paperclip, Download, Copy
} from 'lucide-react';

const STATUSES = ['임시저장', '작업 대기', '작업 중', '작업 요청 X', '미수금', '수금 완료'];

const STATUS_LABELS = {
  '임시저장': '임시저장',
  '작업 대기': '작업 대기',
  '작업 중': '작업 중',
  '작업 요청 X': '작업 요청 X',
  '미수금': '미입금',
  '수금 완료': '입금완료',
};

const EMPTY_ITEM = {
  category: '', product_type: '', product_name: '', sub_category: '', specification: '',
  quantity: 1, unit_price: 0, raw_material_cost: 0, notes: '',
  file_path: '', image_path: '', vat_inclusive: 0
};

// 세액포함 여부에 따른 공급가액/세액 계산
const calcItemAmounts = (qty, price, vatInclusive) => {
  const total = qty * price;
  if (vatInclusive && total > 0) {
    const supply = Math.round(total / 1.1);
    return { supply_price: supply, tax: total - supply };
  }
  return { supply_price: total, tax: total > 0 ? Math.round(total * 0.1) : 0 };
};

export default function QuoteDetail({ quoteId, onBack, backLabel, userId, initialData, onInitialDataConsumed, onCopyQuote }) {
  const { settings } = useContext(SettingsContext);
  const isNew = !quoteId;
  const [savedQuoteId, setSavedQuoteId] = useState(quoteId);
  const _today = new Date().toISOString().split('T')[0];
  const defaultQuote = initialData?.quote ?? (isNew ? { title: '', client_name: '', client_company: '', notes: '', status: '임시저장', cash_payment: 0, quote_date: '', payment_date: _today, issue_date: _today, payment_date_confirmed: 0, issue_date_confirmed: 0 } : null);
  const [quote, setQuote] = useState(defaultQuote);
  const [items, setItems] = useState(initialData?.items ?? []);
  const [loading, setLoading] = useState(!isNew && !initialData);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false); // 저장 안 한 변경 여부
  const [clientOpts, setClientOpts] = useState({ companies: [], names: [] }); // 자동완성 후보
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const [showImageMenu, setShowImageMenu] = useState(false);
  const today = new Date().toISOString().split('T')[0];
  // 거래일자 직접 지정 여부 (체크 시 거래명세서 날짜로 사용, 미체크 시 오늘 날짜)
  const [useTransDate, setUseTransDate] = useState(!!initialData?.quote?.transaction_date);
  const transactionDate = (useTransDate && quote?.transaction_date) ? quote.transaction_date : today;
  const [attachments, setAttachments] = useState([]);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [dragItemIndex, setDragItemIndex] = useState(null);
  const [dragOverItemIndex, setDragOverItemIndex] = useState(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (initialData) onInitialDataConsumed?.();
    quoteAPI.getClients().then(res => setClientOpts(res.data)).catch(() => {});
  }, []);

  // 저장 안 한 변경이 있으면 새로고침/창닫기 시 브라우저 경고
  useEffect(() => {
    const onBeforeUnload = (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  // 저장하지 않은 변경이 있을 때 목록 이동 가드
  const handleBack = async () => {
    if (dirty && !(await confirmDialog({ title: '나가기', message: '저장하지 않은 변경사항이 있습니다.\n나가시겠습니까?', confirmText: '나가기', danger: true }))) return;
    onBack();
  };
  const handleCopyClick = async () => {
    if (dirty && !(await confirmDialog({ title: '복사본 만들기', message: '저장하지 않은 변경사항이 있습니다.\n복사본을 만들면 현재 변경은 사라집니다. 계속하시겠습니까?', confirmText: '계속', danger: true }))) return;
    onCopyQuote?.(quote, items);
  };

  useEffect(() => {
    if (!savedQuoteId) return;
    loadQuote();
    loadAttachments();
  }, [savedQuoteId]);

  // 신규/복사 견적(저장 전): 확정 전 날짜는 오늘 날짜로 표시
  useEffect(() => {
    if (savedQuoteId) return;
    setQuote(prev => prev ? {
      ...prev,
      payment_date: prev.payment_date_confirmed ? prev.payment_date : today,
      issue_date: (prev.electronic_tax_invoice || prev.cash_receipt) ? prev.issue_date : today,
    } : prev);
  }, []);

  const loadQuote = async () => {
    setLoading(true);
    try {
      const res = await quoteAPI.getById(savedQuoteId);
      const data = res.data;
      // 확정 전인 날짜는 견적서를 연 오늘 날짜로 자동 갱신
      // (결제날짜: '입금' 체크 전 / 발행날짜: 전자세금계산서·현금영수증 둘 다 미체크 시)
      if (!data.payment_date_confirmed) data.payment_date = today;
      if (!(data.electronic_tax_invoice || data.cash_receipt)) data.issue_date = today;
      setQuote(data);
      setItems(data.items || []);
      setUseTransDate(!!data.transaction_date);
    } catch (err) {
      console.error('견적 로드 실패:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadAttachments = async () => {
    try {
      const res = await attachmentAPI.getAll(savedQuoteId);
      setAttachments(res.data);
    } catch (err) {
      console.error('첨부파일 로드 실패:', err);
    }
  };

  const handleFileUpload = async (file) => {
    if (!file) return;
    if (!savedQuoteId) { toast.info('먼저 저장 후 파일을 첨부할 수 있습니다.'); return; }
    setUploadingFile(true);
    try {
      await attachmentAPI.upload(savedQuoteId, file);
      await loadAttachments();
    } catch (err) {
      toast.error('파일 업로드 실패: ' + (err.response?.data?.error || err.message));
    } finally {
      setUploadingFile(false);
    }
  };

  const handleFileInputChange = (e) => {
    const file = e.target.files[0];
    if (file) handleFileUpload(file);
    e.target.value = '';
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileUpload(file);
  };

  const handleDeleteAttachment = async (attachId) => {
    if (!(await confirmDialog({ title: '첨부파일 삭제', message: '첨부파일을 삭제하시겠습니까?', confirmText: '삭제', danger: true }))) return;
    try {
      await attachmentAPI.delete(attachId);
      setAttachments(prev => prev.filter(a => a.id !== attachId));
    } catch (err) {
      toast.error('삭제 실패: ' + (err.response?.data?.error || err.message));
    }
  };

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleQuoteChange = (field, value) => {
    setQuote(prev => ({ ...prev, [field]: value }));
    setSaved(false);
    setDirty(true);
  };

  // 단가 display 문자열 포맷 (콤마 + 소수점 + 음수 보존)
  const formatUnitPriceStr = (val) => {
    if (val === undefined || val === null || val === '' || val === 0) return '';
    const isNeg = Number(val) < 0;
    const str = String(Math.abs(Number(val)));
    const parts = str.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return (isNeg ? '-' : '') + parts.join('.');
  };

  // 원자재값 입력 핸들러 (콤마 자동 삽입, 양수만)
  const handleMaterialInput = (idx, rawInput) => {
    const digits = rawInput.replace(/[^0-9]/g, '');
    const numValue = digits === '' ? 0 : Number(digits);
    const displayValue = digits ? Number(digits).toLocaleString('ko-KR') : '';
    setItems(prev => {
      const updated = [...prev];
      updated[idx] = { ...updated[idx], raw_material_cost: numValue, _material_display: displayValue };
      return updated;
    });
    setSaved(false);
    setDirty(true);
  };

  // 단가 입력 전용 핸들러 (콤마+소수점+음수 지원)
  const handleUnitPriceInput = (idx, rawInput) => {
    // 맨 앞 - 부호 분리
    const isNeg = rawInput.startsWith('-');
    // 콤마 제거 → 숫자와 소수점만 허용
    const cleaned = rawInput.replace(/,/g, '').replace(/[^0-9.]/g, '');
    // 소수점 중복 제거
    const firstDot = cleaned.indexOf('.');
    const normalized = firstDot === -1
      ? cleaned
      : cleaned.slice(0, firstDot + 1) + cleaned.slice(firstDot + 1).replace(/\./g, '');
    // 정수 부분에 콤마 삽입
    const parts = normalized.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    const displayValue = (isNeg ? '-' : '') + parts.join('.');
    const rawNum = normalized === '' || normalized === '.' ? 0 : parseFloat(normalized) || 0;
    const numValue = isNeg ? -rawNum : rawNum;
    setItems(prev => {
      const updated = [...prev];
      const qty = Number(updated[idx].quantity) || 0;
      const amounts = calcItemAmounts(qty, numValue, updated[idx].vat_inclusive);
      updated[idx] = {
        ...updated[idx],
        unit_price: numValue,
        _price_display: displayValue,
        ...amounts,
      };
      return updated;
    });
    setSaved(false);
    setDirty(true);
  };

  const handleVatInclusiveToggle = (idx, checked) => {
    setItems(prev => {
      const updated = [...prev];
      const qty = Number(updated[idx].quantity) || 0;
      const price = Number(updated[idx].unit_price) || 0;
      const amounts = calcItemAmounts(qty, price, checked);
      updated[idx] = { ...updated[idx], vat_inclusive: checked ? 1 : 0, ...amounts };
      return updated;
    });
    setSaved(false);
    setDirty(true);
  };

  const handleItemChange = (idx, field, value) => {
    setItems(prev => {
      const updated = [...prev];
      updated[idx] = { ...updated[idx], [field]: value };
      // 공급가액 자동계산
      if (field === 'quantity') {
        const qty = Number(value);
        const price = Number(updated[idx].unit_price) || 0;
        const amounts = calcItemAmounts(qty, price, updated[idx].vat_inclusive);
        updated[idx] = { ...updated[idx], ...amounts };
      }
      return updated;
    });
    setSaved(false);
    setDirty(true);
  };

  const addItem = () => {
    setItems(prev => [...prev, { ...EMPTY_ITEM, sort_order: prev.length }]);
    setSaved(false);
    setDirty(true);
  };

  const removeItem = (idx) => {
    setItems(prev => prev.filter((_, i) => i !== idx));
    setSaved(false);
    setDirty(true);
  };

  // ── 품목 순서 드래그 변경 (빈 영역 드래그, 입력칸 위에서는 비활성) ──
  const itemDragAllowed = useRef(true);
  const handleItemMouseDown = (e) => {
    // input/select/textarea/button/label 위에서 시작하면 드래그하지 않음 (텍스트 선택/입력 보호)
    itemDragAllowed.current = !e.target.closest('input, textarea, select, button, label, a');
  };
  const handleItemDragStart = (e, idx) => {
    if (!itemDragAllowed.current) { e.preventDefault(); return; }
    setDragItemIndex(idx);
    e.dataTransfer.effectAllowed = 'move';
  };
  const handleItemDragOver = (e, idx) => {
    if (dragItemIndex === null) return;
    e.preventDefault();
    if (idx !== dragOverItemIndex) setDragOverItemIndex(idx);
  };
  const resetItemDrag = () => { setDragItemIndex(null); setDragOverItemIndex(null); };
  const handleItemDrop = (idx) => {
    if (dragItemIndex === null || dragItemIndex === idx) { resetItemDrag(); return; }
    setItems(prev => {
      const arr = [...prev];
      const [moved] = arr.splice(dragItemIndex, 1);
      arr.splice(idx, 0, moved);
      return arr;
    });
    setSaved(false);
    setDirty(true);
    resetItemDrag();
  };

  // ── 결제/발행 날짜 확정 토글 ──
  // 확정 체크: 현재(오늘 또는 직접 선택한) 날짜로 고정 / 해제: 다시 오늘 날짜로 자동 갱신
  const togglePaymentConfirm = (checked) => {
    setQuote(prev => ({
      ...prev,
      payment_date_confirmed: checked ? 1 : 0,
      payment_date: checked ? (prev.payment_date || today) : today,
    }));
    setSaved(false);
    setDirty(true);
  };
  // 발행날짜는 전자세금계산서/현금영수증 체크가 확정 역할:
  // 둘 중 하나라도 체크되면 그날 날짜로 고정, 모두 해제되면 다시 오늘 날짜로 자동 갱신
  const handleIssueFlagChange = (field, checked) => {
    setQuote(prev => {
      const next = { ...prev, [field]: checked ? 1 : 0 };
      const anyIssued = !!(next.electronic_tax_invoice || next.cash_receipt);
      next.issue_date = anyIssued ? (prev.issue_date || today) : today;
      next.issue_date_confirmed = anyIssued ? 1 : 0;
      return next;
    });
    setSaved(false);
    setDirty(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const saveQuote = {
        ...quote,
        quote_date: quote.quote_date || today,
        payment_date: quote.payment_date || today,
        issue_date: quote.issue_date || today,
        // 발행 확정 = 전자세금계산서/현금영수증 체크 여부
        issue_date_confirmed: (quote.electronic_tax_invoice || quote.cash_receipt) ? 1 : 0,
        transaction_date: useTransDate ? (quote.transaction_date || today) : null,
      };
      const cleanedItems = items.map(({ _price_display, ...rest }) => rest);
      if (!savedQuoteId) {
        // 신규 — 처음 저장 시 생성
        const res = await quoteAPI.create({ ...saveQuote, created_by: userId, items: cleanedItems });
        setSavedQuoteId(res.data.id);
      } else {
        await quoteAPI.update(savedQuoteId, { ...saveQuote, items: cleanedItems });
        await loadQuote();
      }
      setSaved(true);
      setDirty(false);
      setTimeout(() => setSaved(false), 2000);
      toast.success('저장되었습니다.');
    } catch (err) {
      toast.error('저장 실패: ' + (err.response?.data?.error || err.message));
    } finally {
      setSaving(false);
    }
  };

  // ── 키보드 단축키: Ctrl+S 저장 / Esc 메뉴닫기·뒤로 ──
  const kbdRef = useRef({});
  kbdRef.current = { handleSave, handleBack, showStatusMenu, showImageMenu };
  useEffect(() => {
    const onKey = (e) => {
      // 확인 모달이 떠 있으면 단축키 무시 (모달이 Esc/Enter 처리)
      if (document.querySelector('.confirm-overlay')) return;
      const k = kbdRef.current;
      if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        k.handleSave();
      } else if (e.key === 'Escape') {
        if (k.showStatusMenu || k.showImageMenu) {
          setShowStatusMenu(false);
          setShowImageMenu(false);
        } else {
          k.handleBack();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const handleStatusChange = async (newStatus) => {
    if (!savedQuoteId) { setQuote(prev => ({ ...prev, status: newStatus })); setShowStatusMenu(false); return; }
    try {
      await quoteAPI.updateStatus(savedQuoteId, newStatus);
      setQuote(prev => ({ ...prev, status: newStatus }));
      setShowStatusMenu(false);
    } catch (err) {
      toast.error('상태 변경 실패');
    }
  };

  const handleDelete = async () => {
    if (!savedQuoteId) { onBack(); return; }
    if (!(await confirmDialog({ title: '견적서 삭제', message: '정말 삭제하시겠습니까?\n휴지통으로 이동됩니다.', confirmText: '삭제', danger: true }))) return;
    try {
      await quoteAPI.delete(savedQuoteId);
      toast.success('휴지통으로 이동했습니다.');
      onBack();
    } catch (err) {
      toast.error('삭제 실패');
    }
  };

  const handlePrint = (type) => {
    const html = generateQuoteHTML(
      { ...quote, total_amount: calcTotal(), supply_amount: calcSupply(), tax_amount: calcTax() },
      items, settings, type,
      type === 'transaction' ? transactionDate : null
    );
    printDocument(html);
  };

  const handleSaveImage = async (type = 'quote') => {
    setShowImageMenu(false);
    const docLabel = type === 'transaction' ? '거래명세서' : '견적서';
    const html = generateQuoteHTML(
      { ...quote, total_amount: calcTotal(), supply_amount: calcSupply(), tax_amount: calcTax() },
      items, settings, type,
      type === 'transaction' ? transactionDate : null
    );
    const container = document.createElement('div');
    container.innerHTML = html;
    container.style.cssText = 'position:absolute;left:-9999px;top:0;';
    document.body.appendChild(container);
    try {
      const { default: html2canvas } = await import('html2canvas');
      const canvas = await html2canvas(container.querySelector('.page'), {
        scale: 2, useCORS: true, backgroundColor: '#fff'
      });
      const today = new Date();
      const dateStr = `${today.getFullYear()}${String(today.getMonth()+1).padStart(2,'0')}${String(today.getDate()).padStart(2,'0')}`;
      const company = (quote.client_company || quote.client_name || '').replace(/\s/g, '');
      const firstProduct = (items[0]?.product_name || '').replace(/\s/g, '');
      const fileName = [docLabel, company, firstProduct, dateStr].filter(Boolean).join('_');
      const link = document.createElement('a');
      link.download = `${fileName}.jpg`;
      link.href = canvas.toDataURL('image/jpeg', 0.95);
      link.click();
    } catch {
      toast.error('이미지 저장에 실패했습니다.');
    } finally {
      document.body.removeChild(container);
    }
  };

  // 합계 계산 (세액포함 품목은 역산)
  const calcSupply = () => items.reduce((sum, item) => {
    const { supply_price } = calcItemAmounts(Number(item.quantity) || 0, Number(item.unit_price) || 0, item.vat_inclusive);
    return sum + supply_price;
  }, 0);
  const calcTax = () => {
    if (quote?.cash_payment) return 0;
    return items.reduce((sum, item) => {
      const { supply_price, tax } = calcItemAmounts(Number(item.quantity) || 0, Number(item.unit_price) || 0, item.vat_inclusive);
      return sum + (supply_price > 0 ? tax : 0);
    }, 0);
  };
  const calcTotal = () => calcSupply() + calcTax();
  const calcMaterial = () => items.reduce((sum, item) => sum + (Number(item.raw_material_cost) || 0), 0);

  if (loading) return (
    <div className="loading-area"><Loader2 className="spin" size={32} /><p>로딩 중...</p></div>
  );

  if (!quote) return (
    <div className="empty-area"><AlertCircle size={48} /><p>견적서를 찾을 수 없습니다.</p></div>
  );

  return (
    <div className="quote-detail-page">
      {/* 상단 액션바 */}
      <div className="detail-header">
        <button className="btn-ghost" onClick={handleBack}>
          <ArrowLeft size={18} />
          <span>{backLabel || '목록으로'}</span>
        </button>
      </div>

      <div className="detail-content">
        {/* 좌측: 견적 정보 */}
        <div className="detail-main">
          {/* 상태 + 제목 + 액션 버튼 */}
          <div className="detail-title-area">
            <div className="status-selector">
              <button className="status-current" onClick={() => setShowStatusMenu(!showStatusMenu)}>
                {STATUS_LABELS[quote.status] || quote.status}
                <ChevronDown size={14} />
              </button>
              {showStatusMenu && (
                <div className="status-menu">
                  {STATUSES.map(s => (
                    <button key={s} className={quote.status === s ? 'active' : ''} onClick={() => handleStatusChange(s)}>
                      {STATUS_LABELS[s]}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <input
              className="detail-title-input"
              type="text"
              value={quote.title || ''}
              onChange={(e) => handleQuoteChange('title', e.target.value)}
              placeholder="견적서 제목"
            />
            <div className="detail-actions">
              <button className="btn-outline" onClick={handleCopyClick} title="이 견적서를 복사본으로 새로 만들기">
                <Copy size={16} /> 복사
              </button>
              <button className="btn-outline" onClick={() => handlePrint('quote')}>
                <Printer size={16} /> 견적서
              </button>
              <button className="btn-outline" onClick={() => handlePrint('transaction')}>
                <FileText size={16} /> 거래명세서
              </button>
              <div className="img-btn-group">
                <button className="btn-outline" onClick={() => setShowImageMenu(v => !v)}>
                  <Image size={16} /> JPG
                </button>
                {showImageMenu && (
                  <div className="img-type-menu">
                    <button onClick={() => handleSaveImage('quote')}><Printer size={13} /> 견적서</button>
                    <button onClick={() => handleSaveImage('transaction')}><FileText size={13} /> 거래명세서</button>
                  </div>
                )}
              </div>
              <button className="btn-danger-outline" onClick={handleDelete}>
                <Trash2 size={16} />
              </button>
              <button className="btn-outline" onClick={handleBack}>
                <ArrowLeft size={16} />
                <span>{backLabel || '목록으로'}</span>
              </button>
              <button className="btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="spin" size={16} /> : saved ? <Check size={16} /> : <Save size={16} />}
                <span>{saving ? '저장 중...' : saved ? '저장됨' : '저장'}</span>
              </button>
            </div>
          </div>

          {/* 고객 정보 */}
          <div className="info-section">
            <h3 className="section-title">고객 정보</h3>
            <div className="form-grid customer-info-grid">
              <div className="form-field">
                <label>거래처</label>
                <input type="text" list="client-company-list" value={quote.client_company || ''} onChange={(e) => handleQuoteChange('client_company', e.target.value)} placeholder="거래처" />
                <datalist id="client-company-list">
                  {clientOpts.companies.map((c) => <option key={c} value={c} />)}
                </datalist>
              </div>
              <div className="form-field">
                <label>일자</label>
                <input type="date" value={quote.quote_date || ''} onChange={(e) => handleQuoteChange('quote_date', e.target.value)} />
              </div>
              <div className="form-field">
                <label className="trans-date-toggle">
                  <input
                    type="checkbox"
                    checked={useTransDate}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setUseTransDate(checked);
                      if (checked && !quote.transaction_date) handleQuoteChange('transaction_date', today);
                    }}
                  />
                  <span>거래일자</span>
                </label>
                <input
                  type="date"
                  value={quote.transaction_date || ''}
                  disabled={!useTransDate}
                  onChange={(e) => handleQuoteChange('transaction_date', e.target.value)}
                  className="trans-date-input"
                  title="체크 시 거래명세서 날짜로 사용됩니다"
                />
              </div>
              <div className="form-field">
                <label>담당자</label>
                <input type="text" list="client-name-list" value={quote.client_name || ''} onChange={(e) => handleQuoteChange('client_name', e.target.value)} placeholder="담당자" />
                <datalist id="client-name-list">
                  {clientOpts.names.map((n) => <option key={n} value={n} />)}
                </datalist>
              </div>
            </div>
          </div>

          {/* 품목 리스트 */}
          <div className="info-section">
            <div className="section-header">
              <h3 className="section-title">품목 내역</h3>
              <button className="btn-sm-primary" onClick={addItem}>
                <Plus size={14} /> 품목 추가
              </button>
            </div>

            {items.length === 0 ? (
              <div className="empty-items">
                <p>등록된 품목이 없습니다.</p>
                <button className="btn-outline" onClick={addItem}>
                  <Plus size={16} /> 첫 품목 추가하기
                </button>
              </div>
            ) : (
              <div className="items-list">
                {items.map((item, idx) => (
                  <div
                    key={idx}
                    className={`item-card${dragItemIndex === idx ? ' dragging' : ''}${dragOverItemIndex === idx && dragItemIndex !== null && dragItemIndex !== idx ? ' drag-over' : ''}`}
                    draggable
                    onMouseDown={handleItemMouseDown}
                    onDragStart={(e) => handleItemDragStart(e, idx)}
                    onDragOver={(e) => handleItemDragOver(e, idx)}
                    onDrop={() => handleItemDrop(idx)}
                    onDragEnd={resetItemDrag}
                  >
                    <div className="item-card-header">
                      <GripVertical size={16} className="drag-handle" />
                      <span className="item-number">#{idx + 1}</span>
                      <button className="item-remove-btn" onClick={() => removeItem(idx)}>
                        <X size={14} />
                      </button>
                    </div>
                    <div
                      className="item-fields"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); addItem(); }
                      }}
                    >
                      <div className="item-field">
                        <label>품명</label>
                        <input type="text" value={item.product_name || ''} onChange={(e) => handleItemChange(idx, 'product_name', e.target.value)} placeholder="품명" />
                      </div>
                      <div className="item-field">
                        <label>소분류</label>
                        <input type="text" value={item.sub_category || ''} onChange={(e) => handleItemChange(idx, 'sub_category', e.target.value)} placeholder="소분류 (선택)" />
                      </div>
                      <div className="item-field">
                        <label>규격</label>
                        <input type="text" value={item.specification || ''} onChange={(e) => handleItemChange(idx, 'specification', e.target.value)} placeholder="규격" />
                      </div>
                      <div className="item-field">
                        <label>수량</label>
                        <input type="number" value={item.quantity || ''} onChange={(e) => handleItemChange(idx, 'quantity', e.target.value)} min="0" />
                      </div>
                      <div className="item-field item-field-price">
                        <label>
                          단가
                          <label className="vat-inclusive-toggle" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={!!item.vat_inclusive}
                              onChange={(e) => handleVatInclusiveToggle(idx, e.target.checked)}
                            />
                            <span>세액포함</span>
                          </label>
                        </label>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={item._price_display !== undefined ? item._price_display : formatUnitPriceStr(item.unit_price)}
                          onChange={(e) => handleUnitPriceInput(idx, e.target.value)}
                          placeholder="0"
                        />
                      </div>
                      <div className="item-field">
                        <label>공급가액</label>
                        <div className="readonly-value">
                          ₩{formatCurrency(calcItemAmounts(Number(item.quantity) || 0, Number(item.unit_price) || 0, item.vat_inclusive).supply_price)}
                          {!!item.vat_inclusive && <span className="vat-badge">세포함</span>}
                        </div>
                      </div>
                      <div className="item-field">
                        <label>원자재값</label>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={item._material_display !== undefined ? item._material_display : (item.raw_material_cost ? Number(item.raw_material_cost).toLocaleString('ko-KR') : '')}
                          onChange={(e) => handleMaterialInput(idx, e.target.value)}
                          placeholder="0"
                        />
                      </div>
                      <div className="item-field full-width">
                        <label>비고</label>
                        <input type="text" value={item.notes || ''} onChange={(e) => handleItemChange(idx, 'notes', e.target.value)} placeholder="비고" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 메모 */}
          <div className="info-section">
            <h3 className="section-title">메모</h3>
            <textarea
              className="memo-textarea"
              value={quote.notes || ''}
              onChange={(e) => handleQuoteChange('notes', e.target.value)}
              placeholder="견적 관련 메모..."
              rows={3}
            />
          </div>

          {/* 첨부파일 */}
          <div className="info-section">
            <h3 className="section-title">첨부파일</h3>
            <div
              className={`attachment-dropzone${dragOver ? ' drag-over' : ''}`}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
            >
              <input
                ref={fileInputRef}
                type="file"
                style={{ display: 'none' }}
                onChange={handleFileInputChange}
              />
              {uploadingFile ? (
                <><Loader2 size={18} className="spin" /><span>업로드 중...</span></>
              ) : (
                <><Paperclip size={18} /><span>파일을 드래그하거나 클릭하여 업로드</span></>
              )}
            </div>
            {attachments.length > 0 && (
              <ul className="attachment-list">
                {attachments.map(att => (
                  <li key={att.id} className="attachment-item">
                    <span className="attachment-name" title={att.original_name}>{att.original_name}</span>
                    <span className="attachment-size">{formatFileSize(att.file_size)}</span>
                    <a
                      className="attachment-btn"
                      href={`/uploads/${att.filename}`}
                      download={att.original_name}
                      onClick={(e) => e.stopPropagation()}
                      title="다운로드"
                    >
                      <Download size={14} />
                    </a>
                    <button
                      className="attachment-btn attachment-btn-delete"
                      onClick={() => handleDeleteAttachment(att.id)}
                      title="삭제"
                    >
                      <Trash2 size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* 우측: 요약 패널 */}
        <div className="detail-sidebar">
          <div className="summary-card">
            <div className="summary-card-header">
              <div className="payment-checkboxes">
                <label className="payment-toggle">
                  <input
                    type="checkbox"
                    checked={!!quote.cash_payment}
                    onChange={(e) => handleQuoteChange('cash_payment', e.target.checked ? 1 : 0)}
                  />
                  <span>현금결제</span>
                </label>
                <label className="payment-toggle">
                  <input
                    type="checkbox"
                    checked={!!quote.card_payment}
                    onChange={(e) => handleQuoteChange('card_payment', e.target.checked ? 1 : 0)}
                  />
                  <span>카드결제</span>
                </label>
              </div>
              <h4>금액 요약</h4>
            </div>
            <div className="summary-row">
              <span>공급가액</span>
              <span>₩{formatCurrency(calcSupply())}</span>
            </div>
            <div className="summary-row">
              <span className={quote.cash_payment ? 'cash-tax-label' : ''}>
                세액 (10%){quote.cash_payment ? ' — 면제' : ''}
              </span>
              <span className={quote.cash_payment ? 'cash-tax-value' : ''}>
                {quote.cash_payment ? '₩0' : `₩${formatCurrency(calcTax())}`}
              </span>
            </div>
            <div className="summary-divider" />
            <div className="summary-row total">
              <span>합계금액</span>
              <span>₩{formatCurrency(calcTotal())}</span>
            </div>
            <div className="summary-field">
              <label className="summary-field-label">결제날짜</label>
              <div className="summary-date-row">
                <input
                  type="date"
                  className="summary-date-input"
                  value={quote.payment_date || ''}
                  onChange={(e) => handleQuoteChange('payment_date', e.target.value)}
                />
                <label className="date-confirm-toggle" title="입금 체크 전까지는 견적서를 여는 날짜로 자동 표시되고, 입금을 체크하면 해당 날짜로 고정됩니다.">
                  <input
                    type="checkbox"
                    checked={!!quote.payment_date_confirmed}
                    onChange={(e) => togglePaymentConfirm(e.target.checked)}
                  />
                  <span>입금</span>
                </label>
              </div>
            </div>
          </div>

          <div className="summary-card summary-card-no-title">
            <div className="issue-checkboxes">
              <label className="payment-toggle">
                <input
                  type="checkbox"
                  checked={!!quote.electronic_tax_invoice}
                  onChange={(e) => handleIssueFlagChange('electronic_tax_invoice', e.target.checked)}
                />
                <span>전자세금계산서</span>
              </label>
              <label className="payment-toggle">
                <input
                  type="checkbox"
                  checked={!!quote.cash_receipt}
                  onChange={(e) => handleIssueFlagChange('cash_receipt', e.target.checked)}
                />
                <span>현금영수증</span>
              </label>
            </div>
            <div className="summary-field">
              <label className="summary-field-label">발행날짜</label>
              <div className="summary-date-row">
                <input
                  type="date"
                  className="summary-date-input"
                  value={quote.issue_date || ''}
                  onChange={(e) => handleQuoteChange('issue_date', e.target.value)}
                  title="전자세금계산서 또는 현금영수증을 체크하기 전까지는 견적서를 여는 날짜로 자동 표시되고, 체크하면 해당 날짜로 고정됩니다."
                />
              </div>
            </div>
          </div>

          <div className="summary-card">
            <h4>원가 분석</h4>
            <div className="summary-row">
              <span>원자재비 합계</span>
              <span>₩{formatCurrency(calcMaterial())}</span>
            </div>
            <div className="summary-row">
              <span>예상 마진</span>
              <span className={calcSupply() - calcMaterial() >= 0 ? 'positive' : 'negative'}>
                ₩{formatCurrency(calcSupply() - calcMaterial())}
              </span>
            </div>
            <div className="summary-row">
              <span>마진율</span>
              <span>
                {calcSupply() > 0 ? Math.round(((calcSupply() - calcMaterial()) / calcSupply()) * 100) : 0}%
              </span>
            </div>
          </div>

          <button className="btn-sidebar-add" onClick={addItem}>
            <Plus size={16} /> 품목 추가
          </button>
        </div>
      </div>

      {(showStatusMenu || showImageMenu) && (
        <div className="overlay-close" onClick={() => { setShowStatusMenu(false); setShowImageMenu(false); }} />
      )}
    </div>
  );
}
