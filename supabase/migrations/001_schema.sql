-- Grupos Pequeños ARM Global — esquema inicial
-- Jerarquía: admin > coordinador (currículum) > monitor (grupos) > líder (<=15 alumnos) > alumno

create type app_role as enum ('admin', 'coordinador', 'monitor', 'lider', 'alumno');

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  role app_role not null default 'alumno',
  created_at timestamptz not null default now()
);

create table curriculums (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  coordinator_id uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table groups (
  id uuid primary key default gen_random_uuid(),
  curriculum_id uuid not null references curriculums(id) on delete cascade,
  name text not null,
  monitor_id uuid references profiles(id) on delete set null,
  leader_id uuid references profiles(id) on delete set null,
  meeting_day text,
  meeting_time text,
  location text,
  max_members int not null default 15,
  created_at timestamptz not null default now()
);

create table group_members (
  group_id uuid not null references groups(id) on delete cascade,
  student_id uuid not null references profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (group_id, student_id)
);

create table sessions (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id) on delete cascade,
  held_on date not null,
  lesson_number int,
  created_at timestamptz not null default now()
);

create table attendance (
  session_id uuid not null references sessions(id) on delete cascade,
  student_id uuid not null references profiles(id) on delete cascade,
  present boolean not null default false,
  primary key (session_id, student_id)
);

create index on groups (curriculum_id);
create index on groups (monitor_id);
create index on groups (leader_id);
create index on group_members (student_id);
create index on sessions (group_id);

-- Máximo de alumnos por grupo (15 por defecto)
create or replace function enforce_group_capacity() returns trigger
language plpgsql as $$
begin
  if (select count(*) from group_members where group_id = new.group_id)
     >= (select max_members from groups where id = new.group_id) then
    raise exception 'El grupo ya alcanzó su máximo de alumnos';
  end if;
  return new;
end $$;

create trigger trg_group_capacity before insert on group_members
for each row execute function enforce_group_capacity();

-- Al registrarse un usuario nuevo se crea su perfil como alumno
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''));
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
for each row execute function handle_new_user();

-- Funciones auxiliares para RLS
create or replace function my_role() returns app_role
language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid()
$$;

create or replace function can_see_group(gid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select
    my_role() = 'admin'
    or exists (
      select 1 from groups g
      left join curriculums c on c.id = g.curriculum_id
      where g.id = gid
        and (c.coordinator_id = auth.uid()
          or g.monitor_id = auth.uid()
          or g.leader_id = auth.uid())
    )
    or exists (select 1 from group_members m where m.group_id = gid and m.student_id = auth.uid())
$$;

create or replace function can_manage_group(gid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select
    my_role() = 'admin'
    or exists (
      select 1 from groups g
      left join curriculums c on c.id = g.curriculum_id
      where g.id = gid
        and (c.coordinator_id = auth.uid()
          or g.monitor_id = auth.uid()
          or g.leader_id = auth.uid())
    )
$$;

create or replace function can_see_profile(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select
    pid = auth.uid()
    or my_role() = 'admin'
    or exists (
      select 1 from groups g
      where (g.leader_id = pid or g.monitor_id = pid)
        and can_see_group(g.id)
    )
    or exists (
      select 1 from group_members m
      where m.student_id = pid and can_manage_group(m.group_id)
    )
$$;

alter table profiles enable row level security;
alter table curriculums enable row level security;
alter table groups enable row level security;
alter table group_members enable row level security;
alter table sessions enable row level security;
alter table attendance enable row level security;

-- profiles
create policy "ver perfiles permitidos" on profiles for select using (can_see_profile(id));
create policy "editar mi perfil" on profiles for update using (id = auth.uid())
  with check (id = auth.uid() and role = (select role from profiles where id = auth.uid()));
create policy "admin gestiona perfiles" on profiles for all using (my_role() = 'admin');

-- curriculums
create policy "ver currículums" on curriculums for select using (
  my_role() = 'admin' or coordinator_id = auth.uid()
  or exists (select 1 from groups g where g.curriculum_id = curriculums.id and can_see_group(g.id))
);
create policy "admin gestiona currículums" on curriculums for all using (my_role() = 'admin');
create policy "coordinador edita su currículum" on curriculums for update using (coordinator_id = auth.uid());

-- groups
create policy "ver grupos" on groups for select using (can_see_group(id));
create policy "gestionar grupos" on groups for all using (
  my_role() = 'admin'
  or exists (select 1 from curriculums c where c.id = groups.curriculum_id and c.coordinator_id = auth.uid())
);

-- group_members
create policy "ver integrantes" on group_members for select using (
  can_manage_group(group_id) or student_id = auth.uid()
);
create policy "gestionar integrantes" on group_members for all using (can_manage_group(group_id));

-- sessions
create policy "ver sesiones" on sessions for select using (can_see_group(group_id));
create policy "gestionar sesiones" on sessions for all using (can_manage_group(group_id));

-- attendance
create policy "ver asistencia" on attendance for select using (
  student_id = auth.uid()
  or exists (select 1 from sessions s where s.id = attendance.session_id and can_manage_group(s.group_id))
);
create policy "gestionar asistencia" on attendance for all using (
  exists (select 1 from sessions s where s.id = attendance.session_id and can_manage_group(s.group_id))
);
