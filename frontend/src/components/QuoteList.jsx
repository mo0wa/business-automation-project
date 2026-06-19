import { useState, useEffect, useCallback, useRef } from 'react';
import { quoteAPI, settingsAPI, trashAPI } from '../services/api';
import { toast } from '../services/toast';
import { generateQuoteHTML, printDocument, formatCurrency, formatDate } from '../utils/documentUtils';
import {
  Plus, Search, Filter, FileText, Printer, Image, Download,
  MoreVertical, Clock, CheckCircle, AlertTriangle, XCircle,
  Banknote, PauseCircle, Loader2, ChevronDown, Trash2, Edit2,
  ArrowUpDown, CalendarDays, Copy, X
} from 'lucide-react';

const STATUS_CONFIG = {
  '임시저장': { color: '#94a3b8', bg: '#f1f5f9', icon: Clock, label: '임시저장' },
  '작업 대기': { color: '#f59e0b', bg: '#fffbeb', icon: PauseCircle, label: '작업 대기' },
  '작업 중': { color: '#3b82f6', bg: '#eff6ff', icon: Loader2, label: '작업 중' },
  '작업 요청 X': { color: '#ef4444', bg: '#fef2f2', icon: XCircle, label: '작업 요청 X' },
  '미수금': { color: '#f97316', bg: '#fff7ed', icon: AlertTriangle, label: '미입금' },
  '수금 완료': { color: '#059669', bg: '#d1fae5', icon: Banknote, label: '입금완료' },
};

const ALL_STATUSES = ['전체', ...Object.keys(STATUS_CONFIG)];

const SORT_OPTIONS = [
  { value: 'latest', label: '최신 기준' },
  { value: 'oldest', label: '오래된 기준' },
  { value: 'abc', label: '가나다 기준' },
  { value: 'amount_desc', label: '금액 높은순' },
];

