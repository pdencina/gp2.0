-- ============================================================================
-- 007 · GP 2.0 Fase 2: catálogo de ofertas
--
-- Una "oferta" agrupa variantes de un mismo programa (p. ej. AR Jóvenes 17–23, 24–29 y 17–29,
-- o Biblia Creativa por edades). Es solo una etiqueta de agrupación: no cambia currículums,
-- grupos ni inscripciones. Es aditiva y se puede ejecutar varias veces.
-- ============================================================================
begin;

alter table curriculums add column if not exists offering text;

-- La clasificación del catálogo la define el administrador (el coordinador sigue editando el
-- resto de su currículum). Las cargas desde el SQL Editor o la importación (sin sesión) pasan.
create or replace function guard_catalog_fields() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not is_admin() and (
       new.category is distinct from old.category
    or new.kind is distinct from old.kind
    or new.life_stage is distinct from old.life_stage
    or new.duration_years is distinct from old.duration_years
    or new.certifiable is distinct from old.certifiable
    or new.visibility is distinct from old.visibility
    or new.offering is distinct from old.offering
    or new.active is distinct from old.active
  ) then
    raise exception 'Solo el administrador cambia la clasificación del catálogo.';
  end if;
  return new;
end $$;
drop trigger if exists trg_guard_catalog_fields on curriculums;
create trigger trg_guard_catalog_fields before update on curriculums
for each row execute function guard_catalog_fields();

-- Un programa privado no se ofrece en el catálogo, pero quien ya está inscrito lo sigue viendo
drop policy if exists "ver currículums" on curriculums;
create policy "ver currículums" on curriculums for select to authenticated
  using (
    (active and visibility = 'publico')
    or (select is_admin()) or coordinates_curriculum(id)
    or id in (select ce.curriculum_id from curriculum_enrollments ce where ce.person_id = (select auth.uid()))
    or id in (select g.curriculum_id from groups g where g.id in (select visible_group_ids()))
  );

notify pgrst, 'reload schema';
commit;
