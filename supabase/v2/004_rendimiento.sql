-- ============================================================================
-- 004 · Rendimiento con muchos datos
--
-- Las reglas de acceso (RLS) se evaluaban fila por fila: con 4.000 grupos y 340.000
-- asistencias, un coordinador o un líder esperaba más de 10 segundos en algunas pantallas.
-- Ahora se calcula una sola vez "qué grupos y qué personas puede ver quien consulta" y se
-- filtra con ese conjunto. Las reglas de quién ve qué NO cambian.
--
-- No toca ningún dato. Se puede ejecutar varias veces.
-- ============================================================================
begin;

-- Grupos que administro: todos (administrador), los de mi currículum (coordinador) o los míos (monitor o líder)
create or replace function managed_group_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select g.id from groups g where (select is_admin())
  union
  select g.id from groups g
    join cycles cy on cy.id = g.cycle_id
    join curriculum_coordinators cc on cc.curriculum_id = cy.curriculum_id
   where cc.coordinator_id = (select auth.uid())
  union
  select g.id from groups g where g.leader_id = (select auth.uid()) or g.monitor_id = (select auth.uid())
$$;

-- Grupos en los que participo como inscrito
create or replace function enrolled_group_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select e.group_id from enrollments e
   where e.person_id = (select auth.uid()) and e.status <> 'cancelado'
$$;

create or replace function visible_group_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select managed_group_ids() union select enrolled_group_ids()
$$;

-- Personas que puedo ver: yo, las de mis grupos, y mi líder y mi monitor
create or replace function visible_profile_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select (select auth.uid())
  union select g.leader_id from groups g where g.id in (select managed_group_ids()) and g.leader_id is not null
  union select g.monitor_id from groups g where g.id in (select managed_group_ids()) and g.monitor_id is not null
  union select e.person_id from enrollments e where e.group_id in (select managed_group_ids())
  union select g.leader_id from groups g where g.id in (select enrolled_group_ids()) and g.leader_id is not null
  union select g.monitor_id from groups g where g.id in (select enrolled_group_ids()) and g.monitor_id is not null
$$;

create or replace function can_see_profile(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select pid = (select auth.uid()) or (select is_admin()) or pid in (select visible_profile_ids())
$$;

create index if not exists enrollments_group_status_idx on enrollments (group_id, status);

-- ---------------------------------------------------------------------------
-- Reglas de acceso: mismas reglas, evaluadas una vez por consulta
-- ---------------------------------------------------------------------------
drop policy if exists "ver perfiles permitidos" on profiles;
create policy "ver perfiles permitidos" on profiles for select
  using (id = (select auth.uid()) or (select is_admin()) or id in (select visible_profile_ids()));

drop policy if exists "ver grupos" on groups;
create policy "ver grupos" on groups for select to authenticated using (
  id in (select visible_group_ids())
  or (status = 'abierto' and exists (
    select 1 from seasons s where s.id = season_id and s.status in ('inscripciones', 'en_curso')))
);

drop policy if exists "ver inscripciones" on enrollments;
create policy "ver inscripciones" on enrollments for select
  using (person_id = (select auth.uid()) or group_id in (select managed_group_ids()));
drop policy if exists "inscribir desde el grupo" on enrollments;
create policy "inscribir desde el grupo" on enrollments for insert
  with check (group_id in (select managed_group_ids()));
drop policy if exists "gestionar inscripciones" on enrollments;
create policy "gestionar inscripciones" on enrollments for update
  using (group_id in (select managed_group_ids())) with check (group_id in (select managed_group_ids()));

drop policy if exists "ver reuniones" on meetings;
create policy "ver reuniones" on meetings for select using (group_id in (select visible_group_ids()));
drop policy if exists "gestionar reuniones" on meetings;
create policy "gestionar reuniones" on meetings for all
  using (group_id in (select managed_group_ids())) with check (group_id in (select managed_group_ids()));

drop policy if exists "ver asistencia" on attendance;
create policy "ver asistencia" on attendance for select using (
  enrollment_id in (select e.id from enrollments e where e.person_id = (select auth.uid()))
  or meeting_id in (select m.id from meetings m where m.group_id in (select managed_group_ids()))
);
drop policy if exists "gestionar asistencia" on attendance;
create policy "gestionar asistencia" on attendance for all
  using (meeting_id in (select m.id from meetings m where m.group_id in (select managed_group_ids())))
  with check (meeting_id in (select m.id from meetings m where m.group_id in (select managed_group_ids())));

drop policy if exists "ver contactos del grupo" on contacts;
create policy "ver contactos del grupo" on contacts for select using (group_id in (select managed_group_ids()));
drop policy if exists "registrar contacto" on contacts;
create policy "registrar contacto" on contacts for insert with check (
  group_id in (select managed_group_ids())
  and contacted_by = (select auth.uid())
  and exists (select 1 from enrollments e where e.group_id = contacts.group_id and e.person_id = contacts.person_id)
);

-- ---------------------------------------------------------------------------
-- Alertas: los grupos se filtran con el conjunto calculado una vez
-- ---------------------------------------------------------------------------
create or replace function my_alerts()
returns table (
  kind text, severity int, group_id uuid, group_name text,
  person_id uuid, person_name text, detail text, since date
)
language sql stable set search_path = public as $$
with ag as (
  select g.id, g.name, g.leader_id, g.monitor_id, g.status, g.created_at
  from groups g
  where g.status in ('abierto', 'en_curso') and g.id in (select managed_group_ids())
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

notify pgrst, 'reload schema';
commit;
