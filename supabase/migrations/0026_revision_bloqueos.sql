-- =====================================================================
-- HILO · migración 0026 · revisión: bloqueos y permisos
-- · crear_encargo(): el alta completa (cliente + encargo + primer paso) en una sola
--   operación: o se hace todo o nada (no quedan encargos a medias ni duplicados).
-- · Incidencias: cualquier miembro puede registrar una (no mueve el encargo).
-- · Portal: los avisos (condiciones que no bloquean) no bloquean al proveedor.
-- · Condiciones de material: si el módulo está apagado, no se exigen.
-- · Primera etapa: sus condiciones solo pueden avisar (si bloquean, no se podría crear nada).
-- · Invitaciones por enlace abierto (sin correo): nunca con rol de Administración.
-- =====================================================================

-- ---------- crear_hito: incidencias para cualquiera; en el portal los avisos no bloquean ----------
create or replace function crear_hito(
  p_encargo uuid, p_etapa_clave text,
  p_tipo tipo_hito default 'NORMAL', p_nota text default null,
  p_origen origen_hito default 'APP', p_forzar_blandas boolean default false
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_enc encargo%rowtype; v_etapa etapa%rowtype; v_rol rol_miembro; v_id uuid; v_bloq text;
begin
  select * into v_enc from encargo where id = p_encargo;
  if v_enc.id is null then raise exception 'Encargo no encontrado'; end if;
  if v_enc.estado <> 'ACTIVO' then raise exception 'El encargo está anulado'; end if;

  select * into v_etapa from etapa where tipo_encargo_id = v_enc.tipo_encargo_id and clave = p_etapa_clave;
  if v_etapa.id is null then raise exception 'Etapa % no existe para este tipo de encargo', p_etapa_clave; end if;

  v_rol := rol_en(v_enc.tienda_id);
  if v_rol is null then
    if not (v_etapa.marca_proveedor and p_tipo = 'NORMAL'
            and v_enc.proveedor_id in (select mis_proveedores(v_enc.tienda_id))) then
      raise exception 'Sin permiso';
    end if;
    p_origen := 'PORTAL';
    p_forzar_blandas := true;   -- los avisos no bloquean al proveedor
  elsif p_tipo <> 'INCIDENCIA' and v_rol not in ('ADMIN','OPERATIVO') and v_rol <> v_etapa.rol_ejecuta then
    raise exception 'ROL_NO_MARCA:%:%', v_rol, v_etapa.nombre;
  end if;

  if p_tipo = 'NORMAL' then
    select string_agg(mensaje, ' · ') into v_bloq
      from puertas_pendientes(p_encargo, v_etapa.id) where dura or not p_forzar_blandas;
    if v_bloq is not null then raise exception 'Bloqueado: %', v_bloq; end if;
  end if;

  insert into hito (encargo_id, etapa_id, tipo, usuario_id, origen, nota)
  values (p_encargo, v_etapa.id, p_tipo, auth.uid(), p_origen, p_nota)
  returning id into v_id;
  return v_id;
end $$;

-- ---------- Alta completa en una sola operación ----------
create or replace function crear_encargo(
  p_tienda uuid, p_periodo uuid, p_tipo uuid, p_cliente_id uuid, p_cliente jsonb, p_encargo jsonb
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_rol text; v_cli uuid; v_enc uuid; v_primera etapa%rowtype; v_bloq text;
begin
  v_rol := coalesce(rol_en(p_tienda)::text, '');
  if v_rol not in ('ADMIN','OPERATIVO','ATENCION') then raise exception 'Sin permiso'; end if;
  if not exists (select 1 from tipo_encargo where id = p_tipo and tienda_id = p_tienda and activo) then raise exception 'Tipo de encargo no válido'; end if;
  select * into v_primera from etapa where tipo_encargo_id = p_tipo order by orden limit 1;
  if v_primera.id is null then raise exception 'SIN_ETAPAS'; end if;

  if p_cliente_id is not null then
    if not exists (select 1 from cliente where id = p_cliente_id and tienda_id = p_tienda) then raise exception 'Cliente no válido'; end if;
    v_cli := p_cliente_id;
  else
    if coalesce(btrim(p_cliente->>'nombre'), '') = '' then raise exception 'Falta el nombre del cliente'; end if;
    insert into cliente (tienda_id, nombre, telefono, email, datos)
    values (p_tienda, btrim(p_cliente->>'nombre'), nullif(btrim(p_cliente->>'telefono'), ''), nullif(btrim(p_cliente->>'email'), ''), coalesce(p_cliente->'datos', '{}'))
    returning id into v_cli;
  end if;

  insert into encargo (tienda_id, periodo_id, tipo_encargo_id, cliente_id, producto_id, datos, complementos, importe, a_cuenta)
  values (p_tienda, p_periodo, p_tipo, v_cli, nullif(p_encargo->>'producto_id', '')::uuid, coalesce(p_encargo->'datos', '{}'),
          nullif(btrim(p_encargo->>'complementos'), ''), nullif(p_encargo->>'importe', '')::numeric, coalesce(nullif(p_encargo->>'a_cuenta', '')::numeric, 0))
  returning id into v_enc;

  -- Primer paso: lo marca quien crea (sea cual sea el rol de esa etapa); solo lo bloquean condiciones obligatorias
  select string_agg(mensaje, ' · ') into v_bloq from puertas_pendientes(v_enc, v_primera.id) where dura;
  if v_bloq is not null then raise exception 'Bloqueado: %', v_bloq; end if;
  insert into hito (encargo_id, etapa_id, tipo, usuario_id, origen) values (v_enc, v_primera.id, 'NORMAL', auth.uid(), 'APP');
  return v_enc;
end $$;
revoke all on function crear_encargo(uuid, uuid, uuid, uuid, jsonb, jsonb) from public, anon;
grant execute on function crear_encargo(uuid, uuid, uuid, uuid, jsonb, jsonb) to authenticated;

-- ---------- Condiciones de material: con el módulo apagado no se exigen ----------
create or replace function puertas_pendientes_det(p_encargo uuid, p_etapa uuid)
returns table (mensaje text, dura boolean, tipo text, referencia text)
language plpgsql stable as $$
declare p record; v_enc encargo%rowtype; v_ok boolean; v_mat boolean;
begin
  select * into v_enc from encargo where id = p_encargo;
  select coalesce((t.ajustes->'modulos'->>'materiales')::boolean, false) into v_mat from tienda t where t.id = v_enc.tienda_id;
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
    elsif p.tipo::text = 'MATERIAL' then
      v_ok := not v_mat
              or (exists (select 1 from encargo_material em where em.encargo_id = p_encargo)
                  and not exists (select 1 from encargo_material em where em.encargo_id = p_encargo and em.estado <> 'RECIBIDO'));
    end if;
    if not v_ok then mensaje := p.mensaje; dura := p.dura; tipo := p.tipo::text; referencia := p.referencia; return next; end if;
  end loop;
end $$;

-- ---------- Primera etapa: solo avisos ----------
create or replace function fn_puerta_primera() returns trigger language plpgsql as $$
begin
  if new.dura and not exists (select 1 from etapa e0 join etapa e on e.id = new.etapa_destino_id
                              where e0.tipo_encargo_id = e.tipo_encargo_id and e0.orden < e.orden) then
    raise exception 'PRIMERA_ETAPA';
  end if;
  return new;
end $$;
drop trigger if exists trg_puerta_primera on puerta;
create trigger trg_puerta_primera before insert or update on puerta for each row execute function fn_puerta_primera();
-- Las que ya existan en primeras etapas pasan a solo avisar
update puerta p set dura = false where dura and not exists (
  select 1 from etapa e0 join etapa e on e.id = p.etapa_destino_id where e0.tipo_encargo_id = e.tipo_encargo_id and e0.orden < e.orden);

-- ---------- Invitaciones abiertas: nunca como Administración ----------
do $$ begin
  alter table invitacion add constraint invitacion_abierta_no_admin check (email is not null or rol <> 'ADMIN') not valid;
exception when duplicate_object then null; end $$;

select 'ok 0026' as r;
