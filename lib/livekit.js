import { RoomServiceClient } from 'livekit-server-sdk';

export const VOICE_ROOM_NAME = 'realms-voz';

export function livekitConfig() {
  const url = process.env.LIVEKIT_URL?.trim();
  const key = process.env.LIVEKIT_API_KEY?.trim();
  const secret = process.env.LIVEKIT_API_SECRET?.trim();
  if (!url || !key || !secret) return null;
  return { url, key, secret };
}

export function participantIdentity(user) {
  return `${user.role === 'admin' ? 'admin' : 'user'}:${user.username}`;
}

export async function disconnectVoiceParticipant(username) {
  const cfg = livekitConfig();
  if (!cfg) return;
  try {
    const client = new RoomServiceClient(cfg.url, cfg.key, cfg.secret);
    await client.removeParticipant(VOICE_ROOM_NAME, `user:${username}`);
  } catch (err) {
    // Ignoramos 404 cuando el jugador no está conectado o la sala no existe aún.
    if (err?.status !== 404) {
      console.warn('LiveKit removeParticipant:', err?.message || err);
    }
  }
}

