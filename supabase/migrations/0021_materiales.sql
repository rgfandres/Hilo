-- =====================================================================
-- HILO · migración 0021 · módulo de materiales, compras y restos
-- · material: catálogo (tipo + variante), stock, umbral, unidad de pedido.
-- · movimiento_material: libro de movimientos; el stock es la suma de sus efectos.
-- · encargo_material: qué material lleva cada encargo y en qué punto está
--   (PENDIENTE → PEDIDO → RECIBIDO). Al pasar a RECIBIDO se consume del stock.
-- · pedido_material / pedido_linea / pedido_linea_encargo: pedidos a proveedor
--   que cubren varios encargos, con recepciones parciales.
-- · resto_material: sobrantes que ya no llegan a una unidad de pedido.
-- · Puerta nueva MATERIAL: no se pasa de etapa sin el material recibido.
-- Todo se escribe por funciones: nada cambia el stock «en silencio».
-- =====================================================================

-- Puerta nueva (el valor se usa como texto dentro de las funciones)
alter type tipo_puerta add value if not exists 'MATERIAL';

do $$ begin
  create type tipo_movimiento as enum ('PEDIDO','RECEPCION','CONSUMO','AJUSTE','RESTO','REVERSO');
exception when duplicate_object then null; end $$;

alter table proveedor add column if not exists unidad_pedido numeric(12,2);
alter table encargo  add column if not exists reaprovechar boolean not null default false;

create table if not exists material (
  id            uuid primary key default gen_random_uuid(),
  tienda_id     uuid not null references tienda(id) on delete cascade,
  tipo          text not null,
  variante      text not null default '',
  proveedor_id  uuid references proveedor(id) on delete set null,
  stock         numeric(12,2) not null default 0,
  umbral        numeric(12,2),
  unidad_pedido numeric(12,2),
  ubicacion     text,
  notas         text,
  activo        boolean not null default true,
  creado_en     timestamptz not null default now(),
  check (btrim(tipo) <> '')
);
create unique index if not exists material_unico on material (tienda_id, lower(btrim(tipo)), lower(btrim(variante)));

create table if not exists movimiento_material (
  id              uuid primary key default gen_random_uuid(),
  tienda_id       uuid not null references tienda(id) on delete cascade,
  material_id     uuid not null references material(id) on delete cascade,
  tipo            tipo_movimiento not null,
  cantidad        numeric(12,2) not null,   -- magnitud (siempre ≥ 0)
  delta           numeric(12,2) not null,   -- efecto en el stock (+ entra, − sale, 0 no toca)
  encargo_id      uuid references encargo(id) on delete set null,
  pedido_linea_id uuid,
  revierte_id     uuid references movimiento_material(id),
  revertido       boolean not null default false,
  usuario_id      uuid default auth.uid(),
  notas           text,
  fecha           timestamptz not null default clock_timestamp()
);
create index if not exists movimiento_material_idx on movimiento_material (material_id, fecha desc);

create table if not exists pedido_material (
  id            uuid primary key default gen_random_uuid(),
  tienda_id     uuid not null references tienda(id) on delete cascade,
  proveedor_id  uuid references proveedor(id) on delete set null,
  fecha         timestamptz not null default now(),
  notas         text,
  usuario_id    uuid default auth.uid()
);
create table if not exists pedido_linea (
  id           uuid primary key default gen_random_uuid(),
  pedido_id    uuid not null references pedido_material(id) on delete cascade,
  tienda_id    uuid not null references tienda(id) on delete cascade,
  material_id  uuid not null references material(id),
  cantidad     numeric(12,2) not null check (cantidad > 0)
);
do $$ begin
  alter table movimiento_material add constraint movimiento_linea_fk foreign key (pedido_linea_id) references pedido_linea(id) on delete set null;
exception when duplicate_object then null; end $$;
create table if not exists pedido_linea_encargo (
  linea_id    uuid not null references pedido_linea(id) on delete cascade,
  encargo_id  uuid not null references encargo(id) on delete cascade,
  cantidad    numeric(12,2) not null default 0,   -- lo pedido para ese encargo
  primary key (linea_id, encargo_id)
);

create table if not exists encargo_material (
  id           uuid primary key default gen_random_uuid(),
  tienda_id    uuid not null references tienda(id) on delete cascade,
  encargo_id   uuid not null references encargo(id) on delete cascade,
  material_id  uuid not null references material(id),
  cantidad     numeric(12,2) not null default 0 check (cantidad >= 0),
  estado       text not null default 'PENDIENTE' check (estado in ('PENDIENTE','PEDIDO','RECIBIDO')),
  consumo_id   uuid references movimiento_material(id),
  creado_en    timestamptz not null default now()
);
create index if not exists encargo_material_idx on encargo_material (encargo_id);

