-- =====================================================================
-- HILO · migración 0005 · lo que necesita la pantalla de Ajustes
--  1) Invitaciones al equipo por enlace (y por correo: se aceptan al entrar)
--  2) Reordenar etapas sin chocar con unique(tipo_encargo_id, orden)
--  3) Borrar etapas de forma segura
--  4) Activar un periodo (solo uno activo por tienda)
--  5) Equipo: ver el correo de los miembros y cambiar roles con seguridad
-- =====================================================================

-- ---------- 1) Invitaciones
create table if not exists invitacion (
  id           uuid primary key default gen_random_uuid(),
  tienda_id    uuid not null references tienda(id) on delete cascade,
  email        text,                       -- null = enlace abierto (cualquiera con el enlace)
  rol          rol_miembro not null default 'ATENCION',
  token        uuid not null unique default gen_random_uuid(),
  creado_por   uuid references auth.users(id) default auth.uid(),
  creado_en    timestamptz not null default now(),
  caduca_en    timestamptz not null default now() + interval '14 days',
  aceptada_en  timestamptz,
  aceptada_por uuid references auth.users(id),
  revocada_en  timestamptz
);
create index if not exists invitacion_tienda on invitacion (tienda_id);
create index if not exists invitacion_email on invitacion (lower(email));
alter table invitacion enable row level security;
create policy invitacion_adm on invitacion for all using (es_admin(tienda_id)) with check (es_admin(tienda_id));
grant select, insert, update, delete on invitacion to authenticated;

-- Aceptar un enlace concreto. El enlace con correo solo lo puede usar ese correo.
create or replace function aceptar_invitacion(p_token uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_inv invitacion%rowtype;
begin
  if auth.uid() is null then raise exception 'Inicia sesión para aceptar la invitación'; end if;
  select * into v_inv from invitacion where token = p_token;
  if v_inv.id is null or v_inv.revocada_en is not null then raise exception 'La invitación no existe o se ha anulado'; end if;
  if v_inv.caduca_en < now() then raise exception 'La invitación ha caducado. Pide un enlace nuevo'; end if;
  if v_inv.email is not null and lower(v_inv.email) <> mi_email() then
    raise exception 'Esta invitación es para otro correo';
  end if;
  if v_inv.email is not null and v_inv.aceptada_en is not null then
    raise exception 'Esta invitación ya se ha usado';
  end if;
  insert into miembro (tienda_id, user_id, email, rol, activo)
  values (v_inv.tienda_id, auth.uid(), mi_email(), v_inv.rol, true)
  on conflict (tienda_id, user_id) do update set activo = true;
  if v_inv.email is not null then
    update invitacion set aceptada_en = now(), aceptada_por = auth.uid() where id = v_inv.id;
  end if;
  return v_inv.tienda_id;
end $$;

-- Al entrar: si hay invitaciones pendientes para mi correo, se aceptan solas
create or replace function aceptar_invitaciones_pendientes()
returns int language plpgsql security definer set search_path = public as $$
declare v_inv invitacion%rowtype; n int := 0;
begin
  if auth.uid() is null or mi_email() = '' then return 0; end if;
  for v_inv in select * from invitacion
                where lower(email) = mi_email() and aceptada_en is null and revocada_en is null and caduca_en > now()
  loop
    insert into miembro (tienda_id, user_id, email, rol, activo)
    values (v_inv.tienda_id, auth.uid(), mi_email(), v_inv.rol, true)
    on conflict (tienda_id, user_id) do nothing;
    update invitacion set aceptada_en = now(), aceptada_por = auth.uid() where id = v_inv.id;
    n := n + 1;
  end loop;
  return n;
end $$;

-- Datos mínimos de un enlace, para la pantalla "Te han invitado a…" (sin exponer nada más)
create or replace function ver_invitacion(p_token uuid)
returns table (tienda text, rol rol_miembro, email text, valida boolean)
language sql stable security definer set search_path = public as $$
  select t.nombre, i.rol, i.email,
         (i.revocada_en is null and i.caduca_en > now() and (i.email is null or i.aceptada_en is null))
    from invitacion i join tienda t on t.id = i.tienda_id
   where i.token = p_token
$$;

-- ---------- 2) Reordenar etapas de un flujo (recibe los id en el orden deseado)
create or replace function reordenar_etapas(p_tipo uuid, p_ids uuid[])
returns void language plpgsql security definer set search_path = public as $$
declare v_tienda uuid; i int;
begin
  select tienda_id into v_tienda from tipo_encargo where id = p_tipo;
  if not es_admin(v_tienda) then raise exception 'Solo administración'; end if;
  if (select count(*) from etapa where tipo_encargo_id = p_tipo) <> coalesce(array_length(p_ids, 1), 0) then
    raise exception 'La lista de etapas no está completa';
  end if;
  update etapa set orden = -orden - 100000 where tipo_encargo_id = p_tipo;
  for i in 1 .. array_length(p_ids, 1) loop
    update etapa set orden = i * 10 where id = p_ids[i] and tipo_encargo_id = p_tipo;
  end loop;
