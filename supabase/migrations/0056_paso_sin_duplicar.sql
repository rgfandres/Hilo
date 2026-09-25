-- 0056 · A4: crear_hito bloquea el encargo (for update): dos personas marcando el mismo paso a la vez
-- ya no crean dos pasos iguales; la segunda recibe PASO_ATRAS.

create or replace function crear_hito(
  p_encargo uuid, p_etapa_clave text,
  p_tipo tipo_hito default 'NORMAL', p_nota text default null,
  p_origen origen_hito default 'APP', p_forzar_blandas boolean default false
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_enc encargo%rowtype; v_etapa etapa%rowtype; v_rol rol_miembro; v_id uuid; v_bloq text; v_act int; v_salta text; v_sig int;
begin
  -- Bloqueo del encargo: dos personas marcando a la vez esperan una a otra (no se duplica el paso)
  select * into v_enc from encargo where id = p_encargo for update;
  if v_enc.id is null then raise exception 'Encargo no encontrado'; end if;
  if v_enc.estado <> 'ACTIVO' then raise exception 'El encargo está anulado'; end if;

  select * into v_etapa from etapa where tipo_encargo_id = v_enc.tipo_encargo_id and clave = p_etapa_clave;
  if v_etapa.id is null then raise exception 'Etapa % no existe para este tipo de encargo', p_etapa_clave; end if;
  select x.orden into v_act from etapa x where x.id = etapa_actual(p_encargo);
  select min(x.orden) into v_sig from etapa x where x.tipo_encargo_id = v_enc.tipo_encargo_id and x.orden > coalesce(v_act, -2147483648);

  v_rol := rol_en(v_enc.tienda_id);
  if v_rol is null then
    -- Portal: solo su encargo, solo la etapa siguiente y solo si la marca el proveedor
    if not (v_etapa.marca_proveedor and p_tipo = 'NORMAL'
            and coalesce(v_enc.proveedor_id = any(array(select mis_proveedores(v_enc.tienda_id))), false)
            and v_etapa.orden = v_sig) then
      raise exception 'Sin permiso';
    end if;
    p_origen := 'PORTAL';
    p_forzar_blandas := true;   -- los avisos no bloquean al proveedor
  elsif p_tipo = 'REENTRADA' then
    if v_rol not in ('ADMIN','OPERATIVO') then raise exception 'Sin permiso'; end if;
    if v_act is null or v_etapa.orden >= v_act then raise exception 'VOLVER_ADELANTE'; end if;
  elsif p_tipo = 'NORMAL' then
    if v_rol not in ('ADMIN','OPERATIVO') and v_rol <> v_etapa.rol_ejecuta then
      raise exception 'ROL_NO_MARCA:%:%', v_rol, v_etapa.nombre;
    end if;
    if v_act is not null and v_etapa.orden <= v_act then raise exception 'PASO_ATRAS'; end if;
    if en_revision(p_encargo) then raise exception 'INCIDENCIA_ABIERTA'; end if;
    -- Saltar etapas intermedias solo lo hace Administración
    if v_rol <> 'ADMIN' then
      select string_agg(x.nombre, ', ' order by x.orden) into v_salta from etapa x
       where x.tipo_encargo_id = v_enc.tipo_encargo_id and x.orden > coalesce(v_act, -2147483648) and x.orden < v_etapa.orden;
      if v_salta is not null then raise exception 'SALTO_ETAPAS:%', v_salta; end if;
    end if;
    -- Ni siquiera Administración se salta la producción (crearía la orden de corte a medias) ni
    -- las condiciones de las etapas intermedias (tela recibida, taller, comprobaciones)
    select string_agg(x.nombre, ', ' order by x.orden) into v_salta from etapa x
     where x.tipo_encargo_id = v_enc.tipo_encargo_id and x.orden > coalesce(v_act, -2147483648) and x.orden < v_etapa.orden
       and x.es_produccion;
    if v_salta is not null then raise exception 'SALTO_PRODUCCION:%', v_salta; end if;
    select string_agg(d.mensaje || ' («' || x.nombre || '»)', ' · ' order by x.orden) into v_salta
      from etapa x cross join lateral puertas_pendientes_det(p_encargo, x.id) d
     where x.tipo_encargo_id = v_enc.tipo_encargo_id and x.orden > coalesce(v_act, -2147483648) and x.orden < v_etapa.orden
       and d.dura and d.tipo <> 'HITO_PREVIO';
    if v_salta is not null then raise exception 'Bloqueado: %', v_salta; end if;
  end if;
  -- INCIDENCIA: cualquier rol de la tienda, sobre la etapa en la que está

  if p_tipo = 'NORMAL' then
    select string_agg(mensaje, ' · ') into v_bloq
      from puertas_pendientes(p_encargo, v_etapa.id) where dura or not p_forzar_blandas;
    if v_bloq is not null then raise exception 'Bloqueado: %', v_bloq; end if;
  end if;

  insert into hito (encargo_id, etapa_id, tipo, usuario_id, origen, nota)
  values (p_encargo, v_etapa.id, p_tipo, auth.uid(), p_origen, p_nota)
  returning id into v_id;
  -- Volver atrás: los pasos de después quedan deshechos (hay que marcarlos otra vez). Se apunta
  -- qué los deshizo para poder restaurarlos si se deshace la vuelta.
  if p_tipo = 'REENTRADA' then
    update hito h set deshecho_en = now(), deshecho_por = v_id
      from etapa x
     where x.id = h.etapa_id and h.encargo_id = p_encargo and h.id <> v_id and h.deshecho_en is null
       and h.tipo in ('NORMAL','REENTRADA') and x.orden > v_etapa.orden;
  end if;
  return v_id;
end $$;

select 'ok 0056';
