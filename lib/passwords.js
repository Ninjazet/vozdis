import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
const derive = promisify(scrypt);

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const key = await derive(password, salt, 64);
  return `scrypt:${salt.toString('hex')}:${key.toString('hex')}`;
}

export async function checkPassword(password, stored) {
  try {
    const [method, saltHex, keyHex] = stored.split(':');
    if (method !== 'scrypt') return false;
    const salt = Buffer.from(saltHex, 'hex');
    const expected = Buffer.from(keyHex, 'hex');
    if (salt.length !== 16 || expected.length !== 64) return false;
    const actual = await derive(password, salt, expected.length);
    return timingSafeEqual(actual, expected);
  } catch { return false; }
}

export function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || !a || !b) return false;
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}
