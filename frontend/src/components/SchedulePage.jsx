import { useState, useEffect, useMemo, useRef } from 'react';
import { calendarAPI } from '../services/api';
import { formatCurrency } from '../utils/documentUtils';
import {
  ChevronLeft, ChevronRight, Loader2, CalendarDays,
  TrendingUp, TrendingDown, Repeat, FileText, ExternalLink, Receipt
} from 'lucide-react';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const pad2 = (n) => String(n).padStart(2, '0');
const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};

// 이벤트 타입 → 카테고리(필터/색상)
const CATEGORY = {
  payment: 'income', expense: 'expense', fixed: 'fixed',
  quote: 'quote', issue: 'quote', transaction: 'quote',
};

// 칩에 보일 짧은 라벨
function chipLabel(ev) {
  switch (ev.type) {
    case 'payment': return `${ev.status === '수금 완료' ? '입금' : '입금예정'} ${formatCurrency(ev.amount)}`;
    case 'expense': return `지출 ${formatCurrency(ev.amount)}`;
    case 'fixed': return `${ev.name || '고정지출'}${ev.checked ? ' ✓' : ' (예정)'}`;
    case 'quote': return `견적 ${ev.client || ev.title || ''}`;
    case 'issue': return `발행 ${ev.client || ''}`;
    case 'transaction': return `거래 ${ev.client || ''}`;
    default: return '';
  }
}

function evClass(ev) {
  const cat = CATEGORY[ev.type];
  if (cat === 'fixed') return ev.checked ? 'sch-ev fixed-done' : 'sch-ev fixed';
  return `sch-ev ${cat}`;
}

