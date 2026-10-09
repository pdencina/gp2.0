-- Escalera de ascenso: alumno -> lider -> monitor -> coordinador
-- Solo se sube un peldaño a la vez, y solo lo hace un rol superior dentro de su alcance.

create table role_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  from_role app_role,
  to_role app_role not null,
  changed_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index on role_history (user_id);

alter table role_history enable row level security;
create policy "ver historial permitido" on role_history for select using (can_see_profile(user_id));

-- Historial inicial de quienes ya existen
insert into role_history (user_id, from_role, to_role)
select id, null, role from profiles;

-- Registra altas y cualquier cambio de rol (incluso los hechos por el admin)
create or replace function log_role_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into role_history (user_id, from_role, to_role) values (new.id, null, new.role);
  elsif new.role is distinct from old.role then
    insert into role_history (user_id, from_role, to_role, changed_by)
    values (new.id, old.role, new.role, auth.uid());
  end if;
  return new;
end $$;

create trigger trg_log_role_change after insert or update of role on profiles
for each row execute function log_role_change();

create or replace function role_rank(r app_role) returns int
language sql immutable as $$
  select case r when 'alumno' then 1 when 'lider' then 2 when 'monitor' then 3
                when 'coordinador' then 4 when 'admin' then 5 end
$$;

-- Promueve a una persona al siguiente peldaño. Devuelve el nuevo rol.
create or replace function promote_user(target uuid) returns app_role
language plpgsql security definer set search_path = public as $$
declare
  caller app_role := my_role();
  cur app_role;
  nxt app_role;
begin
  if auth.uid() is null or caller is null then
    raise exception 'Debes iniciar sesión.';
  end if;
  if target = auth.uid() then
    raise exception 'No puedes promoverte a ti mismo.';
  end if;

  select role into cur from profiles where id = target;
  if cur is null then
    raise exception 'La persona no existe.';
  end if;

  nxt := case cur
    when 'alumno' then 'lider'::app_role
    when 'lider' then 'monitor'::app_role
    when 'monitor' then 'coordinador'::app_role
    else null end;
  if nxt is null then
    raise exception 'Esta persona ya está en el nivel más alto de la escalera.';
  end if;

  if role_rank(caller) <= role_rank(nxt) and caller <> 'admin' then
    raise exception 'Tu rol no puede promover a un %.', nxt;
  end if;
  if caller <> 'admin' and not can_see_profile(target) then
    raise exception 'Esa persona no pertenece a tu alcance.';
  end if;

  update profiles set role = nxt where id = target;
  return nxt;
end $$;

revoke all on function promote_user(uuid) from public, anon;
grant execute on function promote_user(uuid) to authenticated;
