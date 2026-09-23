-- =====================================================================
-- HILO · migración 0016 · periodos archivados y series de numeración
-- · Un periodo se puede archivar (sale de los selectores; sus encargos se conservan).
-- · Cada tipo de encargo puede tener su serie («S» → S001, S002…) con su propio contador.
-- =====================================================================
alter table periodo add column if not exists archivado boolean not null default false;

create or replace function activar_periodo(p_periodo uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_tienda uuid; v_arch boolean;
begin
  select tienda_id, archivado into v_tienda, v_arch from periodo where id = p_periodo;
  if not es_admin(v_tienda) then raise exception 'Solo administración'; end if;
  if v_arch then raise exception 'Ese periodo está archivado: sácalo del archivo antes de activarlo'; end if;
  update periodo set activo = false where tienda_id = v_tienda and activo and id <> p_periodo;
  update periodo set activo = true where id = p_periodo;
end $$;

create or replace function archivar_periodo(p_periodo uuid, p_archivar boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_tienda uuid; v_activo boolean;
begin
  select tienda_id, activo into v_tienda, v_activo from periodo where id = p_periodo;
  if not es_admin(v_tienda) then raise exception 'Solo administración'; end if;
  if p_archivar and v_activo then raise exception 'No se puede archivar el periodo activo: activa antes otro'; end if;
  update periodo set archivado = p_archivar where id = p_periodo;
end $$;
revoke all on function archivar_periodo(uuid, boolean) from public, anon;
grant execute on function archivar_periodo(uuid, boolean) to authenticated;

-- Series por tipo de encargo
alter table tipo_encargo add column if not exists serie text not null default '';
alter table encargo add column if not exists serie text not null default '';
drop index if exists encargo_numero_unico;
create unique index encargo_numero_unico on encargo
  (tienda_id, coalesce(periodo_id, '00000000-0000-0000-0000-000000000000'::uuid), serie, numero);

create or replace function siguiente_numero(p_tienda uuid, p_periodo uuid, p_serie text) returns int
language plpgsql as $$
declare v_reinicia boolean; v_max int;
begin
  select coalesce((ajustes->>'numeracion_reinicia_por_periodo')::boolean, true) into v_reinicia from tienda where id = p_tienda;
  if v_reinicia and p_periodo is not null then
    select coalesce(max(numero), 0) into v_max from encargo where tienda_id = p_tienda and periodo_id = p_periodo and serie = coalesce(p_serie, '');
  else
    select coalesce(max(numero), 0) into v_max from encargo where tienda_id = p_tienda and serie = coalesce(p_serie, '');
  end if;
  return v_max + 1;
end $$;
create or replace function siguiente_numero(p_tienda uuid, p_periodo uuid) returns int
language sql as $$ select siguiente_numero(p_tienda, p_periodo, '') $$;

-- Nº previsto al crear, según el tipo (la pantalla lo enseña antes de guardar)
create or replace function siguiente_numero_tipo(p_tipo uuid, p_periodo uuid) returns text
language plpgsql stable security definer set search_path = public as $$
declare v_t tipo_encargo%rowtype;
begin
  select * into v_t from tipo_encargo where id = p_tipo;
  if v_t.id is null or not es_miembro(v_t.tienda_id) then return null; end if;
  return v_t.serie || lpad(siguiente_numero(v_t.tienda_id, p_periodo, v_t.serie)::text, 3, '0');
end $$;
grant execute on function siguiente_numero_tipo(uuid, uuid) to authenticated;

create or replace function fn_encargo_numero() returns trigger language plpgsql as $$
begin
  select coalesce(serie, '') into new.serie from tipo_encargo where id = new.tipo_encargo_id;
  new.serie := coalesce(new.serie, '');
  if new.numero is null then
    perform pg_advisory_xact_lock(hashtextextended(new.tienda_id::text || ':' || coalesce(new.periodo_id::text, '') || ':' || new.serie, 0));
    new.numero := siguiente_numero(new.tienda_id, new.periodo_id, new.serie);
  end if;
  return new;
end $$;

-- La vista incluye ahora la serie (e.*): hay que rehacerla
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
