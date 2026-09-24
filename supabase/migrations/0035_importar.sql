-- =====================================================================
-- HILO · migración 0035 · importar con plantilla
-- Clientes, productos, proveedores y materiales desde la plantilla de Hilo.
-- · Solo administración.
-- · El servidor revisa TODO de nuevo (no se fía de la pantalla).
-- · Todo o nada: si una fila tiene un error, no se guarda ninguna.
-- · Probar (p_confirmar = false) devuelve el informe sin guardar nada.
-- · Cada importación queda apuntada y se puede deshacer mientras lo
--   creado no se haya usado.
-- · Una celda vacía nunca borra lo que ya había.
-- =====================================================================

create table if not exists importacion (
  id           uuid primary key default gen_random_uuid(),
  tienda_id    uuid not null references tienda(id) on delete cascade,
  entidad      text not null check (entidad in ('CLIENTE','PRODUCTO','PROVEEDOR','MATERIAL')),
  usuario_id   uuid default auth.uid(),
  creado_en    timestamptz not null default now(),
  nuevos       int not null default 0,
  actualizados int not null default 0,
  deshecha_en  timestamptz
);
create index if not exists importacion_tienda on importacion (tienda_id, creado_en desc);
alter table importacion enable row level security;
drop policy if exists importacion_sel on importacion;
create policy importacion_sel on importacion for select using (es_admin(tienda_id));
revoke all on importacion from anon;
revoke insert, update, delete on importacion from authenticated;
grant select on importacion to authenticated;

create table if not exists importacion_cambio (
  importacion_id uuid not null references importacion(id) on delete cascade,
  tabla          text not null,
  fila_id        uuid not null,
  antes          jsonb,          -- null = la fila la creó la importación
  primary key (importacion_id, tabla, fila_id)
);
alter table importacion_cambio enable row level security;
revoke all on importacion_cambio from authenticated, anon;

-- Número escrito a la española o a la inglesa: «1.234,5», «1234,5», «1234.5»
create or replace function imp_num(p text) returns numeric language plpgsql immutable as $$
declare t text := replace(replace(btrim(coalesce(p, '')), ' ', ''), '€', '');
begin
  if t = '' then return null; end if;
  if t ~ '^-?[0-9.]*,[0-9]+$' and position('.' in t) > 0 then t := replace(t, '.', ''); end if;   -- 1.234,5
  if t ~ '^-?[0-9,]*\.[0-9]+$' and position(',' in t) > 0 then t := replace(t, ',', ''); end if;   -- 1,234.5
  t := replace(t, ',', '.');
  if t !~ '^-?[0-9]+(\.[0-9]+)?$' and t !~ '^-?\.[0-9]+$' then raise exception 'NO_NUMERO'; end if;
  return t::numeric;
end $$;

create or replace function imp_bool(p text) returns boolean language plpgsql immutable as $$
declare t text := lower(btrim(coalesce(p, '')));
begin
  if t in ('sí', 'si', 's', 'x', 'yes', 'y', 'true', '1', 'verdadero') then return true; end if;
  if t in ('no', 'n', 'false', '0', 'falso') then return false; end if;
  raise exception 'NO_BOOL';
end $$;

