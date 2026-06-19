// 비밀번호 해싱/검증 + 세션 토큰 생성 (Node 내장 crypto만 사용, 외부 의존성 없음)
const crypto = require('crypto');

// scrypt 해시 → "scrypt$<saltHex>$<hashHex>" 형태로 저장
function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(pw ?? ''), salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

function verifyPassword(pw, stored) {
  if (!stored) return false;
  // 과거 평문 비밀번호 호환 (마이그레이션 전 데이터)
  if (!stored.startsWith('scrypt$')) {
    return String(pw ?? '') === stored;
  }
  const parts = stored.split('$');
  if (parts.length !== 3) return false;
  const [, salt, hash] = parts;
  const calc = crypto.scryptSync(String(pw ?? ''), salt, 64).toString('hex');
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(calc, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function isHashed(stored) {
  return typeof stored === 'string' && stored.startsWith('scrypt$');
}

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

module.exports = { hashPassword, verifyPassword, isHashed, generateToken };
