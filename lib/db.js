import { createClient } from '@supabase/supabase-js';

export function db() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Falta configurar Supabase');
  // Esta instancia solo se utiliza en rutas del servidor.
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}
