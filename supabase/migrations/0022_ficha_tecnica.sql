-- =====================================================================
-- HILO · migración 0022 · ficha técnica del producto y complementos
-- · producto: tipo de material principal, consumo por unidad (escandallo),
--   tipo de construcción y receta de complementos (solo pista, nunca autocompleta).
-- · encargo.complementos: la variante concreta de los complementos de este encargo.
-- =====================================================================
alter table producto add column if not exists material_tipo  text;
alter table producto add column if not exists consumo        numeric(12,2);
alter table producto add column if not exists construccion   text;
alter table producto add column if not exists receta         text;
do $$ begin
  alter table producto add constraint producto_consumo_ok check (consumo is null or consumo >= 0);
exception when duplicate_object then null; end $$;

alter table encargo add column if not exists complementos text;

create or replace view v_productos with (security_invoker = true) as
select pr.id, pr.tienda_id, pr.nombre, pr.foto_url, pr.precio_base, pr.activo, pr.datos,
       count(e.id) filter (where e.estado = 'ACTIVO') as encargos,
       pr.material_tipo, pr.consumo, pr.construccion, pr.receta
  from producto pr
  left join encargo e on e.producto_id = pr.id
 group by pr.id;
grant select on v_productos to authenticated;

-- La vista usa e.*: se rehace para que incluya encargo.complementos
drop view if exists v_encargo_estado;
create or replace view v_encargo_estado with (security_invoker = true) as
select
  e.*,
  ea.id      as etapa_actual_id,
  ea.clave   as etapa_actual_clave,
  ea.nombre  as etapa_actual_nombre,
  ea.orden   as etapa_actual_orden,
  ea.es_final,
  es.id      as etapa_siguiente_id,
  es.clave   as etapa_siguiente_clave,
  es.nombre  as etapa_siguiente_nombre,
  es.rol_ejecuta as etapa_siguiente_rol,
  en_revision(e.id) as en_revision,
  (e.actualizado_en < now() - make_interval(days => coalesce((t.ajustes->>'dias_estancado')::int, 10))
     and not coalesce(ea.es_final, false) and not coalesce(ea.es_espera, false)) as estancado,
  c.nombre   as cliente_nombre,
  pr.nombre  as producto_nombre,
  pv.nombre  as proveedor_nombre,
  (select coalesce(jsonb_agg(jsonb_build_object('mensaje', pp.mensaje, 'dura', pp.dura, 'tipo', pp.tipo, 'referencia', pp.referencia)), '[]')
     from puertas_pendientes_det(e.id, es.id) pp) as puertas_pendientes,
  c.telefono as cliente_telefono,
  te.nombre  as tipo_nombre,
  ea.grupo   as etapa_grupo,
  coalesce(ea.es_espera, false) as es_espera,
  coalesce(es.es_final, false)  as siguiente_es_final,
  coalesce(ea.visible_para_proveedor, false) as en_proveedor,
  dx.dias    as dias_en_etapa,
  (coalesce(ea.es_espera, false) and not coalesce(ea.es_final, false)
     and dx.dias > coalesce((t.ajustes->>'dias_atasco_proveedor')::int, 15)) as atascado,
  (mr.encargo_id is not null) as revisar_manual,
  mr.nota    as revisar_nota,
  (select count(*) from comentario co where co.encargo_id = e.id)::int as n_comentarios
from encargo e
join tienda t on t.id = e.tienda_id
join tipo_encargo te on te.id = e.tipo_encargo_id
left join etapa ea on ea.id = etapa_actual(e.id)
left join etapa es on es.tipo_encargo_id = e.tipo_encargo_id
                  and es.orden = (select min(orden) from etapa x
                                   where x.tipo_encargo_id = e.tipo_encargo_id
                                     and x.orden > coalesce(ea.orden, -1))
left join cliente c   on c.id = e.cliente_id
left join producto pr on pr.id = e.producto_id
left join proveedor pv on pv.id = e.proveedor_id
left join marca_revisar mr on mr.encargo_id = e.id
left join lateral (
  select floor(extract(epoch from now() - max(h.fecha)) / 86400)::int as dias
  from hito h where h.encargo_id = e.id and h.deshecho_en is null and h.tipo <> 'INCIDENCIA'
) dx on true;
grant select on v_encargo_estado to authenticated;


select 'ok 0022' as r;
