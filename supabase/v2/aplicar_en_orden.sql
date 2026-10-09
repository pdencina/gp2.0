-- ============================================================================
-- ACTUALIZACIÓN DE LA VERSIÓN 1 A LA 2 (archivo generado; no editar a mano)
-- Regenerar con: node scripts/build-apply-sql.js
--
-- Ejecuta, en este orden y de una sola vez:
--   1. 000_preparar_desde_v1.sql  (borra las tablas de la versión 1; conserva cuentas, perfiles y roles)
--   2. 001_schema.sql             (crea el modelo nuevo)
--
-- ANTES: haz un respaldo y confirma que la aplicación web ya está en la versión 2.
-- ============================================================================

-- ============================================================================
-- PASO PREVIO para actualizar un proyecto que está en la VERSIÓN 1 a la versión 2.
-- Se ejecuta UNA vez, antes de 001_schema.sql.
--
-- QUÉ CONSERVA:  cuentas de usuario, perfiles (nombre, rol, teléfono) e historial de roles.
-- QUÉ BORRA:     las tablas de la versión 1 y todos sus datos:
--                groups, group_members, sessions, attendance, contacts, lessons, curriculums.
--
-- ANTES DE EJECUTARLO:
--   1. Haz un respaldo (Supabase → Database → Backups) o exporta las tablas que quieras guardar.
--   2. Confirma que no necesitas los grupos, la asistencia ni las lecciones de la versión 1.
--   3. La aplicación web debe estar ya actualizada a la versión 2; la actual dejará de funcionar.
--
-- SEGURO: para que este script haga algo, quita los dos guiones de la línea siguiente.
-- ============================================================================
set app.confirmo_borrar_v1 = 'si';

-- Todo o nada: si algo falla, no se aplica ningún cambio.
begin;

do $$
begin
  if to_regclass('public.group_members') is null then
    raise exception 'Este proyecto no parece estar en la versión 1 (no existe la tabla group_members). No se hizo ningún cambio.';
  end if;
  if coalesce(current_setting('app.confirmo_borrar_v1', true), '') <> 'si' then
    raise exception 'Falta confirmar. Lee el encabezado de este archivo y quita los dos guiones de la línea "set app.confirmo_borrar_v1". No se hizo ningún cambio.';
  end if;
end $$;

-- Tablas de la versión 1 (se reemplazan por temporadas, ciclos, grupos, inscripciones y reuniones)
drop table if exists contacts, attendance, sessions, group_members, groups, lessons, curriculums cascade;

-- Funciones propias de la versión 1 que ya no se usan
drop function if exists my_alerts();
drop function if exists save_attendance(uuid, date, int, uuid[]);
drop function if exists enforce_group_capacity();
drop function if exists validate_group_roles();
drop function if exists validate_curriculum_coordinator();
drop function if exists validate_member_role();
drop function if exists lessons_released(uuid);
drop function if exists assignable_people(app_role);

commit;


-- Grupos Pequeños 2.0 — esquema nuevo (para un proyecto de Supabase limpio)
-- Estructura: Temporada > Currículum > Ciclo > Grupo > Inscripción > Reunión > Asistencia.
-- Personas: perfil + historial de roles. Ver docs/DISENO_V2.md.

-- Todo o nada: si algo falla, no se aplica ningún cambio.
begin;

-- Guarda: un proyecto en versión 1 debe pasar antes por 000_preparar_desde_v1.sql.
do $$ begin
  if to_regclass('public.group_members') is not null then
    raise exception 'Este proyecto está en la versión 1. Primero ejecuta 000_preparar_desde_v1.sql (lee su encabezado). No se hizo ningún cambio.';
  end if;
end $$;

-- ======================================================================
-- Tipos
-- ======================================================================
-- app_role ya existe en proyectos que vienen de la versión 1; se reutiliza.
do $$ begin
  create type app_role as enum ('admin', 'coordinador', 'monitor', 'lider', 'alumno');
exception when duplicate_object then null;
end $$;
create type audience as enum ('todos', 'hombres', 'mujeres', 'parejas');
create type season_status as enum ('borrador', 'inscripciones', 'en_curso', 'cerrada');
create type group_status as enum ('abierto', 'en_curso', 'finalizado');
create type modality as enum ('presencial', 'virtual');
create type enrollment_status as enum ('preinscrito', 'en_curso', 'aprobado', 'no_completo', 'cancelado', 'no_participo');
create type attendance_status as enum ('presente', 'ausente', 'recuperado');

-- ======================================================================
-- Personas
-- ======================================================================
-- Si el proyecto viene de la versión 1, profiles ya existe y solo se amplía.
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  role app_role not null default 'alumno',
  created_at timestamptz not null default now()
);
alter table profiles add column if not exists phone text check (phone is null or phone ~ '^\+[0-9]{8,15}$');
alter table profiles add column if not exists country text check (country is null or country ~ '^[A-Z]{2}$');
alter table profiles add column if not exists birth_date date;
alter table profiles add column if not exists gender text check (gender in ('hombre', 'mujer'));
alter table profiles add column if not exists city text;
alter table profiles add column if not exists guardian_name text;
alter table profiles add column if not exists guardian_email text;
alter table profiles add column if not exists guardian_phone text;
alter table profiles add column if not exists terms_accepted_at timestamptz;
alter table profiles add column if not exists terms_version text;
alter table profiles add column if not exists accepts_comms boolean not null default true;
alter table profiles add column if not exists active boolean not null default true;

