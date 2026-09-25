-- 0057 · A5: guardar solo los datos que se han cambiado (se fusionan con lo que haya en ese momento).
-- Así, si dos personas editan a la vez campos distintos, no se pisan. Respeta los permisos de siempre
-- (security invoker: pasa por la política de UPDATE de cada tabla).

create or replace function cambiar_datos_encargo(p_encargo uuid, p_set jsonb, p_quitar text[] default '{}')
returns void language plpgsql security invoker set search_path = public as $$
begin
  update encargo set datos = (coalesce(datos, '{}'::jsonb) - coalesce(p_quitar, '{}')) || coalesce(p_set, '{}'::jsonb)
   where id = p_encargo;
  if not found then raise exception 'No tienes permiso para hacer esto (o no existe)'; end if;
end $$;

create or replace function cambiar_datos_cliente(p_cliente uuid, p_set jsonb, p_quitar text[] default '{}')
returns void language plpgsql security invoker set search_path = public as $$
begin
  update cliente set datos = (coalesce(datos, '{}'::jsonb) - coalesce(p_quitar, '{}')) || coalesce(p_set, '{}'::jsonb)
   where id = p_cliente;
  if not found then raise exception 'No tienes permiso para hacer esto (o no existe)'; end if;
end $$;

revoke all on function cambiar_datos_encargo(uuid, jsonb, text[]) from public, anon;
grant execute on function cambiar_datos_encargo(uuid, jsonb, text[]) to authenticated;
revoke all on function cambiar_datos_cliente(uuid, jsonb, text[]) from public, anon;
grant execute on function cambiar_datos_cliente(uuid, jsonb, text[]) to authenticated;

select 'ok 0057';
