-- =====================================================================
-- HILO · migración 0018 · notas por campo
-- Una nota corta pegada a un campo concreto del encargo («ojo: la medida
-- la confirma el cliente el lunes»). Se ve con 💬 junto al campo.
-- =====================================================================
create table if not exists nota_campo (
  encargo_id     uuid not null references encargo(id) on delete cascade,
  campo          text not null,
  tienda_id      uuid not null references tienda(id) on delete cascade,
  texto          text not null,
  usuario_id     uuid default auth.uid(),
  actualizado_en timestamptz not null default now(),
  primary key (encargo_id, campo)
);
alter table nota_campo enable row level security;
drop policy if exists nota_campo_sel on nota_campo;
create policy nota_campo_sel on nota_campo for select using (es_miembro(tienda_id));
grant select on nota_campo to authenticated;

-- Escribir y borrar solo por aquí: cualquiera del equipo puede anotar;
-- el texto vacío borra la nota.
create or replace function poner_nota_campo(p_encargo uuid, p_campo text, p_texto text)
returns void language plpgsql security definer set search_path = public as $$
declare v_tienda uuid;
begin
  select tienda_id into v_tienda from encargo where id = p_encargo;
  if v_tienda is null or not es_miembro(v_tienda) then raise exception 'Sin permiso'; end if;
  if coalesce(trim(p_campo), '') = '' then raise exception 'Falta el campo'; end if;
  if coalesce(trim(p_texto), '') = '' then
    delete from nota_campo where encargo_id = p_encargo and campo = p_campo;
    return;
  end if;
  insert into nota_campo (encargo_id, campo, tienda_id, texto, usuario_id, actualizado_en)
  values (p_encargo, p_campo, v_tienda, left(trim(p_texto), 500), auth.uid(), now())
  on conflict (encargo_id, campo) do update
    set texto = excluded.texto, usuario_id = excluded.usuario_id, actualizado_en = now();
end $$;
revoke all on function poner_nota_campo(uuid, text, text) from public, anon;
grant execute on function poner_nota_campo(uuid, text, text) to authenticated;

-- Tiempo real: la nota aparece sola en otras pantallas abiertas.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin alter publication supabase_realtime add table nota_campo; exception when duplicate_object then null; end;
  end if;
end $$;

select 'ok 0018' as r;
