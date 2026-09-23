-- =====================================================================
-- HILO · migración 0014 · ficha imprimible, adjuntos y notas de etapa
-- =====================================================================

-- Plantilla de la ficha: la leen los miembros y la cambia administración
alter table plantilla_ficha add column if not exists actualizado_en timestamptz not null default now();
drop policy if exists ficha_sel on plantilla_ficha;
create policy ficha_sel on plantilla_ficha for select using (es_miembro(tienda_id));
drop policy if exists ficha_wr on plantilla_ficha;
create policy ficha_wr on plantilla_ficha for all using (es_admin(tienda_id)) with check (es_admin(tienda_id));

-- Adjuntos: bucket privado (se ven con enlace firmado y temporal). Ruta: <tienda_id>/<encargo_id>/<fichero>
alter table adjunto add column if not exists nombre text;
alter table adjunto add column if not exists tamano integer;
insert into storage.buckets (id, name, public) values ('adjuntos', 'adjuntos', false)
on conflict (id) do nothing;

drop policy if exists adjuntos_leer on storage.objects;
create policy adjuntos_leer on storage.objects for select to authenticated
  using (bucket_id = 'adjuntos' and exists (
    select 1 from public.miembro m
     where m.tienda_id::text = (storage.foldername(name))[1] and m.user_id = auth.uid() and m.activo));
drop policy if exists adjuntos_subir on storage.objects;
create policy adjuntos_subir on storage.objects for insert to authenticated
  with check (bucket_id = 'adjuntos' and exists (
    select 1 from public.miembro m
     where m.tienda_id::text = (storage.foldername(name))[1] and m.user_id = auth.uid() and m.activo));
drop policy if exists adjuntos_borrar on storage.objects;
create policy adjuntos_borrar on storage.objects for delete to authenticated
  using (bucket_id = 'adjuntos' and exists (
    select 1 from public.miembro m
     where m.tienda_id::text = (storage.foldername(name))[1] and m.user_id = auth.uid() and m.activo
       and m.rol in ('ADMIN', 'OPERATIVO', 'ATENCION')));

-- Nota de un paso del hilo: la cambia quien lo marcó o ADMIN/OPERATIVO/ATENCION
create or replace function editar_nota_hito(p_hito uuid, p_nota text)
returns void language plpgsql security definer set search_path = public as $$
declare v_tienda uuid; v_autor uuid;
begin
  select e.tienda_id, h.usuario_id into v_tienda, v_autor
    from hito h join encargo e on e.id = h.encargo_id where h.id = p_hito;
  if v_tienda is null then raise exception 'Paso no encontrado'; end if;
  if not (coalesce(rol_en(v_tienda)::text, '') in ('ADMIN', 'OPERATIVO', 'ATENCION') or (v_autor = auth.uid() and es_miembro(v_tienda))) then
    raise exception 'Sin permiso';
  end if;
  update hito set nota = nullif(trim(p_nota), '') where id = p_hito;
end $$;
revoke all on function editar_nota_hito(uuid, text) from public, anon;
grant execute on function editar_nota_hito(uuid, text) to authenticated;
