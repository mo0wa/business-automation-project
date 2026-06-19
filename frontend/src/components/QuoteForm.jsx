import React, { useState } from 'react';
import { Check, X } from 'lucide-react';

export default function QuoteForm({ quote, onSubmit, onClose }) {
  const [formData, setFormData] = useState(quote || {
    client_name: '',
    description: '',
    amount: '',
    status: '대기중'
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4">
      <div className="glass-panel p-8 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <h2 className="text-3xl font-bold text-white mb-6 font-display">
          {quote ? '견적서 수정' : '새 견적서'}
        </h2>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-gray-300 mb-2 font-medium">고객명</label>
            <input
              type="text"
              value={formData.client_name}
              onChange={(e) => setFormData({ ...formData, client_name: e.target.value })}
              className="input-field w-full px-4 py-3 rounded-lg"
              required
            />
          </div>

          <div>
            <label className="block text-gray-300 mb-2 font-medium">프로젝트 설명</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="input-field w-full px-4 py-3 rounded-lg h-24"
              required
            />
          </div>

          <div>
            <label className="block text-gray-300 mb-2 font-medium">견적 금액</label>
            <input
              type="number"
              value={formData.amount}
              onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
              className="input-field w-full px-4 py-3 rounded-lg"
              required
            />
          </div>

          <div>
            <label className="block text-gray-300 mb-2 font-medium">상태</label>
            <select
              value={formData.status}
              onChange={(e) => setFormData({ ...formData, status: e.target.value })}
              className="input-field w-full px-4 py-3 rounded-lg"
            >
              <option value="대기중">대기중</option>
              <option value="승인됨">승인됨</option>
              <option value="거절됨">거절됨</option>
            </select>
          </div>

          <div className="flex gap-4 pt-4">
            <button type="submit" className="primary-button flex-1 py-3 rounded-lg text-white font-semibold">
              <Check className="inline mr-2" size={20} />
              {quote ? '수정' : '생성'}
            </button>
            <button type="button" onClick={onClose} className="flex-1 py-3 rounded-lg text-white font-semibold border border-white border-opacity-20 hover:bg-white hover:bg-opacity-10 transition-all">
              <X className="inline mr-2" size={20} />
              취소
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