create table if not exists resto_material (
  id           uuid primary key default gen_random_uuid(),
  tienda_id    uuid not null references tienda(id) on delete cascade,
  material_id  uuid not null references material(id) on delete cascade,
  cantidad     numeric(12,2) not null check (cantidad > 0),
  origen       text,
  encargo_id   uuid references encargo(id) on delete set null,
  notas        text,
  fecha        timestamptz not null default now()
);

-- ---------- Seguridad: leer, los miembros; escribir, casi todo por funciones ----------
alter table material             enable row level security;
alter table movimiento_material  enable row level security;
alter table pedido_material      enable row level security;
alter table pedido_linea         enable row level security;
alter table pedido_linea_encargo enable row level security;
alter table encargo_material     enable row level security;
alter table resto_material       enable row level security;

drop policy if exists material_sel on material;
create policy material_sel on material for select using (es_miembro(tienda_id));
drop policy if exists material_ins on material;
create policy material_ins on material for insert with check (coalesce(rol_en(tienda_id)::text, '') in ('ADMIN','OPERATIVO'));
drop policy if exists material_upd on material;
create policy material_upd on material for update using (coalesce(rol_en(tienda_id)::text, '') in ('ADMIN','OPERATIVO'));
drop policy if exists movimiento_sel on movimiento_material;
create policy movimiento_sel on movimiento_material for select using (es_miembro(tienda_id));
drop policy if exists pedido_sel on pedido_material;
create policy pedido_sel on pedido_material for select using (es_miembro(tienda_id));
drop policy if exists pedido_linea_sel on pedido_linea;
create policy pedido_linea_sel on pedido_linea for select using (es_miembro(tienda_id));
drop policy if exists pedido_linea_enc_sel on pedido_linea_encargo;
create policy pedido_linea_enc_sel on pedido_linea_encargo for select
  using (exists (select 1 from pedido_linea l where l.id = linea_id and es_miembro(l.tienda_id)));
drop policy if exists encargo_material_sel on encargo_material;
create policy encargo_material_sel on encargo_material for select using (es_miembro(tienda_id));
drop policy if exists encargo_material_ins on encargo_material;
create policy encargo_material_ins on encargo_material for insert
  with check (coalesce(rol_en(tienda_id)::text, '') in ('ADMIN','OPERATIVO','ATENCION') and estado = 'PENDIENTE' and consumo_id is null
    and exists (select 1 from encargo e where e.id = encargo_id and e.tienda_id = encargo_material.tienda_id)
    and exists (select 1 from material m where m.id = material_id and m.tienda_id = encargo_material.tienda_id));
drop policy if exists encargo_material_upd on encargo_material;
create policy encargo_material_upd on encargo_material for update
  using (coalesce(rol_en(tienda_id)::text, '') in ('ADMIN','OPERATIVO','ATENCION'));
drop policy if exists encargo_material_del on encargo_material;
create policy encargo_material_del on encargo_material for delete
  using (coalesce(rol_en(tienda_id)::text, '') in ('ADMIN','OPERATIVO','ATENCION') and estado <> 'RECIBIDO');
drop policy if exists resto_sel on resto_material;
create policy resto_sel on resto_material for select using (es_miembro(tienda_id));

do $$
declare t text;
begin
  foreach t in array array['material','movimiento_material','pedido_material','pedido_linea','pedido_linea_encargo','encargo_material','resto_material'] loop
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;

-- El stock solo cambia a través de movimientos (y el estado de la línea, por funciones)
create or replace function fn_material_proteger() returns trigger language plpgsql as $$
begin
  if new.stock is distinct from old.stock and coalesce(current_setting('hilo.movimiento', true), '') <> '1' then
    new.stock := old.stock;
  end if;
  return new;
end $$;
drop trigger if exists trg_material_proteger on material;
create trigger trg_material_proteger before update on material for each row execute function fn_material_proteger();
-- Un material nace con stock 0: el stock inicial se apunta como ajuste (queda en el libro)
create or replace function fn_material_nace() returns trigger language plpgsql as $$
begin new.stock := 0; return new; end $$;
drop trigger if exists trg_material_nace on material;
create trigger trg_material_nace before insert on material for each row execute function fn_material_nace();

