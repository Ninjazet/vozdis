import { AccessToken } from 'livekit-server-sdk';
import { currentUser, jsonError, sameOrigin } from '../../../../lib/access';
import { VOICE_ROOM_NAME, livekitConfig, participantIdentity } from '../../../../lib/livekit';
export const runtime = 'nodejs';

export async function POST(req) {
  if (!sameOrigin(req)) return jsonError('Solicitud no permitida', 403);
  try {
    const user = await currentUser();
    if (!user) return jsonError('Inicia sesión primero', 401);
    const cfg = livekitConfig();
    if (!cfg) return jsonError('La sala de voz aún no está configurada', 503);
    const token = new AccessToken(cfg.key, cfg.secret, {
      identity: participantIdentity(user),
      name: user.username,
      ttl: '10m',
    });
    token.addGrant({
      roomJoin: true,
      room: VOICE_ROOM_NAME,
      canPublish: true,
      canSubscribe: true,
      canPublishData: false,
    });
    return Response.json({ url: cfg.url, token: await token.toJwt() }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.error('Voice token:', e);
    return jsonError('No se pudo entrar a la sala', 500);
  }
}
