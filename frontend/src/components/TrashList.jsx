import { useState, useEffect } from 'react';
import { trashAPI } from '../services/api';
import { toast } from '../services/toast';
import { confirmDialog } from '../services/confirm';
import { Trash2, RotateCcw, AlertTriangle, Loader2 } from 'lucide-react';
import { formatCurrency } from '../utils/documentUtils';

export default function TrashList() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTrash();
  }, []);

  const loadTrash = async () => {
    setLoading(true);
    try {
      const res = await trashAPI.getAll();
      setItems(res.data);
    } catch (err) {
      console.error('휴지통 로드 실패:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleRestore = async (id) => {
    try {
      await trashAPI.restore(id);
      setItems(prev => prev.filter(q => q.id !== id));
      toast.success('복원되었습니다.');
    } catch (err) {
      toast.error('복원 실패');
    }
  };

  const handlePermanentDelete = async (id) => {
    if (!(await confirmDialog({ title: '영구 삭제', message: '영구 삭제하면 복구할 수 없습니다.\n계속하시겠습니까?', confirmText: '영구 삭제', danger: true }))) return;
    try {
      await trashAPI.deletePermanent(id);
      setItems(prev => prev.filter(q => q.id !== id));
      toast.success('영구 삭제되었습니다.');
    } catch (err) {
      toast.error('삭제 실패');
    }
  };

  const formatDeletedAt = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  };

  if (loading) return (
    <div className="loading-area"><Loader2 className="spin" size={32} /><p>로딩 중...</p></div>
  );

  return (
    <div className="trash-page">
      <div className="trash-header">
        <div className="trash-title-area">
          <Trash2 size={22} />
          <h2>휴지통</h2>
          <span className="trash-count">{items.length}건</span>
        </div>
        <p className="trash-desc">삭제된 견적서 목록입니다. 복원하거나 영구 삭제할 수 있습니다.</p>
      </div>

      {items.length === 0 ? (
        <div className="empty-area">
          <Trash2 size={48} opacity={0.3} />
          <p>휴지통이 비어있습니다.</p>
        </div>
      ) : (
        <div className="trash-list">
          {items.map(quote => (
            <div key={quote.id} className="trash-item">
              <div className="trash-item-info">
                <div className="trash-item-title">{quote.title || '(제목 없음)'}</div>
                <div className="trash-item-meta">
                  <span>{quote.client_company || quote.client_name || '-'}</span>
                  <span className="trash-meta-sep">·</span>
                  <span>₩{formatCurrency(quote.total_amount)}</span>
                  <span className="trash-meta-sep">·</span>
                  <span className="trash-deleted-at">삭제일: {formatDeletedAt(quote.deleted_at)}</span>
                </div>
              </div>
              <div className="trash-item-actions">
                <button className="btn-restore" onClick={() => handleRestore(quote.id)} title="복원">
                  <RotateCcw size={15} /> 복원
                </button>
                <button className="btn-perm-delete" onClick={() => handlePermanentDelete(quote.id)} title="영구 삭제">
                  <AlertTriangle size={15} /> 영구 삭제
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
