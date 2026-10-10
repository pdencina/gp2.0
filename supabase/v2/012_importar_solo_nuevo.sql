-- ============================================================================
-- 012 · Importación "solo lo nuevo" desde la plataforma anterior
--
-- Para traer lo que se registró en la plataforma anterior DESPUÉS de la importación inicial, sin pisar
-- nada de lo que ya se hizo en GP 2.0. Son funciones aparte (import_new_*) que:
--   · agregan solo las filas que todavía no existen;
--   · nunca modifican una fila existente, con dos excepciones de avance hacia adelante:
--       - una inscripción que sigue "en curso" o "preinscrito" aquí y fue cerrada allá (aprobado, no completó…) se cierra;
--       - un grupo que sigue abierto o en curso aquí y finalizó allá se finaliza;
--   · no cambian roles, contraseñas, perfiles ni historial de cuentas que ya existían.
-- Incluye las funciones de apoyo de 002, así que sirve aunque 002 ya se haya quitado.
--
-- Solo las puede usar la clave "service_role". Se quitan al terminar con 003_quitar_importacion.sql.
-- ============================================================================
begin;

create or replace function import_auth_map(emails text[]) returns table (email text, id uuid)
language sql security definer set search_path = public as $$
  select lower(u.email), u.id from auth.users u where lower(u.email) = any(emails)
$$;

