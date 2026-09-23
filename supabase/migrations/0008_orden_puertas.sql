-- HILO · migración 0008 · las condiciones (puertas) guardan su fecha de creación
-- para mostrarse siempre en el mismo orden en Ajustes → Flujos.
alter table puerta add column if not exists creado_en timestamptz not null default now();
