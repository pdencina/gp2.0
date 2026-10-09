-- Pasar lista: una sesión por grupo y día, con guardado atómico

create unique index sessions_one_per_day on sessions (group_id, held_on);

-- Guarda (o corrige) la lista de un día. `present` trae los alumnos presentes;
-- el resto de los integrantes del grupo queda como ausente.
create or replace function save_attendance(gid uuid, day date, lesson int, present uuid[])
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  sid uuid;
begin
  if not can_manage_group(gid) then
    raise exception 'No tienes permiso para pasar lista en este grupo.';
  end if;
  if day > current_date + 1 then
    raise exception 'No se puede pasar lista de una fecha futura.';
  end if;

  insert into sessions (group_id, held_on, lesson_number)
  values (gid, day, lesson)
  on conflict (group_id, held_on) do update set lesson_number = excluded.lesson_number
  returning id into sid;

  insert into attendance (session_id, student_id, present)
  select sid, m.student_id, m.student_id = any(coalesce(present, '{}'))
  from group_members m
  where m.group_id = gid
  on conflict (session_id, student_id) do update set present = excluded.present;

  return sid;
end $$;

revoke all on function save_attendance(uuid, date, int, uuid[]) from public, anon;
grant execute on function save_attendance(uuid, date, int, uuid[]) to authenticated;
