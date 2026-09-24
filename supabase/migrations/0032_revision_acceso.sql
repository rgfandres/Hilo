-- =====================================================================
-- HILO · migración 0032 · barrido 2, tanda 3: sesión, tiendas e invitaciones
--  E-04 ver_invitacion devuelve también la tienda y los nombres de rol de esa tienda
-- =====================================================================
drop function if exists ver_invitacion(uuid);
create or replace function ver_invitacion(p_token uuid)
returns table (tienda text, rol rol_miembro, email text, valida boolean, tienda_id uuid, roles jsonb)
language sql stable security definer set search_path = public as $$
  select t.nombre, i.rol, i.email,
         (i.revocada_en is null and i.caduca_en > now() and (i.email is null or i.aceptada_en is null)),
         t.id, coalesce(t.ajustes->'roles', '{}'::jsonb)
    from invitacion i join tienda t on t.id = i.tienda_id
   where i.token = p_token
$$;
grant execute on function ver_invitacion(uuid) to anon, authenticated;

select 'ok 0032' as r;
