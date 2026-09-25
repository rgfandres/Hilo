-- 0055 · Stock: paridad con Notelodigo y más (25/09)
-- · El stock nunca queda en negativo por asignar o guardar un resto (SIN_STOCK).
-- · «Ha llegado por otra vía»: apunta la llegada sin pedido y la asigna al encargo en una operación.
-- · Demanda de materiales «por encargo»: cuenta la unidad entera que se gastará.
-- · impacto_anular: unidad y cantidad reales, restos del encargo y si ya estaba impreso.

create or replace function asignar_material(p_linea uuid) returns numeric
language plpgsql security definer set search_path = public as $$
declare l encargo_material%rowtype; v_mov uuid; v_cant numeric; v_stock numeric;
begin
  select * into l from encargo_material where id = p_linea for update;
  if l.id is null or not puede_material(l.tienda_id) then raise exception 'Sin permiso'; end if;
  if l.estado = 'RECIBIDO' then select stock into v_stock from material where id = l.material_id; return v_stock; end if;
  v_cant := coalesce(consumo_linea(p_linea), 0);
  if v_cant <= 0 then raise exception 'SIN_CANTIDAD'; end if;
  select stock into v_stock from material where id = l.material_id for update;
  if v_stock + 0.001 < v_cant then raise exception 'SIN_STOCK:%:%', v_stock, v_cant; end if;
  v_mov := mover_material(l.material_id, 'CONSUMO', v_cant, -v_cant, l.encargo_id, null, null, null);
  perform set_config('hilo.movimiento', '1', true);
  update encargo_material set estado = 'RECIBIDO', consumo_id = v_mov where id = p_linea;
  perform set_config('hilo.movimiento', '0', true);
  select stock into v_stock from material where id = l.material_id;
  return v_stock;
end $$;

create or replace function guardar_resto(p_material uuid, p_cantidad numeric, p_origen text default null, p_encargo uuid default null,
  p_de_stock boolean default true) returns uuid
language plpgsql security definer set search_path = public as $$
declare m material%rowtype; v_id uuid;
begin
  select * into m from material where id = p_material for update;
  if m.id is null or not puede_material(m.tienda_id) then raise exception 'Sin permiso'; end if;
  if p_cantidad is null or p_cantidad <= 0 then raise exception 'Cantidad no válida'; end if;
  if p_de_stock and m.stock + 0.001 < p_cantidad then raise exception 'SIN_STOCK:%:%', m.stock, p_cantidad; end if;
  perform mover_material(p_material, 'RESTO', p_cantidad, case when p_de_stock then -p_cantidad else 0 end, p_encargo, null, null,
    coalesce(p_origen, case when p_de_stock then 'Guardado como resto' else 'Resto apuntado a mano' end));
  insert into resto_material (tienda_id, material_id, cantidad, origen, encargo_id) values (m.tienda_id, p_material, p_cantidad, p_origen, p_encargo) returning id into v_id;
  return v_id;
end $$;

-- Llegó sin pedido (lo trajo el cliente, se compró en otra tienda…): entra al stock y se asigna, todo junto
create or replace function recibir_sin_pedido(p_linea uuid, p_cantidad numeric, p_nota text default null) returns numeric
language plpgsql security definer set search_path = public as $$
declare l encargo_material%rowtype; v_num text;
begin
  select * into l from encargo_material where id = p_linea;
  if l.id is null or coalesce(rol_en(l.tienda_id)::text, '') not in ('ADMIN','OPERATIVO','ATENCION') then raise exception 'Sin permiso'; end if;
  if l.estado = 'RECIBIDO' then raise exception 'Ya está recibido'; end if;
  if p_cantidad is null or p_cantidad <= 0 then raise exception 'Indica cuánto ha llegado'; end if;
  select lpad(e.numero::text, 3, '0') into v_num from encargo e where e.id = l.encargo_id;
  perform mover_material(l.material_id, 'RECEPCION', p_cantidad, p_cantidad, l.encargo_id, null, null,
    coalesce(nullif(btrim(p_nota), ''), 'Llegó sin pedido') || ' · ' || coalesce(v_num, ''));
  return asignar_material(p_linea);
