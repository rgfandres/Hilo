-- =====================================================================
-- HILO · migración 0030 · barrido 2, tanda 1: seguridad del servidor
--  S-01 El encargo solo se edita en sus columnas editables; lo demás, por RPC
--  S-02 Pasos: normal solo hacia delante; «volver» solo hacia atrás y solo gestión
--  S-03 Portal: comparación a prueba de NULL; el proveedor solo marca la siguiente
--  S-04 Deshacer por id de paso, con permisos, nunca el alta, solo encargos activos
--  S-05 Verificación en dos pasos y formas de entrar exigidas en el servidor
--  S-06 Dominios aprobados validados en el servidor
--  S-07 Invitaciones: un enlace nunca reactiva; elección determinista; reinvitar cambia rol
--  S-08 Pertenencia a la tienda en crear_encargo, crear_pedido y líneas de material
--  S-09 Fuera la vista antigua del portal
--  S-10 Correo vacío ya no es comodín; restricción de invitaciones validada
--  S-11 Flujos: una sola final, reordenar validado, primera etapa nunca bloquea el alta
--  S-12 El autor de comentarios y mensajes es siempre quien está en la sesión
--  S-13 Adjuntos: mismos roles en la tabla y en el almacenamiento
--  S-14 search_path fijo, permisos de escritura retirados, encargos anulados
--  S-15 Borrados y actividad
--  S-16 Índices
--  S-17 Correo confirmado para invitaciones y portal
--  L-01 Incidencia abierta: «en revisión» mientras haya alguna abierta y no se avanza
--  D-01 Logística no registra avisos al cliente · D-02 Informes solo Administración
-- =====================================================================

-- ---------- S-17 · Correo de la sesión, solo si está confirmado ----------
create or replace function mi_email() returns text
language sql stable security definer set search_path = public, auth as $$
  select case when exists (select 1 from auth.users u where u.id = auth.uid() and u.email_confirmed_at is not null)
              then lower(coalesce(auth.jwt() ->> 'email', '')) else '' end
$$;

