import { buildSessionCookie } from '../../../../lib/session';
import { jsonError, sameOrigin } from '../../../../lib/access';

export const runtime = 'nodejs';
export async function POST(req) {
  if (!sameOrigin(req)) return jsonError('Solicitud no permitida', 403);
  const response = Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  response.headers.append('Set-Cookie', buildSessionCookie('', 0));
  return response;
}
