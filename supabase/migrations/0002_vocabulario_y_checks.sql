-- =====================================================================
-- HILO · migración 0002 · vocabulario por tienda y checks configurables
-- Objetivo: que nada visible en la app dependa de un sector concreto.
-- =====================================================================

-- 1) Las puertas tipo CHECK llevan su propia etiqueta visible
--    (la app pinta las casillas de "Comprobaciones" a partir de aquí).
alter table puerta add column if not exists etiqueta text;

-- 2) Vocabulario por tienda en tienda.ajustes.vocab.
--    Valores neutros por defecto; cada tienda los sobreescribe.
update tienda
   set ajustes = jsonb_set(coalesce(ajustes, '{}'::jsonb), '{vocab}',
     coalesce(ajustes->'vocab', '{}'::jsonb) || '{}'::jsonb, true)
 where ajustes->'vocab' is null;

-- Cada tienda fija su vocabulario en Ajustes → Tienda.

-- 3) plantilla_campos: la app muestra en la tabla los campos con "en_tabla": true
--    (clave dentro del JSON de cada campo; se marca en Ajustes → Campos).
