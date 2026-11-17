import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { isValidUsername } from './validation';

export const COOKIE_NAME = 'realms_voz_session';
const EXPIRES_SECONDS = 7 * 24 * 3600;

function secret() {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 32) throw new Error('SESSION_SECRET debe tener al menos 32 caracteres');
  return value;
}

function signature(body) {
  return createHmac('sha256', secret()).update(body).digest('base64url');
}

export function makeSession({ username, role }) {
  const body = Buffer.from(JSON.stringify({
    username, role, exp: Math.floor(Date.now() / 1000) + EXPIRES_SECONDS
  })).toString('base64url');
  return `${body}.${signature(body)}`;
}

export function decodeSession(cookie) {
  if (!cookie || typeof cookie !== 'string') return null;
  try {
    const bits = cookie.split('.');
    if (bits.length !== 2) return null;
    const [body, mac] = bits;
    const actual = Buffer.from(mac, 'base64url');
    const expected = Buffer.from(signature(body), 'base64url');
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
    const user = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!user || !['admin','user'].includes(user.role) ||
        !isValidUsername(user.username) ||
        !Number.isInteger(user.exp) || Date.now() / 1000 >= user.exp) return null;
    return { username: user.username, role: user.role };
  } catch { return null; }
}

export async function getSession() {
  const jar = await cookies();
  return decodeSession(jar.get(COOKIE_NAME)?.value);
}

export const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  path: '/',
  maxAge: EXPIRES_SECONDS
};

export function buildSessionCookie(value, maxAge = cookieOptions.maxAge) {
  return `${COOKIE_NAME}=${value}; Path=${cookieOptions.path}; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${cookieOptions.secure ? '; Secure' : ''}`;
}