-- ---------- S-05 · Sesión válida para la tienda (2 pasos y forma de entrar) ----------
create or replace function sesion_ok(p_tienda uuid) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare s jsonb; v_amr text[]; v_ok boolean := false; m text;
begin
  select ajustes->'seguridad' into s from tienda where id = p_tienda;
  if s is null then return true; end if;
  if coalesce((s->>'exigir_2fa')::boolean, false) and coalesce(auth.jwt() ->> 'aal', '') <> 'aal2' then return false; end if;
  -- Métodos de esta sesión (amr): password / otp·magiclink / oauth
  select array_agg(coalesce(x->>'method', x #>> '{}')) into v_amr
    from jsonb_array_elements(case when jsonb_typeof(auth.jwt() -> 'amr') = 'array' then auth.jwt() -> 'amr' else '[]'::jsonb end) x;
  if v_amr is null or not (v_amr && array['password','otp','magiclink','oauth']) then return true; end if;
  foreach m in array v_amr loop
    if (m = 'password' and coalesce((s->'metodos'->>'password')::boolean, true))
       or (m in ('otp','magiclink') and coalesce((s->'metodos'->>'enlace')::boolean, true))
       or (m = 'oauth' and coalesce((s->'metodos'->>'google')::boolean, true)) then v_ok := true; end if;
  end loop;
  return v_ok;
end $$;

-- Pertenencia sin mirar la sesión: solo para leer la tienda y el propio rol (la app pide
-- entonces los 2 pasos o volver a entrar); todo lo demás pasa por rol_en, que sí la mira.
create or replace function es_miembro_base(p_tienda uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from miembro m where m.tienda_id = p_tienda and m.user_id = auth.uid() and m.activo)
$$;

create or replace function rol_en(p_tienda uuid) returns rol_miembro
language sql stable security definer set search_path = public as $$
  select m.rol from miembro m
   where m.tienda_id = p_tienda and m.user_id = auth.uid() and m.activo and sesion_ok(p_tienda)
$$;

drop policy if exists tienda_sel on tienda;
create policy tienda_sel on tienda for select using (es_miembro_base(id) or es_proveedor(id));
drop policy if exists miembro_sel on miembro;
create policy miembro_sel on miembro for select using (user_id = auth.uid() or es_miembro(tienda_id));

-- ---------- S-10 · Proveedores: sesión y correo de verdad ----------
create or replace function mis_proveedores(p_tienda uuid) returns setof uuid
language sql stable security definer set search_path = public as $$
  select p.id from proveedor p
    join proveedor_usuario pu on pu.proveedor_id = p.id
   where auth.uid() is not null and mi_email() <> ''
     and p.tienda_id = p_tienda and p.activo and lower(pu.email) = mi_email()
$$;

delete from proveedor_usuario where email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$';
do $$ begin
  alter table proveedor_usuario add constraint proveedor_usuario_email_ok check (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$');
exception when duplicate_object then null; end $$;

delete from invitacion where email is not null and email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$';
delete from invitacion where email is null and rol = 'ADMIN';
do $$ begin
  alter table invitacion add constraint invitacion_email_ok check (email is null or email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$');
exception when duplicate_object then null; end $$;
alter table invitacion validate constraint invitacion_abierta_no_admin;

-- ---------- S-01 · El encargo se edita solo en lo editable ----------
revoke insert, update, delete on encargo from authenticated;
grant update (producto_id, datos, importe, a_cuenta, complementos) on encargo to authenticated;

create or replace function fn_encargo_misma_tienda() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.cliente_id is not null and not exists (select 1 from cliente where id = new.cliente_id and tienda_id = new.tienda_id) then
    raise exception 'OTRA_TIENDA:cliente'; end if;
  if new.producto_id is not null and not exists (select 1 from producto where id = new.producto_id and tienda_id = new.tienda_id) then
    raise exception 'OTRA_TIENDA:producto'; end if;
  if new.proveedor_id is not null and not exists (select 1 from proveedor where id = new.proveedor_id and tienda_id = new.tienda_id) then
    raise exception 'OTRA_TIENDA:proveedor'; end if;
  if new.periodo_id is not null and not exists (select 1 from periodo where id = new.periodo_id and tienda_id = new.tienda_id) then
    raise exception 'OTRA_TIENDA:periodo'; end if;
  if not exists (select 1 from tipo_encargo where id = new.tipo_encargo_id and tienda_id = new.tienda_id) then
    raise exception 'OTRA_TIENDA:tipo'; end if;
  return new;
end $$;
drop trigger if exists trg_encargo_misma_tienda on encargo;
create trigger trg_encargo_misma_tienda before insert or update of cliente_id, producto_id, proveedor_id, periodo_id, tipo_encargo_id, tienda_id
  on encargo for each row execute function fn_encargo_misma_tienda();

-- Lo entregado a cuenta no puede superar el importe (C-02, también en el servidor)
do $$ begin
  alter table encargo add constraint encargo_a_cuenta_ok check (importe is null or a_cuenta <= importe) not valid;
exception when duplicate_object then null; end $$;
do $$ begin alter table encargo validate constraint encargo_a_cuenta_ok; exception when others then null; end $$;

-- ---------- L-01 · Incidencias: abiertas hasta resolverlas ----------
create or replace function en_revision(p_encargo uuid) returns boolean
language sql stable as $$
  select exists (select 1 from hito h where h.encargo_id = p_encargo and h.deshecho_en is null
                   and h.tipo = 'INCIDENCIA' and h.resuelto_en is null)
$$;

-- ---------- S-02 / S-03 · Marcar un paso ----------
create or replace function crear_hito(
  p_encargo uuid, p_etapa_clave text,
  p_tipo tipo_hito default 'NORMAL', p_nota text default null,
  p_origen origen_hito default 'APP', p_forzar_blandas boolean default false
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_enc encargo%rowtype; v_etapa etapa%rowtype; v_rol rol_miembro; v_id uuid; v_bloq text; v_act int; v_salta text; v_sig int;
begin
  select * into v_enc from encargo where id = p_encargo;
  if v_enc.id is null then raise exception 'Encargo no encontrado'; end if;
  if v_enc.estado <> 'ACTIVO' then raise exception 'El encargo está anulado'; end if;

  select * into v_etapa from etapa where tipo_encargo_id = v_enc.tipo_encargo_id and clave = p_etapa_clave;
  if v_etapa.id is null then raise exception 'Etapa % no existe para este tipo de encargo', p_etapa_clave; end if;
  select x.orden into v_act from etapa x where x.id = etapa_actual(p_encargo);
  select min(x.orden) into v_sig from etapa x where x.tipo_encargo_id = v_enc.tipo_encargo_id and x.orden > coalesce(v_act, -2147483648);

  v_rol := rol_en(v_enc.tienda_id);
  if v_rol is null then
    -- Portal: solo su encargo, solo la etapa siguiente y solo si la marca el proveedor
    if not (v_etapa.marca_proveedor and p_tipo = 'NORMAL'
            and coalesce(v_enc.proveedor_id = any(array(select mis_proveedores(v_enc.tienda_id))), false)
            and v_etapa.orden = v_sig) then
      raise exception 'Sin permiso';
    end if;
    p_origen := 'PORTAL';
    p_forzar_blandas := true;   -- los avisos no bloquean al proveedor
  elsif p_tipo = 'REENTRADA' then
    if v_rol not in ('ADMIN','OPERATIVO') then raise exception 'Sin permiso'; end if;
    if v_act is null or v_etapa.orden >= v_act then raise exception 'VOLVER_ADELANTE'; end if;
  elsif p_tipo = 'NORMAL' then
    if v_rol not in ('ADMIN','OPERATIVO') and v_rol <> v_etapa.rol_ejecuta then
      raise exception 'ROL_NO_MARCA:%:%', v_rol, v_etapa.nombre;
    end if;
    if v_act is not null and v_etapa.orden <= v_act then raise exception 'PASO_ATRAS'; end if;
    if en_revision(p_encargo) then raise exception 'INCIDENCIA_ABIERTA'; end if;
    -- Saltar etapas intermedias solo lo hace Administración
    if v_rol <> 'ADMIN' then
      select string_agg(x.nombre, ', ' order by x.orden) into v_salta from etapa x
       where x.tipo_encargo_id = v_enc.tipo_encargo_id and x.orden > coalesce(v_act, -2147483648) and x.orden < v_etapa.orden;
      if v_salta is not null then raise exception 'SALTO_ETAPAS:%', v_salta; end if;
    end if;
  end if;
  -- INCIDENCIA: cualquier rol de la tienda, sobre la etapa en la que está

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

-- ---------- S-04 · Deshacer ----------
drop function if exists deshacer_ultimo_hito(uuid);
create or replace function deshacer_ultimo_hito(p_encargo uuid, p_hito uuid default null) returns void
language plpgsql security definer set search_path = public as $$
declare v_enc encargo%rowtype; v_h hito%rowtype; v_rol rol_miembro; n int;
begin
  select * into v_enc from encargo where id = p_encargo;
  if v_enc.id is null then raise exception 'Encargo no encontrado'; end if;
  if v_enc.estado <> 'ACTIVO' then raise exception 'El encargo está anulado'; end if;
  select * into v_h from hito where encargo_id = p_encargo and deshecho_en is null order by fecha desc limit 1;
  if v_h.id is null then raise exception 'No hay nada que deshacer'; end if;
  -- Se deshace el paso que se hizo, no «el último» si alguien marcó otro entre medias
  if p_hito is not null and v_h.id <> p_hito then raise exception 'YA_NO_ES_ULTIMO'; end if;
  if v_h.tipo <> 'INCIDENCIA' then
    select count(*) into n from hito where encargo_id = p_encargo and deshecho_en is null and tipo <> 'INCIDENCIA';
    if n <= 1 then raise exception 'NO_DESHACER_ALTA'; end if;
  end if;
  v_rol := rol_en(v_enc.tienda_id);
  if v_rol is null then
    if not (coalesce(v_enc.proveedor_id = any(array(select mis_proveedores(v_enc.tienda_id))), false)
            and v_h.origen = 'PORTAL' and v_h.usuario_id = auth.uid()
            and v_h.fecha > now() - interval '10 minutes') then
      raise exception 'Sin permiso';
    end if;
  elsif v_rol <> 'ADMIN' and not (v_h.usuario_id = auth.uid() and v_h.fecha > now() - interval '15 minutes') then
    raise exception 'SIN_PERMISO_DESHACER';
  end if;
  update hito set deshecho_en = now() where id = v_h.id;
end $$;
revoke all on function deshacer_ultimo_hito(uuid, uuid) from public, anon;
grant execute on function deshacer_ultimo_hito(uuid, uuid) to authenticated;

-- ---------- S-02 · Casillas, notas y fechas: solo en encargos activos ----------
create or replace function marcar_check(p_encargo uuid, p_clave text, p_marcado boolean) returns void
language plpgsql security definer set search_path = public as $$
declare v_tienda uuid;
begin
  select tienda_id into v_tienda from encargo where id = p_encargo and estado = 'ACTIVO';
  if v_tienda is null then raise exception 'El encargo está anulado'; end if;
  if rol_en(v_tienda) is null then raise exception 'Sin permiso'; end if;
  insert into check_encargo (encargo_id, clave, marcado, fecha, usuario_id)
  values (p_encargo, p_clave, p_marcado, case when p_marcado then now() end, auth.uid())
  on conflict (encargo_id, clave) do update
    set marcado = excluded.marcado, fecha = excluded.fecha, usuario_id = excluded.usuario_id;
end $$;

create or replace function poner_nota_campo(p_encargo uuid, p_campo text, p_texto text)
returns void language plpgsql security definer set search_path = public as $$
declare v_tienda uuid;
begin
  select tienda_id into v_tienda from encargo where id = p_encargo and estado = 'ACTIVO';
  if v_tienda is null then raise exception 'El encargo está anulado'; end if;
  if not es_miembro(v_tienda) then raise exception 'Sin permiso'; end if;
  if coalesce(trim(p_campo), '') = '' then raise exception 'Falta el campo'; end if;
  if coalesce(trim(p_texto), '') = '' then
    delete from nota_campo where encargo_id = p_encargo and campo = p_campo;
    return;
  end if;
  insert into nota_campo (encargo_id, campo, tienda_id, texto, usuario_id, actualizado_en)
  values (p_encargo, p_campo, v_tienda, left(trim(p_texto), 500), auth.uid(), now())
  on conflict (encargo_id, campo) do update
    set texto = excluded.texto, usuario_id = excluded.usuario_id, actualizado_en = now();
end $$;

create or replace function cambiar_fecha_hito(p_hito uuid, p_fecha timestamptz)
returns void language plpgsql security definer set search_path = public as $$
declare v_h hito%rowtype; v_tienda uuid; v_prev timestamptz; v_next timestamptz; v_tz text;
begin
  select * into v_h from hito where id = p_hito and deshecho_en is null;
  if v_h.id is null then raise exception 'Hito no encontrado'; end if;
  select e.tienda_id, coalesce(t.ajustes->>'zona_horaria', 'Europe/Madrid') into v_tienda, v_tz
    from encargo e join tienda t on t.id = e.tienda_id where e.id = v_h.encargo_id and e.estado = 'ACTIVO';
  if v_tienda is null then raise exception 'El encargo está anulado'; end if;
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

-- ---------- S-08 / S-11 · Alta de encargo ----------
create or replace function crear_encargo(
  p_tienda uuid, p_periodo uuid, p_tipo uuid, p_cliente_id uuid, p_cliente jsonb, p_encargo jsonb
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_rol text; v_cli uuid; v_enc uuid; v_primera etapa%rowtype; v_periodo uuid; v_prod uuid;
begin
  v_rol := coalesce(rol_en(p_tienda)::text, '');
  if v_rol not in ('ADMIN','OPERATIVO','ATENCION') then raise exception 'Sin permiso'; end if;
  if not exists (select 1 from tipo_encargo where id = p_tipo and tienda_id = p_tienda and activo) then raise exception 'Tipo de encargo no válido'; end if;
  select * into v_primera from etapa where tipo_encargo_id = p_tipo order by orden limit 1;
  if v_primera.id is null then raise exception 'SIN_ETAPAS'; end if;
  if not exists (select 1 from etapa where tipo_encargo_id = p_tipo and es_final) then raise exception 'TIPO_SIN_FINAL'; end if;
  -- El periodo es siempre el activo de la tienda (un dispositivo con el periodo viejo no crea en él)
  select id into v_periodo from periodo where tienda_id = p_tienda and activo limit 1;
  v_prod := nullif(p_encargo->>'producto_id', '')::uuid;
  if v_prod is not null and not exists (select 1 from producto where id = v_prod and tienda_id = p_tienda and activo) then
    raise exception 'Producto no válido o inactivo';
  end if;

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
  values (p_tienda, v_periodo, p_tipo, v_cli, v_prod, coalesce(p_encargo->'datos', '{}'),
          nullif(btrim(p_encargo->>'complementos'), ''), nullif(p_encargo->>'importe', '')::numeric, coalesce(nullif(p_encargo->>'a_cuenta', '')::numeric, 0))
  returning id into v_enc;

  -- Primer paso: lo marca quien crea; las condiciones de la primera etapa solo avisan (nunca bloquean el alta)
  insert into hito (encargo_id, etapa_id, tipo, usuario_id, origen) values (v_enc, v_primera.id, 'NORMAL', auth.uid(), 'APP');
  return v_enc;
end $$;
revoke all on function crear_encargo(uuid, uuid, uuid, uuid, jsonb, jsonb) from public, anon;
grant execute on function crear_encargo(uuid, uuid, uuid, uuid, jsonb, jsonb) to authenticated;

-- ---------- S-08 · Pedidos y líneas de material de la misma tienda ----------
create or replace function crear_pedido(p_tienda uuid, p_proveedor uuid, p_lineas jsonb, p_notas text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_p uuid; v_l uuid; x jsonb; e jsonb; v_cant numeric;
begin
  if coalesce(rol_en(p_tienda)::text, '') not in ('ADMIN','OPERATIVO') then raise exception 'Sin permiso'; end if;
  if p_proveedor is not null and not exists (select 1 from proveedor where id = p_proveedor and tienda_id = p_tienda) then
    raise exception 'Proveedor no válido o inactivo';
  end if;
  if jsonb_array_length(coalesce(p_lineas, '[]')) = 0 then raise exception 'El pedido está vacío'; end if;
  insert into pedido_material (tienda_id, proveedor_id, notas) values (p_tienda, p_proveedor, p_notas) returning id into v_p;
  for x in select * from jsonb_array_elements(p_lineas) loop
    v_cant := (x->>'cantidad')::numeric;
    if v_cant is null or v_cant <= 0 then continue; end if;
    if not exists (select 1 from material where id = (x->>'material_id')::uuid and tienda_id = p_tienda) then raise exception 'Material desconocido'; end if;
    insert into pedido_linea (pedido_id, tienda_id, material_id, cantidad) values (v_p, p_tienda, (x->>'material_id')::uuid, v_cant) returning id into v_l;
    perform mover_material((x->>'material_id')::uuid, 'PEDIDO', v_cant, 0, null, v_l, null, null);
    for e in select * from jsonb_array_elements(coalesce(x->'encargos', '[]')) loop
      insert into pedido_linea_encargo (linea_id, encargo_id, cantidad)
      select v_l, (e->>'id')::uuid, coalesce((e->>'cantidad')::numeric, 0)
       where exists (select 1 from encargo where id = (e->>'id')::uuid and tienda_id = p_tienda)
      on conflict do nothing;
      perform set_config('hilo.movimiento', '1', true);
      update encargo_material set estado = 'PEDIDO'
       where encargo_id = (e->>'id')::uuid and material_id = (x->>'material_id')::uuid and estado = 'PENDIENTE' and tienda_id = p_tienda;
      perform set_config('hilo.movimiento', '0', true);
    end loop;
  end loop;
  if not exists (select 1 from pedido_linea where pedido_id = v_p) then raise exception 'El pedido está vacío'; end if;
  return v_p;
end $$;

drop policy if exists encargo_material_upd on encargo_material;
create policy encargo_material_upd on encargo_material for update
  using (coalesce(rol_en(tienda_id)::text, '') in ('ADMIN','OPERATIVO','ATENCION'))
  with check (coalesce(rol_en(tienda_id)::text, '') in ('ADMIN','OPERATIVO','ATENCION')
    and exists (select 1 from encargo e where e.id = encargo_id and e.tienda_id = encargo_material.tienda_id)
    and exists (select 1 from material m where m.id = material_id and m.tienda_id = encargo_material.tienda_id));

-- ---------- S-09 · Vista antigua del portal ----------
drop view if exists v_encargo_proveedor;

-- ---------- S-06 · Dominios aprobados ----------
create or replace function fn_validar_dominios() returns trigger
language plpgsql security definer set search_path = public as $$
declare d text; v_antes jsonb := '[]'::jsonb; v_mio text := split_part(mi_email(), '@', 2);
  v_publicos text[] := array['gmail.com','googlemail.com','hotmail.com','hotmail.es','outlook.com','outlook.es','live.com',
    'yahoo.com','yahoo.es','icloud.com','me.com','proton.me','protonmail.com','gmx.com','aol.com','msn.com','ymail.com'];
begin
  if tg_op = 'UPDATE' then v_antes := coalesce(old.ajustes->'seguridad'->'dominios', '[]'::jsonb); end if;
  for d in select lower(x) from jsonb_array_elements_text(coalesce(new.ajustes->'seguridad'->'dominios', '[]'::jsonb)) x loop
    if v_antes ? d then continue; end if;
    if d = any(v_publicos) then raise exception 'DOMINIO_PUBLICO:%', d; end if;
    if auth.uid() is not null and d <> v_mio then raise exception 'DOMINIO_AJENO:%', d; end if;
  end loop;
  return new;
end $$;
drop trigger if exists trg_validar_dominios on tienda;
create trigger trg_validar_dominios before insert or update of ajustes on tienda
  for each row execute function fn_validar_dominios();

create or replace function unirse_por_dominio()
returns int language plpgsql security definer set search_path = public as $$
declare v_dom text; t record; n int := 0; v_rol rol_miembro;
begin
  if auth.uid() is null or mi_email() = '' or position('@' in mi_email()) = 0 then return 0; end if;
  v_dom := split_part(mi_email(), '@', 2);
  if v_dom = any(array['gmail.com','googlemail.com','hotmail.com','hotmail.es','outlook.com','outlook.es','live.com',
    'yahoo.com','yahoo.es','icloud.com','me.com','proton.me','protonmail.com','gmx.com','aol.com','msn.com','ymail.com']) then return 0; end if;
  for t in select id, ajustes from tienda
            where coalesce(ajustes->'seguridad'->'dominios', '[]'::jsonb) ? v_dom loop
    if exists (select 1 from miembro where tienda_id = t.id and user_id = auth.uid()) then continue; end if;
    begin
      v_rol := coalesce(nullif(t.ajustes->'seguridad'->>'rol_por_defecto', ''), 'ATENCION')::rol_miembro;
    exception when others then v_rol := 'ATENCION';
    end;
    if v_rol = 'ADMIN' then v_rol := 'ATENCION'; end if;
    insert into miembro (tienda_id, user_id, email, rol, activo) values (t.id, auth.uid(), mi_email(), v_rol, true)
    on conflict (tienda_id, user_id) do nothing;
    n := n + 1;
  end loop;
  return n;
end $$;

-- crear_tienda no toma la seguridad de la plantilla (dominios, métodos…): se ajusta después
do $$ declare s text; begin
  select pg_get_functiondef('crear_tienda(text, jsonb)'::regprocedure) into s;
  s := replace(s, $x$|| coalesce(p->'ajustes', '{}'::jsonb)$x$, $x$|| (coalesce(p->'ajustes', '{}'::jsonb) - 'seguridad')$x$);
  execute s;
end $$;

-- ---------- S-07 · Invitaciones ----------
create or replace function aceptar_invitacion(p_token uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_inv invitacion%rowtype; v_m miembro%rowtype;
begin
  if auth.uid() is null then raise exception 'Inicia sesión para aceptar la invitación'; end if;
  if mi_email() = '' then raise exception 'Confirma tu correo antes de aceptar la invitación'; end if;
  select * into v_inv from invitacion where token = p_token;
  if v_inv.id is null or v_inv.revocada_en is not null then raise exception 'La invitación no existe o se ha anulado'; end if;
  if v_inv.caduca_en < now() then raise exception 'La invitación ha caducado. Pide un enlace nuevo'; end if;
  if v_inv.email is not null and lower(v_inv.email) <> mi_email() then raise exception 'Esta invitación es para otro correo'; end if;
  if v_inv.email is not null and v_inv.aceptada_en is not null then raise exception 'Esta invitación ya se ha usado'; end if;
  select * into v_m from miembro where tienda_id = v_inv.tienda_id and user_id = auth.uid();
  if v_m.user_id is not null and not v_m.activo then raise exception 'MIEMBRO_DESACTIVADO'; end if;
  if v_m.user_id is null then
    insert into miembro (tienda_id, user_id, email, rol, activo) values (v_inv.tienda_id, auth.uid(), mi_email(), v_inv.rol, true);
  elsif v_inv.email is not null and v_m.rol <> v_inv.rol and v_m.rol <> 'ADMIN' then
    -- Reinvitar por correo con otro rol lo cambia (un enlace abierto nunca cambia el rol)
    update miembro set rol = v_inv.rol where tienda_id = v_inv.tienda_id and user_id = auth.uid();
  end if;
  if v_inv.email is not null then
    update invitacion set aceptada_en = now(), aceptada_por = auth.uid() where id = v_inv.id;
  end if;
  return v_inv.tienda_id;
end $$;

create or replace function aceptar_invitaciones_pendientes()
returns int language plpgsql security definer set search_path = public as $$
declare v_inv invitacion%rowtype; v_m miembro%rowtype; n int := 0;
begin
  if auth.uid() is null or mi_email() = '' then return 0; end if;
  -- Por tienda, la invitación más reciente manda
  for v_inv in select distinct on (tienda_id) * from invitacion
                where lower(email) = mi_email() and aceptada_en is null and revocada_en is null and caduca_en > now()
                order by tienda_id, creado_en desc
  loop
    select * into v_m from miembro where tienda_id = v_inv.tienda_id and user_id = auth.uid();
    if v_m.user_id is not null and not v_m.activo then continue; end if;   -- desactivado: la reactiva administración
    if v_m.user_id is null then
      insert into miembro (tienda_id, user_id, email, rol, activo) values (v_inv.tienda_id, auth.uid(), mi_email(), v_inv.rol, true);
    elsif v_m.rol <> v_inv.rol and v_m.rol <> 'ADMIN' then
      update miembro set rol = v_inv.rol where tienda_id = v_inv.tienda_id and user_id = auth.uid();
    end if;
    update invitacion set aceptada_en = now(), aceptada_por = auth.uid()
     where tienda_id = v_inv.tienda_id and lower(email) = mi_email() and aceptada_en is null and revocada_en is null;
    n := n + 1;
  end loop;
  return n;
end $$;

-- ---------- S-11 · Flujos ----------
-- Una sola etapa final por tipo
do $$ begin
  create unique index etapa_una_final on etapa (tipo_encargo_id) where es_final;
exception when others then raise notice 'etapa_una_final: hay tipos con varias finales; se deja sin índice'; end $$;

create or replace function marcar_final(p_etapa uuid, p_final boolean) returns void
language plpgsql security definer set search_path = public as $$
declare v_e etapa%rowtype; v_activo boolean;
begin
  select * into v_e from etapa where id = p_etapa;
  if v_e.id is null then raise exception 'Etapa no encontrada'; end if;
  if not es_admin(v_e.tienda_id) then raise exception 'Solo administración'; end if;
  select activo into v_activo from tipo_encargo where id = v_e.tipo_encargo_id;
  if p_final then
    update etapa set es_final = false where tipo_encargo_id = v_e.tipo_encargo_id and es_final and id <> p_etapa;
    update etapa set es_final = true where id = p_etapa;
  else
    if v_activo and v_e.es_final then raise exception 'TIPO_SIN_FINAL'; end if;
    update etapa set es_final = false where id = p_etapa;
  end if;
end $$;
revoke all on function marcar_final(uuid, boolean) from public, anon;
grant execute on function marcar_final(uuid, boolean) to authenticated;

-- Un tipo solo se puede elegir si tiene etapa final
create or replace function fn_tipo_con_final() returns trigger language plpgsql as $$
begin
  if new.activo and not coalesce(old.activo, false)
     and not exists (select 1 from etapa where tipo_encargo_id = new.id and es_final) then
    raise exception 'TIPO_SIN_FINAL';
  end if;
  return new;
end $$;
drop trigger if exists trg_tipo_con_final on tipo_encargo;
create trigger trg_tipo_con_final before update of activo on tipo_encargo for each row execute function fn_tipo_con_final();

create or replace function reordenar_etapas(p_tipo uuid, p_ids uuid[])
returns void language plpgsql security definer set search_path = public as $$
declare v_tienda uuid; i int;
begin
  select tienda_id into v_tienda from tipo_encargo where id = p_tipo;
  if not es_admin(v_tienda) then raise exception 'Solo administración'; end if;
  if coalesce(array_length(p_ids, 1), 0) <> (select count(distinct x) from unnest(p_ids) x)
     or (select count(*) from etapa where tipo_encargo_id = p_tipo) <> coalesce(array_length(p_ids, 1), 0)
     or exists (select 1 from unnest(p_ids) x where not exists (select 1 from etapa e where e.id = x and e.tipo_encargo_id = p_tipo)) then
    raise exception 'La lista de etapas no está completa';
  end if;
  update etapa set orden = -orden - 100000 where tipo_encargo_id = p_tipo;
  for i in 1 .. array_length(p_ids, 1) loop
    update etapa set orden = i * 10 where id = p_ids[i] and tipo_encargo_id = p_tipo;
  end loop;
  -- La que queda la primera no puede tener condiciones que bloqueen
  update puerta set dura = false where etapa_destino_id = p_ids[1] and dura;
end $$;

do $$ declare s text; begin
  select pg_get_functiondef('borrar_etapa(uuid)'::regprocedure) into s;
  s := replace(s, $x$  select count(distinct encargo_id) into n from hito where etapa_id = p_etapa;$x$,
               $x$  if v_e.es_final and exists (select 1 from tipo_encargo where id = v_e.tipo_encargo_id and activo) then
    raise exception 'TIPO_SIN_FINAL';
  end if;
  select count(distinct encargo_id) into n from hito where etapa_id = p_etapa;$x$);
  execute s;
end $$;

-- ---------- S-12 · Autor = sesión ----------
create or replace function fn_autor_sesion() returns trigger language plpgsql as $$
begin
  if auth.uid() is not null then
    if tg_table_name = 'invitacion' then new.creado_por := auth.uid(); else new.usuario_id := auth.uid(); end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_autor_sesion on comentario;
create trigger trg_autor_sesion before insert on comentario for each row execute function fn_autor_sesion();
drop trigger if exists trg_autor_sesion on mensaje_enviado;
create trigger trg_autor_sesion before insert on mensaje_enviado for each row execute function fn_autor_sesion();
drop trigger if exists trg_autor_sesion on invitacion;
create trigger trg_autor_sesion before insert on invitacion for each row execute function fn_autor_sesion();

drop policy if exists comentario_ins on comentario;
create policy comentario_ins on comentario for insert
  with check (exists (select 1 from encargo e where e.id = encargo_id and e.estado = 'ACTIVO' and es_miembro(e.tienda_id)));

-- D-01 · Logística no registra avisos al cliente
drop policy if exists msg_ins on mensaje_enviado;
create policy msg_ins on mensaje_enviado for insert
  with check (exists (select 1 from encargo e where e.id = encargo_id and rol_en(e.tienda_id) in ('ADMIN','OPERATIVO','ATENCION')));

-- ---------- S-13 · Adjuntos y fotos: mismos roles en tabla y almacenamiento ----------
drop policy if exists adjunto_wr on adjunto;
drop policy if exists adjunto_ins on adjunto;
create policy adjunto_ins on adjunto for insert
  with check (coalesce(rol_en(tienda_id)::text, '') in ('ADMIN','OPERATIVO','ATENCION'));
drop policy if exists adjunto_del on adjunto;
create policy adjunto_del on adjunto for delete
  using (coalesce(rol_en(tienda_id)::text, '') in ('ADMIN','OPERATIVO','ATENCION'));

create or replace function rol_en_carpeta(p_carpeta text) returns text
language sql stable security definer set search_path = public as $$
  select rol_en(t.id)::text from tienda t where t.id::text = p_carpeta
$$;
drop policy if exists adjuntos_leer on storage.objects;
create policy adjuntos_leer on storage.objects for select to authenticated
  using (bucket_id = 'adjuntos' and public.rol_en_carpeta((storage.foldername(name))[1]) is not null);
drop policy if exists adjuntos_subir on storage.objects;
create policy adjuntos_subir on storage.objects for insert to authenticated
  with check (bucket_id = 'adjuntos' and public.rol_en_carpeta((storage.foldername(name))[1]) in ('ADMIN','OPERATIVO','ATENCION'));
drop policy if exists adjuntos_borrar on storage.objects;
create policy adjuntos_borrar on storage.objects for delete to authenticated
  using (bucket_id = 'adjuntos' and public.rol_en_carpeta((storage.foldername(name))[1]) in ('ADMIN','OPERATIVO','ATENCION'));
drop policy if exists fotos_escribir on storage.objects;
create policy fotos_escribir on storage.objects for insert to authenticated
  with check (bucket_id = 'fotos' and public.rol_en_carpeta((storage.foldername(name))[1]) in ('ADMIN','OPERATIVO'));
drop policy if exists fotos_borrar on storage.objects;
create policy fotos_borrar on storage.objects for delete to authenticated
  using (bucket_id = 'fotos' and public.rol_en_carpeta((storage.foldername(name))[1]) in ('ADMIN','OPERATIVO'));

-- ---------- S-14 · Varios ----------
alter function fn_registrar_actividad() set search_path = public;
revoke insert, update, delete on hito, check_encargo, anulacion, actividad from authenticated;
drop policy if exists plantilla_ficha_sel on plantilla_ficha;   -- el portal no necesita la plantilla de la ficha

-- ---------- S-15 · Borrados y actividad ----------
create or replace function fn_registrar_actividad() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_tienda uuid; v_id uuid; v_antes jsonb; v_despues jsonb; v_row jsonb;
begin
  if tg_op <> 'INSERT' then v_antes := to_jsonb(old); end if;
  if tg_op <> 'DELETE' then v_despues := to_jsonb(new); end if;
  -- Un update que solo toca la marca de actualización (p. ej. al marcar un paso) no es actividad
  if tg_op = 'UPDATE' and (v_antes - 'actualizado_en') = (v_despues - 'actualizado_en') then return new; end if;
  v_row := coalesce(v_despues, v_antes);
  v_id := coalesce((v_row ->> 'id')::uuid, (v_row ->> 'encargo_id')::uuid);
  if v_row ? 'tienda_id' then
    v_tienda := (v_row ->> 'tienda_id')::uuid;
  else
    select e.tienda_id into v_tienda from encargo e where e.id = (v_row ->> 'encargo_id')::uuid;
  end if;
  -- Al borrar en cascada (encargo o tienda) ya no hay de dónde colgarlo: no se registra
  if v_tienda is null or not exists (select 1 from tienda where id = v_tienda) then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  insert into actividad (tienda_id, usuario_id, entidad, entidad_id, accion, antes, despues)
  values (v_tienda, auth.uid(), tg_table_name, v_id, tg_op, v_antes, v_despues);
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

-- ---------- S-16 · Índices ----------
create index if not exists comentario_encargo on comentario (encargo_id);
create index if not exists puerta_destino on puerta (etapa_destino_id);
create index if not exists hito_etapa on hito (etapa_id);
create index if not exists encargo_cliente on encargo (cliente_id);
create index if not exists encargo_producto on encargo (producto_id);
create index if not exists encargo_material_material on encargo_material (material_id);
create index if not exists movimiento_pedido_linea on movimiento_material (pedido_linea_id);
create index if not exists pedido_linea_encargo_encargo on pedido_linea_encargo (encargo_id);

-- ---------- D-02 · Informes solo para Administración ----------
create or replace view v_informe_hitos with (security_invoker = true) as
select h.id, h.encargo_id, h.fecha, h.tipo::text as tipo,
       e.tienda_id, e.periodo_id, e.tipo_encargo_id, e.numero, e.creado_en, e.estado::text as estado,
       e.producto_id, e.proveedor_id, e.datos,
       et.id as etapa_id, et.nombre as etapa_nombre, et.orden as etapa_orden, et.es_final,
       et.visible_para_proveedor as etapa_proveedor, et.es_espera
  from hito h
  join encargo e on e.id = h.encargo_id
  join etapa et on et.id = h.etapa_id
 where h.deshecho_en is null and es_admin(e.tienda_id);
grant select on v_informe_hitos to authenticated;

-- ---------- Funciones security definer: nada para anon ----------
do $$ declare f record; begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.prosecdef and p.proname not in ('ver_invitacion') loop
    execute format('revoke execute on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to authenticated, service_role', f.sig);
  end loop;
end $$;

select 'ok 0030' as r;
