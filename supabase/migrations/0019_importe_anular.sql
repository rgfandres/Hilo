-- =====================================================================
-- HILO · migración 0019 · importe del encargo e impacto al anular
-- · Importe pactado y cantidad entregada a cuenta (lo pendiente se calcula).
-- · impacto_anular(): qué hay que hacer a mano si se anula (proveedor, dinero, avisos).
-- =====================================================================
alter table encargo add column if not exists importe  numeric(12,2);
alter table encargo add column if not exists a_cuenta numeric(12,2) not null default 0;
do $$ begin
  alter table encargo add constraint encargo_importes_ok check (coalesce(importe, 0) >= 0 and a_cuenta >= 0);
exception when duplicate_object then null; end $$;

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
    'n_hitos', (select count(*) from hito h where h.encargo_id = v_e.id and h.deshecho_en is null)
  ) into v;
  return v;
end $$;
revoke all on function impacto_anular(uuid) from public, anon;
grant execute on function impacto_anular(uuid) to authenticated;

-- La vista usa e.*: hay que rehacerla para que incluya las columnas nuevas
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

select 'ok 0019' as r;
