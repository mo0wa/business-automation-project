import { useState, useEffect, createContext, useContext } from 'react';
import LoginPage from './components/LoginPage';
import QuoteList from './components/QuoteList';
import QuoteDetail from './components/QuoteDetail';
import ExpenseManager from './components/ExpenseManager';
import RevenueLedger from './components/RevenueLedger';
import AdminSettings from './components/AdminSettings';
import TrashList from './components/TrashList';
import SchedulePage from './components/SchedulePage';
import ChangePasswordModal from './components/ChangePasswordModal';
import DbStatus from './components/DbStatus';
import { settingsAPI, authAPI } from './services/api';
import { FileText, Receipt, BookOpen, Settings, LogOut, ChevronRight, User, Trash2, CalendarDays, KeyRound, Database } from 'lucide-react';

// 인증 Context
export const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

// 설정 Context
export const SettingsContext = createContext(null);
export const useSettings = () => useContext(SettingsContext);

const NAV_ITEMS = [
  { key: 'quotes', label: '견적 리스트', icon: FileText, roles: ['admin', 'employee'] },
  { key: 'schedule', label: '일정 관리', icon: CalendarDays, roles: ['admin'] },
  { key: 'trash', label: '휴지통', icon: Trash2, roles: ['admin', 'employee'] },
  { key: 'expenses', label: '지출 등록', icon: Receipt, roles: ['admin'] },
  { key: 'revenue', label: '매출 장부', icon: BookOpen, roles: ['admin'] },
  { key: 'admin', label: '관리자 화면', icon: Settings, roles: ['admin'] },
  { key: 'dbstatus', label: 'DB 사용량', icon: Database, roles: ['admin'] },
];

// 데모 실행 여부 (vite define) — 데모면 로고를 데모용으로 표시
const IS_DEMO = (typeof __IS_DEMO__ !== 'undefined') ? __IS_DEMO__ : false;
const LOGO_TEXT = IS_DEMO ? '데모상사' : '디자인신세계';

