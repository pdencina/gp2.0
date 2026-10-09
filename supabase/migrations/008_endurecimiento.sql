-- Endurecimiento de seguridad tras revisar las reglas de acceso

-- 1) Quién puede ver candidatos para asignar.
--    Antes, un líder podía listar a todos los monitores y coordinadores del sistema.
--    Ahora los líderes y monitores solo listan alumnos sin grupo (para agregarlos);
--    monitores, líderes y coordinadores solo los ve quien los asigna (admin y coordinador).
create or replace function assignable_people(r app_role)
returns table (id uuid, full_name text)
language sql stable security definer set search_path = public as $$
  select p.id, p.full_name
  from profiles p
  where p.role = r
    and (
      (r = 'alumno' and my_role() in ('admin', 'coordinador', 'monitor', 'lider'))
      or (r in ('lider', 'monitor', 'coordinador') and my_role() in ('admin', 'coordinador'))
    )
    and (r <> 'alumno' or not exists (select 1 from group_members m where m.student_id = p.id))
    and (r <> 'lider' or not exists (select 1 from groups g where g.leader_id = p.id))
  order by p.full_name
$$;

-- 2) Solo personas con rol de alumno pueden entrar a un grupo como integrantes.
--    Evita que alguien con permiso sobre un grupo agregue a cualquier usuario
--    para ganar visibilidad sobre su perfil.
create or replace function validate_member_role() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select role from profiles where id = new.student_id) is distinct from 'alumno' then
    raise exception 'Solo se pueden agregar personas con rol de alumno a un grupo.';
  end if;
  return new;
end $$;

create trigger trg_validate_member_role before insert on group_members
for each row execute function validate_member_role();
