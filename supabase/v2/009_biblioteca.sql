-- ============================================================================
-- 009 · GP 2.0 Fase 4: biblioteca de materiales, editor curricular con versiones y
--      flujo de aprobación pastoral, y plan de 36 encuentros editable.
--
-- Aditiva y repetible. Requiere 006, 007 y 008. No inventa contenido: solo estructura.
--
-- También corrige dos cosas de fases anteriores:
--  · "gestionar unidades de posiciones" (006) dejaba a cualquiera que viera un plan
--    publicado cambiar sus unidades. Ahora solo el administrador o el coordinador.
--  · create_continuation (001) copiaba la dirección desde groups.address, que desde 006 está vacía;
--    ahora copia los datos protegidos, el respaldo y la sede.
-- ============================================================================
begin;

-- ---------------------------------------------------------------------------
-- 1. Versiones: congelado y bitácora del flujo editorial
-- ---------------------------------------------------------------------------
alter table curriculum_versions add column if not exists content_frozen boolean not null default false;

create table if not exists version_events (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references curriculum_versions(id) on delete cascade,
  from_status editorial_status,
  to_status editorial_status not null,
  actor uuid references profiles(id) on delete set null,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists version_events_version_idx on version_events (version_id, created_at);
alter table version_events enable row level security;
drop policy if exists "ver bitácora editorial" on version_events;
create policy "ver bitácora editorial" on version_events for select using (
  exists (select 1 from curriculum_versions v where v.id = version_id
          and ((select is_admin()) or coordinates_curriculum(v.curriculum_id) or is_curriculum_reviewer(v.curriculum_id))));

-- Una versión se puede editar mientras se prepara. Una versión heredada (ya publicada antes de existir
-- el flujo) sigue editable hasta que se reemplace por una versión aprobada.
create or replace function version_is_editable(vid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select not v.content_frozen and v.status in ('cargado', 'en_adaptacion', 'publicado')
       from curriculum_versions v where v.id = vid),
    true)
$$;

create or replace function guard_version_content() returns trigger
language plpgsql security definer set search_path = public as $$
declare vid uuid; old_vid uuid;
begin
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then return old; end if;
  -- los cambios de estado del flujo editorial actualizan el plan junto con la versión
  if tg_op = 'UPDATE' and coalesce(current_setting('app.version_workflow', true), '') = 'on' then return new; end if;

  if tg_table_name = 'cycles' then
    if tg_op <> 'DELETE' then vid := new.version_id; end if;
    if tg_op <> 'INSERT' then old_vid := old.version_id; end if;
  elsif tg_table_name = 'lessons' then
    if tg_op <> 'DELETE' then select version_id into vid from cycles where id = new.cycle_id; end if;
    if tg_op <> 'INSERT' then select version_id into old_vid from cycles where id = old.cycle_id; end if;
  elsif tg_table_name = 'annual_learning_plans' then
    if tg_op <> 'DELETE' then vid := new.version_id; end if;
    if tg_op <> 'INSERT' then old_vid := old.version_id; end if;
  elsif tg_table_name = 'learning_plan_slots' then
    if tg_op <> 'DELETE' then select version_id into vid from annual_learning_plans where id = new.plan_id; end if;
    if tg_op <> 'INSERT' then select version_id into old_vid from annual_learning_plans where id = old.plan_id; end if;
  elsif tg_table_name = 'learning_plan_slot_units' then
    if tg_op <> 'DELETE' then
      select p.version_id into vid from learning_plan_slots s join annual_learning_plans p on p.id = s.plan_id where s.id = new.slot_id;
    end if;
    if tg_op <> 'INSERT' then
      select p.version_id into old_vid from learning_plan_slots s join annual_learning_plans p on p.id = s.plan_id where s.id = old.slot_id;
    end if;
  elsif tg_table_name = 'unit_prerequisites' then
    if tg_op <> 'DELETE' then select cy.version_id into vid from lessons l join cycles cy on cy.id = l.cycle_id where l.id = new.unit_id; end if;
    if tg_op <> 'INSERT' then select cy.version_id into old_vid from lessons l join cycles cy on cy.id = l.cycle_id where l.id = old.unit_id; end if;
  end if;

  if (vid is not null and not version_is_editable(vid)) or (old_vid is not null and not version_is_editable(old_vid)) then
    raise exception 'Esta versión está en revisión o publicada y no se puede editar: crea una versión nueva a partir de ella.';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;

