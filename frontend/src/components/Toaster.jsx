import { useState, useEffect } from 'react';
import { subscribeToasts, dismissToast } from '../services/toast';
import { CheckCircle, AlertCircle, Info, X, RotateCcw } from 'lucide-react';

const ICONS = { success: CheckCircle, error: AlertCircle, info: Info };

export default function Toaster() {
  const [items, setItems] = useState([]);
  useEffect(() => subscribeToasts(setItems), []);

  return (
    <div className="toast-container">
      {items.map((t) => {
        const Icon = ICONS[t.type] || Info;
        return (
          <div key={t.id} className={`toast toast-${t.type}`}>
            <Icon size={18} className="toast-icon" />
            <span className="toast-msg">{t.message}</span>
            {t.action && (
              <button
                className="toast-action"
                onClick={() => { t.action.onClick?.(); dismissToast(t.id); }}
              >
                <RotateCcw size={13} /> {t.action.label}
              </button>
            )}
            <button className="toast-close" onClick={() => dismissToast(t.id)} title="닫기">
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
