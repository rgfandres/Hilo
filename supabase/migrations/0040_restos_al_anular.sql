-- 0040 · Al anular devolviendo el material, los restos que dejó ese encargo vuelven al stock
-- (en Notelodigo: «y el retal vuelve al rollo»). Solo los que salieron del stock con ese encargo.
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
    for r in select * from resto_material where encargo_id = p_encargo loop
      perform mover_material(r.material_id, 'AJUSTE', r.cantidad, r.cantidad, p_encargo, null, null, 'El resto vuelve al stock al anular');
      delete from resto_material where id = r.id;
    end loop;
  else
    update encargo set reaprovechar = true where id = p_encargo;
    select count(*) into n from encargo_material where encargo_id = p_encargo and estado = 'RECIBIDO';
  end if;
  return n;
end $$;

select 'ok 0040' as r;
