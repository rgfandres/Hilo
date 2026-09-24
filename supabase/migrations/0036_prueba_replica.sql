-- 0036 · Arreglos de la prueba de réplica (datos reales metidos a mano en una tienda nueva)
--  · Cambiar la fecha del primer paso cambia también la fecha de alta del encargo («Creado»),
--    para poder pasar a Hilo encargos que empezaron antes.
--  · Restos que ya estaban en la tienda: se pueden apuntar sin descontarlos del stock.

create or replace function cambiar_fecha_hito(p_hito uuid, p_fecha timestamptz)
returns void language plpgsql security definer set search_path = public as $$
declare v_h hito%rowtype; v_tienda uuid; v_prev timestamptz; v_next timestamptz; v_tz text;
begin
  select * into v_h from hito where id = p_hito and deshecho_en is null;
  if v_h.id is null then raise exception 'Hito no encontrado'; end if;
  select e.tienda_id, coalesce(t.ajustes->>'zona_horaria', 'Europe/Madrid') into v_tienda, v_tz
    from encargo e join tienda t on t.id = e.tienda_id where e.id = v_h.encargo_id and e.estado = 'ACTIVO';
  if v_tienda is null then raise exception 'El encargo está anulado'; end if;
  if coalesce(rol_en(v_tienda)::text, '') not in ('ADMIN','OPERATIVO') then
    raise exception 'Solo administración u operativo pueden cambiar fechas';
  end if;
  if p_fecha > now() + interval '1 minute' then raise exception 'La fecha no puede ser futura'; end if;
  select max(fecha) into v_prev from hito
   where encargo_id = v_h.encargo_id and deshecho_en is null and id <> p_hito and fecha < v_h.fecha;
  select min(fecha) into v_next from hito
   where encargo_id = v_h.encargo_id and deshecho_en is null and id <> p_hito and fecha > v_h.fecha;
  if v_prev is not null and p_fecha < v_prev then
    raise exception 'La fecha no puede ser anterior al paso previo (%)', to_char(v_prev at time zone v_tz, 'DD/MM/YYYY HH24:MI');
  end if;
  if v_next is not null and p_fecha > v_next then
    raise exception 'La fecha no puede ser posterior al paso siguiente (%)', to_char(v_next at time zone v_tz, 'DD/MM/YYYY HH24:MI');
  end if;
  update hito set fecha = p_fecha where id = p_hito;
  -- Es el primer paso: la fecha de alta va con él
  if v_prev is null then update encargo set creado_en = p_fecha where id = v_h.encargo_id; end if;
end $$;

drop function if exists guardar_resto(uuid, numeric, text, uuid);
create or replace function guardar_resto(p_material uuid, p_cantidad numeric, p_origen text default null, p_encargo uuid default null,
  p_de_stock boolean default true) returns uuid
language plpgsql security definer set search_path = public as $$
declare m material%rowtype; v_id uuid;
begin
  select * into m from material where id = p_material;
  if m.id is null or not puede_material(m.tienda_id) then raise exception 'Sin permiso'; end if;
  if p_cantidad is null or p_cantidad <= 0 then raise exception 'Cantidad no válida'; end if;
  -- De stock: sale de las piezas enteras. Si no (un resto que ya estaba), solo queda apuntado en el libro.
  perform mover_material(p_material, 'RESTO', p_cantidad, case when p_de_stock then -p_cantidad else 0 end, p_encargo, null, null,
    coalesce(p_origen, case when p_de_stock then 'Guardado como resto' else 'Resto apuntado a mano' end));
  insert into resto_material (tienda_id, material_id, cantidad, origen, encargo_id) values (m.tienda_id, p_material, p_cantidad, p_origen, p_encargo) returning id into v_id;
  return v_id;
end $$;
revoke all on function guardar_resto(uuid, numeric, text, uuid, boolean) from public, anon;
grant execute on function guardar_resto(uuid, numeric, text, uuid, boolean) to authenticated;
