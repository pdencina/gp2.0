-- ============================================================================
-- 014 · Reencuentro: recuperar a quienes dejaron su camino a medias
--
-- Una persona "se alejó" cuando tiene una inscripción curricular abierta (activa o pausada), ninguna
-- membresía en un grupo vigente y su última actividad (asistencia, cierre de grupo o pausa) fue hace meses.
-- Cada persona la ve quien tiene relación con ella: administrador, coordinador del programa, pastor de su sede
-- o líder/monitor/respaldo de alguno de sus grupos. No cambia nada del modelo existente: solo agrega un registro de
-- contactos y consultas. Aditiva y repetible. Requiere 006 a 010.
-- ============================================================================
begin;

-- Registro de contactos de rescate (no exige que la persona esté hoy en un grupo, a diferencia de "contacts")
create table if not exists outreach_log (
  id uuid primary key default gen_random_uuid(),
  curriculum_enrollment_id uuid not null references curriculum_enrollments(id) on delete cascade,
  contacted_by uuid references profiles(id) on delete set null,
  kind text not null check (kind in ('mensaje', 'llamada', 'visita', 'correo')),
  outcome text not null check (outcome in ('sin_respuesta', 'quiere_volver', 'mas_adelante', 'no_continuara', 'dato_incorrecto')),
  note text check (note is null or char_length(note) <= 500),
  follow_up_on date,
  created_at timestamptz not null default now()
);
create index if not exists outreach_ce_idx on outreach_log (curriculum_enrollment_id, created_at desc);
alter table outreach_log enable row level security;
-- Sin políticas: se lee y escribe solo por las funciones de abajo, que verifican el alcance de quien llama.
revoke all on outreach_log from anon, authenticated;

