-- Gestión de currículums y grupos

-- Un líder lidera un solo grupo
create unique index groups_one_group_per_leader on groups (leader_id) where leader_id is not null;

-- Los responsables asignados deben tener el rol correcto
create or replace function validate_group_roles() returns trigger
language plpgsql as $$
begin
  if new.monitor_id is not null
     and (select role from profiles where id = new.monitor_id) is distinct from 'monitor' then
    raise exception 'La persona asignada como monitor debe tener rol de monitor.';
  end if;
  if new.leader_id is not null
     and (select role from profiles where id = new.leader_id) is distinct from 'lider' then
    raise exception 'La persona asignada como líder debe tener rol de líder.';
  end if;
  return new;
end $$;

create trigger trg_validate_group_roles before insert or update on groups
for each row execute function validate_group_roles();

create or replace function validate_curriculum_coordinator() returns trigger
language plpgsql as $$
begin
  if new.coordinator_id is not null
     and (select role from profiles where id = new.coordinator_id) is distinct from 'coordinador' then
    raise exception 'La persona asignada como coordinador debe tener rol de coordinador.';
  end if;
  return new;
end $$;

create trigger trg_validate_curriculum_coordinator before insert or update on curriculums
for each row execute function validate_curriculum_coordinator();

-- Candidatos para asignar: solo nombre e id, y solo para quienes gestionan.
-- Líderes y alumnos se listan únicamente si están libres (sin grupo).
create or replace function assignable_people(r app_role)
returns table (id uuid, full_name text)
language sql stable security definer set search_path = public as $$
  select p.id, p.full_name
  from profiles p
  where my_role() in ('admin', 'coordinador', 'monitor', 'lider')
    and p.role = r
    and (r <> 'alumno' or not exists (select 1 from group_members m where m.student_id = p.id))
    and (r <> 'lider' or not exists (select 1 from groups g where g.leader_id = p.id))
  order by p.full_name
$$;

revoke all on function assignable_people(app_role) from public, anon;
grant execute on function assignable_people(app_role) to authenticated;
