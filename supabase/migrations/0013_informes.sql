-- =====================================================================
-- HILO · migración 0013 · informes
-- Hitos vigentes con lo necesario para contar por intervalo (fecha exacta),
-- por etapa, proveedor y producto. Las RLS de las tablas siguen mandando.
-- =====================================================================
create or replace view v_informe_hitos with (security_invoker = true) as
select h.id, h.encargo_id, h.fecha, h.tipo::text as tipo,
       e.tienda_id, e.periodo_id, e.tipo_encargo_id, e.numero, e.creado_en, e.estado::text as estado,
       e.producto_id, e.proveedor_id, e.datos,
       et.id as etapa_id, et.nombre as etapa_nombre, et.orden as etapa_orden, et.es_final,
       et.visible_para_proveedor as etapa_proveedor, et.es_espera
  from hito h
  join encargo e on e.id = h.encargo_id
  join etapa et on et.id = h.etapa_id
 where h.deshecho_en is null and e.estado = 'ACTIVO';
