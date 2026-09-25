-- 0058 · A8: marcar o desmarcar una comprobación (p. ej. «Adorno comprado») toca el encargo,
-- así el cambio llega en tiempo real a todas las pantallas (la de logística incluida).

create or replace function fn_check_toca_encargo() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update encargo set actualizado_en = now() where id = coalesce(new.encargo_id, old.encargo_id);
  return coalesce(new, old);
end $$;
drop trigger if exists trg_check_toca_encargo on check_encargo;
create trigger trg_check_toca_encargo after insert or update or delete on check_encargo
  for each row execute function fn_check_toca_encargo();

select 'ok 0058';