-- ¿Puedo gestionar el reencuentro de esta inscripción? (interna)
create or replace function _can_reach_out(ce uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_admin()
    or exists (select 1 from curriculum_enrollments c where c.id = ce and coordinates_curriculum(c.curriculum_id))
    or exists (select 1 from campus_pastors cp where cp.person_id = auth.uid() and cp.campus_id is not null and cp.campus_id = person_campus_of(ce))
    or exists (select 1 from enrollments e join groups g on g.id = e.group_id
                where e.curriculum_enrollment_id = ce and auth.uid() in (g.leader_id, g.monitor_id, g.backup_leader_id))
$$;

create or replace function _assert_reach_role() returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not (is_admin() or my_role() in ('coordinador', 'monitor', 'lider')
          or exists (select 1 from campus_pastors cp where cp.person_id = auth.uid())) then
    raise exception 'Solo quienes acompañan a otras personas ven el reencuentro.';
  end if;
end $$;

-- Personas alejadas, sin filtrar por quién mira (interna). p_person limita a una sola persona.
create or replace function _dormant_all(p_months int, p_person uuid default null)
returns table (
  ce_id uuid, person_id uuid, curriculum_id uuid, formative_year int, ce_status text, version_id uuid,
  last_activity date, months_away int, last_result text, last_group_id uuid
)
language sql stable security definer set search_path = public as $$
  -- Cada pieza se calcula una vez y se une (no con NOT EXISTS correlacionado: con miles de inscripciones el plan
  -- se vuelve cuadrático). Si se pide una sola persona, todo se limita a ella.
  with open_ce as (
    select distinct e.curriculum_enrollment_id as ce
      from enrollments e join groups g on g.id = e.group_id
     where e.curriculum_enrollment_id is not null and e.status in ('preinscrito', 'en_curso') and g.status in ('abierto', 'en_curso')
       and (p_person is null or e.person_id = p_person)
  ),
  att as (
    select e.curriculum_enrollment_id as ce, max(m.held_on) as d
      from attendance a
      join enrollments e on e.id = a.enrollment_id
      join meetings m on m.id = a.meeting_id
     where e.curriculum_enrollment_id is not null and a.status in ('presente', 'recuperado') and m.status = 'realizada'
       and (p_person is null or e.person_id = p_person)
     group by 1
  ),
  lastm as (
    select distinct on (e.curriculum_enrollment_id)
           e.curriculum_enrollment_id as ce, e.status::text as st, e.group_id as gid, coalesce(e.closed_at, e.enrolled_at)::date as d
      from enrollments e
     where e.curriculum_enrollment_id is not null and e.status <> 'cancelado'
       and (p_person is null or e.person_id = p_person)
     order by e.curriculum_enrollment_id, coalesce(e.closed_at, e.enrolled_at) desc
  )
  select c.id, c.person_id, c.curriculum_id, c.formative_year, c.status::text, c.version_id,
         greatest(att.d, lm.d, c.paused_at, c.started_at),
         ((current_date - greatest(att.d, lm.d, c.paused_at, c.started_at)) / 30.44)::int,
         lm.st, lm.gid
    from curriculum_enrollments c
    join profiles p on p.id = c.person_id and p.active
    left join att on att.ce = c.id
    left join lastm lm on lm.ce = c.id
    left join open_ce oc on oc.ce = c.id
   where c.status in ('activo', 'pausado')
     and (p_person is null or c.person_id = p_person)
     and oc.ce is null
     and (current_date - greatest(att.d, lm.d, c.paused_at, c.started_at)) >= (greatest(coalesce(p_months, 0), 0) * 30.44)
$$;

-- Las personas alejadas que veo yo (interna)
create or replace function _reengagement_base(p_months int)
returns table (
  ce_id uuid, person_id uuid, curriculum_id uuid, formative_year int, ce_status text, version_id uuid,
  last_activity date, months_away int, last_result text, last_group_id uuid
)
language sql stable security definer set search_path = public as $$
  select d.*
    from _dormant_all(p_months) d
    join profiles p on p.id = d.person_id
   where d.person_id <> auth.uid()
     and ( is_admin()
        or coordinates_curriculum(d.curriculum_id)
        or exists (select 1 from campus_pastors cp
                    where cp.person_id = auth.uid() and cp.campus_id is not null
                      and cp.campus_id = coalesce((select g.campus_id from groups g where g.id = d.last_group_id), p.campus_id))
        or exists (select 1 from enrollments e join groups g on g.id = e.group_id
                    where e.curriculum_enrollment_id = d.ce_id and auth.uid() in (g.leader_id, g.monitor_id, g.backup_leader_id)) )
$$;

-- Lista paginada para trabajar el reencuentro
create or replace function reengagement_list(
  p_months int default 3, p_curriculum uuid default null, p_campus uuid default null, p_stage text default 'por_contactar',
  p_search text default null, p_limit int default 25, p_skip int default 0, p_include_finished boolean default false
) returns table (
  ce_id uuid, person_id uuid, person_name text, phone text, guardian_phone text, is_minor boolean, accepts_comms boolean,
  campus text, curriculum_id uuid, curriculum text, formative_year int, last_activity date, months_away int,
  last_result text, last_cycle_no int, cycles_total int, last_group text, last_leader text,
  modules_done int, modules_total int, units_done int, units_total int, finished_guess boolean,
  contacts int, last_contact timestamptz, last_outcome text, follow_up_on date, stage text, total bigint
)
language plpgsql stable security definer set search_path = public as $$
begin
  perform _assert_reach_role();
  return query
  with b as (select * from _reengagement_base(p_months)),
  lastlog as (
    select distinct on (o.curriculum_enrollment_id) o.curriculum_enrollment_id as ce, o.outcome, o.follow_up_on as fu, o.created_at as at
      from outreach_log o where o.curriculum_enrollment_id in (select x.ce_id from b x)
     order by o.curriculum_enrollment_id, o.created_at desc
  ),
  cnt as (
    select o.curriculum_enrollment_id as ce, count(*)::int as n
      from outreach_log o where o.curriculum_enrollment_id in (select x.ce_id from b x) group by 1
  ),
  f as (
    select b.ce_id as f_ce, b.person_id as f_person, b.curriculum_id as f_cur, b.formative_year as f_year, b.version_id as f_ver,
           b.last_activity as f_last, b.months_away as f_months, b.last_result as f_res, b.last_group_id as f_gid,
           p.full_name as f_name, p.phone as f_phone, p.guardian_phone as f_gphone, p.accepts_comms as f_comms, p.birth_date as f_birth,
           coalesce(gr.campus_id, p.campus_id) as f_campus, gr.name as f_gname, gr.leader_id as f_leader, gr.cycle_id as f_cycle,
           ll.outcome as f_out, ll.fu as f_fu, ll.at as f_at, coalesce(c.n, 0) as f_n,
           case when ll.outcome is null then 'por_contactar'
                when ll.outcome = 'no_continuara' then 'cerrado'
                when ll.outcome = 'quiere_volver' then 'en_camino'
                when ll.outcome = 'dato_incorrecto' then 'dato_incorrecto'
                when ll.outcome = 'mas_adelante' then case when ll.fu is not null and ll.fu > current_date then 'agendado' else 'por_contactar' end
                else case when ll.at > now() - interval '21 days' then 'esperando' else 'por_contactar' end
           end as f_stage,
           cy.number as f_cyno,
           (select max(c2.number) from cycles c2 where c2.version_id = cy.version_id) as f_cymax
      from b
      join profiles p on p.id = b.person_id
      left join groups gr on gr.id = b.last_group_id
      left join cycles cy on cy.id = gr.cycle_id
      left join lastlog ll on ll.ce = b.ce_id
      left join cnt c on c.ce = b.ce_id
     where (p_curriculum is null or b.curriculum_id = p_curriculum)
       and (p_search is null or char_length(trim(p_search)) < 3 or p.full_name ilike '%' || trim(p_search) || '%')
  ),
  filt as (
    select f.*, (f.f_res = 'aprobado' and f.f_cyno is not null and f.f_cyno >= coalesce(f.f_cymax, f.f_cyno)) as f_fin
      from f
     where (p_campus is null or f.f_campus = p_campus)
       and (p_stage is null or p_stage = 'todas' or f.f_stage = p_stage)
  ),
  page as (
    select ft.*, count(*) over () as f_total
      from filt ft
     where p_include_finished or not ft.f_fin
     order by ft.f_last desc, ft.f_name
     limit greatest(coalesce(p_limit, 25), 1) offset greatest(coalesce(p_skip, 0), 0)
  )
  select pg.f_ce, pg.f_person, pg.f_name, pg.f_phone, pg.f_gphone,
         (pg.f_birth is not null and extract(year from age(current_date, pg.f_birth)) < 18)::boolean,
         pg.f_comms, ca.name, pg.f_cur, cu.name, pg.f_year, pg.f_last, pg.f_months, pg.f_res, pg.f_cyno, pg.f_cymax,
         pg.f_gname, lp.full_name,
         (select count(*)::int from stage_credits sc join cycles cc on cc.id = sc.stage_id
           where sc.person_id = pg.f_person and cc.curriculum_id = pg.f_cur and sc.review_status <> 'rechazado'),
         (select count(*)::int from cycles cc where cc.version_id = pg.f_ver),
         (select count(*)::int from unit_completions uc where uc.curriculum_enrollment_id = pg.f_ce),
         (select count(*)::int from lessons l join cycles cc on cc.id = l.cycle_id where cc.version_id = pg.f_ver),
         pg.f_fin, pg.f_n, pg.f_at, pg.f_out, pg.f_fu, pg.f_stage, pg.f_total
    from page pg
    join curriculums cu on cu.id = pg.f_cur
    left join campuses ca on ca.id = pg.f_campus
    left join profiles lp on lp.id = pg.f_leader
   order by pg.f_last desc, pg.f_name;
end $$;

-- Resumen: cuántas personas hay por antigüedad y por etapa del contacto
create or replace function reengagement_summary()
returns table (
  total int, por_contactar int, esperando int, agendado int, en_camino int, cerrado int, dato_incorrecto int,
  m3_6 int, m6_12 int, m12_24 int, m24_mas int, contactados_30d int, recuperados int
)
language plpgsql stable security definer set search_path = public as $$
begin
  perform _assert_reach_role();
  return query
  with b as (select * from _reengagement_base(3)),
  lastlog as (
    select distinct on (o.curriculum_enrollment_id) o.curriculum_enrollment_id as ce, o.outcome, o.follow_up_on as fu, o.created_at as at
      from outreach_log o where o.curriculum_enrollment_id in (select x.ce_id from b x)
     order by o.curriculum_enrollment_id, o.created_at desc
  ),
  s as (
    select b.months_away as mo,
           case when ll.outcome is null then 'por_contactar'
                when ll.outcome = 'no_continuara' then 'cerrado'
                when ll.outcome = 'quiere_volver' then 'en_camino'
                when ll.outcome = 'dato_incorrecto' then 'dato_incorrecto'
                when ll.outcome = 'mas_adelante' then case when ll.fu is not null and ll.fu > current_date then 'agendado' else 'por_contactar' end
                else case when ll.at > now() - interval '21 days' then 'esperando' else 'por_contactar' end
           end as st
      from b left join lastlog ll on ll.ce = b.ce_id
  )
  select count(*)::int,
         (count(*) filter (where s.st = 'por_contactar'))::int,
         (count(*) filter (where s.st = 'esperando'))::int,
         (count(*) filter (where s.st = 'agendado'))::int,
         (count(*) filter (where s.st = 'en_camino'))::int,
         (count(*) filter (where s.st = 'cerrado'))::int,
         (count(*) filter (where s.st = 'dato_incorrecto'))::int,
         (count(*) filter (where s.mo < 6))::int,
         (count(*) filter (where s.mo >= 6 and s.mo < 12))::int,
         (count(*) filter (where s.mo >= 12 and s.mo < 24))::int,
         (count(*) filter (where s.mo >= 24))::int,
         (select count(distinct o.curriculum_enrollment_id)::int from outreach_log o
           where o.created_at > now() - interval '30 days' and _can_reach_out(o.curriculum_enrollment_id)),
         -- Volvieron: se les contactó y después asistieron a una reunión realizada
         (select count(distinct o.curriculum_enrollment_id)::int from outreach_log o
           where _can_reach_out(o.curriculum_enrollment_id)
             and exists (select 1 from enrollments e
                           join attendance a on a.enrollment_id = e.id
                           join meetings m on m.id = a.meeting_id
                          where e.curriculum_enrollment_id = o.curriculum_enrollment_id
                            and a.status in ('presente', 'recuperado') and m.status = 'realizada'
                            and m.held_on > o.created_at::date))
    from s;
end $$;

-- Anotar un contacto de rescate
create or replace function log_outreach(
  p_ce uuid, p_kind text, p_outcome text, p_note text default null, p_follow_up date default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare oid uuid; fu date;
begin
  perform _assert_reach_role();
  if not exists (select 1 from curriculum_enrollments c where c.id = p_ce) then raise exception 'La inscripción no existe.'; end if;
  if not _can_reach_out(p_ce) then raise exception 'No tienes permiso para anotar contactos de esta persona.'; end if;
  if p_kind not in ('mensaje', 'llamada', 'visita', 'correo') then raise exception 'El tipo de contacto no es válido.'; end if;
  if p_outcome not in ('sin_respuesta', 'quiere_volver', 'mas_adelante', 'no_continuara', 'dato_incorrecto') then
    raise exception 'El resultado del contacto no es válido.';
  end if;
  if p_note is not null and char_length(p_note) > 500 then raise exception 'La nota es demasiado larga (máximo 500 letras).'; end if;
  fu := p_follow_up;
  if p_outcome = 'mas_adelante' and fu is null then fu := current_date + 30; end if;
  if fu is not null and fu < current_date then raise exception 'La fecha de seguimiento no puede estar en el pasado.'; end if;

  insert into outreach_log (curriculum_enrollment_id, contacted_by, kind, outcome, note, follow_up_on)
  values (p_ce, auth.uid(), p_kind, p_outcome, nullif(trim(coalesce(p_note, '')), ''), fu)
  returning id into oid;
  return oid;
end $$;

-- Historial de contactos de una persona
create or replace function reengagement_history(p_ce uuid)
returns table (id uuid, created_at timestamptz, kind text, outcome text, note text, follow_up_on date, by_name text)
language plpgsql stable security definer set search_path = public as $$
begin
  perform _assert_reach_role();
  if not _can_reach_out(p_ce) then raise exception 'No tienes permiso para ver estos contactos.'; end if;
  return query
    select o.id, o.created_at, o.kind, o.outcome, o.note, o.follow_up_on, pr.full_name
      from outreach_log o left join profiles pr on pr.id = o.contacted_by
     where o.curriculum_enrollment_id = p_ce
     order by o.created_at desc;
end $$;

-- Para la propia persona: caminos que dejó y siguen guardados (se muestra al volver a entrar)
create or replace function my_comeback()
returns table (ce_id uuid, curriculum text, formative_year int, months_away int, units_done int, units_total int, modules_done int, modules_total int)
language sql stable security definer set search_path = public as $$
  select d.ce_id, cu.name, d.formative_year, d.months_away,
         (select count(*)::int from unit_completions uc where uc.curriculum_enrollment_id = d.ce_id),
         (select count(*)::int from lessons l join cycles cc on cc.id = l.cycle_id where cc.version_id = d.version_id),
         (select count(*)::int from stage_credits sc join cycles cc on cc.id = sc.stage_id
           where sc.person_id = d.person_id and cc.curriculum_id = d.curriculum_id and sc.review_status <> 'rechazado'),
         (select count(*)::int from cycles cc where cc.version_id = d.version_id)
    from _dormant_all(1, auth.uid()) d
    join curriculums cu on cu.id = d.curriculum_id
   where cu.active
   order by d.last_activity desc
   limit 3
$$;

revoke all on function _can_reach_out(uuid), _assert_reach_role(), _dormant_all(int, uuid), _reengagement_base(int) from public, anon, authenticated;
revoke all on function reengagement_list(int, uuid, uuid, text, text, int, int, boolean), reengagement_summary(),
  log_outreach(uuid, text, text, text, date), reengagement_history(uuid), my_comeback() from public, anon;
grant execute on function reengagement_list(int, uuid, uuid, text, text, int, int, boolean), reengagement_summary(),
  log_outreach(uuid, text, text, text, date), reengagement_history(uuid), my_comeback() to authenticated;

-- Estadísticas al día: el reencuentro cruza varias tablas grandes y, sin estadísticas recientes (por ejemplo, justo
-- después de una importación masiva), el planificador puede elegir un plan miles de veces más lento.
analyze curriculum_enrollments, enrollments, attendance, meetings, groups, profiles;

notify pgrst, 'reload schema';
commit;
