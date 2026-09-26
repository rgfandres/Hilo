-- Listas de la tienda (Adornos, Metales, Piedras…) y receta por producto.
-- · lista_tienda: listas de valores que mantiene la propia tienda; un campo «desplegable» puede tomar de una.
-- · producto.componentes: lo que lleva cada producto (de qué lista sale, si lo elige el cliente o es fijo,
--   y el valor según la variante del material, p. ej. el color de la tela).
create table if not exists public.lista_tienda (
  id uuid primary key default gen_random_uuid(),
  tienda_id uuid not null references public.tienda(id) on delete cascade,
  nombre text not null check (length(btrim(nombre)) between 1 and 60),
  valores jsonb not null default '[]'::jsonb,   -- [{ "v": "Cordoncillo", "activo": true }]
  orden int not null default 0,
  creado_en timestamptz not null default now()
);
create unique index if not exists lista_tienda_nombre on public.lista_tienda (tienda_id, lower(nombre));
alter table public.lista_tienda enable row level security;
drop policy if exists lista_sel on public.lista_tienda;
create policy lista_sel on public.lista_tienda for select using (es_miembro(tienda_id));
drop policy if exists lista_ins on public.lista_tienda;
create policy lista_ins on public.lista_tienda for insert with check (coalesce(rol_en(tienda_id)::text, '') in ('ADMIN','OPERATIVO'));
drop policy if exists lista_upd on public.lista_tienda;
create policy lista_upd on public.lista_tienda for update using (coalesce(rol_en(tienda_id)::text, '') in ('ADMIN','OPERATIVO'));
drop policy if exists lista_del on public.lista_tienda;
create policy lista_del on public.lista_tienda for delete using (coalesce(rol_en(tienda_id)::text, '') = 'ADMIN');
grant select, insert, update, delete on public.lista_tienda to authenticated;

alter table public.producto add column if not exists componentes jsonb not null default '[]'::jsonb;

create or replace view v_productos with (security_invoker = true) as
select pr.id, pr.tienda_id, pr.nombre, pr.foto_url, pr.precio_base, pr.activo, pr.datos,
       count(e.id) filter (where e.estado = 'ACTIVO') as encargos,
       pr.material_tipo, pr.consumo, pr.construccion, pr.receta, pr.componentes
  from producto pr
  left join encargo e on e.producto_id = pr.id
 group by pr.id;
grant select on v_productos to authenticated;

select 'ok 0066';
