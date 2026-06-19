// 전역 토스트 (싱글톤) — 어디서든 import 해서 toast.success/error/info 호출
let listeners = [];
let toasts = [];
let idCounter = 0;

function emit() { listeners.forEach((l) => l(toasts)); }

export function subscribeToasts(fn) {
  listeners.push(fn);
  fn(toasts);
  return () => { listeners = listeners.filter((l) => l !== fn); };
}

export function dismissToast(id) {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

function push(opts) {
  const id = ++idCounter;
  const item = { id, type: 'info', duration: 3000, ...opts };
  toasts = [...toasts, item];
  emit();
  if (item.duration) setTimeout(() => dismissToast(id), item.duration);
  return id;
}

export const toast = {
  show: push,
  success: (message, o = {}) => push({ type: 'success', message, ...o }),
  error: (message, o = {}) => push({ type: 'error', message, duration: 4500, ...o }),
  info: (message, o = {}) => push({ type: 'info', message, ...o }),
};