-- Solo se usa con las cuentas que se acaban de crear (su perfil nace vacío al registrarse).
create or replace function import_profiles(rows jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  insert into profiles (id, full_name, role, phone, country, birth_date, gender, city, guardian_name,
                        guardian_email, guardian_phone, terms_accepted_at, terms_version, accepts_comms, active, created_at)
  select x.id, x.full_name, x.role, x.phone, x.country, x.birth_date, x.gender, x.city, x.guardian_name,
         x.guardian_email, x.guardian_phone, x.terms_accepted_at, x.terms_version,
         coalesce(x.accepts_comms, true), coalesce(x.active, true), coalesce(x.created_at, now())
  from jsonb_to_recordset(rows) as x(id uuid, full_name text, role app_role, phone text, country text, birth_date date,
       gender text, city text, guardian_name text, guardian_email text, guardian_phone text,
       terms_accepted_at timestamptz, terms_version text, accepts_comms boolean, active boolean, created_at timestamptz)
  on conflict (id) do update set
    full_name = excluded.full_name, phone = excluded.phone, country = excluded.country,
    birth_date = excluded.birth_date, gender = excluded.gender, city = excluded.city,
    guardian_name = excluded.guardian_name, guardian_email = excluded.guardian_email,
    guardian_phone = excluded.guardian_phone, terms_accepted_at = excluded.terms_accepted_at,
    terms_version = excluded.terms_version, accepts_comms = excluded.accepts_comms, active = excluded.active,
    role = case when role_rank(excluded.role) > role_rank(profiles.role) then excluded.role else profiles.role end;
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function import_role_history_clear(ids uuid[]) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  delete from role_history where person_id = any(ids);
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function import_role_history(rows jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  insert into role_history (id, person_id, from_role, to_role, created_at)
  select x.id, x.person_id, x.from_role, x.to_role, x.created_at
  from jsonb_to_recordset(rows) as x(id uuid, person_id uuid, from_role app_role, to_role app_role, created_at timestamptz)
  on conflict (id) do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

-- Devuelve los identificadores de los currículums que se crearon (los coordinadores solo se asignan a esos)
create or replace function import_new_curriculums(rows jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare ids jsonb;
begin
  with ins as (
    insert into curriculums (id, name, description, audience, age_min, age_max, book, active)
    select x.id,
           case when exists (select 1 from curriculums c where c.name = x.name and c.id <> x.id)
                then x.name || ' (importado)' else x.name end,
           x.description, x.audience, x.age_min, x.age_max, x.book, coalesce(x.active, true)
    from jsonb_to_recordset(rows) as x(id uuid, name text, description text, audience audience, age_min int, age_max int, book text, active boolean)
    where not exists (select 1 from curriculums c where c.id = x.id)
    on conflict do nothing
    returning id)
  select coalesce(jsonb_agg(id), '[]'::jsonb) into ids from ins;
  return ids;
end $$;

create or replace function import_coordinators(rows jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  insert into curriculum_coordinators (curriculum_id, coordinator_id)
  select x.curriculum_id, x.coordinator_id
  from jsonb_to_recordset(rows) as x(curriculum_id uuid, coordinator_id uuid)
  join profiles p on p.id = x.coordinator_id and role_rank(p.role) >= 4
  on conflict do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function import_new_seasons(rows jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  insert into seasons (id, name, start_date, end_date, status)
  select x.id,
         case when exists (select 1 from seasons s where s.name = x.name and s.id <> x.id)
              then x.name || ' (importada)' else x.name end,
         x.start_date, x.end_date, x.status
  from jsonb_to_recordset(rows) as x(id uuid, name text, start_date date, end_date date, status season_status)
  where not exists (select 1 from seasons s where s.id = x.id)
  on conflict do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function import_new_cycles(rows jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare ids uuid[];
begin
  with ins as (
    insert into cycles (id, curriculum_id, number, title, classes)
    select x.id, x.curriculum_id, x.number, x.title, coalesce(x.classes, 11)
    from jsonb_to_recordset(rows) as x(id uuid, curriculum_id uuid, number int, title text, classes int, prerequisite_id uuid)
    where not exists (select 1 from cycles c where c.id = x.id)
    on conflict do nothing
    returning id)
  select coalesce(array_agg(id), '{}') into ids from ins;

  update cycles c set prerequisite_cycle_id = x.prerequisite_id
  from jsonb_to_recordset(rows) as x(id uuid, prerequisite_id uuid)
  where c.id = x.id and c.id = any(ids) and x.prerequisite_id is not null;
  return coalesce(array_length(ids, 1), 0);
end $$;

-- Grupos nuevos; los que ya existían solo se finalizan si allá terminaron y aquí siguen abiertos.
-- (Se filtran antes de insertar para no tocar la dirección protegida ni el resto de lo ya editado.)
create or replace function import_new_groups(rows jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare n int; m int;
begin
  insert into groups (id, season_id, cycle_id, name, leader_id, monitor_id, weekday, start_time, end_time,
                      modality, address, capacity, status, created_at)
  select x.id, x.season_id, x.cycle_id, x.name,
         case when role_rank(pl.role) >= 2 then x.leader_id end,
         case when role_rank(pm.role) >= 3 then x.monitor_id end,
         x.weekday, x.start_time, x.end_time, x.modality, x.address, coalesce(x.capacity, 15), x.status,
         coalesce(x.created_at, now())
  from jsonb_to_recordset(rows) as x(id uuid, season_id uuid, cycle_id uuid, name text, leader_id uuid, monitor_id uuid,
       weekday smallint, start_time time, end_time time, modality modality, address text, capacity int,
       status group_status, created_at timestamptz)
  left join profiles pl on pl.id = x.leader_id
  left join profiles pm on pm.id = x.monitor_id
  where not exists (select 1 from groups g where g.id = x.id)
  on conflict do nothing;
  get diagnostics n = row_count;

  update groups g set status = 'finalizado'
  from jsonb_to_recordset(rows) as x(id uuid, status group_status)
  where g.id = x.id and x.status = 'finalizado' and g.status in ('abierto', 'en_curso');
  get diagnostics m = row_count;
  return n + m;
end $$;

-- Inscripciones nuevas (histórico: sin reglas de inscripción) y cierre de las que aquí seguían en curso.
create or replace function import_new_enrollments(rows jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare n int; m int;
begin
  perform set_config('app.skip_checks', 'on', true);
  insert into enrollments (id, person_id, group_id, status, enrolled_at, closed_at)
  select x.id, x.person_id, x.group_id, x.status, coalesce(x.enrolled_at, now()), x.closed_at
  from jsonb_to_recordset(rows) as x(id uuid, person_id uuid, group_id uuid, status enrollment_status,
       enrolled_at timestamptz, closed_at timestamptz)
  where not exists (select 1 from enrollments e where e.id = x.id)
  on conflict do nothing;
  get diagnostics n = row_count;

  update enrollments e set status = x.status, closed_at = x.closed_at
  from jsonb_to_recordset(rows) as x(id uuid, status enrollment_status, closed_at timestamptz)
  where e.id = x.id and e.status in ('preinscrito', 'en_curso') and x.status not in ('preinscrito', 'en_curso');
  get diagnostics m = row_count;

  -- Lo que la plataforma anterior aprueba por asistencia queda como crédito por revisar, igual que en la migración
  insert into stage_credits (person_id, stage_id, enrollment_id, credited_at, note)
  select distinct on (e.person_id, g.cycle_id) e.person_id, g.cycle_id, e.id, coalesce(e.closed_at, e.enrolled_at),
         'Aprobado por asistencia en la plataforma anterior; requiere revisión'
  from jsonb_to_recordset(rows) as x(id uuid)
  join enrollments e on e.id = x.id and e.status = 'aprobado'
  join groups g on g.id = e.group_id and g.cycle_id is not null
  order by e.person_id, g.cycle_id, coalesce(e.closed_at, e.enrolled_at) desc
  on conflict (person_id, stage_id, source) do nothing;

  return n + m;
end $$;

create or replace function import_new_meetings(rows jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  insert into meetings (id, group_id, held_on, lesson_number)
  select x.id, x.group_id, x.held_on, x.lesson_number
  from jsonb_to_recordset(rows) as x(id uuid, group_id uuid, held_on date, lesson_number int)
  where not exists (select 1 from meetings m where m.id = x.id)
  on conflict do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

-- Solo marcas que faltan, de reuniones realizadas y de inscripciones del mismo grupo
create or replace function import_new_attendance(rows jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  insert into attendance (meeting_id, enrollment_id, status)
  select x.meeting_id, x.enrollment_id, x.status
  from jsonb_to_recordset(rows) as x(meeting_id uuid, enrollment_id uuid, status attendance_status)
  join meetings m on m.id = x.meeting_id and m.status = 'realizada'
  join enrollments e on e.id = x.enrollment_id and e.group_id = m.group_id
  on conflict do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

-- Recursos nuevos, solo en módulos de versiones que todavía se editan
create or replace function import_new_resources(rows jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  insert into resources (id, cycle_id, name, kind, read_url, edit_url, active)
  select x.id, x.cycle_id, x.name, x.kind, x.read_url, x.edit_url, coalesce(x.active, true)
  from jsonb_to_recordset(rows) as x(id uuid, cycle_id uuid, name text, kind text, read_url text, edit_url text, active boolean)
  join cycles cy on cy.id = x.cycle_id and version_is_editable(cy.version_id)
  where not exists (select 1 from resources r where r.id = x.id)
  on conflict do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

-- Solo la clave service_role puede llamarlas.
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace s on s.oid = p.pronamespace
    where s.nspname = 'public' and p.proname like 'import\_%'
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    if exists (select 1 from pg_roles where rolname = 'service_role') then
      execute format('grant execute on function %s to service_role', f.sig);
    end if;
  end loop;
end $$;

notify pgrst, 'reload schema';
commit;
