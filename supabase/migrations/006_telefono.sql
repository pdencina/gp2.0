-- Teléfono en el perfil (formato internacional, ej. +56912345678)
-- Lo ven solo quienes ya pueden ver ese perfil (la propia persona y quienes la gestionan).

alter table profiles
  add column phone text check (phone is null or phone ~ '^\+[0-9]{8,15}$');
