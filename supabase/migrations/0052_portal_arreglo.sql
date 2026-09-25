-- 0052 · Arreglo de 0051: en portal_encargos «id» era ambiguo (columna de salida y de periodo)

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
       and (not v_solo or v_per is null or e.periodo_id = v_per)
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

select 'ok 0052';