-- En la versión 1 la columna se llamaba user_id.
do $$ begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'role_history' and column_name = 'user_id'
  ) then
    alter table role_history rename column user_id to person_id;
  end if;
end $$;

create table if not exists role_history (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references profiles(id) on delete cascade,
  from_role app_role,
  to_role app_role not null,
  changed_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists role_history_person_id_idx on role_history (person_id);

-- ======================================================================
-- Programa
-- ======================================================================
create table curriculums (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  audience audience not null default 'todos',
  age_min int check (age_min is null or age_min >= 0),
  age_max int check (age_max is null or age_max >= 0),
  book text,
  image_url text,
  default_capacity int not null default 15 check (default_capacity > 0),
  max_absences int not null default 3 check (max_absences >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  check (age_min is null or age_max is null or age_min <= age_max)
);

create table curriculum_coordinators (
  curriculum_id uuid not null references curriculums(id) on delete cascade,
  coordinator_id uuid not null references profiles(id) on delete cascade,
  primary key (curriculum_id, coordinator_id)
);
create index on curriculum_coordinators (coordinator_id);

create table seasons (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  start_date date not null,
  end_date date not null,
  status season_status not null default 'borrador',
  created_at timestamptz not null default now(),
  check (end_date >= start_date)
);

create table cycles (
  id uuid primary key default gen_random_uuid(),
  curriculum_id uuid not null references curriculums(id) on delete cascade,
  number int not null check (number > 0),
  title text,
  classes int not null default 11 check (classes > 0),
  prerequisite_cycle_id uuid references cycles(id) on delete set null,
  unique (curriculum_id, number)
);

create table lessons (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references cycles(id) on delete cascade,
  number int not null check (number > 0),
  title text not null,
  summary text,
  content text,
  questions text,
  video_url text check (video_url is null or video_url ~ '^https://'),
  unique (cycle_id, number)
);

create table resources (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references cycles(id) on delete cascade,
  name text not null,
  kind text,
  read_url text check (read_url is null or read_url ~ '^https://'),
  edit_url text check (edit_url is null or edit_url ~ '^https://'),
  active boolean not null default true
);

-- Un grupo es un horario concreto de un ciclo, en una temporada.
create table groups (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references seasons(id) on delete restrict,
  cycle_id uuid not null references cycles(id) on delete restrict,
  name text not null,
  leader_id uuid references profiles(id) on delete set null,
  monitor_id uuid references profiles(id) on delete set null,
  weekday smallint check (weekday between 1 and 7),
  start_time time,
  end_time time,
  modality modality not null default 'virtual',
  address text,
  capacity int not null default 15 check (capacity > 0),
  status group_status not null default 'abierto',
  continues_from uuid references groups(id) on delete set null,
  created_at timestamptz not null default now(),
  check (start_time is null or end_time is null or end_time > start_time)
);
create index on groups (season_id);
create index on groups (cycle_id);
create index on groups (leader_id);
create index on groups (monitor_id);

create table enrollments (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references profiles(id) on delete cascade,
  group_id uuid not null references groups(id) on delete cascade,
  season_id uuid not null references seasons(id),
  curriculum_id uuid not null references curriculums(id),
  status enrollment_status not null default 'en_curso',
  enrolled_at timestamptz not null default now(),
  closed_at timestamptz,
  created_by uuid references profiles(id) on delete set null,
  unique (person_id, group_id)
);
create index on enrollments (group_id);
create index on enrollments (person_id);
-- Una persona no puede estar activa dos veces en el mismo currículum y temporada.
create unique index enrollments_one_active on enrollments (person_id, curriculum_id, season_id)
  where status in ('preinscrito', 'en_curso');

create table meetings (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id) on delete cascade,
  held_on date not null,
  lesson_number int check (lesson_number is null or lesson_number > 0),
  created_at timestamptz not null default now(),
  unique (group_id, held_on)
);

create table attendance (
  meeting_id uuid not null references meetings(id) on delete cascade,
  enrollment_id uuid not null references enrollments(id) on delete cascade,
  status attendance_status not null,
  primary key (meeting_id, enrollment_id)
);
create index on attendance (enrollment_id);

create table contacts (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references profiles(id) on delete cascade,
  group_id uuid not null references groups(id) on delete cascade,
  contacted_by uuid references profiles(id) on delete set null,
  kind text not null check (kind in ('llamada', 'mensaje', 'visita')),
  note text,
  created_at timestamptz not null default now()
);
create index on contacts (person_id, group_id);

create table audit_log (
  id bigint generated always as identity primary key,
  actor uuid,
  action text not null,
  table_name text not null,
  record_id text,
  detail jsonb,
  created_at timestamptz not null default now()
);

-- ======================================================================
-- Funciones de apoyo para las reglas de acceso (RLS)
-- ======================================================================
create or replace function role_rank(r app_role) returns int
language sql immutable as $$
  select case r when 'alumno' then 1 when 'lider' then 2 when 'monitor' then 3
                when 'coordinador' then 4 when 'admin' then 5 end
$$;

create or replace function my_role() returns app_role
language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid()
$$;

create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'admin' from profiles where id = auth.uid()), false)
$$;