do $$
declare t text;
begin
  foreach t in array array['cycles', 'lessons', 'annual_learning_plans', 'learning_plan_slots', 'learning_plan_slot_units', 'unit_prerequisites'] loop
    execute format('drop trigger if exists trg_guard_version_content on %I', t);
    execute format('create trigger trg_guard_version_content before insert or update or delete on %I for each row execute function guard_version_content()', t);
  end loop;
end $$;

-- Los módulos se numeran dentro de cada versión (antes, dentro del currículum)
alter table cycles drop constraint if exists cycles_curriculum_id_number_key;
do $$ begin
  alter table cycles add constraint cycles_version_number_key unique (version_id, number);
exception when duplicate_table or duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- 2. Corrección de permisos de las unidades de cada posición del plan
-- ---------------------------------------------------------------------------
drop policy if exists "gestionar unidades de posiciones" on learning_plan_slot_units;
create policy "gestionar unidades de posiciones" on learning_plan_slot_units for all
  using (slot_id in (
    select s.id from learning_plan_slots s
      join annual_learning_plans p on p.id = s.plan_id
      join curriculum_versions v on v.id = p.version_id
     where (select is_admin()) or coordinates_curriculum(v.curriculum_id)))
  with check (slot_id in (
    select s.id from learning_plan_slots s
      join annual_learning_plans p on p.id = s.plan_id
      join curriculum_versions v on v.id = p.version_id
     where (select is_admin()) or coordinates_curriculum(v.curriculum_id)));

