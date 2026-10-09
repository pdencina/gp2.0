-- Borra los datos de ejemplo creados por seed_demo.sql
delete from curriculums where name = 'Mujeres' and description = 'Currículum de ejemplo';
delete from auth.users where email like '%@demo.gp.test';
