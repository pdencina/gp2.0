-- ============================================================================
-- 015 · Archivo histórico de la plataforma anterior
--
-- La importación traduce los datos antiguos al modelo nuevo y, al hacerlo, algunos campos y tablas completas no
-- tienen dónde quedar (matrimonios, evaluaciones, aportes, fútbol, soporte, columnas sin equivalente, las marcas
-- originales "Semana 1 a 11"). Para no perder nada, cada fila antigua se guarda tal cual, como JSON, en una tabla
-- que no se modifica: "solo agrega".
--
--  · Se escribe únicamente con la clave de importación (service_role). Nadie más puede escribir.
--  · Solo el administrador lee. No se muestra a nadie más ni se mezcla con el resto de la plataforma.
--  · Una fila ya archivada no se sobrescribe: repetir el archivado no cambia nada.
--
-- Aditiva y repetible. Requiere 001 y 006.
-- ============================================================================
begin;

create table if not exists legacy_archive (
  source_table text not null,
  source_id text not null,
  data jsonb not null,
  archived_at timestamptz not null default now(),
  primary key (source_table, source_id)
);
create index if not exists legacy_archive_email_idx on legacy_archive ((lower(data ->> 'email'))) where data ? 'email';

alter table legacy_archive enable row level security;
revoke all on legacy_archive from anon, authenticated;
grant select on legacy_archive to authenticated;
drop policy if exists "admin lee el archivo historico" on legacy_archive;
create policy "admin lee el archivo historico" on legacy_archive for select to authenticated using ((select is_admin()));

-- Guarda filas tal cual. No sobrescribe: una fila ya archivada se deja como está.
-- Devuelve cuántas filas nuevas se agregaron. Solo la clave service_role puede llamarla.
create or replace function archive_legacy_rows(p_table text, p_rows jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if p_table is null or btrim(p_table) = '' then raise exception 'Falta el nombre de la tabla.'; end if;
  if jsonb_typeof(p_rows) <> 'array' then raise exception 'Las filas deben venir como una lista.'; end if;
  insert into legacy_archive (source_table, source_id, data)
  select p_table, coalesce(nullif(r ->> 'id', ''), md5(r::text)), r
    from jsonb_array_elements(p_rows) r
  on conflict (source_table, source_id) do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

-- Qué hay archivado, por tabla (solo el administrador)
create or replace function legacy_archive_summary() returns table (source_table text, filas bigint, desde timestamptz, hasta timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Solo el administrador ve el archivo histórico.'; end if;
  return query
    select a.source_table, count(*), min(a.archived_at), max(a.archived_at)
      from legacy_archive a group by a.source_table order by a.source_table;
end $$;

-- Todo lo archivado que corresponde a una persona (por su correo), para consultar su ficha antigua (solo el administrador)
create or replace function legacy_for_person(p_person uuid) returns table (source_table text, source_id text, data jsonb)
language plpgsql stable security definer set search_path = public as $$
declare mail text;
begin
  if not is_admin() then raise exception 'Solo el administrador ve el archivo histórico.'; end if;
  select lower(u.email) into mail from auth.users u where u.id = p_person;
  if mail is null then return; end if;
  return query
    select a.source_table, a.source_id, a.data
      from legacy_archive a
     where lower(a.data ->> 'email') = mail
     order by a.source_table, a.source_id;
end $$;

revoke all on function archive_legacy_rows(text, jsonb) from public, anon, authenticated;
revoke all on function legacy_archive_summary(), legacy_for_person(uuid) from public, anon;
grant execute on function legacy_archive_summary(), legacy_for_person(uuid) to authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function archive_legacy_rows(text, jsonb) to service_role;
  end if;
end $$;

notify pgrst, 'reload schema';
commit;
