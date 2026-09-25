-- A25 · El historial de impresiones de la hoja se filtra por periodo (temporada).
-- Cada impresión guarda el periodo de los encargos que lleva (el más repetido).
alter table public.impresion_produccion add column if not exists periodo_id uuid references public.periodo(id) on delete set null;
create index if not exists impresion_produccion_periodo on public.impresion_produccion (tienda_id, periodo_id, fecha desc);

-- Las que ya existen: el periodo más repetido entre sus líneas
update public.impresion_produccion i set periodo_id = x.periodo_id
  from (
    select distinct on (l.impresion_id) l.impresion_id, e.periodo_id
      from public.linea_produccion l join public.encargo e on e.id = l.encargo_id
     where l.impresion_id is not null and e.periodo_id is not null
     group by l.impresion_id, e.periodo_id
     order by l.impresion_id, count(*) desc
  ) x
 where x.impresion_id = i.id and i.periodo_id is null;

create or replace function public.registrar_impresion(p_tienda uuid, p_producto uuid, p_lineas uuid[], p_contenido jsonb)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_id uuid; v_mal text; v_periodo uuid;
begin
  if coalesce(rol_en(p_tienda)::text, '') not in ('ADMIN','OPERATIVO') then raise exception 'Sin permiso'; end if;
  if coalesce(array_length(p_lineas, 1), 0) = 0 then raise exception 'No hay nada marcado para imprimir'; end if;
  select string_agg(lpad(v.numero::text, 3, '0') || ': ' || array_to_string(v.motivos, ', '), ' · ') into v_mal
    from v_linea_produccion v where v.id = any(p_lineas) and (v.coherencia <> 'ENVIADO' or v.tienda_id <> p_tienda);
  if v_mal is not null then raise exception 'No se puede imprimir. %', v_mal; end if;
  select e.periodo_id into v_periodo
    from linea_produccion l join encargo e on e.id = l.encargo_id
   where l.id = any(p_lineas) and e.periodo_id is not null
   group by e.periodo_id order by count(*) desc limit 1;
  insert into impresion_produccion (tienda_id, producto_id, n_lineas, contenido, periodo_id)
  values (p_tienda, p_producto, array_length(p_lineas, 1), coalesce(p_contenido, '{}'), v_periodo) returning id into v_id;
  perform set_config('hilo.produccion', '1', true);
  update linea_produccion set impreso_en = now(), impreso_por = auth.uid(), impresion_id = v_id, imprimir = false
   where id = any(p_lineas) and tienda_id = p_tienda;
  perform set_config('hilo.produccion', '0', true);
  return v_id;
end $function$;
