-- Borra las funciones de importación (002_importacion.sql). Ejecutar al terminar la migración.
-- No toca ningún dato.
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace s on s.oid = p.pronamespace
    where s.nspname = 'public' and p.proname like 'import\_%'
  loop
    execute format('drop function %s', f.sig);
  end loop;
end $$;
