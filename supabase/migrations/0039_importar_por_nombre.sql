-- 0039 · Importar clientes sin teléfono ni email: se reconocen por el nombre exacto
-- (si hay uno solo con ese nombre y tampoco tiene teléfono ni email). Así reimportar actualiza en vez de duplicar.
-- Dos filas del mismo archivo con el mismo nombre y sin teléfono ni email cuentan como repetidas.
create or replace function imp_fila(p_imp uuid, p_tienda uuid, p_entidad text, f jsonb, p_campos jsonb, p_escribir boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  errs text[] := '{}'; avisos text[] := '{}'; v_id uuid; v_id2 uuid; v_antes jsonb; v_clave text;
  s_nombre text := btrim(coalesce(f->>'nombre', ''));
  s_tel text := nullif(btrim(coalesce(f->>'telefono', '')), '');
  s_email text := nullif(lower(btrim(coalesce(f->>'email', ''))), '');
  s_notas text := nullif(btrim(coalesce(f->>'notas', '')), '');
  dig text; dd jsonb; n_precio numeric; b_activo boolean; n_consumo numeric;
  s_tipo text; s_var text; s_ud text; s_prov text; v_prov uuid; n_stock numeric; n_aviso numeric; n_compra numeric; b_porenc boolean; n_resto numeric;
  v_ubic text; v_mat material%rowtype;
begin
  if s_email is not null and s_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then errs := errs || format('El email «%s» no parece válido', s_email); end if;
  if length(s_nombre) > 200 then errs := errs || 'El nombre es demasiado largo'::text; end if;
  if length(coalesce(s_notas, '')) > 4000 then errs := errs || 'Las notas son demasiado largas'::text; end if;

  if p_entidad = 'CLIENTE' then
    if s_nombre = '' then errs := errs || 'Falta el nombre'::text; end if;
    dig := nullif(regexp_replace(coalesce(s_tel, ''), '\D', '', 'g'), '');
    if s_tel is not null and (dig is null or length(dig) < 6) then errs := errs || format('El teléfono «%s» no parece válido', s_tel); end if;
    if dig is not null and length(dig) >= 6 then select id into v_id from cliente where tienda_id = p_tienda and telefono_digitos = dig order by creado_en limit 1; end if;
    if s_email is not null then select id into v_id2 from cliente where tienda_id = p_tienda and lower(email) = s_email order by creado_en limit 1; end if;
    if v_id is not null and v_id2 is not null and v_id <> v_id2 then
      errs := errs || 'El teléfono y el email son de dos clientes distintos que ya existen'::text;
    end if;
    v_id := coalesce(v_id, v_id2);
    -- Sin teléfono ni email: se reconoce por el nombre exacto si hay un solo cliente así (y sin teléfono ni email)
    if v_id is null and (dig is null or length(dig) < 6) and s_email is null and s_nombre <> '' then
      select min(id::text)::uuid into v_id from cliente
       where tienda_id = p_tienda and texto_plano(nombre) = texto_plano(s_nombre) and telefono_digitos is null and email is null
      having count(*) = 1;
    end if;
    v_clave := coalesce('t:' || dig, 'e:' || s_email, 'n:' || texto_plano(s_nombre));
    dd := imp_datos(p_campos, f->'datos', v_id is null);
    errs := errs || array(select jsonb_array_elements_text(dd->'errores'));
    if cardinality(errs) = 0 and p_escribir then
      if v_id is null then
        insert into cliente (tienda_id, nombre, telefono, email, notas, datos)
        values (p_tienda, s_nombre, s_tel, s_email, s_notas, dd->'datos') returning id into v_id;
        insert into importacion_cambio values (p_imp, 'cliente', v_id, null);
      else
        select to_jsonb(c) into v_antes from cliente c where id = v_id;
        insert into importacion_cambio values (p_imp, 'cliente', v_id, v_antes) on conflict do nothing;
        update cliente set nombre = coalesce(nullif(s_nombre, ''), nombre), telefono = coalesce(s_tel, telefono),
          email = coalesce(s_email, email), notas = coalesce(s_notas, notas), datos = datos || (dd->'datos')
        where id = v_id;
      end if;
    end if;

  elsif p_entidad = 'PRODUCTO' then
    if s_nombre = '' then errs := errs || 'Falta el nombre'::text; end if;
    select id into v_id from producto where tienda_id = p_tienda and texto_plano(nombre) = texto_plano(s_nombre) limit 1;
    v_clave := 'n:' || texto_plano(s_nombre);
    begin n_precio := imp_num(f->>'precio'); if n_precio < 0 then errs := errs || 'El precio no puede ser negativo'::text; end if;
    exception when others then errs := errs || format('El precio tiene que ser un número (está «%s»)', f->>'precio'); end;
    if nullif(btrim(coalesce(f->>'activo', '')), '') is not null then
      begin b_activo := imp_bool(f->>'activo'); exception when others then errs := errs || format('«Activo» tiene que ser Sí o No (está «%s»)', f->>'activo'); end;
    end if;
    begin n_consumo := imp_num(f->>'consumo'); if n_consumo < 0 then errs := errs || 'El consumo no puede ser negativo'::text; end if;
    exception when others then errs := errs || format('El consumo tiene que ser un número (está «%s»)', f->>'consumo'); end;
    if nullif(btrim(coalesce(f->>'elaboracion', '')), '') is not null
       and jsonb_array_length(coalesce((select ajustes->'tipos_construccion' from tienda where id = p_tienda), '[]')) > 0
       and not exists (select 1 from tienda t, jsonb_array_elements_text(t.ajustes->'tipos_construccion') x where t.id = p_tienda and lower(texto_plano(x)) = lower(texto_plano(btrim(f->>'elaboracion')))) then
      errs := errs || format('«%s» no es un tipo de elaboración. Valen: %s', btrim(f->>'elaboracion'),
        (select string_agg(x, ', ') from tienda t, jsonb_array_elements_text(t.ajustes->'tipos_construccion') x where t.id = p_tienda));
    end if;
    dd := imp_datos(p_campos, f->'datos', v_id is null);
    errs := errs || array(select jsonb_array_elements_text(dd->'errores'));
    if cardinality(errs) = 0 and p_escribir then
      if v_id is null then
        insert into producto (tienda_id, nombre, precio_base, activo, datos, material_tipo, consumo, construccion)
        values (p_tienda, s_nombre, n_precio, coalesce(b_activo, true), dd->'datos', nullif(btrim(coalesce(f->>'material', '')), ''), n_consumo,
                nullif(btrim(coalesce(f->>'elaboracion', '')), '')) returning id into v_id;
        insert into importacion_cambio values (p_imp, 'producto', v_id, null);
      else
        select to_jsonb(p) into v_antes from producto p where id = v_id;
        insert into importacion_cambio values (p_imp, 'producto', v_id, v_antes) on conflict do nothing;
        update producto set precio_base = coalesce(n_precio, precio_base), activo = coalesce(b_activo, activo), datos = datos || (dd->'datos'),
          material_tipo = coalesce(nullif(btrim(coalesce(f->>'material', '')), ''), material_tipo), consumo = coalesce(n_consumo, consumo),
          construccion = coalesce(nullif(btrim(coalesce(f->>'elaboracion', '')), ''), construccion)
        where id = v_id;
      end if;
    end if;

  elsif p_entidad = 'PROVEEDOR' then
    if s_nombre = '' then errs := errs || 'Falta el nombre'::text; end if;
    select id into v_id from proveedor where tienda_id = p_tienda and texto_plano(nombre) = texto_plano(s_nombre) limit 1;
    v_clave := 'n:' || texto_plano(s_nombre);
    if cardinality(errs) = 0 and p_escribir then
      if v_id is null then
        insert into proveedor (tienda_id, nombre, telefono, email_contacto, notas) values (p_tienda, s_nombre, s_tel, s_email, s_notas) returning id into v_id;
        insert into importacion_cambio values (p_imp, 'proveedor', v_id, null);
      else
        select to_jsonb(p) into v_antes from proveedor p where id = v_id;
        insert into importacion_cambio values (p_imp, 'proveedor', v_id, v_antes) on conflict do nothing;
        update proveedor set telefono = coalesce(s_tel, telefono), email_contacto = coalesce(s_email, email_contacto), notas = coalesce(s_notas, notas) where id = v_id;
      end if;
    end if;

  elsif p_entidad = 'MATERIAL' then
    s_tipo := btrim(coalesce(f->>'tipo', '')); s_var := btrim(coalesce(f->>'variante', ''));
    s_ud := nullif(btrim(coalesce(f->>'unidad', '')), ''); s_prov := nullif(btrim(coalesce(f->>'proveedor', '')), '');
    v_ubic := nullif(btrim(coalesce(f->>'ubicacion', '')), '');
    if s_tipo = '' then errs := errs || 'Falta el tipo'::text; end if;
    if s_ud is not null and length(s_ud) > 12 then errs := errs || 'La unidad es demasiado larga (m, uds, g…)'::text; end if;
    select * into v_mat from material where tienda_id = p_tienda and lower(btrim(tipo)) = lower(s_tipo) and lower(btrim(variante)) = lower(s_var);
    v_id := v_mat.id;
    if v_id is null and s_ud is null then errs := errs || 'Falta la unidad (m, uds, g…)'::text; end if;
    v_clave := 'm:' || lower(s_tipo) || '/' || lower(s_var);
    if s_prov is not null then
      select id into v_prov from proveedor where tienda_id = p_tienda and texto_plano(nombre) = texto_plano(s_prov) limit 1;
      if v_prov is null then errs := errs || format('No hay ningún proveedor «%s». Créalo antes o déjalo vacío', s_prov); end if;
    end if;
    begin n_stock := imp_num(f->>'stock'); if n_stock < 0 then errs := errs || 'El stock no puede ser negativo'::text; end if;
    exception when others then errs := errs || format('El stock tiene que ser un número (está «%s»)', f->>'stock'); end;
    begin n_aviso := imp_num(f->>'aviso'); if n_aviso < 0 then errs := errs || 'El aviso no puede ser negativo'::text; end if;
    exception when others then errs := errs || format('«Avisar con» tiene que ser un número (está «%s»)', f->>'aviso'); end;
    begin n_compra := imp_num(f->>'compra'); if n_compra <= 0 then errs := errs || '«Se compra de» tiene que ser mayor que 0'::text; end if;
    exception when others then errs := errs || format('«Se compra de» tiene que ser un número (está «%s»)', f->>'compra'); end;
    begin n_resto := imp_num(f->>'resto_hasta'); if n_resto < 0 then errs := errs || '«Restos hasta» no puede ser negativo'::text; end if;
    exception when others then errs := errs || format('«Restos hasta» tiene que ser un número (está «%s»)', f->>'resto_hasta'); end;
    if nullif(btrim(coalesce(f->>'por_encargo', '')), '') is not null then
      begin b_porenc := imp_bool(f->>'por_encargo'); exception when others then errs := errs || format('«Por encargo» tiene que ser Sí o No (está «%s»)', f->>'por_encargo'); end;
    end if;
    if v_id is not null and n_stock is not null and n_stock <> v_mat.stock then
      avisos := avisos || 'Ya existe: su stock no se cambia al importar (corrígelo en Materiales)'::text;
    end if;
    if cardinality(errs) = 0 and p_escribir then
      if v_id is null then
        insert into material (tienda_id, tipo, variante, unidad, proveedor_id, umbral, unidad_pedido, por_encargo, resto_hasta, ubicacion, notas)
        values (p_tienda, s_tipo, s_var, s_ud, v_prov, n_aviso, n_compra, coalesce(b_porenc, false), n_resto, v_ubic, s_notas) returning id into v_id;
        insert into importacion_cambio values (p_imp, 'material', v_id, null);
        if coalesce(n_stock, 0) > 0 then
          perform mover_material(v_id, 'AJUSTE', n_stock, n_stock, null, null, null, 'Stock inicial (importación)');
        end if;
      else
        select to_jsonb(m) into v_antes from material m where id = v_id;
        insert into importacion_cambio values (p_imp, 'material', v_id, v_antes) on conflict do nothing;
        update material set unidad = coalesce(s_ud, unidad), proveedor_id = coalesce(v_prov, proveedor_id), umbral = coalesce(n_aviso, umbral),
          unidad_pedido = coalesce(n_compra, unidad_pedido), por_encargo = coalesce(b_porenc, por_encargo), resto_hasta = coalesce(n_resto, resto_hasta),
          ubicacion = coalesce(v_ubic, ubicacion), notas = coalesce(s_notas, notas)
        where id = v_id;
      end if;
    end if;
  end if;

  return jsonb_build_object('estado', case when cardinality(errs) > 0 then 'error' when v_id is null or (p_escribir and v_antes is null) then 'nuevo' else 'actualiza' end,
    'errores', to_jsonb(errs), 'avisos', to_jsonb(avisos), 'clave', v_clave);
end $$;

select 'ok 0039' as r;
