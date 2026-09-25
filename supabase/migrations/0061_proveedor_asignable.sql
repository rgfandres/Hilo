-- A26 · Un proveedor que hace encargos pero no se asigna (p. ej. el cortador: trabaja por la hoja de producción).
-- Sigue en la lista de proveedores, pero no sale para elegirlo en los encargos.
alter table public.proveedor add column if not exists asignable boolean not null default true;

create or replace view v_proveedores with (security_invoker = true) as
select p.id, p.tienda_id, p.nombre, p.activo, p.notas, p.telefono, p.email_contacto,
       (select count(*) from proveedor_usuario u where u.proveedor_id = p.id) as accesos,
       count(e.id) filter (where e.estado = 'ACTIVO' and ea.visible_para_proveedor
                             and exists (select 1 from etapa x where x.tipo_encargo_id = e.tipo_encargo_id
                                          and x.visible_para_proveedor and x.orden > ea.orden)) as en_su_mano,
       count(e.id) filter (where e.estado = 'ACTIVO' and not coalesce(ea.es_final, false)) as asignados,
       (select count(*) from v_encargo_estado v where v.proveedor_id = p.id and v.estado = 'ACTIVO' and v.atascado and v.en_proveedor) as atascados,
       p.tipo, p.unidad_pedido, p.asignable
  from proveedor p
  left join encargo e on e.proveedor_id = p.id
  left join etapa ea on ea.id = etapa_actual(e.id)
 group by p.id;
grant select on v_proveedores to authenticated;
