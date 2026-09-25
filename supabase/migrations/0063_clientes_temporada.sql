-- B9 · Clientes: filtro «Solo la temporada activa» (periodos en los que tiene encargos).
-- B18 · Lista de clientes: su último encargo (Nº y producto).
create or replace view v_clientes with (security_invoker = true) as
select c.id, c.tienda_id, c.nombre, c.telefono, c.email, c.datos, c.notas, c.creado_en,
       count(e.id) filter (where e.estado = 'ACTIVO')                                   as encargos,
       count(e.id) filter (where e.estado = 'ACTIVO' and not coalesce(ea.es_final, false)) as en_curso,
       max(e.creado_en) filter (where e.estado = 'ACTIVO')                                as ultimo_encargo,
       c.nombre_plano, c.telefono_digitos,
       coalesce(array_agg(distinct e.periodo_id) filter (where e.estado = 'ACTIVO' and e.periodo_id is not null), '{}') as periodos,
       (select coalesce(x.serie, '') || lpad(x.numero::text, 3, '0') || coalesce(' · ' || p.nombre, '')
          from encargo x left join producto p on p.id = x.producto_id
         where x.cliente_id = c.id and x.estado = 'ACTIVO' order by x.creado_en desc limit 1) as ultimo_resumen
  from cliente c
  left join encargo e on e.cliente_id = c.id
  left join etapa ea on ea.id = etapa_actual(e.id)
 group by c.id;
grant select on v_clientes to authenticated;
select 'ok 0063';