export default function SchedulePage({ onSelectQuote, onGoExpenses }) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(null);
  const [filters, setFilters] = useState({ income: true, expense: true, fixed: true, quote: true });

  // 상세 박스 높이를 왼쪽 달력 높이에 맞춤 (박스 안에서만 스크롤)
  const calRef = useRef(null);
  const detailRef = useRef(null);
  useEffect(() => {
    const calEl = calRef.current;
    if (!calEl) return;
    const apply = () => {
      if (!detailRef.current) return;
      if (window.innerWidth > 1024) detailRef.current.style.maxHeight = calEl.offsetHeight + 'px';
      else detailRef.current.style.maxHeight = '';
    };
    const ro = new ResizeObserver(apply);
    ro.observe(calEl);
    window.addEventListener('resize', apply);
    apply();
    return () => { ro.disconnect(); window.removeEventListener('resize', apply); };
  }, [loading]);

  useEffect(() => { loadData(); }, [year, month]);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await calendarAPI.get(year, month);
      setEvents(res.data.events || []);
    } catch (err) {
      console.error('일정 로드 실패:', err);
      setEvents([]);
    } finally {
      setLoading(false);
    }
  };

  const goPrev = () => { if (month === 1) { setYear(y => y - 1); setMonth(12); } else setMonth(m => m - 1); setSelectedDate(null); };
  const goNext = () => { if (month === 12) { setYear(y => y + 1); setMonth(1); } else setMonth(m => m + 1); setSelectedDate(null); };
  const goToday = () => { setYear(now.getFullYear()); setMonth(now.getMonth() + 1); setSelectedDate(todayStr()); };

  const visibleEvents = useMemo(
    () => events.filter(ev => filters[CATEGORY[ev.type]]),
    [events, filters]
  );

  // 날짜별 그룹
  const byDate = useMemo(() => {
    const m = {};
    visibleEvents.forEach(ev => { (m[ev.date] = m[ev.date] || []).push(ev); });
    return m;
  }, [visibleEvents]);

  // 월 요약 (필터 무관, 전체 기준)
  const summary = useMemo(() => {
    let incomePlanned = 0, incomeDone = 0, expenseActual = 0, fixedPendingCnt = 0, fixedPendingAmt = 0;
    events.forEach(ev => {
      if (ev.type === 'payment') { if (ev.status === '수금 완료') incomeDone += ev.amount; else incomePlanned += ev.amount; }
      else if (ev.type === 'expense') expenseActual += ev.amount;
      else if (ev.type === 'fixed' && !ev.checked) { fixedPendingCnt += 1; fixedPendingAmt += ev.amount; }
    });
    return { incomePlanned, incomeDone, expenseActual, fixedPendingCnt, fixedPendingAmt };
  }, [events]);

  // 달력 셀 구성
  const cells = useMemo(() => {
    const firstWeekday = new Date(year, month - 1, 1).getDay();
    const dim = new Date(year, month, 0).getDate();
    const arr = [];
    for (let i = 0; i < firstWeekday; i++) arr.push(null);
    for (let d = 1; d <= dim; d++) arr.push(`${year}-${pad2(month)}-${pad2(d)}`);
    while (arr.length % 7 !== 0) arr.push(null);
    return arr;
  }, [year, month]);

  const toggleFilter = (key) => setFilters(f => ({ ...f, [key]: !f[key] }));

  const today = todayStr();
  const selectedEvents = selectedDate ? (byDate[selectedDate] || []) : [];

  const FILTERS = [
    { key: 'income', label: '입금', cls: 'income' },
    { key: 'expense', label: '지출', cls: 'expense' },
    { key: 'fixed', label: '고정지출', cls: 'fixed' },
    { key: 'quote', label: '견적/발행', cls: 'quote' },
  ];

  return (
    <div className="schedule-page">
      <div className="page-header">
        <div className="page-title-area">
          <h2 className="page-title">일정 관리</h2>
          <p className="page-subtitle">입금·지출·고정지출·견적 일정을 한눈에</p>
        </div>
        <div className="sch-nav">
          <button onClick={goPrev} title="이전 달"><ChevronLeft size={18} /></button>
          <span className="sch-nav-label">{year}년 {month}월</span>
          <button onClick={goNext} title="다음 달"><ChevronRight size={18} /></button>
          <button className="sch-today-btn" onClick={goToday}>오늘</button>
        </div>
      </div>

      {/* 월 요약 */}
      <div className="sch-summary">
        <div className="sch-sum-card income">
          <TrendingUp size={18} />
          <div><span className="sch-sum-label">입금 예정</span><span className="sch-sum-val">₩{formatCurrency(summary.incomePlanned)}</span></div>
        </div>
        <div className="sch-sum-card income-done">
          <TrendingUp size={18} />
          <div><span className="sch-sum-label">입금 완료</span><span className="sch-sum-val">₩{formatCurrency(summary.incomeDone)}</span></div>
        </div>
        <div className="sch-sum-card expense">
          <TrendingDown size={18} />
          <div><span className="sch-sum-label">실지출</span><span className="sch-sum-val">₩{formatCurrency(summary.expenseActual)}</span></div>
        </div>
        <div className="sch-sum-card fixed">
          <Repeat size={18} />
          <div><span className="sch-sum-label">고정지출 미납 {summary.fixedPendingCnt}건</span><span className="sch-sum-val">₩{formatCurrency(summary.fixedPendingAmt)}</span></div>
        </div>
      </div>

      {/* 필터 */}
      <div className="sch-filters">
        {FILTERS.map(f => (
          <button
            key={f.key}
            className={`sch-filter-chip ${f.cls} ${filters[f.key] ? 'on' : 'off'}`}
            onClick={() => toggleFilter(f.key)}
          >
            <span className="sch-dot" /> {f.label}
          </button>
        ))}
      </div>

      <div className="sch-layout">
        {/* 달력 */}
        <div className="sch-cal-card" ref={calRef}>
          {loading ? (
            <div className="loading-area small"><Loader2 className="spin" size={24} /><p>불러오는 중...</p></div>
          ) : (
            <>
              <div className="sch-weekdays">
                {WEEKDAYS.map((w, i) => (
                  <div key={w} className={`sch-weekday${i === 0 ? ' sun' : ''}${i === 6 ? ' sat' : ''}`}>{w}</div>
                ))}
              </div>
              <div className="sch-grid">
                {cells.map((date, i) => {
                  if (!date) return <div key={`e${i}`} className="sch-cell empty" />;
                  const dayEvents = byDate[date] || [];
                  const dayNum = Number(date.slice(8, 10));
                  const wd = i % 7;
                  return (
                    <div
                      key={date}
                      className={`sch-cell${date === today ? ' today' : ''}${date === selectedDate ? ' selected' : ''}`}
                      onClick={() => setSelectedDate(date)}
                    >
                      <div className={`sch-cell-day${wd === 0 ? ' sun' : ''}${wd === 6 ? ' sat' : ''}`}>{dayNum}</div>
                      <div className="sch-cell-events">
                        {dayEvents.slice(0, 3).map((ev, j) => (
                          <div key={j} className={evClass(ev)} title={chipLabel(ev)}>{chipLabel(ev)}</div>
                        ))}
                        {dayEvents.length > 3 && <div className="sch-more">+{dayEvents.length - 3}개</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* 선택 날짜 상세 */}
        <div className="sch-detail-card" ref={detailRef}>
          {!selectedDate ? (
            <div className="sch-detail-empty">
              <CalendarDays size={40} strokeWidth={1} />
              <p>날짜를 선택하면<br />그날 일정이 표시됩니다.</p>
            </div>
          ) : (
            <>
              <h3 className="sch-detail-title">{selectedDate.replace(/-/g, '. ')}</h3>
              {selectedEvents.length === 0 ? (
                <p className="sch-detail-none">표시할 일정이 없습니다.</p>
              ) : (
                <div className="sch-detail-list">
                  {selectedEvents.map((ev, i) => (
                    <div key={i} className={`sch-detail-item ${CATEGORY[ev.type]}${ev.type === 'fixed' && ev.checked ? ' done' : ''}`}>
                      <div className="sch-di-icon">
                        {ev.type === 'payment' && <TrendingUp size={15} />}
                        {ev.type === 'expense' && <Receipt size={15} />}
                        {ev.type === 'fixed' && <Repeat size={15} />}
                        {(ev.type === 'quote' || ev.type === 'issue' || ev.type === 'transaction') && <FileText size={15} />}
                      </div>
                      <div className="sch-di-body">
                        <div className="sch-di-top">
                          <span className="sch-di-label">
                            {ev.type === 'payment' && (ev.status === '수금 완료' ? '입금 완료' : '입금 예정')}
                            {ev.type === 'expense' && '지출'}
                            {ev.type === 'fixed' && '고정지출'}
                            {ev.type === 'quote' && '견적일'}
                            {ev.type === 'issue' && '발행'}
                            {ev.type === 'transaction' && '거래일'}
                          </span>
                          {(ev.amount > 0) && <span className="sch-di-amount">₩{formatCurrency(ev.amount)}</span>}
                        </div>
                        <div className="sch-di-desc">
                          {ev.type === 'expense' ? `${ev.reason}${ev.description ? ' · ' + ev.description : ''}` : null}
                          {ev.type === 'fixed' ? `${ev.name}${ev.vendor ? ' · ' + ev.vendor : ''}${ev.description ? ' · ' + ev.description : ''}` : null}
                          {(ev.type === 'quote' || ev.type === 'payment' || ev.type === 'issue' || ev.type === 'transaction') ? `${ev.client || ''}${ev.title ? ' · ' + ev.title : ''}` : null}
                        </div>
                        <div className="sch-di-actions">
                          {ev.quoteId && (
                            <button className="sch-di-link" onClick={() => onSelectQuote?.(ev.quoteId)}>
                              <ExternalLink size={13} /> 견적 보기
                            </button>
                          )}
                          {ev.type === 'fixed' && !ev.checked && (
                            <button className="sch-di-link" onClick={() => onGoExpenses?.()}>
                              <Receipt size={13} /> 지출 등록하러 가기
                            </button>
                          )}
                          {ev.type === 'fixed' && ev.checked && <span className="sch-di-badge done">납부 완료</span>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
