-- =====================================================================
-- Semilla: SASTRERÍA DEMO (ficticia) · segunda tienda de prueba
-- Sastrería masculina a medida con fabricación externa. Flujo inspirado
-- en el modelo habitual del sector (cita y medidas en tienda → tejido →
-- ficha a fábrica → ~1 mes → prueba → ajustes → entrega).
-- Sirve para comprobar que el esqueleto funciona SIN tocar código:
-- si algo de esta tienda obliga a cambiar la app, es una fuga.
-- =====================================================================
do $$
declare
  v_tienda uuid; v_medida uuid; v_arreglo uuid;
  e_cita uuid; e_tejido uuid; e_fabrica uuid; e_recibido uuid; e_prueba uuid; e_entregado uuid;
  a_recibido uuid;
begin
  insert into tienda (nombre, ajustes) values ('Sastrería Demo', '{
    "moneda": "EUR", "dias_estancado": 21, "numeracion_reinicia_por_periodo": false,
    "enlace_resena": null, "color_primario": "#1F3A5F",
    "vocab": {"cliente":"Cliente","clientes":"Clientes","producto":"Prenda","productos":"Prendas",
              "proveedor":"Fábrica","proveedores":"Fábricas","encargo":"Pedido","encargos":"Pedidos"}
  }') returning id into v_tienda;

  -- Año natural, sin reinicio de numeración
  insert into periodo (tienda_id, nombre, activo) values (v_tienda, '2026', true);

  insert into tipo_encargo (tienda_id, clave, nombre) values (v_tienda, 'A_MEDIDA', 'A medida') returning id into v_medida;
  insert into tipo_encargo (tienda_id, clave, nombre) values (v_tienda, 'ARREGLO',  'Arreglo en tienda') returning id into v_arreglo;

  -- ---------- A medida: la fábrica está fuera, las pruebas en tienda
  insert into etapa (tienda_id, tipo_encargo_id, orden, clave, nombre, rol_ejecuta, visible_para_proveedor, es_espera, color) values
    (v_tienda, v_medida, 10, 'MEDIDAS',   'Medidas tomadas',     'ATENCION',  false, false, '#999999') returning id into e_cita;
  insert into etapa (tienda_id, tipo_encargo_id, orden, clave, nombre, rol_ejecuta, visible_para_proveedor, es_espera, color) values
    (v_tienda, v_medida, 20, 'TEJIDO',    'Tejido elegido',      'ATENCION',  false, false, '#C98A00') returning id into e_tejido;
  insert into etapa (tienda_id, tipo_encargo_id, orden, clave, nombre, rol_ejecuta, visible_para_proveedor, es_espera, color) values
    (v_tienda, v_medida, 30, 'EN_FABRICA','Enviado a fábrica',   'OPERATIVO', true,  true,  '#5A3E96') returning id into e_fabrica;
  insert into etapa (tienda_id, tipo_encargo_id, orden, clave, nombre, rol_ejecuta, visible_para_proveedor, es_espera, color) values
    (v_tienda, v_medida, 40, 'RECIBIDO',  'Recibido en tienda',  'OPERATIVO', true,  false, '#2B4C9B') returning id into e_recibido;
  insert into etapa (tienda_id, tipo_encargo_id, orden, clave, nombre, rol_ejecuta, visible_para_proveedor, es_espera, color) values
    (v_tienda, v_medida, 50, 'PRUEBA',    'Prueba hecha',        'ATENCION',  false, false, '#2B4C9B') returning id into e_prueba;
  insert into etapa (tienda_id, tipo_encargo_id, orden, clave, nombre, rol_ejecuta, visible_para_proveedor, es_final, color) values
    (v_tienda, v_medida, 60, 'ENTREGADO', 'Entregado',           'ATENCION',  false, true,  '#1E6B3C') returning id into e_entregado;

  -- ---------- Arreglo en tienda (sin proveedor externo)
  insert into etapa (tienda_id, tipo_encargo_id, orden, clave, nombre, rol_ejecuta, color) values
    (v_tienda, v_arreglo, 10, 'RECIBIDO', 'Prenda recibida', 'ATENCION', '#999999') returning id into a_recibido;
  insert into etapa (tienda_id, tipo_encargo_id, orden, clave, nombre, rol_ejecuta, color) values
    (v_tienda, v_arreglo, 20, 'ARREGLADO','Arreglado',       'OPERATIVO', '#2B4C9B');
  insert into etapa (tienda_id, tipo_encargo_id, orden, clave, nombre, rol_ejecuta, es_final, color) values
    (v_tienda, v_arreglo, 30, 'ENTREGADO','Entregado',       'ATENCION',  true, '#1E6B3C');

  -- ---------- Puertas: ejemplo de condiciones para avanzar
  insert into puerta (tienda_id, etapa_destino_id, tipo, referencia, mensaje, dura, etiqueta) values
    (v_tienda, e_fabrica, 'CAMPO_NO_VACIO', 'producto_id',   'Falta la prenda', true, null),
    (v_tienda, e_fabrica, 'CAMPO_NO_VACIO', 'tejido',        'Falta el tejido', true, null),
    (v_tienda, e_fabrica, 'CHECK',          'senal_cobrada', 'No se envía a fábrica sin cobrar la señal', true, 'Señal cobrada'),
    (v_tienda, e_fabrica, 'CHECK',          'ficha_revisada','Conviene revisar la ficha de medidas antes de enviarla', false, 'Ficha de medidas revisada'),
    (v_tienda, e_entregado,'CHECK',         'pago_final',    'Falta cobrar el resto', true, 'Pago final cobrado');

  -- ---------- Campos (medidas de caballero, detalles de confección)
  insert into plantilla_campos (tienda_id, entidad, tipo_encargo_id, campos) values
  (v_tienda, 'CLIENTE', null, '[
    {"clave":"cuello","etiqueta":"Cuello","tipo":"numero","orden":1},
    {"clave":"pecho","etiqueta":"Pecho","tipo":"numero","orden":2},
    {"clave":"cintura","etiqueta":"Cintura","tipo":"numero","orden":3},
    {"clave":"cadera","etiqueta":"Cadera","tipo":"numero","orden":4},
    {"clave":"hombros","etiqueta":"Hombros","tipo":"numero","orden":5},
    {"clave":"manga","etiqueta":"Largo manga","tipo":"numero","orden":6},
    {"clave":"largo_chaqueta","etiqueta":"Largo chaqueta","tipo":"numero","orden":7},
    {"clave":"entrepierna","etiqueta":"Entrepierna","tipo":"numero","orden":8},
    {"clave":"postura","etiqueta":"Postura","tipo":"opcion","opciones":["Normal","Hombros caídos","Espalda curva","Barriga"],"orden":9}
  ]'),
  (v_tienda, 'ENCARGO', v_medida, '[
    {"clave":"tejido","etiqueta":"Tejido","en_tabla":true,"tipo":"texto","orden":1},
    {"clave":"forro","etiqueta":"Forro","tipo":"texto","orden":2},
    {"clave":"solapa","etiqueta":"Solapa","tipo":"opcion","opciones":["Muesca","Pico","Chal"],"orden":3},
    {"clave":"botones","etiqueta":"Botones","tipo":"opcion","opciones":["1","2","Cruzado 6x2"],"orden":4},
    {"clave":"iniciales","etiqueta":"Iniciales bordadas","tipo":"texto","orden":5},
    {"clave":"evento","etiqueta":"Evento","tipo":"texto","orden":6},
    {"clave":"fecha_evento","etiqueta":"Fecha del evento","en_tabla":true,"tipo":"fecha","orden":7}
  ]'),
  (v_tienda, 'ENCARGO', v_arreglo, '[
    {"clave":"arreglo","etiqueta":"Qué hay que hacer","en_tabla":true,"tipo":"texto","orden":1}
  ]'),
  (v_tienda, 'PRODUCTO', null, '[
    {"clave":"categoria","etiqueta":"Categoría","tipo":"opcion","opciones":["Traje","Esmoquin","Chaqué","Americana","Pantalón"],"orden":1}
  ]');

  insert into producto (tienda_id, nombre, precio_base, datos) values
    (v_tienda, 'Traje dos piezas', 390, '{"categoria":"Traje"}'),
    (v_tienda, 'Traje tres piezas', 470, '{"categoria":"Traje"}'),
    (v_tienda, 'Esmoquin', 520, '{"categoria":"Esmoquin"}'),
    (v_tienda, 'Chaqué', 690, '{"categoria":"Chaqué"}');

  insert into proveedor (tienda_id, nombre, tipo) values (v_tienda, 'Fábrica principal', 'FABRICA');

  -- ---------- Mensajes
  insert into plantilla_mensaje (tienda_id, etapa_id, clave, nombre, texto, orden) values
    (v_tienda, e_fabrica,  'en_fabrica', 'Avisar pedido en fábrica',
     'Hola {nombre}, tu {producto} ya está en fabricación. Te avisamos en cuanto llegue para la prueba.', 1),
    (v_tienda, e_recibido, 'prueba',     'Citar para prueba',
     'Hola {nombre}, tu {producto} ha llegado. ¿Cuándo te viene bien pasar a probártelo?', 2),
    (v_tienda, e_entregado,'gracias',    'Agradecer',
     'Gracias {nombre}. Que lo disfrutes. Si te apetece, déjanos una reseña: {enlace_resena}', 3);

  insert into plantilla_ficha (tienda_id, html) values (v_tienda, $f$
<article class="ficha">
  <h1>Pedido {{numero}} · {{cliente_nombre}}</h1>
  <p>{{producto_nombre}} · Tejido {{datos.tejido}} · Forro {{datos.forro}} · Solapa {{datos.solapa}} · Botones {{datos.botones}}</p>
  <table>{{#each cliente_datos}}<tr><td>{{@key}}</td><td>{{this}}</td></tr>{{/each}}</table>
</article>
$f$);

  raise notice 'Tienda Sastrería Demo creada: %', v_tienda;
end $$;

-- Qué ve el proveedor (campo a campo; ver migración 0003)
update plantilla_campos pc
   set campos = (select coalesce(jsonb_agg(c || '{"visible_proveedor": true}'::jsonb order by (c->>'orden')::int), '[]')
                   from jsonb_array_elements(pc.campos) c)
 where pc.entidad = 'CLIENTE' and pc.tienda_id = (select id from tienda where nombre = 'Sastrería Demo');
update plantilla_campos pc
   set campos = (select coalesce(jsonb_agg(
                     case when c->>'clave' in ('evento','fecha_evento','feria')
                          then c else c || '{"visible_proveedor": true}'::jsonb end
                     order by (c->>'orden')::int), '[]')
                   from jsonb_array_elements(pc.campos) c)
 where pc.entidad = 'ENCARGO' and pc.tienda_id = (select id from tienda where nombre = 'Sastrería Demo');
