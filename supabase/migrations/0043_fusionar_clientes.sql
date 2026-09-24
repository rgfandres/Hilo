-- 0043 · Fusionar clientes duplicados y borrar clientes sin encargos (solo administración)
-- Fusionar: los encargos y el historial de medidas del duplicado pasan al que se queda; los datos
-- que le falten al que se queda se rellenan con los del duplicado; las notas se juntan. Luego se borra el duplicado.
create or replace function fusionar_clientes(p_queda uuid, p_sobra uuid) returns int
language plpgsql security definer set search_path = public as $$
declare q cliente%rowtype; s cliente%rowtype; n int;
begin
  if p_queda = p_sobra then raise exception 'Elige dos clientes distintos'; end if;
  select * into q from cliente where id = p_queda;
  select * into s from cliente where id = p_sobra;
  if q.id is null or s.id is null then raise exception 'Cliente no encontrado'; end if;
  if q.tienda_id <> s.tienda_id then raise exception 'Son de tiendas distintas'; end if;
  if not es_admin(q.tienda_id) then raise exception 'Solo administración puede fusionar clientes'; end if;
  update encargo set cliente_id = p_queda where cliente_id = p_sobra;
  get diagnostics n = row_count;
  update medida_historial set cliente_id = p_queda where cliente_id = p_sobra;
  update cliente set
    telefono = coalesce(nullif(btrim(q.telefono), ''), s.telefono),
    email    = coalesce(nullif(btrim(q.email), ''), s.email),
    datos    = coalesce(s.datos, '{}'::jsonb) || (select coalesce(jsonb_object_agg(k, v), '{}'::jsonb) from jsonb_each(coalesce(q.datos, '{}'::jsonb)) as x(k, v) where v <> 'null'::jsonb and v <> '""'::jsonb),
    notas    = nullif(concat_ws(E'\n', nullif(btrim(q.notas), ''), nullif(btrim(s.notas), '')), ''),
    actualizado_en = now()
  where id = p_queda;
  delete from cliente where id = p_sobra;
  return n;
end $$;
revoke all on function fusionar_clientes(uuid, uuid) from public, anon;
grant execute on function fusionar_clientes(uuid, uuid) to authenticated;

-- Borrar: solo si no tiene ningún encargo (ni anulado). Si tiene, hay que fusionarlo.
create or replace function borrar_cliente(p_cliente uuid) returns void
language plpgsql security definer set search_path = public as $$
declare c cliente%rowtype;
begin
  select * into c from cliente where id = p_cliente;
  if c.id is null then raise exception 'Cliente no encontrado'; end if;
  if not es_admin(c.tienda_id) then raise exception 'Solo administración puede borrar clientes'; end if;
  if exists (select 1 from encargo where cliente_id = p_cliente) then raise exception 'Tiene encargos: fusiónalo con otro en vez de borrarlo'; end if;
  delete from cliente where id = p_cliente;
end $$;
revoke all on function borrar_cliente(uuid) from public, anon;
grant execute on function borrar_cliente(uuid) to authenticated;

select 'ok 0043' as r;
