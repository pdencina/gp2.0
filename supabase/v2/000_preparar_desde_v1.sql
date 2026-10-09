-- ============================================================================
-- PASO PREVIO para actualizar un proyecto que está en la VERSIÓN 1 a la versión 2.
-- Se ejecuta UNA vez, antes de 001_schema.sql.
--
-- QUÉ CONSERVA:  cuentas de usuario, perfiles (nombre, rol, teléfono) e historial de roles.
-- QUÉ BORRA:     las tablas de la versión 1 y todos sus datos:
--                groups, group_members, sessions, attendance, contacts, lessons, curriculums.
--
-- ANTES DE EJECUTARLO:
--   1. Haz un respaldo (Supabase → Database → Backups) o exporta las tablas que quieras guardar.
--   2. Confirma que no necesitas los grupos, la asistencia ni las lecciones de la versión 1.
--   3. La aplicación web debe estar ya actualizada a la versión 2; la actual dejará de funcionar.
--
-- SEGURO: para que este script haga algo, quita los dos guiones de la línea siguiente.
-- ============================================================================
-- set app.confirmo_borrar_v1 = 'si';

-- Todo o nada: si algo falla, no se aplica ningún cambio.
begin;

do $$
begin
  if to_regclass('public.group_members') is null then
    raise exception 'Este proyecto no parece estar en la versión 1 (no existe la tabla group_members). No se hizo ningún cambio.';
  end if;
  if coalesce(current_setting('app.confirmo_borrar_v1', true), '') <> 'si' then
    raise exception 'Falta confirmar. Lee el encabezado de este archivo y quita los dos guiones de la línea "set app.confirmo_borrar_v1". No se hizo ningún cambio.';
  end if;
end $$;

-- Tablas de la versión 1 (se reemplazan por temporadas, ciclos, grupos, inscripciones y reuniones)
drop table if exists contacts, attendance, sessions, group_members, groups, lessons, curriculums cascade;

-- Funciones propias de la versión 1 que ya no se usan
drop function if exists my_alerts();
drop function if exists save_attendance(uuid, date, int, uuid[]);
drop function if exists enforce_group_capacity();
drop function if exists validate_group_roles();
drop function if exists validate_curriculum_coordinator();
drop function if exists validate_member_role();
drop function if exists lessons_released(uuid);
drop function if exists assignable_people(app_role);

commit;
