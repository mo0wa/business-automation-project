import { useState, useEffect, useRef } from 'react';
import { revenueAPI } from '../services/api';
import { formatCurrency } from '../utils/documentUtils';
import { downloadXLSX } from '../utils/excel';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, ResponsiveContainer, ComposedChart, Area
} from 'recharts';
import {
  TrendingUp, TrendingDown, DollarSign, Receipt,
  ArrowUpRight, ArrowDownRight, Loader2, ChevronLeft, ChevronRight, BarChart3,
  X, FileText, ExternalLink, Download
} from 'lucide-react';

const CHART_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];
const MONTHS = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'];

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload) return null;
  return (
    <div className="chart-tooltip">
      <p className="tooltip-label">{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }}>
          {p.name}: ₩{formatCurrency(p.value)}
        </p>
      ))}
    </div>
  );
};

// 자동 줄바꿈 + 높이 자동 증가 비고 입력칸 (uncontrolled, blur 시 저장)
function NoteCell({ initialValue, onSave }) {
  const ref = useRef(null);
  const resize = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  };
  useEffect(() => { resize(); }, []);
  return (
    <textarea
      ref={ref}
      className="revenue-note-input"
      defaultValue={initialValue}
      rows={1}
      placeholder="비고 입력..."
      onInput={resize}
      onClick={(e) => e.stopPropagation()}
      onBlur={(e) => onSave(e.target.value)}
    />
  );
}

