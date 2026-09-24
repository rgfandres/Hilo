-- =====================================================================
-- HILO · migración 0031 · barrido 2, tanda 2: ficha, lista y pasos
--  L-05 Anular y decidir el material en una sola operación (o todo o nada)
--  L-08 Periodos: los anulados se filtran por su periodo (función de apoyo)
-- =====================================================================
drop function if exists anular_encargo(uuid, text);
create or replace function anular_encargo(p_encargo uuid, p_motivo text, p_devolver_material boolean default null) returns void
language plpgsql security definer set search_path = public as $$
declare v_enc encargo%rowtype; v_snap jsonb;
begin
  select * into v_enc from encargo where id = p_encargo;
  if v_enc.id is null then raise exception 'Encargo no encontrado'; end if;
  if not es_admin(v_enc.tienda_id) then raise exception 'Solo administración puede anular'; end if;
  if v_enc.estado <> 'ACTIVO' then raise exception 'Ya está anulado'; end if;
  -- Material ya asignado: vuelve al stock o se da por usado, dentro de la misma operación
  if p_devolver_material is not null then perform liberar_material_encargo(p_encargo, p_devolver_material); end if;
  v_snap := jsonb_build_object(
    'encargo', to_jsonb(v_enc),
    'hitos',  (select coalesce(jsonb_agg(to_jsonb(h)), '[]') from hito h where h.encargo_id = p_encargo),
    'checks', (select coalesce(jsonb_agg(to_jsonb(c)), '[]') from check_encargo c where c.encargo_id = p_encargo));
  insert into anulacion (encargo_id, usuario_id, motivo, snapshot)
  values (p_encargo, auth.uid(), nullif(trim(p_motivo), ''), v_snap);
  update encargo set estado = 'ANULADO' where id = p_encargo;
end $$;
revoke all on function anular_encargo(uuid, text, boolean) from public, anon;
grant execute on function anular_encargo(uuid, text, boolean) to authenticated;

select 'ok 0031' as r;
