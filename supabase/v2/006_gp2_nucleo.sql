-- ============================================================================
-- 006 · GP 2.0: núcleo de dominio (Fase 1)
--
-- Una temporada anual de 36 posiciones, currículums versionados, inscripción curricular
-- única y continua, acreditación por unidades separada de la asistencia, sedes, y
-- direcciones y enlaces protegidos.
--
-- ES ADITIVA: no borra ni reescribe datos. Se puede ejecutar varias veces.
-- El sistema actual sigue funcionando igual (un disparador completa el currículum y la
-- versión de cada grupo a partir de su ciclo).
-- ============================================================================
begin;

-- ---------------------------------------------------------------------------
-- 1. Tipos
-- ---------------------------------------------------------------------------
do $$ begin create type program_category as enum ('comunidad', 'formacion', 'experiencia', 'recreacion');
exception when duplicate_object then null; end $$;
do $$ begin create type program_kind as enum ('curriculo', 'taller', 'comunidad', 'actividad');
exception when duplicate_object then null; end $$;
do $$ begin create type editorial_status as enum ('cargado', 'en_adaptacion', 'en_revision_pastoral', 'aprobado', 'publicado', 'archivado');
exception when duplicate_object then null; end $$;
do $$ begin create type ce_status as enum ('activo', 'pausado', 'completado', 'cancelado');
exception when duplicate_object then null; end $$;
do $$ begin create type completion_method as enum ('asistencia_validada', 'actividad', 'tutoria', 'evaluacion', 'recuperacion', 'manual');
exception when duplicate_object then null; end $$;
do $$ begin create type catchup_status as enum ('pendiente', 'en_curso', 'resuelto', 'cancelado');
exception when duplicate_object then null; end $$;

alter type attendance_status add value if not exists 'justificado';

