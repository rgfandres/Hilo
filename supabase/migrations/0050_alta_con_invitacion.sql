-- 0050 · Alta solo con invitación
-- Crear una tienda nueva pide un código de invitación (salvo a quien ya administra una) y hay un tope
-- total de tiendas en la plataforma. Unirse a una tienda con la invitación del equipo no cambia.
-- Los códigos se crean desde el editor SQL:  insert into alta_codigo (codigo, usos_max, nota) values ('HILO-XXXX', 1, 'Para …');

create table if not exists alta_codigo (
  codigo text primary key check (codigo = upper(codigo)),
  usos_max int not null default 1 check (usos_max > 0),
  usos int not null default 0,
  activo boolean not null default true,
  caduca timestamptz,
  nota text,
  creado_en timestamptz not null default now(),
  ultimo_uso timestamptz
);
alter table alta_codigo enable row level security;  -- sin políticas: solo lo toca crear_tienda
revoke all on alta_codigo from anon, authenticated;

create table if not exists plataforma_ajuste (clave text primary key, valor text not null);
alter table plataforma_ajuste enable row level security;
revoke all on plataforma_ajuste from anon, authenticated;
insert into plataforma_ajuste (clave, valor) values ('max_tiendas', '50') on conflict do nothing;

-- ¿Puede esta cuenta crear una tienda sin código? (para enseñar o no el campo del código)
create or replace function puedo_crear_tienda() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from miembro where user_id = auth.uid() and rol = 'ADMIN' and activo)
$$;
revoke all on function puedo_crear_tienda() from public, anon;
grant execute on function puedo_crear_tienda() to authenticated;

-- Latido: consulta mínima para que el proyecto no se pause por inactividad (la llama un aviso programado)
create or replace function latido() returns timestamptz language sql stable security definer set search_path = public as $$
  select now() where exists (select 1 from tienda limit 1) or true
$$;
revoke all on function latido() from public;
grant execute on function latido() to anon, authenticated;

