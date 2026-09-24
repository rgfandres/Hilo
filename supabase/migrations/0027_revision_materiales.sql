-- =====================================================================
-- HILO · migración 0027 · revisión: materiales, informes y periodos
-- · La demanda de material no cuenta encargos terminados (etapa final).
-- · Pedidos a proveedor: se pueden cerrar (anular lo pendiente); los encargos que
--   esperaban esa línea vuelven a «sin pedir» para que se propongan otra vez.
-- · Revertir una recepción no puede dejar el stock en negativo.
-- · Informes: los hitos de encargos anulados siguen contando en lo pasado.
-- · Hoja de producción: con el módulo apagado no se crean líneas.
-- =====================================================================
create or replace function encargo_terminado(p_encargo uuid) returns boolean language sql stable as $$
  select coalesce((select et.es_final from etapa et where et.id = etapa_actual(p_encargo)), false)
$$;

alter table pedido_linea add column if not exists cerrada_en timestamptz;
alter table pedido_linea add column if not exists cerrada_motivo text;

drop view if exists v_material_estado;
drop view if exists v_pedido_linea;
create view v_pedido_linea with (security_invoker = true) as
select pl.id, pl.pedido_id, pl.tienda_id, pl.material_id, pl.cantidad,
       pm.fecha, pm.proveedor_id, pm.notas as pedido_notas, pv.nombre as proveedor_nombre,
       m.tipo, m.variante,
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

-- Líneas de material de encargos en curso (para bandejas y propuestas)
create or replace view v_linea_material with (security_invoker = true) as
select em.id, em.encargo_id, em.material_id, em.cantidad, em.estado, em.creado_en, em.tienda_id,
       e.numero, e.serie, c.nombre as cliente_nombre
from encargo_material em
join encargo e on e.id = em.encargo_id and e.estado = 'ACTIVO'
left join cliente c on c.id = e.cliente_id
where em.estado <> 'RECIBIDO' and not encargo_terminado(e.id);
grant select on v_linea_material to authenticated;

-- Cerrar lo que falta de una línea de pedido (el proveedor no lo sirve o se anula)
create or replace function cerrar_linea_pedido(p_linea uuid, p_motivo text default null) returns void
language plpgsql security definer set search_path = public as $$
declare l pedido_linea%rowtype;
begin
  select * into l from pedido_linea where id = p_linea;
  if l.id is null or coalesce(rol_en(l.tienda_id)::text, '') not in ('ADMIN','OPERATIVO') then raise exception 'Sin permiso'; end if;
  if l.cerrada_en is not null then return; end if;
  update pedido_linea set cerrada_en = now(), cerrada_motivo = nullif(btrim(p_motivo), '') where id = p_linea;
  -- Los encargos que esperaban esta línea y aún no la tienen vuelven a «sin pedir»
  perform set_config('hilo.movimiento', '1', true);
  update encargo_material em set estado = 'PENDIENTE'
   where em.estado = 'PEDIDO' and em.material_id = l.material_id
     and em.encargo_id in (select ple.encargo_id from pedido_linea_encargo ple where ple.linea_id = p_linea);
  perform set_config('hilo.movimiento', '0', true);
  perform mover_material(l.material_id, 'REVERSO', 0, 0, null, p_linea, null, coalesce(nullif(btrim(p_motivo), ''), 'Pedido cerrado sin recibir lo pendiente'));
end $$;
revoke all on function cerrar_linea_pedido(uuid, text) from public, anon;
grant execute on function cerrar_linea_pedido(uuid, text) to authenticated;

-- Revertir: nunca deja el stock en negativo
create or replace function revertir_movimiento(p_mov uuid, p_motivo text default null) returns void
language plpgsql security definer set search_path = public as $$
declare c movimiento_material%rowtype; v_stock numeric;
begin
  select * into c from movimiento_material where id = p_mov;
  if c.id is null or coalesce(rol_en(c.tienda_id)::text, '') not in ('ADMIN','OPERATIVO') then raise exception 'Sin permiso'; end if;
  if c.revertido or c.tipo in ('REVERSO','CONSUMO','PEDIDO','RESTO') then raise exception 'Ese movimiento no se puede revertir desde aquí'; end if;
  select stock into v_stock from material where id = c.material_id;
  if v_stock - c.delta < 0 then raise exception 'NO_REVERTIR_STOCK'; end if;
  perform mover_material(c.material_id, 'REVERSO', c.cantidad, -c.delta, c.encargo_id, c.pedido_linea_id, c.id, coalesce(p_motivo, 'Revertido'));
