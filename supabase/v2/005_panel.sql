-- ============================================================================
-- 005 · Panel de seguimiento del ecosistema
--
-- Consultas agregadas para el panel. Corren con los permisos de quien las llama (RLS),
-- así cada persona ve los números de su propio alcance: el administrador, todo; el
-- coordinador, su currículum; el monitor y el líder, sus grupos.
-- No toca ningún dato. Se puede ejecutar varias veces.
-- ============================================================================
begin;

-- Números del momento
create or replace function panel_resumen() returns table (
  grupos_activos int, personas_activas int, inscritos_activos int,
  asistencia_4s numeric, asistencia_4s_previa numeric,
  sin_lider int, sin_monitor int, nuevos_30d int, aprobacion_historica numeric
)
language sql stable set search_path = public as $$
  with act as (select id, leader_id, monitor_id from groups where status in ('abierto', 'en_curso')),
  en as (
    select e.person_id from enrollments e join act on act.id = e.group_id where e.status = 'en_curso'
  ),
  rec as (
    select a.status, m.held_on from attendance a join meetings m on m.id = a.meeting_id
    where m.held_on >= current_date - 56 and m.held_on <= current_date
  )
  select
    (select count(*) from act)::int,
    (select count(distinct person_id) from en)::int,
    (select count(*) from en)::int,
    (select round(100.0 * count(*) filter (where status in ('presente', 'recuperado') and held_on >= current_date - 28)
            / nullif(count(*) filter (where held_on >= current_date - 28), 0), 1) from rec),
    (select round(100.0 * count(*) filter (where status in ('presente', 'recuperado') and held_on < current_date - 28)
            / nullif(count(*) filter (where held_on < current_date - 28), 0), 1) from rec),
    (select count(*) from act where leader_id is null)::int,
    (select count(*) from act where monitor_id is null)::int,
    (select count(*) from enrollments where enrolled_at >= now() - interval '30 days' and status <> 'cancelado')::int,
    (select round(100.0 * count(*) filter (where status = 'aprobado')
            / nullif(count(*) filter (where status in ('aprobado', 'no_completo')), 0), 1) from enrollments)
$$;

-- Asistencia semana a semana
create or replace function panel_semanal(semanas int default 12) returns table (
  semana date, asistieron int, total int, grupos int
)
language sql stable set search_path = public as $$
  select date_trunc('week', m.held_on)::date,
         (count(*) filter (where a.status in ('presente', 'recuperado')))::int,
         count(*)::int,
         count(distinct m.group_id)::int
  from meetings m join attendance a on a.meeting_id = m.id
  where m.held_on >= current_date - (semanas * 7) and m.held_on <= current_date
  group by 1 order by 1
$$;

