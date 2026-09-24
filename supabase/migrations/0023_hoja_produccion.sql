-- =====================================================================
-- HILO · migración 0023 · hoja de producción
-- · etapa.es_produccion: al marcar esa etapa, el encargo entra en la hoja
--   de producción de su producto (en la misma operación y nunca dos veces).
-- · linea_produccion: una por encargo; marca para imprimir, bloqueo y registro de impresión.
-- · impresion_produccion: cada impresión con fecha, usuario y copia de lo impreso
--   (se puede reimprimir exactamente igual).
-- · v_linea_produccion: coherencia línea ↔ encargo (enviado, no enviado, revisar, anulado).
-- =====================================================================
alter table etapa add column if not exists es_produccion boolean not null default false;

create table if not exists linea_produccion (
  id           uuid primary key default gen_random_uuid(),
  tienda_id    uuid not null references tienda(id) on delete cascade,
  encargo_id   uuid not null unique references encargo(id) on delete cascade,
  producto_id  uuid references producto(id) on delete set null,
  enviado_en   timestamptz not null default now(),
  enviado_por  uuid default auth.uid(),
  imprimir     boolean not null default true,
  bloqueada    boolean not null default false,
  impreso_en   timestamptz,
  impreso_por  uuid,
  impresion_id uuid
);
create index if not exists linea_produccion_prod on linea_produccion (tienda_id, producto_id);

create table if not exists impresion_produccion (
  id          uuid primary key default gen_random_uuid(),
  tienda_id   uuid not null references tienda(id) on delete cascade,
  producto_id uuid references producto(id) on delete set null,
  fecha       timestamptz not null default now(),
  usuario_id  uuid default auth.uid(),
  n_lineas    int not null default 0,
  contenido   jsonb not null default '{}'::jsonb
);
do $$ begin
  alter table linea_produccion add constraint linea_impresion_fk foreign key (impresion_id) references impresion_produccion(id) on delete set null;
exception when duplicate_object then null; end $$;

alter table linea_produccion     enable row level security;
alter table impresion_produccion enable row level security;
drop policy if exists linea_prod_sel on linea_produccion;
create policy linea_prod_sel on linea_produccion for select using (es_miembro(tienda_id));
drop policy if exists linea_prod_upd on linea_produccion;
create policy linea_prod_upd on linea_produccion for update using (coalesce(rol_en(tienda_id)::text, '') in ('ADMIN','OPERATIVO'));
drop policy if exists impresion_sel on impresion_produccion;
create policy impresion_sel on impresion_produccion for select using (es_miembro(tienda_id));
grant select, insert, update, delete on public.linea_produccion to authenticated;
grant select, insert, update, delete on public.impresion_produccion to authenticated;
grant all on public.linea_produccion to service_role;
grant all on public.impresion_produccion to service_role;

-- Solo se pueden cambiar la marca de imprimir y el bloqueo desde la app; el resto, por funciones
create or replace function fn_linea_prod_proteger() returns trigger language plpgsql as $$
begin
  if coalesce(current_setting('hilo.produccion', true), '') <> '1' then
    new.encargo_id := old.encargo_id; new.producto_id := old.producto_id; new.tienda_id := old.tienda_id;
    new.enviado_en := old.enviado_en; new.enviado_por := old.enviado_por;
    new.impreso_en := old.impreso_en; new.impreso_por := old.impreso_por; new.impresion_id := old.impresion_id;
  end if;
  return new;
end $$;
drop trigger if exists trg_linea_prod_proteger on linea_produccion;
create trigger trg_linea_prod_proteger before update on linea_produccion for each row execute function fn_linea_prod_proteger();

-- Al marcar una etapa de producción nace la línea (si ya existía, se actualiza el producto y la fecha)
create or replace function fn_hito_produccion() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_prod boolean; v_enc encargo%rowtype;
begin
  if new.tipo <> 'NORMAL' then return new; end if;
  select es_produccion into v_prod from etapa where id = new.etapa_id;
  if not coalesce(v_prod, false) then return new; end if;
  select * into v_enc from encargo where id = new.encargo_id;
  perform set_config('hilo.produccion', '1', true);
  insert into linea_produccion (tienda_id, encargo_id, producto_id, enviado_en, enviado_por)
  values (v_enc.tienda_id, v_enc.id, v_enc.producto_id, new.fecha, new.usuario_id)
  on conflict (encargo_id) do update
    set producto_id = excluded.producto_id, enviado_en = excluded.enviado_en, enviado_por = excluded.enviado_por,
        imprimir = case when linea_produccion.impreso_en is null then true else linea_produccion.imprimir end;
  perform set_config('hilo.produccion', '0', true);
  return new;
