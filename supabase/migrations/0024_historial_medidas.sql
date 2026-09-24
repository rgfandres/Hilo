-- =====================================================================
-- HILO · migración 0024 · historial de medidas (datos del cliente)
-- · Cada cambio en los datos del cliente deja una copia fechada.
-- · Al crear un encargo se guarda la copia de ese momento, ligada al encargo:
--   así se sabe con qué medidas se hizo aunque luego cambien.
-- =====================================================================
create table if not exists medida_historial (
  id          uuid primary key default gen_random_uuid(),
  tienda_id   uuid not null references tienda(id) on delete cascade,
  cliente_id  uuid not null references cliente(id) on delete cascade,
  encargo_id  uuid references encargo(id) on delete cascade,
  datos       jsonb not null default '{}'::jsonb,
  fecha       timestamptz not null default clock_timestamp(),
  usuario_id  uuid default auth.uid()
);
create index if not exists medida_historial_cli on medida_historial (cliente_id, fecha desc);
create index if not exists medida_historial_enc on medida_historial (encargo_id);
alter table medida_historial enable row level security;
drop policy if exists medida_hist_sel on medida_historial;
create policy medida_hist_sel on medida_historial for select using (es_miembro(tienda_id));
grant select, insert, update, delete on public.medida_historial to authenticated;
grant all on public.medida_historial to service_role;

create or replace function fn_cliente_historial() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' or new.datos is distinct from old.datos then
    insert into medida_historial (tienda_id, cliente_id, datos) values (new.tienda_id, new.id, coalesce(new.datos, '{}'));
  end if;
  return new;
end $$;
drop trigger if exists trg_cliente_historial on cliente;
create trigger trg_cliente_historial after insert or update of datos on cliente for each row execute function fn_cliente_historial();

create or replace function fn_encargo_historial() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.cliente_id is not null then
    insert into medida_historial (tienda_id, cliente_id, encargo_id, datos)
    select new.tienda_id, c.id, new.id, coalesce(c.datos, '{}') from cliente c where c.id = new.cliente_id;
  end if;
  return new;
end $$;
drop trigger if exists trg_encargo_historial on encargo;
create trigger trg_encargo_historial after insert on encargo for each row execute function fn_encargo_historial();

-- Punto de partida: una copia de los datos actuales de cada cliente
insert into medida_historial (tienda_id, cliente_id, datos, usuario_id)
select c.tienda_id, c.id, c.datos, null from cliente c
 where c.datos <> '{}'::jsonb and not exists (select 1 from medida_historial h where h.cliente_id = c.id);

select 'ok 0024' as r;
