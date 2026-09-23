-- =====================================================================
-- HILO · migración 0017 · tiempo real
-- Las pantallas se actualizan solas cuando otra persona cambia algo.
-- (Supabase Realtime respeta las RLS: cada uno solo recibe lo que puede ver.)
-- =====================================================================
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin alter publication supabase_realtime add table encargo; exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table hito; exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table comentario; exception when duplicate_object then null; end;
  end if;
end $$;
