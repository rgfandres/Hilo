-- 0048 · Un correo da acceso a un solo proveedor de la tienda (como Notelodigo:
-- «El email ya está asignado al taller X»). Si no, esa cuenta vería los trabajos de los dos.
create or replace function fn_proveedor_usuario_unico() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_t uuid; v_otro text;
begin
  new.email := lower(btrim(new.email));
  select tienda_id into v_t from proveedor where id = new.proveedor_id;
  select p.nombre into v_otro
    from proveedor_usuario pu join proveedor p on p.id = pu.proveedor_id
   where lower(pu.email) = new.email and p.tienda_id = v_t and pu.proveedor_id <> new.proveedor_id
   limit 1;
  if v_otro is not null then
    raise exception 'El correo % ya tiene acceso a «%». Quítaselo allí antes.', new.email, v_otro;
  end if;
  return new;
end $$;
drop trigger if exists trg_proveedor_usuario_unico on proveedor_usuario;
create trigger trg_proveedor_usuario_unico before insert or update on proveedor_usuario
  for each row execute function fn_proveedor_usuario_unico();

select 'ok 0048' as r;
