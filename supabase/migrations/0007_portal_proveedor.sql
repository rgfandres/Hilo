-- =====================================================================
-- HILO · migración 0007 · portal del proveedor
--  - El proveedor ve solo los encargos que están o han estado en su mano:
--      «En curso»   = la etapa actual es visible para él y aún queda una etapa visible por delante
--      «Entregados» = ya pasó la última etapa visible para él
--    Lo que todavía no le ha llegado NO lo ve.
--  - Una etapa puede marcarla el propio proveedor (etapa.marca_proveedor).
--  - Administración puede «ver como» cualquier proveedor.
-- =====================================================================

alter table etapa add column if not exists marca_proveedor boolean not null default false;

-- CORRECCIÓN DE SEGURIDAD: para alguien que no es miembro, rol_en() es null y
-- es_admin() devolvía null, así que «if not es_admin(...)» no bloqueaba.
-- Afectaba a anular/recuperar, reordenar y borrar etapas y activar periodos.
create or replace function es_admin(p_tienda uuid) returns boolean
language sql stable as $$ select coalesce(rol_en(p_tienda) = 'ADMIN', false) $$;
create or replace function es_miembro(p_tienda uuid) returns boolean
language sql stable as $$ select rol_en(p_tienda) is not null $$;

-- El proveedor solo puede marcar etapas con marca_proveedor (antes bastaba con que fueran visibles)
create or replace function crear_hito(
  p_encargo uuid, p_etapa_clave text,
  p_tipo tipo_hito default 'NORMAL', p_nota text default null,
  p_origen origen_hito default 'APP', p_forzar_blandas boolean default false
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_enc encargo%rowtype; v_etapa etapa%rowtype; v_rol rol_miembro; v_id uuid; v_bloq text;
begin
  select * into v_enc from encargo where id = p_encargo;
  if v_enc.id is null then raise exception 'Encargo no encontrado'; end if;
  if v_enc.estado <> 'ACTIVO' then raise exception 'El encargo está anulado'; end if;

  select * into v_etapa from etapa
   where tipo_encargo_id = v_enc.tipo_encargo_id and clave = p_etapa_clave;
  if v_etapa.id is null then raise exception 'Etapa % no existe para este tipo de encargo', p_etapa_clave; end if;

  v_rol := rol_en(v_enc.tienda_id);
  if v_rol is null then
    if not (v_etapa.marca_proveedor and p_tipo = 'NORMAL'
            and v_enc.proveedor_id in (select mis_proveedores(v_enc.tienda_id))) then
      raise exception 'Sin permiso';
    end if;
    p_origen := 'PORTAL';
    p_forzar_blandas := false;
  elsif v_rol not in ('ADMIN','OPERATIVO') and v_rol <> v_etapa.rol_ejecuta then
    raise exception 'El rol % no puede marcar la etapa %', v_rol, p_etapa_clave;
  end if;

  if p_tipo = 'NORMAL' then
    select string_agg(mensaje, ' · ') into v_bloq
      from puertas_pendientes(p_encargo, v_etapa.id) where dura or not p_forzar_blandas;
    if v_bloq is not null then raise exception 'Bloqueado: %', v_bloq; end if;
  end if;

  insert into hito (encargo_id, etapa_id, tipo, usuario_id, origen, nota)
  values (p_encargo, v_etapa.id, p_tipo, auth.uid(), p_origen, p_nota)
  returning id into v_id;
  return v_id;
end $$;

-- Encargos del portal. p_proveedor: solo para «ver como» (exige administración).
create or replace function portal_encargos(p_tienda uuid, p_proveedor uuid default null)
returns table (
  id uuid, numero int, proveedor_id uuid, proveedor_nombre text,
  cliente_nombre text, producto_nombre text, producto_foto_url text,
  tipo_encargo_id uuid, datos jsonb, cliente_datos jsonb,
  etapa_actual_nombre text, carpeta text,
  siguiente_clave text, siguiente_nombre text,
  hitos jsonb, actualizado_en timestamptz
)
language plpgsql stable security definer set search_path = public as $$
declare v_provs uuid[];
begin
  if p_proveedor is not null then
    if not es_admin(p_tienda) then raise exception 'Solo administración puede ver como un proveedor'; end if;
    v_provs := array[p_proveedor];
  else
    select coalesce(array_agg(x), '{}') into v_provs from mis_proveedores(p_tienda) x;
  end if;

  return query
  with base as (
    select e.*, ea.orden as act_orden, ea.nombre as act_nombre, ea.visible_para_proveedor as act_visible,
           (select min(x.orden) from etapa x where x.tipo_encargo_id = e.tipo_encargo_id and x.visible_para_proveedor) as vis_min,
           (select max(x.orden) from etapa x where x.tipo_encargo_id = e.tipo_encargo_id and x.visible_para_proveedor) as vis_max
      from encargo e
      left join etapa ea on ea.id = etapa_actual(e.id)
     where e.tienda_id = p_tienda and e.estado = 'ACTIVO' and e.proveedor_id = any(v_provs)
  )
  select b.id, b.numero, b.proveedor_id, pv.nombre,
         nombre_para_proveedor(b.tienda_id, c.nombre), pr.nombre, pr.foto_url,
         b.tipo_encargo_id,
         filtrar_datos(b.datos, campos_visibles_proveedor(b.tienda_id, 'ENCARGO', b.tipo_encargo_id)),
         filtrar_datos(c.datos, campos_visibles_proveedor(b.tienda_id, 'CLIENTE', null)),
         case when b.act_visible then b.act_nombre end,
         case when b.act_orden >= b.vis_max then 'ENTREGADOS' else 'EN_CURSO' end,
         sig.clave, sig.nombre,
         (select coalesce(jsonb_agg(jsonb_build_object('nombre', x.nombre, 'fecha', h.fecha) order by h.fecha), '[]')
            from hito h join etapa x on x.id = h.etapa_id
           where h.encargo_id = b.id and h.deshecho_en is null and h.tipo <> 'INCIDENCIA' and x.visible_para_proveedor),
         b.actualizado_en
    from base b
    join cliente c on c.id = b.cliente_id
    join proveedor pv on pv.id = b.proveedor_id
    left join producto pr on pr.id = b.producto_id
    left join lateral (
      select s.clave, s.nombre from etapa s
       where s.tipo_encargo_id = b.tipo_encargo_id and s.orden > coalesce(b.act_orden, -1)
       order by s.orden limit 1
    ) sn on true
    left join lateral (select sn.clave, sn.nombre where exists (
      select 1 from etapa s where s.tipo_encargo_id = b.tipo_encargo_id and s.clave = sn.clave and s.marca_proveedor)) sig on true
   where b.vis_min is not null and b.act_orden >= b.vis_min
   order by b.numero desc;
end $$;
grant execute on function portal_encargos(uuid, uuid) to authenticated;

-- CORRECCIÓN DE SEGURIDAD: un proveedor podía deshacer el último paso de CUALQUIER encargo
-- de la tienda. Ahora solo el suyo, solo si ese paso lo marcó él desde el portal y
-- dentro de los 10 minutos siguientes.
create or replace function deshacer_ultimo_hito(p_encargo uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_enc encargo%rowtype; v_h hito%rowtype;
begin
  select * into v_enc from encargo where id = p_encargo;
  if v_enc.id is null then raise exception 'Encargo no encontrado'; end if;
  select * into v_h from hito where encargo_id = p_encargo and deshecho_en is null order by fecha desc limit 1;
  if v_h.id is null then raise exception 'No hay nada que deshacer'; end if;
  if rol_en(v_enc.tienda_id) is null then
    if not (v_enc.proveedor_id in (select mis_proveedores(v_enc.tienda_id))
            and v_h.origen = 'PORTAL' and v_h.usuario_id = auth.uid()
            and v_h.fecha > now() - interval '10 minutes') then
      raise exception 'Sin permiso';
    end if;
  end if;
  update hito set deshecho_en = now() where id = v_h.id;
end $$;
