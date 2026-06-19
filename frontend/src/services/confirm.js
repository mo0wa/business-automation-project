// 커스텀 확인 모달 (Promise 기반) — await confirmDialog({ message, ... }) → true/false
let listeners = [];
let current = null; // { id, opts, resolve }

function emit() { listeners.forEach((l) => l(current)); }

export function subscribeConfirm(fn) {
  listeners.push(fn);
  fn(current);
  return () => { listeners = listeners.filter((l) => l !== fn); };
}

export function confirmDialog(opts = {}) {
  const normalized = typeof opts === 'string' ? { message: opts } : opts;
  return new Promise((resolve) => {
    // 이미 떠 있던 요청이 있으면 취소 처리
    if (current) current.resolve(false);
    current = { id: Date.now(), opts: normalized, resolve };
    emit();
  });
}

export function resolveConfirm(result) {
  if (current) {
    const { resolve } = current;
    current = null;
    emit();
    resolve(result);
  }
}

export function isConfirmOpen() { return current !== null; }