end $$;

-- ---------- 3) Borrar una etapa (no si ya hay encargos que pasaron por ella)
create or replace function borrar_etapa(p_etapa uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_e etapa%rowtype; n int;
begin
  select * into v_e from etapa where id = p_etapa;
  if v_e.id is null then raise exception 'Etapa no encontrada'; end if;
  if not es_admin(v_e.tienda_id) then raise exception 'Solo administración'; end if;
  select count(distinct encargo_id) into n from hito where etapa_id = p_etapa;
  if n > 0 then
    raise exception 'No se puede borrar: % encargo(s) ya pasaron por esta etapa. Puedes renombrarla o moverla.', n;
  end if;
  delete from puerta p using etapa d
   where p.etapa_destino_id = d.id and d.tipo_encargo_id = v_e.tipo_encargo_id
     and p.tipo = 'HITO_PREVIO' and p.referencia = v_e.clave;
  delete from etapa where id = p_etapa;
end $$;

-- ---------- 4) Activar un periodo
create or replace function activar_periodo(p_periodo uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_tienda uuid;
begin
  select tienda_id into v_tienda from periodo where id = p_periodo;
  if not es_admin(v_tienda) then raise exception 'Solo administración'; end if;
  update periodo set activo = false where tienda_id = v_tienda and activo and id <> p_periodo;
  update periodo set activo = true where id = p_periodo;
end $$;

-- ---------- 5) Equipo
-- Un admin no puede quitarse a sí mismo el rol por accidente desde la app si es el último:
-- ya lo impide fn_proteger_ultimo_admin. Aquí solo añadimos una vista cómoda.
create or replace view v_equipo with (security_invoker = true) as
select m.tienda_id, m.user_id, m.email, m.rol, m.activo, m.creado_en,
       (m.user_id = auth.uid()) as soy_yo
  from miembro m;
grant select on v_equipo to authenticated;

-- ---------- 6) Etapas de espera: no cuentan como «estancado»
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
     from puertas_pendientes(e.id, es.id) pp) as puertas_pendientes
from encargo e
join tienda t on t.id = e.tienda_id
left join etapa ea on ea.id = etapa_actual(e.id)
left join etapa es on es.tipo_encargo_id = e.tipo_encargo_id
                  and es.orden = (select min(orden) from etapa x
                                   where x.tipo_encargo_id = e.tipo_encargo_id
                                     and x.orden > coalesce(ea.orden, -1))
left join cliente c   on c.id = e.cliente_id
left join producto pr on pr.id = e.producto_id
left join proveedor pv on pv.id = e.proveedor_id;

grant execute on function aceptar_invitacion(uuid), aceptar_invitaciones_pendientes(), ver_invitacion(uuid),
  reordenar_etapas(uuid, uuid[]), borrar_etapa(uuid), activar_periodo(uuid) to authenticated;
grant execute on function ver_invitacion(uuid) to anon;