-- ---------------------------------------------------------------------------
-- 3. Nueva versión a partir de otra (el original y las versiones anteriores se preservan)
-- ---------------------------------------------------------------------------
create or replace function clone_version(from_vid uuid, new_label text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  src record; nv uuid := gen_random_uuid(); nver int;
  c record; l record; p record; s record; u record;
  nc uuid; nl uuid; np uuid; ns uuid;
  cmap jsonb := '{}'::jsonb; lmap jsonb := '{}'::jsonb; smap jsonb := '{}'::jsonb;
begin
  select * into src from curriculum_versions where id = from_vid;
  if not found then raise exception 'La versión no existe.'; end if;
  if not (is_admin() or coordinates_curriculum(src.curriculum_id)) then
    raise exception 'Solo el administrador o el coordinador crean versiones nuevas.';
  end if;

  select coalesce(max(version), 0) + 1 into nver from curriculum_versions where curriculum_id = src.curriculum_id;
  insert into curriculum_versions (id, curriculum_id, version, label, status, is_current, source_note, created_by)
  values (nv, src.curriculum_id, nver, coalesce(nullif(trim(new_label), ''), 'Edición ' || nver), 'cargado', false,
          'Copia de la versión ' || src.version, auth.uid());

  for c in select * from cycles where version_id = from_vid order by number loop
    nc := gen_random_uuid();
    insert into cycles (id, curriculum_id, number, title, classes, version_id, stage_kind, formative_year)
    values (nc, c.curriculum_id, c.number, c.title, c.classes, nv, c.stage_kind, c.formative_year);
    cmap := cmap || jsonb_build_object(c.id::text, nc::text);
  end loop;
  for c in select * from cycles where version_id = from_vid and prerequisite_cycle_id is not null loop
    update cycles set prerequisite_cycle_id = (cmap ->> c.prerequisite_cycle_id::text)::uuid
     where id = (cmap ->> c.id::text)::uuid;
  end loop;

  for l in select l0.* from lessons l0 join cycles cy on cy.id = l0.cycle_id where cy.version_id = from_vid order by cy.number, l0.number loop
    nl := gen_random_uuid();
    insert into lessons (id, cycle_id, number, title, summary, content, questions, video_url, objective, unit_kind)
    values (nl, (cmap ->> l.cycle_id::text)::uuid, l.number, l.title, l.summary, l.content, l.questions, l.video_url, l.objective, l.unit_kind);
    lmap := lmap || jsonb_build_object(l.id::text, nl::text);
  end loop;

  for u in select pr.* from unit_prerequisites pr where pr.unit_id::text in (select jsonb_object_keys(lmap)) loop
    if lmap ? u.requires_unit_id::text then
      insert into unit_prerequisites values ((lmap ->> u.unit_id::text)::uuid, (lmap ->> u.requires_unit_id::text)::uuid);
    end if;
  end loop;

  for p in select * from annual_learning_plans where version_id = from_vid loop
    np := gen_random_uuid();
    insert into annual_learning_plans (id, version_id, formative_year, title, status) values (np, nv, p.formative_year, p.title, 'cargado');
    for s in select * from learning_plan_slots where plan_id = p.id loop
      ns := gen_random_uuid();
      insert into learning_plan_slots (id, plan_id, position, kind, title, notes) values (ns, np, s.position, s.kind, s.title, s.notes);
      smap := smap || jsonb_build_object(s.id::text, ns::text);
    end loop;
    for u in select su.* from learning_plan_slot_units su join learning_plan_slots s2 on s2.id = su.slot_id where s2.plan_id = p.id loop
      if lmap ? u.unit_id::text then
        insert into learning_plan_slot_units values ((smap ->> u.slot_id::text)::uuid, (lmap ->> u.unit_id::text)::uuid);
      end if;
    end loop;
  end loop;

  -- Los materiales se vinculan a la copia; los archivos no se duplican
  insert into resources (curriculum_id, cycle_id, unit_id, name, kind, read_url, edit_url, active, file_path, file_name, mime_type,
                         size_bytes, audience, description, source_note, uploaded_by)
  select r.curriculum_id, (cmap ->> r.cycle_id::text)::uuid, (lmap ->> r.unit_id::text)::uuid, r.name, r.kind, r.read_url, r.edit_url,
         r.active, r.file_path, r.file_name, r.mime_type, r.size_bytes, r.audience, r.description, r.source_note, r.uploaded_by
    from resources r
   where not r.archived and ((r.cycle_id is not null and cmap ? r.cycle_id::text) or (r.unit_id is not null and lmap ? r.unit_id::text));

  insert into version_events (version_id, to_status, actor, note)
  values (nv, 'cargado', auth.uid(), 'Copia de la versión ' || src.version);
  return nv;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Biblioteca de materiales: se amplía "resources" (no se crea otra tabla)
-- ---------------------------------------------------------------------------
alter table resources
  add column if not exists curriculum_id uuid references curriculums(id) on delete cascade,
  add column if not exists unit_id uuid references lessons(id) on delete set null,
  add column if not exists file_path text,
  add column if not exists file_name text,
  add column if not exists mime_type text,
  add column if not exists size_bytes bigint,
  add column if not exists description text,
  add column if not exists source_note text,
  add column if not exists uploaded_by uuid references profiles(id) on delete set null,
  add column if not exists replaces_id uuid references resources(id) on delete set null,
  add column if not exists archived boolean not null default false,
  add column if not exists created_at timestamptz not null default now();

-- Lo que ya existía eran enlaces para quienes cursaban el ciclo; lo nuevo parte visible solo para el equipo
do $$ begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'resources' and column_name = 'audience') then
    alter table resources add column audience text not null default 'participantes';
    alter table resources alter column audience set default 'equipo';
  end if;
end $$;

alter table resources alter column cycle_id drop not null;