export default function App() {
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('bp_user');
    return saved ? JSON.parse(saved) : null;
  });
  const [currentPage, setCurrentPage] = useState('quotes');
  const [selectedQuoteId, setSelectedQuoteId] = useState(null);
  const [companySettings, setCompanySettings] = useState({});
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [quoteListState, setQuoteListState] = useState({
    searchTerm: '',
    statusFilter: '전체',
    sortOrder: 'latest',
    groupByMonth: true,
    selectedYear: new Date().getFullYear(),
    selectedMonth: new Date().getMonth() + 1,
  });
  const [copyData, setCopyData] = useState(null);
  const [detailKey, setDetailKey] = useState(0);
  const [previousPage, setPreviousPage] = useState('quotes');
  const [showPwModal, setShowPwModal] = useState(false);

  useEffect(() => {
    document.title = IS_DEMO ? '데모상사 - 견적 시스템 (DEMO)' : '디자인신세계 - 견적 시스템';
    if (IS_DEMO) {
      const link = document.querySelector("link[rel='icon']");
      if (link) link.href = '/favicon-demo.svg';
    }
  }, []);

  useEffect(() => {
    if (user) {
      settingsAPI.get().then(res => setCompanySettings(res.data)).catch(() => {});
    }
  }, [user]);

  const handleLogin = (userData, token) => {
    if (token) localStorage.setItem('bp_token', token);
    setUser(userData);
    localStorage.setItem('bp_user', JSON.stringify(userData));
  };

  const handleLogout = () => {
    authAPI.logout().catch(() => {});
    setUser(null);
    localStorage.removeItem('bp_user');
    localStorage.removeItem('bp_token');
    setCurrentPage('quotes');
    setSelectedQuoteId(null);
  };

  const navigateTo = (page, quoteId = null) => {
    if (page === 'quoteDetail') {
      setPreviousPage(currentPage);
    }
    setCurrentPage(page);
    setSelectedQuoteId(quoteId);
  };

  const handleCopyQuote = (quote, items) => {
    setCopyData({ quote: { ...quote, title: (quote.title || '') + ' - 복사본' }, items });
    setCurrentPage('quoteDetail');
    setSelectedQuoteId(null);
    setDetailKey(k => k + 1);
  };

  if (!user) return <LoginPage onLogin={handleLogin} />;

  const accessibleNav = NAV_ITEMS.filter(item => item.roles.includes(user.role));

  const renderPage = () => {
    if (currentPage === 'quoteDetail') {
      return <QuoteDetail key={selectedQuoteId ?? `new-${detailKey}`} quoteId={selectedQuoteId} onBack={() => navigateTo(previousPage)} backLabel={previousPage === 'revenue' ? '매출 장부' : '목록으로'} userId={user.id} initialData={copyData} onInitialDataConsumed={() => setCopyData(null)} onCopyQuote={handleCopyQuote} />;
    }
    switch (currentPage) {
      case 'quotes':
        return <QuoteList onSelectQuote={(id) => navigateTo('quoteDetail', id)} savedState={quoteListState} onStateChange={setQuoteListState} onCopyQuote={handleCopyQuote} />;
      case 'expenses':
        return user.role === 'admin' ? <ExpenseManager userId={user.id} /> : null;
      case 'revenue':
        return user.role === 'admin' ? <RevenueLedger onSelectQuote={(id) => navigateTo('quoteDetail', id)} /> : null;
      case 'schedule':
        return user.role === 'admin' ? <SchedulePage onSelectQuote={(id) => navigateTo('quoteDetail', id)} onGoExpenses={() => navigateTo('expenses')} /> : null;
      case 'admin':
        return user.role === 'admin' ? <AdminSettings settings={companySettings} onUpdate={setCompanySettings} /> : null;
      case 'dbstatus':
        return user.role === 'admin' ? <DbStatus /> : null;
      case 'trash':
        return <TrashList />;
      default:
        return <QuoteList onSelectQuote={(id) => navigateTo('quoteDetail', id)} savedState={quoteListState} onStateChange={setQuoteListState} onCopyQuote={handleCopyQuote} />;
    }
  };

  return (
    <AuthContext.Provider value={{ user }}>
      <SettingsContext.Provider value={{ settings: companySettings, setSettings: setCompanySettings }}>
        <div className="app-layout">
          {/* 사이드바 */}
          <aside className={`sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}>
            <div className="sidebar-header">
              <div className="logo-area">
                {!sidebarCollapsed && (
                  <h1 className="logo-text">
                    {LOGO_TEXT}
                    {IS_DEMO && <span className="logo-demo-badge">DEMO</span>}
                  </h1>
                )}
                <button className="collapse-btn" onClick={() => setSidebarCollapsed(!sidebarCollapsed)}>
                  <ChevronRight style={{ transform: sidebarCollapsed ? 'rotate(0deg)' : 'rotate(180deg)' }} />
                </button>
              </div>
            </div>

            <nav className="sidebar-nav">
              {accessibleNav.map(item => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.key}
                    className={`nav-item ${currentPage === item.key ? 'active' : ''}`}
                    onClick={() => navigateTo(item.key)}
                    title={item.label}
                  >
                    <Icon size={20} />
                    {!sidebarCollapsed && <span>{item.label}</span>}
                  </button>
                );
              })}
            </nav>

            <div className="sidebar-footer">
              <div className="user-info" title={`${user.name} (${user.role === 'admin' ? '관리자' : '직원'})`}>
                <div className="user-avatar">
                  <User size={16} />
                </div>
                {!sidebarCollapsed && (
                  <div className="user-detail">
                    <span className="user-name">{user.name}</span>
                    <span className="user-role">{user.role === 'admin' ? '관리자' : '직원'}</span>
                  </div>
                )}
              </div>
              <button className="logout-btn" onClick={() => setShowPwModal(true)} title="비밀번호 변경">
                <KeyRound size={18} />
                {!sidebarCollapsed && <span>비밀번호 변경</span>}
              </button>
              <button className="logout-btn" onClick={handleLogout} title="로그아웃">
                <LogOut size={18} />
                {!sidebarCollapsed && <span>로그아웃</span>}
              </button>
            </div>
          </aside>

          {/* 메인 컨텐츠 */}
          <main className="main-content">
            {renderPage()}
          </main>
        </div>
        {showPwModal && <ChangePasswordModal onClose={() => setShowPwModal(false)} />}
      </SettingsContext.Provider>
    </AuthContext.Provider>
  );
}