export default function QuoteList({ onSelectQuote, savedState, onStateChange, onCopyQuote }) {
  const [quotes, setQuotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState(savedState?.searchTerm ?? '');
  const [statusFilter, setStatusFilter] = useState(savedState?.statusFilter ?? '전체');
  const [showStatusFilter, setShowStatusFilter] = useState(false);
  const [activeMenu, setActiveMenu] = useState(null);
  const [activeStatusMenu, setActiveStatusMenu] = useState(null);
  const [settings, setSettings] = useState({});
  const [sortOrder, setSortOrder] = useState(savedState?.sortOrder ?? 'latest');
  const [groupByMonth, setGroupByMonth] = useState(savedState?.groupByMonth ?? true);
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [selectedYear, setSelectedYear] = useState(savedState?.selectedYear ?? new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(savedState?.selectedMonth ?? new Date().getMonth() + 1);
  const [dateFrom, setDateFrom] = useState(savedState?.dateFrom ?? '');
  const [dateTo, setDateTo] = useState(savedState?.dateTo ?? '');
  // 검색은 입력값(searchTerm)과 실제 조회값(debouncedSearch)을 분리해 디바운스
  const [debouncedSearch, setDebouncedSearch] = useState(savedState?.searchTerm ?? '');
  const [visibleCount, setVisibleCount] = useState(40); // 전체보기 무한스크롤용

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchTerm), 300);
    return () => clearTimeout(t);
  }, [searchTerm]);

  // 목록 범위가 바뀌면 무한스크롤 노출 개수 초기화
  useEffect(() => {
    setVisibleCount(40);
  }, [debouncedSearch, statusFilter, sortOrder, dateFrom, dateTo, groupByMonth]);

  // 마지막 스크롤 위치 / 최근 본 견적 보관
  const scrollRef = useRef(savedState?.scrollY || 0);
  const lastViewedRef = useRef(savedState?.lastViewedId ?? null);
  // 이 마운트에서 복원할 값(최초 1회 캡처) — 중간 저장에 영향받지 않도록 고정
  const initRef = useRef({ scrollY: savedState?.scrollY || 0, lastViewedId: savedState?.lastViewedId ?? null });
  const [highlightId, setHighlightId] = useState(null); // 목록 복귀 시 강조
  const buildState = () => ({ searchTerm, statusFilter, sortOrder, groupByMonth, selectedYear, selectedMonth, dateFrom, dateTo, scrollY: scrollRef.current, lastViewedId: lastViewedRef.current });

  // 필터/정렬/스크롤 위치를 부모에 저장 (목록 복귀용)
  useEffect(() => {
    onStateChange?.(buildState());
  }, [searchTerm, statusFilter, sortOrder, groupByMonth, selectedYear, selectedMonth, dateFrom, dateTo]);

  // 스크롤하는 동안 마지막 위치를 계속 기록 (언마운트 시점엔 DOM이 바뀌어 window.scrollY가 잘리므로 미리 저장)
  useEffect(() => {
    const onScroll = () => { scrollRef.current = window.scrollY; };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // 상세로 이동 직전 현재 스크롤 위치 저장
  const saveScroll = () => {
    scrollRef.current = window.scrollY;
    onStateChange?.(buildState());
  };

  // 다른 페이지로 이동(언마운트)할 때도 마지막 스크롤 위치 저장 → 매출장부·지출 등 다녀와도 유지
  // (주의: 여기서 window.scrollY를 다시 읽지 않음 — 이미 화면이 바뀌어 0으로 잘릴 수 있음)
  const buildStateRef = useRef();
  buildStateRef.current = buildState;
  useEffect(() => {
    return () => { onStateChange?.(buildStateRef.current()); };
  }, []);

  const sentinelRef = useRef(null);

  // 목록 복귀 시 저장된 스크롤 위치로 복원 + 최근 본 견적 강조 (데이터 로드 완료 후 1회)
  const didRestore = useRef(false);
  useEffect(() => {
    if (didRestore.current || loading) return;
    didRestore.current = true;
    const { scrollY, lastViewedId } = initRef.current;
    if (scrollY > 0) requestAnimationFrame(() => requestAnimationFrame(() => window.scrollTo(0, scrollY)));
    if (lastViewedId) {
      setHighlightId(lastViewedId);
      lastViewedRef.current = null; // 강조는 견적 본 직후 1회만 (다른 페이지 다녀온 경우 재강조 방지)
      setTimeout(() => setHighlightId(null), 2600);
    }
  }, [loading]);

  const loadQuotes = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (debouncedSearch) params.search = debouncedSearch;
      const res = await quoteAPI.getAll(params);
      setQuotes(res.data);
    } catch (err) {
      console.error('견적 로드 실패:', err);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch]);

  useEffect(() => { loadQuotes(); }, [loadQuotes]);
  useEffect(() => {
    settingsAPI.get().then(res => setSettings(res.data)).catch(() => {});
  }, []);

  // 신규 견적서 — 저장 전까지 DB에 생성하지 않음
  const handleNewQuote = () => {
    saveScroll();
    onSelectQuote(null);
  };

  // 완료 체크 토글
  const handleToggleComplete = async (e, quote) => {
    e.stopPropagation();
    const newVal = quote.is_completed ? 0 : 1;
    try {
      await quoteAPI.toggleComplete(quote.id, newVal);
      setQuotes(prev => prev.map(q => q.id === quote.id ? { ...q, is_completed: newVal } : q));
    } catch (err) {
      toast.error('완료 상태 변경 실패');
    }
  };

  // 상태 변경
  const handleStatusChange = async (e, quoteId, newStatus) => {
    e.stopPropagation();
    try {
      await quoteAPI.updateStatus(quoteId, newStatus);
      setQuotes(prev => prev.map(q => q.id === quoteId ? { ...q, status: newStatus } : q));
      setActiveStatusMenu(null);
    } catch (err) {
      toast.error('상태 변경 실패');
    }
  };

  // 견적서 복사
  const handleCopy = async (e, quote) => {
    e.stopPropagation();
    setActiveMenu(null);
    try {
      saveScroll();
      const res = await quoteAPI.getById(quote.id);
      onCopyQuote?.(res.data, res.data.items || []);
    } catch (err) {
      toast.error('복사 실패');
    }
  };

  // 견적서 삭제 — 즉시 휴지통으로 이동 + 실행취소(복원) 토스트
  const handleDelete = async (e, quote) => {
    e.stopPropagation();
    setActiveMenu(null);
    try {
      await quoteAPI.delete(quote.id);
      setQuotes(prev => prev.filter(q => q.id !== quote.id)); // 낙관적 제거
      toast.success(`"${quote.title || '제목 없음'}" 삭제됨`, {
        duration: 6000,
        action: {
          label: '실행취소',
          onClick: async () => {
            try {
              await trashAPI.restore(quote.id);
              await loadQuotes();
              toast.info('복원되었습니다.');
            } catch (err) {
              toast.error('복원 실패: ' + (err.response?.data?.error || err.message));
            }
          },
        },
      });
    } catch (err) {
      toast.error('삭제 실패: ' + (err.response?.data?.error || err.message));
    }
  };

  // 견적서/거래명세서 출력
  const handlePrint = async (e, quote, type) => {
    e.stopPropagation();
    setActiveMenu(null);
    try {
      const detail = await quoteAPI.getById(quote.id);
      const html = generateQuoteHTML(detail.data, detail.data.items, settings, type);
      printDocument(html);
    } catch (err) {
      toast.error('문서 생성 실패');
    }
  };

  // JPG 저장
  const handleSaveImage = async (e, quote, type = 'quote') => {
    e.stopPropagation();
    setActiveMenu(null);
    const docLabel = type === 'transaction' ? '거래명세서' : '견적서';
    try {
      const detail = await quoteAPI.getById(quote.id);
      const html = generateQuoteHTML(detail.data, detail.data.items, settings, type);

      const container = document.createElement('div');
      container.innerHTML = html;
      container.style.cssText = 'position:absolute;left:-9999px;top:0;';
      document.body.appendChild(container);

      const { default: html2canvas } = await import('html2canvas');
      const canvas = await html2canvas(container.querySelector('.page'), {
        scale: 2, useCORS: true, backgroundColor: '#fff'
      });
      const today = new Date();
      const dateStr = `${today.getFullYear()}${String(today.getMonth()+1).padStart(2,'0')}${String(today.getDate()).padStart(2,'0')}`;
      const company = (detail.data.client_company || detail.data.client_name || '').replace(/\s/g, '');
      const firstProduct = (detail.data.items?.[0]?.product_name || '').replace(/\s/g, '');
      const fileName = [docLabel, company, firstProduct, dateStr].filter(Boolean).join('_');
      const link = document.createElement('a');
      link.download = `${fileName}.jpg`;
      link.href = canvas.toDataURL('image/jpeg', 0.95);
      link.click();
      document.body.removeChild(container);
      toast.success(`${docLabel} 이미지를 저장했습니다.`);
    } catch (err) {
      toast.error('이미지 저장에 실패했습니다.');
    }
  };

  // ── 정렬 로직 ──
  const getSortedQuotes = (list) => {
    const sorted = [...list];
    switch (sortOrder) {
      case 'latest':
        sorted.sort((a, b) => {
          const da = a.quote_date ? new Date(a.quote_date) : new Date(0);
          const db = b.quote_date ? new Date(b.quote_date) : new Date(0);
          return db - da;
        });
        break;
      case 'oldest':
        sorted.sort((a, b) => {
          const da = a.quote_date ? new Date(a.quote_date) : new Date(0);
          const db = b.quote_date ? new Date(b.quote_date) : new Date(0);
          return da - db;
        });
        break;
      case 'abc':
        sorted.sort((a, b) => {
          const na = a.client_company || a.client_name || a.title || '';
          const nb = b.client_company || b.client_name || b.title || '';
          return na.localeCompare(nb, 'ko');
        });
        break;
      case 'amount_desc':
        sorted.sort((a, b) => (Number(b.total_amount) || 0) - (Number(a.total_amount) || 0));
        break;
      default:
        break;
    }
    return sorted;
  };

  // ── 월별 그룹핑 로직 ──
  const getGroupedQuotes = (sortedList) => {
    if (!groupByMonth) return [{ label: null, quotes: sortedList }];

    const groupMap = new Map();
    sortedList.forEach(q => {
      let key, label;
      if (q.quote_date) {
        const d = new Date(q.quote_date);
        key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        label = `${d.getFullYear()}년 ${d.getMonth() + 1}월`;
      } else {
        key = '0000-00';
        label = '날짜 미정';
      }
      if (!groupMap.has(key)) groupMap.set(key, { label, quotes: [] });
      groupMap.get(key).quotes.push(q);
    });

    // 그룹 순서 정렬 (오름차순이면 오래된 월 먼저, 나머지는 최신 월 먼저)
    const entries = [...groupMap.entries()];
    entries.sort(([a], [b]) => {
      if (a === '0000-00') return 1;
      if (b === '0000-00') return -1;
      return sortOrder === 'oldest' ? a.localeCompare(b) : b.localeCompare(a);
    });

    return entries.map(([, group]) => group);
  };

  // 상태 필터는 클라이언트 사이드에서 적용
  const statusFilteredQuotes = statusFilter === '전체'
    ? quotes
    : quotes.filter(q => q.status === statusFilter);

  const sortedQuotes = getSortedQuotes(statusFilteredQuotes);

  // 월별 보기: 선택된 연/월 견적만 필터 (상태 필터 적용 후)
  const filterByMonth = (list) => list.filter(q => {
    if (!q.quote_date) return false;
    const d = new Date(q.quote_date);
    return d.getFullYear() === selectedYear && d.getMonth() + 1 === selectedMonth;
  });

  // 기간(from~to) 필터: 견적일 기준, 둘 중 하나만 있어도 적용
  const rangeActive = !!(dateFrom || dateTo);
  const filterByDateRange = (list) => {
    if (!rangeActive) return list;
    return list.filter(q => {
      if (!q.quote_date) return false;
      const d = String(q.quote_date).slice(0, 10);
      if (dateFrom && d < dateFrom) return false;
      if (dateTo && d > dateTo) return false;
      return true;
    });
  };

  const monthFilteredQuotes = groupByMonth ? filterByMonth(sortedQuotes) : sortedQuotes;

  // 카운트 기준: 상태 필터 미적용. 기간 활성 시 기간 우선, 아니면 월별/전체
  const baseForCounts = rangeActive ? filterByDateRange(quotes) : (groupByMonth ? filterByMonth(quotes) : quotes);
  const statusCounts = {};
  ALL_STATUSES.forEach(s => { statusCounts[s] = s === '전체' ? baseForCounts.length : 0; });
  baseForCounts.forEach(q => { if (statusCounts[q.status] !== undefined) statusCounts[q.status]++; });

  // 헤더 총 건수
  const totalCount = baseForCounts.length;

  // 그룹 보기 데이터: 기간 활성 시 기간 필터 결과를 월별 그룹으로 (전체 목록)
  const renderBase = rangeActive ? filterByDateRange(sortedQuotes) : sortedQuotes;
  // 무한 스크롤: 화면에는 visibleCount개까지만 렌더 (성능)
  const groupedQuotes = getGroupedQuotes(renderBase.slice(0, visibleCount));
  const hasMore = renderBase.length > visibleCount;
  const rangeResultCount = renderBase.length;

  // 무한 스크롤: 바닥 근처(sentinel)가 보이면 더 불러오기
  useEffect(() => {
    if (!hasMore) return;
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) setVisibleCount((c) => c + 40);
    }, { rootMargin: '300px' });
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, renderBase.length]);

  // 하단 합계: 현재 화면 범위(전체)의 작업중·미입금·입금완료 합산
  const displayedQuotes = (groupByMonth && !rangeActive)
    ? monthFilteredQuotes
    : renderBase;
  const SUMMARY_STATUSES = ['작업 중', '미수금', '수금 완료'];
  const summaryByStatus = SUMMARY_STATUSES.map(st => {
    const list = displayedQuotes.filter(q => q.status === st);
    return {
      status: st,
      label: STATUS_CONFIG[st].label,
      color: STATUS_CONFIG[st].color,
      total: list.reduce((s, q) => s + (Number(q.total_amount) || 0), 0),
      count: list.length,
    };
  });
  const summaryTotal = summaryByStatus.reduce((s, x) => s + x.total, 0);
  const summaryCount = summaryByStatus.reduce((s, x) => s + x.count, 0);

  // 연도 옵션 (quotes에 있는 연도 + 현재 연도)
  const yearOptions = [...new Set([
    new Date().getFullYear(),
    ...quotes.map(q => q.quote_date ? new Date(q.quote_date).getFullYear() : null).filter(Boolean)
  ])].sort((a, b) => b - a);

  const currentSortLabel = SORT_OPTIONS.find(s => s.value === sortOrder)?.label || '정렬';

  return (
    <div className="quote-list-page">
      {/* 상단 헤더 */}
      <div className="page-header">
        <div className="page-title-area">
          <h2 className="page-title">견적 리스트</h2>
          <p className="page-subtitle">총 {totalCount}건의 견적</p>
        </div>
        <button className="btn-primary" onClick={handleNewQuote}>
          <Plus size={18} />
          <span>새 견적서</span>
        </button>
      </div>

      {/* 필터/검색 바 */}
      <div className="filter-bar">
        <div className="search-box">
          <Search size={18} />
          <input
            type="text"
            placeholder="고객명, 제목, 회사명, 품명, 메모, 금액 검색..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="status-filter-wrap">
          <button
            className="filter-btn"
            onClick={() => setShowStatusFilter(!showStatusFilter)}
          >
            <Filter size={16} />
            <span>{statusFilter}</span>
            <ChevronDown size={14} />
          </button>
          {showStatusFilter && (
            <div className="status-dropdown">
              {ALL_STATUSES.map(status => (
                <button
                  key={status}
                  className={`status-option ${statusFilter === status ? 'active' : ''}`}
                  onClick={() => { setStatusFilter(status); setShowStatusFilter(false); }}
                >
                  <span>{status}</span>
                  <span className="status-count">{statusCounts[status] || 0}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 상태 요약 탭 */}
      <div className="status-tabs">
        {ALL_STATUSES.map(status => {
          const config = STATUS_CONFIG[status];
          return (
            <button
              key={status}
              className={`status-tab ${statusFilter === status ? 'active' : ''}`}
              onClick={() => setStatusFilter(status)}
              style={statusFilter === status && config ? { borderColor: config.color, color: config.color } : {}}
            >
              <span>{config ? config.label : status}</span>
              <span className="tab-count">{statusCounts[status] || 0}</span>
            </button>
          );
        })}
      </div>

      {/* 정렬 + 월별 보기 컨트롤 바 */}
      {!loading && quotes.length > 0 && (
        <div className="sort-bar">
          <div className="sort-control-wrap">
            <button
              className="sort-btn"
              onClick={() => setShowSortMenu(!showSortMenu)}
            >
              <ArrowUpDown size={14} />
              <span>{currentSortLabel}</span>
              <ChevronDown size={12} />
            </button>
            {showSortMenu && (
              <div className="sort-dropdown">
                {SORT_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    className={`sort-option-item ${sortOrder === opt.value ? 'active' : ''}`}
                    onClick={() => { setSortOrder(opt.value); setShowSortMenu(false); }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            className={`group-month-btn ${groupByMonth ? 'active' : ''}`}
            onClick={() => setGroupByMonth(!groupByMonth)}
          >
            <CalendarDays size={14} />
            <span>월별 보기</span>
          </button>

          {/* 기간(from~to) 필터 */}
          <div className={`date-range-control ${rangeActive ? 'active' : ''}`}>
            <CalendarDays size={14} />
            <input
              type="date"
              className="range-date-input"
              value={dateFrom}
              max={dateTo || undefined}
              onChange={(e) => setDateFrom(e.target.value)}
            />
            <span className="range-sep">~</span>
            <input
              type="date"
              className="range-date-input"
              value={dateTo}
              min={dateFrom || undefined}
              onChange={(e) => setDateTo(e.target.value)}
            />
            {rangeActive && (
              <>
                <span className="range-count">{rangeResultCount}건</span>
                <button className="range-clear-btn" onClick={() => { setDateFrom(''); setDateTo(''); }} title="기간 해제">
                  <X size={13} />
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* 월별 보기 연/월 선택기 (기간 필터 활성 시 숨김) */}
      {!loading && groupByMonth && !rangeActive && (
        <div className="month-selector-bar">
          <select
            className="month-year-select"
            value={selectedYear}
            onChange={e => setSelectedYear(Number(e.target.value))}
          >
            {yearOptions.map(y => <option key={y} value={y}>{y}년</option>)}
          </select>
          <select
            className="month-year-select"
            value={selectedMonth}
            onChange={e => setSelectedMonth(Number(e.target.value))}
          >
            {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
              <option key={m} value={m}>{m}월</option>
            ))}
          </select>
          <span className="month-selector-count">{selectedYear}년 {selectedMonth}월 · {monthFilteredQuotes.length}건</span>
        </div>
      )}

      {/* 카드 리스트 */}
      {loading ? (
        <div className="quote-list-wrap">
          <div className="quote-cards-list">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="quote-card skeleton-card">
                <div className="sk-box" style={{ width: 18, height: 18, borderRadius: 4 }} />
                <div className="sk-box" style={{ width: 72, height: 22, borderRadius: 11 }} />
                <div className="sk-col" style={{ flex: '0 0 260px' }}>
                  <div className="sk-box" style={{ width: '70%', height: 14 }} />
                  <div className="sk-box" style={{ width: '45%', height: 12, marginTop: 8 }} />
                </div>
                <div className="sk-box" style={{ flex: 1, height: 30 }} />
                <div className="sk-col" style={{ minWidth: 100, alignItems: 'flex-end' }}>
                  <div className="sk-box" style={{ width: 80, height: 16 }} />
                  <div className="sk-box" style={{ width: 56, height: 12, marginTop: 8 }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : quotes.length === 0 ? (
        <div className="empty-area">
          <FileText size={48} />
          {debouncedSearch ? (
            <>
              <p>'{debouncedSearch}'에 대한 검색 결과가 없습니다.</p>
              <button className="btn-outline" onClick={() => setSearchTerm('')}>검색 초기화</button>
            </>
          ) : (
            <>
              <p>견적서가 없습니다.</p>
              <button className="btn-primary" onClick={handleNewQuote}>
                <Plus size={18} />
                <span>첫 견적서 만들기</span>
              </button>
            </>
          )}
        </div>
      ) : (
        <div className="quote-list-wrap">
          {groupByMonth && !rangeActive ? (
            /* 월별 보기: 선택된 달만 표시 */
            <div className="month-group">
              {monthFilteredQuotes.length === 0 ? (
                <div className="empty-area" style={{ padding: '40px 0' }}>
                  <CalendarDays size={36} style={{ opacity: 0.3 }} />
                  <p style={{ marginTop: 8, color: 'var(--text-secondary)' }}>해당 월에 견적서가 없습니다.</p>
                </div>
              ) : (
                <div className="quote-cards-list">
                  {monthFilteredQuotes.map(quote => {
                    const config = STATUS_CONFIG[quote.status] || STATUS_CONFIG['임시저장'];
                    const StatusIcon = config.icon;
                    return (
                      <div
                        key={quote.id}
                        className={`quote-card${quote.is_completed ? ' quote-card-completed' : ''}${(activeMenu === quote.id || activeStatusMenu === quote.id) ? ' menu-open' : ''}${highlightId === quote.id ? ' quote-card-recent' : ''}`}
                        onClick={() => { lastViewedRef.current = quote.id; saveScroll(); onSelectQuote(quote.id); }}
                      >
                        {/* 완료 체크박스 */}
                        <div className="card-complete-wrap" onClick={(e) => handleToggleComplete(e, quote)}>
                          <input
                            type="checkbox"
                            className="card-complete-checkbox"
                            checked={!!quote.is_completed}
                            onChange={() => {}}
                          />
                        </div>
                        {/* 상태 뱃지 + 상태 변경 버튼 */}
                        <div className="card-status-wrap">
                          <div className="card-status" style={{ background: config.bg, color: config.color }}>
                            <StatusIcon size={13} />
                            <span>{config.label}</span>
                          </div>
                          <button
                            className="card-status-edit-btn"
                            onClick={(e) => { e.stopPropagation(); setActiveStatusMenu(activeStatusMenu === quote.id ? null : quote.id); setActiveMenu(null); }}
                          >
                            <Edit2 size={11} />
                          </button>
                          {activeStatusMenu === quote.id && (
                            <div className="card-status-dropdown">
                              {Object.entries(STATUS_CONFIG).map(([status, sc]) => (
                                <button
                                  key={status}
                                  className={`status-option-btn${quote.status === status ? ' active' : ''}`}
                                  style={quote.status === status ? { background: sc.bg, color: sc.color } : {}}
                                  onClick={(e) => handleStatusChange(e, quote.id, status)}
                                >
                                  <sc.icon size={12} />
                                  <span>{sc.label}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* 카드 정보 영역 (제목 + 거래처) */}
                        <div className="card-info">
                          <span className="info-label">제목</span>
                          <h3 className="card-title">{quote.title || '제목 없음'}</h3>
                          <span className="info-label">거래처</span>
                          <p className="card-client">
                            {quote.client_company && <span className="client-company">{quote.client_company}</span>}
                            {quote.client_name && <span className="client-name">{quote.client_name}</span>}
                          </p>
                        </div>

                        {/* 품목 미리보기 영역 */}
                        <div className="card-items-preview">
                          {quote.item_preview ? (
                            <>
                              {quote.item_preview.split('<||>').map((itemStr, i) => {
                                const [productName, spec, qty] = itemStr.split('<|>');
                                return (
                                  <span key={i} className="card-item-chip">
                                    <span className="chip-name">{productName}</span>
                                    {spec && spec.trim() && <span className="chip-spec">{spec}</span>}
                                    {qty && qty !== '0' && <span className="chip-qty">×{qty}</span>}
                                  </span>
                                );
                              })}
                              {quote.item_count > 5 && (
                                <span className="card-item-chip card-item-more">+{quote.item_count - 5}개 더</span>
                              )}
                            </>
                          ) : (
                            <span className="card-items-empty">품목 없음</span>
                          )}
                        </div>

                        {/* 결제방법 영역 */}
                        {(quote.cash_payment || quote.card_payment) ? (
                          <div className="card-side-section">
                            <div className="card-payment-tags">
                              {!!quote.cash_payment && <span className="payment-tag payment-tag-cash">현금결제</span>}
                              {!!quote.card_payment && <span className="payment-tag payment-tag-card">카드결제</span>}
                            </div>
                            {quote.payment_date && <span className="card-info-date">{quote.payment_date}</span>}
                          </div>
                        ) : null}

                        {/* 발행 영역 */}
                        {(quote.electronic_tax_invoice || quote.cash_receipt) ? (
                          <div className="card-side-section">
                            <div className="card-payment-tags">
                              {!!quote.electronic_tax_invoice && <span className="payment-tag payment-tag-tax">전자세금계산서</span>}
                              {!!quote.cash_receipt && <span className="payment-tag payment-tag-receipt">현금영수증</span>}
                            </div>
                            {quote.issue_date && <span className="card-info-date">{quote.issue_date}</span>}
                          </div>
                        ) : null}

                        {/* 우측 총금액 */}
                        <div className="card-meta">
                          <span className="amount-value">₩{formatCurrency(quote.total_amount)}</span>
                          <span className="card-date">{quote.quote_date ? formatDate(quote.quote_date) : '날짜 없음'}</span>
                        </div>

                        {/* 메뉴 버튼 */}
                        <button
                          className="card-menu-btn"
                          onClick={(e) => { e.stopPropagation(); setActiveMenu(activeMenu === quote.id ? null : quote.id); setActiveStatusMenu(null); }}
                        >
                          <MoreVertical size={16} />
                        </button>

                        {/* 드롭다운 메뉴 */}
                        {activeMenu === quote.id && (
                          <div className="card-dropdown">
                            <button onClick={(e) => handleCopy(e, quote)}>
                              <Copy size={14} /> 견적서 복사
                            </button>
                            <div className="card-dropdown-divider" />
                            <button onClick={(e) => handlePrint(e, quote, 'quote')}>
                              <Printer size={14} /> 견적서 인쇄
                            </button>
                            <button onClick={(e) => handlePrint(e, quote, 'transaction')}>
                              <FileText size={14} /> 거래명세서 인쇄
                            </button>
                            <button onClick={(e) => handleSaveImage(e, quote, 'quote')}>
                              <Image size={14} /> 견적서 JPG 저장
                            </button>
                            <button onClick={(e) => handleSaveImage(e, quote, 'transaction')}>
                              <Image size={14} /> 거래명세서 JPG 저장
                            </button>
                            <button onClick={(e) => handlePrint(e, quote, 'quote')}>
                              <Download size={14} /> PDF 저장
                            </button>
                            <div className="card-dropdown-divider" />
                            <button className="card-dropdown-delete" onClick={(e) => handleDelete(e, quote)}>
                              <Trash2 size={14} /> 삭제
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : groupedQuotes.length === 0 ? (
            <div className="empty-area" style={{ padding: '40px 0' }}>
              <CalendarDays size={36} style={{ opacity: 0.3 }} />
              <p style={{ marginTop: 8, color: 'var(--text-secondary)' }}>
                {rangeActive ? '해당 기간에 견적서가 없습니다.' : '견적서가 없습니다.'}
              </p>
            </div>
          ) : (
          /* 전체 보기: 기존 그룹핑 */
          groupedQuotes.map((group) => (
            <div key={group.label || 'all'} className="month-group">
              {group.label && (
                <div className="month-group-header">
                  <span className="month-label">{group.label}</span>
                  <span className="month-count">{group.quotes.length}건</span>
                </div>
              )}
              <div className="quote-cards-list">
                {group.quotes.map(quote => {
                  const config = STATUS_CONFIG[quote.status] || STATUS_CONFIG['임시저장'];
                  const StatusIcon = config.icon;
                  return (
                    <div
                      key={quote.id}
                      className={`quote-card${quote.is_completed ? ' quote-card-completed' : ''}${(activeMenu === quote.id || activeStatusMenu === quote.id) ? ' menu-open' : ''}`}
                      onClick={() => onSelectQuote(quote.id)}
                    >
                      {/* 완료 체크박스 */}
                      <div className="card-complete-wrap" onClick={(e) => handleToggleComplete(e, quote)}>
                        <input
                          type="checkbox"
                          className="card-complete-checkbox"
                          checked={!!quote.is_completed}
                          onChange={() => {}}
                        />
                      </div>
                      {/* 상태 뱃지 + 상태 변경 버튼 */}
                      <div className="card-status-wrap">
                        <div className="card-status" style={{ background: config.bg, color: config.color }}>
                          <StatusIcon size={13} />
                          <span>{config.label}</span>
                        </div>
                        <button
                          className="card-status-edit-btn"
                          onClick={(e) => { e.stopPropagation(); setActiveStatusMenu(activeStatusMenu === quote.id ? null : quote.id); setActiveMenu(null); }}
                        >
                          <Edit2 size={11} />
                        </button>
                        {activeStatusMenu === quote.id && (
                          <div className="card-status-dropdown">
                            {Object.entries(STATUS_CONFIG).map(([status, sc]) => (
                              <button
                                key={status}
                                className={`status-option-btn${quote.status === status ? ' active' : ''}`}
                                style={quote.status === status ? { background: sc.bg, color: sc.color } : {}}
                                onClick={(e) => handleStatusChange(e, quote.id, status)}
                              >
                                <sc.icon size={12} />
                                <span>{sc.label}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* 카드 정보 영역 (제목 + 거래처) */}
                      <div className="card-info">
                        <span className="info-label">제목</span>
                        <h3 className="card-title">{quote.title || '제목 없음'}</h3>
                        <span className="info-label">거래처</span>
                        <p className="card-client">
                          {quote.client_company && <span className="client-company">{quote.client_company}</span>}
                          {quote.client_name && <span className="client-name">{quote.client_name}</span>}
                        </p>
                      </div>

                      {/* 품목 미리보기 영역 */}
                      <div className="card-items-preview">
                        {quote.item_preview ? (
                          <>
                            {quote.item_preview.split('<||>').map((itemStr, i) => {
                              const [productName, spec, qty] = itemStr.split('<|>');
                              return (
                                <span key={i} className="card-item-chip">
                                  <span className="chip-name">{productName}</span>
                                  {spec && spec.trim() && <span className="chip-spec">{spec}</span>}
                                  {qty && qty !== '0' && <span className="chip-qty">×{qty}</span>}
                                </span>
                              );
                            })}
                            {quote.item_count > 5 && (
                              <span className="card-item-chip card-item-more">+{quote.item_count - 5}개 더</span>
                            )}
                          </>
                        ) : (
                          <span className="card-items-empty">품목 없음</span>
                        )}
                      </div>

                      {/* 결제방법 영역 */}
                      {(quote.cash_payment || quote.card_payment) ? (
                        <div className="card-side-section">
                          <div className="card-payment-tags">
                            {!!quote.cash_payment && <span className="payment-tag payment-tag-cash">현금결제</span>}
                            {!!quote.card_payment && <span className="payment-tag payment-tag-card">카드결제</span>}
                          </div>
                          {quote.payment_date && <span className="card-info-date">{quote.payment_date}</span>}
                        </div>
                      ) : null}

                      {/* 발행 영역 */}
                      {(quote.electronic_tax_invoice || quote.cash_receipt) ? (
                        <div className="card-side-section">
                          <div className="card-payment-tags">
                            {!!quote.electronic_tax_invoice && <span className="payment-tag payment-tag-tax">전자세금계산서</span>}
                            {!!quote.cash_receipt && <span className="payment-tag payment-tag-receipt">현금영수증</span>}
                          </div>
                          {quote.issue_date && <span className="card-info-date">{quote.issue_date}</span>}
                        </div>
                      ) : null}

                      {/* 우측 총금액 */}
                      <div className="card-meta">
                        <span className="amount-value">₩{formatCurrency(quote.total_amount)}</span>
                        <span className="card-date">{quote.quote_date ? formatDate(quote.quote_date) : '날짜 없음'}</span>
                      </div>

                      {/* 메뉴 버튼 */}
                      <button
                        className="card-menu-btn"
                        onClick={(e) => { e.stopPropagation(); setActiveMenu(activeMenu === quote.id ? null : quote.id); setActiveStatusMenu(null); }}
                      >
                        <MoreVertical size={16} />
                      </button>

                      {/* 드롭다운 메뉴 */}
                      {activeMenu === quote.id && (
                        <div className="card-dropdown">
                          <button onClick={(e) => handleCopy(e, quote)}>
                            <Copy size={14} /> 견적서 복사
                          </button>
                          <div className="card-dropdown-divider" />
                          <button onClick={(e) => handlePrint(e, quote, 'quote')}>
                            <Printer size={14} /> 견적서 인쇄
                          </button>
                          <button onClick={(e) => handlePrint(e, quote, 'transaction')}>
                            <FileText size={14} /> 거래명세서 인쇄
                          </button>
                          <button onClick={(e) => handleSaveImage(e, quote, 'quote')}>
                            <Image size={14} /> 견적서 JPG 저장
                          </button>
                          <button onClick={(e) => handleSaveImage(e, quote, 'transaction')}>
                            <Image size={14} /> 거래명세서 JPG 저장
                          </button>
                          <button onClick={(e) => handlePrint(e, quote, 'quote')}>
                            <Download size={14} /> PDF 저장
                          </button>
                          <div className="card-dropdown-divider" />
                          <button className="card-dropdown-delete" onClick={(e) => handleDelete(e, quote)}>
                            <Trash2 size={14} /> 삭제
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )))}

          {/* 무한 스크롤 감지 지점 + 더 불러오는 중 표시 (전체/기간 보기에서만) */}
          {!(groupByMonth && !rangeActive) && hasMore && (
            <div ref={sentinelRef} className="infinite-sentinel">
              <Loader2 className="spin" size={20} />
              <span>더 불러오는 중...</span>
            </div>
          )}

          {/* 하단 합계 (작업중·미입금·입금완료) */}
          {displayedQuotes.length > 0 && (
            <div className="list-total-summary">
              <div className="lts-breakdown">
                {summaryByStatus.map(x => (
                  <div key={x.status} className="lts-item">
                    <span className="lts-label" style={{ color: x.color }}>{x.label}</span>
                    <span className="lts-count">{x.count}건</span>
                    <span className="lts-amount">₩{formatCurrency(x.total)}</span>
                  </div>
                ))}
              </div>
              <div className="lts-total">
                <span className="lts-total-label">합계 ({summaryCount}건)</span>
                <span className="lts-total-amount">₩{formatCurrency(summaryTotal)}</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 클릭 외부 영역 닫기 */}
      {(activeMenu || showStatusFilter || activeStatusMenu || showSortMenu) && (
        <div className="overlay-close" onClick={() => {
          setActiveMenu(null);
          setShowStatusFilter(false);
          setActiveStatusMenu(null);
          setShowSortMenu(false);
        }} />
      )}
    </div>
  );
}