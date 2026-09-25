-- 0054 · Repaso a fondo de encargos y stock (25/09)
-- · Volver atrás es una sola operación en el servidor (volver_a_etapa): devuelve el material si se
--   pide, deshace los pasos de después (también el de producción) y se puede deshacer entero.
-- · Saltar etapas no se salta la producción ni las condiciones de las etapas intermedias.
-- · «Deshacer recibido» solo antes de llegar a la etapa que pide el material (después, volver atrás).
-- · recibir_linea reparte lo que llega por orden y solo mientras alcance.
-- · Una línea deshecha vuelve a «Pedido» solo si el pedido sigue abierto y le queda algo por llegar.
-- · Quitar una línea pedida suelta su hueco en el pedido (no se pide dos veces).
-- · Anular guarda si el material volvió al stock; recuperar respeta esa decisión.
-- · Sin temporada (periodo null) también se ve con «solo la temporada activa».

alter table hito add column if not exists deshecho_por uuid references hito(id) on delete set null;
alter table hito add column if not exists material_devuelto uuid[];
alter table anulacion add column if not exists material_devuelto boolean;

create or replace function crear_hito(
  p_encargo uuid, p_etapa_clave text,
  p_tipo tipo_hito default 'NORMAL', p_nota text default null,
  p_origen origen_hito default 'APP', p_forzar_blandas boolean default false
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_enc encargo%rowtype; v_etapa etapa%rowtype; v_rol rol_miembro; v_id uuid; v_bloq text; v_act int; v_salta text; v_sig int;
begin
  select * into v_enc from encargo where id = p_encargo;
  if v_enc.id is null then raise exception 'Encargo no encontrado'; end if;
  if v_enc.estado <> 'ACTIVO' then raise exception 'El encargo está anulado'; end if;

  select * into v_etapa from etapa where tipo_encargo_id = v_enc.tipo_encargo_id and clave = p_etapa_clave;
  if v_etapa.id is null then raise exception 'Etapa % no existe para este tipo de encargo', p_etapa_clave; end if;
  select x.orden into v_act from etapa x where x.id = etapa_actual(p_encargo);
  select min(x.orden) into v_sig from etapa x where x.tipo_encargo_id = v_enc.tipo_encargo_id and x.orden > coalesce(v_act, -2147483648);

  v_rol := rol_en(v_enc.tienda_id);
  if v_rol is null then
    -- Portal: solo su encargo, solo la etapa siguiente y solo si la marca el proveedor
    if not (v_etapa.marca_proveedor and p_tipo = 'NORMAL'
            and coalesce(v_enc.proveedor_id = any(array(select mis_proveedores(v_enc.tienda_id))), false)
            and v_etapa.orden = v_sig) then
      raise exception 'Sin permiso';
    end if;
    p_origen := 'PORTAL';
    p_forzar_blandas := true;   -- los avisos no bloquean al proveedor
  elsif p_tipo = 'REENTRADA' then
    if v_rol not in ('ADMIN','OPERATIVO') then raise exception 'Sin permiso'; end if;
    if v_act is null or v_etapa.orden >= v_act then raise exception 'VOLVER_ADELANTE'; end if;
  elsif p_tipo = 'NORMAL' then
    if v_rol not in ('ADMIN','OPERATIVO') and v_rol <> v_etapa.rol_ejecuta then
      raise exception 'ROL_NO_MARCA:%:%', v_rol, v_etapa.nombre;
    end if;
    if v_act is not null and v_etapa.orden <= v_act then raise exception 'PASO_ATRAS'; end if;
    if en_revision(p_encargo) then raise exception 'INCIDENCIA_ABIERTA'; end if;
    -- Saltar etapas intermedias solo lo hace Administración
    if v_rol <> 'ADMIN' then
      select string_agg(x.nombre, ', ' order by x.orden) into v_salta from etapa x
       where x.tipo_encargo_id = v_enc.tipo_encargo_id and x.orden > coalesce(v_act, -2147483648) and x.orden < v_etapa.orden;
      if v_salta is not null then raise exception 'SALTO_ETAPAS:%', v_salta; end if;
    end if;
    -- Ni siquiera Administración se salta la producción (crearía la orden de corte a medias) ni
    -- las condiciones de las etapas intermedias (tela recibida, taller, comprobaciones)
    select string_agg(x.nombre, ', ' order by x.orden) into v_salta from etapa x
     where x.tipo_encargo_id = v_enc.tipo_encargo_id and x.orden > coalesce(v_act, -2147483648) and x.orden < v_etapa.orden
       and x.es_produccion;
    if v_salta is not null then raise exception 'SALTO_PRODUCCION:%', v_salta; end if;
    select string_agg(d.mensaje || ' («' || x.nombre || '»)', ' · ' order by x.orden) into v_salta
      from etapa x cross join lateral puertas_pendientes_det(p_encargo, x.id) d
     where x.tipo_encargo_id = v_enc.tipo_encargo_id and x.orden > coalesce(v_act, -2147483648) and x.orden < v_etapa.orden
       and d.dura and d.tipo <> 'HITO_PREVIO';
    if v_salta is not null then raise exception 'Bloqueado: %', v_salta; end if;
  end if;
  -- INCIDENCIA: cualquier rol de la tienda, sobre la etapa en la que está

  if p_tipo = 'NORMAL' then
    select string_agg(mensaje, ' · ') into v_bloq
      from puertas_pendientes(p_encargo, v_etapa.id) where dura or not p_forzar_blandas;
    if v_bloq is not null then raise exception 'Bloqueado: %', v_bloq; end if;
  end if;

  insert into hito (encargo_id, etapa_id, tipo, usuario_id, origen, nota)
  values (p_encargo, v_etapa.id, p_tipo, auth.uid(), p_origen, p_nota)
  returning id into v_id;
  -- Volver atrás: los pasos de después quedan deshechos (hay que marcarlos otra vez). Se apunta
  -- qué los deshizo para poder restaurarlos si se deshace la vuelta.
  if p_tipo = 'REENTRADA' then
    update hito h set deshecho_en = now(), deshecho_por = v_id
      from etapa x
     where x.id = h.etapa_id and h.encargo_id = p_encargo and h.id <> v_id and h.deshecho_en is null
       and h.tipo in ('NORMAL','REENTRADA') and x.orden > v_etapa.orden;
  end if;
  return v_id;
end $$;

-- ---------- Deshacer recibido: solo antes de la etapa que pide el material ----------
drop function if exists desasignar_material(uuid);
create or replace function desasignar_material(p_linea uuid, p_forzar boolean default false) returns void
language plpgsql security definer set search_path = public as $$
declare l encargo_material%rowtype; c movimiento_material%rowtype; v_pedido boolean; v_act int; v_mat int; v_tipo uuid;
begin
  select * into l from encargo_material where id = p_linea for update;
  if l.id is null or not puede_material(l.tienda_id) then raise exception 'Sin permiso'; end if;
  if l.estado <> 'RECIBIDO' then return; end if;
  if not p_forzar then
    select e.tipo_encargo_id into v_tipo from encargo e where e.id = l.encargo_id;
    select x.orden into v_act from etapa x where x.id = etapa_actual(l.encargo_id);
    select min(x.orden) into v_mat from etapa x join puerta p on p.etapa_destino_id = x.id
     where x.tipo_encargo_id = v_tipo and p.tipo::text = 'MATERIAL';
    if v_act is not null and v_mat is not null and v_act >= v_mat then
      raise exception 'YA_EN_CAMINO';
    end if;
  end if;
  select * into c from movimiento_material where id = l.consumo_id;
  if c.id is not null and not c.revertido then
    perform mover_material(c.material_id, 'REVERSO', c.cantidad, -c.delta, l.encargo_id, null, c.id, 'Deshacer asignación');
  end if;
  -- Vuelve a «Pedido» solo si ese pedido sigue abierto y aún le queda algo por llegar
  v_pedido := exists (select 1 from pedido_linea_encargo ple join v_pedido_linea pl on pl.id = ple.linea_id
                       where ple.encargo_id = l.encargo_id and pl.material_id = l.material_id
                         and pl.cerrada_en is null and pl.pendiente > 0.001);
  perform set_config('hilo.movimiento', '1', true);
  update encargo_material set estado = case when v_pedido then 'PEDIDO' else 'PENDIENTE' end, consumo_id = null where id = p_linea;
  perform set_config('hilo.movimiento', '0', true);
end $$;
revoke all on function desasignar_material(uuid, boolean) from public, anon;
grant execute on function desasignar_material(uuid, boolean) to authenticated;

-- Al anular: devolver (sin mirar la etapa) o dar por usado
create or replace function liberar_material_encargo(p_encargo uuid, p_devolver boolean) returns int
language plpgsql security definer set search_path = public as $$
declare r record; n int := 0; v_t uuid;
begin
  select tienda_id into v_t from encargo where id = p_encargo;
  if v_t is null or coalesce(rol_en(v_t)::text, '') <> 'ADMIN' then raise exception 'Sin permiso'; end if;
  if p_devolver then
    for r in select id from encargo_material where encargo_id = p_encargo and estado = 'RECIBIDO' loop
      perform desasignar_material(r.id, true); n := n + 1;
    end loop;
    for r in select * from resto_material where encargo_id = p_encargo loop
      perform mover_material(r.material_id, 'AJUSTE', r.cantidad, r.cantidad, p_encargo, null, null, 'El resto vuelve al stock al anular');
      delete from resto_material where id = r.id;
    end loop;
  else
    update encargo set reaprovechar = true where id = p_encargo;
    select count(*) into n from encargo_material where encargo_id = p_encargo and estado = 'RECIBIDO';
  end if;
  return n;
end $$;

-- Asignar: sin cantidad no se da por recibido (abriría la puerta sin descontar nada)
create or replace function asignar_material(p_linea uuid) returns numeric
language plpgsql security definer set search_path = public as $$
declare l encargo_material%rowtype; v_mov uuid; v_cant numeric; v_stock numeric;
begin
  select * into l from encargo_material where id = p_linea for update;
  if l.id is null or not puede_material(l.tienda_id) then raise exception 'Sin permiso'; end if;
  if l.estado = 'RECIBIDO' then select stock into v_stock from material where id = l.material_id; return v_stock; end if;
  v_cant := coalesce(consumo_linea(p_linea), 0);
  if v_cant <= 0 then raise exception 'SIN_CANTIDAD'; end if;
  v_mov := mover_material(l.material_id, 'CONSUMO', v_cant, -v_cant, l.encargo_id, null, null, null);
  perform set_config('hilo.movimiento', '1', true);
  update encargo_material set estado = 'RECIBIDO', consumo_id = v_mov where id = p_linea;
  perform set_config('hilo.movimiento', '0', true);
  select stock into v_stock from material where id = l.material_id;
  return v_stock;
end $$;

-- Recepción: se reparte por orden de encargo y solo mientras alcance lo que hay
create or replace function recibir_linea(p_linea uuid, p_cantidad numeric, p_asignar boolean default false) returns jsonb
language plpgsql security definer set search_path = public as $$
declare l pedido_linea%rowtype; r record; v_asignados int := 0; v_quedan int := 0; v_stock numeric; v_cons numeric;
begin
  select * into l from pedido_linea where id = p_linea;
  if l.id is null or not puede_material(l.tienda_id) then raise exception 'Sin permiso'; end if;
  if p_cantidad is null or p_cantidad <= 0 then raise exception 'Indica cuánto ha llegado'; end if;
  perform mover_material(l.material_id, 'RECEPCION', p_cantidad, p_cantidad, null, p_linea, null, null);
  if p_asignar then
    for r in select em.id from encargo_material em
               join pedido_linea_encargo ple on ple.encargo_id = em.encargo_id and ple.linea_id = p_linea
               join encargo e on e.id = em.encargo_id and e.estado = 'ACTIVO'
              where em.material_id = l.material_id and em.estado = 'PEDIDO'
              order by e.creado_en, e.numero, em.creado_en loop
      select stock into v_stock from material where id = l.material_id;
      v_cons := coalesce(consumo_linea(r.id), 0);
      if v_cons > 0 and v_stock + 0.001 >= v_cons then
        perform asignar_material(r.id); v_asignados := v_asignados + 1;
      else
        v_quedan := v_quedan + 1;
      end if;
    end loop;
  end if;
  select stock into v_stock from material where id = l.material_id;
  return jsonb_build_object('stock', v_stock, 'asignados', v_asignados, 'sin_asignar', v_quedan);
end $$;

-- Quitar una línea que ya estaba pedida: suelta su hueco en el pedido (lo pedido llegará al stock)
create or replace function fn_encargo_material_soltar() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.estado = 'PEDIDO' and not exists (select 1 from encargo_material x where x.encargo_id = old.encargo_id
                                            and x.material_id = old.material_id and x.id <> old.id) then
    delete from pedido_linea_encargo ple using pedido_linea pl
     where pl.id = ple.linea_id and ple.encargo_id = old.encargo_id and pl.material_id = old.material_id;
  end if;
  return old;
end $$;
drop trigger if exists trg_encargo_material_soltar on encargo_material;
create trigger trg_encargo_material_soltar after delete on encargo_material for each row execute function fn_encargo_material_soltar();

-- Volver a una etapa anterior, todo junto: material (si se pide) + paso atrás
create or replace function volver_a_etapa(p_encargo uuid, p_etapa_clave text, p_devolver boolean default false, p_nota text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_enc encargo%rowtype; v_id uuid; v_ids uuid[] := '{}'; r record;
begin
  select * into v_enc from encargo where id = p_encargo for update;
  if v_enc.id is null then raise exception 'Encargo no encontrado'; end if;
  if coalesce(rol_en(v_enc.tienda_id)::text, '') not in ('ADMIN','OPERATIVO') then raise exception 'Sin permiso'; end if;
  if p_devolver then
    for r in select id from encargo_material where encargo_id = p_encargo and estado = 'RECIBIDO' loop
      perform desasignar_material(r.id, true); v_ids := v_ids || r.id;
    end loop;
  end if;
  v_id := crear_hito(p_encargo, p_etapa_clave, 'REENTRADA', p_nota);
  if cardinality(v_ids) > 0 then update hito set material_devuelto = v_ids where id = v_id; end if;
  return v_id;
end $$;
revoke all on function volver_a_etapa(uuid, text, boolean, text) from public, anon;
grant execute on function volver_a_etapa(uuid, text, boolean, text) to authenticated;

-- Deshacer: si lo último fue volver atrás, se restauran los pasos que deshizo y el material devuelto
create or replace function deshacer_ultimo_hito(p_encargo uuid, p_hito uuid default null) returns void
language plpgsql security definer set search_path = public as $$
declare v_enc encargo%rowtype; v_h hito%rowtype; v_rol rol_miembro; n int; v_l uuid;
begin
  select * into v_enc from encargo where id = p_encargo;
  if v_enc.id is null then raise exception 'Encargo no encontrado'; end if;
  if v_enc.estado <> 'ACTIVO' then raise exception 'El encargo está anulado'; end if;
  select * into v_h from hito where encargo_id = p_encargo and deshecho_en is null order by fecha desc limit 1;
  if v_h.id is null then raise exception 'No hay nada que deshacer'; end if;
  if p_hito is not null and v_h.id <> p_hito then raise exception 'YA_NO_ES_ULTIMO'; end if;
  if v_h.tipo <> 'INCIDENCIA' then
    select count(*) into n from hito where encargo_id = p_encargo and deshecho_en is null and tipo <> 'INCIDENCIA';
    if n <= 1 then raise exception 'NO_DESHACER_ALTA'; end if;
  end if;
  v_rol := rol_en(v_enc.tienda_id);
  if v_rol is null then
    if not (coalesce(v_enc.proveedor_id = any(array(select mis_proveedores(v_enc.tienda_id))), false)
            and v_h.origen = 'PORTAL' and v_h.usuario_id = auth.uid()
            and v_h.fecha > now() - interval '10 minutes') then
      raise exception 'Sin permiso';
    end if;
  elsif v_rol <> 'ADMIN' and not (v_h.usuario_id = auth.uid() and v_h.fecha > now() - interval '15 minutes') then
    raise exception 'SIN_PERMISO_DESHACER';
  end if;
  update hito set deshecho_en = now() where id = v_h.id;
  if v_h.tipo = 'REENTRADA' then
    update hito set deshecho_en = null, deshecho_por = null where deshecho_por = v_h.id;
    foreach v_l in array coalesce(v_h.material_devuelto, '{}') loop
      perform asignar_material(v_l);
    end loop;
  end if;
end $$;

-- Producción marcada otra vez (tras volver atrás): la hoja se vuelve a marcar para imprimir
create or replace function fn_hito_produccion() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_prod boolean; v_enc encargo%rowtype; v_activo boolean;
begin
  if new.tipo <> 'NORMAL' then return new; end if;
  select es_produccion into v_prod from etapa where id = new.etapa_id;
  if not coalesce(v_prod, false) then return new; end if;
  select * into v_enc from encargo where id = new.encargo_id;
  select coalesce((ajustes->'modulos'->>'produccion')::boolean, false) into v_activo from tienda where id = v_enc.tienda_id;
  if not v_activo then return new; end if;
  perform set_config('hilo.produccion', '1', true);
  insert into linea_produccion (tienda_id, encargo_id, producto_id, enviado_en, enviado_por)
  values (v_enc.tienda_id, v_enc.id, v_enc.producto_id, new.fecha, new.usuario_id)
  on conflict (encargo_id) do update
    set producto_id = excluded.producto_id, enviado_en = excluded.enviado_en, enviado_por = excluded.enviado_por,
        imprimir = true;
  perform set_config('hilo.produccion', '0', true);
  return new;
end $$;

-- ---------- Anular / recuperar: la decisión sobre el material manda ----------
create or replace function anular_encargo(p_encargo uuid, p_motivo text, p_devolver_material boolean default null) returns void
language plpgsql security definer set search_path = public as $$
declare v_enc encargo%rowtype; v_snap jsonb; v_hay boolean;
begin
  select * into v_enc from encargo where id = p_encargo;
  if v_enc.id is null then raise exception 'Encargo no encontrado'; end if;
  if not es_admin(v_enc.tienda_id) then raise exception 'Solo administración puede anular'; end if;
  if v_enc.estado <> 'ACTIVO' then raise exception 'Ya está anulado'; end if;
  v_hay := exists (select 1 from encargo_material where encargo_id = p_encargo and estado = 'RECIBIDO');
  if v_hay and p_devolver_material is null then raise exception 'ELEGIR_MATERIAL'; end if;
  if v_hay then perform liberar_material_encargo(p_encargo, p_devolver_material); end if;
  v_snap := jsonb_build_object(
    'encargo', to_jsonb(v_enc),
    'hitos',  (select coalesce(jsonb_agg(to_jsonb(h)), '[]') from hito h where h.encargo_id = p_encargo),
    'checks', (select coalesce(jsonb_agg(to_jsonb(c)), '[]') from check_encargo c where c.encargo_id = p_encargo));
  insert into anulacion (encargo_id, usuario_id, motivo, snapshot, material_devuelto)
  values (p_encargo, auth.uid(), nullif(trim(p_motivo), ''), v_snap, case when v_hay then p_devolver_material end);
  update encargo set estado = 'ANULADO' where id = p_encargo;
end $$;

create or replace function recuperar_encargo(p_encargo uuid, p_reiniciar boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare v_enc encargo%rowtype; v_primera uuid; v_dev boolean;
begin
  select * into v_enc from encargo where id = p_encargo;
  if v_enc.id is null then raise exception 'Encargo no encontrado'; end if;
  if not es_admin(v_enc.tienda_id) then raise exception 'Solo administración puede recuperar'; end if;
  if v_enc.estado <> 'ANULADO' then raise exception 'No está anulado'; end if;
  select a.material_devuelto into v_dev from anulacion a
   where a.encargo_id = p_encargo and a.recuperado_en is null order by a.fecha desc limit 1;
  -- Material devuelto: hay que empezar de nuevo (se volverá a descontar por el camino normal).
  -- Material dado por usado: vuelve tal como estaba (no se descuenta otra vez).
  if v_dev is true then p_reiniciar := true; elsif v_dev is false then p_reiniciar := false; end if;
  update encargo set estado = 'ACTIVO', reaprovechar = false where id = p_encargo;
  update anulacion set recuperado_en = now() where encargo_id = p_encargo and recuperado_en is null;
  if p_reiniciar then
    update hito set deshecho_en = now() where encargo_id = p_encargo and deshecho_en is null;
    select id into v_primera from etapa where tipo_encargo_id = v_enc.tipo_encargo_id order by orden limit 1;
    if v_primera is not null then
      insert into hito (encargo_id, etapa_id, tipo, usuario_id, origen, nota)
      values (p_encargo, v_primera, 'NORMAL', auth.uid(), 'APP', 'Recuperado: empieza de nuevo');
    end if;
  end if;
end $$;

create or replace function portal_encargos(p_tienda uuid, p_proveedor uuid default null)
returns table (
  id uuid, numero int, serie text, proveedor_id uuid, proveedor_nombre text,
  cliente_nombre text, producto_nombre text, producto_foto_url text,
  tipo_encargo_id uuid, datos jsonb, cliente_datos jsonb,
  etapa_actual_nombre text, carpeta text,
  siguiente_clave text, siguiente_nombre text, bloqueo text,
  hitos jsonb, actualizado_en timestamptz, complementos text
)
language plpgsql stable security definer set search_path = public as $$
declare v_provs uuid[]; v_solo boolean; v_per uuid;
begin
  if p_proveedor is not null then
    if not es_admin(p_tienda) then raise exception 'Solo administración puede ver como un proveedor'; end if;
    v_provs := array[p_proveedor];
  else
    select coalesce(array_agg(x), '{}') into v_provs from mis_proveedores(p_tienda) x;
  end if;

  -- Solo la temporada activa si la tienda lo pide (ajustes.solo_periodo_activo)
  select coalesce((tt.ajustes->>'solo_periodo_activo')::boolean, false) into v_solo from tienda tt where tt.id = p_tienda;
  select pa.id into v_per from periodo pa where pa.tienda_id = p_tienda and pa.activo limit 1;
  return query
  with base as (
    select e.*, ea.orden as act_orden, ea.nombre as act_nombre, ea.visible_para_proveedor as act_visible,
           (select min(x.orden) from etapa x where x.tipo_encargo_id = e.tipo_encargo_id and x.visible_para_proveedor) as vis_min,
           (select max(x.orden) from etapa x where x.tipo_encargo_id = e.tipo_encargo_id and x.visible_para_proveedor) as vis_max
      from encargo e
      left join etapa ea on ea.id = etapa_actual(e.id)
     where e.tienda_id = p_tienda and e.estado = 'ACTIVO' and e.proveedor_id = any(v_provs)
       and (not v_solo or v_per is null or e.periodo_id = v_per or e.periodo_id is null)
  )
  select b.id, b.numero, b.serie, b.proveedor_id, pv.nombre,
         nombre_para_proveedor(b.tienda_id, c.nombre), pr.nombre, pr.foto_url,
         b.tipo_encargo_id,
         filtrar_datos(b.datos, campos_visibles_proveedor(b.tienda_id, 'ENCARGO', b.tipo_encargo_id)),
         filtrar_datos(c.datos, campos_visibles_proveedor(b.tienda_id, 'CLIENTE', null)),
         case when b.act_visible then b.act_nombre end,
         case when b.act_orden >= b.vis_max then 'ENTREGADOS' else 'EN_CURSO' end,
         sig.clave, sig.nombre,
         case when sig.id is not null then (select string_agg(pp.mensaje, ' · ') from puertas_pendientes(b.id, sig.id) pp where pp.dura) end,
         (select coalesce(jsonb_agg(jsonb_build_object('nombre', x.nombre, 'fecha', h.fecha) order by h.fecha), '[]')
            from hito h join etapa x on x.id = h.etapa_id
           where h.encargo_id = b.id and h.deshecho_en is null and h.tipo <> 'INCIDENCIA' and x.visible_para_proveedor),
         b.actualizado_en,
         case when coalesce((t.ajustes->>'complementos_a_proveedor')::boolean, true) then b.complementos end
    from base b
    join tienda t on t.id = b.tienda_id
    join cliente c on c.id = b.cliente_id
    join proveedor pv on pv.id = b.proveedor_id
    left join producto pr on pr.id = b.producto_id
    left join lateral (
      select s.id, s.clave, s.nombre from etapa s
       where s.tipo_encargo_id = b.tipo_encargo_id and s.orden > coalesce(b.act_orden, -1)
       order by s.orden limit 1
    ) sn on true
    left join lateral (select sn.id, sn.clave, sn.nombre where exists (
      select 1 from etapa s where s.tipo_encargo_id = b.tipo_encargo_id and s.clave = sn.clave and s.marca_proveedor)) sig on true
   where b.vis_min is not null and b.act_orden >= b.vis_min
   order by b.numero desc;
end $$;

select 'ok 0054';