export default function RevenueLedger({ onSelectQuote }) {
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState(new Date().getFullYear());
  const [monthlyData, setMonthlyData] = useState([]);
  const [prevYearData, setPrevYearData] = useState([]);
  const [summary, setSummary] = useState({});
  const [prevSummary, setPrevSummary] = useState({});
  const [viewMode, setViewMode] = useState('monthly'); // monthly | yearly | compare
  const [selectedMonth, setSelectedMonth] = useState(null); // 선택된 월 (1-12)
  const [monthQuotes, setMonthQuotes] = useState([]);
  const [monthExpenses, setMonthExpenses] = useState([]);
  const [monthQuotesLoading, setMonthQuotesLoading] = useState(false);
  const [selectedQuarter, setSelectedQuarter] = useState(null); // 선택된 분기 (1-4)
  const [quarterQuotes, setQuarterQuotes] = useState([]);
  const [quarterExpenses, setQuarterExpenses] = useState([]);
  const [quarterLoading, setQuarterLoading] = useState(false);
  const [notes, setNotes] = useState({});       // { [month]: note }
  const [notesVersion, setNotesVersion] = useState(0); // 비고 로드 시 입력칸 리마운트용

  useEffect(() => { loadData(); }, [year]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [monthlyRes, summaryRes, prevMonthlyRes, prevSummaryRes, notesRes] = await Promise.all([
        revenueAPI.getMonthly(year),
        revenueAPI.getSummary(year),
        revenueAPI.getMonthly(year - 1),
        revenueAPI.getSummary(year - 1),
        revenueAPI.getNotes(year),
      ]);
      setMonthlyData(monthlyRes.data.monthly || []);
      setSummary(summaryRes.data || {});
      setPrevYearData(prevMonthlyRes.data.monthly || []);
      setPrevSummary(prevSummaryRes.data || {});
      const noteMap = {};
      (notesRes.data || []).forEach(n => { noteMap[n.month] = n.note || ''; });
      setNotes(noteMap);
      setNotesVersion(v => v + 1);
    } catch (err) {
      console.error('매출 데이터 로드 실패:', err);
    } finally {
      setLoading(false);
    }
  };

  // CSV 내보내기 (현재 보기 기준)
  const handleExportCSV = () => {
    if (viewMode === 'yearly') {
      const headers = ['분기', '매출', '지출', '순이익', '순이익률(%)', '건수'];
      const rows = quarterData.map((q, i) => {
        const margin = q.매출 > 0 ? Math.round((q.순이익 / q.매출) * 100) : 0;
        const cnt = monthlyData.slice(i * 3, i * 3 + 3).reduce((s, m) => s + (m.quote_count || 0), 0);
        return [q.name, Math.round(q.매출), Math.round(q.지출), Math.round(q.순이익), margin, cnt];
      });
      const totRev = quarterData.reduce((s, q) => s + q.매출, 0);
      const totExp = quarterData.reduce((s, q) => s + q.지출, 0);
      const totProfit = quarterData.reduce((s, q) => s + q.순이익, 0);
      const totCnt = monthlyData.reduce((s, m) => s + (m.quote_count || 0), 0);
      rows.push(['합계', Math.round(totRev), Math.round(totExp), Math.round(totProfit), totRev > 0 ? Math.round((totProfit / totRev) * 100) : 0, totCnt]);
      downloadXLSX(`매출장부_${year}년_분기별`, `${year}년 분기별`, headers, rows, { numberCols: [1, 2, 3] });
      return;
    }
    const isCompare = viewMode === 'compare';
    const headers = ['월', '매출', '지출', '순이익', '순이익률(%)', '건수', ...(isCompare ? ['전년매출', '증감율(%)'] : []), '비고'];
    const rows = monthlyData.map((m, i) => {
      const prev = prevYearData[i]?.revenue || 0;
      const growth = prev > 0 ? (((m.revenue - prev) / prev) * 100).toFixed(1) : '';
      const margin = m.revenue > 0 ? Math.round(((m.profit || 0) / m.revenue) * 100) : 0;
      return [MONTHS[i], Math.round(m.revenue || 0), Math.round(m.expense || 0), Math.round(m.profit || 0), margin, m.quote_count || 0,
        ...(isCompare ? [Math.round(prev), growth] : []), notes[i + 1] || ''];
    });
    const totRev = monthlyData.reduce((s, m) => s + (m.revenue || 0), 0);
    const totExp = monthlyData.reduce((s, m) => s + (m.expense || 0), 0);
    const totProfit = monthlyData.reduce((s, m) => s + (m.profit || 0), 0);
    const totCnt = monthlyData.reduce((s, m) => s + (m.quote_count || 0), 0);
    const totPrev = prevYearData.reduce((s, m) => s + (m.revenue || 0), 0);
    const n = monthlyData.filter(m => (m.revenue || 0) > 0 || (m.expense || 0) > 0 || (m.quote_count || 0) > 0).length || 1;
    rows.push(['합계', Math.round(totRev), Math.round(totExp), Math.round(totProfit), totRev > 0 ? Math.round((totProfit / totRev) * 100) : 0, totCnt, ...(isCompare ? [Math.round(totPrev), ''] : []), '']);
    rows.push(['평균', Math.round(totRev / n), Math.round(totExp / n), Math.round(totProfit / n), totRev > 0 ? Math.round((totProfit / totRev) * 100) : 0, Number((totCnt / n).toFixed(1)), ...(isCompare ? ['', ''] : []), '']);
    const numberCols = isCompare ? [1, 2, 3, 6] : [1, 2, 3];
    downloadXLSX(`매출장부_${year}년${isCompare ? '_전년비교' : ''}`, `${year}년 월별`, headers, rows, { numberCols });
  };

  // 월별 비고 저장 (blur 시)
  const handleSaveNote = async (month, note) => {
    if ((notes[month] || '') === note) return; // 변경 없으면 skip
    setNotes(prev => ({ ...prev, [month]: note }));
    try {
      await revenueAPI.saveNote({ year, month, note });
    } catch (err) {
      console.error('비고 저장 실패:', err);
    }
  };

  // 차트 데이터 가공
  const chartData = monthlyData.map((m, i) => ({
    name: MONTHS[i],
    매출: m.revenue || 0,
    지출: m.expense || 0,
    순이익: m.profit || 0,
    전년매출: prevYearData[i]?.revenue || 0,
  }));

  // 분기별 데이터
  const quarterData = [1, 2, 3, 4].map(q => {
    const months = monthlyData.slice((q - 1) * 3, q * 3);
    return {
      name: `${q}분기`,
      매출: months.reduce((s, m) => s + (m.revenue || 0), 0),
      지출: months.reduce((s, m) => s + (m.expense || 0), 0),
      순이익: months.reduce((s, m) => s + (m.profit || 0), 0),
    };
  });

  // 전년 대비
  const totalRevenue = summary.total_revenue || 0;
  const prevTotalRevenue = prevSummary.total_revenue || 0;
  const revenueGrowth = prevTotalRevenue > 0 ? ((totalRevenue - prevTotalRevenue) / prevTotalRevenue * 100).toFixed(1) : 0;

  // 지출 비중 파이
  const totalExpense = summary.total_expense || 0;
  const pieData = [
    { name: '지출', value: totalExpense },
    { name: '순이익', value: Math.max(0, totalRevenue - totalExpense) },
  ].filter(d => d.value > 0);

  const openMonthDetail = async (monthIndex) => {
    const month = monthIndex + 1;
    if (selectedMonth === month) {
      setSelectedMonth(null);
      setMonthQuotes([]);
      setMonthExpenses([]);
      return;
    }
    setSelectedMonth(month);
    setMonthQuotesLoading(true);
    try {
      const res = await revenueAPI.getMonthlyQuotes(year, month);
      setMonthQuotes(res.data.quotes || []);
      setMonthExpenses(res.data.expenses || []);
    } catch (err) {
      console.error('월별 견적 로드 실패:', err);
      setMonthQuotes([]);
      setMonthExpenses([]);
    } finally {
      setMonthQuotesLoading(false);
    }
  };

  const openQuarterDetail = async (quarterIndex) => {
    const q = quarterIndex + 1;
    if (selectedQuarter === q) {
      setSelectedQuarter(null);
      setQuarterQuotes([]);
      setQuarterExpenses([]);
      return;
    }
    setSelectedQuarter(q);
    setQuarterLoading(true);
    try {
      const months = [q * 3 - 2, q * 3 - 1, q * 3];
      const results = await Promise.all(months.map(m => revenueAPI.getMonthlyQuotes(year, m)));
      const allQuotes = results.flatMap(r => r.data.quotes || []);
      const allExpenses = results.flatMap(r => r.data.expenses || []);
      setQuarterQuotes(allQuotes);
      setQuarterExpenses(allExpenses);
    } catch (err) {
      console.error('분기별 견적 로드 실패:', err);
      setQuarterQuotes([]);
      setQuarterExpenses([]);
    } finally {
      setQuarterLoading(false);
    }
  };

  const renderDetailSections = (quotes, expenses) => (
    <>
      {/* ── 수금완료 견적서 섹션 ── */}
      <div className="mdp-section">
        <div className="mdp-section-title mdp-title-income">
          <span className="mdp-dot mdp-dot-income" />
          수금완료 견적서
          <span className="mdp-count">{quotes.length}건</span>
          <span className="mdp-total">
            ₩{formatCurrency(quotes.reduce((s, q) => s + (q.total_amount || 0), 0))}
          </span>
        </div>
        {quotes.length === 0 ? (
          <div className="mdp-empty">
            <FileText size={22} /><span>수금완료 견적서 없음</span>
          </div>
        ) : quotes.map((q) => (
          <div key={q.id} className="month-quote-card">
            <div className="mqc-top">
              <div className="mqc-title-area">
                <span className="mqc-title">{q.title || '(제목 없음)'}</span>
                <span className="mqc-client">{q.client_company || q.client_name}</span>
              </div>
              <div className="mqc-right">
                <span className="mqc-date">{q.payment_date || q.quote_date || q.created_at?.slice(0, 10) || '-'}</span>
                <span className="mqc-amount">₩{formatCurrency(q.total_amount)}</span>
                <button
                  className="mqc-goto-btn"
                  onClick={() => onSelectQuote?.(q.id)}
                  title="견적서 상세 보기"
                >
                  <ExternalLink size={13} /> 바로가기
                </button>
              </div>
            </div>
            {q.items && q.items.length > 0 && (
              <table className="mqc-items-table">
                <thead>
                  <tr>
                    <th>품명</th><th>규격</th><th>수량</th><th>단가</th><th>공급가</th><th>세액</th>
                  </tr>
                </thead>
                <tbody>
                  {q.items.map((item, idx) => (
                    <tr key={idx}>
                      <td>{item.product_name}</td>
                      <td className="mqc-sub">{item.specification || '-'}</td>
                      <td className="mqc-num">{item.quantity}</td>
                      <td className="mqc-num">₩{formatCurrency(item.unit_price)}</td>
                      <td className="mqc-num mqc-pos">₩{formatCurrency(item.supply_price)}</td>
                      <td className="mqc-num mqc-sub">₩{formatCurrency(item.tax)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={4} className="mqc-sub">합계</td>
                    <td className="mqc-num mqc-pos"><strong>₩{formatCurrency(q.supply_amount)}</strong></td>
                    <td className="mqc-num mqc-sub"><strong>₩{formatCurrency(q.tax_amount)}</strong></td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
        ))}
      </div>

      {/* ── 지출 내역 섹션 ── */}
      <div className="mdp-section">
        <div className="mdp-section-title mdp-title-expense">
          <span className="mdp-dot mdp-dot-expense" />
          지출 내역
          <span className="mdp-count">{expenses.length}건</span>
          <span className="mdp-total mdp-total-expense">
            ₩{formatCurrency(expenses.reduce((s, e) => s + (e.amount || 0), 0))}
          </span>
        </div>
        {expenses.length === 0 ? (
          <div className="mdp-empty">
            <FileText size={22} /><span>지출 내역 없음</span>
          </div>
        ) : (
          <table className="mqc-items-table">
            <thead>
              <tr><th>날짜</th><th>내용</th><th>비고</th><th>금액</th></tr>
            </thead>
            <tbody>
              {expenses.map((e) => (
                <tr key={e.id}>
                  <td className="mqc-sub">{e.expense_date}</td>
                  <td>{e.reason}</td>
                  <td className="mqc-sub">{e.notes || '-'}</td>
                  <td className="mqc-num mqc-neg">₩{formatCurrency(e.amount)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3} className="mqc-sub">합계</td>
                <td className="mqc-num mqc-neg">
                  <strong>₩{formatCurrency(expenses.reduce((s, e) => s + (e.amount || 0), 0))}</strong>
                </td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </>
  );

  const handleViewModeChange = (mode) => {
    setViewMode(mode);
    setSelectedMonth(null);
    setMonthQuotes([]);
    setMonthExpenses([]);
    setSelectedQuarter(null);
    setQuarterQuotes([]);
    setQuarterExpenses([]);
  };

  const STATUS_COLORS = {
    '임시저장': '#94a3b8',
    '작업 대기': '#f59e0b',
    '작업 중': '#3b82f6',
    '미수금': '#ef4444',
    '수금 완료': '#6366f1',
  };

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 5 }, (_, i) => currentYear - i);

  if (loading) return (
    <div className="loading-area"><Loader2 className="spin" size={32} /><p>데이터를 불러오는 중...</p></div>
  );

  return (
    <div className="revenue-page">
      <div className="page-header">
        <div className="page-title-area">
          <h2 className="page-title">매출 장부</h2>
          <p className="page-subtitle">{year}년 매출 분석</p>
        </div>
        <div className="year-nav">
          <button onClick={() => setYear(year - 1)}><ChevronLeft size={18} /></button>
          <select value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {years.map(y => <option key={y} value={y}>{y}년</option>)}
          </select>
          <button onClick={() => setYear(year + 1)} disabled={year >= currentYear}><ChevronRight size={18} /></button>
        </div>
      </div>

      {/* 뷰 모드 탭 */}
      <div className="view-tabs">
        <button className={viewMode === 'monthly' ? 'active' : ''} onClick={() => handleViewModeChange('monthly')}>월별</button>
        <button className={viewMode === 'yearly' ? 'active' : ''} onClick={() => handleViewModeChange('yearly')}>분기별</button>
        <button className={viewMode === 'compare' ? 'active' : ''} onClick={() => handleViewModeChange('compare')}>전년 비교</button>
      </div>

      {/* 요약 카드 */}
      <div className="summary-cards-grid">
        <div className="stat-card revenue">
          <div className="stat-icon"><DollarSign size={22} /></div>
          <div className="stat-info">
            <span className="stat-label">총 매출</span>
            <span className="stat-value">₩{formatCurrency(totalRevenue)}</span>
            <span className={`stat-change ${Number(revenueGrowth) >= 0 ? 'up' : 'down'}`}>
              {Number(revenueGrowth) >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
              전년 대비 {Math.abs(revenueGrowth)}%
            </span>
          </div>
        </div>
        <div className="stat-card expense">
          <div className="stat-icon"><Receipt size={22} /></div>
          <div className="stat-info">
            <span className="stat-label">총 지출</span>
            <span className="stat-value">₩{formatCurrency(totalExpense)}</span>
          </div>
        </div>
        <div className="stat-card profit">
          <div className="stat-icon">{(totalRevenue - totalExpense) >= 0 ? <TrendingUp size={22} /> : <TrendingDown size={22} />}</div>
          <div className="stat-info">
            <span className="stat-label">순이익</span>
            <span className="stat-value">₩{formatCurrency(totalRevenue - totalExpense)}</span>
          </div>
        </div>
        <div className="stat-card margin">
          <div className="stat-icon"><BarChart3 size={22} /></div>
          <div className="stat-info">
            <span className="stat-label">순이익률</span>
            <span className="stat-value">
              {totalRevenue > 0 ? Math.round(((totalRevenue - totalExpense) / totalRevenue) * 100) : 0}%
            </span>
            <span className="stat-sub">
              지출비율 {totalRevenue > 0 ? Math.round((totalExpense / totalRevenue) * 100) : 0}%
            </span>
          </div>
        </div>
        <div className="stat-card info">
          <div className="stat-icon"><BarChart3 size={22} /></div>
          <div className="stat-info">
            <span className="stat-label">견적 현황</span>
            <span className="stat-value">{summary.total_quotes || 0}건</span>
            <span className="stat-sub">수금완료 ₩{formatCurrency(summary.collected_amount || 0)} | 미수금 ₩{formatCurrency(summary.uncollected_amount || 0)}</span>
          </div>
        </div>
      </div>

      {/* 차트 영역 */}
      <div className="charts-grid">
        {/* 메인 차트 */}
        <div className="chart-card large">
          <h4>{viewMode === 'compare' ? `${year}년 vs ${year - 1}년 매출 비교` : viewMode === 'yearly' ? `${year}년 분기별 실적` : `${year}년 월별 매출/지출`}</h4>
          <ResponsiveContainer width="100%" height={350}>
            {viewMode === 'compare' ? (
              <ComposedChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${(v / 10000).toFixed(0)}만`} />
                <Tooltip content={<CustomTooltip />} />
                <Legend />
                <Bar dataKey="매출" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="전년매출" fill="#cbd5e1" radius={[4, 4, 0, 0]} />
                <Line type="monotone" dataKey="순이익" stroke="#10b981" strokeWidth={2} />
              </ComposedChart>
            ) : viewMode === 'yearly' ? (
              <BarChart data={quarterData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${(v / 10000).toFixed(0)}만`} />
                <Tooltip content={<CustomTooltip />} />
                <Legend />
                <Bar dataKey="매출" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="지출" fill="#ef4444" radius={[4, 4, 0, 0]} />
                <Bar dataKey="순이익" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            ) : (
              <ComposedChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${(v / 10000).toFixed(0)}만`} />
                <Tooltip content={<CustomTooltip />} />
                <Legend />
                <Area type="monotone" dataKey="매출" fill="#dbeafe" stroke="#3b82f6" strokeWidth={2} />
                <Bar dataKey="지출" fill="#fca5a5" radius={[4, 4, 0, 0]} />
                <Line type="monotone" dataKey="순이익" stroke="#10b981" strokeWidth={2} dot={{ r: 4 }} />
              </ComposedChart>
            )}
          </ResponsiveContainer>
        </div>

        {/* 파이 차트 */}
        <div className="chart-card">
          <h4>비용 구조</h4>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={100}
                paddingAngle={3}
                dataKey="value"
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
              >
                {pieData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i]} />)}
              </Pie>
              <Tooltip formatter={v => `₩${formatCurrency(v)}`} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 상세 테이블 */}
      <div className="detail-table-card">
        <div className="detail-table-head">
          <h4>{viewMode === 'yearly' ? '분기별 상세 내역' : '월별 상세 내역'}</h4>
          <button className="btn-outline btn-sm-export" onClick={handleExportCSV}>
            <Download size={15} /> 엑셀 내보내기
          </button>
        </div>

        {viewMode === 'yearly' ? (
          /* ── 분기별 테이블 ── */
          <table className="revenue-table">
            <thead>
              <tr>
                <th>분기</th>
                <th>매출</th>
                <th>지출</th>
                <th>순이익</th>
                <th>순이익률</th>
                <th>건수</th>
              </tr>
            </thead>
            <tbody>
              {quarterData.map((qd, i) => {
                const marginPct = qd.매출 > 0 ? Math.round((qd.순이익 / qd.매출) * 100) : 0;
                const isSelected = selectedQuarter === i + 1;
                return (
                  <>
                    <tr
                      key={i}
                      className={`month-row${isSelected ? ' month-row-selected' : ''}`}
                      onClick={() => openQuarterDetail(i)}
                      title={`${qd.name} 상세 보기`}
                    >
                      <td>
                        <span className="month-row-label">
                          {qd.name}
                          {isSelected ? <X size={13} /> : null}
                        </span>
                      </td>
                      <td className="positive">₩{formatCurrency(qd.매출)}</td>
                      <td className="negative">₩{formatCurrency(qd.지출)}</td>
                      <td className={qd.순이익 >= 0 ? 'positive' : 'negative'}>₩{formatCurrency(qd.순이익)}</td>
                      <td className={marginPct >= 0 ? 'positive' : 'negative'}>
                        <span className="margin-badge">{marginPct}%</span>
                      </td>
                      <td>{quarterQuotes.length > 0 && isSelected ? `${quarterQuotes.length}건` : '-'}</td>
                    </tr>
                    {isSelected && (
                      <tr key={`qdetail-${i}`} className="month-detail-row">
                        <td colSpan={6} style={{ padding: 0 }}>
                          <div className="month-detail-panel">
                            {quarterLoading ? (
                              <div className="month-detail-loading">
                                <Loader2 className="spin" size={20} />
                                <span>불러오는 중...</span>
                              </div>
                            ) : (
                              <div className="month-detail-columns">
                                {renderDetailSections(quarterQuotes, quarterExpenses)}
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
            <tfoot>
              {(() => {
                const totRev = quarterData.reduce((s, q) => s + q.매출, 0);
                const totExp = quarterData.reduce((s, q) => s + q.지출, 0);
                const totProfit = quarterData.reduce((s, q) => s + q.순이익, 0);
                const totMargin = totRev > 0 ? Math.round((totProfit / totRev) * 100) : 0;
                const totCount = monthlyData.reduce((s, m) => s + (m.quote_count || 0), 0);
                // 데이터(매출/지출)가 있는 분기만 평균 기준으로 집계
                const n = quarterData.filter(q => q.매출 > 0 || q.지출 > 0).length || 1;
                const avgRev = Math.round(totRev / n);
                const avgExp = Math.round(totExp / n);
                const avgProfit = Math.round(totProfit / n);
                const avgMargin = avgRev > 0 ? Math.round((avgProfit / avgRev) * 100) : 0;
                const avgCount = (totCount / n).toFixed(1);
                return (
                  <>
                    <tr>
                      <td><strong>합계</strong></td>
                      <td className="positive"><strong>₩{formatCurrency(totRev)}</strong></td>
                      <td className="negative"><strong>₩{formatCurrency(totExp)}</strong></td>
                      <td className={totProfit >= 0 ? 'positive' : 'negative'}><strong>₩{formatCurrency(totProfit)}</strong></td>
                      <td className={totMargin >= 0 ? 'positive' : 'negative'}><strong>{totMargin}%</strong></td>
                      <td><strong>{totCount}건</strong></td>
                    </tr>
                    <tr className="avg-row">
                      <td><strong>분기 평균</strong></td>
                      <td className="positive"><strong>₩{formatCurrency(avgRev)}</strong></td>
                      <td className="negative"><strong>₩{formatCurrency(avgExp)}</strong></td>
                      <td className={avgProfit >= 0 ? 'positive' : 'negative'}><strong>₩{formatCurrency(avgProfit)}</strong></td>
                      <td className={avgMargin >= 0 ? 'positive' : 'negative'}><strong>{avgMargin}%</strong></td>
                      <td><strong>{avgCount}건</strong></td>
                    </tr>
                  </>
                );
              })()}
            </tfoot>
          </table>
        ) : (
          /* ── 월별 테이블 ── */
          <table className="revenue-table">
            <thead>
              <tr>
                <th>월</th>
                <th>매출</th>
                <th>지출</th>
                <th>순이익</th>
                <th>순이익률</th>
                <th>건수</th>
                {viewMode === 'compare' && <th>전년 매출</th>}
                {viewMode === 'compare' && <th>증감율</th>}
                <th className="rt-note-col">비고</th>
              </tr>
            </thead>
            <tbody>
              {monthlyData.map((m, i) => {
                const prev = prevYearData[i]?.revenue || 0;
                const growth = prev > 0 ? (((m.revenue - prev) / prev) * 100).toFixed(1) : '-';
                const marginPct = m.revenue > 0 ? Math.round(((m.profit || 0) / m.revenue) * 100) : 0;
                const isSelected = selectedMonth === i + 1;
                return (
                  <>
                    <tr
                      key={i}
                      className={`month-row${isSelected ? ' month-row-selected' : ''}`}
                      onClick={() => openMonthDetail(i)}
                      title={`${MONTHS[i]} 견적서 상세 보기`}
                    >
                      <td>
                        <span className="month-row-label">
                          {MONTHS[i]}
                          {isSelected ? <X size={13} /> : null}
                        </span>
                      </td>
                      <td className="positive">₩{formatCurrency(m.revenue)}</td>
                      <td className="negative">₩{formatCurrency(m.expense || 0)}</td>
                      <td className={m.profit >= 0 ? 'positive' : 'negative'}>₩{formatCurrency(m.profit)}</td>
                      <td className={marginPct >= 0 ? 'positive' : 'negative'}>
                        <span className="margin-badge">{marginPct}%</span>
                      </td>
                      <td>{m.quote_count}건</td>
                      {viewMode === 'compare' && <td>₩{formatCurrency(prev)}</td>}
                      {viewMode === 'compare' && (
                        <td className={Number(growth) >= 0 ? 'positive' : 'negative'}>
                          {growth !== '-' ? `${growth}%` : '-'}
                        </td>
                      )}
                      <td className="rt-note-cell" onClick={(e) => e.stopPropagation()}>
                        <NoteCell
                          key={`note-${year}-${i + 1}-${notesVersion}`}
                          initialValue={notes[i + 1] || ''}
                          onSave={(val) => handleSaveNote(i + 1, val)}
                        />
                      </td>
                    </tr>
                    {isSelected && (
                      <tr key={`detail-${i}`} className="month-detail-row">
                        <td colSpan={viewMode === 'compare' ? 9 : 7} style={{ padding: 0 }}>
                          <div className="month-detail-panel">
                            {monthQuotesLoading ? (
                              <div className="month-detail-loading">
                                <Loader2 className="spin" size={20} />
                                <span>불러오는 중...</span>
                              </div>
                            ) : (
                              <div className="month-detail-columns">
                                {renderDetailSections(monthQuotes, monthExpenses)}
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
            <tfoot>
              {(() => {
                const totRev = monthlyData.reduce((s, m) => s + (m.revenue || 0), 0);
                const totExp = monthlyData.reduce((s, m) => s + (m.expense || 0), 0);
                const totProfit = monthlyData.reduce((s, m) => s + (m.profit || 0), 0);
                const totMargin = totRev > 0 ? Math.round((totProfit / totRev) * 100) : 0;
                const totCount = monthlyData.reduce((s, m) => s + (m.quote_count || 0), 0);
                const totPrev = prevYearData.reduce((s, m) => s + (m.revenue || 0), 0);
                // 데이터(매출/지출/건수)가 있는 달만 평균 기준으로 집계
                const n = monthlyData.filter(m => (m.revenue || 0) > 0 || (m.expense || 0) > 0 || (m.quote_count || 0) > 0).length || 1;
                const nPrev = prevYearData.filter(m => (m.revenue || 0) > 0).length || 1;
                const avgRev = Math.round(totRev / n);
                const avgExp = Math.round(totExp / n);
                const avgProfit = Math.round(totProfit / n);
                const avgMargin = avgRev > 0 ? Math.round((avgProfit / avgRev) * 100) : 0;
                const avgCount = (totCount / n).toFixed(1);
                const avgPrev = Math.round(totPrev / nPrev);
                return (
                  <>
                    <tr>
                      <td><strong>합계</strong></td>
                      <td className="positive"><strong>₩{formatCurrency(totRev)}</strong></td>
                      <td className="negative"><strong>₩{formatCurrency(totExp)}</strong></td>
                      <td className={totProfit >= 0 ? 'positive' : 'negative'}><strong>₩{formatCurrency(totProfit)}</strong></td>
                      <td className={totMargin >= 0 ? 'positive' : 'negative'}><strong>{totMargin}%</strong></td>
                      <td><strong>{totCount}건</strong></td>
                      {viewMode === 'compare' && <td><strong>₩{formatCurrency(totPrev)}</strong></td>}
                      {viewMode === 'compare' && <td><strong>{revenueGrowth}%</strong></td>}
                      <td className="rt-note-cell"></td>
                    </tr>
                    <tr className="avg-row">
                      <td><strong>월 평균</strong></td>
                      <td className="positive"><strong>₩{formatCurrency(avgRev)}</strong></td>
                      <td className="negative"><strong>₩{formatCurrency(avgExp)}</strong></td>
                      <td className={avgProfit >= 0 ? 'positive' : 'negative'}><strong>₩{formatCurrency(avgProfit)}</strong></td>
                      <td className={avgMargin >= 0 ? 'positive' : 'negative'}><strong>{avgMargin}%</strong></td>
                      <td><strong>{avgCount}건</strong></td>
                      {viewMode === 'compare' && <td><strong>₩{formatCurrency(avgPrev)}</strong></td>}
                      {viewMode === 'compare' && <td><strong>-</strong></td>}
                      <td className="rt-note-cell"></td>
                    </tr>
                  </>
                );
              })()}
            </tfoot>
          </table>
        )}
      </div>
    </div>
  );
}
