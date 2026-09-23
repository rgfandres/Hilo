-- =====================================================================
-- HILO · migración 0012 · bandejas, revisión y panel
-- · Marca manual «revisar» con nota (tabla propia, no toca el encargo).
-- · Grupo de etapa (para agrupar bandejas) y ajuste dias_atasco_proveedor.
-- · Vista de estado: días en la etapa, atascado en espera externa, marca
--   manual, nº de comentarios, grupo, si el siguiente paso es el final y
--   el tipo/referencia de cada puerta pendiente (para corregir en línea).
-- =====================================================================

create table if not exists marca_revisar (
  encargo_id uuid primary key references encargo(id) on delete cascade,
  tienda_id  uuid not null references tienda(id) on delete cascade,
  nota       text,
  usuario_id uuid references auth.users(id) default auth.uid(),
  fecha      timestamptz not null default now()
);
alter table marca_revisar enable row level security;
drop policy if exists marca_sel on marca_revisar;
create policy marca_sel on marca_revisar for select using (rol_en(tienda_id) is not null);

create or replace function marcar_revisar(p_encargo uuid, p_nota text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_tienda uuid;
begin
  select tienda_id into v_tienda from encargo where id = p_encargo;
  if coalesce(rol_en(v_tienda)::text, '') not in ('ADMIN', 'OPERATIVO', 'ATENCION') then raise exception 'Sin permiso'; end if;
  insert into marca_revisar (encargo_id, tienda_id, nota) values (p_encargo, v_tienda, nullif(trim(p_nota), ''))
  on conflict (encargo_id) do update set nota = excluded.nota, usuario_id = auth.uid(), fecha = now();
  insert into comentario (encargo_id, usuario_id, texto)
  values (p_encargo, auth.uid(), 'Marcado para revisar' || coalesce(': ' || nullif(trim(p_nota), ''), ''));
end $$;

create or replace function quitar_revisar(p_encargo uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_tienda uuid;
begin
  select tienda_id into v_tienda from encargo where id = p_encargo;
  if coalesce(rol_en(v_tienda)::text, '') not in ('ADMIN', 'OPERATIVO', 'ATENCION') then raise exception 'Sin permiso'; end if;
  if exists (select 1 from marca_revisar where encargo_id = p_encargo) then
    delete from marca_revisar where encargo_id = p_encargo;
    insert into comentario (encargo_id, usuario_id, texto) values (p_encargo, auth.uid(), 'Revisado: se quita la marca');
  end if;
end $$;
revoke all on function marcar_revisar(uuid, text), quitar_revisar(uuid) from public, anon;
grant execute on function marcar_revisar(uuid, text), quitar_revisar(uuid) to authenticated;

alter table etapa add column if not exists grupo text;

-- Puertas pendientes con su tipo y referencia (la versión corta se sigue usando en crear_hito)
create or replace function puertas_pendientes_det(p_encargo uuid, p_etapa uuid)
returns table (mensaje text, dura boolean, tipo text, referencia text)
language plpgsql stable as $$
declare p record; v_enc encargo%rowtype; v_ok boolean;
begin
  select * into v_enc from encargo where id = p_encargo;
  for p in select * from puerta where etapa_destino_id = p_etapa order by creado_en, id loop
    v_ok := true;
    if p.tipo = 'HITO_PREVIO' then
      v_ok := exists (select 1 from hito h join etapa e on e.id = h.etapa_id
                       where h.encargo_id = p_encargo and h.deshecho_en is null
                         and h.tipo <> 'INCIDENCIA' and e.clave = p.referencia);
    elsif p.tipo = 'CAMPO_NO_VACIO' then
      v_ok := case p.referencia
                when 'producto_id'  then v_enc.producto_id  is not null
                when 'proveedor_id' then v_enc.proveedor_id is not null
                else coalesce(v_enc.datos ->> p.referencia, '') <> ''
              end;
    elsif p.tipo = 'CHECK' then
      v_ok := coalesce((select c.marcado from check_encargo c
                         where c.encargo_id = p_encargo and c.clave = p.referencia), false);
    end if;
    if not v_ok then mensaje := p.mensaje; dura := p.dura; tipo := p.tipo::text; referencia := p.referencia; return next; end if;
  end loop;
end $$;

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
