-- =====================================================================
-- HILO · migración 0020 · permisos explícitos de la API de datos
-- Desde el 30-10-2026 Supabase deja de dar permisos automáticos a las
-- tablas nuevas del esquema public. En instalaciones nuevas de Hilo,
-- sin esto las tablas quedarían inaccesibles desde la app.
-- La seguridad real la siguen poniendo las RLS (cada tienda solo ve lo suyo).
-- Regla para migraciones futuras: toda tabla nueva lleva su grant aquí mismo.
-- =====================================================================
do $$
declare t text;
begin
  foreach t in array array[
    'actividad','adjunto','anulacion','check_encargo','cliente','comentario','encargo','etapa','hito',
    'invitacion','marca_revisar','mensaje_enviado','miembro','nota_campo','periodo','plantilla_campos',
    'plantilla_ficha','plantilla_mensaje','producto','producto_proveedor','proveedor','proveedor_usuario',
    'puerta','tienda','tipo_encargo'
  ] loop
    if to_regclass('public.' || t) is not null then
      execute format('grant select, insert, update, delete on public.%I to authenticated', t);
      execute format('grant all on public.%I to service_role', t);
    end if;
  end loop;
end $$;
grant usage, select on all sequences in schema public to authenticated, service_role;

select 'ok 0020' as r;
