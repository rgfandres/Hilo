-- =====================================================================
-- HILO · migración 0034 · materiales de varios tipos
-- Cada material tiene su propia unidad (m, uds, g…), si se pide y gasta
-- entero por encargo y hasta cuánto sobrante se guarda como resto.
-- Antes eran ajustes únicos de la tienda: servían para una tienda que solo
-- compra una clase de material, no para quien trabaja con varias.
-- Los valores actuales se copian a cada material para que nada cambie.
-- =====================================================================
alter table material add column if not exists unidad text;
alter table material add column if not exists por_encargo boolean;
alter table material add column if not exists resto_hasta numeric(12,2);

update material m set unidad = coalesce(nullif(btrim(t.ajustes->>'material_unidad'), ''), 'm')
  from tienda t where t.id = m.tienda_id and m.unidad is null;
update material m set por_encargo = coalesce(m.unidad_pedido, pv.unidad_pedido, 999999)
           <= coalesce((t.ajustes->>'unidad_por_encargo_max')::numeric, 10)
  from tienda t, material m2 left join proveedor pv on pv.id = m2.proveedor_id
 where m2.id = m.id and t.id = m.tienda_id and m.por_encargo is null;
update material m set resto_hasta = coalesce((t.ajustes->>'umbral_resto')::numeric, 5)
  from tienda t where t.id = m.tienda_id and m.resto_hasta is null;

alter table material alter column unidad set default 'uds';
update material set unidad = 'uds' where unidad is null or btrim(unidad) = '';
alter table material alter column unidad set not null;
alter table material alter column por_encargo set default false;
alter table material alter column por_encargo set not null;
do $$ begin
  alter table material add constraint material_unidad_ok check (btrim(unidad) <> '' and length(unidad) <= 12);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table material add constraint material_resto_ok check (resto_hasta is null or resto_hasta >= 0);
exception when duplicate_object then null; end $$;

-- Lo pedido para un encargo se gasta entero si ESE material se pide por encargo
create or replace function consumo_linea(p_linea uuid) returns numeric language sql stable as $$
  select coalesce((
    select ple.cantidad from pedido_linea_encargo ple
      join pedido_linea pl on pl.id = ple.linea_id
      join pedido_material pm on pm.id = pl.pedido_id
     where ple.encargo_id = em.encargo_id and pl.material_id = em.material_id and ple.cantidad > 0
       and m.por_encargo
     order by pm.fecha desc limit 1), em.cantidad)
  from encargo_material em
  join material m on m.id = em.material_id
  where em.id = p_linea
$$;

drop view if exists v_material_estado;
drop view if exists v_pedido_linea;
create view v_pedido_linea with (security_invoker = true) as
select pl.id, pl.pedido_id, pl.tienda_id, pl.material_id, pl.cantidad,
       pm.fecha, pm.proveedor_id, pm.notas as pedido_notas, pv.nombre as proveedor_nombre,
       m.tipo, m.variante, m.unidad,
       greatest(coalesce(rec.neto, 0), 0) as recibido,
       case when pl.cerrada_en is not null then 0 else greatest(pl.cantidad - coalesce(rec.neto, 0), 0) end as pendiente,
       case when pl.cantidad - coalesce(rec.neto, 0) <= 0.001 then 'RECIBIDO'
            when pl.cerrada_en is not null then 'CERRADA'
            when coalesce(rec.neto, 0) > 0.001 then 'PARCIAL' else 'PENDIENTE' end as estado,
       (select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'numero', e.numero, 'serie', e.serie, 'cliente', c.nombre, 'cantidad', ple.cantidad,
                                                     'activo', e.estado = 'ACTIVO' and not encargo_terminado(e.id))), '[]')
          from pedido_linea_encargo ple join encargo e on e.id = ple.encargo_id left join cliente c on c.id = e.cliente_id
         where ple.linea_id = pl.id) as encargos,
       pl.cerrada_en, pl.cerrada_motivo
from pedido_linea pl
join pedido_material pm on pm.id = pl.pedido_id
join material m on m.id = pl.material_id
left join proveedor pv on pv.id = pm.proveedor_id
left join lateral (
  select sum(case when mm.tipo = 'RECEPCION' then mm.cantidad when mm.tipo = 'REVERSO' then -mm.cantidad else 0 end) as neto
    from movimiento_material mm where mm.pedido_linea_id = pl.id and mm.tipo in ('RECEPCION','REVERSO')
      and not (mm.tipo = 'REVERSO' and exists (select 1 from movimiento_material o where o.id = mm.revierte_id and o.tipo = 'PEDIDO'))
) rec on true;
grant select on v_pedido_linea to authenticated;

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
  select sum(em.cantidad) as demanda, count(distinct em.encargo_id) as encargos,
         sum(em.cantidad) filter (where em.estado = 'PENDIENTE') as sin_pedir
    from encargo_material em join encargo e on e.id = em.encargo_id and e.estado = 'ACTIVO'
   where em.material_id = m.id and em.estado in ('PENDIENTE','PEDIDO') and not encargo_terminado(e.id)
) d on true
left join lateral (select sum(v.pendiente) as en_camino from v_pedido_linea v where v.material_id = m.id) c on true
left join lateral (select sum(rm.cantidad) as restos from resto_material rm where rm.material_id = m.id) r on true;
grant select on v_material_estado to authenticated;

select 'ok 0034';
