-- 0038 · Talleres y proveedores de material separados
-- proveedor.tipo (existía, sin usar, con 'TALLER' por defecto): ENCARGOS = hace encargos · MATERIAL = vende material · AMBOS.
-- Los que solo tienen material y ningún encargo pasan a MATERIAL; los que tienen las dos cosas, a AMBOS.

alter table proveedor alter column tipo set default 'ENCARGOS';
update proveedor set tipo = upper(coalesce(nullif(btrim(tipo), ''), 'ENCARGOS'));
update proveedor set tipo = 'ENCARGOS' where tipo not in ('ENCARGOS', 'MATERIAL', 'AMBOS');
update proveedor p set tipo = case when exists (select 1 from encargo e where e.proveedor_id = p.id) then 'AMBOS' else 'MATERIAL' end
 where p.tipo = 'ENCARGOS'
   and (exists (select 1 from material m where m.proveedor_id = p.id) or exists (select 1 from pedido_material x where x.proveedor_id = p.id));
do $$ begin
  alter table proveedor add constraint proveedor_tipo_ok check (tipo in ('ENCARGOS', 'MATERIAL', 'AMBOS'));
exception when duplicate_object then null; end $$;

create or replace view v_proveedores with (security_invoker = true) as
select p.id, p.tienda_id, p.nombre, p.activo, p.notas, p.telefono, p.email_contacto,
       (select count(*) from proveedor_usuario u where u.proveedor_id = p.id) as accesos,
       count(e.id) filter (where e.estado = 'ACTIVO' and ea.visible_para_proveedor
                             and exists (select 1 from etapa x where x.tipo_encargo_id = e.tipo_encargo_id
                                          and x.visible_para_proveedor and x.orden > ea.orden)) as en_su_mano,
       count(e.id) filter (where e.estado = 'ACTIVO' and not coalesce(ea.es_final, false)) as asignados,
       (select count(*) from v_encargo_estado v where v.proveedor_id = p.id and v.estado = 'ACTIVO' and v.atascado and v.en_proveedor) as atascados,
       p.tipo, p.unidad_pedido
  from proveedor p
  left join encargo e on e.proveedor_id = p.id
  left join etapa ea on ea.id = etapa_actual(e.id)
 group by p.id;
grant select on v_proveedores to authenticated;

-- Un encargo no se puede asignar a quien solo vende material
create or replace function fn_encargo_proveedor_tipo() returns trigger language plpgsql as $$
begin
  if new.proveedor_id is not null and (tg_op = 'INSERT' or new.proveedor_id is distinct from old.proveedor_id)
     and exists (select 1 from proveedor where id = new.proveedor_id and tipo = 'MATERIAL') then
    raise exception 'Ese proveedor solo vende material: no se le pueden asignar encargos';
  end if;
  return new;
end $$;
drop trigger if exists trg_encargo_proveedor_tipo on encargo;
create trigger trg_encargo_proveedor_tipo before insert or update of proveedor_id on encargo for each row execute function fn_encargo_proveedor_tipo();

-- Si a quien hace encargos se le pone material, pasa a vender material (o a las dos cosas si ya tiene encargos)
create or replace function fn_material_proveedor_tipo() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.proveedor_id is not null then
    update proveedor p set tipo = case when exists (select 1 from encargo e where e.proveedor_id = p.id) then 'AMBOS' else 'MATERIAL' end
     where p.id = new.proveedor_id and p.tipo = 'ENCARGOS';
  end if;
  return new;
end $$;
drop trigger if exists trg_material_proveedor_tipo on material;
create trigger trg_material_proveedor_tipo after insert or update of proveedor_id on material for each row execute function fn_material_proveedor_tipo();

select 'ok 0038' as r;
