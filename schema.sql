-- Ejecutar en Supabase > SQL Editor, solo una vez.
-- Las cuentas solo se crean desde el panel del administrador.
create table if not exists public.realms_users (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,
  password_hash text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint username_format check (username ~ '^[a-z0-9_-]{3,20}$')
);

-- Evita que la base de datos sea accesible directamente desde los navegadores.
alter table public.realms_users enable row level security;
revoke all on public.realms_users from anon, authenticated;
-- La clave privada del servidor puede acceder por su rol de servicio.
