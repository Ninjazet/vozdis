import { db } from '../../../../lib/db';
import { checkPassword, safeEqual } from '../../../../lib/passwords';
import { buildSessionCookie, makeSession } from '../../../../lib/session';
import { jsonError, sameOrigin } from '../../../../lib/access';
import { isValidUsername, normalizeUsername } from '../../../../lib/validation';

export const runtime = 'nodejs';
export async function POST(req) {
  if (!sameOrigin(req)) return jsonError('Solicitud no permitida', 403);
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') return jsonError('Solicitud inválida', 400);
    const { username, password } = body;
    const name = normalizeUsername(username);
    if (!isValidUsername(name) || typeof password !== 'string' || password.length > 256) {
      return jsonError('Usuario o contraseña incorrectos', 401);
    }
    let role = 'user';
    const adminName = normalizeUsername(process.env.ADMIN_USERNAME);
    if (adminName && name === adminName) {
      if (!process.env.ADMIN_PASSWORD || !safeEqual(password, process.env.ADMIN_PASSWORD)) {
        return jsonError('Usuario o contraseña incorrectos', 401);
      }
      role = 'admin';
    } else {
      const { data, error } = await db().from('realms_users')
        .select('username,password_hash,active').eq('username', name).maybeSingle();
      if (error) throw error;
      if (!data?.active || !(await checkPassword(password, data.password_hash))) {
        return jsonError('Usuario o contraseña incorrectos', 401);
      }
    }
    const response = Response.json({ username: name, role }, { headers: { 'Cache-Control': 'no-store' } });
    response.headers.append('Set-Cookie', buildSessionCookie(makeSession({ username: name, role })));
    return response;
  } catch (error) {
    console.error('Login error:', error);
    return jsonError('No se pudo iniciar sesión. Revisa la configuración.', 500);
  }
}