do $$ begin
  alter table resources add constraint resources_audience_check check (audience in ('equipo', 'participantes'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table resources add constraint resources_size_check check (size_bytes is null or size_bytes >= 0);
exception when duplicate_object then null; end $$;

update resources r set curriculum_id = cy.curriculum_id from cycles cy where cy.id = r.cycle_id and r.curriculum_id is null;
alter table resources alter column curriculum_id set not null;

-- Un archivo solo puede colgar de la carpeta de su propio programa (evita leer archivos de otro)
do $$ begin
  alter table resources add constraint resources_file_in_own_folder check (file_path is null or file_path like curriculum_id::text || '/%');
exception when duplicate_object then null; end $$;
create index if not exists resources_curriculum_idx on resources (curriculum_id);
create index if not exists resources_unit_idx on resources (unit_id);

create or replace function resources_fill() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.curriculum_id is null then
    select cy.curriculum_id into new.curriculum_id from cycles cy
     where cy.id = coalesce(new.cycle_id, (select l.cycle_id from lessons l where l.id = new.unit_id));
  end if;
  if new.unit_id is not null and new.cycle_id is null then
    select l.cycle_id into new.cycle_id from lessons l where l.id = new.unit_id;
  end if;
  return new;
end $$;
drop trigger if exists trg_resources_fill on resources;
create trigger trg_resources_fill before insert or update on resources for each row execute function resources_fill();

-- No se cambia el vínculo de un material hacia/desde una versión congelada
create or replace function guard_resource_link() returns trigger
language plpgsql security definer set search_path = public as $$
declare vid uuid; old_vid uuid;
begin
  if tg_op = 'UPDATE' and new.cycle_id is not distinct from old.cycle_id and new.unit_id is not distinct from old.unit_id then return new; end if;
  if new.cycle_id is not null then select version_id into vid from cycles where id = new.cycle_id; end if;
  if tg_op = 'UPDATE' and old.cycle_id is not null then select version_id into old_vid from cycles where id = old.cycle_id; end if;
  if (vid is not null and not version_is_editable(vid)) or (old_vid is not null and not version_is_editable(old_vid)) then
    raise exception 'Esta versión está en revisión o publicada: el material no se puede vincular ni desvincular.';
  end if;
  return new;
end $$;
drop trigger if exists trg_guard_resource_link on resources;
drop trigger if exists trg_resources_guard_link on resources;
create trigger trg_resources_guard_link before insert or update on resources for each row execute function guard_resource_link();

-- Quién ve un material
create or replace function can_see_material(rid uuid) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare r record; vid uuid; published boolean; uid uuid := auth.uid();
begin
  select * into r from resources where id = rid;
  if not found then return false; end if;
  if is_admin() or coordinates_curriculum(r.curriculum_id) or is_curriculum_reviewer(r.curriculum_id) then return true; end if;
  if r.archived or not r.active then return false; end if;

  select cy.version_id into vid from cycles cy where cy.id = r.cycle_id;
  if vid is null then return false; end if; -- sin vincular: solo el equipo editorial
  select (v.status = 'publicado') into published from curriculum_versions v where v.id = vid;

  -- el equipo del grupo ve lo publicado o la versión que enseña su grupo
  if exists (
    select 1 from groups g
     where g.curriculum_id = r.curriculum_id and g.status <> 'finalizado'
       and (g.leader_id = uid or g.monitor_id = uid or g.backup_leader_id = uid)
       and (coalesce(published, false) or g.version_id = vid)
  ) then return true; end if;

  if r.audience = 'participantes' and coalesce(published, false) then
    if exists (select 1 from curriculum_enrollments ce
                where ce.person_id = uid and ce.curriculum_id = r.curriculum_id and ce.status in ('activo', 'pausado')) then
      return true;
    end if;
    if can_see_cycle_content(r.cycle_id) then return true; end if;
  end if;
  return false;
end $$;

drop policy if exists "ver recursos" on resources;
create policy "ver recursos" on resources for select using (can_see_material(id));
drop policy if exists "gestionar recursos" on resources;
create policy "gestionar recursos" on resources for all
  using ((select is_admin()) or coordinates_curriculum(curriculum_id))
  with check ((select is_admin()) or coordinates_curriculum(curriculum_id));

drop trigger if exists trg_audit_resources on resources;
create trigger trg_audit_resources after insert or delete on resources for each row execute function audit_trigger();

-- ---------------------------------------------------------------------------
-- 5. Acceso a las unidades: ya no depende de que el grupo tenga ciclo
-- ---------------------------------------------------------------------------
-- Un participante ve una unidad si:
--  · es de una versión publicada (o la que enseña su grupo) y
--  · ya la acreditó, o su grupo ya la dio (o es la de la próxima sesión), o se liberó por el modelo anterior.
create or replace function can_see_unit(lid uuid) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare l record; vstatus editorial_status; uid uuid := auth.uid();
begin
  select l0.number, cy.id as cycle_id, cy.curriculum_id, cy.version_id into l
    from lessons l0 join cycles cy on cy.id = l0.cycle_id where l0.id = lid;
  if not found then return false; end if;

  if is_admin() or coordinates_curriculum(l.curriculum_id) or is_curriculum_reviewer(l.curriculum_id) then return true; end if;
  if manages_cycle_content(l.cycle_id) then return true; end if;
  if exists (select 1 from groups g where g.curriculum_id = l.curriculum_id and g.version_id = l.version_id
                and (g.leader_id = uid or g.monitor_id = uid or g.backup_leader_id = uid)) then
    return true;
  end if;

  select status into vstatus from curriculum_versions where id = l.version_id;
  if vstatus is distinct from 'publicado' then return false; end if;

  if l.number <= lessons_released(l.cycle_id) then return true; end if;
  if exists (select 1 from unit_completions uc join curriculum_enrollments ce on ce.id = uc.curriculum_enrollment_id
              where ce.person_id = uid and uc.unit_id = lid) then
    return true;
  end if;
  return exists (
    select 1 from meetings m join learning_plan_slot_units su on su.slot_id = m.slot_id
     where su.unit_id = lid and m.group_id in (select enrolled_group_ids())
       and (m.status = 'realizada'
            or m.id = (select m2.id from meetings m2
                        where m2.group_id = m.group_id and m2.status in ('planificada', 'reprogramada') and m2.season_week is not null
                        order by m2.held_on limit 1))
  );
end $$;

drop policy if exists "ver lecciones" on lessons;
create policy "ver lecciones" on lessons for select using (can_see_unit(id));

-- ---------------------------------------------------------------------------
-- 6. Plan de 36 encuentros: guardar una posición y proponer una distribución
-- ---------------------------------------------------------------------------
create or replace function ensure_plan(vid uuid, year int default 1) returns uuid
language plpgsql security definer set search_path = public as $$
declare v record; pid uuid;
begin
  select * into v from curriculum_versions where id = vid;
  if not found then raise exception 'La versión no existe.'; end if;
  if not (is_admin() or coordinates_curriculum(v.curriculum_id)) then raise exception 'No tienes permiso para editar el plan.'; end if;
  select id into pid from annual_learning_plans where version_id = vid and formative_year = year;
  if pid is null then
    insert into annual_learning_plans (version_id, formative_year, status) values (vid, year, 'cargado') returning id into pid;
  end if;
  return pid;
end $$;

create or replace function save_plan_slot(pid uuid, pos int, slot_kind text, slot_title text, slot_notes text, unit_ids uuid[])
returns uuid
language plpgsql security definer set search_path = public as $$
declare p record; sid uuid; bad int;
begin
  select pl.*, v.curriculum_id into p from annual_learning_plans pl join curriculum_versions v on v.id = pl.version_id where pl.id = pid;
  if not found then raise exception 'El plan no existe.'; end if;
  if not (is_admin() or coordinates_curriculum(p.curriculum_id)) then raise exception 'No tienes permiso para editar el plan.'; end if;
  if pos < 1 or pos > 60 then raise exception 'La posición debe estar entre 1 y 60.'; end if;

  select count(*) into bad from unnest(coalesce(unit_ids, '{}')) u
   where not exists (select 1 from lessons l join cycles cy on cy.id = l.cycle_id where l.id = u and cy.version_id = p.version_id);
  if bad > 0 then raise exception 'Alguna unidad no pertenece a esta versión.'; end if;

  insert into learning_plan_slots (plan_id, position, kind, title, notes)
  values (pid, pos, coalesce(nullif(slot_kind, ''), 'contenido'), nullif(trim(coalesce(slot_title, '')), ''), nullif(trim(coalesce(slot_notes, '')), ''))
  on conflict (plan_id, position) do update set kind = excluded.kind, title = excluded.title, notes = excluded.notes
  returning id into sid;

  delete from learning_plan_slot_units where slot_id = sid;
  insert into learning_plan_slot_units (slot_id, unit_id) select sid, u from unnest(coalesce(unit_ids, '{}')) u on conflict do nothing;
  return sid;
end $$;

-- Reparte las unidades de un año formativo en las 36 posiciones, en orden. Es una propuesta editable:
-- con menos de 36 unidades, una unidad ocupa varias semanas; con más, una semana agrupa varias unidades.
create or replace function propose_plan_distribution(vid uuid, year int default 1, weeks int default 36) returns int
language plpgsql security definer set search_path = public as $$
declare v record; pid uuid; n int; i int; p int; sid uuid; ids uuid[];
begin
  select * into v from curriculum_versions where id = vid;
  if not found then raise exception 'La versión no existe.'; end if;
  if not (is_admin() or coordinates_curriculum(v.curriculum_id)) then raise exception 'No tienes permiso para editar el plan.'; end if;
  if weeks < 1 or weeks > 60 then raise exception 'Las semanas deben estar entre 1 y 60.'; end if;

  select array_agg(l.id order by cy.number, l.number) into ids
    from lessons l join cycles cy on cy.id = l.cycle_id where cy.version_id = vid and cy.formative_year = year;
  n := coalesce(array_length(ids, 1), 0);
  if n = 0 then raise exception 'Esta versión no tiene unidades en el año %.', year; end if;

  pid := ensure_plan(vid, year);
  if exists (select 1 from learning_plan_slot_units su join learning_plan_slots s on s.id = su.slot_id where s.plan_id = pid) then
    raise exception 'El plan ya tiene unidades asignadas: edítalo a mano o vacíalo antes de proponer otra distribución.';
  end if;

  for p in 1..weeks loop
    insert into learning_plan_slots (plan_id, position, kind) values (pid, p, 'contenido')
    on conflict (plan_id, position) do update set kind = learning_plan_slots.kind
    returning id into sid;
    if n < weeks then
      insert into learning_plan_slot_units values (sid, ids[((p - 1) * n) / weeks + 1]) on conflict do nothing;
    end if;
  end loop;
  if n >= weeks then
    for i in 1..n loop
      select id into sid from learning_plan_slots where plan_id = pid and position = ((i - 1) * weeks) / n + 1;
      insert into learning_plan_slot_units values (sid, ids[i]) on conflict do nothing;
    end loop;
  end if;
  return weeks;
end $$;

-- ---------------------------------------------------------------------------
-- 7. Listo para revisar: qué falta antes de enviar o aprobar
-- ---------------------------------------------------------------------------
create or replace function version_readiness(vid uuid) returns table (level text, code text, detail text)
language plpgsql stable security definer set search_path = public as $$
declare v record; cu record; units int; uncovered int; plans int; empty_weeks int; no_material int; years int;
begin
  select * into v from curriculum_versions where id = vid;
  if not found then raise exception 'La versión no existe.'; end if;
  if not (is_admin() or coordinates_curriculum(v.curriculum_id) or is_curriculum_reviewer(v.curriculum_id)) then
    raise exception 'No tienes permiso para ver esta versión.';
  end if;
  select * into cu from curriculums where id = v.curriculum_id;

  select count(*) into units from lessons l join cycles cy on cy.id = l.cycle_id where cy.version_id = vid;
  select count(*) into plans from annual_learning_plans where version_id = vid;

  if cu.kind = 'curriculo' and units = 0 then
    return query select 'error'::text, 'sin_unidades'::text, 'La versión no tiene unidades: carga los módulos y unidades del material original.'::text;
  end if;

  if plans = 0 then
    if cu.kind = 'curriculo' and units > 0 then
      return query select 'aviso'::text, 'sin_plan'::text, 'Todavía no hay un plan de encuentros semanales.'::text;
    end if;
  else
    select count(*) into uncovered from lessons l join cycles cy on cy.id = l.cycle_id
     where cy.version_id = vid
       and exists (select 1 from annual_learning_plans p where p.version_id = vid and p.formative_year = cy.formative_year)
       and not exists (select 1 from learning_plan_slot_units su join learning_plan_slots s on s.id = su.slot_id
                        join annual_learning_plans p on p.id = s.plan_id where p.version_id = vid and su.unit_id = l.id);
    if uncovered > 0 then
      return query select 'error'::text, 'unidad_sin_plan'::text,
        uncovered || case when uncovered = 1 then ' unidad no está' else ' unidades no están' end || ' en ninguna semana del plan.';
    end if;

    select count(*) into empty_weeks from annual_learning_plans p
      cross join generate_series(1, 36) g(n)
     where p.version_id = vid
       and not exists (select 1 from learning_plan_slots s where s.plan_id = p.id and s.position = g.n
                        and (s.kind <> 'contenido' or exists (select 1 from learning_plan_slot_units su where su.slot_id = s.id)));
    if empty_weeks > 0 then
      return query select 'aviso'::text, 'semanas_vacias'::text, empty_weeks || ' semanas del plan no tienen contenido ni otro tipo de encuentro.';
    end if;
  end if;

  select count(*) into no_material from lessons l join cycles cy on cy.id = l.cycle_id
   where cy.version_id = vid
     and not exists (select 1 from resources r where not r.archived and (r.unit_id = l.id or r.cycle_id = cy.id));
  if units > 0 and no_material > 0 then
    return query select 'aviso'::text, 'unidad_sin_material'::text, no_material || ' unidades no tienen material vinculado.';
  end if;

  select count(distinct cy.formative_year) into years from cycles cy where cy.version_id = vid;
  if units > 0 and cu.duration_years > years then
    return query select 'aviso'::text, 'anios_incompletos'::text,
      'El programa dura ' || cu.duration_years || ' años y esta versión tiene ' || years || '.';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 8. Flujo editorial con bitácora y validaciones (reemplaza la función de 3 parámetros por una con nota)
-- ---------------------------------------------------------------------------
drop function if exists advance_curriculum_version(uuid, editorial_status);

create or replace function advance_curriculum_version(vid uuid, to_status editorial_status, note text default null)
returns editorial_status
language plpgsql security definer set search_path = public as $$
declare v record; ok boolean; n text := nullif(trim(coalesce(note, '')), ''); bad text;
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

  if v.status in ('en_revision_pastoral', 'aprobado') and to_status = 'en_adaptacion' and n is null then
    raise exception 'Indica qué debe corregirse al devolver la versión a adaptación.';
  end if;

  if to_status = 'en_revision_pastoral' then
    select string_agg(r.detail, ' ') into bad from version_readiness(vid) r where r.level = 'error' and r.code = 'sin_unidades';
    if bad is not null then raise exception 'No se puede enviar a revisión: %', bad; end if;
  elsif to_status = 'aprobado' then
    select string_agg(r.detail, ' ') into bad from version_readiness(vid) r where r.level = 'error';
    if bad is not null then raise exception 'No se puede aprobar: %', bad; end if;
  end if;

  perform set_config('app.version_workflow', 'on', true);
  if to_status = 'publicado' then
    -- la versión que deja de ser la vigente se congela: las cohortes que la cursan la conservan intacta
    update curriculum_versions set is_current = false, content_frozen = true where curriculum_id = v.curriculum_id and is_current and id <> vid;
    update curriculum_versions
       set status = 'publicado', is_current = true, content_frozen = true, published_at = now(),
           effective_from = coalesce(effective_from, current_date)
     where id = vid;
    update annual_learning_plans set status = 'publicado' where version_id = vid;
  elsif to_status = 'aprobado' then
    update curriculum_versions set status = 'aprobado', approved_by = auth.uid(), approved_at = now(), reviewed_by = auth.uid() where id = vid;
    update annual_learning_plans set status = 'aprobado' where version_id = vid;
  elsif to_status = 'en_revision_pastoral' then
    update curriculum_versions set status = to_status, adapted_by = auth.uid() where id = vid;
    update annual_learning_plans set status = 'en_revision_pastoral' where version_id = vid;
  elsif to_status = 'archivado' then
    update curriculum_versions set status = 'archivado', is_current = false where id = vid;
    update annual_learning_plans set status = 'archivado' where version_id = vid;
  else
    update curriculum_versions set status = to_status, approved_by = null, approved_at = null where id = vid;
    update annual_learning_plans set status = to_status where version_id = vid;
  end if;
  perform set_config('app.version_workflow', 'off', true);

  insert into version_events (version_id, from_status, to_status, actor, note) values (vid, v.status, to_status, auth.uid(), n);
  return to_status;
end $$;

-- ---------------------------------------------------------------------------
-- 9. Continuación de grupo: conserva datos protegidos, respaldo y sede; no mezcla versiones
-- ---------------------------------------------------------------------------
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
  if src.cycle_id is null then
    raise exception 'Este grupo no avanza por ciclos: las personas siguen en su inscripción al programa y eligen grupo desde "Mi progreso".';
  end if;

  select cy2.id into next_cycle
  from cycles cy
  join cycles cy2 on cy2.curriculum_id = cy.curriculum_id and cy2.number = cy.number + 1
                 and cy2.version_id is not distinct from cy.version_id
  where cy.id = src.cycle_id;
  if next_cycle is null then raise exception 'Este currículum no tiene un ciclo siguiente.'; end if;

  insert into groups (season_id, cycle_id, name, leader_id, monitor_id, backup_leader_id, campus_id, timezone,
                      weekday, start_time, end_time, modality, capacity, status, continues_from)
  values (coalesce(target_season, src.season_id), next_cycle, src.name, src.leader_id, src.monitor_id, src.backup_leader_id,
          src.campus_id, src.timezone, src.weekday, src.start_time, src.end_time, src.modality, src.capacity, 'abierto', gid)
  returning id into new_gid;

  insert into group_private (group_id, address, online_url, notes)
  select new_gid, address, online_url, notes from group_private where group_id = gid
  on conflict (group_id) do nothing;

  perform set_config('app.skip_checks', 'on', true);
  insert into enrollments (person_id, group_id, status, created_by)
  select e.person_id, new_gid, 'preinscrito', auth.uid()
  from enrollments e where e.group_id = gid and e.status = 'aprobado';
  perform set_config('app.skip_checks', 'off', true);

  return new_gid;
end $$;

-- ---------------------------------------------------------------------------
-- 10. Almacenamiento privado de archivos (Supabase Storage), si está disponible
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('storage.buckets') is not null and to_regclass('storage.objects') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('materiales', 'materiales', false, 52428800, array[
      'application/pdf', 'video/mp4', 'audio/mpeg', 'audio/mp4', 'image/png', 'image/jpeg', 'image/webp',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/epub+zip', 'text/plain'])
    on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

    execute 'drop policy if exists "leer materiales visibles" on storage.objects';
    -- se lee lo que un material visible registra; el equipo editorial ve además la carpeta de su programa
    -- (Storage lo necesita para confirmar una subida)
    execute $p$create policy "leer materiales visibles" on storage.objects for select to authenticated
      using (bucket_id = 'materiales' and (
        exists (select 1 from public.resources r where r.file_path = objects.name)
        or (storage.foldername(objects.name))[1] in (
          select c.id::text from public.curriculums c
           where (select public.is_admin()) or public.coordinates_curriculum(c.id))))$p$;

    execute 'drop policy if exists "subir materiales de mi programa" on storage.objects';
    execute $p$create policy "subir materiales de mi programa" on storage.objects for insert to authenticated
      with check (bucket_id = 'materiales' and (storage.foldername(objects.name))[1] in (
        select c.id::text from public.curriculums c
         where (select public.is_admin()) or public.coordinates_curriculum(c.id)))$p$;

    execute 'drop policy if exists "borrar materiales" on storage.objects';
    execute $p$create policy "borrar materiales" on storage.objects for delete to authenticated
      using (bucket_id = 'materiales' and (select public.is_admin()))$p$;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 11. Permisos de ejecución
-- ---------------------------------------------------------------------------
revoke all on function clone_version(uuid, text), ensure_plan(uuid, int), save_plan_slot(uuid, int, text, text, text, uuid[]),
  propose_plan_distribution(uuid, int, int), version_readiness(uuid), advance_curriculum_version(uuid, editorial_status, text)
  from public, anon;
grant execute on function clone_version(uuid, text), ensure_plan(uuid, int), save_plan_slot(uuid, int, text, text, text, uuid[]),
  propose_plan_distribution(uuid, int, int), version_readiness(uuid), advance_curriculum_version(uuid, editorial_status, text)
  to authenticated;

notify pgrst, 'reload schema';
commit;
