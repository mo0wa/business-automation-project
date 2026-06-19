import { useState, useEffect } from 'react';
import { subscribeConfirm, resolveConfirm } from '../services/confirm';
import { AlertTriangle } from 'lucide-react';

export default function ConfirmDialog() {
  const [req, setReq] = useState(null);
  useEffect(() => subscribeConfirm(setReq), []);

  useEffect(() => {
    if (!req) return;
    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); resolveConfirm(false); }
      else if (e.key === 'Enter') { e.stopPropagation(); resolveConfirm(true); }
    };
    // 캡처 단계에서 먼저 처리해 다른 전역 키 핸들러보다 우선
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [req]);

  if (!req) return null;
  const o = req.opts || {};

  return (
    <div className="confirm-overlay" onClick={() => resolveConfirm(false)}>
      <div className="confirm-box" onClick={(e) => e.stopPropagation()}>
        <div className={`confirm-head${o.danger ? ' danger' : ''}`}>
          <AlertTriangle size={20} />
          <h3>{o.title || '확인'}</h3>
        </div>
        <p className="confirm-msg">{o.message}</p>
        <div className="confirm-actions">
          <button className="btn-ghost" onClick={() => resolveConfirm(false)}>
            {o.cancelText || '취소'}
          </button>
          <button
            className={o.danger ? 'btn-danger-solid' : 'btn-primary'}
            onClick={() => resolveConfirm(true)}
            autoFocus
          >
            {o.confirmText || '확인'}
          </button>
        </div>
      </div>
    </div>
  );
}
