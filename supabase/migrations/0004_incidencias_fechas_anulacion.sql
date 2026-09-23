-- =====================================================================
-- HILO · migración 0004 · bloque 1 del catálogo (H-040, H-051, H-055, H-058)
--  1) Incidencias que se resuelven sin avanzar de etapa.
--  2) Fecha de un hito editable a mano, sin romper el orden del hilo.
--  3) Anular solo lo activo; recuperar tal cual o empezando el flujo de nuevo.
-- =====================================================================

-- ---------- 1) Resolver incidencias
alter table hito add column if not exists resuelto_en  timestamptz;
alter table hito add column if not exists resuelto_por uuid references auth.users(id);
alter table hito add column if not exists resolucion   text;

-- En revisión = el último hito vigente es una incidencia sin resolver
create or replace function en_revision(p_encargo uuid) returns boolean
language sql stable as $$
  select coalesce((select h.tipo = 'INCIDENCIA' and h.resuelto_en is null from hito h
     where h.encargo_id = p_encargo and h.deshecho_en is null
     order by h.fecha desc limit 1), false)
$$;

create or replace function resolver_incidencia(p_encargo uuid, p_nota text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_tienda uuid; v_hito uuid;
begin
  select tienda_id into v_tienda from encargo where id = p_encargo;
  if rol_en(v_tienda) is null then raise exception 'Sin permiso'; end if;
  select id into v_hito from hito
   where encargo_id = p_encargo and deshecho_en is null and tipo = 'INCIDENCIA' and resuelto_en is null
   order by fecha desc limit 1;
  if v_hito is null then raise exception 'No hay ninguna incidencia abierta'; end if;
  update hito set resuelto_en = now(), resuelto_por = auth.uid(), resolucion = nullif(trim(p_nota), '')
   where id = v_hito;
end $$;

-- ---------- 2) Cambiar la fecha de un hito
-- Solo ADMIN u OPERATIVO. No puede ir al futuro ni saltarse el hito anterior o el siguiente,
-- porque el orden del hilo decide la etapa actual.
create or replace function cambiar_fecha_hito(p_hito uuid, p_fecha timestamptz)
returns void language plpgsql security definer set search_path = public as $$
declare v_h hito%rowtype; v_tienda uuid; v_prev timestamptz; v_next timestamptz; v_tz text;
begin
  select * into v_h from hito where id = p_hito and deshecho_en is null;
  if v_h.id is null then raise exception 'Hito no encontrado'; end if;
  select e.tienda_id, coalesce(t.ajustes->>'zona_horaria', 'Europe/Madrid') into v_tienda, v_tz
    from encargo e join tienda t on t.id = e.tienda_id where e.id = v_h.encargo_id;
  if coalesce(rol_en(v_tienda)::text, '') not in ('ADMIN','OPERATIVO') then
    raise exception 'Solo administración u operativo pueden cambiar fechas';
  end if;
  if p_fecha > now() + interval '1 minute' then raise exception 'La fecha no puede ser futura'; end if;
  select max(fecha) into v_prev from hito
   where encargo_id = v_h.encargo_id and deshecho_en is null and id <> p_hito and fecha < v_h.fecha;
  select min(fecha) into v_next from hito
   where encargo_id = v_h.encargo_id and deshecho_en is null and id <> p_hito and fecha > v_h.fecha;
  if v_prev is not null and p_fecha < v_prev then
    raise exception 'La fecha no puede ser anterior al paso previo (%)', to_char(v_prev at time zone v_tz, 'DD/MM/YYYY HH24:MI');
  end if;
  if v_next is not null and p_fecha > v_next then
    raise exception 'La fecha no puede ser posterior al paso siguiente (%)', to_char(v_next at time zone v_tz, 'DD/MM/YYYY HH24:MI');
  end if;
  update hito set fecha = p_fecha where id = p_hito;
end $$;

-- ---------- 3) Anular y recuperar
create or replace function anular_encargo(p_encargo uuid, p_motivo text) returns void
language plpgsql security definer set search_path = public as $$
declare v_enc encargo%rowtype; v_snap jsonb;
begin
  select * into v_enc from encargo where id = p_encargo;
  if v_enc.id is null then raise exception 'Encargo no encontrado'; end if;
  if not es_admin(v_enc.tienda_id) then raise exception 'Solo administración puede anular'; end if;
  if v_enc.estado <> 'ACTIVO' then raise exception 'Ya está anulado'; end if;
  v_snap := jsonb_build_object(
    'encargo', to_jsonb(v_enc),
    'hitos',  (select coalesce(jsonb_agg(to_jsonb(h)), '[]') from hito h where h.encargo_id = p_encargo),
    'checks', (select coalesce(jsonb_agg(to_jsonb(c)), '[]') from check_encargo c where c.encargo_id = p_encargo));
  insert into anulacion (encargo_id, usuario_id, motivo, snapshot)
  values (p_encargo, auth.uid(), nullif(trim(p_motivo), ''), v_snap);
  update encargo set estado = 'ANULADO' where id = p_encargo;
end $$;

drop function if exists recuperar_encargo(uuid);
create or replace function recuperar_encargo(p_encargo uuid, p_reiniciar boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare v_enc encargo%rowtype; v_primera uuid;
begin
  select * into v_enc from encargo where id = p_encargo;
  if v_enc.id is null then raise exception 'Encargo no encontrado'; end if;
  if not es_admin(v_enc.tienda_id) then raise exception 'Solo administración puede recuperar'; end if;
  if v_enc.estado <> 'ANULADO' then raise exception 'No está anulado'; end if;
  update encargo set estado = 'ACTIVO' where id = p_encargo;
  update anulacion set recuperado_en = now() where encargo_id = p_encargo and recuperado_en is null;
  if p_reiniciar then
    update hito set deshecho_en = now() where encargo_id = p_encargo and deshecho_en is null;
    select id into v_primera from etapa where tipo_encargo_id = v_enc.tipo_encargo_id order by orden limit 1;
    if v_primera is not null then
      insert into hito (encargo_id, etapa_id, tipo, usuario_id, origen, nota)
      values (p_encargo, v_primera, 'NORMAL', auth.uid(), 'APP', 'Recuperado: empieza de nuevo');
    end if;
  end if;
end $$;

grant execute on function resolver_incidencia(uuid, text), cambiar_fecha_hito(uuid, timestamptz),
  anular_encargo(uuid, text), recuperar_encargo(uuid, boolean) to authenticated;
