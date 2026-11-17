import { db } from '../../../../lib/db';
import { hashPassword } from '../../../../lib/passwords';
import { jsonError, requireAdmin, sameOrigin } from '../../../../lib/access';
import { MAX_PLAYERS, isValidPassword, isValidUsername, normalizeUsername } from '../../../../lib/validation';
export const runtime = 'nodejs';

export async function GET() {
  try {
    const auth = await requireAdmin();
    if (auth.error) return auth.error;
    const { data, error } = await db().from('realms_users')
      .select('username,created_at').order('created_at', { ascending: true });
    if (error) throw error;
    return Response.json({ users: data || [] }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.error('Admin list:', e);
    return jsonError('No se pudieron cargar los jugadores. Comprueba la base de datos.', 500);
  }
}

export async function POST(req) {
  if (!sameOrigin(req)) return jsonError('Solicitud no permitida', 403);
  try {
    const auth = await requireAdmin();
    if (auth.error) return auth.error;
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') return jsonError('Solicitud inválida', 400);
    const { username, password } = body;
    const name = normalizeUsername(username);
    if (!isValidUsername(name)) return jsonError('El usuario debe tener 3 a 20 letras, números, guiones o _');
    if (name === normalizeUsername(process.env.ADMIN_USERNAME)) return jsonError('Ese usuario está reservado');
    if (!isValidPassword(password)) return jsonError('Usa una contraseña de entre 8 y 128 caracteres');
    const { count, error: countError } = await db().from('realms_users').select('*', { count: 'exact', head: true });
    if (countError) throw countError;
    if (count >= MAX_PLAYERS) return jsonError(`Has llegado al máximo de ${MAX_PLAYERS} jugadores`);
    const password_hash = await hashPassword(password);
    const { error } = await db().from('realms_users').insert({ username: name, password_hash });
    if (error) return jsonError(error.code === '23505' ? 'Ese usuario ya existe' : 'No se pudo crear el usuario');
    return Response.json({ ok: true, username: name }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.error('Admin create:', e);
    return jsonError('Error al crear el usuario. Revisa la configuración.', 500);
  }
}
