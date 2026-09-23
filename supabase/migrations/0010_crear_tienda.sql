-- =====================================================================
-- HILO · migración 0010 · alta de tienda desde la app con plantilla de sector
-- crear_tienda(nombre, plantilla) crea la tienda, deja a quien la crea como
-- administración, abre el periodo del año y monta vocabulario, flujos, etapas,
-- condiciones, campos, mensajes y (opcional) catálogo y proveedores de ejemplo.
--
-- Formato de la plantilla (todo opcional):
-- { "vocab":{…}, "vocab_generos":{…}, "roles":{…}, "ajustes":{…},
--   "campos": { "CLIENTE":[campo…], "ENCARGO":[…], "PRODUCTO":[…] },
--   "tipos": [ { "clave","nombre","campos":[…],
--                "etapas":[ { "clave","nombre","rol","color","visible","marca","espera","final",
--                             "puertas":[ { "tipo","ref","mensaje","dura","etiqueta" } ] } ] } ],
--   "mensajes": [ { "nombre","texto","canal","tipo","etapa" } ],
--   "productos": [ { "nombre","precio" } ], "proveedores": [ "nombre" ] }
-- =====================================================================

create or replace function crear_tienda(p_nombre text, p_plantilla jsonb default '{}'::jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  p jsonb := coalesce(p_plantilla, '{}'::jsonb);
  v_tienda uuid; v_tipo uuid; v_etapa uuid; v_ajustes jsonb;
  t record; e record; pu record; m record; c record; x record;
  v_etapas jsonb;
begin
  if auth.uid() is null then raise exception 'Inicia sesión para crear una tienda'; end if;
  if coalesce(trim(p_nombre), '') = '' then raise exception 'La tienda necesita un nombre'; end if;
  if (select count(*) from miembro where user_id = auth.uid() and rol = 'ADMIN') >= 20 then
    raise exception 'Has llegado al máximo de tiendas por cuenta';
  end if;

  v_ajustes := '{"moneda":"EUR","dias_estancado":10,"numeracion_reinicia_por_periodo":true,"enlace_resena":null,"prefijo_telefono":"34"}'::jsonb
    || coalesce(p->'ajustes', '{}'::jsonb)
    || jsonb_strip_nulls(jsonb_build_object('vocab', p->'vocab', 'vocab_generos', p->'vocab_generos', 'roles', p->'roles'));

  insert into tienda (nombre, ajustes) values (trim(p_nombre), v_ajustes) returning id into v_tienda;
  insert into miembro (tienda_id, user_id, email, rol) values (v_tienda, auth.uid(), mi_email(), 'ADMIN');
  insert into periodo (tienda_id, nombre, activo) values (v_tienda, extract(year from now())::text, true);

  -- Campos generales (cliente, encargo para todos los tipos, producto)
  for c in select key, value from jsonb_each(coalesce(p->'campos', '{}'::jsonb)) loop
    insert into plantilla_campos (tienda_id, entidad, tipo_encargo_id, campos)
    values (v_tienda, c.key::entidad_campos, null,
            (select coalesce(jsonb_agg(f || jsonb_build_object('orden', i) order by i), '[]')
               from jsonb_array_elements(c.value) with ordinality as a(f, i)));
  end loop;

  -- Tipos de encargo con sus etapas y condiciones
  for t in select value as j, ord from jsonb_array_elements(coalesce(p->'tipos', '[]'::jsonb)) with ordinality as a(value, ord) loop
    insert into tipo_encargo (tienda_id, clave, nombre)
    values (v_tienda, coalesce(t.j->>'clave', 'TIPO_' || t.ord), t.j->>'nombre') returning id into v_tipo;
    if jsonb_array_length(coalesce(t.j->'campos', '[]'::jsonb)) > 0 then
      insert into plantilla_campos (tienda_id, entidad, tipo_encargo_id, campos)
      values (v_tienda, 'ENCARGO', v_tipo,
              (select jsonb_agg(f || jsonb_build_object('orden', 100 + i) order by i)
                 from jsonb_array_elements(t.j->'campos') with ordinality as a(f, i)));
    end if;
    for e in select value as j, ord from jsonb_array_elements(coalesce(t.j->'etapas', '[]'::jsonb)) with ordinality as a(value, ord) loop
      insert into etapa (tienda_id, tipo_encargo_id, orden, clave, nombre, rol_ejecuta, color,
                         visible_para_proveedor, marca_proveedor, es_espera, es_final)
      values (v_tienda, v_tipo, e.ord * 10, e.j->>'clave', e.j->>'nombre',
              coalesce(e.j->>'rol', 'OPERATIVO')::rol_miembro, e.j->>'color',
              coalesce((e.j->>'visible')::boolean, false), coalesce((e.j->>'marca')::boolean, false),
              coalesce((e.j->>'espera')::boolean, false), coalesce((e.j->>'final')::boolean, false))
      returning id into v_etapa;
      for pu in select value as j from jsonb_array_elements(coalesce(e.j->'puertas', '[]'::jsonb)) loop
        insert into puerta (tienda_id, etapa_destino_id, tipo, referencia, mensaje, dura, etiqueta)
        values (v_tienda, v_etapa, (pu.j->>'tipo')::tipo_puerta, pu.j->>'ref', pu.j->>'mensaje',
                coalesce((pu.j->>'dura')::boolean, true), pu.j->>'etiqueta');
      end loop;
    end loop;
  end loop;

  -- Plantillas de mensaje (ligadas a una etapa por clave de tipo + clave de etapa)
  for m in select value as j, ord from jsonb_array_elements(coalesce(p->'mensajes', '[]'::jsonb)) with ordinality as a(value, ord) loop
    insert into plantilla_mensaje (tienda_id, etapa_id, clave, nombre, texto, canal, orden)
    values (v_tienda,
            (select et.id from etapa et join tipo_encargo te on te.id = et.tipo_encargo_id
              where te.tienda_id = v_tienda and te.clave = m.j->>'tipo' and et.clave = m.j->>'etapa'),
            'mensaje_' || m.ord, m.j->>'nombre', m.j->>'texto',
            coalesce(m.j->>'canal', 'AMBOS')::canal_mensaje, m.ord);
  end loop;

  for x in select value as j from jsonb_array_elements(coalesce(p->'productos', '[]'::jsonb)) loop
    insert into producto (tienda_id, nombre, precio_base) values (v_tienda, x.j->>'nombre', (x.j->>'precio')::numeric);
  end loop;
  for x in select value as j from jsonb_array_elements(coalesce(p->'proveedores', '[]'::jsonb)) loop
    insert into proveedor (tienda_id, nombre) values (v_tienda, x.j #>> '{}');
  end loop;

  return v_tienda;
end $$;
revoke all on function crear_tienda(text, jsonb) from public;
grant execute on function crear_tienda(text, jsonb) to authenticated;
revoke execute on function crear_tienda(text, jsonb) from anon;
