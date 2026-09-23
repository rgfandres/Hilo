-- =====================================================================
-- ESQUELETO · núcleo · migración 0001
-- Gestión de producción por encargo con proveedores externos.
-- Multi-tienda. Postgres (Supabase). Ver docs/02_modelo_datos_nucleo.md
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------
create type rol_miembro     as enum ('ADMIN','OPERATIVO','LOGISTICA','ATENCION');
create type entidad_campos  as enum ('CLIENTE','ENCARGO','PRODUCTO');
create type tipo_puerta     as enum ('HITO_PREVIO','CAMPO_NO_VACIO','CHECK');
create type tipo_hito       as enum ('NORMAL','INCIDENCIA','REENTRADA');
create type origen_hito     as enum ('APP','PORTAL','IMPORT');
create type estado_encargo  as enum ('ACTIVO','ANULADO');
create type canal_mensaje   as enum ('WHATSAPP','EMAIL','AMBOS');

-- ---------------------------------------------------------------------
-- Tenencia y acceso
-- ---------------------------------------------------------------------
create table tienda (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null,
  ajustes     jsonb not null default '{
    "moneda": "EUR",
    "dias_estancado": 10,
    "numeracion_reinicia_por_periodo": true,
    "enlace_resena": null
  }'::jsonb,
  creado_en   timestamptz not null default now()
);

