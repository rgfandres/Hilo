-- B7 · «Revisado, sigue igual»: quien revisa un encargo estancado reinicia la cuenta de días
-- sin marcar ningún paso (como en la tienda de origen, donde guardar cualquier cambio la reiniciaba).
create table if not exists public.encargo_revisado (
  encargo_id uuid primary key references public.encargo(id) on delete cascade,
  tienda_id uuid not null references public.tienda(id) on delete cascade,
  usuario_id uuid default auth.uid(),
  fecha timestamptz not null default now()
);
alter table public.encargo_revisado enable row level security;
drop policy if exists revisado_sel on public.encargo_revisado;
create policy revisado_sel on public.encargo_revisado for select using (rol_en(tienda_id) is not null);
grant select on public.encargo_revisado to authenticated;

create or replace function public.revisado_sigue_igual(p_encargo uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_tienda uuid;
begin
  select tienda_id into v_tienda from encargo where id = p_encargo;
  if v_tienda is null then raise exception 'No existe'; end if;
  if coalesce(rol_en(v_tienda)::text, '') not in ('ADMIN', 'OPERATIVO', 'ATENCION') then raise exception 'Sin permiso'; end if;
  insert into encargo_revisado (encargo_id, tienda_id, usuario_id, fecha) values (p_encargo, v_tienda, auth.uid(), now())
    on conflict (encargo_id) do update set fecha = now(), usuario_id = auth.uid();
  insert into comentario (encargo_id, usuario_id, texto) values (p_encargo, auth.uid(), 'Revisado: sigue igual');
end $$;
grant execute on function public.revisado_sigue_igual(uuid) to authenticated;

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
              then least(coalesce(dx.dias, 0), coalesce(rv.dias, 2147483647)) > coalesce((t.ajustes->>'dias_estancado')::int, 10)
              else greatest(e.actualizado_en, rv.fecha) < now() - make_interval(days => coalesce((t.ajustes->>'dias_estancado')::int, 10)) end) as estancado,
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
) dx on true
left join lateral (
  select r.fecha, floor(extract(epoch from now() - r.fecha) / 86400)::int as dias
  from encargo_revisado r where r.encargo_id = e.id
) rv on true;
grant select on v_encargo_estado to authenticated;

-- Decisión de Andrés (25/09): «Marcar para revisar» bloquea avanzar, como el estado REVISAR de la tienda de origen.
-- Volver atrás e incidencias siguen permitidos; se quita la marca y se sigue.
create or replace function public.fn_hito_revisar_bloquea() returns trigger language plpgsql as $$
begin
  if new.tipo = 'NORMAL' and exists (select 1 from marca_revisar m where m.encargo_id = new.encargo_id) then
    raise exception 'MARCADO_REVISAR';
  end if;
  return new;
end $$;
drop trigger if exists trg_hito_revisar_bloquea on public.hito;
create trigger trg_hito_revisar_bloquea before insert on public.hito for each row execute function public.fn_hito_revisar_bloquea();

select 'ok 0062';
