-- ============================================================================
-- 008 · GP 2.0 Fase 3: calendario de 36 semanas, sesiones, líder/backup, asistencia con
--      "justificado", acreditación desde la sesión y seguimiento de recuperación.
--
-- Aditiva y repetible. Requiere 006 y 007.
--
-- Decisiones (reversibles, ver docs/GP2_FASE3_CALENDARIO.md):
--  · Una falta JUSTIFICADA no cuenta como ausencia para el máximo del currículum.
--  · Las sesiones planificadas, canceladas o sin realizar NO cuentan como reuniones dadas.
-- ============================================================================
begin;

-- ---------------------------------------------------------------------------
-- 1. Sesiones: trazabilidad de fechas y cancelaciones
-- ---------------------------------------------------------------------------
alter table meetings
  add column if not exists planned_on date,
  add column if not exists rescheduled_from date,
  add column if not exists cancel_reason text;

-- Cada posición del calendario (1..36) existe una sola vez por grupo
create unique index if not exists meetings_group_week_uniq on meetings (group_id, season_week) where season_week is not null;
create index if not exists meetings_group_status_idx on meetings (group_id, status, held_on);

drop trigger if exists trg_audit_meetings on meetings;
create trigger trg_audit_meetings after update of status, held_on on meetings
for each row when (old.status is distinct from new.status or old.held_on is distinct from new.held_on)
execute function audit_trigger();

-- ---------------------------------------------------------------------------
-- 2. Lo que antes contaba todas las filas de "meetings" ahora cuenta solo las realizadas
-- ---------------------------------------------------------------------------
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
  -- una falta justificada no es una ausencia
  (count(m.id) - count(a.status) filter (where a.status in ('presente', 'recuperado', 'justificado')))::int as absences,
  (count(a.status) filter (where a.status = 'justificado'))::int as justified
from enrollments e
join groups g on g.id = e.group_id
join curriculums cu on cu.id = g.curriculum_id
left join meetings m on m.group_id = e.group_id and m.status = 'realizada' and m.held_on >= e.enrolled_at::date
left join attendance a on a.meeting_id = m.id and a.enrollment_id = e.id
group by e.id, cu.max_absences;

create or replace view meeting_summary with (security_invoker = true) as
select
  m.id, m.group_id, m.held_on, m.lesson_number,
  (count(a.status) filter (where a.status = 'presente'))::int as present,
  (count(a.status) filter (where a.status = 'recuperado'))::int as recovered,
  count(a.status)::int as total,
  (count(a.status) filter (where a.status = 'justificado'))::int as justified
from meetings m
left join attendance a on a.meeting_id = m.id
where m.status = 'realizada'
group by m.id;

-- ---------------------------------------------------------------------------
-- 3. Pasar lista: justificado, modalidad de la sesión y sesión planificada
-- ---------------------------------------------------------------------------
drop function if exists save_attendance(uuid, date, int, uuid[], uuid[]);

