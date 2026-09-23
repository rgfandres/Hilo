-- =====================================================================
-- HILO · migración 0006 · módulo de mensajes al cliente
--  - Guardar qué se envió exactamente, a dónde y con qué plantilla.
--  - Borrar una plantilla no borra el historial (plantilla_id pasa a null).
--  - Los mensajes nunca se envían solos: la app abre WhatsApp o el correo
--    con el texto preparado y registra que se ha abierto.
-- =====================================================================

alter table mensaje_enviado add column if not exists texto   text;
alter table mensaje_enviado add column if not exists destino text;   -- teléfono o correo usado
alter table mensaje_enviado add column if not exists nombre  text;   -- nombre de la plantilla en ese momento

alter table mensaje_enviado drop constraint if exists mensaje_enviado_plantilla_id_fkey;
alter table mensaje_enviado add constraint mensaje_enviado_plantilla_id_fkey
  foreign key (plantilla_id) references plantilla_mensaje(id) on delete set null;

alter table mensaje_enviado alter column usuario_id set default auth.uid();
create index if not exists mensaje_enviado_encargo on mensaje_enviado (encargo_id, fecha desc);

-- El envío lo puede registrar cualquiera que trabaje con clientes (también Logística avisa a veces)
drop policy if exists msg_ins on mensaje_enviado;
create policy msg_ins on mensaje_enviado for insert
  with check (exists (select 1 from encargo e where e.id = encargo_id and es_miembro(e.tienda_id)));

-- Prefijo telefónico por defecto para WhatsApp (tiendas existentes: España)
update tienda set ajustes = ajustes || '{"prefijo_telefono": "34"}'::jsonb
 where not (ajustes ? 'prefijo_telefono');
