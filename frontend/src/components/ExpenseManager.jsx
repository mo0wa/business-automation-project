import { useState, useEffect } from 'react';
import { expenseAPI, fixedExpenseAPI } from '../services/api';
import { toast } from '../services/toast';
import { confirmDialog } from '../services/confirm';
import { formatCurrency } from '../utils/documentUtils';
import { Plus, Save, Trash2, X, Loader2, Calendar, Edit3, Download } from 'lucide-react';
import FixedExpenseChecklist from './FixedExpenseChecklist';
import { downloadXLSX } from '../utils/excel';

const EMPTY_FORM = {
  expense_date: new Date().toISOString().split('T')[0],
  reason: '',
  description: '',
  amount: '',
  _amount_display: '',
  notes: '',
  fixed_item_id: ''
};

export default function ExpenseManager({ userId }) {
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [isNew, setIsNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fixedItems, setFixedItems] = useState([]);
  const [checklistRefreshKey, setChecklistRefreshKey] = useState(0);

  // 우측 패널 폼
  const [form, setForm] = useState(EMPTY_FORM);

  // 필터
  const [filterYear, setFilterYear] = useState(new Date().getFullYear().toString());
  const [filterMonth, setFilterMonth] = useState('');

  useEffect(() => { loadExpenses(); }, [filterYear, filterMonth]);
  useEffect(() => {
    fixedExpenseAPI.getItems().then(res => setFixedItems(res.data)).catch(() => {});
  }, []);

  const loadExpenses = async () => {
    setLoading(true);
    try {
      const params = {};
      if (filterYear) params.year = filterYear;
      if (filterMonth) params.month = filterMonth;
      const res = await expenseAPI.getAll(params);
      setExpenses(res.data);
    } catch (err) {
      console.error('지출 로드 실패:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAmountInput = (raw) => {
    const digits = raw.replace(/[^0-9]/g, '');
    const display = digits ? Number(digits).toLocaleString('ko-KR') : '';
    setForm(prev => ({ ...prev, amount: digits, _amount_display: display }));
  };

  const handleSelect = (expense) => {
    setSelectedId(expense.id);
    setIsNew(false);
    const display = expense.amount ? Number(expense.amount).toLocaleString('ko-KR') : '';
    setForm({
      expense_date: expense.expense_date || '',
      reason: expense.reason || '',
      description: expense.description || '',
      amount: expense.amount || '',
      _amount_display: display,
      notes: expense.notes || '',
      fixed_item_id: expense.fixed_item_id || ''
    });
  };

  const handleNew = () => {
    setSelectedId(null);
    setIsNew(true);
    setForm(EMPTY_FORM);
  };

  const handleSave = async () => {
    if (!form.expense_date || !form.reason || !form.amount) {
      toast.info('지출일, 업체, 금액은 필수입니다.');
      return;
    }
    setSaving(true);
    try {
      const { _amount_display, ...saveForm } = form;
      if (isNew) {
        await expenseAPI.create({ ...saveForm, amount: Number(form.amount), created_by: userId });
      } else {
        await expenseAPI.update(selectedId, { ...saveForm, amount: Number(form.amount) });
      }
      await loadExpenses();
      setChecklistRefreshKey(k => k + 1);
      toast.success(isNew ? '지출이 등록되었습니다.' : '수정되었습니다.');
      if (isNew) {
        setIsNew(false);
        setSelectedId(null);
        setForm(EMPTY_FORM);
      }
    } catch (err) {
      toast.error('저장 실패');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedId) return;
    if (!(await confirmDialog({ title: '지출 삭제', message: '정말 삭제하시겠습니까?', confirmText: '삭제', danger: true }))) return;
    try {
      await expenseAPI.delete(selectedId);
      setSelectedId(null);
      setIsNew(false);
      setForm(EMPTY_FORM);
      await loadExpenses();
      setChecklistRefreshKey(k => k + 1);
      toast.success('삭제되었습니다.');
    } catch (err) {
      toast.error('삭제 실패');
    }
  };

  const handleExportCSV = () => {
    if (expenses.length === 0) { toast.info('내보낼 지출 내역이 없습니다.'); return; }
    const headers = ['지출일', '업체', '지출내용', '금액', '고정항목', '비고'];
    const rows = expenses.map(e => [
      e.expense_date || '', e.reason || '', e.description || '',
      Math.round(e.amount || 0), e.fixed_item_name || '', e.notes || '',
    ]);
    rows.push(['합계', '', '', Math.round(totalAmount), '', '']);
    const period = filterMonth ? `${filterYear}년${filterMonth}월` : `${filterYear}년`;
    downloadXLSX(`지출내역_${period}`, period, headers, rows, { numberCols: [3] });
  };

  const handleCancel = () => {
    setSelectedId(null);
    setIsNew(false);
    setForm(EMPTY_FORM);
  };

  // 월 합계
  const totalAmount = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);

  // 연도 옵션
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 5 }, (_, i) => (currentYear - i).toString());

  return (
    <div className="expense-page">
      <div className="page-header">
        <div className="page-title-area">
          <h2 className="page-title">지출 등록</h2>
          <p className="page-subtitle">총 {expenses.length}건 | 합계: ₩{formatCurrency(totalAmount)}</p>
        </div>
        <div className="header-btn-group">
          <button className="btn-outline" onClick={handleExportCSV}>
            <Download size={16} />
            <span>엑셀 내보내기</span>
          </button>
          <button className="btn-primary" onClick={handleNew}>
            <Plus size={18} />
            <span>신규 지출등록</span>
          </button>
        </div>
      </div>

      {/* 필터 */}
      <div className="expense-filter">
        <select value={filterYear} onChange={(e) => setFilterYear(e.target.value)}>
          {years.map(y => <option key={y} value={y}>{y}년</option>)}
        </select>
        <select value={filterMonth} onChange={(e) => setFilterMonth(e.target.value)}>
          <option value="">전체 월</option>
          {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
            <option key={m} value={m.toString()}>{m}월</option>
          ))}
        </select>
      </div>

      <div className={`expense-fixed-row${isNew ? ' with-new-panel' : ''}`}>
        {/* 신규 등록 패널 (월별 고정 지출 영역 좌측) */}
        {isNew && (
          <div className="new-expense-panel">
            <div className="nep-header">
              <h3><Edit3 size={16} /> 신규 등록</h3>
              <div className="nep-header-actions">
                <button className="btn-ghost" onClick={handleCancel} title="닫기"><X size={16} /></button>
                <button className="btn-primary" onClick={handleSave} disabled={saving}>
                  {saving ? <Loader2 className="spin" size={16} /> : <Save size={16} />}
                  <span>등록</span>
                </button>
              </div>
            </div>
            <div className="nep-form">
              <div className="form-field">
                <label><Calendar size={14} /> 지출일</label>
                <input
                  type="date"
                  value={form.expense_date}
                  onChange={(e) => setForm(prev => ({ ...prev, expense_date: e.target.value }))}
                />
              </div>
              <div className="form-field">
                <label>업체</label>
                <input
                  type="text"
                  value={form.reason}
                  onChange={(e) => setForm(prev => ({ ...prev, reason: e.target.value }))}
                  placeholder="거래 업체명"
                />
              </div>
              <div className="form-field">
                <label>지출내용</label>
                <input
                  type="text"
                  value={form.description}
                  onChange={(e) => setForm(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="예: 자재 구매, 교통비, 식비 등"
                />
              </div>
              <div className="form-field">
                <label>지출 비용 (원)</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={form._amount_display}
                  onChange={(e) => handleAmountInput(e.target.value)}
                  placeholder="0"
                />
              </div>
              <div className="form-field">
                <label>비고</label>
                <input
                  type="text"
                  value={form.notes}
                  onChange={(e) => setForm(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder="추가 메모..."
                />
              </div>
            </div>
          </div>
        )}

        <FixedExpenseChecklist
          filterYear={filterYear}
          filterMonth={filterMonth}
          refreshKey={checklistRefreshKey}
          userId={userId}
          onExpenseAdded={() => { loadExpenses(); setChecklistRefreshKey(k => k + 1); }}
        />
      </div>

      <div className="expense-layout">
        {/* 좌측: 그리드 리스트 */}
        <div className="expense-list-panel">
          {loading ? (
            <div className="loading-area small"><Loader2 className="spin" size={24} /><p>로딩 중...</p></div>
          ) : expenses.length === 0 ? (
            <div className="empty-area small">
              <p>지출 내역이 없습니다.</p>
            </div>
          ) : (
            <table className="expense-table">
              <thead>
                <tr>
                  <th>지출일</th>
                  <th>업체</th>
                  <th>지출내용</th>
                  <th>금액</th>
                  <th>고정항목</th>
                  <th>비고</th>
                </tr>
              </thead>
              <tbody>
                {expenses.map(exp => (
                  <tr
                    key={exp.id}
                    className={selectedId === exp.id ? 'selected' : ''}
                    onClick={() => handleSelect(exp)}
                  >
                    <td className="date-cell">{exp.expense_date}</td>
                    <td>{exp.reason}</td>
                    <td>{exp.description || '-'}</td>
                    <td className="amount-cell">₩{formatCurrency(exp.amount)}</td>
                    <td className="fixed-item-cell">
                      {exp.fixed_item_name
                        ? <span className="fixed-item-tag">{exp.fixed_item_name}</span>
                        : <span className="fixed-item-none">-</span>}
                    </td>
                    <td className="notes-cell">{exp.notes || '-'}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan="3" style={{ textAlign: 'center', fontWeight: 'bold' }}>합계</td>
                  <td className="amount-cell" style={{ fontWeight: 'bold' }}>₩{formatCurrency(totalAmount)}</td>
                  <td></td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>

        {/* 우측: 지출 상세 패널 */}
        <div className="expense-detail-panel">
          <div className="detail-panel-header">
            <h3>
              {selectedId ? (
                <span>지출 상세</span>
              ) : (
                <span>지출 내역을 선택하세요</span>
              )}
            </h3>
            {selectedId && (
              <button className="btn-ghost" onClick={handleCancel}>
                <X size={16} />
              </button>
            )}
          </div>

          {selectedId ? (
            <div className="detail-panel-form">
              <div className="form-field">
                <label><Calendar size={14} /> 지출일</label>
                <input
                  type="date"
                  value={form.expense_date}
                  onChange={(e) => setForm(prev => ({ ...prev, expense_date: e.target.value }))}
                />
              </div>
              <div className="form-field">
                <label>업체</label>
                <input
                  type="text"
                  value={form.reason}
                  onChange={(e) => setForm(prev => ({ ...prev, reason: e.target.value }))}
                  placeholder="거래 업체명"
                />
              </div>
              <div className="form-field">
                <label>지출내용</label>
                <input
                  type="text"
                  value={form.description}
                  onChange={(e) => setForm(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="예: 자재 구매, 교통비, 식비 등"
                />
              </div>
              <div className="form-field">
                <label>지출 비용 (원)</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={form._amount_display}
                  onChange={(e) => handleAmountInput(e.target.value)}
                  placeholder="0"
                />
              </div>
              <div className="form-field">
                <label>고정 지출 항목 연결</label>
                <select
                  value={form.fixed_item_id}
                  onChange={(e) => setForm(prev => ({ ...prev, fixed_item_id: e.target.value }))}
                  className="fixed-item-select"
                >
                  <option value="">연결 안 함</option>
                  {fixedItems.filter(it => it.name).map(it => (
                    <option key={it.id} value={it.id}>{it.name}</option>
                  ))}
                </select>
                {form.fixed_item_id && (
                  <p className="fixed-item-hint">저장 시 해당 월 체크리스트 항목이 자동으로 체크됩니다.</p>
                )}
              </div>

              <div className="form-field">
                <label>비고</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder="추가 메모..."
                  rows={3}
                />
              </div>

              <div className="detail-panel-actions">
                <button className="btn-primary" onClick={handleSave} disabled={saving}>
                  {saving ? <Loader2 className="spin" size={16} /> : <Save size={16} />}
                  <span>수정</span>
                </button>
                <button className="btn-danger-outline" onClick={handleDelete}>
                  <Trash2 size={16} />
                  <span>삭제</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="detail-panel-empty">
              <Calendar size={48} strokeWidth={1} />
              <p>좌측 목록에서 지출 내역을 클릭하거나</p>
              <p>신규 등록 버튼을 눌러주세요.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
