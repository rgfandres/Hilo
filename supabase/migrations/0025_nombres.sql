-- =====================================================================
-- HILO · migración 0025 · nombres normalizados y búsqueda sin tildes
-- · Si la tienda lo activa (ajustes.normalizar_nombres), los nombres de clientes,
--   productos, proveedores y materiales se guardan en MAYÚSCULAS y sin tildes (la Ñ se conserva).
-- · cliente.nombre_plano: el nombre sin tildes ni mayúsculas, para buscar «jose» y encontrar «José».
-- · periodo.ajustes: lo propio de cada periodo (ficha, guía de medidas); si no hay, lo de la tienda.
-- =====================================================================
create or replace function texto_plano(t text) returns text language sql immutable as $$
  select lower(translate(coalesce(t, ''), 'ÁÉÍÓÚÜÀÈÌÒÙÂÊÎÔÛáéíóúüàèìòùâêîôû', 'AEIOUUAEIOUAEIOUaeiouuaeiouaeiou'))
$$;
create or replace function nombre_normalizado(t text) returns text language sql immutable as $$
  select upper(translate(btrim(regexp_replace(coalesce(t, ''), '\s+', ' ', 'g')), 'ÁÉÍÓÚÜÀÈÌÒÙÂÊÎÔÛáéíóúüàèìòùâêîôû', 'AEIOUUAEIOUAEIOUaeiouuaeiouaeiou'))
$$;

alter table cliente add column if not exists nombre_plano text generated always as (texto_plano(nombre)) stored;
create index if not exists cliente_nombre_plano on cliente (tienda_id, nombre_plano);

create or replace function fn_normalizar_nombre() returns trigger language plpgsql as $$
declare v boolean;
begin
  select coalesce((ajustes->>'normalizar_nombres')::boolean, false) into v from tienda where id = new.tienda_id;
  if v then
    if tg_table_name = 'material' then
      new.tipo := nombre_normalizado(new.tipo); new.variante := nombre_normalizado(new.variante);
    else
      new.nombre := nombre_normalizado(new.nombre);
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_normalizar_cliente on cliente;
create trigger trg_normalizar_cliente before insert or update of nombre on cliente for each row execute function fn_normalizar_nombre();
drop trigger if exists trg_normalizar_producto on producto;
create trigger trg_normalizar_producto before insert or update of nombre on producto for each row execute function fn_normalizar_nombre();
drop trigger if exists trg_normalizar_proveedor on proveedor;
create trigger trg_normalizar_proveedor before insert or update of nombre on proveedor for each row execute function fn_normalizar_nombre();
drop trigger if exists trg_normalizar_material on material;
create trigger trg_normalizar_material before insert or update of tipo, variante on material for each row execute function fn_normalizar_nombre();

-- La lista de clientes expone el nombre plano para buscar sin tildes
create or replace view v_clientes with (security_invoker = true) as
select c.id, c.tienda_id, c.nombre, c.telefono, c.email, c.datos, c.notas, c.creado_en,
       count(e.id) filter (where e.estado = 'ACTIVO')                                   as encargos,
       count(e.id) filter (where e.estado = 'ACTIVO' and not coalesce(ea.es_final, false)) as en_curso,
       max(e.creado_en) filter (where e.estado = 'ACTIVO')                                as ultimo_encargo,
       c.nombre_plano
  from cliente c
  left join encargo e on e.cliente_id = c.id
  left join etapa ea on ea.id = etapa_actual(e.id)
 group by c.id;
grant select on v_clientes to authenticated;

-- Normalizar lo que ya existe en las tiendas que lo tengan activado
update cliente c set nombre = nombre_normalizado(c.nombre) from tienda t where t.id = c.tienda_id and coalesce((t.ajustes->>'normalizar_nombres')::boolean, false) and c.nombre <> nombre_normalizado(c.nombre);

-- Datos por periodo (plantilla de ficha, guía de medidas…): si faltan, se usan los de la tienda
alter table periodo add column if not exists ajustes jsonb not null default '{}'::jsonb;

select 'ok 0025' as r;