drop function if exists crear_tienda(text, jsonb);
create or replace function crear_tienda(p_nombre text, p_plantilla jsonb default '{}'::jsonb, p_codigo text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  p jsonb := coalesce(p_plantilla, '{}'::jsonb);
  v_tienda uuid; v_tipo uuid; v_etapa uuid; v_ajustes jsonb;
  t record; e record; pu record; m record; c record; x record;
  v_cod alta_codigo; v_etapas jsonb; v_aparte jsonb := '[]'::jsonb; v_band_tipo jsonb := '{}'::jsonb; v_prov uuid;
begin
  if auth.uid() is null then raise exception 'Inicia sesión para crear una tienda'; end if;
  if coalesce(trim(p_nombre), '') = '' then raise exception 'La tienda necesita un nombre'; end if;
  if (select count(*) from miembro where user_id = auth.uid() and rol = 'ADMIN') >= 20 then
    raise exception 'Has llegado al máximo de tiendas por cuenta';
  end if;
  -- Alta solo con invitación: quien ya administra una tienda puede crear otra; si no, hace falta un código válido
  if not exists (select 1 from miembro where user_id = auth.uid() and rol = 'ADMIN' and activo) then
    select * into v_cod from alta_codigo
     where codigo = upper(trim(coalesce(p_codigo, ''))) and activo and (caduca is null or caduca > now()) and usos < usos_max
     for update;
    if v_cod.codigo is null then raise exception 'Hilo está en acceso anticipado: necesitas un código de invitación válido para crear tu tienda'; end if;
    update alta_codigo set usos = usos + 1, ultimo_uso = now() where codigo = v_cod.codigo;
  end if;
  if (select count(*) from tienda) >= coalesce((select valor::int from plataforma_ajuste where clave = 'max_tiendas'), 50) then
    raise exception 'Ahora mismo no se admiten tiendas nuevas. Escríbenos y te avisamos.';
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
    insert into tipo_encargo (tienda_id, clave, nombre, serie)
    values (v_tienda, coalesce(t.j->>'clave', 'TIPO_' || t.ord), t.j->>'nombre', coalesce(t.j->>'serie', '')) returning id into v_tipo;
    -- Tipo con menú propio y sus bandejas (los ajustes van por id del tipo, que aquí ya se sabe)
    if coalesce((t.j->>'aparte')::boolean, false) then v_aparte := v_aparte || to_jsonb(v_tipo::text); end if;
    if jsonb_typeof(t.j->'bandejas') = 'array' then v_band_tipo := v_band_tipo || jsonb_build_object(v_tipo::text, t.j->'bandejas'); end if;
    if jsonb_array_length(coalesce(t.j->'campos', '[]'::jsonb)) > 0 then
      insert into plantilla_campos (tienda_id, entidad, tipo_encargo_id, campos)
      values (v_tienda, 'ENCARGO', v_tipo,
              (select jsonb_agg(f || jsonb_build_object('orden', 100 + i) order by i)
                 from jsonb_array_elements(t.j->'campos') with ordinality as a(f, i)));
    end if;
    for e in select value as j, ord from jsonb_array_elements(coalesce(t.j->'etapas', '[]'::jsonb)) with ordinality as a(value, ord) loop
      insert into etapa (tienda_id, tipo_encargo_id, orden, clave, nombre, rol_ejecuta, color,
                         visible_para_proveedor, marca_proveedor, es_espera, es_final, grupo, es_produccion)
      values (v_tienda, v_tipo, e.ord * 10, e.j->>'clave', e.j->>'nombre',
              coalesce(e.j->>'rol', 'OPERATIVO')::rol_miembro, e.j->>'color',
              coalesce((e.j->>'visible')::boolean, false), coalesce((e.j->>'marca')::boolean, false),
              coalesce((e.j->>'espera')::boolean, false), coalesce((e.j->>'final')::boolean, false),
              e.j->>'grupo', coalesce((e.j->>'produccion')::boolean, false))
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
    insert into plantilla_mensaje (tienda_id, etapa_id, clave, nombre, texto, canal, orden, asunto, al_incidencia)
    values (v_tienda,
            (select et.id from etapa et join tipo_encargo te on te.id = et.tipo_encargo_id
              where te.tienda_id = v_tienda and te.clave = m.j->>'tipo' and et.clave = m.j->>'etapa'),
            'mensaje_' || m.ord, m.j->>'nombre', m.j->>'texto',
            coalesce(m.j->>'canal', 'AMBOS')::canal_mensaje, m.ord, m.j->>'asunto', coalesce((m.j->>'al_incidencia')::boolean, false));
  end loop;

  for x in select value as j from jsonb_array_elements(coalesce(p->'productos', '[]'::jsonb)) loop
    insert into producto (tienda_id, nombre, precio_base, material_tipo, consumo)
    values (v_tienda, x.j->>'nombre', (x.j->>'precio')::numeric, x.j->>'material_tipo', (x.j->>'consumo')::numeric);
  end loop;
  for x in select value as j from jsonb_array_elements(coalesce(p->'proveedores', '[]'::jsonb)) loop
    if jsonb_typeof(x.j) = 'object' then
      insert into proveedor (tienda_id, nombre, tipo, unidad_pedido)
      values (v_tienda, x.j->>'nombre', coalesce(x.j->>'tipo', 'ENCARGOS'), (x.j->>'unidad_pedido')::numeric);
    else
      insert into proveedor (tienda_id, nombre) values (v_tienda, x.j #>> '{}');
    end if;
  end loop;
  -- Materiales de ejemplo (nacen con stock 0; el proveedor se busca por nombre)
  for x in select value as j from jsonb_array_elements(coalesce(p->'materiales', '[]'::jsonb)) loop
    select id into v_prov from proveedor where tienda_id = v_tienda and (nombre = x.j->>'proveedor' or nombre = nombre_normalizado(x.j->>'proveedor')) limit 1;
    insert into material (tienda_id, tipo, variante, proveedor_id, umbral, unidad_pedido, unidad, por_encargo, resto_hasta)
    values (v_tienda, x.j->>'tipo', coalesce(x.j->>'variante', ''), v_prov, (x.j->>'umbral')::numeric, (x.j->>'unidad_pedido')::numeric,
            coalesce(x.j->>'unidad', 'uds'), coalesce((x.j->>'por_encargo')::boolean, false), (x.j->>'resto_hasta')::numeric);
    v_prov := null;
  end loop;

  if jsonb_array_length(v_aparte) > 0 or v_band_tipo <> '{}'::jsonb then
    update tienda set ajustes = ajustes || jsonb_build_object('tipos_aparte', v_aparte, 'lista_bandejas_tipo', v_band_tipo) where id = v_tienda;
  end if;

  return v_tienda;
end $$;
revoke all on function crear_tienda(text, jsonb, text) from public;
grant execute on function crear_tienda(text, jsonb, text) to authenticated;
revoke execute on function crear_tienda(text, jsonb, text) from anon;

select 'ok 0050';
