-- Seguimiento: registro de contactos y alertas calculadas

create table contacts (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references profiles(id) on delete cascade,
  group_id uuid not null references groups(id) on delete cascade,
  contacted_by uuid references profiles(id) on delete set null,
  kind text not null check (kind in ('llamada', 'mensaje', 'visita')),
  note text,
  created_at timestamptz not null default now()
);
create index on contacts (student_id, group_id);

alter table contacts enable row level security;

create policy "ver contactos del grupo" on contacts for select using (can_manage_group(group_id));
create policy "registrar contacto" on contacts for insert with check (
  can_manage_group(group_id)
  and contacted_by = auth.uid()
  and exists (select 1 from group_members m where m.group_id = contacts.group_id and m.student_id = contacts.student_id)
);

-- Alertas para quien gestiona. Corre con los permisos de quien la llama (RLS),
-- así cada rol ve solo las alertas de su alcance.
create or replace function my_alerts()
returns table (
  kind text,
  severity int,
  group_id uuid,
  group_name text,
  student_id uuid,
  student_name text,
  detail text,
  since date
)
language sql stable set search_path = public as $$
with ranked as (
  select s.id, s.group_id, s.held_on,
         row_number() over (partition by s.group_id order by s.held_on desc) as rn
  from sessions s
),
recent2 as (
  select r.group_id, a.student_id, min(r.held_on) as since,
         count(*) as n, count(*) filter (where not a.present) as missed
  from ranked r
  join attendance a on a.session_id = r.id
  where r.rn <= 2
  group by r.group_id, a.student_id
),
recent4 as (
  select r.group_id,
         avg(case when a.present then 1.0 else 0.0 end) as pct,
         count(distinct r.id) as n_sessions
  from ranked r
  join attendance a on a.session_id = r.id
  where r.rn <= 4
  group by r.group_id
),
last_session as (
  select group_id, max(held_on) as last_on from sessions group by group_id
),
alerts as (
  -- Faltó las dos últimas reuniones y nadie lo ha contactado desde entonces
  select 'ausente'::text as kind, 3 as severity, g.id as group_id, g.name as group_name,
         p.id as student_id, p.full_name as student_name,
         'Faltó las últimas 2 reuniones'::text as detail, r2.since
  from recent2 r2
  join groups g on g.id = r2.group_id
  join group_members gm on gm.group_id = g.id and gm.student_id = r2.student_id
  join profiles p on p.id = r2.student_id
  where r2.n = 2 and r2.missed = 2
    and not exists (
      select 1 from contacts c
      where c.student_id = p.id and c.group_id = g.id and c.created_at::date >= r2.since
    )

  union all
  -- Se unió hace poco y todavía nadie lo contacta
  select 'nuevo', 2, g.id, g.name, p.id, p.full_name,
         'Se unió hace poco y aún no tiene contacto', gm.joined_at::date
  from group_members gm
  join groups g on g.id = gm.group_id
  join profiles p on p.id = gm.student_id
  where gm.joined_at > now() - interval '21 days'
    and not exists (
      select 1 from contacts c where c.student_id = p.id and c.group_id = g.id
    )

  union all
  -- Asistencia baja en las últimas reuniones
  select 'asistencia_baja', 3, g.id, g.name, null::uuid, null::text,
         'Asistencia de las últimas reuniones: ' || round(100 * r4.pct) || '%', ls.last_on
  from recent4 r4
  join groups g on g.id = r4.group_id
  left join last_session ls on ls.group_id = g.id
  where r4.n_sessions >= 2 and r4.pct < 0.6

  union all
  -- Hace más de 14 días que no se pasa lista
  select 'sin_reunion', 2, g.id, g.name, null::uuid, null::text,
         case when ls.last_on is null then 'Todavía no se ha pasado lista'
              else 'No se pasa lista hace ' || (current_date - ls.last_on) || ' días' end,
         coalesce(ls.last_on, g.created_at::date)
  from groups g
  left join last_session ls on ls.group_id = g.id
  where coalesce(ls.last_on, g.created_at::date) < current_date - 14
    and exists (select 1 from group_members m where m.group_id = g.id)

  union all
  -- Grupos sin líder o sin monitor (solo para quien los asigna)
  select 'sin_lider', 2, g.id, g.name, null::uuid, null::text,
         'El grupo no tiene líder asignado', g.created_at::date
  from groups g
  where g.leader_id is null and my_role() in ('admin', 'coordinador')

  union all
  select 'sin_monitor', 1, g.id, g.name, null::uuid, null::text,
         'El grupo no tiene monitor asignado', g.created_at::date
  from groups g
  where g.monitor_id is null and my_role() in ('admin', 'coordinador')
)
select a.kind, a.severity, a.group_id, a.group_name, a.student_id, a.student_name, a.detail, a.since
from alerts a
where my_role() in ('admin', 'coordinador', 'monitor', 'lider')
order by a.severity desc, a.since
$$;

revoke all on function my_alerts() from public, anon;
grant execute on function my_alerts() to authenticated;