create or replace function save_attendance(
  gid uuid, day date, lesson int, present uuid[], recovered uuid[],
  justified uuid[] default '{}', mode modality default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  mid uuid;
begin
  if not can_run_sessions(gid) then raise exception 'No tienes permiso para pasar lista en este grupo.'; end if;
  if day > current_date + 1 then raise exception 'No se puede pasar lista de una fecha futura.'; end if;

  select id into mid from meetings where group_id = gid and held_on = day;

  if mid is null then
    -- Si hay una sesión planificada cerca de esa fecha (±3 días), la reunión realizada ocupa esa posición
    select id into mid from meetings
     where group_id = gid and status in ('planificada', 'reprogramada') and abs(held_on - day) <= 3
     order by abs(held_on - day), season_week
     limit 1
     for update;
    if mid is not null then
      update meetings set rescheduled_from = coalesce(rescheduled_from, held_on), held_on = day where id = mid and held_on <> day;
    end if;
  end if;

  if mid is null then
    insert into meetings (group_id, held_on, lesson_number, status, facilitator_id, modality)
    values (gid, day, lesson, 'realizada', auth.uid(), mode)
    returning id into mid;
  else
    update meetings
       set lesson_number = coalesce(lesson, lesson_number),
           status = 'realizada',
           cancel_reason = null,
           facilitator_id = coalesce(facilitator_id, auth.uid()),
           modality = coalesce(mode, modality)
     where id = mid;
  end if;

  insert into attendance (meeting_id, enrollment_id, status, recorded_by, recorded_at)
  select mid, e.id,
         case when e.id = any(coalesce(recovered, '{}')) then 'recuperado'::attendance_status
              when e.id = any(coalesce(present, '{}')) then 'presente'::attendance_status
              when e.id = any(coalesce(justified, '{}')) then 'justificado'::attendance_status
              else 'ausente'::attendance_status end,
         auth.uid(), now()
  from enrollments e
  where e.group_id = gid and e.status = 'en_curso'
  on conflict (meeting_id, enrollment_id) do update
    set status = excluded.status, recorded_by = excluded.recorded_by, recorded_at = excluded.recorded_at;

  update groups set status = 'en_curso' where id = gid and status = 'abierto';
  return mid;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Calendario del grupo: 36 posiciones con fechas reales
-- ---------------------------------------------------------------------------
-- Relaciona cada sesión con la posición del plan pedagógico de su versión y año formativo
create or replace function sync_sessions_with_plan(gid uuid) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not can_manage_group(gid) then raise exception 'No tienes permiso para cambiar el calendario de este grupo.'; end if;
  update meetings m set slot_id = s.id
    from groups g, annual_learning_plans p, learning_plan_slots s
   where g.id = gid and m.group_id = gid
     and p.version_id = g.version_id and p.formative_year = g.formative_year
     and s.plan_id = p.id and s.position = m.season_week
     and m.slot_id is distinct from s.id;
  get diagnostics n = row_count;
  return n;
end $$;

-- Crea las sesiones planificadas del grupo. Usa el calendario de la temporada (con sus pausas y feriados)
-- si está definido; si no, cuenta semanas desde first_date saltando las fechas de "breaks".
create or replace function plan_group_sessions(gid uuid, first_date date default null, breaks date[] default '{}')
returns int
language plpgsql security definer set search_path = public as $$
declare
  g record; total int; created int := 0; pos int := 0; d date; w record;
begin
  if not can_manage_group(gid) then raise exception 'No tienes permiso para planificar este grupo.'; end if;
  select gr.id, gr.season_id, gr.weekday, s.planned_weeks into g
    from groups gr join seasons s on s.id = gr.season_id where gr.id = gid;
  if not found then raise exception 'El grupo no existe.'; end if;
  if g.weekday is null then raise exception 'Define el día de reunión del grupo antes de planificar.'; end if;
  if exists (select 1 from meetings where group_id = gid and season_week is not null and status <> 'cancelada') then
    raise exception 'Este grupo ya tiene su calendario.';
  end if;
  total := g.planned_weeks;

  if exists (select 1 from season_weeks where season_id = g.season_id and position is not null) then
    for w in select position, week_start from season_weeks
              where season_id = g.season_id and position is not null and position <= total order by position loop
      d := w.week_start + (g.weekday - 1);
      insert into meetings (group_id, held_on, season_week, status, planned_on)
      values (gid, d, w.position, 'planificada', d)
      on conflict (group_id, held_on) do update
        set season_week = coalesce(meetings.season_week, excluded.season_week),
            planned_on = coalesce(meetings.planned_on, excluded.planned_on);
      created := created + 1;
    end loop;
  else
    if first_date is null then
      raise exception 'La temporada no tiene calendario definido: indica la fecha de la primera reunión.';
    end if;
    d := first_date;
    while pos < total loop
      if not (d = any (coalesce(breaks, '{}'))) then
        pos := pos + 1;
        insert into meetings (group_id, held_on, season_week, status, planned_on)
        values (gid, d, pos, 'planificada', d)
        on conflict (group_id, held_on) do update
          set season_week = coalesce(meetings.season_week, excluded.season_week),
              planned_on = coalesce(meetings.planned_on, excluded.planned_on);
        created := created + 1;
      end if;
      d := d + 7;
    end loop;
  end if;

  perform sync_sessions_with_plan(gid);
  return created;
end $$;

-- Cambia la fecha de una sesión sin perder su posición (también reabre una cancelada)
create or replace function reschedule_session(mid uuid, new_date date) returns void
language plpgsql security definer set search_path = public as $$
declare m record;
begin
  select * into m from meetings where id = mid;
  if not found then raise exception 'La sesión no existe.'; end if;
  if not can_manage_group(m.group_id) then raise exception 'No tienes permiso para cambiar esta sesión.'; end if;
  if m.status = 'realizada' then raise exception 'Una sesión ya realizada no se reprograma.'; end if;
  if exists (select 1 from meetings where group_id = m.group_id and held_on = new_date and id <> mid) then
    raise exception 'Ya hay otra sesión de este grupo en esa fecha.';
  end if;
  update meetings
     set rescheduled_from = coalesce(rescheduled_from, held_on), held_on = new_date,
         status = 'reprogramada', cancel_reason = null
   where id = mid;
end $$;

-- Cancela una sesión: queda en el calendario con su número y su motivo
create or replace function cancel_session(mid uuid, reason text default null) returns void
language plpgsql security definer set search_path = public as $$
declare m record;
begin
  select * into m from meetings where id = mid;
  if not found then raise exception 'La sesión no existe.'; end if;
  if not can_manage_group(m.group_id) then raise exception 'No tienes permiso para cambiar esta sesión.'; end if;
  if m.status = 'realizada' then raise exception 'Una sesión ya realizada no se cancela.'; end if;
  update meetings set status = 'cancelada', cancel_reason = nullif(trim(coalesce(reason, '')), '') where id = mid;
end $$;

-- ---------------------------------------------------------------------------
-- 5. Líder y backup
-- ---------------------------------------------------------------------------
create or replace function set_group_backup(gid uuid, person uuid) returns void
language plpgsql security definer set search_path = public as $$
declare p record; g record;
begin
  if not can_manage_group(gid) then raise exception 'No tienes permiso para asignar el respaldo de este grupo.'; end if;
  select leader_id into g from groups where id = gid;
  if person is not null then
    select role, active into p from profiles where id = person;
    if not found then raise exception 'La persona no existe.'; end if;
    if not p.active then raise exception 'Esa persona está inactiva.'; end if;
    if role_rank(p.role) < 2 then raise exception 'El respaldo debe ser al menos líder.'; end if;
    if person = g.leader_id then raise exception 'El respaldo debe ser una persona distinta del líder.'; end if;
  end if;
  update groups set backup_leader_id = person where id = gid;
end $$;

create or replace function search_backup_candidates(gid uuid, q text) returns table (id uuid, full_name text, role app_role)
language plpgsql stable security definer set search_path = public as $$
begin
  if not can_manage_group(gid) then raise exception 'No tienes permiso para buscar respaldos de este grupo.'; end if;
  if length(trim(coalesce(q, ''))) < 3 then return; end if;
  return query
    select p.id, p.full_name, p.role from profiles p
     where p.active and p.role in ('lider', 'monitor', 'coordinador')
       and p.full_name ilike '%' || trim(q) || '%'
       and p.id is distinct from (select g.leader_id from groups g where g.id = gid)
     order by p.full_name
     limit 20;
end $$;

-- Quién dirige una sesión concreta (por ejemplo, el backup cuando falta el líder)
create or replace function set_session_facilitator(mid uuid, person uuid) returns void
language plpgsql security definer set search_path = public as $$
declare m record; g record;
begin
  select * into m from meetings where id = mid;
  if not found then raise exception 'La sesión no existe.'; end if;
  if not can_manage_group(m.group_id) then raise exception 'No tienes permiso para cambiar esta sesión.'; end if;
  select leader_id, monitor_id, backup_leader_id into g from groups where id = m.group_id;
  if person is not null and person is distinct from g.leader_id
     and person is distinct from g.monitor_id and person is distinct from g.backup_leader_id then
    raise exception 'Quien dirija la sesión debe ser el líder, el monitor o el respaldo del grupo.';
  end if;
  update meetings set facilitator_id = person where id = mid;
end $$;

-- ---------------------------------------------------------------------------
-- 6. Acreditar unidades desde la sesión (solo a quienes asistieron)
-- ---------------------------------------------------------------------------
create or replace function accredit_session(mid uuid, ces uuid[] default null, units uuid[] default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  m record; u uuid[]; c uuid; x uuid;
  ok int := 0; already int := 0; skipped jsonb := '[]'::jsonb;
begin
  select * into m from meetings where id = mid;
  if not found then raise exception 'La sesión no existe.'; end if;
  if not can_manage_group(m.group_id) then
    raise exception 'Solo el líder, el monitor o el coordinador acreditan unidades.';
  end if;
  if m.status <> 'realizada' then raise exception 'Primero pasa lista de esta sesión.'; end if;

  u := coalesce(units, array(
    select su.unit_id from learning_plan_slot_units su
      join lessons l on l.id = su.unit_id join cycles cy on cy.id = l.cycle_id
     where su.slot_id = m.slot_id order by cy.formative_year, cy.number, l.number));
  if coalesce(array_length(u, 1), 0) = 0 then
    raise exception 'Esta sesión no tiene unidades asociadas en el plan.';
  end if;

  for c in
    select distinct e.curriculum_enrollment_id
      from attendance a join enrollments e on e.id = a.enrollment_id
     where a.meeting_id = mid and a.status in ('presente', 'recuperado')
       and e.curriculum_enrollment_id is not null
       and (ces is null or e.curriculum_enrollment_id = any(ces))
  loop
    foreach x in array u loop
      if exists (select 1 from unit_completions uc where uc.curriculum_enrollment_id = c and uc.unit_id = x) then
        already := already + 1;
        continue;
      end if;
      begin
        perform record_unit_completion(c, x, 'asistencia_validada',
          jsonb_build_object('sesion', mid, 'fecha', m.held_on), mid);
        ok := ok + 1;
      exception when others then
        skipped := skipped || jsonb_build_object('inscripcion', c, 'unidad', x, 'motivo', sqlerrm);
      end;
    end loop;
  end loop;

  return jsonb_build_object('acreditadas', ok, 'ya_acreditadas', already, 'omitidas', skipped);
end $$;

-- ---------------------------------------------------------------------------
-- 7. Recuperación: fecha de resolución automática y acceso de quienes administran
-- ---------------------------------------------------------------------------
create or replace function catchup_touch() returns trigger
language plpgsql as $$
begin
  if new.status = 'resuelto' and old.status is distinct from 'resuelto' then new.resolved_at := now(); end if;
  if new.status <> 'resuelto' then new.resolved_at := null; end if;
  return new;
end $$;
drop trigger if exists trg_catchup_touch on catchup_plans;
create trigger trg_catchup_touch before update on catchup_plans for each row execute function catchup_touch();

-- ---------------------------------------------------------------------------
-- 8. Alertas: se ignoran sesiones sin realizar y aparece "sesión sin registrar"
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
  where m.status = 'realizada'
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
         avg(case when a.status in ('presente', 'recuperado') then 1.0
                  when a.status = 'justificado' then null
                  else 0.0 end) as pct,
         count(distinct r.id) as n_meetings
  from ranked r
  join enrollments e on e.group_id = r.group_id and e.status = 'en_curso' and r.held_on >= e.enrolled_at::date
  left join attendance a on a.meeting_id = r.id and a.enrollment_id = e.id
  where r.rn <= 4
  group by r.group_id
),
last_meeting as (
  select group_id, max(held_on) as last_on from meetings where status = 'realizada' group by group_id
),
overdue as (
  select m.group_id, count(*) as n, min(m.held_on) as oldest
  from meetings m join ag on ag.id = m.group_id
  where m.status in ('planificada', 'reprogramada') and m.held_on < current_date - 7
  group by m.group_id
),
alerts as (
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
  select 'en_riesgo', 3, ag.id, ag.name, p.id, p.full_name,
         'Lleva ' || ep.absences || ' ausencias de ' || ep.max_absences || ' permitidas',
         coalesce(lm.last_on, current_date)
  from enrollment_progress ep
  join ag on ag.id = ep.group_id
  join profiles p on p.id = ep.person_id
  left join last_meeting lm on lm.group_id = ag.id
  where ep.status = 'en_curso' and ep.absences >= ep.max_absences - 1 and ep.absences <= ep.max_absences

  union all
  select 'excedido', 2, ag.id, ag.name, p.id, p.full_name,
         'Superó las ' || ep.max_absences || ' ausencias permitidas',
         coalesce(lm.last_on, current_date)
  from enrollment_progress ep
  join ag on ag.id = ep.group_id
  join profiles p on p.id = ep.person_id
  left join last_meeting lm on lm.group_id = ag.id
  where ep.status = 'en_curso' and ep.absences > ep.max_absences

  union all
  select 'nuevo', 2, ag.id, ag.name, p.id, p.full_name,
         'Se unió hace poco y aún no tiene contacto', e.enrolled_at::date
  from enrollments e
  join ag on ag.id = e.group_id
  join profiles p on p.id = e.person_id
  where e.status = 'en_curso' and e.enrolled_at > now() - interval '21 days'
    and not exists (select 1 from contacts c where c.person_id = p.id and c.group_id = ag.id)

  union all
  select 'asistencia_baja', 3, ag.id, ag.name, null::uuid, null::text,
         'Asistencia de las últimas reuniones: ' || round(100 * r4.pct) || '%', lm.last_on
  from recent4 r4
  join ag on ag.id = r4.group_id
  left join last_meeting lm on lm.group_id = ag.id
  where r4.n_meetings >= 2 and r4.pct < 0.6

  union all
  select 'sin_reunion', 2, ag.id, ag.name, null::uuid, null::text,
         case when lm.last_on is null then 'Todavía no se ha pasado lista'
              else 'No se pasa lista hace ' || (current_date - lm.last_on) || ' días' end,
         coalesce(lm.last_on, ag.created_at::date)
  from ag
  left join last_meeting lm on lm.group_id = ag.id
  where ag.status = 'en_curso'
    and coalesce(lm.last_on, ag.created_at::date) < current_date - 14

  union all
  select 'sesion_pendiente', 2, ag.id, ag.name, null::uuid, null::text,
         case when o.n = 1 then 'Hay 1 sesión planificada sin registrar' else 'Hay ' || o.n || ' sesiones planificadas sin registrar' end,
         o.oldest
  from overdue o join ag on ag.id = o.group_id

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

-- ---------------------------------------------------------------------------
-- 9. Panel: cobertura de calendario, líder y respaldo (sin mezclar con aprendizaje)
-- ---------------------------------------------------------------------------
create or replace function panel_cobertura() returns table (
  grupos_activos int, con_calendario int, sin_calendario int, sin_lider int, sin_respaldo int,
  sesiones_planificadas int, sesiones_realizadas int, sesiones_atrasadas int,
  sesiones_canceladas int, sesiones_con_respaldo int
)
language sql stable set search_path = public as $$
  with ag as (
    select g.id, g.leader_id, g.backup_leader_id
    from groups g
    where g.status in ('abierto', 'en_curso') and g.id in (select managed_group_ids())
  ),
  ms as (
    select m.*, ag.leader_id, ag.backup_leader_id
    from meetings m join ag on ag.id = m.group_id
    where m.season_week is not null
  )
  select
    (select count(*) from ag)::int,
    (select count(distinct group_id) from ms)::int,
    ((select count(*) from ag) - (select count(distinct group_id) from ms))::int,
    (select count(*) from ag where leader_id is null)::int,
    (select count(*) from ag where backup_leader_id is null)::int,
    (select count(*) from ms where status <> 'cancelada' and held_on <= current_date)::int,
    (select count(*) from ms where status = 'realizada')::int,
    (select count(*) from ms where status in ('planificada', 'reprogramada') and held_on < current_date - 7)::int,
    (select count(*) from ms where status = 'cancelada')::int,
    (select count(*) from ms where status = 'realizada' and facilitator_id is not null
        and facilitator_id = backup_leader_id and facilitator_id is distinct from leader_id)::int
$$;

-- ---------------------------------------------------------------------------
-- 10. Permisos de ejecución
-- ---------------------------------------------------------------------------
revoke all on function save_attendance(uuid, date, int, uuid[], uuid[], uuid[], modality),
  sync_sessions_with_plan(uuid), plan_group_sessions(uuid, date, date[]), reschedule_session(uuid, date),
  cancel_session(uuid, text), set_group_backup(uuid, uuid), search_backup_candidates(uuid, text),
  set_session_facilitator(uuid, uuid), accredit_session(uuid, uuid[], uuid[]), panel_cobertura()
  from public, anon;
grant execute on function save_attendance(uuid, date, int, uuid[], uuid[], uuid[], modality),
  sync_sessions_with_plan(uuid), plan_group_sessions(uuid, date, date[]), reschedule_session(uuid, date),
  cancel_session(uuid, text), set_group_backup(uuid, uuid), search_backup_candidates(uuid, text),
  set_session_facilitator(uuid, uuid), accredit_session(uuid, uuid[], uuid[]), panel_cobertura()
  to authenticated;

notify pgrst, 'reload schema';
commit;
