-- ============================================================================
-- 010 · GP 2.0 Fase 5: progreso multianual, AR Hombres a 3 años, requisitos por etapa y certificados.
--
-- Aditiva y repetible. Requiere 006 a 009. No fabrica equivalencias: el año de cada persona se calcula
-- a partir de lo que tiene acreditado o validado, y lo heredado de la plataforma anterior se revisa a mano.
--
-- Decisiones confirmadas por el administrador:
--  · HOMBRES (13 ciclos antiguos) es AR Hombres, de 3 años, con certificación por etapa.
--  · Emiten certificados el administrador y los pastores designados por sede.
-- ============================================================================
begin;

-- ---------------------------------------------------------------------------
-- 1. AR Hombres: tres años y certificable
--    (cómo se reparten los 13 ciclos antiguos entre los años lo define el administrador desde la pantalla del
--     currículum: no se asume ninguna división)
-- ---------------------------------------------------------------------------
update curriculums set duration_years = 3, certifiable = true where name = 'HOMBRES' and duration_years = 1;
update curriculums set offering = 'AR Hombres' where name = 'HOMBRES' and offering is null;

-- ---------------------------------------------------------------------------
-- 2. Sede de cada persona y seguimiento de reincorporaciones
-- ---------------------------------------------------------------------------
alter table profiles add column if not exists campus_id uuid references campuses(id) on delete set null;

alter table curriculum_enrollments
  add column if not exists resumed_count int not null default 0,
  add column if not exists resumed_at timestamptz;

create or replace function ce_track_resume() returns trigger
language plpgsql as $$
begin
  if old.status = 'pausado' and new.status = 'activo' then
    new.resumed_count := old.resumed_count + 1;
    new.resumed_at := now();
  end if;
  return new;
end $$;
drop trigger if exists trg_ce_track_resume on curriculum_enrollments;
create trigger trg_ce_track_resume before update on curriculum_enrollments for each row execute function ce_track_resume();

drop trigger if exists trg_audit_ce_year on curriculum_enrollments;
create trigger trg_audit_ce_year after update of formative_year on curriculum_enrollments
for each row when (old.formative_year is distinct from new.formative_year) execute function audit_trigger();

-- ---------------------------------------------------------------------------
-- 3. Requisitos por etapa (año formativo) y pastores por sede
-- ---------------------------------------------------------------------------
create table if not exists year_requirements (
  version_id uuid not null references curriculum_versions(id) on delete cascade,
  formative_year int not null check (formative_year >= 1),
  min_pct numeric not null default 100 check (min_pct > 0 and min_pct <= 100),
  updated_by uuid references profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (version_id, formative_year)
);

create table if not exists campus_pastors (
  person_id uuid not null references profiles(id) on delete cascade,
  campus_id uuid not null references campuses(id) on delete cascade,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (person_id, campus_id)
);

alter table stage_credits
  add column if not exists reviewed_by uuid references profiles(id) on delete set null,
  add column if not exists reviewed_at timestamptz;

-- ---------------------------------------------------------------------------
-- 4. Certificados
-- ---------------------------------------------------------------------------
create table if not exists certificates (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)),
  curriculum_enrollment_id uuid not null references curriculum_enrollments(id) on delete restrict,
  person_id uuid not null references profiles(id) on delete restrict,
  curriculum_id uuid not null references curriculums(id) on delete restrict,
  version_id uuid references curriculum_versions(id) on delete set null,
  kind text not null check (kind in ('etapa', 'programa')),
  formative_year int check (formative_year is null or formative_year >= 1),
  campus_id uuid references campuses(id) on delete set null,
  status text not null default 'emitido' check (status in ('emitido', 'revocado')),
  issued_by uuid references profiles(id) on delete set null,
  issued_at timestamptz not null default now(),
  revoked_by uuid references profiles(id) on delete set null,
  revoked_at timestamptz,
  revoked_reason text,
  rule_snapshot jsonb not null default '{}'::jsonb,
  check ((kind = 'etapa' and formative_year is not null) or (kind = 'programa' and formative_year is null))
);
create unique index if not exists certificates_one_active
  on certificates (curriculum_enrollment_id, kind, coalesce(formative_year, 0)) where status = 'emitido';
