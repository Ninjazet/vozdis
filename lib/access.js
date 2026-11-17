import { getSession } from './session';
import { db } from './db';
import { normalizeUsername } from './validation';

export async function currentUser() {
  const session = await getSession();
  if (!session) return null;
  if (session.role === 'admin') {
    const adminName = normalizeUsername(process.env.ADMIN_USERNAME);
    if (!adminName || session.username !== adminName) return null;
    // Cambiar la contraseña administrativa invalida las nuevas sesiones
    // tras el vencimiento; cambia SESSION_SECRET para invalidarlas inmediatamente.
    return session;
  }
  const { data, error } = await db().from('realms_users')
    .select('username,active').eq('username', session.username).maybeSingle();
  if (error || !data?.active) return null;
  return session;
}

export async function requireAdmin() {
  const session = await currentUser();
  if (session?.role !== 'admin') return { error: jsonError('Acceso restringido', 403) };
  return { session };
}

export function jsonError(message, status = 400) {
  return Response.json({ error: message }, { status, headers: { 'Cache-Control': 'no-store' } });
}

function firstHeaderValue(request, name) {
  return request.headers.get(name)?.split(',')[0]?.trim() || '';
}

// Evita llamadas mutadoras iniciadas desde un sitio externo.
export function sameOrigin(request) {
  const origin = request.headers.get('origin');
  if (!origin) return true; // Algunos clientes del mismo origen no envían Origin.
  const forwardedProto = firstHeaderValue(request, 'x-forwarded-proto');
  const forwardedHost = firstHeaderValue(request, 'x-forwarded-host') || firstHeaderValue(request, 'host');
  const expected = forwardedProto && forwardedHost
    ? `${forwardedProto}://${forwardedHost}` : new URL(request.url).origin;
  return origin === expected;
}