end $$;
revoke all on function recibir_sin_pedido(uuid, numeric, text) from public, anon;
grant execute on function recibir_sin_pedido(uuid, numeric, text) to authenticated;

-- Demanda: en los materiales que se piden por encargo se gasta la unidad entera
drop view if exists v_material_estado;
create view v_material_estado with (security_invoker = true) as
select m.*, pv.nombre as proveedor_nombre,
       coalesce(m.unidad_pedido, pv.unidad_pedido) as unidad_efectiva,
       coalesce(m.umbral, (t.ajustes->>'umbral_material_defecto')::numeric, 0) as umbral_efectivo,
       coalesce(d.demanda, 0) as demanda, coalesce(d.encargos, 0) as encargos_pendientes,
       coalesce(d.sin_pedir, 0) as demanda_sin_pedir,
       coalesce(c.en_camino, 0) as en_camino,
       coalesce(r.restos, 0) as restos
from material m
join tienda t on t.id = m.tienda_id
left join proveedor pv on pv.id = m.proveedor_id
left join lateral (
  select sum(x.cant) as demanda, count(distinct x.encargo_id) as encargos,
         sum(x.cant) filter (where x.estado = 'PENDIENTE') as sin_pedir
    from (select em.encargo_id, em.estado,
                 case when m.por_encargo and coalesce(m.unidad_pedido, pv.unidad_pedido, 0) > 0
                      then ceil(em.cantidad / coalesce(m.unidad_pedido, pv.unidad_pedido)) * coalesce(m.unidad_pedido, pv.unidad_pedido)
                      else em.cantidad end as cant
            from encargo_material em join encargo e on e.id = em.encargo_id and e.estado = 'ACTIVO'
           where em.material_id = m.id and em.estado in ('PENDIENTE','PEDIDO') and not encargo_terminado(e.id)) x
) d on true
left join lateral (select sum(v.pendiente) as en_camino from v_pedido_linea v where v.material_id = m.id) c on true
left join lateral (select sum(rm.cantidad) as restos from resto_material rm where rm.material_id = m.id) r on true;
grant select on v_material_estado to authenticated;

-- Antes de anular: lo gastado de verdad (con su unidad), los restos que dejó y si la hoja ya se imprimió
create or replace function impacto_anular(p_encargo uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_e encargo%rowtype; v jsonb;
begin
  select * into v_e from encargo where id = p_encargo;
  if v_e.id is null or not es_miembro(v_e.tienda_id) then raise exception 'Sin permiso'; end if;
  select jsonb_build_object(
    'proveedor', (select nombre from proveedor where id = v_e.proveedor_id),
    'en_proveedor', coalesce((select ea.visible_para_proveedor and not ea.es_final from etapa ea where ea.id = etapa_actual(v_e.id)), false),
    'importe', v_e.importe,
    'a_cuenta', v_e.a_cuenta,
    'n_mensajes', (select count(*) from mensaje_enviado m where m.encargo_id = v_e.id),
    'n_adjuntos', (select count(*) from adjunto a where a.entidad = 'encargo' and a.entidad_id = v_e.id),
    'n_hitos', (select count(*) from hito h where h.encargo_id = v_e.id and h.deshecho_en is null),
    'material_recibido', (select coalesce(jsonb_agg(jsonb_build_object('material', trim(both ' /' from m.tipo || ' / ' || m.variante),
                                  'cantidad', coalesce(mv.cantidad, em.cantidad), 'unidad', m.unidad)), '[]')
                            from encargo_material em join material m on m.id = em.material_id
                            left join movimiento_material mv on mv.id = em.consumo_id
                           where em.encargo_id = v_e.id and em.estado = 'RECIBIDO'),
    'material_pedido', (select count(*) from encargo_material em where em.encargo_id = v_e.id and em.estado = 'PEDIDO'),
    'restos', (select coalesce(jsonb_agg(jsonb_build_object('material', trim(both ' /' from m.tipo || ' / ' || m.variante), 'cantidad', r.cantidad, 'unidad', m.unidad)), '[]')
                 from resto_material r join material m on m.id = r.material_id where r.encargo_id = v_e.id),
    'orden_impresa', exists (select 1 from linea_produccion lp where lp.encargo_id = v_e.id and lp.impreso_en is not null)
  ) into v;
  return v;
end $$;

select 'ok 0055';