create index if not exists certificates_person_idx on certificates (person_id);
create index if not exists certificates_curriculum_idx on certificates (curriculum_id, status);

-- ---------------------------------------------------------------------------
-- 5. Avance por año: el cálculo central
--    Cada unidad cuenta como un ítem. Un módulo heredado sin unidades cuenta como un ítem y se da por
--    cumplido solo si su crédito histórico fue VALIDADO por una persona.
-- ---------------------------------------------------------------------------
create or replace function _year_status(ce_filter uuid default null, cur_filter uuid default null)
returns table (
  ce_id uuid, person_id uuid, curriculum_id uuid, version_id uuid, formative_year int,
  items_total int, items_done int, pct numeric, min_pct numeric, met boolean
)
language sql stable security definer set search_path = public as $$
  with ces as (
    select c.id, c.person_id, c.curriculum_id, c.version_id, cu.duration_years
      from curriculum_enrollments c join curriculums cu on cu.id = c.curriculum_id
     where c.version_id is not null and c.status <> 'cancelado'
       and (ce_filter is null or c.id = ce_filter)
       and (cur_filter is null or c.curriculum_id = cur_filter)
  ),
  cyc as (
    select cy.id, cy.version_id, cy.formative_year,
           greatest(count(l.id), 1)::int as items, (count(l.id) = 0) as legacy
      from cycles cy left join lessons l on l.cycle_id = cy.id
     where cy.version_id in (select version_id from ces)
     group by cy.id
  ),
  tot as (select version_id, formative_year, sum(items)::int as items_total from cyc group by 1, 2),
  maxy as (select version_id, max(formative_year) as m from cyc group by 1),
  yrs as (
    select ces.id as ce_id, ces.person_id, ces.curriculum_id, ces.version_id, y.n as formative_year
      from ces
      left join maxy on maxy.version_id = ces.version_id
      cross join lateral generate_series(1, greatest(ces.duration_years, coalesce(maxy.m, 1))) y(n)
  ),
  du as (
    select ces.id as ce_id, cy.formative_year, count(*)::int as n
      from ces
      join unit_completions uc on uc.curriculum_enrollment_id = ces.id
      join lessons l on l.id = uc.unit_id
      join cycles cy on cy.id = l.cycle_id and cy.version_id = ces.version_id
     group by 1, 2
  ),
  ds as (
    select ces.id as ce_id, cyc.formative_year, count(distinct sc.stage_id)::int as n
      from ces
      join stage_credits sc on sc.person_id = ces.person_id and sc.review_status = 'validado'
      join cyc on cyc.id = sc.stage_id and cyc.version_id = ces.version_id and cyc.legacy
     group by 1, 2
  )
  select y.ce_id, y.person_id, y.curriculum_id, y.version_id, y.formative_year,
         coalesce(t.items_total, 0),
         least(coalesce(du.n, 0) + coalesce(ds.n, 0), coalesce(t.items_total, 0)),
         case when coalesce(t.items_total, 0) = 0 then null
              else round(100.0 * least(coalesce(du.n, 0) + coalesce(ds.n, 0), t.items_total) / t.items_total, 1) end,
         coalesce(r.min_pct, 100),
         coalesce(t.items_total, 0) > 0
           and 100.0 * least(coalesce(du.n, 0) + coalesce(ds.n, 0), t.items_total) >= coalesce(r.min_pct, 100) * t.items_total
    from yrs y
    left join tot t on t.version_id = y.version_id and t.formative_year = y.formative_year
    left join du on du.ce_id = y.ce_id and du.formative_year = y.formative_year
    left join ds on ds.ce_id = y.ce_id and ds.formative_year = y.formative_year
    left join year_requirements r on r.version_id = y.version_id and r.formative_year = y.formative_year
$$;
revoke all on function _year_status(uuid, uuid) from public, anon, authenticated;