create or replace function fn_encargo_material_proteger() returns trigger language plpgsql as $$
begin
  if (new.estado is distinct from old.estado or new.consumo_id is distinct from old.consumo_id
      or (old.estado = 'RECIBIDO' and (new.material_id <> old.material_id or new.cantidad <> old.cantidad)))
     and coalesce(current_setting('hilo.movimiento', true), '') <> '1' then
    raise exception 'Eso se cambia con los botones de recibir o pedir';
  end if;
  return new;
end $$;
drop trigger if exists trg_encargo_material_proteger on encargo_material;
create trigger trg_encargo_material_proteger before update on encargo_material for each row execute function fn_encargo_material_proteger();

-- Apunta un movimiento y actualiza el stock. Uso interno.
create or replace function mover_material(p_material uuid, p_tipo tipo_movimiento, p_cantidad numeric, p_delta numeric,
  p_encargo uuid default null, p_linea uuid default null, p_revierte uuid default null, p_notas text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_t uuid;
begin
  select tienda_id into v_t from material where id = p_material;
  perform set_config('hilo.movimiento', '1', true);
  insert into movimiento_material (tienda_id, material_id, tipo, cantidad, delta, encargo_id, pedido_linea_id, revierte_id, notas)
  values (v_t, p_material, p_tipo, abs(p_cantidad), p_delta, p_encargo, p_linea, p_revierte, p_notas) returning id into v_id;
  if p_delta <> 0 then update material set stock = stock + p_delta where id = p_material; end if;
  if p_revierte is not null then update movimiento_material set revertido = true where id = p_revierte; end if;
  perform set_config('hilo.movimiento', '0', true);
  return v_id;
end $$;
revoke all on function mover_material(uuid, tipo_movimiento, numeric, numeric, uuid, uuid, uuid, text) from public, anon, authenticated;

create or replace function puede_material(p_tienda uuid) returns boolean language sql stable as $$
  select coalesce(rol_en(p_tienda)::text, '') in ('ADMIN','OPERATIVO','ATENCION','LOGISTICA')
$$;

-- Ajuste manual del stock (inventario, entradas por otro canal…). Siempre con motivo.
create or replace function ajustar_stock(p_material uuid, p_nuevo numeric, p_motivo text) returns numeric
language plpgsql security definer set search_path = public as $$
declare m material%rowtype;
begin
  select * into m from material where id = p_material;
  if m.id is null or coalesce(rol_en(m.tienda_id)::text, '') not in ('ADMIN','OPERATIVO') then raise exception 'Sin permiso'; end if;
  if p_nuevo is null or p_nuevo < 0 then raise exception 'El stock no puede ser negativo'; end if;
  if p_nuevo <> m.stock then
    perform mover_material(p_material, 'AJUSTE', p_nuevo - m.stock, p_nuevo - m.stock, null, null, null, coalesce(nullif(btrim(p_motivo), ''), 'Ajuste manual'));
  end if;
  return p_nuevo;
end $$;

-- Cuánto consume una línea: si el material se pide «por encargo» (unidad de pedido pequeña)
-- y hay un pedido hecho para este encargo, se consume lo pedido entero; si no, la cantidad de la línea.
create or replace function consumo_linea(p_linea uuid) returns numeric language sql stable as $$
  select coalesce((
    select ple.cantidad from pedido_linea_encargo ple
      join pedido_linea pl on pl.id = ple.linea_id
      join pedido_material pm on pm.id = pl.pedido_id
     where ple.encargo_id = em.encargo_id and pl.material_id = em.material_id and ple.cantidad > 0
       and coalesce(m.unidad_pedido, pv.unidad_pedido, 999999)
           <= coalesce((t.ajustes->>'unidad_por_encargo_max')::numeric, 10)
     order by pm.fecha desc limit 1), em.cantidad)
  from encargo_material em
  join material m on m.id = em.material_id
  join tienda t on t.id = em.tienda_id
  left join proveedor pv on pv.id = m.proveedor_id
  where em.id = p_linea
$$;

-- Recibir / asignar el material a un encargo: se consume del stock (idempotente)
create or replace function asignar_material(p_linea uuid) returns numeric
language plpgsql security definer set search_path = public as $$
declare l encargo_material%rowtype; v_mov uuid; v_cant numeric; v_stock numeric;
begin
  select * into l from encargo_material where id = p_linea for update;
  if l.id is null or not puede_material(l.tienda_id) then raise exception 'Sin permiso'; end if;
  if l.estado = 'RECIBIDO' then select stock into v_stock from material where id = l.material_id; return v_stock; end if;
  v_cant := coalesce(consumo_linea(p_linea), 0);
  v_mov := mover_material(l.material_id, 'CONSUMO', v_cant, -v_cant, l.encargo_id, null, null, null);
  perform set_config('hilo.movimiento', '1', true);
  update encargo_material set estado = 'RECIBIDO', consumo_id = v_mov where id = p_linea;
  perform set_config('hilo.movimiento', '0', true);
  select stock into v_stock from material where id = l.material_id;
  return v_stock;
end $$;

-- Deshacer la asignación: el consumo vuelve al stock con un movimiento de reverso
create or replace function desasignar_material(p_linea uuid) returns void
language plpgsql security definer set search_path = public as $$
declare l encargo_material%rowtype; c movimiento_material%rowtype; v_pedido boolean;
begin
  select * into l from encargo_material where id = p_linea for update;
  if l.id is null or not puede_material(l.tienda_id) then raise exception 'Sin permiso'; end if;
  if l.estado <> 'RECIBIDO' then return; end if;
  select * into c from movimiento_material where id = l.consumo_id;
  if c.id is not null and not c.revertido then
    perform mover_material(c.material_id, 'REVERSO', c.cantidad, -c.delta, l.encargo_id, null, c.id, 'Deshacer asignación');
  end if;
  v_pedido := exists (select 1 from pedido_linea_encargo ple join pedido_linea pl on pl.id = ple.linea_id
                       where ple.encargo_id = l.encargo_id and pl.material_id = l.material_id);
  perform set_config('hilo.movimiento', '1', true);
  update encargo_material set estado = case when v_pedido then 'PEDIDO' else 'PENDIENTE' end, consumo_id = null where id = p_linea;
  perform set_config('hilo.movimiento', '0', true);
end $$;

-- Pedido a proveedor: líneas [{material_id, cantidad, encargos:[{id, cantidad}]}]
create or replace function crear_pedido(p_tienda uuid, p_proveedor uuid, p_lineas jsonb, p_notas text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_p uuid; v_l uuid; x jsonb; e jsonb; v_cant numeric;
begin
  if coalesce(rol_en(p_tienda)::text, '') not in ('ADMIN','OPERATIVO') then raise exception 'Sin permiso'; end if;
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
       where encargo_id = (e->>'id')::uuid and material_id = (x->>'material_id')::uuid and estado = 'PENDIENTE';
      perform set_config('hilo.movimiento', '0', true);
    end loop;
  end loop;
  if not exists (select 1 from pedido_linea where pedido_id = v_p) then raise exception 'El pedido está vacío'; end if;
  return v_p;
end $$;

-- Recepción (parcial y sin máximo): suma al stock; opcionalmente asigna el material
-- a los encargos de esa línea que lo estaban esperando.
create or replace function recibir_linea(p_linea uuid, p_cantidad numeric, p_asignar boolean default false) returns jsonb
language plpgsql security definer set search_path = public as $$
declare l pedido_linea%rowtype; r record; v_asignados int := 0; v_stock numeric;
begin
  select * into l from pedido_linea where id = p_linea;
  if l.id is null or not puede_material(l.tienda_id) then raise exception 'Sin permiso'; end if;
  if p_cantidad is null or p_cantidad <= 0 then raise exception 'Indica cuánto ha llegado'; end if;
  perform mover_material(l.material_id, 'RECEPCION', p_cantidad, p_cantidad, null, p_linea, null, null);
  if p_asignar then
    for r in select em.id from encargo_material em
               join pedido_linea_encargo ple on ple.encargo_id = em.encargo_id and ple.linea_id = p_linea
               join encargo e on e.id = em.encargo_id and e.estado = 'ACTIVO'
              where em.material_id = l.material_id and em.estado = 'PEDIDO' loop
      perform asignar_material(r.id); v_asignados := v_asignados + 1;
    end loop;
  end if;
  select stock into v_stock from material where id = l.material_id;
  return jsonb_build_object('stock', v_stock, 'asignados', v_asignados);
end $$;

-- Revertir un movimiento manual (ajuste o recepción mal apuntada). No borra: apunta el contrario.
create or replace function revertir_movimiento(p_mov uuid, p_motivo text default null) returns void
language plpgsql security definer set search_path = public as $$
declare c movimiento_material%rowtype;
begin
  select * into c from movimiento_material where id = p_mov;
  if c.id is null or coalesce(rol_en(c.tienda_id)::text, '') not in ('ADMIN','OPERATIVO') then raise exception 'Sin permiso'; end if;
  if c.revertido or c.tipo in ('REVERSO','CONSUMO','PEDIDO','RESTO') then raise exception 'Ese movimiento no se puede revertir desde aquí'; end if;
  perform mover_material(c.material_id, 'REVERSO', c.cantidad, -c.delta, c.encargo_id, c.pedido_linea_id, c.id, coalesce(p_motivo, 'Revertido'));
end $$;

-- Restos: apartar un sobrante (sale del stock y queda en la lista de restos)
create or replace function guardar_resto(p_material uuid, p_cantidad numeric, p_origen text default null, p_encargo uuid default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare m material%rowtype; v_id uuid;
begin
  select * into m from material where id = p_material;
  if m.id is null or not puede_material(m.tienda_id) then raise exception 'Sin permiso'; end if;
  if p_cantidad is null or p_cantidad <= 0 then raise exception 'Cantidad no válida'; end if;
  perform mover_material(p_material, 'RESTO', p_cantidad, -p_cantidad, p_encargo, null, null, coalesce(p_origen, 'Guardado como resto'));
  insert into resto_material (tienda_id, material_id, cantidad, origen, encargo_id) values (m.tienda_id, p_material, p_cantidad, p_origen, p_encargo) returning id into v_id;
  return v_id;
end $$;

-- Editar o dar por usado un resto (deja constancia en el libro, sin tocar el stock de piezas enteras)
create or replace function cambiar_resto(p_resto uuid, p_cantidad numeric, p_notas text default null) returns void
language plpgsql security definer set search_path = public as $$
declare r resto_material%rowtype;
begin
  select * into r from resto_material where id = p_resto;
  if r.id is null or not puede_material(r.tienda_id) then raise exception 'Sin permiso'; end if;
  if coalesce(p_cantidad, 0) <= 0 then
    delete from resto_material where id = p_resto;
    perform mover_material(r.material_id, 'RESTO', r.cantidad, 0, r.encargo_id, null, null, coalesce(p_notas, 'Resto usado o descartado'));
  else
    update resto_material set cantidad = p_cantidad, notas = coalesce(p_notas, notas) where id = p_resto;
    perform mover_material(r.material_id, 'RESTO', abs(p_cantidad - r.cantidad), 0, r.encargo_id, null, null, 'Resto corregido: ' || r.cantidad || ' → ' || p_cantidad);
  end if;
end $$;

-- Al anular: devolver el material consumido o darlo por perdido (y marcar para reaprovechar)
create or replace function liberar_material_encargo(p_encargo uuid, p_devolver boolean) returns int
language plpgsql security definer set search_path = public as $$
declare r record; n int := 0; v_t uuid;
begin
  select tienda_id into v_t from encargo where id = p_encargo;
  if v_t is null or coalesce(rol_en(v_t)::text, '') <> 'ADMIN' then raise exception 'Sin permiso'; end if;
  if p_devolver then
    for r in select id from encargo_material where encargo_id = p_encargo and estado = 'RECIBIDO' loop
      perform desasignar_material(r.id); n := n + 1;
    end loop;
  else
    update encargo set reaprovechar = true where id = p_encargo;
    select count(*) into n from encargo_material where encargo_id = p_encargo and estado = 'RECIBIDO';
  end if;
  return n;
end $$;

do $$
declare f text;
begin
  foreach f in array array['ajustar_stock(uuid,numeric,text)','asignar_material(uuid)','desasignar_material(uuid)',
    'crear_pedido(uuid,uuid,jsonb,text)','recibir_linea(uuid,numeric,boolean)','revertir_movimiento(uuid,text)',
    'guardar_resto(uuid,numeric,text,uuid)','cambiar_resto(uuid,numeric,text)','liberar_material_encargo(uuid,boolean)'] loop
    execute 'revoke all on function ' || f || ' from public, anon';
    execute 'grant execute on function ' || f || ' to authenticated';
  end loop;
end $$;

-- ---------- Vistas ----------
-- Estado de cada línea de pedido: recibido, pendiente y estado
create or replace view v_pedido_linea with (security_invoker = true) as
select pl.*, pm.fecha, pm.proveedor_id, pm.notas as pedido_notas, pv.nombre as proveedor_nombre,
       m.tipo, m.variante,
       greatest(coalesce(rec.neto, 0), 0) as recibido,
       greatest(pl.cantidad - coalesce(rec.neto, 0), 0) as pendiente,
       case when pl.cantidad - coalesce(rec.neto, 0) <= 0.001 then 'RECIBIDO'
            when coalesce(rec.neto, 0) > 0.001 then 'PARCIAL' else 'PENDIENTE' end as estado,
       (select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'numero', e.numero, 'serie', e.serie, 'cliente', c.nombre, 'cantidad', ple.cantidad)), '[]')
          from pedido_linea_encargo ple join encargo e on e.id = ple.encargo_id left join cliente c on c.id = e.cliente_id
         where ple.linea_id = pl.id) as encargos