-- Cada currículum: tamaño, asistencia reciente y resultados históricos
create or replace function panel_curriculums() returns table (
  curriculum_id uuid, nombre text, activo boolean,
  grupos_activos int, personas_activas int, aprobados int, no_completaron int, asistencia_4s numeric
)
language sql stable set search_path = public as $$
  with rec as (
    select cy.curriculum_id,
           count(*) filter (where a.status in ('presente', 'recuperado')) as ok,
           count(*) as total
    from attendance a
      join meetings m on m.id = a.meeting_id
      join groups g on g.id = m.group_id
      join cycles cy on cy.id = g.cycle_id
    where m.held_on >= current_date - 28 and m.held_on <= current_date
    group by 1
  ),
  res as (
    select cy.curriculum_id,
           count(distinct g.id) filter (where g.status in ('abierto', 'en_curso')) as grupos,
           count(distinct e.person_id) filter (where e.status = 'en_curso' and g.status in ('abierto', 'en_curso')) as personas,
           count(*) filter (where e.status = 'aprobado') as aprobados,
           count(*) filter (where e.status = 'no_completo') as no_completaron
    from groups g
      join cycles cy on cy.id = g.cycle_id
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

-- Evolución por temporada
create or replace function panel_temporadas() returns table (
  temporada text, inicio date, grupos int, inscripciones int, personas int, aprobados int, no_completaron int
)
language sql stable set search_path = public as $$
  select s.name, s.start_date,
         count(distinct g.id)::int,
         (count(e.id) filter (where e.status <> 'cancelado'))::int,
         (count(distinct e.person_id) filter (where e.status <> 'cancelado'))::int,
         (count(e.id) filter (where e.status = 'aprobado'))::int,
         (count(e.id) filter (where e.status = 'no_completo'))::int
  from seasons s
    left join groups g on g.season_id = s.id
    left join enrollments e on e.group_id = g.id
  group by s.id, s.name, s.start_date
  order by s.start_date
$$;

-- Continuidad: de quienes aprueban un ciclo, cuántos se inscriben en el siguiente
create or replace function panel_continuidad() returns table (
  curriculum text, ciclo int, aprobados int, continuaron int
)
language sql stable set search_path = public as $$
  with ap as (
    select e.person_id, cy.curriculum_id, cy.number
    from enrollments e
      join groups g on g.id = e.group_id
      join cycles cy on cy.id = g.cycle_id
    where e.status = 'aprobado'
      and exists (select 1 from cycles c3 where c3.curriculum_id = cy.curriculum_id and c3.number = cy.number + 1)
  )
  select cu.name, ap.number,
         count(*)::int,
         (count(*) filter (where exists (
           select 1 from enrollments e2
             join groups g2 on g2.id = e2.group_id
             join cycles cy2 on cy2.id = g2.cycle_id
           where e2.person_id = ap.person_id and cy2.curriculum_id = ap.curriculum_id
             and cy2.number = ap.number + 1 and e2.status <> 'cancelado'
         )))::int
  from ap join curriculums cu on cu.id = ap.curriculum_id
  group by cu.name, ap.number
  order by cu.name, ap.number
$$;

-- Carga y asistencia de cada líder con grupos activos
create or replace function panel_lideres() returns table (
  lider_id uuid, nombre text, grupos int, inscritos int, asistencia_4s numeric
)
language sql stable set search_path = public as $$
  with rec as (
    select m.group_id,
           count(*) filter (where a.status in ('presente', 'recuperado')) as ok,
           count(*) as total
    from attendance a join meetings m on m.id = a.meeting_id
    where m.held_on >= current_date - 28 and m.held_on <= current_date
    group by 1
  ),
  cnt as (
    select e.group_id, count(*) as n from enrollments e where e.status = 'en_curso' group by 1
  )
  select p.id, p.full_name,
         count(*)::int,
         coalesce(sum(cnt.n), 0)::int,
         round(100.0 * sum(rec.ok) / nullif(sum(rec.total), 0), 1)
  from groups g
    join profiles p on p.id = g.leader_id
    left join rec on rec.group_id = g.id
    left join cnt on cnt.group_id = g.id
  where g.status in ('abierto', 'en_curso')
  group by p.id, p.full_name
  order by count(*) desc, p.full_name
$$;

-- Dónde están las personas activas
create or replace function panel_distribucion() returns table (tipo text, etiqueta text, n int)
language sql stable set search_path = public as $$
  with act as (
    select e.person_id, g.modality
    from enrollments e join groups g on g.id = e.group_id
    where e.status = 'en_curso' and g.status in ('abierto', 'en_curso')
  )
  select 'modalidad', modality::text, count(*)::int from act group by modality
  union all
  select 'pais', coalesce(p.country, 'sin dato'), count(distinct act.person_id)::int
  from act join profiles p on p.id = act.person_id group by coalesce(p.country, 'sin dato')
$$;

revoke all on function panel_resumen(), panel_semanal(int), panel_curriculums(), panel_temporadas(),
  panel_continuidad(), panel_lideres(), panel_distribucion() from public, anon;
grant execute on function panel_resumen(), panel_semanal(int), panel_curriculums(), panel_temporadas(),
  panel_continuidad(), panel_lideres(), panel_distribucion() to authenticated;

notify pgrst, 'reload schema';
commit;