end $$;

-- Informes: lo pasado no cambia al anular un encargo
create or replace view v_informe_hitos with (security_invoker = true) as
select h.id, h.encargo_id, h.fecha, h.tipo::text as tipo,
       e.tienda_id, e.periodo_id, e.tipo_encargo_id, e.numero, e.creado_en, e.estado::text as estado,
       e.producto_id, e.proveedor_id, e.datos,
       et.id as etapa_id, et.nombre as etapa_nombre, et.orden as etapa_orden, et.es_final,
       et.visible_para_proveedor as etapa_proveedor, et.es_espera
  from hito h
  join encargo e on e.id = h.encargo_id
  join etapa et on et.id = h.etapa_id
 where h.deshecho_en is null;
grant select on v_informe_hitos to authenticated;

-- Hoja de producción: con el módulo apagado, marcar la etapa no crea líneas
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
        imprimir = case when linea_produccion.impreso_en is null then true else linea_produccion.imprimir end;
  perform set_config('hilo.produccion', '0', true);
  return new;
end $$;

-- Hoja: una línea que deja de estar «enviada» (anulada, a revisar…) se desmarca para imprimir,
-- y una ya impresa que se anula se señala para avisar al taller
alter table linea_produccion add column if not exists aviso_anulado_visto boolean not null default false;

drop view if exists v_linea_produccion;
create view v_linea_produccion with (security_invoker = true) as
select l.*, e.numero, e.serie, e.estado as encargo_estado, e.producto_id as encargo_producto_id, e.complementos, e.datos,
       c.nombre as cliente_nombre, p.nombre as producto_nombre, pv.nombre as proveedor_nombre,
       ea.nombre as etapa_actual_nombre,
       env.enviado as sigue_enviado,
       array_remove(array[
         case when e.estado <> 'ACTIVO' then 'El encargo está anulado' end,
         case when e.producto_id is distinct from l.producto_id then 'Ha cambiado el producto del encargo' end,
         case when not coalesce(env.enviado, false) and e.estado = 'ACTIVO' then 'El paso de producción se deshizo' end,
         case when en_revision(e.id) or mr.encargo_id is not null then 'Está marcado para revisar' end
       ], null) as motivos,
       case when e.estado <> 'ACTIVO' then 'ANULADO'
            when e.producto_id is distinct from l.producto_id or en_revision(e.id) or mr.encargo_id is not null then 'REVISAR'
            when not coalesce(env.enviado, false) then 'NO_ENVIADO'
            else 'ENVIADO' end as coherencia
from linea_produccion l
join encargo e on e.id = l.encargo_id
left join cliente c on c.id = e.cliente_id
left join producto p on p.id = l.producto_id
left join proveedor pv on pv.id = e.proveedor_id
left join etapa ea on ea.id = etapa_actual(e.id)
left join marca_revisar mr on mr.encargo_id = e.id
left join lateral (
  select exists (select 1 from hito h join etapa x on x.id = h.etapa_id
                  where h.encargo_id = e.id and h.deshecho_en is null and h.tipo = 'NORMAL' and x.es_produccion) as enviado
) env on true;
grant select on v_linea_produccion to authenticated;

-- Proveedores: «asignados» sin contar lo ya terminado, y atascados (demasiados días en su mano)
create or replace view v_proveedores with (security_invoker = true) as
select p.id, p.tienda_id, p.nombre, p.activo, p.notas, p.telefono, p.email_contacto,
       (select count(*) from proveedor_usuario u where u.proveedor_id = p.id) as accesos,
       count(e.id) filter (where e.estado = 'ACTIVO' and ea.visible_para_proveedor
                             and exists (select 1 from etapa x where x.tipo_encargo_id = e.tipo_encargo_id
                                          and x.visible_para_proveedor and x.orden > ea.orden)) as en_su_mano,
       count(e.id) filter (where e.estado = 'ACTIVO' and not coalesce(ea.es_final, false)) as asignados,
       (select count(*) from v_encargo_estado v where v.proveedor_id = p.id and v.estado = 'ACTIVO' and v.atascado and v.en_proveedor) as atascados
  from proveedor p
  left join encargo e on e.proveedor_id = p.id
  left join etapa ea on ea.id = etapa_actual(e.id)
 group by p.id;
grant select on v_proveedores to authenticated;

select 'ok 0027' as r;
