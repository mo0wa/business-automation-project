import { useState, useEffect } from 'react';
import { adminAPI } from '../services/api';
import { toast } from '../services/toast';
import { Database, RefreshCw, HardDrive, Table2, Loader2 } from 'lucide-react';

function formatBytes(b) {
  if (!b) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let n = b;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i += 1; }
  return `${n.toFixed(n >= 100 || i === 0 ? 0 : 1)} ${u[i]}`;
}

export default function DbStatus() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const res = await adminAPI.getDbStats();
      setData(res.data);
    } catch (err) {
      toast.error(err.response?.data?.error || 'DB 사용량을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const pct = data ? Math.min(100, (data.db_bytes / data.limit_bytes) * 100) : 0;
  const pctLabel = pct < 0.1 && pct > 0 ? '0.1' : pct.toFixed(1);
  const totalRows = data ? data.tables.reduce((s, t) => s + (t.rows || 0), 0) : 0;
  const barColor = pct >= 90 ? '#ef4444' : pct >= 70 ? '#f59e0b' : '#22c55e';

  return (
    <div className="dbstatus-page">
      <div className="dbstatus-head">
        <h2><Database size={22} /> DB 사용량</h2>
        <button className="btn-ghost dbstatus-refresh" onClick={load} disabled={loading}>
          {loading ? <Loader2 size={16} className="spin" /> : <RefreshCw size={16} />} 새로고침
        </button>
      </div>

      {loading && !data ? (
        <div className="dbstatus-loading"><Loader2 size={28} className="spin" /> 불러오는 중...</div>
      ) : data ? (
        <>
          {/* 용량 요약 카드 */}
          <div className="dbstatus-card">
            <div className="dbstatus-card-top">
              <span className="dbstatus-card-label"><HardDrive size={16} /> 저장 용량 (Neon)</span>
              <span className="dbstatus-card-pct" style={{ color: barColor }}>{pctLabel}%</span>
            </div>
            <div className="dbstatus-bar">
              <div className="dbstatus-bar-fill" style={{ width: `${Math.max(pct, 0.5)}%`, background: barColor }} />
            </div>
            <div className="dbstatus-card-sub">
              <strong>{formatBytes(data.db_bytes)}</strong> / {formatBytes(data.limit_bytes)} 사용
              <span className="dbstatus-card-hint">무료 한도 약 0.5GB 기준</span>
            </div>
          </div>

          {/* 요약 숫자 */}
          <div className="dbstatus-summary">
            <div className="dbstatus-stat">
              <span className="dbstatus-stat-num">{data.tables.length}</span>
              <span className="dbstatus-stat-label">테이블</span>
            </div>
            <div className="dbstatus-stat">
              <span className="dbstatus-stat-num">{totalRows.toLocaleString()}</span>
              <span className="dbstatus-stat-label">총 행(레코드)</span>
            </div>
            <div className="dbstatus-stat">
              <span className="dbstatus-stat-num">{formatBytes(data.db_bytes)}</span>
              <span className="dbstatus-stat-label">총 용량</span>
            </div>
          </div>

          {/* 테이블별 상세 */}
          <div className="dbstatus-table-wrap">
            <div className="dbstatus-table-title"><Table2 size={16} /> 테이블별 사용량</div>
            <table className="dbstatus-table">
              <thead>
                <tr>
                  <th>테이블</th>
                  <th className="num">행 수</th>
                  <th className="num">크기</th>
                  <th className="num">인덱스</th>
                </tr>
              </thead>
              <tbody>
                {data.tables.map((t) => (
                  <tr key={t.name}>
                    <td className="mono">{t.name}</td>
                    <td className="num">{(t.rows || 0).toLocaleString()}</td>
                    <td className="num">{formatBytes(t.total_bytes)}</td>
                    <td className="num dim">{formatBytes(t.index_bytes)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="dbstatus-foot">
            기준 시각: {new Date(data.generated_at).toLocaleString('ko-KR')}
          </div>
        </>
      ) : (
        <div className="dbstatus-loading">데이터가 없습니다.</div>
      )}
    </div>
  );
}
