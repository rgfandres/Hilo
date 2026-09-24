-- 0046 · Trazabilidad: el número y la serie de un encargo no cambian nunca una vez creado.
-- Anular lo deja con su número; el siguiente siempre es el mayor usado + 1 (anulados incluidos),
-- así que ningún número se reutiliza ni se corre. No hay permiso para borrar encargos.
create or replace function fn_encargo_numero_fijo() returns trigger language plpgsql as $$
begin
  if new.numero is distinct from old.numero or new.serie is distinct from old.serie
     or new.tienda_id is distinct from old.tienda_id or new.periodo_id is distinct from old.periodo_id then
    raise exception 'El número de un encargo no se puede cambiar (%, nº %)', coalesce(old.serie, ''), old.numero;
  end if;
  return new;
end $$;
drop trigger if exists trg_encargo_numero_fijo on encargo;
create trigger trg_encargo_numero_fijo before update on encargo for each row execute function fn_encargo_numero_fijo();

select 'ok 0046' as r;
