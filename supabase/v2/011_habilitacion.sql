-- ============================================================================
-- 011 · GP 2.0 Fase 6: reconciliación de datos y habilitación por sede.
--
-- Aditiva y repetible. No modifica datos de personas, grupos ni asistencia.
--  · reconciliacion(): compara lo que hay hoy con lo que trajo la importación (informe de importación)
--    y revisa invariantes del modelo nuevo. Solo el administrador.
--  · campus_readiness(): qué le falta a cada sede para empezar a usar GP 2.0.
--  · set_campus_status(): registra en qué etapa de habilitación está cada sede (no bloquea ninguna función).
--  · Corrige una exposición: las versiones publicadas de un currículum y su plan de encuentros los podía leer
--    cualquiera con la llave pública de la aplicación, sin iniciar sesión. Ahora solo quien tiene sesión.
-- ============================================================================
begin;

-- ---------------------------------------------------------------------------
-- 1. Lo que trajo la importación (conteos del informe migracion/salida/informe.json, 9 de octubre de 2026)
-- ---------------------------------------------------------------------------
create table if not exists migration_expected (
  key text primary key,
  label text not null,
  expected bigint not null check (expected >= 0),
  source text not null default 'informe de importación',
  recorded_at timestamptz not null default now()
);

insert into migration_expected (key, label, expected) values
  ('personas', 'Personas', 12713),
  ('historial_roles', 'Historial de roles', 13526),
  ('curriculums', 'Currículums', 37),
  ('coordinadores', 'Coordinadores asignados', 45),
  ('temporadas', 'Temporadas', 17),
  ('ciclos', 'Ciclos', 130),
  ('grupos', 'Grupos', 4190),
  ('inscripciones', 'Inscripciones', 37442),
  ('reuniones', 'Reuniones realizadas', 32958),
  ('asistencia', 'Registros de asistencia', 340104),
  ('recursos', 'Recursos', 230)
on conflict (key) do nothing;

alter table migration_expected enable row level security;
drop policy if exists "admin ve lo esperado" on migration_expected;
create policy "admin ve lo esperado" on migration_expected for select using ((select is_admin()));