create or replace function coordinates_curriculum(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from curriculum_coordinators cc
    where cc.curriculum_id = cid and cc.coordinator_id = auth.uid()
  )
$$;

create or replace function coordinates_cycle(cyid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from cycles cy
    join curriculum_coordinators cc on cc.curriculum_id = cy.curriculum_id
    where cy.id = cyid and cc.coordinator_id = auth.uid()
  )
$$;

create or replace function group_curriculum(gid uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select cy.curriculum_id from groups g join cycles cy on cy.id = g.cycle_id where g.id = gid
$$;

-- Administra el grupo: administrador, coordinador del currículum, monitor o líder del grupo.
create or replace function can_manage_group(gid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_admin()
    or exists (
      select 1 from groups g
      join cycles cy on cy.id = g.cycle_id
      join curriculum_coordinators cc on cc.curriculum_id = cy.curriculum_id
      where g.id = gid and cc.coordinator_id = auth.uid()
    )
    or exists (
      select 1 from groups g
      where g.id = gid and (g.leader_id = auth.uid() or g.monitor_id = auth.uid())
    )
$$;

create or replace function is_enrolled(gid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from enrollments e
    where e.group_id = gid and e.person_id = auth.uid() and e.status <> 'cancelado'
  )
$$;

create or replace function can_see_group(gid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select can_manage_group(gid) or is_enrolled(gid)
$$;

create or replace function can_see_profile(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select pid = auth.uid()
    or is_admin()
    -- personas de grupos que administro
    or exists (
      select 1 from groups g
      where can_manage_group(g.id)
        and (g.leader_id = pid or g.monitor_id = pid
             or exists (select 1 from enrollments e where e.group_id = g.id and e.person_id = pid))
    )
    -- mi líder y mi monitor
    or exists (
      select 1 from groups g
      where is_enrolled(g.id) and (g.leader_id = pid or g.monitor_id = pid)
    )
$$;

-- Lecciones a las que accede quien está inscrito: hasta la siguiente a la última dada en su grupo.
create or replace function lessons_released(cid uuid) returns int
language sql stable security definer set search_path = public as $$
  select coalesce(max(coalesce((select max(m.lesson_number) from meetings m where m.group_id = g.id), 0) + 1), 0)
  from groups g
  join enrollments e on e.group_id = g.id
  where g.cycle_id = cid and e.person_id = auth.uid() and e.status <> 'cancelado'
$$;

create or replace function manages_cycle_content(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_admin()
    or coordinates_cycle(cid)
    or exists (select 1 from groups g where g.cycle_id = cid and (g.leader_id = auth.uid() or g.monitor_id = auth.uid()))
$$;

create or replace function can_see_lesson(cid uuid, n int) returns boolean
language sql stable security definer set search_path = public as $$
  select manages_cycle_content(cid) or n <= lessons_released(cid)
$$;

create or replace function can_see_cycle_content(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select manages_cycle_content(cid)
    or exists (
      select 1 from groups g join enrollments e on e.group_id = g.id
      where g.cycle_id = cid and e.person_id = auth.uid() and e.status <> 'cancelado'
    )
$$;

-- ======================================================================
-- Triggers
-- ======================================================================
-- Perfil al registrarse (siempre como alumno)
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''));
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute function handle_new_user();

-- Historial de roles (altas y cualquier cambio, incluso los del administrador)
create or replace function log_role_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into role_history (person_id, from_role, to_role) values (new.id, null, new.role);
  elsif new.role is distinct from old.role then
    insert into role_history (person_id, from_role, to_role, changed_by)
    values (new.id, old.role, new.role, auth.uid());
  end if;
  return new;
end $$;

drop trigger if exists trg_log_role_change on profiles;
create trigger trg_log_role_change after insert or update of role on profiles
for each row execute function log_role_change();

-- Líder y monitor deben tener un rol suficiente
create or replace function validate_group() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.leader_id is not null
     and coalesce(role_rank((select role from profiles where id = new.leader_id)), 0) < 2 then
    raise exception 'La persona asignada como líder debe tener rol de líder o superior.';
  end if;
  if new.monitor_id is not null
     and coalesce(role_rank((select role from profiles where id = new.monitor_id)), 0) < 3 then
    raise exception 'La persona asignada como monitor debe tener rol de monitor o superior.';
  end if;
  return new;
end $$;

create trigger trg_validate_group before insert or update on groups
for each row execute function validate_group();

create or replace function validate_coordinator() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(role_rank((select role from profiles where id = new.coordinator_id)), 0) < 4 then
    raise exception 'La persona asignada como coordinador debe tener rol de coordinador.';
  end if;
  return new;
end $$;

create trigger trg_validate_coordinator before insert or update on curriculum_coordinators
for each row execute function validate_coordinator();

-- Reglas de inscripción: audiencia, edad, ciclo previo y cupo.
-- La migración de datos históricos puede saltarlas con: set_config('app.skip_checks', 'on', true)
create or replace function validate_enrollment() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v record;
  p record;
  years int;
begin
  select g.season_id, g.capacity, cy.curriculum_id, cy.prerequisite_cycle_id,
         cu.audience, cu.age_min, cu.age_max
    into v
  from groups g
  join cycles cy on cy.id = g.cycle_id
  join curriculums cu on cu.id = cy.curriculum_id
  where g.id = new.group_id;

  new.season_id := v.season_id;
  new.curriculum_id := v.curriculum_id;

  if coalesce(current_setting('app.skip_checks', true), '') = 'on' then
    return new;
  end if;

  if new.status in ('preinscrito', 'en_curso') then
    select gender, birth_date into p from profiles where id = new.person_id;

    if v.audience in ('hombres', 'mujeres') then
      if p.gender is null then
        raise exception 'Completa tu género en el perfil para inscribirte en este grupo.';
      end if;
      if (v.audience = 'hombres' and p.gender <> 'hombre') or (v.audience = 'mujeres' and p.gender <> 'mujer') then
        raise exception 'Este grupo no está disponible para tu perfil.';
      end if;
    end if;

    if v.age_min is not null or v.age_max is not null then
      if p.birth_date is null then
        raise exception 'Completa tu fecha de nacimiento en el perfil para inscribirte en este grupo.';
      end if;
      years := date_part('year', age(p.birth_date));
      if (v.age_min is not null and years < v.age_min) or (v.age_max is not null and years > v.age_max) then
        raise exception 'Este grupo no está disponible para tu edad.';
      end if;
    end if;

    if v.prerequisite_cycle_id is not null and not exists (
      select 1 from enrollments e join groups g2 on g2.id = e.group_id
      where e.person_id = new.person_id and g2.cycle_id = v.prerequisite_cycle_id and e.status = 'aprobado'
    ) then
      raise exception 'Primero debes aprobar el ciclo anterior.';
    end if;

    if (select count(*) from enrollments e
        where e.group_id = new.group_id and e.status in ('preinscrito', 'en_curso', 'aprobado')) >= v.capacity then
      raise exception 'El grupo ya alcanzó su cupo máximo.';
    end if;
  end if;
  return new;
end $$;

create trigger trg_validate_enrollment before insert on enrollments
for each row execute function validate_enrollment();

-- Auditoría de cambios sensibles
create or replace function audit_trigger() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  r jsonb := to_jsonb(case when tg_op = 'DELETE' then old else new end);
begin
  insert into audit_log (actor, action, table_name, record_id, detail)
  values (
    auth.uid(), tg_op, tg_table_name, r->>'id',
    case when tg_op = 'UPDATE' then jsonb_build_object('before', to_jsonb(old), 'after', to_jsonb(new)) else r end
  );
  return null;
end $$;

create trigger trg_audit_enrollments after update of status on enrollments
for each row when (old.status is distinct from new.status) execute function audit_trigger();
create trigger trg_audit_groups after update on groups
for each row execute function audit_trigger();
create trigger trg_audit_coordinators after insert or delete on curriculum_coordinators
for each row execute function audit_trigger();

-- ======================================================================
-- Avance de cada inscripción (se calcula, no se guarda)
-- ======================================================================
create view enrollment_progress with (security_invoker = true) as
select
  e.id as enrollment_id,
  e.group_id,
  e.person_id,
  e.status,
  cu.max_absences,
  count(m.id)::int as meetings_held,
  (count(a.status) filter (where a.status = 'presente'))::int as present,
  (count(a.status) filter (where a.status = 'recuperado'))::int as recovered,
  (count(m.id) - count(a.status) filter (where a.status in ('presente', 'recuperado')))::int as absences
from enrollments e
join groups g on g.id = e.group_id
join cycles cy on cy.id = g.cycle_id
join curriculums cu on cu.id = cy.curriculum_id
left join meetings m on m.group_id = e.group_id and m.held_on >= e.enrolled_at::date
left join attendance a on a.meeting_id = m.id and a.enrollment_id = e.id
group by e.id, cu.max_absences;

-- Cupos ocupados de un grupo (lo puede ver cualquiera que vea el grupo, aunque no vea a los inscritos)
create or replace function group_enrolled_count(gid uuid) returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from enrollments
  where group_id = gid and status in ('preinscrito', 'en_curso', 'aprobado')
$$;

-- Vistas de lectura para la aplicación (respetan los permisos de quien consulta)
create view group_overview with (security_invoker = true) as
select
  g.id, g.name, g.status,
  g.season_id, s.name as season_name, s.status as season_status,
  g.cycle_id, cy.number as cycle_number, cy.title as cycle_title,
  cu.id as curriculum_id, cu.name as curriculum_name,
  g.leader_id, (select p.full_name from profiles p where p.id = g.leader_id) as leader_name,
  g.monitor_id, (select p.full_name from profiles p where p.id = g.monitor_id) as monitor_name,
  g.weekday, g.start_time, g.end_time, g.modality, g.address, g.capacity, g.continues_from,
  group_enrolled_count(g.id) as enrolled,
  g.created_at
from groups g
join seasons s on s.id = g.season_id
join cycles cy on cy.id = g.cycle_id
join curriculums cu on cu.id = cy.curriculum_id;

create view roster with (security_invoker = true) as
select
  p.enrollment_id, p.group_id, p.person_id, p.status,
  pr.full_name as person_name, pr.phone,
  e.enrolled_at,
  p.meetings_held, p.present, p.recovered, p.absences, p.max_absences
from enrollment_progress p
join enrollments e on e.id = p.enrollment_id
join profiles pr on pr.id = p.person_id;

create view meeting_summary with (security_invoker = true) as
select
  m.id, m.group_id, m.held_on, m.lesson_number,
  (count(a.status) filter (where a.status = 'presente'))::int as present,
  (count(a.status) filter (where a.status = 'recuperado'))::int as recovered,
  count(a.status)::int as total
from meetings m
left join attendance a on a.meeting_id = m.id
group by m.id;

-- ======================================================================
-- Operaciones (se llaman desde la aplicación)
-- ======================================================================
-- Inscribirse a sí mismo en un grupo abierto
create or replace function enroll(gid uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  gr record;
  pr record;
  eid uuid;
begin
  if uid is null then raise exception 'Debes iniciar sesión.'; end if;

  select g.status as gstatus, s.status as sstatus into gr
  from groups g join seasons s on s.id = g.season_id where g.id = gid;
  if not found then raise exception 'El grupo no existe.'; end if;
  if gr.gstatus <> 'abierto' or gr.sstatus not in ('inscripciones', 'en_curso') then
    raise exception 'Este grupo no está recibiendo inscripciones.';
  end if;

  select terms_accepted_at, birth_date, guardian_name into pr from profiles where id = uid;
  if pr.terms_accepted_at is null then raise exception 'Acepta los términos para inscribirte.'; end if;
  if pr.birth_date is not null and age(pr.birth_date) < interval '18 years' and coalesce(pr.guardian_name, '') = '' then
    raise exception 'Se necesitan los datos de tu tutor para inscribirte.';
  end if;

  insert into enrollments (person_id, group_id, status, created_by)
  values (uid, gid, 'en_curso', uid) returning id into eid;
  return eid;
end $$;

-- Quien administra un grupo inscribe a otra persona
create or replace function enroll_person(gid uuid, person uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  eid uuid;
begin
  if not can_manage_group(gid) then raise exception 'No tienes permiso para inscribir en este grupo.'; end if;
  if (select status from groups where id = gid) = 'finalizado' then
    raise exception 'El grupo ya finalizó.';
  end if;
  insert into enrollments (person_id, group_id, status, created_by)
  values (person, gid, 'en_curso', auth.uid()) returning id into eid;
  return eid;
end $$;

-- La persona confirma (o rechaza) una preinscripción
create or replace function confirm_enrollment(eid uuid, accept boolean) returns enrollment_status
language plpgsql security definer set search_path = public as $$
declare
  s enrollment_status;
begin
  update enrollments
     set status = case when accept then 'en_curso'::enrollment_status else 'cancelado'::enrollment_status end
   where id = eid and person_id = auth.uid() and status = 'preinscrito'
  returning status into s;
  if s is null then raise exception 'No hay una preinscripción pendiente para confirmar.'; end if;
  return s;
end $$;

create or replace function cancel_enrollment(eid uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  e record;
begin
  select person_id, group_id, status into e from enrollments where id = eid;
  if not found then raise exception 'La inscripción no existe.'; end if;
  if e.person_id <> auth.uid() and not can_manage_group(e.group_id) then
    raise exception 'No tienes permiso para cancelar esta inscripción.';
  end if;
  if e.status not in ('preinscrito', 'en_curso') then
    raise exception 'Solo se pueden cancelar inscripciones vigentes.';
  end if;
  update enrollments set status = 'cancelado', closed_at = now() where id = eid;
end $$;

-- Pasar lista: guarda o corrige la reunión de un día
create or replace function save_attendance(gid uuid, day date, lesson int, present uuid[], recovered uuid[])
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  mid uuid;
begin
  if not can_manage_group(gid) then raise exception 'No tienes permiso para pasar lista en este grupo.'; end if;
  if day > current_date + 1 then raise exception 'No se puede pasar lista de una fecha futura.'; end if;

  insert into meetings (group_id, held_on, lesson_number)
  values (gid, day, lesson)
  on conflict (group_id, held_on) do update set lesson_number = excluded.lesson_number
  returning id into mid;

  insert into attendance (meeting_id, enrollment_id, status)
  select mid, e.id,
         case when e.id = any(coalesce(recovered, '{}')) then 'recuperado'::attendance_status
              when e.id = any(coalesce(present, '{}')) then 'presente'::attendance_status
              else 'ausente'::attendance_status end
  from enrollments e
  where e.group_id = gid and e.status = 'en_curso'
  on conflict (meeting_id, enrollment_id) do update set status = excluded.status;

  update groups set status = 'en_curso' where id = gid and status = 'abierto';
  return mid;
end $$;

create or replace function can_close_group(gid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_admin() or coordinates_curriculum(group_curriculum(gid))
$$;

-- Cierra un grupo: más ausencias que el máximo del currículum = no completó
create or replace function close_group(gid uuid) returns table (approved int, not_completed int)
language plpgsql security definer set search_path = public as $$
begin
  if not can_close_group(gid) then raise exception 'Solo el coordinador del currículum puede cerrar el ciclo.'; end if;
  if (select status from groups where id = gid) = 'finalizado' then raise exception 'El grupo ya está finalizado.'; end if;

  update enrollments e
     set status = case when p.absences > p.max_absences then 'no_completo'::enrollment_status
                       else 'aprobado'::enrollment_status end,
         closed_at = now()
    from enrollment_progress p
   where p.enrollment_id = e.id and e.group_id = gid and e.status = 'en_curso';

  update groups set status = 'finalizado' where id = gid;

  return query
    select (count(*) filter (where status = 'aprobado'))::int,
           (count(*) filter (where status = 'no_completo'))::int
    from enrollments where group_id = gid;
end $$;

-- Crea el grupo del ciclo siguiente con quienes aprobaron (como preinscritos)
create or replace function create_continuation(gid uuid, target_season uuid default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  src record;
  next_cycle uuid;
  new_gid uuid;
begin
  if not can_close_group(gid) then raise exception 'Solo el coordinador del currículum puede crear la continuación.'; end if;
  select * into src from groups where id = gid;
  if src.status <> 'finalizado' then raise exception 'Primero cierra el ciclo del grupo.'; end if;

  select cy2.id into next_cycle
  from cycles cy join cycles cy2 on cy2.curriculum_id = cy.curriculum_id and cy2.number = cy.number + 1
  where cy.id = src.cycle_id;
  if next_cycle is null then raise exception 'Este currículum no tiene un ciclo siguiente.'; end if;

  insert into groups (season_id, cycle_id, name, leader_id, monitor_id, weekday, start_time, end_time,
                      modality, address, capacity, status, continues_from)
  values (coalesce(target_season, src.season_id), next_cycle, src.name, src.leader_id, src.monitor_id,
          src.weekday, src.start_time, src.end_time, src.modality, src.address, src.capacity, 'abierto', gid)
  returning id into new_gid;

  perform set_config('app.skip_checks', 'on', true);
  insert into enrollments (person_id, group_id, status, created_by)
  select e.person_id, new_gid, 'preinscrito', auth.uid()
  from enrollments e where e.group_id = gid and e.status = 'aprobado';
  perform set_config('app.skip_checks', 'off', true);

  return new_gid;
end $$;

-- Escalera de ascenso: alumno -> líder -> monitor -> coordinador
create or replace function promote_user(target uuid) returns app_role
language plpgsql security definer set search_path = public as $$
declare
  caller app_role := my_role();
  cur app_role;
  nxt app_role;
begin
  if auth.uid() is null or caller is null then raise exception 'Debes iniciar sesión.'; end if;
  if target = auth.uid() then raise exception 'No puedes promoverte a ti mismo.'; end if;

  select role into cur from profiles where id = target;
  if cur is null then raise exception 'La persona no existe.'; end if;

  nxt := case cur
    when 'alumno' then 'lider'::app_role
    when 'lider' then 'monitor'::app_role
    when 'monitor' then 'coordinador'::app_role
    else null end;
  if nxt is null then raise exception 'Esta persona ya está en el nivel más alto de la escalera.'; end if;

  if role_rank(caller) <= role_rank(nxt) and caller <> 'admin' then
    raise exception 'Tu rol no puede promover a un %.', nxt;
  end if;
  if caller <> 'admin' and not can_see_profile(target) then
    raise exception 'Esa persona no pertenece a tu alcance.';
  end if;

  update profiles set role = nxt where id = target;
  return nxt;
end $$;

-- Candidatos para asignar como líder, monitor o coordinador (solo nombre e id)
create or replace function assignable_people(r app_role) returns table (id uuid, full_name text)
language sql stable security definer set search_path = public as $$
  select p.id, p.full_name
  from profiles p
  where r in ('lider', 'monitor', 'coordinador')
    and my_role() in ('admin', 'coordinador')
    and p.role <> 'admin'
    and role_rank(p.role) >= role_rank(r)
  order by p.full_name
$$;

-- Personas que se pueden inscribir en un grupo (aún no activas en ese currículum y temporada)
create or replace function enrollment_candidates(gid uuid) returns table (id uuid, full_name text)
language sql stable security definer set search_path = public as $$
  select p.id, p.full_name
  from profiles p, groups g
  where g.id = gid
    and can_manage_group(gid)
    and p.active
    and not exists (
      select 1 from enrollments e
      where e.person_id = p.id and e.curriculum_id = group_curriculum(gid)
        and e.season_id = g.season_id and e.status in ('preinscrito', 'en_curso')
    )
  order by p.full_name
$$;

-- ======================================================================
-- Alertas de seguimiento (con los permisos de quien las consulta)
-- ======================================================================
create or replace function my_alerts()
returns table (
  kind text, severity int, group_id uuid, group_name text,
  person_id uuid, person_name text, detail text, since date
)
language sql stable set search_path = public as $$
with ag as (
  select g.id, g.name, g.leader_id, g.monitor_id, g.status, g.created_at
  from groups g
  where g.status in ('abierto', 'en_curso') and can_manage_group(g.id)
),
ranked as (
  select m.id, m.group_id, m.held_on,
         row_number() over (partition by m.group_id order by m.held_on desc) as rn
  from meetings m join ag on ag.id = m.group_id
),
recent2 as (
  select r.group_id, e.person_id, min(r.held_on) as since, count(*) as n,
         count(*) filter (where coalesce(a.status, 'ausente') = 'ausente') as missed
  from ranked r
  join enrollments e on e.group_id = r.group_id and e.status = 'en_curso' and r.held_on >= e.enrolled_at::date
  left join attendance a on a.meeting_id = r.id and a.enrollment_id = e.id
  where r.rn <= 2
  group by r.group_id, e.id, e.person_id
),
recent4 as (
  select r.group_id,
         avg(case when a.status in ('presente', 'recuperado') then 1.0 else 0.0 end) as pct,
         count(distinct r.id) as n_meetings
  from ranked r
  join enrollments e on e.group_id = r.group_id and e.status = 'en_curso' and r.held_on >= e.enrolled_at::date
  left join attendance a on a.meeting_id = r.id and a.enrollment_id = e.id
  where r.rn <= 4
  group by r.group_id
),
last_meeting as (
  select group_id, max(held_on) as last_on from meetings group by group_id
),
alerts as (
  -- Faltó las 2 últimas reuniones y nadie lo ha contactado desde entonces
  select 'ausente'::text as kind, 3 as severity, ag.id as group_id, ag.name as group_name,
         p.id as person_id, p.full_name as person_name,
         'Faltó las últimas 2 reuniones'::text as detail, r2.since
  from recent2 r2
  join ag on ag.id = r2.group_id
  join profiles p on p.id = r2.person_id
  where r2.n = 2 and r2.missed = 2
    and not exists (
      select 1 from contacts c
      where c.person_id = p.id and c.group_id = ag.id and c.created_at::date >= r2.since
    )

  union all
  -- En riesgo de no completar: queda una ausencia (o ninguna) de margen
  select 'en_riesgo', 3, ag.id, ag.name, p.id, p.full_name,
         'Lleva ' || ep.absences || ' ausencias de ' || ep.max_absences || ' permitidas',
         coalesce(lm.last_on, current_date)
  from enrollment_progress ep
  join ag on ag.id = ep.group_id
  join profiles p on p.id = ep.person_id
  left join last_meeting lm on lm.group_id = ag.id
  where ep.status = 'en_curso' and ep.absences >= ep.max_absences - 1 and ep.absences <= ep.max_absences

  union all
  -- Ya superó el máximo de ausencias
  select 'excedido', 2, ag.id, ag.name, p.id, p.full_name,
         'Superó las ' || ep.max_absences || ' ausencias permitidas',
         coalesce(lm.last_on, current_date)
  from enrollment_progress ep
  join ag on ag.id = ep.group_id
  join profiles p on p.id = ep.person_id
  left join last_meeting lm on lm.group_id = ag.id
  where ep.status = 'en_curso' and ep.absences > ep.max_absences

  union all
  -- Persona nueva sin ningún contacto
  select 'nuevo', 2, ag.id, ag.name, p.id, p.full_name,
         'Se unió hace poco y aún no tiene contacto', e.enrolled_at::date
  from enrollments e
  join ag on ag.id = e.group_id
  join profiles p on p.id = e.person_id
  where e.status = 'en_curso' and e.enrolled_at > now() - interval '21 days'
    and not exists (select 1 from contacts c where c.person_id = p.id and c.group_id = ag.id)

  union all
  -- Asistencia baja en las últimas reuniones
  select 'asistencia_baja', 3, ag.id, ag.name, null::uuid, null::text,
         'Asistencia de las últimas reuniones: ' || round(100 * r4.pct) || '%', lm.last_on
  from recent4 r4
  join ag on ag.id = r4.group_id
  left join last_meeting lm on lm.group_id = ag.id
  where r4.n_meetings >= 2 and r4.pct < 0.6

  union all
  -- Más de 14 días sin pasar lista
  select 'sin_reunion', 2, ag.id, ag.name, null::uuid, null::text,
         case when lm.last_on is null then 'Todavía no se ha pasado lista'
              else 'No se pasa lista hace ' || (current_date - lm.last_on) || ' días' end,
         coalesce(lm.last_on, ag.created_at::date)
  from ag
  left join last_meeting lm on lm.group_id = ag.id
  where ag.status = 'en_curso'
    and coalesce(lm.last_on, ag.created_at::date) < current_date - 14

  union all
  select 'sin_lider', 2, ag.id, ag.name, null::uuid, null::text,
         'El grupo no tiene líder asignado', ag.created_at::date
  from ag where ag.leader_id is null and my_role() in ('admin', 'coordinador')

  union all
  select 'sin_monitor', 1, ag.id, ag.name, null::uuid, null::text,
         'El grupo no tiene monitor asignado', ag.created_at::date
  from ag where ag.monitor_id is null and my_role() in ('admin', 'coordinador')
)
select a.kind, a.severity, a.group_id, a.group_name, a.person_id, a.person_name, a.detail, a.since
from alerts a
where my_role() in ('admin', 'coordinador', 'monitor', 'lider')
order by a.severity desc, a.since
$$;

-- ======================================================================
-- Seguridad a nivel de fila (RLS)
-- ======================================================================
alter table profiles enable row level security;
alter table role_history enable row level security;
alter table curriculums enable row level security;
alter table curriculum_coordinators enable row level security;
alter table seasons enable row level security;
alter table cycles enable row level security;
alter table lessons enable row level security;
alter table resources enable row level security;
alter table groups enable row level security;
alter table enrollments enable row level security;
alter table meetings enable row level security;
alter table attendance enable row level security;
alter table contacts enable row level security;
alter table audit_log enable row level security;

-- profiles (se reemplazan las políticas de la versión 1, si existen)
drop policy if exists "ver perfiles permitidos" on profiles;
drop policy if exists "editar mi perfil" on profiles;
drop policy if exists "admin gestiona perfiles" on profiles;
drop policy if exists "ver historial permitido" on role_history;
create policy "ver perfiles permitidos" on profiles for select using (can_see_profile(id));
create policy "editar mi perfil" on profiles for update
  using (id = auth.uid()) with check (id = auth.uid() and role = my_role());
create policy "admin gestiona perfiles" on profiles for all using (is_admin()) with check (is_admin());

create policy "ver historial permitido" on role_history for select using (can_see_profile(person_id));

-- catálogo: visible para quien inició sesión
create policy "ver currículums" on curriculums for select to authenticated
  using (active or is_admin() or coordinates_curriculum(id));
create policy "admin gestiona currículums" on curriculums for all using (is_admin()) with check (is_admin());
create policy "coordinador edita su currículum" on curriculums for update
  using (coordinates_curriculum(id)) with check (coordinates_curriculum(id));

create policy "ver coordinadores" on curriculum_coordinators for select
  using (is_admin() or coordinator_id = auth.uid());
create policy "admin asigna coordinadores" on curriculum_coordinators for all
  using (is_admin()) with check (is_admin());

create policy "ver temporadas" on seasons for select to authenticated using (true);
create policy "admin gestiona temporadas" on seasons for all using (is_admin()) with check (is_admin());

create policy "ver ciclos" on cycles for select to authenticated using (true);
create policy "gestionar ciclos" on cycles for all
  using (is_admin() or coordinates_curriculum(curriculum_id))
  with check (is_admin() or coordinates_curriculum(curriculum_id));

-- contenido
create policy "ver lecciones" on lessons for select using (can_see_lesson(cycle_id, number));
create policy "gestionar lecciones" on lessons for all
  using (is_admin() or coordinates_cycle(cycle_id))
  with check (is_admin() or coordinates_cycle(cycle_id));

create policy "ver recursos" on resources for select using (can_see_cycle_content(cycle_id));
create policy "gestionar recursos" on resources for all
  using (is_admin() or coordinates_cycle(cycle_id))
  with check (is_admin() or coordinates_cycle(cycle_id));

-- grupos: los abiertos a inscripción los ve cualquiera con sesión; el resto, quien participa
create policy "ver grupos" on groups for select to authenticated using (
  can_see_group(id)
  or (status = 'abierto' and exists (select 1 from seasons s where s.id = season_id and s.status in ('inscripciones', 'en_curso')))
);
create policy "gestionar grupos" on groups for all
  using (is_admin() or coordinates_cycle(cycle_id))
  with check (is_admin() or coordinates_cycle(cycle_id));

-- inscripciones
create policy "ver inscripciones" on enrollments for select
  using (person_id = auth.uid() or can_manage_group(group_id));
create policy "inscribir desde el grupo" on enrollments for insert with check (can_manage_group(group_id));
create policy "gestionar inscripciones" on enrollments for update
  using (can_manage_group(group_id)) with check (can_manage_group(group_id));
create policy "admin borra inscripciones" on enrollments for delete using (is_admin());

-- reuniones y asistencia
create policy "ver reuniones" on meetings for select using (can_see_group(group_id));
create policy "gestionar reuniones" on meetings for all
  using (can_manage_group(group_id)) with check (can_manage_group(group_id));

create policy "ver asistencia" on attendance for select using (
  exists (select 1 from enrollments e where e.id = enrollment_id and e.person_id = auth.uid())
  or exists (select 1 from meetings m where m.id = meeting_id and can_manage_group(m.group_id))
);
create policy "gestionar asistencia" on attendance for all
  using (exists (select 1 from meetings m where m.id = meeting_id and can_manage_group(m.group_id)))
  with check (exists (select 1 from meetings m where m.id = meeting_id and can_manage_group(m.group_id)));

-- seguimiento y auditoría
create policy "ver contactos del grupo" on contacts for select using (can_manage_group(group_id));
create policy "registrar contacto" on contacts for insert with check (
  can_manage_group(group_id)
  and contacted_by = auth.uid()
  and exists (select 1 from enrollments e where e.group_id = contacts.group_id and e.person_id = contacts.person_id)
);
create policy "admin ve la auditoría" on audit_log for select using (is_admin());

-- Funciones expuestas a la aplicación
revoke all on function enroll(uuid), enroll_person(uuid, uuid), confirm_enrollment(uuid, boolean),
  cancel_enrollment(uuid), save_attendance(uuid, date, int, uuid[], uuid[]), close_group(uuid),
  create_continuation(uuid, uuid), promote_user(uuid), assignable_people(app_role),
  enrollment_candidates(uuid), my_alerts() from public, anon;
grant execute on function enroll(uuid), enroll_person(uuid, uuid), confirm_enrollment(uuid, boolean),
  cancel_enrollment(uuid), save_attendance(uuid, date, int, uuid[], uuid[]), close_group(uuid),
  create_continuation(uuid, uuid), promote_user(uuid), assignable_people(app_role),
  enrollment_candidates(uuid), my_alerts() to authenticated;

commit;