-- Datos propios (campos de Ajustes → Datos que guardáis): se revisan con la definición de cada campo
create or replace function imp_datos(p_campos jsonb, p_datos jsonb, p_nuevo boolean) returns jsonb
language plpgsql stable as $$
declare c jsonb; v text; errs text[] := '{}'; out jsonb := '{}'; op text; n numeric; d date;
begin
  for c in select * from jsonb_array_elements(coalesce(p_campos, '[]')) loop
    v := btrim(coalesce(p_datos->>(c->>'clave'), ''));
    if v = '' then
      if p_nuevo and coalesce((c->>'obligatorio')::boolean, false) then errs := errs || format('Falta «%s»', c->>'etiqueta'); end if;
      continue;
    end if;
    case c->>'tipo'
      when 'numero' then
        begin n := imp_num(v); out := out || jsonb_build_object(c->>'clave', n);
        exception when others then errs := errs || format('«%s» tiene que ser un número (está «%s»)', c->>'etiqueta', v); end;
      when 'fecha' then
        begin
          if v ~ '^\d{1,2}/\d{1,2}/\d{4}$' then d := to_date(v, 'DD/MM/YYYY'); else d := v::date; end if;
          out := out || jsonb_build_object(c->>'clave', to_char(d, 'YYYY-MM-DD'));
        exception when others then errs := errs || format('«%s» tiene que ser una fecha, como 25/12/2026 (está «%s»)', c->>'etiqueta', v); end;
      when 'opcion' then
        select o into op from jsonb_array_elements_text(coalesce(c->'opciones', '[]')) o where lower(texto_plano(o)) = lower(texto_plano(v)) limit 1;
        if op is null then
          errs := errs || format('«%s» no es una opción de «%s». Valen: %s', v, c->>'etiqueta',
            coalesce((select string_agg(o, ', ') from jsonb_array_elements_text(coalesce(c->'opciones', '[]')) o), '(ninguna)'));
        else out := out || jsonb_build_object(c->>'clave', op); end if;
      else
        if length(v) > 2000 then errs := errs || format('«%s» es demasiado largo', c->>'etiqueta');
        else out := out || jsonb_build_object(c->>'clave', v); end if;
    end case;
  end loop;
  return jsonb_build_object('errores', to_jsonb(errs), 'datos', out);
end $$;

-- Una fila. Devuelve {estado: nuevo|actualiza|error, errores: [...], avisos: [...], clave: '...'}
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
    v_clave := coalesce('t:' || dig, 'e:' || s_email, 'n:' || texto_plano(s_nombre) || ':' || gen_random_uuid());
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
revoke all on function imp_fila(uuid, uuid, text, jsonb, jsonb, boolean) from public, anon, authenticated;

