import { useState, useEffect, useContext } from 'react';
import { settingsAPI, authAPI, fixedExpenseAPI } from '../services/api';
import { toast } from '../services/toast';
import { confirmDialog } from '../services/confirm';
import { SettingsContext } from '../App';
import { Save, Upload, Loader2, Check, Building2, Users, Plus, Trash2, Image as ImageIcon, ClipboardList, Edit2, X, GripVertical } from 'lucide-react';

export default function AdminSettings() {
  const { settings, setSettings } = useContext(SettingsContext);
  const [form, setForm] = useState({
    company_name: '',
    representative: '',
    business_number: '',
    address: '',
    phone: '',
    fax: '',
    stamp_image: '',
    notes: '',
    tax_rate: 10,
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [users, setUsers] = useState([]);
  const [showAddUser, setShowAddUser] = useState(false);
  const [newUser, setNewUser] = useState({ username: '', password: '', name: '', role: 'employee' });

  // 고정 지출 항목 관리
  const [fixedItems, setFixedItems] = useState([]);
  const [newItemName, setNewItemName] = useState('');
  const [editingItemId, setEditingItemId] = useState(null);
  const [editForm, setEditForm] = useState({ name: '', default_day: '', default_vendor: '', default_description: '', default_amount: '' });
  // 드래그 정렬
  const [dragIndex, setDragIndex] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);

  useEffect(() => {
    if (settings) {
      setForm({
        company_name: settings.company_name || '',
        representative: settings.representative || '',
        business_number: settings.business_number || '',
        address: settings.address || '',
        phone: settings.phone || '',
        fax: settings.fax || '',
        stamp_image: settings.stamp_image || '',
        notes: settings.notes || '',
        tax_rate: settings.tax_rate || 10,
      });
    }
    loadUsers();
    loadFixedItems();
  }, [settings]);

  const loadFixedItems = async () => {
    try {
      const res = await fixedExpenseAPI.getItems();
      setFixedItems(res.data);
    } catch (err) {
      console.error('고정 지출 항목 로드 실패:', err);
    }
  };

  const handleAddItem = async () => {
    if (!newItemName.trim()) return;
    try {
      await fixedExpenseAPI.addItem(newItemName.trim());
      setNewItemName('');
      await loadFixedItems();
    } catch (err) {
      toast.error('항목 추가 실패');
    }
  };

  const startEditItem = (item) => {
    setEditingItemId(item.id);
    setEditForm({
      name: item.name || '',
      default_day: item.default_day ?? '',
      default_vendor: item.default_vendor || '',
      default_description: item.default_description || '',
      default_amount: item.default_amount || '',
    });
  };

  const cancelEditItem = () => {
    setEditingItemId(null);
    setEditForm({ name: '', default_day: '', default_vendor: '', default_description: '', default_amount: '' });
  };

  const handleUpdateItem = async (id) => {
    try {
      await fixedExpenseAPI.updateItem(id, {
        name: editForm.name.trim(),
        default_day: editForm.default_day === '' ? null : Number(editForm.default_day),
        default_vendor: editForm.default_vendor.trim(),
        default_description: editForm.default_description.trim(),
        default_amount: editForm.default_amount === '' ? 0 : Number(editForm.default_amount),
      });
      cancelEditItem();
      await loadFixedItems();
    } catch (err) {
      toast.error('항목 수정 실패');
    }
  };

  const handleDeleteItem = async (id) => {
    if (!(await confirmDialog({ title: '고정지출 항목 삭제', message: '항목을 삭제하면 관련 체크 기록도 모두 삭제됩니다.\n계속하시겠습니까?', confirmText: '삭제', danger: true }))) return;
    try {
      await fixedExpenseAPI.deleteItem(id);
      await loadFixedItems();
    } catch (err) {
      toast.error('항목 삭제 실패');
    }
  };

  // ── 드래그로 순서 변경 ──
  const handleDragStart = (idx) => setDragIndex(idx);

  const handleDragOver = (e, idx) => {
    e.preventDefault();
    if (idx !== dragOverIndex) setDragOverIndex(idx);
  };

  const handleDragEnd = () => { setDragIndex(null); setDragOverIndex(null); };

  const handleDrop = async (idx) => {
    if (dragIndex === null || dragIndex === idx) { handleDragEnd(); return; }
    const reordered = [...fixedItems];
    const [moved] = reordered.splice(dragIndex, 1);
    reordered.splice(idx, 0, moved);
    setFixedItems(reordered); // 낙관적 업데이트
    handleDragEnd();
    try {
      await fixedExpenseAPI.reorderItems(reordered.map(it => it.id));
    } catch (err) {
      toast.error('순서 변경 실패');
      loadFixedItems(); // 실패 시 서버 기준으로 복구
    }
  };

  const loadUsers = async () => {
    try {
      const res = await authAPI.getUsers();
      setUsers(res.data);
    } catch (err) {
      console.error('사용자 목록 로드 실패:', err);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await settingsAPI.update(form);
      setSettings(form);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      toast.success('설정이 저장되었습니다.');
    } catch (err) {
      toast.error('저장 실패');
    } finally {
      setSaving(false);
    }
  };

  const handleStampUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.info('파일 크기는 5MB 이하만 가능합니다.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      setForm(prev => ({ ...prev, stamp_image: ev.target.result }));
    };
    reader.readAsDataURL(file);
  };

  const handleAddUser = async () => {
    if (!newUser.username || !newUser.password || !newUser.name) {
      toast.info('모든 필드를 입력해주세요.');
      return;
    }
    try {
      await authAPI.createUser(newUser);
      await loadUsers();
      setShowAddUser(false);
      setNewUser({ username: '', password: '', name: '', role: 'employee' });
    } catch (err) {
      toast.error('사용자 추가 실패: ' + (err.response?.data?.error || ''));
    }
  };

  return (
    <div className="admin-page">
      <div className="page-header">
        <div className="page-title-area">
          <h2 className="page-title">관리자 화면</h2>
          <p className="page-subtitle">회사 정보 및 시스템 설정</p>
        </div>
        <button className="btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="spin" size={16} /> : saved ? <Check size={16} /> : <Save size={16} />}
          <span>{saving ? '저장 중...' : saved ? '저장됨' : '설정 저장'}</span>
        </button>
      </div>

      <div className="admin-layout">
        {/* 회사 정보 */}
        <div className="admin-section">
          <div className="admin-section-header">
            <Building2 size={20} />
            <h3>공급자 (회사) 정보</h3>
          </div>
          <p className="section-desc">견적서 및 거래명세서에 자동으로 들어가는 공급자 정보입니다.</p>

          <div className="admin-form">
            <div className="form-field">
              <label>상호 (회사명)</label>
              <input type="text" value={form.company_name} onChange={(e) => setForm(prev => ({ ...prev, company_name: e.target.value }))} placeholder="주식회사 OO" />
            </div>
            <div className="form-field">
              <label>대표자</label>
              <input type="text" value={form.representative} onChange={(e) => setForm(prev => ({ ...prev, representative: e.target.value }))} placeholder="대표자명" />
            </div>
            <div className="form-field">
              <label>사업자 등록번호</label>
              <input type="text" value={form.business_number} onChange={(e) => setForm(prev => ({ ...prev, business_number: e.target.value }))} placeholder="000-00-00000" />
            </div>
            <div className="form-field full-width">
              <label>주소</label>
              <input type="text" value={form.address} onChange={(e) => setForm(prev => ({ ...prev, address: e.target.value }))} placeholder="서울특별시 ..." />
            </div>
            <div className="form-field">
              <label>전화번호</label>
              <input type="text" value={form.phone} onChange={(e) => setForm(prev => ({ ...prev, phone: e.target.value }))} placeholder="02-0000-0000" />
            </div>
            <div className="form-field">
              <label>팩스번호</label>
              <input type="text" value={form.fax} onChange={(e) => setForm(prev => ({ ...prev, fax: e.target.value }))} placeholder="02-0000-0001" />
            </div>
            <div className="form-field">
              <label>세율 (%)</label>
              <input type="number" value={form.tax_rate} onChange={(e) => setForm(prev => ({ ...prev, tax_rate: Number(e.target.value) }))} min="0" max="100" step="0.1" />
            </div>
            <div className="form-field full-width">
              <label>비고 (견적서 하단 표시)</label>
              <textarea value={form.notes} onChange={(e) => setForm(prev => ({ ...prev, notes: e.target.value }))} placeholder="납품 조건, 유효 기간 등..." rows={3} />
            </div>

            {/* 직인 이미지 */}
            <div className="form-field full-width">
              <label>대표자 직인 도장 이미지</label>
              <div className="stamp-upload-area">
                {form.stamp_image ? (
                  <div className="stamp-preview">
                    <img src={form.stamp_image} alt="직인" />
                    <button className="stamp-remove" onClick={() => setForm(prev => ({ ...prev, stamp_image: '' }))}>
                      <Trash2 size={14} /> 삭제
                    </button>
                  </div>
                ) : (
                  <div className="stamp-placeholder">
                    <ImageIcon size={32} strokeWidth={1} />
                    <p>직인 이미지를 업로드하세요</p>
                    <span>PNG, JPG (권장: 200x200px, 투명배경 PNG)</span>
                  </div>
                )}
                <label className="stamp-upload-btn">
                  <Upload size={16} />
                  <span>이미지 업로드</span>
                  <input type="file" accept="image/*" onChange={handleStampUpload} style={{ display: 'none' }} />
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* 사용자 관리 */}
        <div className="admin-section">
          <div className="admin-section-header">
            <Users size={20} />
            <h3>사용자 관리</h3>
            <button className="btn-sm-primary" onClick={() => setShowAddUser(!showAddUser)}>
              <Plus size={14} /> 사용자 추가
            </button>
          </div>

          {showAddUser && (
            <div className="add-user-form">
              <input type="text" placeholder="아이디" value={newUser.username} onChange={(e) => setNewUser(prev => ({ ...prev, username: e.target.value }))} />
              <input type="password" placeholder="비밀번호" value={newUser.password} onChange={(e) => setNewUser(prev => ({ ...prev, password: e.target.value }))} />
              <input type="text" placeholder="이름" value={newUser.name} onChange={(e) => setNewUser(prev => ({ ...prev, name: e.target.value }))} />
              <select value={newUser.role} onChange={(e) => setNewUser(prev => ({ ...prev, role: e.target.value }))}>
                <option value="employee">직원</option>
                <option value="admin">관리자</option>
              </select>
              <button className="btn-primary" onClick={handleAddUser}>추가</button>
              <button className="btn-ghost" onClick={() => setShowAddUser(false)}>취소</button>
            </div>
          )}

          <table className="users-table">
            <thead>
              <tr>
                <th>아이디</th>
                <th>이름</th>
                <th>권한</th>
                <th>가입일</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id}>
                  <td>{u.username}</td>
                  <td>{u.name}</td>
                  <td>
                    <span className={`role-badge ${u.role}`}>
                      {u.role === 'admin' ? '관리자' : '직원'}
                    </span>
                  </td>
                  <td>{u.created_at ? new Date(u.created_at).toLocaleDateString('ko-KR') : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 고정 지출 항목 관리 */}
        <div className="admin-section">
          <div className="admin-section-header">
            <ClipboardList size={20} />
            <h3>월 별 고정 지출 항목 관리</h3>
          </div>
          <p className="section-desc">지출 등록 화면의 월별 고정 지출 체크리스트에 표시될 항목을 관리합니다. 각 항목에 지출일·업체·내용·금액을 미리 적어두면 지출 등록 시 자동으로 채워집니다.</p>

          <div className="fixed-item-add-row">
            <input
              type="text"
              placeholder="새 항목 이름 입력 (예: 임대료)"
              value={newItemName}
              onChange={(e) => setNewItemName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddItem()}
              className="fixed-item-input"
            />
            <button className="btn-sm-primary" onClick={handleAddItem} disabled={!newItemName.trim()}>
              <Plus size={14} /> 추가
            </button>
          </div>

          <div className="fixed-item-list">
            {fixedItems.length === 0 ? (
              <p className="fixed-item-empty">등록된 항목이 없습니다.</p>
            ) : fixedItems.map((item, idx) => (
              <div
                key={item.id}
                className={`fixed-item-row${dragIndex === idx ? ' dragging' : ''}${dragOverIndex === idx && dragIndex !== null && dragIndex !== idx ? ' drag-over' : ''}`}
                draggable={editingItemId !== item.id}
                onDragStart={() => handleDragStart(idx)}
                onDragOver={(e) => handleDragOver(e, idx)}
                onDrop={() => handleDrop(idx)}
                onDragEnd={handleDragEnd}
              >
                {editingItemId === item.id ? (
                  <div className="fixed-item-edit-grid">
                    <div className="fie-field fie-name">
                      <label>항목명</label>
                      <input
                        className="fixed-item-edit-input"
                        value={editForm.name}
                        onChange={(e) => setEditForm(p => ({ ...p, name: e.target.value }))}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleUpdateItem(item.id); if (e.key === 'Escape') cancelEditItem(); }}
                        autoFocus
                      />
                    </div>
                    <div className="fie-field fie-day">
                      <label>지출일 (매월)</label>
                      <input
                        type="number" min="1" max="31"
                        className="fixed-item-edit-input"
                        value={editForm.default_day}
                        onChange={(e) => setEditForm(p => ({ ...p, default_day: e.target.value }))}
                        placeholder="예: 5"
                      />
                    </div>
                    <div className="fie-field fie-vendor">
                      <label>업체</label>
                      <input
                        className="fixed-item-edit-input"
                        value={editForm.default_vendor}
                        onChange={(e) => setEditForm(p => ({ ...p, default_vendor: e.target.value }))}
                        placeholder="거래 업체명"
                      />
                    </div>
                    <div className="fie-field fie-desc">
                      <label>지출내용</label>
                      <input
                        className="fixed-item-edit-input"
                        value={editForm.default_description}
                        onChange={(e) => setEditForm(p => ({ ...p, default_description: e.target.value }))}
                        placeholder="예: 사무실 임대료"
                      />
                    </div>
                    <div className="fie-field fie-amount">
                      <label>지출 비용 (원)</label>
                      <input
                        type="number" min="0"
                        className="fixed-item-edit-input"
                        value={editForm.default_amount}
                        onChange={(e) => setEditForm(p => ({ ...p, default_amount: e.target.value }))}
                        placeholder="0"
                      />
                    </div>
                    <div className="fie-actions">
                      <button className="btn-sm-primary" onClick={() => handleUpdateItem(item.id)} title="저장">
                        <Check size={14} />
                      </button>
                      <button className="btn-ghost btn-sm" onClick={cancelEditItem} title="취소">
                        <X size={14} />
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <span className="fixed-item-drag-handle" title="드래그하여 순서 변경"><GripVertical size={15} /></span>
                    <span className="fixed-item-order">{idx + 1}</span>
                    <div className="fixed-item-info">
                      <span className="fixed-item-name">{item.name || <em className="fixed-item-empty-name">(직접입력)</em>}</span>
                      {(item.default_day || item.default_vendor || item.default_description || item.default_amount) ? (
                        <span className="fixed-item-template">
                          {item.default_day ? <span className="fit-tag">매월 {item.default_day}일</span> : null}
                          {item.default_vendor ? <span className="fit-tag">{item.default_vendor}</span> : null}
                          {item.default_description ? <span className="fit-tag">{item.default_description}</span> : null}
                          {item.default_amount ? <span className="fit-tag fit-amount">₩{Number(item.default_amount).toLocaleString('ko-KR')}</span> : null}
                        </span>
                      ) : (
                        <span className="fixed-item-template fixed-item-template-empty">미리 채울 내용 없음</span>
                      )}
                    </div>
                    <button className="btn-ghost btn-sm" onClick={() => startEditItem(item)} title="수정">
                      <Edit2 size={14} />
                    </button>
                    <button className="btn-ghost btn-sm btn-danger-ghost" onClick={() => handleDeleteItem(item.id)} title="삭제">
                      <Trash2 size={14} />
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
