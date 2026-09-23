-- Stub mínimo del esquema auth de Supabase para probar la migración en un Postgres local (sin Supabase CLI).
-- Uso: psql -f tests/stub_auth_local.sql; psql -d esq -f migrations/0001_nucleo.sql; psql -d esq -f seed/sastreria_demo.sql
create database esq;
\c esq
create schema auth;
create table auth.users (id uuid primary key, email text);
create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
create or replace function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true),''),'{}')::jsonb $$;
