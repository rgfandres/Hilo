-- =====================================================================
-- HILO · migración 0003 · cierre de fugas detectadas en el barrido
--  1) El proveedor externo solo ve lo que pasa por v_encargo_proveedor
--     (antes podía leer la tabla encargo, hitos con notas, precios y adjuntos).
--  2) Visibilidad por campo: cada campo configurable lleva "visible_proveedor".
--     Por defecto NO se ve. El nombre del cliente se rige por
--     tienda.ajustes.proveedor.ver_cliente = 'nombre' | 'iniciales' | 'no'.
--  3) Logística ya no puede editar cualquier columna del encargo:
--     asigna proveedor con la función asignar_proveedor().
--     Atención sí puede editar los encargos (antes podía crearlos pero no editarlos).
--  4) Numeración sin choques cuando se crean dos encargos a la vez.
-- =====================================================================

-- ---------- 1) Lecturas directas: solo miembros de la tienda
drop policy if exists encargo_sel  on encargo;
create policy encargo_sel on encargo for select using (es_miembro(tienda_id));

drop policy if exists hito_sel on hito;
create policy hito_sel on hito for select
  using (exists (select 1 from encargo e where e.id = encargo_id and es_miembro(e.tienda_id)));

drop policy if exists producto_sel on producto;
create policy producto_sel on producto for select using (es_miembro(tienda_id));

drop policy if exists prodprov_sel on producto_proveedor;
create policy prodprov_sel on producto_proveedor for select
  using (exists (select 1 from producto p where p.id = producto_id and es_miembro(p.tienda_id)));

drop policy if exists adjunto_sel on adjunto;
create policy adjunto_sel on adjunto for select using (es_miembro(tienda_id));

-- Mensajes de la tienda: el proveedor no los necesita
drop policy if exists plantilla_mensaje_sel on plantilla_mensaje;
create policy plantilla_mensaje_sel on plantilla_mensaje for select using (es_miembro(tienda_id));

-- ---------- 2) Visibilidad por campo
create or replace function campos_visibles_proveedor(p_tienda uuid, p_entidad entidad_campos, p_tipo uuid)
returns text[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(distinct c->>'clave'), '{}')
    from plantilla_campos pc, jsonb_array_elements(pc.campos) c
   where pc.tienda_id = p_tienda and pc.entidad = p_entidad
     and (pc.tipo_encargo_id is null or pc.tipo_encargo_id = p_tipo)
     and coalesce((c->>'visible_proveedor')::boolean, false)
$$;

create or replace function filtrar_datos(p_datos jsonb, p_claves text[])
returns jsonb language sql immutable as $$
  select coalesce(jsonb_object_agg(k, v), '{}'::jsonb)
    from jsonb_each(coalesce(p_datos, '{}'::jsonb)) as x(k, v)
   where k = any(p_claves)
$$;

create or replace function nombre_para_proveedor(p_tienda uuid, p_nombre text)
returns text language sql stable security definer set search_path = public as $$
  select case coalesce(t.ajustes->'proveedor'->>'ver_cliente', 'nombre')
           when 'no' then null
           when 'iniciales' then (
             select string_agg(left(w, 1) || '.', ' ')
               from regexp_split_to_table(trim(p_nombre), '\s+') w)
           else p_nombre
         end
    from tienda t where t.id = p_tienda
$$;

drop view if exists v_encargo_proveedor;
create view v_encargo_proveedor as
select e.id, e.tienda_id, e.numero, e.producto_id, e.proveedor_id, e.tipo_encargo_id,
       filtrar_datos(e.datos, campos_visibles_proveedor(e.tienda_id, 'ENCARGO', e.tipo_encargo_id)) as datos,
       et.clave  as etapa_actual_clave,
       et.nombre as etapa_actual_nombre,
       nombre_para_proveedor(e.tienda_id, c.nombre) as cliente_nombre,
       filtrar_datos(c.datos, campos_visibles_proveedor(e.tienda_id, 'CLIENTE', null)) as cliente_datos,
       pr.nombre   as producto_nombre,
       pr.foto_url as producto_foto_url,
       (select coalesce(jsonb_agg(jsonb_build_object('etapa', x.clave, 'nombre', x.nombre, 'fecha', h.fecha)
                                  order by h.fecha), '[]')
          from hito h join etapa x on x.id = h.etapa_id
         where h.encargo_id = e.id and h.deshecho_en is null and h.tipo <> 'INCIDENCIA'
           and x.visible_para_proveedor) as hitos
  from encargo e
  join cliente c on c.id = e.cliente_id
  left join etapa et on et.id = etapa_actual(e.id)
  left join producto pr on pr.id = e.producto_id
 where e.estado = 'ACTIVO'
   and e.proveedor_id in (select mis_proveedores(e.tienda_id));
grant select on v_encargo_proveedor to authenticated;

-- Tiendas ya existentes: medidas del cliente visibles; del encargo, todo salvo
-- datos comerciales o de agenda del cliente. Las tiendas nuevas empiezan en "no visible".
update plantilla_campos pc
   set campos = (select coalesce(jsonb_agg(c || '{"visible_proveedor": true}'::jsonb order by (c->>'orden')::int), '[]')
                   from jsonb_array_elements(pc.campos) c)
 where pc.entidad = 'CLIENTE';

update plantilla_campos pc
   set campos = (select coalesce(jsonb_agg(
                     case when c->>'clave' in ('evento','fecha_evento','feria','precio','importe')
                          then c else c || '{"visible_proveedor": true}'::jsonb end
                     order by (c->>'orden')::int), '[]')
                   from jsonb_array_elements(pc.campos) c)
 where pc.entidad = 'ENCARGO';

-- ---------- 3) Quién edita el encargo
drop policy if exists encargo_upd on encargo;
create policy encargo_upd on encargo for update
  using (rol_en(tienda_id) in ('ADMIN','OPERATIVO','ATENCION'))
  with check (rol_en(tienda_id) in ('ADMIN','OPERATIVO','ATENCION'));

create or replace function asignar_proveedor(p_encargo uuid, p_proveedor uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_tienda uuid;
begin
  select tienda_id into v_tienda from encargo where id = p_encargo and estado = 'ACTIVO';
  if v_tienda is null then raise exception 'Encargo no encontrado o anulado'; end if;
  if coalesce(rol_en(v_tienda)::text, '') not in ('ADMIN','OPERATIVO','LOGISTICA') then
    raise exception 'No tienes permiso para asignar proveedor';
  end if;
  if p_proveedor is not null and not exists (
       select 1 from proveedor where id = p_proveedor and tienda_id = v_tienda and activo) then
    raise exception 'Proveedor no válido o inactivo';
  end if;
  update encargo set proveedor_id = p_proveedor where id = p_encargo;
end $$;
revoke all on function asignar_proveedor(uuid, uuid) from public;
grant execute on function asignar_proveedor(uuid, uuid) to authenticated;

-- ---------- 4) Numeración: un candado por tienda+periodo durante la transacción
create or replace function fn_encargo_numero() returns trigger language plpgsql as $$
begin
  if new.numero is null then
    perform pg_advisory_xact_lock(hashtextextended(new.tienda_id::text || ':' || coalesce(new.periodo_id::text, ''), 0));
    new.numero := siguiente_numero(new.tienda_id, new.periodo_id);
  end if;
  return new;
end $$;
