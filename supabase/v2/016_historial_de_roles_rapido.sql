-- ============================================================================
-- 016 · Historial de roles: política rápida y solo con sesión
--
-- La migración 004 pasó las políticas de lectura a "se evalúa una vez por consulta", pero la de role_history quedó
-- llamando a una función costosa por cada fila. Con ~13.500 filas, una consulta sin sesión (la API pública la admite)
-- agotaba el tiempo de la base. Misma regla de acceso, ahora set-based, y solo para usuarios con sesión.
-- Aditiva y repetible. Requiere 001 y 004.
-- ============================================================================
begin;

drop policy if exists "ver historial permitido" on role_history;
create policy "ver historial permitido" on role_history for select to authenticated
  using (person_id = (select auth.uid()) or (select is_admin()) or person_id in (select visible_profile_ids()));

notify pgrst, 'reload schema';
commit;