from pedido_linea pl
join pedido_material pm on pm.id = pl.pedido_id
join material m on m.id = pl.material_id
left join proveedor pv on pv.id = pm.proveedor_id
left join lateral (
  select sum(case when mm.tipo = 'RECEPCION' then mm.cantidad when mm.tipo = 'REVERSO' then -mm.cantidad else 0 end) as neto
    from movimiento_material mm where mm.pedido_linea_id = pl.id and mm.tipo in ('RECEPCION','REVERSO')
      and not (mm.tipo = 'REVERSO' and exists (select 1 from movimiento_material o where o.id = mm.revierte_id and o.tipo = 'PEDIDO'))
) rec on true;
grant select on v_pedido_linea to authenticated;

-- Estado de cada material: demanda de encargos activos, lo que viene en camino y lo que faltaría
create or replace view v_material_estado with (security_invoker = true) as
select m.*, pv.nombre as proveedor_nombre,
       coalesce(m.unidad_pedido, pv.unidad_pedido) as unidad_efectiva,
       coalesce(m.umbral, (t.ajustes->>'umbral_material_defecto')::numeric, 0) as umbral_efectivo,
       coalesce(d.demanda, 0) as demanda, coalesce(d.encargos, 0) as encargos_pendientes,
       coalesce(d.sin_pedir, 0) as demanda_sin_pedir,
       coalesce(c.en_camino, 0) as en_camino,
       coalesce(r.restos, 0) as restos
