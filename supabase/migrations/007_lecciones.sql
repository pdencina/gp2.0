-- Contenido del currículum: lecciones

create table lessons (
  id uuid primary key default gen_random_uuid(),
  curriculum_id uuid not null references curriculums(id) on delete cascade,
  number int not null check (number > 0),
  title text not null,
  summary text,
  content text,
  questions text,
  video_url text check (video_url is null or video_url ~ '^https://'),
  created_at timestamptz not null default now(),
  unique (curriculum_id, number)
);

alter table lessons enable row level security;

-- Hasta qué lección puede ver un alumno: la siguiente a la última que su grupo ya hizo.
create or replace function lessons_released(cid uuid) returns int
language sql stable security definer set search_path = public as $$
  select coalesce(max(coalesce((select max(s.lesson_number) from sessions s where s.group_id = g.id), 0) + 1), 0)
  from groups g
  join group_members m on m.group_id = g.id
  where g.curriculum_id = cid and m.student_id = auth.uid()
$$;

create policy "ver lecciones" on lessons for select using (
  my_role() = 'admin'
  or exists (select 1 from curriculums c where c.id = lessons.curriculum_id and c.coordinator_id = auth.uid())
  or exists (
    select 1 from groups g
    where g.curriculum_id = lessons.curriculum_id
      and (g.monitor_id = auth.uid() or g.leader_id = auth.uid())
  )
  or number <= lessons_released(curriculum_id)
);

create policy "gestionar lecciones" on lessons for all
using (
  my_role() = 'admin'
  or exists (select 1 from curriculums c where c.id = lessons.curriculum_id and c.coordinator_id = auth.uid())
)
with check (
  my_role() = 'admin'
  or exists (select 1 from curriculums c where c.id = lessons.curriculum_id and c.coordinator_id = auth.uid())
);