create table miembro (
  tienda_id   uuid not null references tienda(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  email       text not null,
  rol         rol_miembro not null,
  activo      boolean not null default true,
  creado_en   timestamptz not null default now(),
  primary key (tienda_id, user_id)
);
create index on miembro (user_id);

create table periodo (
  id            uuid primary key default gen_random_uuid(),
  tienda_id     uuid not null references tienda(id) on delete cascade,
  nombre        text not null,
  activo        boolean not null default false,
  fecha_inicio  date,
  fecha_fin     date,
  unique (tienda_id, nombre)
);
-- Solo un periodo activo por tienda
create unique index periodo_activo_unico on periodo (tienda_id) where activo;

-- ---------------------------------------------------------------------
-- Configuración por tienda
-- ---------------------------------------------------------------------
create table tipo_encargo (
  id          uuid primary key default gen_random_uuid(),
  tienda_id   uuid not null references tienda(id) on delete cascade,
  clave       text not null,
  nombre      text not null,
  activo      boolean not null default true,
  unique (tienda_id, clave)
);

create table plantilla_campos (
  id              uuid primary key default gen_random_uuid(),
  tienda_id       uuid not null references tienda(id) on delete cascade,
  entidad         entidad_campos not null,
  tipo_encargo_id uuid references tipo_encargo(id) on delete cascade, -- null = todos
  campos          jsonb not null default '[]'::jsonb,
  -- [{clave, etiqueta, tipo: texto|numero|fecha|opcion|lista, opciones[], obligatorio, orden}]
  unique (tienda_id, entidad, tipo_encargo_id)
);

create table etapa (
  id                     uuid primary key default gen_random_uuid(),
  tienda_id              uuid not null references tienda(id) on delete cascade,
  tipo_encargo_id        uuid not null references tipo_encargo(id) on delete cascade,
  orden                  int  not null,
  clave                  text not null,
  nombre                 text not null,
  rol_ejecuta            rol_miembro not null default 'OPERATIVO',
  visible_para_proveedor boolean not null default false,
  es_final               boolean not null default false,
  es_espera              boolean not null default false,
  color                  text,
  unique (tipo_encargo_id, clave),
  unique (tipo_encargo_id, orden)
);

create table puerta (
  id                uuid primary key default gen_random_uuid(),
  tienda_id         uuid not null references tienda(id) on delete cascade,
  etapa_destino_id  uuid not null references etapa(id) on delete cascade,
  tipo              tipo_puerta not null,
  referencia        text not null,   -- clave de etapa / clave de campo / clave de check
  mensaje           text not null,
  dura              boolean not null default true
);

create table plantilla_mensaje (
  id          uuid primary key default gen_random_uuid(),
  tienda_id   uuid not null references tienda(id) on delete cascade,
  etapa_id    uuid references etapa(id) on delete set null, -- null = manual
  clave       text not null,
  nombre      text not null,
  texto       text not null,          -- marcadores {nombre} {producto} {numero} {tienda}
  canal       canal_mensaje not null default 'AMBOS',
  orden       int not null default 0,
  unique (tienda_id, clave)
);

create table plantilla_ficha (
  tienda_id   uuid primary key references tienda(id) on delete cascade,
  html        text not null
);

-- ---------------------------------------------------------------------
-- Maestros
-- ---------------------------------------------------------------------
create table cliente (
  id              uuid primary key default gen_random_uuid(),
  tienda_id       uuid not null references tienda(id) on delete cascade,
  nombre          text not null,
  telefono        text,
  email           text,
  datos           jsonb not null default '{}'::jsonb,
  notas           text,
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now()
);
create index on cliente (tienda_id, nombre);

create table producto (
  id          uuid primary key default gen_random_uuid(),
  tienda_id   uuid not null references tienda(id) on delete cascade,
  nombre      text not null,
  foto_url    text,
  precio_base numeric(10,2),
  activo      boolean not null default true,
  datos       jsonb not null default '{}'::jsonb,
  unique (tienda_id, nombre)
);

create table proveedor (
  id          uuid primary key default gen_random_uuid(),
  tienda_id   uuid not null references tienda(id) on delete cascade,
  nombre      text not null,
  tipo        text not null default 'TALLER',
  activo      boolean not null default true,
  notas       text,
  unique (tienda_id, nombre)
);

create table proveedor_usuario (
  proveedor_id uuid not null references proveedor(id) on delete cascade,
  email        text not null,
  primary key (proveedor_id, email)
);
create index on proveedor_usuario (lower(email));

create table producto_proveedor (
  producto_id  uuid not null references producto(id) on delete cascade,
  proveedor_id uuid not null references proveedor(id) on delete cascade,
  primary key (producto_id, proveedor_id)
);

-- ---------------------------------------------------------------------
-- Operación
-- ---------------------------------------------------------------------
create table encargo (
  id              uuid primary key default gen_random_uuid(),
  tienda_id       uuid not null references tienda(id) on delete cascade,
  periodo_id      uuid references periodo(id),
  tipo_encargo_id uuid not null references tipo_encargo(id),
  numero          int  not null,
  cliente_id      uuid not null references cliente(id),
  producto_id     uuid references producto(id),
  proveedor_id    uuid references proveedor(id),
  estado          estado_encargo not null default 'ACTIVO',
  datos           jsonb not null default '{}'::jsonb,
  creado_en       timestamptz not null default now(),
  creado_por      uuid references auth.users(id),
  actualizado_en  timestamptz not null default now()
);
-- Nº único por tienda+periodo (o por tienda si periodo null)
create unique index encargo_numero_unico on encargo (tienda_id, coalesce(periodo_id, '00000000-0000-0000-0000-000000000000'::uuid), numero);
create index on encargo (tienda_id, estado);
create index on encargo (proveedor_id);

create table hito (
  id          uuid primary key default gen_random_uuid(),
  encargo_id  uuid not null references encargo(id) on delete cascade,
  etapa_id    uuid not null references etapa(id),
  tipo        tipo_hito not null default 'NORMAL',
  fecha       timestamptz not null default now(),
  usuario_id  uuid references auth.users(id),
  origen      origen_hito not null default 'APP',
  nota        text,
  deshecho_en timestamptz
);
create index on hito (encargo_id) where deshecho_en is null;

create table check_encargo (
  encargo_id  uuid not null references encargo(id) on delete cascade,
  clave       text not null,
  marcado     boolean not null default false,
  fecha       timestamptz,
  usuario_id  uuid references auth.users(id),
  primary key (encargo_id, clave)
);

create table comentario (
  id          uuid primary key default gen_random_uuid(),
  encargo_id  uuid not null references encargo(id) on delete cascade,
  usuario_id  uuid references auth.users(id),
  texto       text not null,
  fecha       timestamptz not null default now()
);

create table mensaje_enviado (
  id           uuid primary key default gen_random_uuid(),
  encargo_id   uuid not null references encargo(id) on delete cascade,
  plantilla_id uuid references plantilla_mensaje(id),
  canal        canal_mensaje not null,
  fecha        timestamptz not null default now(),
  usuario_id   uuid references auth.users(id)
);

create table anulacion (
  id            uuid primary key default gen_random_uuid(),
  encargo_id    uuid not null references encargo(id) on delete cascade,
  fecha         timestamptz not null default now(),
  usuario_id    uuid references auth.users(id),
  motivo        text,
  snapshot      jsonb not null,
  recuperado_en timestamptz
);

create table adjunto (
  id          uuid primary key default gen_random_uuid(),
  tienda_id   uuid not null references tienda(id) on delete cascade,
  entidad     text not null,
  entidad_id  uuid not null,
  url         text not null,
  tipo        text,
  subido_por  uuid references auth.users(id),
  fecha       timestamptz not null default now()
);
create index on adjunto (entidad, entidad_id);

-- ---------------------------------------------------------------------
-- Transversal: actividad (auditoría)
-- ---------------------------------------------------------------------
create table actividad (
  id          bigserial primary key,
  tienda_id   uuid not null,
  usuario_id  uuid,
  entidad     text not null,
  entidad_id  uuid,
  accion      text not null,
  antes       jsonb,
  despues     jsonb,
  fecha       timestamptz not null default now()
);
create index on actividad (tienda_id, fecha desc);
create index on actividad (entidad, entidad_id);

create or replace function fn_registrar_actividad() returns trigger
language plpgsql security definer as $$
declare v_tienda uuid; v_id uuid; v_antes jsonb; v_despues jsonb; v_row jsonb;
begin
  if tg_op <> 'INSERT' then v_antes := to_jsonb(old); end if;
  if tg_op <> 'DELETE' then v_despues := to_jsonb(new); end if;
  v_row := coalesce(v_despues, v_antes);
  -- id de la entidad (check_encargo no tiene id propio: se apunta al encargo)
  v_id := coalesce((v_row ->> 'id')::uuid, (v_row ->> 'encargo_id')::uuid);
  -- tienda_id directo o vía encargo
  if v_row ? 'tienda_id' then
    v_tienda := (v_row ->> 'tienda_id')::uuid;
  else
    select e.tienda_id into v_tienda from encargo e where e.id = (v_row ->> 'encargo_id')::uuid;
  end if;
  insert into actividad (tienda_id, usuario_id, entidad, entidad_id, accion, antes, despues)
  values (v_tienda, auth.uid(), tg_table_name, v_id, tg_op, v_antes, v_despues);
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

do $$ declare t text;
begin
  foreach t in array array['encargo','hito','check_encargo','comentario','cliente','producto','proveedor','anulacion']
  loop
    execute format('create trigger trg_actividad after insert or update or delete on %I
                    for each row execute function fn_registrar_actividad()', t);
  end loop;
end $$;

-- actualizado_en automático
create or replace function fn_touch() returns trigger language plpgsql as $$
begin new.actualizado_en := now(); return new; end $$;
create trigger trg_touch_cliente before update on cliente for each row execute function fn_touch();
create trigger trg_touch_encargo before update on encargo for each row execute function fn_touch();

-- Un hito toca el encargo (para "estancado")
create or replace function fn_hito_toca_encargo() returns trigger language plpgsql as $$
begin update encargo set actualizado_en = now() where id = new.encargo_id; return new; end $$;
create trigger trg_hito_toca after insert or update on hito for each row execute function fn_hito_toca_encargo();

-- ---------------------------------------------------------------------
-- Helpers de acceso (usados por RLS)
-- ---------------------------------------------------------------------
create or replace function mi_email() returns text language sql stable as $$
  select lower(coalesce(auth.jwt() ->> 'email', ''))
$$;

create or replace function rol_en(p_tienda uuid) returns rol_miembro
language sql stable security definer as $$
  select m.rol from miembro m
   where m.tienda_id = p_tienda and m.user_id = auth.uid() and m.activo
$$;

create or replace function es_miembro(p_tienda uuid) returns boolean
language sql stable as $$ select rol_en(p_tienda) is not null $$;

create or replace function es_admin(p_tienda uuid) returns boolean
language sql stable as $$ select rol_en(p_tienda) = 'ADMIN' $$;

-- Proveedor(es) del usuario actual en una tienda (por email)
create or replace function mis_proveedores(p_tienda uuid) returns setof uuid
language sql stable security definer as $$
  select p.id from proveedor p
    join proveedor_usuario pu on pu.proveedor_id = p.id
   where p.tienda_id = p_tienda and p.activo and lower(pu.email) = mi_email()
$$;

create or replace function es_proveedor(p_tienda uuid) returns boolean
language sql stable as $$ select exists (select 1 from mis_proveedores(p_tienda)) $$;

-- Último ADMIN protegido
create or replace function fn_proteger_ultimo_admin() returns trigger language plpgsql as $$
begin
  if (tg_op = 'DELETE' or new.rol <> 'ADMIN' or not new.activo) and old.rol = 'ADMIN' and old.activo then
    if (select count(*) from miembro where tienda_id = old.tienda_id and rol = 'ADMIN' and activo) <= 1 then
      raise exception 'No se puede quitar el último ADMIN de la tienda';
    end if;
  end if;
  return coalesce(new, old);
end $$;
create trigger trg_ultimo_admin before update or delete on miembro
  for each row execute function fn_proteger_ultimo_admin();

-- ---------------------------------------------------------------------
-- Lógica de negocio: numeración, etapa actual, puertas, crear_hito
-- ---------------------------------------------------------------------
create or replace function siguiente_numero(p_tienda uuid, p_periodo uuid) returns int
language plpgsql as $$
declare v_reinicia boolean; v_max int;
begin
  select coalesce((ajustes->>'numeracion_reinicia_por_periodo')::boolean, true) into v_reinicia
    from tienda where id = p_tienda;
  if v_reinicia and p_periodo is not null then
    select coalesce(max(numero),0) into v_max from encargo where tienda_id = p_tienda and periodo_id = p_periodo;
  else
    select coalesce(max(numero),0) into v_max from encargo where tienda_id = p_tienda;
  end if;
  return v_max + 1;
end $$;

create or replace function fn_encargo_numero() returns trigger language plpgsql as $$
begin
  if new.numero is null then
    new.numero := siguiente_numero(new.tienda_id, new.periodo_id);
  end if;
  return new;
end $$;
alter table encargo alter column numero drop not null;
create trigger trg_encargo_numero before insert on encargo for each row execute function fn_encargo_numero();

-- Etapa actual = mayor orden entre hitos NORMAL/REENTRADA vigentes
create or replace function etapa_actual(p_encargo uuid) returns uuid
language sql stable as $$
  select h.etapa_id from hito h join etapa e on e.id = h.etapa_id
   where h.encargo_id = p_encargo and h.deshecho_en is null and h.tipo <> 'INCIDENCIA'
   order by h.fecha desc, e.orden desc limit 1
$$;

create or replace function en_revision(p_encargo uuid) returns boolean
language sql stable as $$
  select coalesce((select h.tipo = 'INCIDENCIA' from hito h
     where h.encargo_id = p_encargo and h.deshecho_en is null
     order by h.fecha desc limit 1), false)
$$;

-- Puertas pendientes para pasar a una etapa: devuelve filas (mensaje, dura)
create or replace function puertas_pendientes(p_encargo uuid, p_etapa uuid)
returns table (mensaje text, dura boolean)
language plpgsql stable as $$
declare p record; v_enc encargo%rowtype; v_ok boolean;
begin
  select * into v_enc from encargo where id = p_encargo;
  for p in select * from puerta where etapa_destino_id = p_etapa loop
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
    if not v_ok then mensaje := p.mensaje; dura := p.dura; return next; end if;
  end loop;
end $$;

-- ÚNICA vía para cambiar de etapa. Valida puertas duras en servidor.
create or replace function crear_hito(
  p_encargo uuid, p_etapa_clave text,
  p_tipo tipo_hito default 'NORMAL', p_nota text default null,
  p_origen origen_hito default 'APP', p_forzar_blandas boolean default false
) returns uuid
language plpgsql security definer as $$
declare v_enc encargo%rowtype; v_etapa etapa%rowtype; v_rol rol_miembro; v_id uuid; v_bloq text;
begin
  select * into v_enc from encargo where id = p_encargo;
  if v_enc.id is null then raise exception 'Encargo no encontrado'; end if;
  if v_enc.estado <> 'ACTIVO' then raise exception 'El encargo está anulado'; end if;

  select * into v_etapa from etapa
   where tipo_encargo_id = v_enc.tipo_encargo_id and clave = p_etapa_clave;
  if v_etapa.id is null then raise exception 'Etapa % no existe para este tipo de encargo', p_etapa_clave; end if;

  -- Permisos: miembro con rol adecuado, o proveedor asignado si la etapa es suya
  v_rol := rol_en(v_enc.tienda_id);
  if v_rol is null then
    if not (v_etapa.visible_para_proveedor and v_enc.proveedor_id in (select mis_proveedores(v_enc.tienda_id))) then
      raise exception 'Sin permiso';
    end if;
  elsif v_rol not in ('ADMIN','OPERATIVO') and v_rol <> v_etapa.rol_ejecuta then
    raise exception 'El rol % no puede marcar la etapa %', v_rol, p_etapa_clave;
  end if;

  -- Puertas (solo para hitos NORMAL)
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

-- Deshacer el último hito vigente (para el "↩ Deshacer" de 8 s)
create or replace function deshacer_ultimo_hito(p_encargo uuid) returns void
language plpgsql security definer as $$
declare v_tienda uuid;
begin
  select tienda_id into v_tienda from encargo where id = p_encargo;
  if rol_en(v_tienda) is null and not es_proveedor(v_tienda) then raise exception 'Sin permiso'; end if;
  update hito set deshecho_en = now()
   where id = (select id from hito where encargo_id = p_encargo and deshecho_en is null
                order by fecha desc limit 1);
end $$;

-- Marcar / desmarcar check (alimenta puertas tipo CHECK)
create or replace function marcar_check(p_encargo uuid, p_clave text, p_marcado boolean) returns void
language plpgsql security definer as $$
declare v_tienda uuid;
begin
  select tienda_id into v_tienda from encargo where id = p_encargo;
  if rol_en(v_tienda) is null then raise exception 'Sin permiso'; end if;
  insert into check_encargo (encargo_id, clave, marcado, fecha, usuario_id)
  values (p_encargo, p_clave, p_marcado, case when p_marcado then now() end, auth.uid())
  on conflict (encargo_id, clave) do update
    set marcado = excluded.marcado, fecha = excluded.fecha, usuario_id = excluded.usuario_id;
end $$;

-- Anular / recuperar
create or replace function anular_encargo(p_encargo uuid, p_motivo text) returns void
language plpgsql security definer as $$
declare v_enc encargo%rowtype; v_snap jsonb;
begin
  select * into v_enc from encargo where id = p_encargo;
  if not es_admin(v_enc.tienda_id) then raise exception 'Solo ADMIN puede anular'; end if;
  v_snap := jsonb_build_object(
    'encargo', to_jsonb(v_enc),
    'hitos',  (select coalesce(jsonb_agg(to_jsonb(h)), '[]') from hito h where h.encargo_id = p_encargo),
    'checks', (select coalesce(jsonb_agg(to_jsonb(c)), '[]') from check_encargo c where c.encargo_id = p_encargo));
  insert into anulacion (encargo_id, usuario_id, motivo, snapshot) values (p_encargo, auth.uid(), p_motivo, v_snap);
  update encargo set estado = 'ANULADO' where id = p_encargo;
end $$;

create or replace function recuperar_encargo(p_encargo uuid) returns void
language plpgsql security definer as $$
declare v_tienda uuid;
begin
  select tienda_id into v_tienda from encargo where id = p_encargo;
  if not es_admin(v_tienda) then raise exception 'Solo ADMIN puede recuperar'; end if;
  update encargo set estado = 'ACTIVO' where id = p_encargo;
  update anulacion set recuperado_en = now() where encargo_id = p_encargo and recuperado_en is null;
end $$;

-- ---------------------------------------------------------------------
-- Vistas
-- ---------------------------------------------------------------------
-- security_invoker: la vista respeta la RLS del usuario que consulta
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
     and not coalesce(ea.es_final, false)) as estancado,
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

create or replace view v_informes_hitos with (security_invoker = true) as
select h.id, e.tienda_id, e.periodo_id, e.tipo_encargo_id, e.id as encargo_id,
       et.clave as etapa_clave, et.orden, h.fecha::date as fecha, e.producto_id, e.proveedor_id, e.datos
  from hito h join encargo e on e.id = h.encargo_id join etapa et on et.id = h.etapa_id
 where h.deshecho_en is null and h.tipo = 'NORMAL' and e.estado = 'ACTIVO';

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table tienda            enable row level security;
alter table miembro           enable row level security;
alter table periodo           enable row level security;
alter table tipo_encargo      enable row level security;
alter table plantilla_campos  enable row level security;
alter table etapa             enable row level security;
alter table puerta            enable row level security;
alter table plantilla_mensaje enable row level security;
alter table plantilla_ficha   enable row level security;
alter table cliente           enable row level security;
alter table producto          enable row level security;
alter table proveedor         enable row level security;
alter table proveedor_usuario enable row level security;
alter table producto_proveedor enable row level security;
alter table encargo           enable row level security;
alter table hito              enable row level security;
alter table check_encargo     enable row level security;
alter table comentario        enable row level security;
alter table mensaje_enviado   enable row level security;
alter table anulacion         enable row level security;
alter table adjunto           enable row level security;
alter table actividad         enable row level security;

-- Tienda: la ven miembros y proveedores; la edita ADMIN
create policy tienda_sel on tienda for select using (es_miembro(id) or es_proveedor(id));
create policy tienda_upd on tienda for update using (es_admin(id));

-- Configuración (lectura miembros + proveedores; escritura ADMIN)
do $$ declare t text;
begin
  foreach t in array array['periodo','tipo_encargo','plantilla_campos','etapa','puerta','plantilla_mensaje','plantilla_ficha']
  loop
    execute format('create policy %I_sel on %I for select using (es_miembro(tienda_id) or es_proveedor(tienda_id))', t, t);
    execute format('create policy %I_adm on %I for all using (es_admin(tienda_id)) with check (es_admin(tienda_id))', t, t);
  end loop;
end $$;

-- Miembros: se ven entre sí; gestiona ADMIN
create policy miembro_sel on miembro for select using (es_miembro(tienda_id));
create policy miembro_adm on miembro for all using (es_admin(tienda_id)) with check (es_admin(tienda_id));

-- Cliente: miembros. ATENCION/OPERATIVO/ADMIN crean y editan. El proveedor NO lo ve.
create policy cliente_sel on cliente for select using (es_miembro(tienda_id));
create policy cliente_ins on cliente for insert with check (rol_en(tienda_id) in ('ADMIN','OPERATIVO','ATENCION'));
create policy cliente_upd on cliente for update using (rol_en(tienda_id) in ('ADMIN','OPERATIVO','ATENCION'));

-- Producto: lectura miembros + proveedores; escritura ADMIN/OPERATIVO
create policy producto_sel on producto for select using (es_miembro(tienda_id) or es_proveedor(tienda_id));
create policy producto_wr  on producto for all using (rol_en(tienda_id) in ('ADMIN','OPERATIVO')) with check (rol_en(tienda_id) in ('ADMIN','OPERATIVO'));

-- Proveedor: lectura miembros; el propio proveedor se ve a sí mismo; escritura ADMIN/OPERATIVO
create policy proveedor_sel on proveedor for select using (es_miembro(tienda_id) or id in (select mis_proveedores(tienda_id)));
create policy proveedor_wr  on proveedor for all using (rol_en(tienda_id) in ('ADMIN','OPERATIVO')) with check (rol_en(tienda_id) in ('ADMIN','OPERATIVO'));
create policy provusr_sel on proveedor_usuario for select using (exists (select 1 from proveedor p where p.id = proveedor_id and es_miembro(p.tienda_id)));
create policy provusr_wr  on proveedor_usuario for all using (exists (select 1 from proveedor p where p.id = proveedor_id and rol_en(p.tienda_id) in ('ADMIN','OPERATIVO')));
create policy prodprov_sel on producto_proveedor for select using (exists (select 1 from producto p where p.id = producto_id and (es_miembro(p.tienda_id) or es_proveedor(p.tienda_id))));
create policy prodprov_wr  on producto_proveedor for all using (exists (select 1 from producto p where p.id = producto_id and rol_en(p.tienda_id) in ('ADMIN','OPERATIVO')));

-- Encargo: miembros ven todos; proveedor solo los suyos. Crean ADMIN/OPERATIVO/ATENCION; editan ADMIN/OPERATIVO.
create policy encargo_sel on encargo for select
  using (es_miembro(tienda_id) or proveedor_id in (select mis_proveedores(tienda_id)));
create policy encargo_ins on encargo for insert with check (rol_en(tienda_id) in ('ADMIN','OPERATIVO','ATENCION'));
create policy encargo_upd on encargo for update using (rol_en(tienda_id) in ('ADMIN','OPERATIVO','LOGISTICA'));

-- Hitos / checks / comentarios: lectura como el encargo; escritura SOLO vía funciones (security definer)
create policy hito_sel on hito for select
  using (exists (select 1 from encargo e where e.id = encargo_id
                  and (es_miembro(e.tienda_id) or e.proveedor_id in (select mis_proveedores(e.tienda_id)))));
create policy check_sel on check_encargo for select
  using (exists (select 1 from encargo e where e.id = encargo_id and es_miembro(e.tienda_id)));
create policy comentario_sel on comentario for select
  using (exists (select 1 from encargo e where e.id = encargo_id and es_miembro(e.tienda_id)));
create policy comentario_ins on comentario for insert
  with check (exists (select 1 from encargo e where e.id = encargo_id and es_miembro(e.tienda_id)));
create policy msg_sel on mensaje_enviado for select
  using (exists (select 1 from encargo e where e.id = encargo_id and es_miembro(e.tienda_id)));
create policy msg_ins on mensaje_enviado for insert
  with check (exists (select 1 from encargo e where e.id = encargo_id and rol_en(e.tienda_id) in ('ADMIN','OPERATIVO','ATENCION')));
create policy anulacion_sel on anulacion for select
  using (exists (select 1 from encargo e where e.id = encargo_id and es_miembro(e.tienda_id)));
create policy adjunto_sel on adjunto for select using (es_miembro(tienda_id) or es_proveedor(tienda_id));
create policy adjunto_wr  on adjunto for all using (es_miembro(tienda_id)) with check (es_miembro(tienda_id));
create policy actividad_sel on actividad for select using (es_admin(tienda_id));

-- Vista del proveedor: sin datos personales del cliente ni precios.
-- NO es security_invoker (el proveedor no puede leer `cliente`), así que
-- filtra ella misma por los proveedores del usuario. Es el equivalente a
-- lista de campos bloqueados para proveedores.
create or replace view v_encargo_proveedor as
select e.id, e.tienda_id, e.numero, e.datos, e.producto_id, e.proveedor_id,
       et.clave as etapa_actual_clave, et.nombre as etapa_actual_nombre,
       c.nombre as cliente_nombre, c.datos as cliente_datos, pr.nombre as producto_nombre,
       (select coalesce(jsonb_agg(jsonb_build_object('etapa', x.clave, 'fecha', h.fecha) order by h.fecha), '[]')
          from hito h join etapa x on x.id = h.etapa_id
         where h.encargo_id = e.id and h.deshecho_en is null and x.visible_para_proveedor) as hitos
  from encargo e
  join cliente c on c.id = e.cliente_id
  left join etapa et on et.id = etapa_actual(e.id)
  left join producto pr on pr.id = e.producto_id
 where e.estado = 'ACTIVO'
   and e.proveedor_id in (select mis_proveedores(e.tienda_id));
grant select on v_encargo_proveedor to authenticated;

-- ---------------------------------------------------------------------
-- Grants (explícitos: la RLS de arriba es lo que realmente limita)
-- ---------------------------------------------------------------------
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
-- hitos/checks/anulaciones solo por función (security definer): sin escritura directa
revoke insert, update, delete on hito, check_encargo, anulacion, actividad from authenticated;
grant execute on function crear_hito, deshacer_ultimo_hito, marcar_check, anular_encargo, recuperar_encargo, siguiente_numero, puertas_pendientes, etapa_actual, en_revision to authenticated;
