-- Datos de ejemplo para probar cada rol. Ejecutar en el SQL Editor de Supabase.
-- Crea usuarios @demo.gp.test (contraseña: Demo-GP-2026), 1 currículum, 4 grupos y 12 alumnos.
-- Para borrar todo: ejecutar supabase/seed_demo_cleanup.sql

do $$
declare
  pwd text := crypt('Demo-GP-2026', gen_salt('bf'));
  curr uuid := gen_random_uuid();
  coord uuid; mon uuid[] := '{}'; lid uuid[] := '{}'; alu uuid;
  g uuid; i int; j int; u uuid;
  nombres text[] := array['Marcela','Paula','Carolina','Rosa','Elena','Julia'];
  dias text[] := array['Lunes','Martes','Jueves','Viernes'];
begin
  -- helper inline: crea usuario auth + identidad y devuelve su id
  create temp table _mk(id uuid) on commit drop;

  for i in 1..19 loop
    u := gen_random_uuid();
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change, email_change_token_new
    ) values (
      '00000000-0000-0000-0000-000000000000', u, 'authenticated', 'authenticated',
      'demo' || i || '@demo.gp.test', pwd, now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('full_name',
        case
          when i = 1 then 'Ana Coordinadora'
          when i between 2 and 3 then 'Monitor ' || (i - 1)
          when i between 4 and 7 then 'Líder ' || (i - 3)
          else 'Alumno ' || (i - 7)
        end),
      now(), now(), '', '', '', ''
    );
    insert into auth.identities (id, user_id, provider_id, identity_data, provider, created_at, updated_at, last_sign_in_at)
    values (gen_random_uuid(), u, u::text,
      jsonb_build_object('sub', u::text, 'email', 'demo' || i || '@demo.gp.test', 'email_verified', true),
      'email', now(), now(), now());
    insert into _mk values (u);
  end loop;

  -- ids en orden de creación (el trigger ya creó los profiles como alumno)
  select array_agg(m.id order by u2.email) into mon
    from _mk m join auth.users u2 on u2.id = m.id
    where u2.email in ('demo2@demo.gp.test','demo3@demo.gp.test');
  select array_agg(m.id order by u2.email) into lid
    from _mk m join auth.users u2 on u2.id = m.id
    where u2.email in ('demo4@demo.gp.test','demo5@demo.gp.test','demo6@demo.gp.test','demo7@demo.gp.test');
  select m.id into coord from _mk m join auth.users u2 on u2.id = m.id where u2.email = 'demo1@demo.gp.test';

  update profiles set role = 'coordinador' where id = coord;
  update profiles set role = 'monitor' where id = any(mon);
  update profiles set role = 'lider' where id = any(lid);

  insert into curriculums (id, name, description, coordinator_id)
  values (curr, 'Mujeres', 'Currículum de ejemplo', coord);

  for i in 1..4 loop
    g := gen_random_uuid();
    insert into groups (id, curriculum_id, name, monitor_id, leader_id, meeting_day, meeting_time, location)
    values (g, curr, 'Grupo ' || (array['Esperanza','Fe','Luz','Paz'])[i], mon[(i + 1) / 2], lid[i],
            dias[i], '19:30', 'Casa de ejemplo ' || i);
    -- 3 alumnos por grupo
    for j in 1..3 loop
      select m.id into alu from _mk m join auth.users u2 on u2.id = m.id
        where u2.email = 'demo' || (7 + (i - 1) * 3 + j) || '@demo.gp.test';
      insert into group_members (group_id, student_id) values (g, alu);
    end loop;
  end loop;
end $$;
