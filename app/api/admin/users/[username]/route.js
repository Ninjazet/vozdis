import { db } from '../../../../../lib/db';
import { hashPassword } from '../../../../../lib/passwords';
import { jsonError, requireAdmin, sameOrigin } from '../../../../../lib/access';
import { disconnectVoiceParticipant } from '../../../../../lib/livekit';
import { isValidPassword, isValidUsername, normalizeUsername } from '../../../../../lib/validation';
export const runtime = 'nodejs';

function parseTargetUsername(raw) {
  try {
    const decoded = decodeURIComponent(String(raw ?? ''));
    const name = normalizeUsername(decoded);
    return isValidUsername(name) ? name : null;
  } catch {
    return null;
  }
}

export async function PATCH(req, ctx) {
  if (!sameOrigin(req)) return jsonError('Solicitud no permitida', 403);
  try {
    const auth = await requireAdmin();
    if (auth.error) return auth.error;
    const { username: rawUsername } = await ctx.params;
    const name = parseTargetUsername(rawUsername);
    if (!name) return jsonError('Jugador no encontrado', 404);
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') return jsonError('Solicitud inválida', 400);
    const { password } = body;
    if (!isValidPassword(password)) return jsonError('La nueva contraseña debe tener 8 a 128 caracteres');
    const password_hash = await hashPassword(password);
    const { data, error } = await db().from('realms_users').update({ password_hash })
      .eq('username', name).select('username').maybeSingle();
    if (error) throw error;
    if (!data) return jsonError('Jugador no encontrado', 404);
    return Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.error('Admin reset:', e);
    return jsonError('No se pudo cambiar la contraseña', 500);
  }
}

export async function DELETE(req, ctx) {
  if (!sameOrigin(req)) return jsonError('Solicitud no permitida', 403);
  try {
    const auth = await requireAdmin();
    if (auth.error) return auth.error;
    const { username: rawUsername } = await ctx.params;
    const name = parseTargetUsername(rawUsername);
    if (!name) return jsonError('Jugador no encontrado', 404);
    const { data, error } = await db().from('realms_users').delete()
      .eq('username', name).select('username').maybeSingle();
    if (error) throw error;
    if (!data) return jsonError('Jugador no encontrado', 404);
    await disconnectVoiceParticipant(name);
    return Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.error('Admin delete:', e);
    return jsonError('No se pudo eliminar el jugador', 500);
  }
}
