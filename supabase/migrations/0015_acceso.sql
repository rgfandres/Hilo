-- =====================================================================
-- HILO · migración 0015 · acceso
-- Dominio aprobado: quien entra con un correo confirmado de un dominio que la
-- tienda ha aprobado (Ajustes → Seguridad) se une solo, con el rol por defecto.
-- ajustes.seguridad = { dominios: ["midominio.es"], rol_por_defecto: "ATENCION", ... }
-- =====================================================================
create or replace function unirse_por_dominio()
returns int language plpgsql security definer set search_path = public as $$
declare v_dom text; v_conf timestamptz; t record; n int := 0; v_rol rol_miembro;
begin
  if auth.uid() is null or mi_email() = '' or position('@' in mi_email()) = 0 then return 0; end if;
  -- Solo con el correo confirmado (si no, cualquiera podría escribir un correo ajeno)
  select email_confirmed_at into v_conf from auth.users where id = auth.uid();
  if v_conf is null then return 0; end if;
  v_dom := split_part(mi_email(), '@', 2);
  for t in select id, ajustes from tienda
            where coalesce(ajustes->'seguridad'->'dominios', '[]'::jsonb) ? v_dom loop
    if exists (select 1 from miembro where tienda_id = t.id and user_id = auth.uid()) then continue; end if;
    begin
      v_rol := coalesce(nullif(t.ajustes->'seguridad'->>'rol_por_defecto', ''), 'ATENCION')::rol_miembro;
    exception when others then v_rol := 'ATENCION';
    end;
    if v_rol = 'ADMIN' then v_rol := 'ATENCION'; end if;  -- nunca se entra como administración por dominio
    insert into miembro (tienda_id, user_id, email, rol, activo) values (t.id, auth.uid(), mi_email(), v_rol, true)
    on conflict (tienda_id, user_id) do nothing;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function unirse_por_dominio() from public, anon;
grant execute on function unirse_por_dominio() to authenticated;
