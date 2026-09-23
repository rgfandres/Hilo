-- =====================================================================
-- HILO · migración 0009 · pantallas de catálogo (productos, clientes, proveedores)
-- =====================================================================

-- Datos de contacto y notas del proveedor
alter table proveedor add column if not exists telefono text;
alter table proveedor add column if not exists email_contacto text;

-- Nombres únicos sin distinguir mayúsculas (evita «Anillo» y «anillo»)
create unique index if not exists producto_nombre_ci on producto (tienda_id, lower(nombre));
create unique index if not exists proveedor_nombre_ci on proveedor (tienda_id, lower(nombre));

-- Lista de clientes con sus números (respeta la RLS de quien consulta)
create or replace view v_clientes with (security_invoker = true) as
select c.id, c.tienda_id, c.nombre, c.telefono, c.email, c.datos, c.notas, c.creado_en,
       count(e.id) filter (where e.estado = 'ACTIVO')                                   as encargos,
       count(e.id) filter (where e.estado = 'ACTIVO' and not coalesce(ea.es_final, false)) as en_curso,
       max(e.creado_en) filter (where e.estado = 'ACTIVO')                                as ultimo_encargo
  from cliente c
  left join encargo e on e.cliente_id = c.id
  left join etapa ea on ea.id = etapa_actual(e.id)
 group by c.id;
grant select on v_clientes to authenticated;

-- Lista de proveedores con lo que tienen en su mano
create or replace view v_proveedores with (security_invoker = true) as
select p.id, p.tienda_id, p.nombre, p.activo, p.notas, p.telefono, p.email_contacto,
       (select count(*) from proveedor_usuario u where u.proveedor_id = p.id) as accesos,
       count(e.id) filter (where e.estado = 'ACTIVO' and ea.visible_para_proveedor
                             and exists (select 1 from etapa x where x.tipo_encargo_id = e.tipo_encargo_id
                                          and x.visible_para_proveedor and x.orden > ea.orden)) as en_su_mano,
       count(e.id) filter (where e.estado = 'ACTIVO') as asignados
  from proveedor p
  left join encargo e on e.proveedor_id = p.id
  left join etapa ea on ea.id = etapa_actual(e.id)
 group by p.id;
grant select on v_proveedores to authenticated;

-- Lista de productos con cuántos encargos los usan
create or replace view v_productos with (security_invoker = true) as
select pr.id, pr.tienda_id, pr.nombre, pr.foto_url, pr.precio_base, pr.activo, pr.datos,
       count(e.id) filter (where e.estado = 'ACTIVO') as encargos
  from producto pr
  left join encargo e on e.producto_id = pr.id
 group by pr.id;
grant select on v_productos to authenticated;

-- Fotos (bucket público de solo lectura; escriben ADMIN y OPERATIVO de la tienda).
-- Ruta: <tienda_id>/<fichero>
insert into storage.buckets (id, name, public) values ('fotos', 'fotos', true)
on conflict (id) do nothing;

drop policy if exists fotos_escribir on storage.objects;
create policy fotos_escribir on storage.objects for insert to authenticated
  with check (bucket_id = 'fotos' and exists (
    select 1 from public.miembro m
     where m.tienda_id::text = (storage.foldername(name))[1]
       and m.user_id = auth.uid() and m.activo and m.rol in ('ADMIN','OPERATIVO')));
drop policy if exists fotos_borrar on storage.objects;
create policy fotos_borrar on storage.objects for delete to authenticated
  using (bucket_id = 'fotos' and exists (
    select 1 from public.miembro m
     where m.tienda_id::text = (storage.foldername(name))[1]
       and m.user_id = auth.uid() and m.activo and m.rol in ('ADMIN','OPERATIVO')));
