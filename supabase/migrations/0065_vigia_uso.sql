-- Vigía de uso de la plataforma: cuánto se gasta de los planes gratuitos (Supabase, Resend).
-- Lo lee solo la función «vigia» con la clave de servicio; nadie más.
create table if not exists public.vigia_envio (
  dia date primary key,
  enviado_en timestamptz not null default now(),
  resumen jsonb
);
alter table public.vigia_envio enable row level security;   -- sin políticas: solo la clave de servicio

create or replace function public.uso_plataforma() returns jsonb
language sql stable security definer set search_path = public, auth, storage as $$
  select jsonb_build_object(
    'bd_bytes',        pg_database_size(current_database()),
    'archivos_bytes',  (select coalesce(sum((metadata->>'size')::bigint), 0) from storage.objects),
    'usuarios',        (select count(*) from auth.users),
    'activos_30d',     (select count(*) from auth.users where last_sign_in_at > now() - interval '30 days'),
    'altas_7d',        (select count(*) from auth.users where created_at > now() - interval '7 days'),
    'altas_hoy',       (select count(*) from auth.users where created_at > date_trunc('day', now())),
    'altas_mes',       (select count(*) from auth.users where created_at > date_trunc('month', now())),
    'tiendas',         (select count(*) from tienda),
    'tiendas_7d',      (select count(*) from tienda where creado_en > now() - interval '7 days'),
    'encargos',        (select count(*) from encargo),
    'correos_hoy',     (select count(*) from mensaje_enviado where por_hilo and fecha > date_trunc('day', now())),
    'correos_mes',     (select count(*) from mensaje_enviado where por_hilo and fecha > date_trunc('month', now()))
  )
$$;
revoke all on function public.uso_plataforma() from public, anon, authenticated;
grant execute on function public.uso_plataforma() to service_role;

select 'ok 0065';