from material m
join tienda t on t.id = m.tienda_id
left join proveedor pv on pv.id = m.proveedor_id
left join lateral (
  select sum(em.cantidad) as demanda, count(distinct em.encargo_id) as encargos,
         sum(em.cantidad) filter (where em.estado = 'PENDIENTE') as sin_pedir
    from encargo_material em join encargo e on e.id = em.encargo_id and e.estado = 'ACTIVO'
   where em.material_id = m.id and em.estado in ('PENDIENTE','PEDIDO')
) d on true
left join lateral (select sum(v.pendiente) as en_camino from v_pedido_linea v where v.material_id = m.id) c on true
left join lateral (select sum(rm.cantidad) as restos from resto_material rm where rm.material_id = m.id) r on true;
grant select on v_material_estado to authenticated;

-- ---------- Puerta MATERIAL ----------
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
    elsif p.tipo::text = 'MATERIAL' then
      v_ok := exists (select 1 from encargo_material em where em.encargo_id = p_encargo)
              and not exists (select 1 from encargo_material em where em.encargo_id = p_encargo and em.estado <> 'RECIBIDO');
    end if;
    if not v_ok then mensaje := p.mensaje; dura := p.dura; tipo := p.tipo::text; referencia := p.referencia; return next; end if;
  end loop;
end $$;

-- La versión corta (la usa crear_hito) sale de la detallada: una sola lógica
create or replace function puertas_pendientes(p_encargo uuid, p_etapa uuid)
returns table (mensaje text, dura boolean)
language sql stable as $$
  select d.mensaje, d.dura from puertas_pendientes_det(p_encargo, p_etapa) d
$$;

-- Qué queda por hacer a mano al anular: ahora también el material
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
    'n_hitos', (select count(*) from hito h where h.encargo_id = v_e.id and h.deshecho_en is null),
    'material_recibido', (select coalesce(jsonb_agg(jsonb_build_object('material', trim(both ' /' from m.tipo || ' / ' || m.variante), 'cantidad', em.cantidad)), '[]')
                            from encargo_material em join material m on m.id = em.material_id
                           where em.encargo_id = v_e.id and em.estado = 'RECIBIDO'),
    'material_pedido', (select count(*) from encargo_material em where em.encargo_id = v_e.id and em.estado = 'PEDIDO')
  ) into v;
  return v;
end $$;

-- Realtime para que el stock y los pedidos se vean al momento
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin alter publication supabase_realtime add table material; exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table encargo_material; exception when duplicate_object then null; end;
  end if;
end $$;

select 'ok 0021' as r;
