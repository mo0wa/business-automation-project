import { useState, useEffect } from 'react';
import { fixedExpenseAPI, expenseAPI } from '../services/api';
import { toast } from '../services/toast';
import { Loader2, Lock, Plus, Save, X, Calendar } from 'lucide-react';

// 해당 연/월의 일수 (1~31 클램프용)
const daysInMonth = (year, month) => new Date(Number(year), Number(month), 0).getDate();
const pad2 = (n) => String(n).padStart(2, '0');

export default function FixedExpenseChecklist({ filterYear, filterMonth, refreshKey, userId, onExpenseAdded }) {
  const today = new Date();
  const [items, setItems] = useState([]);
  const [checks, setChecks] = useState({}); // { itemId: { is_checked, notes, linked_expense_count } }
  const [ownMonth, setOwnMonth] = useState(String(today.getMonth() + 1));
  const [loading, setLoading] = useState(true);
  const [savingIds, setSavingIds] = useState(new Set());

  // 빠른 지출 등록 팝업
  const [popItem, setPopItem] = useState(null); // 현재 팝업이 열린 항목
  const [popForm, setPopForm] = useState({ expense_date: '', amount: '', _amount_display: '', notes: '' });
  const [popSaving, setPopSaving] = useState(false);

  const activeYear = filterYear || String(today.getFullYear());
  const activeMonth = filterMonth || ownMonth;
  const isLocked = !!filterMonth;

  useEffect(() => {
    loadItems();
  }, []);

  useEffect(() => {
    if (activeYear && activeMonth) loadChecks();
  }, [activeYear, activeMonth, refreshKey]);

  // 필터 월이 변경될 때 ownMonth도 동기화
  useEffect(() => {
    if (filterMonth) setOwnMonth(filterMonth);
  }, [filterMonth]);

  const loadItems = async () => {
    try {
      const res = await fixedExpenseAPI.getItems();
      setItems(res.data);
    } catch (err) {
      console.error('고정 지출 항목 로드 실패:', err);
    }
  };

  const loadChecks = async () => {
    setLoading(true);
    try {
      const res = await fixedExpenseAPI.getChecks(activeYear, activeMonth);
      const map = {};
      res.data.forEach(c => {
        map[c.item_id] = {
          is_checked: c.is_checked,
          notes: c.notes || '',
          linked_expense_count: c.linked_expense_count || 0,
        };
      });
      setChecks(map);
    } catch (err) {
      console.error('체크 현황 로드 실패:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCheck = async (itemId, checked) => {
    const prev = checks[itemId] || { is_checked: 0, notes: '' };
    setChecks(c => ({ ...c, [itemId]: { ...prev, is_checked: checked ? 1 : 0 } }));
    setSavingIds(s => new Set(s).add(itemId));
    try {
      await fixedExpenseAPI.upsertCheck({
        item_id: itemId,
        year: Number(activeYear),
        month: Number(activeMonth),
        is_checked: checked ? 1 : 0,
        notes: prev.notes,
      });
    } catch (err) {
      console.error('체크 저장 실패:', err);
    } finally {
      setSavingIds(s => { const n = new Set(s); n.delete(itemId); return n; });
    }
  };

  const handleNotesBlur = async (itemId, notes) => {
    const prev = checks[itemId] || { is_checked: 0, notes: '' };
    if (notes === (prev.notes || '')) return;
    setChecks(c => ({ ...c, [itemId]: { ...prev, notes } }));
    try {
      await fixedExpenseAPI.upsertCheck({
        item_id: itemId,
        year: Number(activeYear),
        month: Number(activeMonth),
        is_checked: prev.is_checked || 0,
        notes,
      });
    } catch (err) {
      console.error('비고 저장 실패:', err);
    }
  };

  // ── 빠른 지출 등록 팝업 ──
  const openPopover = (item) => {
    if (popItem && popItem.id === item.id) { setPopItem(null); return; } // 토글
    // 템플릿 기반 날짜: 활성 연/월 + 지정 지출일(없으면 오늘 일자), 말일 클램프
    const dim = daysInMonth(activeYear, activeMonth);
    const day = Math.min(item.default_day || today.getDate(), dim);
    const date = `${activeYear}-${pad2(activeMonth)}-${pad2(day)}`;
    const amt = item.default_amount ? String(Math.round(item.default_amount)) : '';
    setPopForm({
      expense_date: date,
      amount: amt,
      _amount_display: amt ? Number(amt).toLocaleString('ko-KR') : '',
      notes: '',
    });
    setPopItem(item);
  };

  const closePopover = () => setPopItem(null);

  const handlePopAmount = (raw) => {
    const digits = raw.replace(/[^0-9]/g, '');
    setPopForm(p => ({ ...p, amount: digits, _amount_display: digits ? Number(digits).toLocaleString('ko-KR') : '' }));
  };

  const submitPopover = async () => {
    if (!popItem) return;
    if (!popForm.expense_date || !popForm.amount) {
      toast.info('날짜와 금액은 필수입니다.');
      return;
    }
    setPopSaving(true);
    try {
      await expenseAPI.create({
        expense_date: popForm.expense_date,
        reason: popItem.default_vendor || popItem.name || '',
        description: popItem.default_description || '',
        amount: Number(popForm.amount),
        notes: popForm.notes || '',
        fixed_item_id: popItem.id,
        created_by: userId,
      });
      setPopItem(null);
      await loadChecks();           // 연동 체크 갱신
      if (onExpenseAdded) onExpenseAdded(); // 부모 지출 목록 갱신
      toast.success('지출이 등록되었습니다.');
    } catch (err) {
      toast.error('지출 등록 실패');
    } finally {
      setPopSaving(false);
    }
  };

  const checkedCount = Object.values(checks).filter(c => c.is_checked).length;
  const progressPct = items.length > 0 ? Math.round((checkedCount / items.length) * 100) : 0;

  return (
    <div className="fec-card">
      <div className="fec-header">
        <div className="fec-title-area">
          <h3 className="fec-title">월 별 고정 지출</h3>
          <div className="fec-progress-wrap">
            <span className="fec-progress-text">{checkedCount} / {items.length} 완료</span>
            <div className="fec-progress-bar">
              <div className="fec-progress-fill" style={{ width: `${progressPct}%` }} />
            </div>
          </div>
        </div>
        <div className="fec-month-selector">
          {isLocked && <Lock size={13} className="fec-lock-icon" />}
          <select
            value={activeMonth}
            onChange={(e) => setOwnMonth(e.target.value)}
            disabled={isLocked}
            className={isLocked ? 'fec-select-locked' : ''}
          >
            {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
              <option key={m} value={String(m)}>{activeYear}년 {m}월</option>
            ))}
          </select>
          {isLocked && <span className="fec-locked-badge">필터 연동</span>}
        </div>
      </div>

      {loading ? (
        <div className="fec-loading">
          <Loader2 className="spin" size={20} />
          <span>불러오는 중...</span>
        </div>
      ) : (
        <div className="fec-grid">
          {items.map(item => {
            const check = checks[item.id] || { is_checked: 0, notes: '', linked_expense_count: 0 };
            const isSaving = savingIds.has(item.id);
            const isLinked = (check.linked_expense_count || 0) > 0;
            const isPopOpen = popItem && popItem.id === item.id;
            return (
              <div key={item.id} className={`fec-item${check.is_checked ? (isLinked ? ' fec-item-linked' : ' fec-item-checked') : ''}${isPopOpen ? ' fec-item-popopen' : ''}`}>
                <label className="fec-item-label">
                  <input
                    type="checkbox"
                    className={`fec-checkbox${isLinked ? ' fec-checkbox-linked' : ''}`}
                    checked={!!check.is_checked}
                    onChange={isLinked ? undefined : (e) => handleCheck(item.id, e.target.checked)}
                    readOnly={isLinked}
                    title={isLinked ? '지출 등록에서 자동 체크된 항목입니다.' : undefined}
                  />
                  <span className="fec-item-name">{item.name || '(직접입력)'}</span>
                  {check.is_checked && (
                    isLinked
                      ? <span className="fec-status-badge fec-status-linked">지출 등록 완료</span>
                      : <span className="fec-status-badge fec-status-manual">수동 체크</span>
                  )}
                  {isSaving && <Loader2 className="spin fec-saving-icon" size={11} />}
                </label>
                <div className="fec-item-bottom">
                  <input
                    type="text"
                    className="fec-notes-input"
                    placeholder="비고"
                    defaultValue={check.notes}
                    key={`${item.id}-${activeYear}-${activeMonth}`}
                    onBlur={(e) => handleNotesBlur(item.id, e.target.value)}
                    readOnly={isLinked}
                  />
                  {item.name && (
                    <button
                      type="button"
                      className={`fec-add-btn${isPopOpen ? ' active' : ''}`}
                      onClick={() => openPopover(item)}
                      title="이 항목으로 지출 등록"
                    >
                      <Plus size={13} /> 지출
                    </button>
                  )}
                </div>

                {isPopOpen && (
                  <div className="fec-pop" onClick={(e) => e.stopPropagation()}>
                    <div className="fec-pop-header">
                      <span className="fec-pop-title">{item.name} 지출 등록</span>
                      <button className="fec-pop-close" onClick={closePopover} title="닫기"><X size={14} /></button>
                    </div>
                    {(popItem.default_vendor || popItem.default_description) && (
                      <div className="fec-pop-template">
                        {popItem.default_vendor && <span className="fec-pop-tline"><b>업체</b> {popItem.default_vendor}</span>}
                        {popItem.default_description && <span className="fec-pop-tline"><b>내용</b> {popItem.default_description}</span>}
                      </div>
                    )}
                    <div className="fec-pop-field">
                      <label><Calendar size={12} /> 날짜</label>
                      <input
                        type="date"
                        value={popForm.expense_date}
                        onChange={(e) => setPopForm(p => ({ ...p, expense_date: e.target.value }))}
                      />
                    </div>
                    <div className="fec-pop-field">
                      <label>금액 (원)</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={popForm._amount_display}
                        onChange={(e) => handlePopAmount(e.target.value)}
                        placeholder="0"
                        autoFocus
                      />
                    </div>
                    <div className="fec-pop-field">
                      <label>비고</label>
                      <input
                        type="text"
                        value={popForm.notes}
                        onChange={(e) => setPopForm(p => ({ ...p, notes: e.target.value }))}
                        placeholder="추가 메모 (선택)"
                        onKeyDown={(e) => { if (e.key === 'Enter') submitPopover(); if (e.key === 'Escape') closePopover(); }}
                      />
                    </div>
                    <div className="fec-pop-actions">
                      <button className="btn-sm-primary" onClick={submitPopover} disabled={popSaving}>
                        {popSaving ? <Loader2 className="spin" size={14} /> : <Save size={14} />}
                        <span>등록</span>
                      </button>
                      <button className="btn-ghost btn-sm" onClick={closePopover}>취소</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