-- Sede de una persona en un programa: la de su grupo vigente (o el último) y, si no la hay, la de su perfil
create or replace function person_campus_of(ce uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select g.campus_id from enrollments e join groups g on g.id = e.group_id
      where e.curriculum_enrollment_id = ce and g.campus_id is not null
      order by (e.status in ('preinscrito', 'en_curso')) desc, e.enrolled_at desc limit 1),
    (select p.campus_id from curriculum_enrollments c join profiles p on p.id = c.person_id where c.id = ce))
$$;

create or replace function can_issue_certificate(ce uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_admin() or exists (
    select 1 from campus_pastors cp
     where cp.person_id = auth.uid() and cp.campus_id is not null and cp.campus_id = person_campus_of(ce))
$$;

-- Avance de una persona, año por año
create or replace function year_status(ce uuid) returns table (
  formative_year int, items_total int, items_done int, pct numeric, min_pct numeric, met boolean, is_current boolean
)
language plpgsql stable security definer set search_path = public as $$
declare c record;
begin
  select * into c from curriculum_enrollments where id = ce;
  if not found then raise exception 'La inscripción no existe.'; end if;
  if c.person_id <> auth.uid() and not can_manage_enrollment(ce) then raise exception 'No tienes permiso para ver este avance.'; end if;
  return query
    select s.formative_year, s.items_total, s.items_done, s.pct, s.min_pct, s.met, (s.formative_year = c.formative_year)
      from _year_status(ce) s order by s.formative_year;
end $$;

-- Cada encuentro del plan de un año y cuánto de su contenido ya está acreditado
create or replace function plan_progress(ce uuid, year int default null) returns table (
  week int, kind text, title text, units_total int, units_done int, state text
)
language plpgsql stable security definer set search_path = public as $$
declare c record; y int;
begin
  select * into c from curriculum_enrollments where id = ce;
  if not found then raise exception 'La inscripción no existe.'; end if;
  if c.person_id <> auth.uid() and not can_manage_enrollment(ce) then raise exception 'No tienes permiso para ver este avance.'; end if;
  y := coalesce(year, c.formative_year);
  return query
    select s.position, s.kind, s.title,
           (select count(*) from learning_plan_slot_units su where su.slot_id = s.id)::int,
           (select count(*) from learning_plan_slot_units su join unit_completions uc on uc.unit_id = su.unit_id and uc.curriculum_enrollment_id = ce
             where su.slot_id = s.id)::int,
           case
             when not exists (select 1 from learning_plan_slot_units su where su.slot_id = s.id) then 'sin_unidades'
             when (select count(*) from learning_plan_slot_units su where su.slot_id = s.id)
                = (select count(*) from learning_plan_slot_units su join unit_completions uc on uc.unit_id = su.unit_id and uc.curriculum_enrollment_id = ce
                    where su.slot_id = s.id) then 'hecha'
             when exists (select 1 from learning_plan_slot_units su join unit_completions uc on uc.unit_id = su.unit_id and uc.curriculum_enrollment_id = ce
                    where su.slot_id = s.id) then 'parcial'
             else 'pendiente' end
      from annual_learning_plans p join learning_plan_slots s on s.plan_id = p.id
     where p.version_id = c.version_id and p.formative_year = y
     order by s.position;
end $$;

-- ---------------------------------------------------------------------------
-- 6. Avanzar de año: solo con la etapa cumplida; nada se reinicia ni avanza por calendario
-- ---------------------------------------------------------------------------
create or replace function advance_formative_year(ce uuid) returns int
language plpgsql security definer set search_path = public as $$
declare c record; cu record; cur record; last_year int;
begin
  select * into c from curriculum_enrollments where id = ce;
  if not found then raise exception 'La inscripción no existe.'; end if;
  if c.person_id <> auth.uid() and not can_manage_enrollment(ce) then raise exception 'No tienes permiso para cambiar esta inscripción.'; end if;
  if c.status not in ('activo', 'pausado') then raise exception 'Esta inscripción ya no está abierta.'; end if;

  select duration_years into cu from curriculums where id = c.curriculum_id;
  select * into cur from _year_status(ce) s where s.formative_year = c.formative_year;
  if not found or not cur.met then
    raise exception 'Todavía no se cumplen los requisitos del año %: lleva % de % (se piden al menos % %%).',
      c.formative_year, coalesce(cur.items_done, 0), coalesce(cur.items_total, 0), coalesce(cur.min_pct, 100);
  end if;
  select max(s.formative_year) into last_year from _year_status(ce) s;
  if c.formative_year >= last_year then
    raise exception 'Ya cumpliste el último año del programa: pide tu certificado.';
  end if;
  update curriculum_enrollments set formative_year = c.formative_year + 1 where id = ce;
  return c.formative_year + 1;
end $$;

-- El año actual se deduce de la evidencia: el primero que todavía no se cumple (o el último, si están todos)
create or replace function recompute_formative_years(cid uuid) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not (is_admin() or coordinates_curriculum(cid)) then raise exception 'Solo el administrador o el coordinador recalculan los años.'; end if;
  with st as (
    select s.ce_id,
           coalesce(min(s.formative_year) filter (where not s.met), max(s.formative_year)) as y
      from _year_status(null, cid) s group by s.ce_id
  )
  update curriculum_enrollments c set formative_year = st.y
    from st where st.ce_id = c.id and c.status in ('activo', 'pausado') and c.formative_year is distinct from st.y;
  get diagnostics n = row_count;
  return n;
end $$;

-- Los grupos toman el año de su módulo (útil después de asignar años a los módulos heredados)
create or replace function resync_group_years(cid uuid) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not (is_admin() or coordinates_curriculum(cid)) then raise exception 'Solo el administrador o el coordinador sincronizan los grupos.'; end if;
  update groups g set formative_year = cy.formative_year
    from cycles cy where cy.id = g.cycle_id and g.curriculum_id = cid and g.formative_year is distinct from cy.formative_year;
  get diagnostics n = row_count;
  return n;
end $$;

-- Los grupos que se ofrecen son los del año en que está la persona
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
    and g.formative_year = c.formative_year
    and g.status in ('abierto', 'en_curso')
    and s.status in ('inscripciones', 'en_curso')
    and (c.version_id is null or g.version_id is null or g.version_id = c.version_id)
    and group_enrolled_count(g.id) < g.capacity
  order by g.modality, g.weekday, g.start_time;
end $$;

-- ---------------------------------------------------------------------------
-- 7. Revisión de lo heredado: los créditos de la plataforma anterior los valida una persona
-- ---------------------------------------------------------------------------
create or replace function stage_credit_summary(cid uuid) returns table (
  stage_id uuid, number int, title text, formative_year int, version int, por_revisar int, validado int, rechazado int
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not (is_admin() or coordinates_curriculum(cid)) then raise exception 'No tienes permiso para revisar los créditos de este programa.'; end if;
  return query
    select cy.id, cy.number, cy.title, cy.formative_year, v.version,
           (count(*) filter (where sc.review_status = 'por_revisar'))::int,
           (count(*) filter (where sc.review_status = 'validado'))::int,
           (count(*) filter (where sc.review_status = 'rechazado'))::int
      from cycles cy
      join curriculum_versions v on v.id = cy.version_id
      left join stage_credits sc on sc.stage_id = cy.id
     where cy.curriculum_id = cid
     group by cy.id, v.version
     order by v.version, cy.formative_year, cy.number;
end $$;

create or replace function stage_credit_people(stage uuid, only_status text default null, lim int default 50, skip int default 0)
returns table (person_id uuid, full_name text, review_status text, credited_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare cid uuid;
begin
  select curriculum_id into cid from cycles where id = stage;
  if cid is null then raise exception 'El módulo no existe.'; end if;
  if not (is_admin() or coordinates_curriculum(cid)) then raise exception 'No tienes permiso para revisar los créditos de este programa.'; end if;
  return query
    select sc.person_id, p.full_name, sc.review_status, sc.credited_at
      from stage_credits sc join profiles p on p.id = sc.person_id
     where sc.stage_id = stage and (only_status is null or sc.review_status = only_status)
     order by p.full_name, sc.person_id
     limit least(greatest(lim, 1), 200) offset greatest(skip, 0);
end $$;

create or replace function review_stage_credits(stage uuid, decision text, persons uuid[] default null, note text default null)
returns int
language plpgsql security definer set search_path = public as $$
declare cid uuid; n int;
begin
  select curriculum_id into cid from cycles where id = stage;
  if cid is null then raise exception 'El módulo no existe.'; end if;
  if not (is_admin() or coordinates_curriculum(cid)) then raise exception 'No tienes permiso para revisar los créditos de este programa.'; end if;
  if decision not in ('validado', 'rechazado', 'por_revisar') then raise exception 'La decisión debe ser validado, rechazado o por_revisar.'; end if;

  update stage_credits
     set review_status = decision, reviewed_by = auth.uid(), reviewed_at = now(), note = coalesce(nullif(trim(coalesce(review_stage_credits.note, '')), ''), stage_credits.note)
   where stage_id = stage and review_status <> decision and (persons is null or person_id = any(persons));
  get diagnostics n = row_count;

  insert into audit_log (actor, action, table_name, record_id, detail)
  values (auth.uid(), 'REVIEW', 'stage_credits', stage::text,
          jsonb_build_object('decision', decision, 'personas', n, 'todas', persons is null, 'nota', nullif(trim(coalesce(note, '')), '')));
  return n;
end $$;

-- ---------------------------------------------------------------------------
-- 8. Quién puede certificarse, emitir, revocar y verificar
-- ---------------------------------------------------------------------------
create or replace function certificate_candidates(cid uuid, y int default null, lim int default 200)
returns table (
  ce_id uuid, person_id uuid, person_name text, campus_id uuid, campus text,
  kind text, formative_year int, pct numeric, can_issue boolean
)
language plpgsql stable security definer set search_path = public as $$
declare years int; pastor boolean;
begin
  pastor := exists (select 1 from campus_pastors cp where cp.person_id = auth.uid());
  if not (is_admin() or coordinates_curriculum(cid) or pastor) then
    raise exception 'No tienes permiso para ver quién puede certificarse.';
  end if;
  if not exists (select 1 from curriculums where id = cid and certifiable) then return; end if;

  return query
  with st as (select * from _year_status(null, cid)),
  per_ce as (
    select s.ce_id, s.person_id, count(*) as n_years, count(*) filter (where s.met) as n_met, round(avg(coalesce(s.pct, 0)), 1) as pct
      from st s group by s.ce_id, s.person_id
  ),
  base as (
    -- programa completo: todos los años cumplidos
    select p.ce_id, p.person_id, 'programa'::text as kind, null::int as formative_year, p.pct
      from per_ce p where y is null and p.n_met = p.n_years
    union all
    -- una etapa: ese año cumplido (solo programas de más de un año)
    select s.ce_id, s.person_id, 'etapa', s.formative_year, s.pct
      from st s where y is not null and s.formative_year = y and s.met
       and (select duration_years from curriculums where id = cid) > 1
  ),
  withc as (
    select b.*, person_campus_of(b.ce_id) as campus_id from base b
     where not exists (
       select 1 from certificates c
        where c.curriculum_enrollment_id = b.ce_id and c.kind = b.kind
          and coalesce(c.formative_year, 0) = coalesce(b.formative_year, 0) and c.status = 'emitido')
  )
  select w.ce_id, w.person_id, pr.full_name, w.campus_id, ca.name, w.kind, w.formative_year, w.pct,
         (is_admin() or (w.campus_id is not null and exists (
            select 1 from campus_pastors cp where cp.person_id = auth.uid() and cp.campus_id = w.campus_id)))
    from withc w
    join profiles pr on pr.id = w.person_id
    left join campuses ca on ca.id = w.campus_id
   where is_admin() or coordinates_curriculum(cid)
      or (w.campus_id is not null and exists (select 1 from campus_pastors cp where cp.person_id = auth.uid() and cp.campus_id = w.campus_id))
   order by pr.full_name, w.ce_id
   limit least(greatest(lim, 1), 500);
end $$;

create or replace function issue_certificate(ce uuid, year int default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  c record; cu record; v record; cert_kind text; existing uuid; nid uuid; snap jsonb; missing text; campus uuid;
begin
  select * into c from curriculum_enrollments where id = ce;
  if not found then raise exception 'La inscripción no existe.'; end if;
  if not can_issue_certificate(ce) then
    raise exception 'Solo el administrador o el pastor designado en la sede de la persona emiten certificados.';
  end if;
  select * into cu from curriculums where id = c.curriculum_id;
  if not cu.certifiable then raise exception 'Este programa no entrega certificado.'; end if;
  cert_kind := case when year is null then 'programa' else 'etapa' end;
  if cert_kind = 'etapa' and cu.duration_years <= 1 then raise exception 'Este programa dura un solo año: el certificado es del programa completo.'; end if;

  select string_agg('año ' || s.formative_year || ' (' || s.items_done || ' de ' || s.items_total || ', se pide ' || s.min_pct || ' %)', ', ' order by s.formative_year)
    into missing
    from _year_status(ce) s
   where not s.met and (cert_kind = 'programa' or s.formative_year = year);
  if missing is not null then raise exception 'Todavía no cumple los requisitos: %.', missing; end if;
  if cert_kind = 'etapa' and not exists (select 1 from _year_status(ce) s where s.formative_year = year) then
    raise exception 'Ese año no existe en el programa.';
  end if;

  select id into existing from certificates
   where curriculum_enrollment_id = ce and certificates.kind = cert_kind
     and coalesce(formative_year, 0) = coalesce(year, 0) and status = 'emitido';
  if existing is not null then return existing; end if;

  select version, label into v from curriculum_versions where id = c.version_id;
  campus := person_campus_of(ce);
  select jsonb_build_object(
           'version', v.version, 'etiqueta_version', v.label,
           'anios', coalesce(jsonb_agg(jsonb_build_object('anio', s.formative_year, 'items', s.items_total, 'cumplidos', s.items_done,
                                                           'minimo_pct', s.min_pct, 'cumplido', s.met) order by s.formative_year), '[]'::jsonb),
           'sede', (select name from campuses where id = campus),
           'programa', cu.name)
    into snap from _year_status(ce) s;

  insert into certificates (curriculum_enrollment_id, person_id, curriculum_id, version_id, kind, formative_year, campus_id, issued_by, rule_snapshot)
  values (ce, c.person_id, c.curriculum_id, c.version_id, cert_kind, year, campus, auth.uid(), snap)
  returning id into nid;

  if cert_kind = 'programa' then
    update curriculum_enrollments set status = 'completado', completed_at = current_date where id = ce and status in ('activo', 'pausado');
  end if;
  insert into audit_log (actor, action, table_name, record_id, detail)
  values (auth.uid(), 'ISSUE', 'certificates', nid::text, jsonb_build_object('tipo', cert_kind, 'anio', year, 'persona', c.person_id));
  return nid;
end $$;

create or replace function revoke_certificate(cert uuid, reason text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Solo el administrador revoca certificados.'; end if;
  if length(trim(coalesce(reason, ''))) < 3 then raise exception 'Indica el motivo de la revocación.'; end if;
  update certificates set status = 'revocado', revoked_by = auth.uid(), revoked_at = now(), revoked_reason = trim(reason)
   where id = cert and status = 'emitido';
  if not found then raise exception 'El certificado no existe o ya estaba revocado.'; end if;
  insert into audit_log (actor, action, table_name, record_id, detail)
  values (auth.uid(), 'REVOKE', 'certificates', cert::text, jsonb_build_object('motivo', trim(reason)));
end $$;

-- Verificación pública: solo con el código, y solo lo mínimo para comprobar que es auténtico
create or replace function verify_certificate(code text)
returns table (full_name text, program text, kind text, formative_year int, issued_at timestamptz, status text, campus text)
language sql stable security definer set search_path = public as $$
  select p.full_name, cu.name, c.kind, c.formative_year, c.issued_at, c.status, ca.name
    from certificates c
    join profiles p on p.id = c.person_id
    join curriculums cu on cu.id = c.curriculum_id
    left join campuses ca on ca.id = c.campus_id
   where c.code = upper(regexp_replace(trim(coalesce(verify_certificate.code, '')), '[^A-Za-z0-9]', '', 'g'))
$$;

-- ---------------------------------------------------------------------------
-- 9. Cifras de formación (separadas de la asistencia)
-- ---------------------------------------------------------------------------
create or replace function panel_formacion() returns table (
  personas_unicas int, activos int, pausados int, completados int, reincorporados int,
  asistentes_30d int, certificados_programa int, certificados_etapa int
)
language sql stable set search_path = public as $$
  select
    (select count(distinct person_id) from curriculum_enrollments where status <> 'cancelado')::int,
    (select count(*) from curriculum_enrollments where status = 'activo')::int,
    (select count(*) from curriculum_enrollments where status = 'pausado')::int,
    (select count(*) from curriculum_enrollments where status = 'completado')::int,
    (select count(*) from curriculum_enrollments where resumed_count > 0 and status = 'activo')::int,
    (select count(distinct e.person_id)
       from attendance a join meetings m on m.id = a.meeting_id join enrollments e on e.id = a.enrollment_id
      where m.status = 'realizada' and m.held_on >= current_date - 30 and m.held_on <= current_date
        and a.status in ('presente', 'recuperado'))::int,
    (select count(*) from certificates where status = 'emitido' and kind = 'programa')::int,
    (select count(*) from certificates where status = 'emitido' and kind = 'etapa')::int
$$;

-- ---------------------------------------------------------------------------
-- 10. Acceso por fila
-- ---------------------------------------------------------------------------
alter table year_requirements enable row level security;
alter table campus_pastors enable row level security;
alter table certificates enable row level security;

drop policy if exists "ver requisitos por año" on year_requirements;
create policy "ver requisitos por año" on year_requirements for select using (
  exists (select 1 from curriculum_versions v where v.id = version_id
          and ((select is_admin()) or coordinates_curriculum(v.curriculum_id) or is_curriculum_reviewer(v.curriculum_id))));
drop policy if exists "gestionar requisitos por año" on year_requirements;
create policy "gestionar requisitos por año" on year_requirements for all
  using (exists (select 1 from curriculum_versions v where v.id = version_id and ((select is_admin()) or coordinates_curriculum(v.curriculum_id))))
  with check (exists (select 1 from curriculum_versions v where v.id = version_id and ((select is_admin()) or coordinates_curriculum(v.curriculum_id))));

drop policy if exists "ver pastores por sede" on campus_pastors;
create policy "ver pastores por sede" on campus_pastors for select using ((select is_admin()) or person_id = (select auth.uid()));
drop policy if exists "admin gestiona pastores por sede" on campus_pastors;
create policy "admin gestiona pastores por sede" on campus_pastors for all using ((select is_admin())) with check ((select is_admin()));

drop policy if exists "ver certificados" on certificates;
create policy "ver certificados" on certificates for select using (
  person_id = (select auth.uid()) or (select is_admin()) or coordinates_curriculum(curriculum_id)
  or (campus_id is not null and campus_id in (select cp.campus_id from campus_pastors cp where cp.person_id = (select auth.uid()))));
-- los certificados solo se crean y cambian con issue_certificate / revoke_certificate

-- ---------------------------------------------------------------------------
-- 11. Permisos de ejecución
-- ---------------------------------------------------------------------------
revoke all on function person_campus_of(uuid), can_issue_certificate(uuid) from public, anon, authenticated;
revoke all on function year_status(uuid), plan_progress(uuid, int),
  advance_formative_year(uuid), recompute_formative_years(uuid), resync_group_years(uuid), stage_credit_summary(uuid),
  stage_credit_people(uuid, text, int, int), review_stage_credits(uuid, text, uuid[], text), certificate_candidates(uuid, int, int),
  issue_certificate(uuid, int), revoke_certificate(uuid, text), verify_certificate(text), panel_formacion()
  from public, anon;
grant execute on function year_status(uuid), plan_progress(uuid, int),
  advance_formative_year(uuid), recompute_formative_years(uuid), resync_group_years(uuid), stage_credit_summary(uuid),
  stage_credit_people(uuid, text, int, int), review_stage_credits(uuid, text, uuid[], text), certificate_candidates(uuid, int, int),
  issue_certificate(uuid, int), revoke_certificate(uuid, text), verify_certificate(text), panel_formacion()
  to authenticated;
grant execute on function verify_certificate(text) to anon;

notify pgrst, 'reload schema';
commit;
