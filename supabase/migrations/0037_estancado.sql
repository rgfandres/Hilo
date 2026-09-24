-- 0037 · «Sin cambios» (estancado) configurable, para poder trabajar como Notelodigo:
--  · estancado_por = 'pasos': cuenta los días desde el último paso marcado (no desde la última edición).
--    Útil al pasar datos antiguos: la fecha de alta y de cada paso es la real, la de edición no.
--  · estancado_en_espera = true: también cuenta en las etapas de espera (en el taller, en el cortador…).
-- Sin estos ajustes, igual que antes.
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
  (not coalesce(ea.es_final, false)
     and (not coalesce(ea.es_espera, false) or coalesce((t.ajustes->>'estancado_en_espera')::boolean, false))
     and case when t.ajustes->>'estancado_por' = 'pasos'
              then coalesce(dx.dias, 0) > coalesce((t.ajustes->>'dias_estancado')::int, 10)
              else e.actualizado_en < now() - make_interval(days => coalesce((t.ajustes->>'dias_estancado')::int, 10)) end) as estancado,
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

select 'ok 0037' as r;