-- ---------------------------------------------------------------------------
-- 2. Sedes
-- ---------------------------------------------------------------------------
create table if not exists campuses (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  kind text not null default 'presencial' check (kind in ('presencial', 'online')),
  country text check (country is null or country ~ '^[A-Z]{2}$'),
  city text,
  timezone text not null default 'America/Santiago',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Las 9 sedes de la plataforma anterior (editables desde administración)
insert into campuses (name, kind, country, city, timezone) values
  ('Virtual', 'online', null, null, 'America/Santiago'),
  ('Puente Alto', 'presencial', 'CL', 'Puente Alto', 'America/Santiago'),
  ('Santiago centro', 'presencial', 'CL', 'Santiago', 'America/Santiago'),
  ('Punta Arenas', 'presencial', 'CL', 'Punta Arenas', 'America/Punta_Arenas'),
  ('Montevideo', 'presencial', 'UY', 'Montevideo', 'America/Montevideo'),
  ('Maracaibo', 'presencial', 'VE', 'Maracaibo', 'America/Caracas'),
  ('Miami', 'presencial', 'US', 'Miami', 'America/New_York'),
  ('Katy', 'presencial', 'US', 'Katy', 'America/Chicago'),
  ('Concepción', 'presencial', 'CL', 'Concepción', 'America/Santiago')
on conflict (name) do nothing;

-- ---------------------------------------------------------------------------
-- 3. Catálogo: categoría, tipo, etapa de vida, duración
-- ---------------------------------------------------------------------------
alter table curriculums
  add column if not exists category program_category not null default 'formacion',
  add column if not exists kind program_kind not null default 'curriculo',
  add column if not exists life_stage text,
  add column if not exists duration_years int not null default 1 check (duration_years between 1 and 10),
  add column if not exists certifiable boolean not null default false,
  add column if not exists visibility text not null default 'publico' check (visibility in ('publico', 'privado'));

-- Clasificación inicial SOLO donde el nombre es inequívoco (deporte y salidas = recreación).
-- Todo lo demás queda como "formación" hasta que el administrador lo recategorice
-- (Fase 2); no se adivina nada sobre el contenido de los programas.
update curriculums set category = 'recreacion', kind = 'actividad'
 where category = 'formacion' and kind = 'curriculo'
   and (name ilike 'fútbol%' or name ilike 'futbol%' or name ilike 'senderismo%');
update curriculums set life_stage = case
    when name ilike 'tweens%' then 'tweens' when name ilike 'teens%' then 'teens'
    when name ilike '%jóvenes%' or name ilike '%jovenes%' then 'jovenes' when name ilike '%gold%' then 'gold'
    when name ilike '%matrimonio%' then 'matrimonios' when name ilike '%padres%' then 'padres'
    when name ilike 'mujeres' then 'mujeres' when name ilike 'hombres' then 'hombres' end
 where life_stage is null;

-- ---------------------------------------------------------------------------
-- 4. Versiones de currículum y flujo editorial
-- ---------------------------------------------------------------------------
create table if not exists curriculum_reviewers (
  curriculum_id uuid not null references curriculums(id) on delete cascade,
  reviewer_id uuid not null references profiles(id) on delete cascade,
  primary key (curriculum_id, reviewer_id)
);

create table if not exists curriculum_versions (
  id uuid primary key default gen_random_uuid(),
  curriculum_id uuid not null references curriculums(id) on delete cascade,
  version int not null check (version > 0),
  label text,
  status editorial_status not null default 'cargado',
  is_current boolean not null default false,
  effective_from date,
  effective_to date,
  source_note text,
  adapted_by uuid references profiles(id) on delete set null,
  reviewed_by uuid references profiles(id) on delete set null,
  approved_by uuid references profiles(id) on delete set null,
  approved_at timestamptz,
  published_at timestamptz,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (curriculum_id, version)
);
create unique index if not exists curriculum_versions_one_current on curriculum_versions (curriculum_id) where is_current;

-- Versión 1 de cada currículum: lo que ya existía en la plataforma anterior
insert into curriculum_versions (curriculum_id, version, label, status, is_current, published_at, source_note)
select c.id, 1, 'Plataforma anterior', 'publicado', true, now(), 'Estructura migrada de la plataforma anterior'
from curriculums c
where not exists (select 1 from curriculum_versions v where v.curriculum_id = c.id);

-- Todo currículum nuevo nace con su versión 1 vigente (los siguientes cambios pasan por el flujo editorial)
create or replace function curriculums_default_version() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into curriculum_versions (curriculum_id, version, label, status, is_current, published_at, source_note)
  values (new.id, 1, 'Versión inicial', 'publicado', true, now(), 'Creada junto con el programa');
  return null;
end $$;
drop trigger if exists trg_curriculums_default_version on curriculums;
create trigger trg_curriculums_default_version after insert on curriculums
for each row execute function curriculums_default_version();

-- ---------------------------------------------------------------------------
-- 5. Módulos (los antiguos "ciclos") y unidades (las lecciones)
-- ---------------------------------------------------------------------------
alter table cycles
  add column if not exists version_id uuid references curriculum_versions(id) on delete set null,
  add column if not exists stage_kind text not null default 'modulo' check (stage_kind in ('modulo', 'nivel', 'etapa', 'anio')),
  add column if not exists formative_year int not null default 1 check (formative_year >= 1);

update cycles cy set version_id = v.id
from curriculum_versions v
where v.curriculum_id = cy.curriculum_id and v.is_current and cy.version_id is null;

create or replace function cycles_default_version() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.version_id is null then
    select id into new.version_id from curriculum_versions where curriculum_id = new.curriculum_id and is_current;
  end if;
  return new;
end $$;
drop trigger if exists trg_cycles_default_version on cycles;
create trigger trg_cycles_default_version before insert on cycles for each row execute function cycles_default_version();

alter table lessons
  add column if not exists objective text,
  add column if not exists unit_kind text not null default 'leccion'
    check (unit_kind in ('leccion', 'practica', 'evaluacion', 'integracion', 'recuperacion'));

create table if not exists unit_prerequisites (
  unit_id uuid not null references lessons(id) on delete cascade,
  requires_unit_id uuid not null references lessons(id) on delete cascade,
  primary key (unit_id, requires_unit_id),
  check (unit_id <> requires_unit_id)
);

-- ---------------------------------------------------------------------------
-- 6. Plan pedagógico: 36 encuentros por año formativo
-- ---------------------------------------------------------------------------
create table if not exists annual_learning_plans (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references curriculum_versions(id) on delete cascade,
  formative_year int not null default 1 check (formative_year >= 1),
  title text,
  status editorial_status not null default 'cargado',
  created_at timestamptz not null default now(),
  unique (version_id, formative_year)
);

create table if not exists learning_plan_slots (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references annual_learning_plans(id) on delete cascade,
  position int not null check (position between 1 and 60),
  kind text not null default 'contenido'
    check (kind in ('contenido', 'integracion', 'practica', 'evaluacion', 'recuperacion', 'cierre', 'actividad')),
  title text,
  notes text,
  unique (plan_id, position)
);

create table if not exists learning_plan_slot_units (
  slot_id uuid not null references learning_plan_slots(id) on delete cascade,
  unit_id uuid not null references lessons(id) on delete cascade,
  primary key (slot_id, unit_id)
);

-- ---------------------------------------------------------------------------
-- 7. Temporada anual y calendario real
-- ---------------------------------------------------------------------------
alter table seasons
  add column if not exists year int,
  add column if not exists planned_weeks int not null default 36 check (planned_weeks between 1 and 60),
  add column if not exists kind text not null default 'anual' check (kind in ('anual', 'legado'));

-- Lo ya existente son temporadas del sistema anterior (3 por año): se conservan como histórico
update seasons set kind = 'legado' where kind = 'anual' and (end_date - start_date) < 200 and year is null;
update seasons set year = extract(year from start_date)::int where year is null;

create table if not exists season_weeks (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references seasons(id) on delete cascade,
  position int check (position is null or position >= 1),
  week_start date not null,
  is_break boolean not null default false,
  note text,
  unique (season_id, week_start)
);
create unique index if not exists season_weeks_position on season_weeks (season_id, position) where position is not null;

-- Genera las posiciones 1..planned_weeks a partir de una fecha, saltando las semanas de pausa.
-- Devuelve el inicio de la última semana, para ver si cabe antes del cierre de la temporada.
create or replace function generate_season_weeks(sid uuid, first_week date, breaks date[] default '{}')
returns date
language plpgsql security definer set search_path = public as $$
declare
  s record;
  monday date := first_week - (extract(isodow from first_week)::int - 1);
  brk date[];
  pos int := 0;
  last_start date;
begin
  if not is_admin() then raise exception 'Solo el administrador puede definir el calendario de una temporada.'; end if;
  select * into s from seasons where id = sid;
  if not found then raise exception 'La temporada no existe.'; end if;

  select coalesce(array_agg(b - (extract(isodow from b)::int - 1)), '{}') into brk from unnest(breaks) b;
  delete from season_weeks where season_id = sid;

  while pos < s.planned_weeks loop
    if monday = any(brk) then
      insert into season_weeks (season_id, position, week_start, is_break, note) values (sid, null, monday, true, 'Pausa');
    else
      pos := pos + 1;
      insert into season_weeks (season_id, position, week_start) values (sid, pos, monday);
      last_start := monday;
    end if;
    monday := monday + 7;
  end loop;
  return last_start;
end $$;

-- ---------------------------------------------------------------------------
-- 8. Grupos: currículum, versión, año formativo, sede, backup; ciclo opcional
-- ---------------------------------------------------------------------------
alter table groups
  add column if not exists curriculum_id uuid references curriculums(id) on delete restrict,
  add column if not exists version_id uuid references curriculum_versions(id) on delete set null,
  add column if not exists formative_year int not null default 1 check (formative_year >= 1),
  add column if not exists campus_id uuid references campuses(id) on delete set null,
  add column if not exists backup_leader_id uuid references profiles(id) on delete set null,
  add column if not exists timezone text not null default 'America/Santiago';

alter table groups alter column cycle_id drop not null;

-- Estas cargas masivas no deben llenar el registro de auditoría con miles de filas
alter table groups disable trigger trg_audit_groups;

update groups g
   set curriculum_id = cy.curriculum_id, version_id = cy.version_id, formative_year = cy.formative_year
  from cycles cy
 where cy.id = g.cycle_id and g.curriculum_id is null;

create index if not exists groups_curriculum_idx on groups (curriculum_id);
create index if not exists groups_backup_idx on groups (backup_leader_id);

do $$ begin
  alter table groups add constraint groups_curriculum_required check (curriculum_id is not null);
exception when duplicate_object then null; end $$;

-- Quien crea un grupo con ciclo (como hoy) no necesita indicar currículum ni versión
create or replace function groups_fill_curriculum() returns trigger
language plpgsql security definer set search_path = public as $$
declare cy record;
begin
  if new.cycle_id is not null and (tg_op = 'INSERT' or new.cycle_id is distinct from old.cycle_id) then
    select curriculum_id, version_id, formative_year into cy from cycles where id = new.cycle_id;
    new.curriculum_id := coalesce(new.curriculum_id, cy.curriculum_id);
    new.version_id := coalesce(new.version_id, cy.version_id);
    if tg_op = 'INSERT' and new.formative_year = 1 then new.formative_year := cy.formative_year; end if;
  end if;
  if new.version_id is null and new.curriculum_id is not null then
    select id into new.version_id from curriculum_versions where curriculum_id = new.curriculum_id and is_current;
  end if;
  return new;
end $$;
drop trigger if exists trg_groups_fill_curriculum on groups;
create trigger trg_groups_fill_curriculum before insert or update on groups
for each row execute function groups_fill_curriculum();

-- Direcciones y enlaces: solo para inscritos y responsables del grupo
create table if not exists group_private (
  group_id uuid primary key references groups(id) on delete cascade,
  address text,
  online_url text check (online_url is null or online_url ~ '^https://'),
  notes text,
  updated_at timestamptz not null default now()
);

insert into group_private (group_id, address)
select id, address from groups where address is not null
on conflict (group_id) do update set address = excluded.address;
update groups set address = null where address is not null;

-- Si algún proceso antiguo (formularios, importación) escribe la dirección en el grupo,
-- se redirige a la tabla protegida: la columna del grupo queda siempre vacía.
create or replace function groups_address_stash() returns trigger
language plpgsql as $$
begin
  if new.address is not null then
    perform set_config('gp.a' || replace(new.id::text, '-', '_'), new.address, true);
    new.address := null;
  end if;
  return new;
end $$;
create or replace function groups_address_apply() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  k text := 'gp.a' || replace(new.id::text, '-', '_');
  v text := current_setting('gp.a' || replace(new.id::text, '-', '_'), true);
begin
  if v is not null and v <> '' then
    insert into group_private (group_id, address) values (new.id, v)
    on conflict (group_id) do update set address = excluded.address, updated_at = now();
    perform set_config(k, '', true);
  end if;
  return null;
end $$;
drop trigger if exists trg_groups_address_stash on groups;
create trigger trg_groups_address_stash before insert or update on groups for each row execute function groups_address_stash();
drop trigger if exists trg_groups_address_apply on groups;
create trigger trg_groups_address_apply after insert or update on groups for each row execute function groups_address_apply();

alter table groups enable trigger trg_audit_groups;

-- El avance por inscripción ya no depende de que el grupo tenga ciclo
-- (si una migración posterior ya agregó columnas a esta vista, no se vuelve a definir)
do $do$ begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'enrollment_progress' and column_name = 'justified') then
    execute $v$
