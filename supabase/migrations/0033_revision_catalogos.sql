-- =====================================================================
-- HILO · migración 0033 · barrido 2, tanda 4: alta, catálogos e informes
--  C-01 Teléfono solo con dígitos (buscar «612 345 678» encuentra «612345678»)
-- =====================================================================
alter table cliente add column if not exists telefono_digitos text
  generated always as (nullif(regexp_replace(coalesce(telefono, ''), '\D', '', 'g'), '')) stored;
create index if not exists cliente_tel_digitos on cliente (tienda_id, telefono_digitos);

create or replace view v_clientes with (security_invoker = true) as
select c.id, c.tienda_id, c.nombre, c.telefono, c.email, c.datos, c.notas, c.creado_en,
       count(e.id) filter (where e.estado = 'ACTIVO')                                   as encargos,
       count(e.id) filter (where e.estado = 'ACTIVO' and not coalesce(ea.es_final, false)) as en_curso,
       max(e.creado_en) filter (where e.estado = 'ACTIVO')                                as ultimo_encargo,
       c.nombre_plano, c.telefono_digitos
  from cliente c
  left join encargo e on e.cliente_id = c.id
  left join etapa ea on ea.id = etapa_actual(e.id)
 group by c.id;
grant select on v_clientes to authenticated;

select 'ok 0033' as r;
