-- ============================================================================
-- 013 · Asignar sedes por lote
--
-- Los grupos y las personas importados no tienen sede (la plataforma anterior casi no la registraba), y sin sede
-- solo el administrador puede certificar. Estas herramientas permiten asignarla por criterios que decide el
-- administrador, sin hacerlo grupo por grupo. Nunca cambian una sede que ya está asignada.
-- Solo el administrador. Aditiva y repetible. Requiere 006 a 011.
-- ============================================================================
begin;

-- Las asignaciones masivas dejan UNA anotación resumen en la auditoría, no una por grupo o persona
create or replace function audit_trigger() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  r jsonb := to_jsonb(case when tg_op = 'DELETE' then old else new end);
begin
  if coalesce(current_setting('app.skip_audit', true), '') = 'on' then return null; end if;
  insert into audit_log (actor, action, table_name, record_id, detail)
  values (
    auth.uid(), tg_op, tg_table_name, r->>'id',
    case when tg_op = 'UPDATE' then jsonb_build_object('before', to_jsonb(old), 'after', to_jsonb(new)) else r end
  );
  return null;
end $$;

-- Panorama: cuánto falta y cuánto se puede resolver con criterios sencillos
create or replace function campus_gaps() returns table (clave text, etiqueta text, n bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Solo el administrador asigna sedes por lote.'; end if;
  return query
  select 'grupos_sin_sede'::text, 'Grupos activos sin sede'::text,
         (select count(*) from groups where campus_id is null and status in ('abierto', 'en_curso'))
  union all select 'grupos_sin_sede_online', 'de ellos, grupos online',
         (select count(*) from groups where campus_id is null and status in ('abierto', 'en_curso') and modality = 'virtual')
  union all select 'grupos_con_lider_con_sede', 'de ellos, con un líder que ya tiene sede en su perfil',
         (select count(*) from groups g join profiles p on p.id = g.leader_id
           where g.campus_id is null and g.status in ('abierto', 'en_curso') and p.campus_id is not null)
  union all select 'personas_sin_sede', 'Personas activas sin sede',
         (select count(*) from profiles where campus_id is null and active)
  union all select 'personas_con_grupo_con_sede', 'de ellas, con un grupo que ya tiene sede',
         (select count(distinct p.id) from profiles p
            join enrollments e on e.person_id = p.id join groups g on g.id = e.group_id
           where p.campus_id is null and p.active and g.campus_id is not null and e.status <> 'cancelado');
end $$;

-- Dónde viven las personas sin sede (para asignarla por ciudad)
create or replace function campus_city_buckets(lim int default 40) returns table (country text, city text, n bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Solo el administrador asigna sedes por lote.'; end if;
  return query
  select coalesce(p.country, '') , coalesce(initcap(trim(p.city)), ''), count(*)
    from profiles p where p.campus_id is null and p.active
   group by 1, 2 order by 3 desc, 1, 2 limit least(greatest(lim, 1), 200);
end $$;

create or replace function _audit_bulk(action_name text, detail jsonb) returns void
language sql security definer set search_path = public as $$
  insert into audit_log (actor, action, table_name, record_id, detail) values (auth.uid(), action_name, 'campuses', null, detail)
$$;
revoke all on function _audit_bulk(text, jsonb) from public, anon, authenticated;

-- Grupos activos sin sede que cumplen los filtros (programa, modalidad, temporada), todos a una sede
create or replace function assign_groups_campus(sede uuid, program uuid default null, only_modality text default null, season uuid default null)
returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not is_admin() then raise exception 'Solo el administrador asigna sedes por lote.'; end if;
  if not exists (select 1 from campuses where id = sede) then raise exception 'La sede no existe.'; end if;
  if only_modality is not null and only_modality not in ('presencial', 'virtual') then raise exception 'La modalidad debe ser presencial o virtual.'; end if;
  perform set_config('app.skip_audit', 'on', true);
  update groups set campus_id = sede
   where campus_id is null and status in ('abierto', 'en_curso')
     and (program is null or curriculum_id = program)
     and (only_modality is null or modality::text = only_modality)
     and (season is null or season_id = season);
  get diagnostics n = row_count;
  perform set_config('app.skip_audit', 'off', true);
  perform _audit_bulk('BULK_GROUP_CAMPUS', jsonb_build_object('sede', sede, 'grupos', n, 'programa', program, 'modalidad', only_modality, 'temporada', season));
  return n;
end $$;

-- Cada grupo sin sede toma la sede que su líder indicó en su perfil
create or replace function assign_groups_campus_from_leader() returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not is_admin() then raise exception 'Solo el administrador asigna sedes por lote.'; end if;
  perform set_config('app.skip_audit', 'on', true);
  update groups g set campus_id = p.campus_id
    from profiles p
   where p.id = g.leader_id and g.campus_id is null and p.campus_id is not null and g.status in ('abierto', 'en_curso');
  get diagnostics n = row_count;
  perform set_config('app.skip_audit', 'off', true);
  perform _audit_bulk('BULK_GROUP_CAMPUS_FROM_LEADER', jsonb_build_object('grupos', n));
  return n;
end $$;

-- Las personas de un país y ciudad (vacío = sin dato) que no tienen sede toman la indicada
create or replace function assign_people_campus_by_city(sede uuid, in_country text, in_city text) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not is_admin() then raise exception 'Solo el administrador asigna sedes por lote.'; end if;
  if not exists (select 1 from campuses where id = sede) then raise exception 'La sede no existe.'; end if;
  update profiles set campus_id = sede
   where campus_id is null and active
     and coalesce(country, '') = coalesce(in_country, '')
     and coalesce(initcap(trim(city)), '') = coalesce(initcap(trim(in_city)), '');
  get diagnostics n = row_count;
  perform _audit_bulk('BULK_PEOPLE_CAMPUS_CITY', jsonb_build_object('sede', sede, 'personas', n, 'pais', in_country, 'ciudad', in_city));
  return n;
end $$;

-- Las personas sin sede toman la de su grupo vigente (o, si no hay, la de su último grupo con sede)
create or replace function assign_people_campus_from_groups() returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not is_admin() then raise exception 'Solo el administrador asigna sedes por lote.'; end if;
  update profiles p set campus_id = x.campus_id
    from (
      select distinct on (e.person_id) e.person_id, g.campus_id
        from enrollments e join groups g on g.id = e.group_id
       where g.campus_id is not null and e.status <> 'cancelado'
       order by e.person_id, (e.status in ('preinscrito', 'en_curso')) desc, e.enrolled_at desc
    ) x
   where p.id = x.person_id and p.campus_id is null and p.active;
  get diagnostics n = row_count;
  perform _audit_bulk('BULK_PEOPLE_CAMPUS_FROM_GROUPS', jsonb_build_object('personas', n));
  return n;
end $$;

revoke all on function campus_gaps(), campus_city_buckets(int), assign_groups_campus(uuid, uuid, text, uuid),
  assign_groups_campus_from_leader(), assign_people_campus_by_city(uuid, text, text), assign_people_campus_from_groups()
  from public, anon;
grant execute on function campus_gaps(), campus_city_buckets(int), assign_groups_campus(uuid, uuid, text, uuid),
  assign_groups_campus_from_leader(), assign_people_campus_by_city(uuid, text, text), assign_people_campus_from_groups()
  to authenticated;

notify pgrst, 'reload schema';
commit;