create or replace function importar(p_tienda uuid, p_entidad text, p_filas jsonb, p_confirmar boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_campos jsonb; v_imp uuid; v_rep jsonb := '[]'; v_err int := 0; v_nue int := 0; v_act int := 0;
  r jsonb; i int; v_vistos jsonb := '{}'; v_prev text;
begin
  if not es_admin(p_tienda) then raise exception 'SIN_PERMISO_IMPORTAR'; end if;
  if p_entidad not in ('CLIENTE','PRODUCTO','PROVEEDOR','MATERIAL') then raise exception 'IMPORT_FORMATO'; end if;
  if jsonb_typeof(p_filas) is distinct from 'array' then raise exception 'IMPORT_FORMATO'; end if;
  if jsonb_array_length(p_filas) = 0 then raise exception 'IMPORT_VACIO'; end if;
  if jsonb_array_length(p_filas) > 2000 then raise exception 'IMPORT_DEMASIADAS'; end if;
  if p_entidad = 'MATERIAL' and coalesce((select (ajustes->'modulos'->>'materiales')::boolean from tienda where id = p_tienda), false) = false then
    raise exception 'IMPORT_SIN_MODULO';
  end if;
  if p_entidad in ('CLIENTE','PRODUCTO') then
    select campos into v_campos from plantilla_campos where tienda_id = p_tienda and entidad = p_entidad::entidad_campos and tipo_encargo_id is null;
  end if;

  begin
    insert into importacion (tienda_id, entidad) values (p_tienda, p_entidad) returning id into v_imp;
    for i in 0 .. jsonb_array_length(p_filas) - 1 loop
      begin
        r := imp_fila(v_imp, p_tienda, p_entidad, p_filas->i, v_campos, true);
      exception when others then
        r := jsonb_build_object('estado', 'error', 'errores', jsonb_build_array(
          case when sqlerrm ilike '%duplicate%' or sqlerrm ilike '%unique%' then 'Ya existe otro con ese nombre'
               else 'No se ha podido guardar esta fila (' || sqlerrm || ')' end), 'avisos', '[]'::jsonb, 'clave', null);
      end;
      -- La misma cosa dos veces en el archivo
      if r->>'clave' is not null then
        v_prev := v_vistos->>(r->>'clave');
        if v_prev is not null then
          r := jsonb_set(jsonb_set(r, '{estado}', '"error"'), '{errores}', (r->'errores') || to_jsonb(format('Repetida: es la misma que la fila %s', v_prev)));
        else
          v_vistos := v_vistos || jsonb_build_object(r->>'clave', (p_filas->i->>'_fila'));
        end if;
      end if;
      if r->>'estado' = 'error' then v_err := v_err + 1;
      elsif r->>'estado' = 'nuevo' then v_nue := v_nue + 1;
      else v_act := v_act + 1; end if;
      v_rep := v_rep || jsonb_build_array(jsonb_build_object('fila', p_filas->i->'_fila', 'estado', r->'estado', 'errores', r->'errores', 'avisos', r->'avisos'));
    end loop;
    if v_err > 0 or not p_confirmar then raise exception using errcode = 'P0H01', message = 'HILO_SOLO_PRUEBA'; end if;
    update importacion set nuevos = v_nue, actualizados = v_act where id = v_imp;
  exception when sqlstate 'P0H01' then
    v_imp := null;   -- todo lo escrito en la prueba se deshace aquí
  end;
  return jsonb_build_object('filas', v_rep, 'errores', v_err, 'nuevos', v_nue, 'actualizados', v_act, 'importacion', v_imp);
end $$;
revoke all on function importar(uuid, text, jsonb, boolean) from public, anon;
grant execute on function importar(uuid, text, jsonb, boolean) to authenticated;

-- Deshacer: borra lo creado (si nada lo usa) y devuelve lo cambiado a como estaba
create or replace function deshacer_importacion(p_imp uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v importacion%rowtype; c importacion_cambio%rowtype;
begin
  select * into v from importacion where id = p_imp for update;
  if v.id is null or not es_admin(v.tienda_id) then raise exception 'SIN_PERMISO_IMPORTAR'; end if;
  if v.deshecha_en is not null then raise exception 'IMPORT_YA_DESHECHA'; end if;
  for c in select * from importacion_cambio where importacion_id = p_imp loop
    begin
      if c.antes is null then
        if c.tabla = 'material' then
          if exists (select 1 from movimiento_material where material_id = c.fila_id and notas is distinct from 'Stock inicial (importación)')
             or exists (select 1 from encargo_material where material_id = c.fila_id)
             or exists (select 1 from resto_material where material_id = c.fila_id) then raise exception 'IMPORT_EN_USO'; end if;
          delete from movimiento_material where material_id = c.fila_id;
          delete from material where id = c.fila_id;
        elsif c.tabla = 'cliente' then delete from cliente where id = c.fila_id;
        elsif c.tabla = 'producto' then delete from producto where id = c.fila_id;
        elsif c.tabla = 'proveedor' then
          if exists (select 1 from material where proveedor_id = c.fila_id) or exists (select 1 from pedido_material where proveedor_id = c.fila_id)
             or exists (select 1 from proveedor_usuario where proveedor_id = c.fila_id) or exists (select 1 from producto_proveedor where proveedor_id = c.fila_id)
          then raise exception 'IMPORT_EN_USO'; end if;
          delete from proveedor where id = c.fila_id;
        end if;
      else
        if c.tabla = 'cliente' then
          update cliente x set nombre = a.nombre, telefono = a.telefono, email = a.email, notas = a.notas, datos = a.datos
            from jsonb_populate_record(null::cliente, c.antes) a where x.id = c.fila_id;
        elsif c.tabla = 'producto' then
          update producto x set precio_base = a.precio_base, activo = a.activo, datos = a.datos, material_tipo = a.material_tipo, consumo = a.consumo, construccion = a.construccion
            from jsonb_populate_record(null::producto, c.antes) a where x.id = c.fila_id;
        elsif c.tabla = 'proveedor' then
          update proveedor x set telefono = a.telefono, email_contacto = a.email_contacto, notas = a.notas
            from jsonb_populate_record(null::proveedor, c.antes) a where x.id = c.fila_id;
        elsif c.tabla = 'material' then
          update material x set unidad = a.unidad, proveedor_id = a.proveedor_id, umbral = a.umbral, unidad_pedido = a.unidad_pedido,
            por_encargo = a.por_encargo, resto_hasta = a.resto_hasta, ubicacion = a.ubicacion, notas = a.notas
            from jsonb_populate_record(null::material, c.antes) a where x.id = c.fila_id;
        end if;
      end if;
    exception when foreign_key_violation then raise exception 'IMPORT_EN_USO';
    end;
  end loop;
  update importacion set deshecha_en = now() where id = p_imp;
end $$;
revoke all on function deshacer_importacion(uuid) from public, anon;
grant execute on function deshacer_importacion(uuid) to authenticated;

select 'ok 0035';
