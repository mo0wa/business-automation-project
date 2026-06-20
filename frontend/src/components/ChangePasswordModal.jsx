import { useState } from 'react';
import { authAPI } from '../services/api';
import { toast } from '../services/toast';
import { X, KeyRound, Loader2 } from 'lucide-react';

export default function ChangePasswordModal({ onClose }) {
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!cur || !next) { toast.info('현재/새 비밀번호를 입력해주세요.'); return; }
    if (next.length < 4) { toast.info('새 비밀번호는 4자 이상이어야 합니다.'); return; }
    if (next !== confirm) { toast.info('새 비밀번호 확인이 일치하지 않습니다.'); return; }
    setSaving(true);
    try {
      await authAPI.changePassword({ currentPassword: cur, newPassword: next });
      toast.success('비밀번호가 변경되었습니다.');
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.error || '비밀번호 변경 실패');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="pw-modal-overlay" onClick={onClose}>
      <div className="pw-modal" onClick={(e) => e.stopPropagation()}>
        <div className="pw-modal-head">
          <h3><KeyRound size={18} /> 비밀번호 변경</h3>
          <button className="pw-modal-close" onClick={onClose}><X size={18} /></button>
        </div>
        <form className="pw-modal-form" onSubmit={submit}>
          <label>현재 비밀번호
            <input type="password" value={cur} onChange={(e) => setCur(e.target.value)} autoFocus autoComplete="current-password" />
          </label>
          <label>새 비밀번호
            <input type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" placeholder="4자 이상" />
          </label>
          <label>새 비밀번호 확인
            <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
          </label>
          <div className="pw-modal-actions">
            <button type="button" className="btn-ghost" onClick={onClose}>취소</button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? <Loader2 size={16} className="spin" /> : '변경'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