end $$;
drop trigger if exists trg_hito_produccion on hito;
create trigger trg_hito_produccion after insert on hito for each row execute function fn_hito_produccion();

-- Coherencia de cada línea con su encargo
create or replace view v_linea_produccion with (security_invoker = true) as
select l.*, e.numero, e.serie, e.estado as encargo_estado, e.producto_id as encargo_producto_id, e.complementos, e.datos,
       c.nombre as cliente_nombre, p.nombre as producto_nombre, pv.nombre as proveedor_nombre,
       ea.nombre as etapa_actual_nombre,
       env.enviado as sigue_enviado,
       array_remove(array[
         case when e.estado <> 'ACTIVO' then 'El encargo está anulado' end,
         case when e.producto_id is distinct from l.producto_id then 'Ha cambiado el producto del encargo' end,
         case when not coalesce(env.enviado, false) and e.estado = 'ACTIVO' then 'El paso de producción se deshizo' end,
         case when en_revision(e.id) or mr.encargo_id is not null then 'Está marcado para revisar' end
       ], null) as motivos,
       case when e.estado <> 'ACTIVO' then 'ANULADO'
            when e.producto_id is distinct from l.producto_id or en_revision(e.id) or mr.encargo_id is not null then 'REVISAR'
            when not coalesce(env.enviado, false) then 'NO_ENVIADO'
            else 'ENVIADO' end as coherencia
from linea_produccion l
join encargo e on e.id = l.encargo_id
left join cliente c on c.id = e.cliente_id
left join producto p on p.id = l.producto_id
left join proveedor pv on pv.id = e.proveedor_id
left join etapa ea on ea.id = etapa_actual(e.id)
left join marca_revisar mr on mr.encargo_id = e.id
left join lateral (
  select exists (select 1 from hito h join etapa x on x.id = h.etapa_id
                  where h.encargo_id = e.id and h.deshecho_en is null and h.tipo = 'NORMAL' and x.es_produccion) as enviado
) env on true;
grant select on v_linea_produccion to authenticated;

-- Registrar una impresión: solo líneas enviadas y coherentes; guarda la copia de lo impreso
create or replace function registrar_impresion(p_tienda uuid, p_producto uuid, p_lineas uuid[], p_contenido jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_mal text;
begin
  if coalesce(rol_en(p_tienda)::text, '') not in ('ADMIN','OPERATIVO') then raise exception 'Sin permiso'; end if;
  if coalesce(array_length(p_lineas, 1), 0) = 0 then raise exception 'No hay nada marcado para imprimir'; end if;
  select string_agg(lpad(v.numero::text, 3, '0') || ': ' || array_to_string(v.motivos, ', '), ' · ') into v_mal
    from v_linea_produccion v where v.id = any(p_lineas) and (v.coherencia <> 'ENVIADO' or v.tienda_id <> p_tienda);
  if v_mal is not null then raise exception 'No se puede imprimir. %', v_mal; end if;
  insert into impresion_produccion (tienda_id, producto_id, n_lineas, contenido)
  values (p_tienda, p_producto, array_length(p_lineas, 1), coalesce(p_contenido, '{}')) returning id into v_id;
  perform set_config('hilo.produccion', '1', true);
  update linea_produccion set impreso_en = now(), impreso_por = auth.uid(), impresion_id = v_id, imprimir = false
   where id = any(p_lineas) and tienda_id = p_tienda;
  perform set_config('hilo.produccion', '0', true);
  return v_id;
end $$;
revoke all on function registrar_impresion(uuid, uuid, uuid[], jsonb) from public, anon;
grant execute on function registrar_impresion(uuid, uuid, uuid[], jsonb) to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin alter publication supabase_realtime add table linea_produccion; exception when duplicate_object then null; end;
  end if;
end $$;

select 'ok 0023' as r;
