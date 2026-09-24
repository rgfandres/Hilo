-- 0041 · Mensajes como en Notelodigo: asunto propio por plantilla y sugerencia al abrir una incidencia
alter table plantilla_mensaje add column if not exists asunto text;
alter table plantilla_mensaje add column if not exists al_incidencia boolean not null default false;

select 'ok 0041' as r;