create or replace view enrollment_progress with (security_invoker = true) as
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
join curriculums cu on cu.id = g.curriculum_id
left join meetings m on m.group_id = e.group_id and m.held_on >= e.enrolled_at::date
left join attendance a on a.meeting_id = m.id and a.enrollment_id = e.id
group by e.id, cu.max_absences;
    $v$;
  end if;
end $do$;

-- ---------------------------------------------------------------------------
-- 9. Inscripción curricular continua
-- ---------------------------------------------------------------------------
create table if not exists curriculum_enrollments (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references profiles(id) on delete cascade,
  curriculum_id uuid not null references curriculums(id) on delete restrict,
  version_id uuid references curriculum_versions(id) on delete set null,
  status ce_status not null default 'activo',
  formative_year int not null default 1 check (formative_year >= 1),
  started_at date not null default current_date,
  paused_at date,
  completed_at date,
  pause_reason text,
  imported boolean not null default false,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
-- Una inscripción abierta (activa o pausada) por persona y currículum
create unique index if not exists ce_one_open on curriculum_enrollments (person_id, curriculum_id) where status in ('activo', 'pausado');
create index if not exists ce_person_idx on curriculum_enrollments (person_id);
create index if not exists ce_curriculum_status_idx on curriculum_enrollments (curriculum_id, status);

-- Las inscripciones a un grupo pasan a ser membresías de la inscripción curricular
alter table enrollments
  add column if not exists curriculum_enrollment_id uuid references curriculum_enrollments(id) on delete set null,
  add column if not exists left_reason text;
create index if not exists enrollments_ce_idx on enrollments (curriculum_enrollment_id);

-- Toda membresía nueva se enlaza (o crea) la inscripción curricular de esa persona.
-- Se llama "zz" para que corra después de la validación, que completa el currículum.
create or replace function enrollment_link_curriculum() returns trigger
language plpgsql security definer set search_path = public as $$
declare ce uuid; ce_state ce_status; gv record;
begin
  if new.curriculum_enrollment_id is not null then return new; end if;
  select id, status into ce, ce_state
    from curriculum_enrollments
   where person_id = new.person_id and curriculum_id = new.curriculum_id and status in ('activo', 'pausado')
   limit 1;
  if ce is null then
    select version_id, formative_year into gv from groups where id = new.group_id;
    insert into curriculum_enrollments (person_id, curriculum_id, version_id, status, formative_year, started_at, created_by, imported)
    values (new.person_id, new.curriculum_id, gv.version_id,
            case when new.status in ('preinscrito', 'en_curso') then 'activo'::ce_status else 'pausado'::ce_status end,
            coalesce(gv.formative_year, 1), new.enrolled_at::date, new.created_by,
            coalesce(current_setting('app.skip_checks', true), '') = 'on')
    returning id into ce;
  elsif ce_state = 'pausado' and new.status in ('preinscrito', 'en_curso') then
    update curriculum_enrollments set status = 'activo', paused_at = null, pause_reason = null where id = ce;
  end if;
  new.curriculum_enrollment_id := ce;
  return new;
end $$;
drop trigger if exists trg_zz_link_curriculum_enrollment on enrollments;
create trigger trg_zz_link_curriculum_enrollment before insert on enrollments
for each row execute function enrollment_link_curriculum();

-- Datos existentes: una inscripción curricular por persona y currículum.
-- Quien tiene un grupo vigente queda activo; el resto, pausado (no se presume que completó la ruta).
insert into curriculum_enrollments (person_id, curriculum_id, version_id, status, formative_year, started_at, paused_at, imported)
select e.person_id, e.curriculum_id,
       (array_agg(g.version_id order by e.enrolled_at desc))[1],
       case when bool_or(e.status in ('preinscrito', 'en_curso') and g.status in ('abierto', 'en_curso'))
            then 'activo'::ce_status else 'pausado'::ce_status end,
       1,
       min(e.enrolled_at)::date,
       case when bool_or(e.status in ('preinscrito', 'en_curso') and g.status in ('abierto', 'en_curso'))
            then null else max(coalesce(e.closed_at, e.enrolled_at))::date end,
       true
from enrollments e
join groups g on g.id = e.group_id
where e.status <> 'cancelado' and e.curriculum_enrollment_id is null
group by e.person_id, e.curriculum_id
on conflict do nothing;

update enrollments e set curriculum_enrollment_id = ce.id
from curriculum_enrollments ce
where e.curriculum_enrollment_id is null
  and ce.person_id = e.person_id and ce.curriculum_id = e.curriculum_id and ce.status in ('activo', 'pausado');

-- ---------------------------------------------------------------------------
-- 10. Acreditación (separada de la asistencia), créditos históricos y recuperación
-- ---------------------------------------------------------------------------
create table if not exists unit_completions (
  id uuid primary key default gen_random_uuid(),
  curriculum_enrollment_id uuid not null references curriculum_enrollments(id) on delete cascade,
  unit_id uuid not null references lessons(id) on delete restrict,
  method completion_method not null,
  validated_by uuid references profiles(id) on delete set null,
  completed_at timestamptz not null default now(),
  meeting_id uuid references meetings(id) on delete set null,
  evidence jsonb not null default '{}'::jsonb,
  unique (curriculum_enrollment_id, unit_id)
);
create index if not exists unit_completions_unit_idx on unit_completions (unit_id);

-- Lo que la plataforma anterior daba por aprobado: se conserva como crédito por revisar,
-- NO como unidades acreditadas (no existe una equivalencia demostrable con las unidades).
create table if not exists stage_credits (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references profiles(id) on delete cascade,
  stage_id uuid not null references cycles(id) on delete cascade,
  enrollment_id uuid references enrollments(id) on delete set null,
  source text not null default 'legado_asistencia',
  review_status text not null default 'por_revisar' check (review_status in ('por_revisar', 'validado', 'rechazado')),
  credited_at timestamptz,
  note text,
  unique (person_id, stage_id, source)
);

insert into stage_credits (person_id, stage_id, enrollment_id, credited_at, note)
select distinct on (e.person_id, g.cycle_id) e.person_id, g.cycle_id, e.id, coalesce(e.closed_at, e.enrolled_at),
       'Aprobado por asistencia en la plataforma anterior; requiere revisión'
from enrollments e join groups g on g.id = e.group_id
where e.status = 'aprobado' and g.cycle_id is not null
order by e.person_id, g.cycle_id, coalesce(e.closed_at, e.enrolled_at) desc
on conflict (person_id, stage_id, source) do nothing;

create table if not exists catchup_plans (
  id uuid primary key default gen_random_uuid(),
  curriculum_enrollment_id uuid not null references curriculum_enrollments(id) on delete cascade,
  pending_unit_id uuid references lessons(id) on delete set null,
  reason text,
  responsible_id uuid references profiles(id) on delete set null,
  modality modality,
  target_group_id uuid references groups(id) on delete set null,
  status catchup_status not null default 'pendiente',
  follow_up_on date,
  notes text,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index if not exists catchup_ce_idx on catchup_plans (curriculum_enrollment_id, status);

create table if not exists migration_mapping (
  source text not null,
  source_id text not null,
  target_table text not null,
  target_id uuid,
  status text not null default 'sugerido' check (status in ('sugerido', 'confirmado', 'rechazado')),
  note text,
  created_at timestamptz not null default now(),
  primary key (source, source_id, target_table)
);

-- ---------------------------------------------------------------------------
-- 11. Sesiones: posición en el plan, estado y quién facilitó
-- ---------------------------------------------------------------------------
alter table meetings
  add column if not exists slot_id uuid references learning_plan_slots(id) on delete set null,
  add column if not exists season_week int,
  add column if not exists status text not null default 'realizada' check (status in ('planificada', 'realizada', 'cancelada', 'reprogramada')),
  add column if not exists facilitator_id uuid references profiles(id) on delete set null,
  add column if not exists modality modality;

alter table attendance
  add column if not exists recorded_by uuid references profiles(id) on delete set null,
  add column if not exists recorded_at timestamptz not null default now();

-- ---------------------------------------------------------------------------
-- 12. Reglas de acceso: currículum del grupo, backup con permisos limitados
-- ---------------------------------------------------------------------------
create or replace function group_curriculum(gid uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select coalesce(g.curriculum_id, cy.curriculum_id)
  from groups g left join cycles cy on cy.id = g.cycle_id where g.id = gid
$$;

-- Administra el grupo: administrador, coordinador del currículum, monitor o líder (el backup no)
create or replace function can_manage_group(gid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_admin()
    or exists (
      select 1 from groups g join curriculum_coordinators cc on cc.curriculum_id = g.curriculum_id
      where g.id = gid and cc.coordinator_id = auth.uid()
    )
    or exists (
      select 1 from groups g where g.id = gid and (g.leader_id = auth.uid() or g.monitor_id = auth.uid())
    )
$$;

create or replace function managed_group_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select g.id from groups g where (select is_admin())
  union
  select g.id from groups g join curriculum_coordinators cc on cc.curriculum_id = g.curriculum_id
   where cc.coordinator_id = (select auth.uid())
  union
  select g.id from groups g where g.leader_id = (select auth.uid()) or g.monitor_id = (select auth.uid())
$$;

-- Puede dirigir reuniones y tomar asistencia: quien administra, o el backup del grupo
create or replace function session_group_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select managed_group_ids()
  union
  select g.id from groups g where g.backup_leader_id = (select auth.uid())
$$;

create or replace function can_run_sessions(gid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select can_manage_group(gid)
    or exists (select 1 from groups g where g.id = gid and g.backup_leader_id = auth.uid())
$$;

create or replace function visible_group_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select session_group_ids() union select enrolled_group_ids()
$$;

create or replace function visible_profile_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select (select auth.uid())
  union select g.leader_id from groups g where g.id in (select session_group_ids()) and g.leader_id is not null
  union select g.monitor_id from groups g where g.id in (select session_group_ids()) and g.monitor_id is not null
  union select g.backup_leader_id from groups g where g.id in (select session_group_ids()) and g.backup_leader_id is not null
  union select e.person_id from enrollments e where e.group_id in (select session_group_ids())
  union select g.leader_id from groups g where g.id in (select enrolled_group_ids()) and g.leader_id is not null
  union select g.monitor_id from groups g where g.id in (select enrolled_group_ids()) and g.monitor_id is not null
  union select g.backup_leader_id from groups g where g.id in (select enrolled_group_ids()) and g.backup_leader_id is not null
$$;

drop policy if exists "gestionar grupos" on groups;
create policy "gestionar grupos" on groups for all
  using ((select is_admin()) or coordinates_curriculum(curriculum_id))
  with check ((select is_admin()) or coordinates_curriculum(curriculum_id));

-- El backup ve las inscripciones y toma asistencia, pero no inscribe ni cancela
drop policy if exists "ver inscripciones" on enrollments;
create policy "ver inscripciones" on enrollments for select
  using (person_id = (select auth.uid()) or group_id in (select session_group_ids()));

drop policy if exists "ver reuniones" on meetings;
create policy "ver reuniones" on meetings for select using (group_id in (select visible_group_ids()));
drop policy if exists "gestionar reuniones" on meetings;
create policy "gestionar reuniones" on meetings for all
  using (group_id in (select session_group_ids())) with check (group_id in (select session_group_ids()));

drop policy if exists "ver asistencia" on attendance;
create policy "ver asistencia" on attendance for select using (
  enrollment_id in (select e.id from enrollments e where e.person_id = (select auth.uid()))
  or meeting_id in (select m.id from meetings m where m.group_id in (select session_group_ids()))
);
drop policy if exists "gestionar asistencia" on attendance;
create policy "gestionar asistencia" on attendance for all
  using (meeting_id in (select m.id from meetings m where m.group_id in (select session_group_ids())))
  with check (meeting_id in (select m.id from meetings m where m.group_id in (select session_group_ids())));

-- Pasar lista: el backup también puede; queda registrado quién facilitó
-- (si 008 ya la reemplazó por la versión con justificados, no se vuelve a crear la anterior: quedarían dos candidatas)
do $do$ begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'public' and p.proname = 'save_attendance' and p.pronargs = 7) then
    execute $fn$
create or replace function save_attendance(gid uuid, day date, lesson int, present uuid[], recovered uuid[])
returns uuid
language plpgsql security definer set search_path = public as $b$
declare
  mid uuid;
begin
  if not can_run_sessions(gid) then raise exception 'No tienes permiso para pasar lista en este grupo.'; end if;
  if day > current_date + 1 then raise exception 'No se puede pasar lista de una fecha futura.'; end if;

  insert into meetings (group_id, held_on, lesson_number, status, facilitator_id)
  values (gid, day, lesson, 'realizada', auth.uid())
  on conflict (group_id, held_on) do update
    set lesson_number = excluded.lesson_number, status = 'realizada', facilitator_id = excluded.facilitator_id
  returning id into mid;

  insert into attendance (meeting_id, enrollment_id, status, recorded_by, recorded_at)
  select mid, e.id,
         case when e.id = any(coalesce(recovered, '{}')) then 'recuperado'::attendance_status
              when e.id = any(coalesce(present, '{}')) then 'presente'::attendance_status
              else 'ausente'::attendance_status end,
         auth.uid(), now()
  from enrollments e
  where e.group_id = gid and e.status = 'en_curso'
  on conflict (meeting_id, enrollment_id) do update
    set status = excluded.status, recorded_by = excluded.recorded_by, recorded_at = excluded.recorded_at;

  update groups set status = 'en_curso' where id = gid and status = 'abierto';
  return mid;
end $b$;
    $fn$;
  end if;
end $do$;

-- Elegibilidad por perfil (audiencia y edad); la usan la membresía y la inscripción curricular
create or replace function eligibility_error(person uuid, cid uuid) returns text
language plpgsql stable security definer set search_path = public as $$
declare cu record; p record; years int;
begin
  select audience, age_min, age_max into cu from curriculums where id = cid;
  select gender, birth_date into p from profiles where id = person;
  if cu.audience in ('hombres', 'mujeres') then
    if p.gender is null then return 'Completa tu género en el perfil para inscribirte en este grupo.'; end if;
    if (cu.audience = 'hombres' and p.gender <> 'hombre') or (cu.audience = 'mujeres' and p.gender <> 'mujer') then
      return 'Este grupo no está disponible para tu perfil.';
    end if;
  end if;
  if cu.age_min is not null or cu.age_max is not null then
    if p.birth_date is null then return 'Completa tu fecha de nacimiento en el perfil para inscribirte en este grupo.'; end if;
    years := date_part('year', age(p.birth_date));
    if (cu.age_min is not null and years < cu.age_min) or (cu.age_max is not null and years > cu.age_max) then
      return 'Este grupo no está disponible para tu edad.';
    end if;
  end if;
  return null;
end $$;

create or replace function validate_enrollment() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v record;
  err text;
begin
  select g.season_id, g.capacity, coalesce(g.curriculum_id, cy.curriculum_id) as curriculum_id, cy.prerequisite_cycle_id
    into v
  from groups g left join cycles cy on cy.id = g.cycle_id
  where g.id = new.group_id;

  new.season_id := v.season_id;
  new.curriculum_id := v.curriculum_id;

  if coalesce(current_setting('app.skip_checks', true), '') = 'on' then return new; end if;

  if new.status in ('preinscrito', 'en_curso') then
    err := eligibility_error(new.person_id, v.curriculum_id);
    if err is not null then raise exception '%', err; end if;

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

-- ---------------------------------------------------------------------------
-- 13. Operaciones de la inscripción curricular
-- ---------------------------------------------------------------------------
create or replace function can_manage_enrollment(ce uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_admin()
    or exists (select 1 from curriculum_enrollments c where c.id = ce and coordinates_curriculum(c.curriculum_id))
    or exists (
      select 1 from enrollments e where e.curriculum_enrollment_id = ce and e.status in ('preinscrito', 'en_curso')
        and e.group_id in (select managed_group_ids())
    )
$$;

-- Me inscribo a un currículum (sin elegir grupo todavía). Si ya estoy, devuelve la misma inscripción.
create or replace function enroll_curriculum(cid uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  pr record; ce uuid; st ce_status; err text; v uuid;
begin
  if uid is null then raise exception 'Debes iniciar sesión.'; end if;
  if not exists (select 1 from curriculums where id = cid and active) then raise exception 'Ese programa no está disponible.'; end if;

  select terms_accepted_at, birth_date, guardian_name into pr from profiles where id = uid;
  if pr.terms_accepted_at is null then raise exception 'Acepta los términos para inscribirte.'; end if;
  if pr.birth_date is not null and age(pr.birth_date) < interval '18 years' and coalesce(pr.guardian_name, '') = '' then
    raise exception 'Se necesitan los datos de tu tutor para inscribirte.';
  end if;
  err := eligibility_error(uid, cid);
  if err is not null then raise exception '%', err; end if;

  select id, status into ce, st from curriculum_enrollments
   where person_id = uid and curriculum_id = cid and status in ('activo', 'pausado');
  if ce is not null then
    if st = 'pausado' then
      update curriculum_enrollments set status = 'activo', paused_at = null, pause_reason = null where id = ce;
    end if;
    return ce;
  end if;

  select id into v from curriculum_versions where curriculum_id = cid and is_current;
  insert into curriculum_enrollments (person_id, curriculum_id, version_id, created_by)
  values (uid, cid, v, uid) returning id into ce;
  return ce;
end $$;

create or replace function pause_curriculum_enrollment(ce uuid, reason text default null) returns void
language plpgsql security definer set search_path = public as $$
declare c record;
begin
  select * into c from curriculum_enrollments where id = ce;
  if not found then raise exception 'La inscripción no existe.'; end if;
  if c.person_id <> auth.uid() and not can_manage_enrollment(ce) then raise exception 'No tienes permiso para pausar esta inscripción.'; end if;
  if c.status <> 'activo' then raise exception 'Solo se puede pausar una inscripción activa.'; end if;

  update curriculum_enrollments set status = 'pausado', paused_at = current_date, pause_reason = reason where id = ce;
  update enrollments set status = 'cancelado', closed_at = now(), left_reason = 'pausa'
   where curriculum_enrollment_id = ce and status in ('preinscrito', 'en_curso');
end $$;

create or replace function resume_curriculum_enrollment(ce uuid) returns void
language plpgsql security definer set search_path = public as $$
declare c record;
begin
  select * into c from curriculum_enrollments where id = ce;
  if not found then raise exception 'La inscripción no existe.'; end if;
  if c.person_id <> auth.uid() and not can_manage_enrollment(ce) then raise exception 'No tienes permiso para reanudar esta inscripción.'; end if;
  if c.status <> 'pausado' then raise exception 'Solo se puede reanudar una inscripción pausada.'; end if;
  update curriculum_enrollments set status = 'activo', paused_at = null, pause_reason = null where id = ce;
end $$;

-- Cambio de grupo, líder, sede o modalidad: se cierra la membresía y se abre otra.
-- La inscripción curricular y el avance NO se tocan.
create or replace function change_group(ce uuid, new_gid uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare c record; g record; mid uuid;
begin
  select * into c from curriculum_enrollments where id = ce;
  if not found then raise exception 'La inscripción no existe.'; end if;
  if c.person_id <> auth.uid() and not can_manage_enrollment(ce) then raise exception 'No tienes permiso para cambiar este grupo.'; end if;
  if c.status <> 'activo' then raise exception 'Reanuda tu inscripción antes de elegir un grupo.'; end if;

  select g2.status, g2.curriculum_id, s.status as sstatus into g
  from groups g2 join seasons s on s.id = g2.season_id where g2.id = new_gid;
  if not found then raise exception 'El grupo no existe.'; end if;
  if g.curriculum_id <> c.curriculum_id then raise exception 'Ese grupo pertenece a otro programa.'; end if;
  if g.status = 'finalizado' or g.sstatus not in ('inscripciones', 'en_curso') then
    raise exception 'Este grupo no está recibiendo inscripciones.';
  end if;

  update enrollments set status = 'cancelado', closed_at = now(), left_reason = 'cambio_de_grupo'
   where curriculum_enrollment_id = ce and status in ('preinscrito', 'en_curso') and group_id <> new_gid;

  select id into mid from enrollments where person_id = c.person_id and group_id = new_gid;
  if mid is not null then
    update enrollments set status = 'en_curso', closed_at = null, left_reason = null, curriculum_enrollment_id = ce where id = mid;
  else
    insert into enrollments (person_id, group_id, status, created_by, curriculum_enrollment_id)
    values (c.person_id, new_gid, 'en_curso', auth.uid(), ce) returning id into mid;
  end if;
  return mid;
end $$;

-- ---------------------------------------------------------------------------
-- 14. Acreditación y progreso
-- ---------------------------------------------------------------------------
create or replace function record_unit_completion(ce uuid, uid_unit uuid, how completion_method default 'manual', proof jsonb default '{}', mtg uuid default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare c record; un record; missing int; cid uuid;
begin
  select * into c from curriculum_enrollments where id = ce;
  if not found then raise exception 'La inscripción no existe.'; end if;
  if not can_manage_enrollment(ce) then raise exception 'No tienes permiso para acreditar unidades de esta persona.'; end if;
  if c.status in ('cancelado') then raise exception 'La inscripción está cancelada.'; end if;

  select l.id, cy.curriculum_id, cy.version_id into un
  from lessons l join cycles cy on cy.id = l.cycle_id where l.id = uid_unit;
  if not found then raise exception 'La unidad no existe.'; end if;
  if un.curriculum_id <> c.curriculum_id or (c.version_id is not null and un.version_id is distinct from c.version_id) then
    raise exception 'Esa unidad no pertenece a la ruta de esta persona.';
  end if;

  select count(*) into missing
  from unit_prerequisites p
  where p.unit_id = uid_unit
    and not exists (select 1 from unit_completions uc where uc.curriculum_enrollment_id = ce and uc.unit_id = p.requires_unit_id);
  if missing > 0 then raise exception 'Faltan % unidades que son requisito de esta.', missing; end if;

  insert into unit_completions (curriculum_enrollment_id, unit_id, method, validated_by, evidence, meeting_id)
  values (ce, uid_unit, how, auth.uid(), coalesce(proof, '{}'), mtg)
  on conflict (curriculum_enrollment_id, unit_id) do nothing
  returning id into cid;
  if cid is null then
    select id into cid from unit_completions where curriculum_enrollment_id = ce and unit_id = uid_unit;
  end if;
  return cid;
end $$;

create or replace function revoke_unit_completion(ce uuid, uid_unit uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not (is_admin() or exists (select 1 from curriculum_enrollments c where c.id = ce and coordinates_curriculum(c.curriculum_id))) then
    raise exception 'Solo el administrador o el coordinador pueden retirar una acreditación.';
  end if;
  delete from unit_completions where curriculum_enrollment_id = ce and unit_id = uid_unit;
end $$;

-- Avance de una persona en su ruta. "Siguiente" = la primera unidad sin acreditar:
-- los huecos no se rellenan por haber aprobado una unidad posterior.
create or replace function curriculum_progress(ce uuid) returns table (
  units_total int, units_done int, pct numeric, next_unit_id uuid, next_unit_title text,
  last_unit_title text, stage_credits int
)
language plpgsql stable security definer set search_path = public as $$
declare c record;
begin
  select * into c from curriculum_enrollments where id = ce;
  if not found then raise exception 'La inscripción no existe.'; end if;
  if c.person_id <> auth.uid() and not can_manage_enrollment(ce) then raise exception 'No tienes permiso para ver este avance.'; end if;

  return query
  with units as (
    select l.id, l.title,
           row_number() over (order by cy.formative_year, cy.number, l.number) as seq
    from lessons l join cycles cy on cy.id = l.cycle_id
    where cy.curriculum_id = c.curriculum_id and (c.version_id is null or cy.version_id = c.version_id)
  ),
  done as (select u.id, u.seq, u.title, uc.completed_at
           from units u join unit_completions uc on uc.unit_id = u.id and uc.curriculum_enrollment_id = ce)
  select (select count(*) from units)::int,
         (select count(*) from done)::int,
         round(100.0 * (select count(*) from done) / nullif((select count(*) from units), 0), 1),
         (select u.id from units u where not exists (select 1 from done d where d.id = u.id) order by u.seq limit 1),
         (select u.title from units u where not exists (select 1 from done d where d.id = u.id) order by u.seq limit 1),
         (select d.title from done d order by d.completed_at desc limit 1),
         (select count(*) from stage_credits s join cycles cy on cy.id = s.stage_id
           where s.person_id = c.person_id and cy.curriculum_id = c.curriculum_id and s.review_status <> 'rechazado')::int;
end $$;

-- Grupos de la misma ruta que hoy reciben gente. NO promete que haya uno que calce con la unidad pendiente.
create or replace function compatible_groups(ce uuid) returns table (
  group_id uuid, name text, modality modality, campus text, weekday smallint,
  start_time time, end_time time, capacity_left int, leader_name text
)
language plpgsql stable security definer set search_path = public as $$
declare c record;
begin
  select * into c from curriculum_enrollments where id = ce;
  if not found then raise exception 'La inscripción no existe.'; end if;
  if c.person_id <> auth.uid() and not can_manage_enrollment(ce) then raise exception 'No tienes permiso para ver estas ofertas.'; end if;

  return query
  select g.id, g.name, g.modality, ca.name, g.weekday, g.start_time, g.end_time,
         g.capacity - group_enrolled_count(g.id),
         (select p.full_name from profiles p where p.id = g.leader_id)
  from groups g
    join seasons s on s.id = g.season_id
    left join campuses ca on ca.id = g.campus_id
  where g.curriculum_id = c.curriculum_id
    and g.status in ('abierto', 'en_curso')
    and s.status in ('inscripciones', 'en_curso')
    and (c.version_id is null or g.version_id is null or g.version_id = c.version_id)
    and group_enrolled_count(g.id) < g.capacity
  order by g.modality, g.weekday, g.start_time;
end $$;

create or replace function request_catchup(ce uuid, note text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare c record; nxt uuid; pid uuid;
begin
  select * into c from curriculum_enrollments where id = ce;
  if not found then raise exception 'La inscripción no existe.'; end if;
  if c.person_id <> auth.uid() and not can_manage_enrollment(ce) then raise exception 'No tienes permiso para pedir recuperación.'; end if;

  select next_unit_id into nxt from curriculum_progress(ce);
  select id into pid from catchup_plans
   where curriculum_enrollment_id = ce and status in ('pendiente', 'en_curso') and pending_unit_id is not distinct from nxt;
  if pid is not null then return pid; end if;

  insert into catchup_plans (curriculum_enrollment_id, pending_unit_id, reason, notes, created_by, follow_up_on)
  values (ce, nxt, 'Sin grupo compatible o desfase con el grupo', note, auth.uid(), current_date + 7)
  returning id into pid;
  return pid;
end $$;

-- ---------------------------------------------------------------------------
-- 15. Plan de 36 encuentros: huecos y cobertura
-- ---------------------------------------------------------------------------
create or replace function plan_coverage(pid uuid) returns table (problema text, detalle text)
language plpgsql stable security definer set search_path = public as $$
declare p record; weeks int;
begin
  select pl.*, v.curriculum_id into p from annual_learning_plans pl join curriculum_versions v on v.id = pl.version_id where pl.id = pid;
  if not found then raise exception 'El plan no existe.'; end if;
  if not (is_admin() or coordinates_curriculum(p.curriculum_id) or exists (
    select 1 from curriculum_reviewers r where r.curriculum_id = p.curriculum_id and r.reviewer_id = auth.uid())) then
    raise exception 'No tienes permiso para revisar este plan.';
  end if;
  weeks := 36;

  return query
  select 'semana_vacia'::text, 'Semana ' || gs.n
  from generate_series(1, weeks) gs(n)
  left join learning_plan_slots s on s.plan_id = pid and s.position = gs.n
  where s.id is null
  union all
  select 'semana_sin_contenido', 'Semana ' || s.position || ' (' || s.kind || ')'
  from learning_plan_slots s
  where s.plan_id = pid and s.kind = 'contenido'
    and not exists (select 1 from learning_plan_slot_units u where u.slot_id = s.id)
  union all
  select 'unidad_sin_cobertura', 'Unidad ' || l.number || ' · ' || l.title
  from lessons l join cycles cy on cy.id = l.cycle_id
  where cy.version_id = p.version_id and cy.formative_year = p.formative_year
    and not exists (
      select 1 from learning_plan_slot_units u join learning_plan_slots s on s.id = u.slot_id
      where s.plan_id = pid and u.unit_id = l.id)
  order by 1, 2;
end $$;

-- ---------------------------------------------------------------------------
-- 16. Flujo editorial: cargado → en_adaptacion → en_revision_pastoral → aprobado → publicado → archivado
-- ---------------------------------------------------------------------------
create or replace function is_curriculum_reviewer(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_admin() or exists (select 1 from curriculum_reviewers r where r.curriculum_id = cid and r.reviewer_id = auth.uid())
$$;

create or replace function guard_version_status() returns trigger
language plpgsql as $$
begin
  if new.status is distinct from old.status and coalesce(current_setting('app.version_workflow', true), '') <> 'on' then
    raise exception 'El estado de una versión solo cambia con el flujo de aprobación.';
  end if;
  return new;
end $$;
drop trigger if exists trg_guard_version_status on curriculum_versions;
create trigger trg_guard_version_status before update on curriculum_versions for each row execute function guard_version_status();

create or replace function advance_curriculum_version(vid uuid, to_status editorial_status) returns editorial_status
language plpgsql security definer set search_path = public as $$
declare v record; ok boolean;
begin
  select * into v from curriculum_versions where id = vid;
  if not found then raise exception 'La versión no existe.'; end if;

  ok := (v.status, to_status) in (
    ('cargado', 'en_adaptacion'), ('en_adaptacion', 'en_revision_pastoral'), ('en_revision_pastoral', 'en_adaptacion'),
    ('en_revision_pastoral', 'aprobado'), ('aprobado', 'publicado'), ('publicado', 'archivado'), ('aprobado', 'en_adaptacion'));
  if not ok then raise exception 'No se puede pasar de % a %.', v.status, to_status; end if;

  if to_status in ('aprobado', 'publicado') then
    if not is_curriculum_reviewer(v.curriculum_id) then raise exception 'Solo un revisor o el administrador puede aprobar y publicar.'; end if;
  elsif not (is_admin() or coordinates_curriculum(v.curriculum_id) or is_curriculum_reviewer(v.curriculum_id)) then
    raise exception 'No tienes permiso para cambiar esta versión.';
  end if;

  perform set_config('app.version_workflow', 'on', true);
  if to_status = 'publicado' then
    update curriculum_versions set is_current = false where curriculum_id = v.curriculum_id and is_current and id <> vid;
    update curriculum_versions set status = 'publicado', is_current = true, published_at = now(), effective_from = coalesce(effective_from, current_date) where id = vid;
  elsif to_status = 'aprobado' then
    update curriculum_versions set status = 'aprobado', approved_by = auth.uid(), approved_at = now() where id = vid;
  elsif to_status = 'en_revision_pastoral' then
    update curriculum_versions set status = to_status, adapted_by = auth.uid() where id = vid;
  else
    update curriculum_versions set status = to_status, is_current = case when to_status = 'archivado' then false else is_current end where id = vid;
  end if;
  perform set_config('app.version_workflow', 'off', true);
  return to_status;
end $$;

-- ---------------------------------------------------------------------------
-- 17. Vistas y panel actualizados (el grupo ya no depende del ciclo)
-- ---------------------------------------------------------------------------
create or replace view group_overview with (security_invoker = true) as
select
  g.id, g.name, g.status,
  g.season_id, s.name as season_name, s.status as season_status,
  g.cycle_id, cy.number as cycle_number, cy.title as cycle_title,
  cu.id as curriculum_id, cu.name as curriculum_name,
  g.leader_id, (select p.full_name from profiles p where p.id = g.leader_id) as leader_name,
  g.monitor_id, (select p.full_name from profiles p where p.id = g.monitor_id) as monitor_name,
  g.weekday, g.start_time, g.end_time, g.modality,
  -- la dirección solo la ven los inscritos y los responsables del grupo
  (select case when g.id in (select managed_group_ids()) or g.id in (select enrolled_group_ids()) or g.id in (select session_group_ids())
               then gp.address end
     from group_private gp where gp.group_id = g.id) as address,
  g.capacity, g.continues_from,
  group_enrolled_count(g.id) as enrolled,
  g.created_at,
  g.version_id, g.formative_year, g.campus_id, ca.name as campus_name,
  g.backup_leader_id, (select p.full_name from profiles p where p.id = g.backup_leader_id) as backup_leader_name
from groups g
join seasons s on s.id = g.season_id
join curriculums cu on cu.id = g.curriculum_id
left join cycles cy on cy.id = g.cycle_id
left join campuses ca on ca.id = g.campus_id;

create or replace function panel_curriculums() returns table (
  curriculum_id uuid, nombre text, activo boolean,
  grupos_activos int, personas_activas int, aprobados int, no_completaron int, asistencia_4s numeric
)
language sql stable set search_path = public as $$
  with rec as (
    select g.curriculum_id,
           count(*) filter (where a.status in ('presente', 'recuperado')) as ok,
           count(*) as total
    from attendance a
      join meetings m on m.id = a.meeting_id
      join groups g on g.id = m.group_id
    where m.held_on >= current_date - 28 and m.held_on <= current_date
    group by 1
  ),
  res as (
    select g.curriculum_id,
           count(distinct g.id) filter (where g.status in ('abierto', 'en_curso')) as grupos,
           count(distinct e.person_id) filter (where e.status = 'en_curso' and g.status in ('abierto', 'en_curso')) as personas,
           count(*) filter (where e.status = 'aprobado') as aprobados,
           count(*) filter (where e.status = 'no_completo') as no_completaron
    from groups g
      left join enrollments e on e.group_id = g.id
    group by 1
  )
  select cu.id, cu.name, cu.active,
         coalesce(res.grupos, 0)::int, coalesce(res.personas, 0)::int,
         coalesce(res.aprobados, 0)::int, coalesce(res.no_completaron, 0)::int,
         round(100.0 * rec.ok / nullif(rec.total, 0), 1)
  from curriculums cu
    left join res on res.curriculum_id = cu.id
    left join rec on rec.curriculum_id = cu.id
  order by coalesce(res.personas, 0) desc, cu.name
$$;

-- ---------------------------------------------------------------------------
-- 18. Seguridad: acceso por fila de las tablas nuevas
-- ---------------------------------------------------------------------------
alter table campuses enable row level security;
alter table curriculum_reviewers enable row level security;
alter table curriculum_versions enable row level security;
alter table unit_prerequisites enable row level security;
alter table annual_learning_plans enable row level security;
alter table learning_plan_slots enable row level security;
alter table learning_plan_slot_units enable row level security;
alter table season_weeks enable row level security;
alter table group_private enable row level security;
alter table curriculum_enrollments enable row level security;
alter table unit_completions enable row level security;
alter table stage_credits enable row level security;
alter table catchup_plans enable row level security;
alter table migration_mapping enable row level security;

drop policy if exists "ver sedes" on campuses;
create policy "ver sedes" on campuses for select to authenticated using (true);
drop policy if exists "admin gestiona sedes" on campuses;
create policy "admin gestiona sedes" on campuses for all using ((select is_admin())) with check ((select is_admin()));

drop policy if exists "ver revisores" on curriculum_reviewers;
create policy "ver revisores" on curriculum_reviewers for select using ((select is_admin()) or reviewer_id = (select auth.uid()) or coordinates_curriculum(curriculum_id));
drop policy if exists "admin gestiona revisores" on curriculum_reviewers;
create policy "admin gestiona revisores" on curriculum_reviewers for all using ((select is_admin())) with check ((select is_admin()));

drop policy if exists "ver versiones" on curriculum_versions;
create policy "ver versiones" on curriculum_versions for select using (
  status = 'publicado' or (select is_admin()) or coordinates_curriculum(curriculum_id) or is_curriculum_reviewer(curriculum_id));
drop policy if exists "crear versiones" on curriculum_versions;
create policy "crear versiones" on curriculum_versions for insert
  with check ((select is_admin()) or coordinates_curriculum(curriculum_id));
drop policy if exists "editar versiones" on curriculum_versions;
create policy "editar versiones" on curriculum_versions for update
  using ((select is_admin()) or coordinates_curriculum(curriculum_id)) with check ((select is_admin()) or coordinates_curriculum(curriculum_id));

drop policy if exists "ver requisitos" on unit_prerequisites;
create policy "ver requisitos" on unit_prerequisites for select to authenticated using (true);
drop policy if exists "gestionar requisitos" on unit_prerequisites;
create policy "gestionar requisitos" on unit_prerequisites for all
  using ((select is_admin()) or exists (select 1 from lessons l where l.id = unit_id and coordinates_cycle(l.cycle_id)))
  with check ((select is_admin()) or exists (select 1 from lessons l where l.id = unit_id and coordinates_cycle(l.cycle_id)));

drop policy if exists "ver planes" on annual_learning_plans;
create policy "ver planes" on annual_learning_plans for select using (version_id in (select id from curriculum_versions));
drop policy if exists "gestionar planes" on annual_learning_plans;
create policy "gestionar planes" on annual_learning_plans for all
  using (exists (select 1 from curriculum_versions v where v.id = version_id and ((select is_admin()) or coordinates_curriculum(v.curriculum_id))))
  with check (exists (select 1 from curriculum_versions v where v.id = version_id and ((select is_admin()) or coordinates_curriculum(v.curriculum_id))));

drop policy if exists "ver posiciones" on learning_plan_slots;
create policy "ver posiciones" on learning_plan_slots for select using (plan_id in (select id from annual_learning_plans));
drop policy if exists "gestionar posiciones" on learning_plan_slots;
create policy "gestionar posiciones" on learning_plan_slots for all
  using (plan_id in (select p.id from annual_learning_plans p join curriculum_versions v on v.id = p.version_id
                     where (select is_admin()) or coordinates_curriculum(v.curriculum_id)))
  with check (plan_id in (select p.id from annual_learning_plans p join curriculum_versions v on v.id = p.version_id
                     where (select is_admin()) or coordinates_curriculum(v.curriculum_id)));

drop policy if exists "ver unidades de posiciones" on learning_plan_slot_units;
create policy "ver unidades de posiciones" on learning_plan_slot_units for select using (slot_id in (select id from learning_plan_slots));
drop policy if exists "gestionar unidades de posiciones" on learning_plan_slot_units;
create policy "gestionar unidades de posiciones" on learning_plan_slot_units for all
  using (slot_id in (select s.id from learning_plan_slots s))
  with check (slot_id in (select s.id from learning_plan_slots s));

drop policy if exists "ver semanas" on season_weeks;
create policy "ver semanas" on season_weeks for select to authenticated using (true);
drop policy if exists "admin gestiona semanas" on season_weeks;
create policy "admin gestiona semanas" on season_weeks for all using ((select is_admin())) with check ((select is_admin()));

drop policy if exists "ver datos privados del grupo" on group_private;
create policy "ver datos privados del grupo" on group_private for select using (group_id in (select visible_group_ids()));
drop policy if exists "gestionar datos privados del grupo" on group_private;
create policy "gestionar datos privados del grupo" on group_private for all
  using (group_id in (select managed_group_ids())) with check (group_id in (select managed_group_ids()));

drop policy if exists "ver inscripciones curriculares" on curriculum_enrollments;
create policy "ver inscripciones curriculares" on curriculum_enrollments for select using (
  person_id = (select auth.uid()) or (select is_admin()) or coordinates_curriculum(curriculum_id)
  or id in (select e.curriculum_enrollment_id from enrollments e where e.group_id in (select managed_group_ids())));
drop policy if exists "admin gestiona inscripciones curriculares" on curriculum_enrollments;
create policy "admin gestiona inscripciones curriculares" on curriculum_enrollments for all
  using ((select is_admin())) with check ((select is_admin()));

drop policy if exists "ver acreditaciones" on unit_completions;
create policy "ver acreditaciones" on unit_completions for select
  using (curriculum_enrollment_id in (select id from curriculum_enrollments));
drop policy if exists "admin gestiona acreditaciones" on unit_completions;
create policy "admin gestiona acreditaciones" on unit_completions for all
  using ((select is_admin())) with check ((select is_admin()));

drop policy if exists "ver créditos históricos" on stage_credits;
create policy "ver créditos históricos" on stage_credits for select
  using (person_id = (select auth.uid()) or (select is_admin()) or person_id in (select visible_profile_ids()));
drop policy if exists "admin gestiona créditos históricos" on stage_credits;
create policy "admin gestiona créditos históricos" on stage_credits for all
  using ((select is_admin())) with check ((select is_admin()));

drop policy if exists "ver recuperaciones" on catchup_plans;
create policy "ver recuperaciones" on catchup_plans for select
  using (curriculum_enrollment_id in (select id from curriculum_enrollments));
drop policy if exists "gestionar recuperaciones" on catchup_plans;
create policy "gestionar recuperaciones" on catchup_plans for update
  using (can_manage_enrollment(curriculum_enrollment_id)) with check (can_manage_enrollment(curriculum_enrollment_id));

drop policy if exists "admin ve la correspondencia" on migration_mapping;
create policy "admin ve la correspondencia" on migration_mapping for all
  using ((select is_admin())) with check ((select is_admin()));

-- Auditoría de los cambios sensibles
drop trigger if exists trg_audit_unit_completions on unit_completions;
create trigger trg_audit_unit_completions after insert or delete on unit_completions for each row execute function audit_trigger();
drop trigger if exists trg_audit_versions on curriculum_versions;
create trigger trg_audit_versions after update of status on curriculum_versions
for each row when (old.status is distinct from new.status) execute function audit_trigger();
drop trigger if exists trg_audit_ce on curriculum_enrollments;
create trigger trg_audit_ce after update of status on curriculum_enrollments
for each row when (old.status is distinct from new.status) execute function audit_trigger();
drop trigger if exists trg_audit_catchup on catchup_plans;
create trigger trg_audit_catchup after insert or update on catchup_plans for each row execute function audit_trigger();

-- Funciones expuestas a la aplicación
revoke all on function generate_season_weeks(uuid, date, date[]), enroll_curriculum(uuid),
  pause_curriculum_enrollment(uuid, text), resume_curriculum_enrollment(uuid), change_group(uuid, uuid),
  record_unit_completion(uuid, uuid, completion_method, jsonb, uuid), revoke_unit_completion(uuid, uuid),
  curriculum_progress(uuid), compatible_groups(uuid), request_catchup(uuid, text), plan_coverage(uuid),
  advance_curriculum_version(uuid, editorial_status) from public, anon;
grant execute on function generate_season_weeks(uuid, date, date[]), enroll_curriculum(uuid),
  pause_curriculum_enrollment(uuid, text), resume_curriculum_enrollment(uuid), change_group(uuid, uuid),
  record_unit_completion(uuid, uuid, completion_method, jsonb, uuid), revoke_unit_completion(uuid, uuid),
  curriculum_progress(uuid), compatible_groups(uuid), request_catchup(uuid, text), plan_coverage(uuid),
  advance_curriculum_version(uuid, editorial_status) to authenticated;

notify pgrst, 'reload schema';
commit;
