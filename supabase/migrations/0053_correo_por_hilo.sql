-- 0053 · Avisar a la clienta por correo desde la app (lo envía la función enviar-correo con Resend).
-- Nunca es automático: lo pide una persona desde la ficha. El destino sale siempre de la ficha del
-- cliente (no lo manda el navegador), así la app no sirve para escribir a cualquier dirección.

alter table mensaje_enviado add column if not exists por_hilo boolean not null default false;

create or replace function preparar_correo(p_encargo uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_t uuid; v_mail text; v_nom text; v_aj jsonb; v_n int; v_max int;
begin
  select e.tienda_id, nullif(trim(c.email), '') into v_t, v_mail
    from encargo e left join cliente c on c.id = e.cliente_id where e.id = p_encargo;
  if v_t is null then raise exception 'No se encuentra el encargo'; end if;
  if coalesce(rol_en(v_t)::text, '') not in ('ADMIN','OPERATIVO','ATENCION') then
    raise exception 'No tienes permiso para avisar al cliente';
  end if;
  if v_mail is null or v_mail !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'La ficha no tiene un correo válido';
  end if;
  select nombre, coalesce(ajustes, '{}'::jsonb) into v_nom, v_aj from tienda where id = v_t;
  v_max := coalesce((v_aj->>'correos_dia')::int, 50);
  select count(*) into v_n from mensaje_enviado m join encargo e on e.id = m.encargo_id
   where e.tienda_id = v_t and m.por_hilo and m.fecha > now() - interval '1 day';
  if v_n >= v_max then
    raise exception 'Hoy ya se han enviado % correos desde la app (máximo %). Prueba mañana o ábrelo en tu correo.', v_n, v_max;
  end if;
  return jsonb_build_object(
    'email', v_mail,
    'tienda', v_nom,
    'responder', coalesce(nullif(trim(v_aj->>'correo_respuesta'), ''), (select email from auth.users where id = auth.uid()))
  );
end $$;
revoke all on function preparar_correo(uuid) from public, anon;
grant execute on function preparar_correo(uuid) to authenticated;
