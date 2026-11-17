import { currentUser } from '../../../../lib/access';
export const runtime = 'nodejs';
export async function GET() {
  try {
    const user = await currentUser();
    return Response.json({ user: user || null }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ user: null }, { headers: { 'Cache-Control': 'no-store' } });
  }
}