-- ---------------------------------------------------------------------------
-- 2. Reconciliación
-- ---------------------------------------------------------------------------
create or replace function reconciliacion() returns table (
  area text, chequeo text, esperado bigint, actual bigint, estado text, detalle text
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Solo el administrador ve la reconciliación.'; end if;

  return query
  -- 2.1 Nada de lo importado se perdió: hoy hay al menos lo que se importó
  with now_counts as (
    select 'personas'::text as k, count(*)::bigint as v from profiles
    union all select 'historial_roles', count(*) from role_history
    union all select 'curriculums', count(*) from curriculums
    union all select 'coordinadores', count(*) from curriculum_coordinators
    union all select 'temporadas', count(*) from seasons
    union all select 'ciclos', count(*) from cycles
    union all select 'grupos', count(*) from groups
    union all select 'inscripciones', count(*) from enrollments
    union all select 'reuniones', count(*) from meetings where status = 'realizada'
    union all select 'asistencia', count(*) from attendance
    union all select 'recursos', count(*) from resources
  )
  select 'Importación'::text, e.label, e.expected, n.v,
         case when n.v >= e.expected then 'ok' else 'error' end,
         case when n.v = e.expected then 'Coincide con lo importado.'
              when n.v > e.expected then 'Creció en ' || (n.v - e.expected) || ' desde la importación.'
              else 'Faltan ' || (e.expected - n.v) || ' respecto de lo importado.' end
    from migration_expected e join now_counts n on n.k = e.key

  union all
  -- 2.2 Invariantes del modelo nuevo: todas deben dar 0
  select 'Modelo'::text, c.label, 0::bigint, c.n, case when c.n = 0 then 'ok' else coalesce(c.level, 'error') end,
         case when c.n = 0 then 'Sin problemas.' else c.n || ' casos para revisar.' end
    from (
      select 'Inscripciones vigentes sin inscripción curricular'::text as label, null::text as level,
             (select count(*) from enrollments where status <> 'cancelado' and curriculum_enrollment_id is null)::bigint as n
      union all select 'Personas con dos inscripciones abiertas al mismo programa', null,
             (select count(*) from (select person_id, curriculum_id from curriculum_enrollments
                                     where status in ('activo', 'pausado') group by 1, 2 having count(*) > 1) x)
      union all select 'Inscripciones curriculares sin versión', null,
             (select count(*) from curriculum_enrollments where version_id is null)
      union all select 'Grupos sin programa o sin versión', null,
             (select count(*) from groups where curriculum_id is null or version_id is null)
      union all select 'Módulos sin versión', null, (select count(*) from cycles where version_id is null)
      union all select 'Direcciones guardadas donde las ve cualquiera', null,
             (select count(*) from groups where address is not null)
      union all select 'Asistencia registrada en reuniones que no se realizaron', null,
             (select count(*) from attendance a join meetings m on m.id = a.meeting_id where m.status <> 'realizada')
      union all select 'Asistencia de una persona en un grupo distinto al de la reunión', null,
             (select count(*) from attendance a join meetings m on m.id = a.meeting_id join enrollments e on e.id = a.enrollment_id
               where e.group_id <> m.group_id)
      union all select 'Unidades acreditadas de otra versión distinta a la de la persona', null,
             (select count(*) from unit_completions uc
                join curriculum_enrollments ce on ce.id = uc.curriculum_enrollment_id
                join lessons l on l.id = uc.unit_id join cycles cy on cy.id = l.cycle_id
               where ce.version_id is not null and cy.version_id <> ce.version_id)
      union all select 'Personas sin historial de roles', null,
             (select count(*) from profiles p where not exists (select 1 from role_history h where h.person_id = p.id))
      union all select 'Certificados de programa vigentes con la inscripción sin completar', 'revisar',
             (select count(*) from certificates c join curriculum_enrollments ce on ce.id = c.curriculum_enrollment_id
               where c.status = 'emitido' and c.kind = 'programa' and ce.status <> 'completado')
    ) c

  union all
  -- 2.3 Lo que la plataforma anterior daba por aprobado quedó como crédito por revisar
  select 'Historial'::text, 'Aprobados por asistencia con su crédito histórico', x.esperado, x.actual,
         case when x.actual >= x.esperado then 'ok' else 'revisar' end,
         case when x.actual >= x.esperado then 'Todos tienen su crédito.'
              else (x.esperado - x.actual) || ' aprobaciones posteriores a la migración no tienen crédito histórico.' end
    from (
      select (select count(*) from (select distinct e.person_id, g.cycle_id from enrollments e join groups g on g.id = e.group_id
               where e.status = 'aprobado' and g.cycle_id is not null) d)::bigint as esperado,
             (select count(*) from stage_credits where source = 'legado_asistencia')::bigint as actual
    ) x

  union all
  -- 2.4 Cifras para mirar (no son errores)
  select 'Para mirar'::text, i.label, null::bigint, i.n, 'info', i.detail
    from (
      select 'Personas sin teléfono'::text as label, (select count(*) from profiles where phone is null and active)::bigint as n, 'Se contactan por correo.'::text as detail
      union all select 'Personas sin sede', (select count(*) from profiles where campus_id is null and active), 'Piden su sede en el perfil.'
      union all select 'Grupos activos sin sede', (select count(*) from groups where campus_id is null and status in ('abierto', 'en_curso')), 'Sin sede, solo el administrador certifica a sus integrantes.'
      union all select 'Grupos activos sin calendario', (select count(*) from groups g where g.status in ('abierto', 'en_curso')
                 and not exists (select 1 from meetings m where m.group_id = g.id and m.season_week is not null)), 'Se planifican desde su calendario.'
      union all select 'Créditos históricos por revisar', (select count(*) from stage_credits where review_status = 'por_revisar'), 'Los revisa el coordinador, módulo por módulo.'
      union all select 'Recuperaciones pendientes', (select count(*) from catchup_plans where status in ('pendiente', 'en_curso')), 'Se atienden en Recuperación.'
      union all select 'Certificados vigentes', (select count(*) from certificates where status = 'emitido'), 'De programa y de etapa.'
    ) i;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Habilitación por sede
-- ---------------------------------------------------------------------------
alter table campuses
  add column if not exists gp2_status text not null default 'preparacion',
  add column if not exists gp2_status_at timestamptz,
  add column if not exists gp2_notes text;

do $$ begin
  alter table campuses add constraint campuses_gp2_status_check check (gp2_status in ('preparacion', 'piloto', 'habilitada'));
exception when duplicate_object then null; end $$;

-- Qué le falta a cada sede. Una sede está lista cuando todos sus grupos activos tienen líder y calendario y
-- hay al menos un pastor designado. "Sin sede" agrupa lo que todavía no se asignó a ninguna.
create or replace function campus_readiness() returns table (
  campus_id uuid, campus text, gp2_status text, gp2_status_at timestamptz,
  grupos_activos int, sin_lider int, sin_respaldo int, sin_calendario int, sesiones_atrasadas int,
  personas int, pastores int, listo boolean, pendientes text[]
)
language plpgsql stable security definer set search_path = public as $$
declare pastor boolean;
begin
  pastor := exists (select 1 from campus_pastors cp where cp.person_id = auth.uid());
  if not (is_admin() or pastor) then raise exception 'Solo el administrador y los pastores de sede ven la habilitación.'; end if;

  return query
  with sedes as (
    select c.id, c.name, c.gp2_status, c.gp2_status_at from campuses c where c.active
    union all select null::uuid, 'Sin sede asignada', null::text, null::timestamptz
  ),
  g as (
    select gr.id, gr.campus_id, gr.leader_id, gr.backup_leader_id,
           exists (select 1 from meetings m where m.group_id = gr.id and m.season_week is not null) as has_calendar,
           (select count(*) from meetings m where m.group_id = gr.id and m.status in ('planificada', 'reprogramada')
               and m.held_on < current_date - 7) as overdue
      from groups gr where gr.status in ('abierto', 'en_curso')
  ),
  gs as (
    select g.campus_id, count(*)::int as n,
           count(*) filter (where g.leader_id is null)::int as no_leader,
           count(*) filter (where g.backup_leader_id is null)::int as no_backup,
           count(*) filter (where not g.has_calendar)::int as no_calendar,
           coalesce(sum(g.overdue), 0)::int as overdue
      from g group by g.campus_id
  ),
  ppl as (
    select u.campus_id, count(distinct u.person_id)::int as n from (
      select p.campus_id, p.id as person_id from profiles p where p.active and p.campus_id is not null
      union
      select g2.campus_id, e.person_id from enrollments e join groups g2 on g2.id = e.group_id
       where e.status in ('preinscrito', 'en_curso') and g2.status in ('abierto', 'en_curso') and g2.campus_id is not null
    ) u group by u.campus_id
  ),
  pas as (select cp.campus_id, count(*)::int as n from campus_pastors cp group by cp.campus_id),
  r as (
    select s.id, s.name, s.gp2_status, s.gp2_status_at,
           coalesce(gs.n, 0) as groups, coalesce(gs.no_leader, 0) as no_leader, coalesce(gs.no_backup, 0) as no_backup,
           coalesce(gs.no_calendar, 0) as no_calendar, coalesce(gs.overdue, 0) as overdue,
           coalesce(ppl.n, 0) as people, coalesce(pas.n, 0) as pastors
      from sedes s
      left join gs on gs.campus_id is not distinct from s.id
      left join ppl on ppl.campus_id = s.id
      left join pas on pas.campus_id = s.id
  )
  select r.id, r.name, r.gp2_status, r.gp2_status_at, r.groups, r.no_leader, r.no_backup, r.no_calendar, r.overdue,
         r.people, r.pastors,
         (r.id is not null and r.groups > 0 and r.no_leader = 0 and r.no_calendar = 0 and r.pastors > 0),
         array_remove(array[
           case when r.id is null and r.groups > 0 then r.groups || ' grupos sin sede asignada' end,
           case when r.id is not null and r.pastors = 0 then 'No hay un pastor designado en la sede' end,
           case when r.no_leader > 0 then r.no_leader || ' grupos sin líder' end,
           case when r.no_calendar > 0 then r.no_calendar || ' grupos sin calendario de sesiones' end
         ], null)
    from r
   where (is_admin() or r.id in (select cp.campus_id from campus_pastors cp where cp.person_id = auth.uid()))
     and (r.id is not null or r.groups > 0)
   order by (r.id is null), r.name;
end $$;

create or replace function set_campus_status(sede uuid, new_status text, notes text default null, force boolean default false)
returns text
language plpgsql security definer set search_path = public as $$
declare r record; old text;
begin
  if not is_admin() then raise exception 'Solo el administrador cambia la etapa de habilitación de una sede.'; end if;
  if new_status not in ('preparacion', 'piloto', 'habilitada') then raise exception 'La etapa debe ser preparacion, piloto o habilitada.'; end if;
  select gp2_status into old from campuses where id = sede;
  if not found then raise exception 'La sede no existe.'; end if;

  if new_status = 'habilitada' and not force then
    select * into r from campus_readiness() x where x.campus_id = sede;
    if not coalesce(r.listo, false) then
      raise exception 'La sede todavía tiene pendientes: %. Resuélvelos o confirma que quieres habilitarla igual.',
        coalesce(array_to_string(r.pendientes, '; '), 'sin grupos activos');
    end if;
  end if;

  update campuses set gp2_status = new_status, gp2_status_at = now(),
         gp2_notes = coalesce(nullif(trim(coalesce(set_campus_status.notes, '')), ''), gp2_notes)
   where id = sede;
  insert into audit_log (actor, action, table_name, record_id, detail)
  values (auth.uid(), 'CAMPUS_STATUS', 'campuses', sede::text,
          jsonb_build_object('de', old, 'a', new_status, 'forzado', force and new_status = 'habilitada'));
  return new_status;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Versiones y planes: solo con sesión iniciada
-- ---------------------------------------------------------------------------
drop policy if exists "ver versiones" on curriculum_versions;
create policy "ver versiones" on curriculum_versions for select to authenticated using (
  status = 'publicado' or (select is_admin()) or coordinates_curriculum(curriculum_id) or is_curriculum_reviewer(curriculum_id));
drop policy if exists "ver planes" on annual_learning_plans;
create policy "ver planes" on annual_learning_plans for select to authenticated using (version_id in (select id from curriculum_versions));
drop policy if exists "ver posiciones" on learning_plan_slots;
create policy "ver posiciones" on learning_plan_slots for select to authenticated using (plan_id in (select id from annual_learning_plans));
drop policy if exists "ver unidades de posiciones" on learning_plan_slot_units;
create policy "ver unidades de posiciones" on learning_plan_slot_units for select to authenticated using (slot_id in (select id from learning_plan_slots));

revoke all on function reconciliacion(), campus_readiness(), set_campus_status(uuid, text, text, boolean) from public, anon;
grant execute on function reconciliacion(), campus_readiness(), set_campus_status(uuid, text, text, boolean) to authenticated;

notify pgrst, 'reload schema';
commit;
