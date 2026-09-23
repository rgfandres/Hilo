-- =====================================================================
-- HILO · migración 0011 · búsqueda en la lista de encargos
-- La vista de estado añade teléfono del cliente y nombre del tipo de encargo
-- (columnas nuevas al final: el resto no cambia).
-- =====================================================================
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
  (select coalesce(jsonb_agg(jsonb_build_object('mensaje', pp.mensaje, 'dura', pp.dura)), '[]')
     from puertas_pendientes(e.id, es.id) pp) as puertas_pendientes,
  c.telefono as cliente_telefono,
  te.nombre  as tipo_nombre
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
left join proveedor pv on pv.id = e.proveedor_id;
