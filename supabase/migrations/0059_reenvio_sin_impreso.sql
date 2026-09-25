-- 0059 · A9: si un encargo vuelve a producción (tras volver atrás), su línea queda «sin imprimir»
-- y marcada para imprimir. La impresión anterior sigue en el historial (impresion_produccion).

create or replace function fn_hito_produccion() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_prod boolean; v_enc encargo%rowtype; v_activo boolean;
begin
  if new.tipo <> 'NORMAL' then return new; end if;
  select es_produccion into v_prod from etapa where id = new.etapa_id;
  if not coalesce(v_prod, false) then return new; end if;
  select * into v_enc from encargo where id = new.encargo_id;
  select coalesce((ajustes->'modulos'->>'produccion')::boolean, false) into v_activo from tienda where id = v_enc.tienda_id;
  if not v_activo then return new; end if;
  perform set_config('hilo.produccion', '1', true);
  insert into linea_produccion (tienda_id, encargo_id, producto_id, enviado_en, enviado_por)
  values (v_enc.tienda_id, v_enc.id, v_enc.producto_id, new.fecha, new.usuario_id)
  on conflict (encargo_id) do update
    set producto_id = excluded.producto_id, enviado_en = excluded.enviado_en, enviado_por = excluded.enviado_por,
        imprimir = true, impreso_en = null, impreso_por = null, impresion_id = null, aviso_anulado_visto = false;
  perform set_config('hilo.produccion', '0', true);
  return new;
end $$;

select 'ok 0059';
