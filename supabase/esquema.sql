-- Gestor Familiar · esquema de Supabase
-- Pégalo entero en Supabase > SQL Editor > New query > Run.
-- El servidor solo guarda datos cifrados: no puede leer importes, conceptos ni categorías.

create table if not exists public.familias (
  id uuid primary key default gen_random_uuid(),
  nombre text not null default 'Familia',
  boveda jsonb not null,               -- clave familiar cifrada con la contraseña familiar
  creada timestamptz not null default now(),
  creador uuid not null default auth.uid()
);

create table if not exists public.miembros (
  familia uuid not null references public.familias(id) on delete cascade,
  usuario uuid not null references auth.users(id) on delete cascade,
  rol text not null default 'miembro',
  desde timestamptz not null default now(),
  primary key (familia, usuario)
);

create table if not exists public.invitaciones (
  familia uuid not null references public.familias(id) on delete cascade,
  email text not null,
  creada timestamptz not null default now(),
  primary key (familia, email)
);

create table if not exists public.registros (
  id text primary key,
  familia uuid not null references public.familias(id) on delete cascade,
  tipo text not null,
  iv text,
  ct text,                              -- contenido cifrado (AES-GCM)
  mod bigint not null,                  -- hora del cambio en el dispositivo
  borrado boolean not null default false,
  actualizado timestamptz not null default now()
);
create index if not exists registros_familia_actualizado on public.registros (familia, actualizado);

-- La hora del servidor marca el orden de sincronización
create or replace function public.tocar_actualizado() returns trigger language plpgsql as $$
begin new.actualizado := clock_timestamp(); return new; end $$;
drop trigger if exists registros_actualizado on public.registros;
create trigger registros_actualizado before insert or update on public.registros
  for each row execute function public.tocar_actualizado();

-- ¿Pertenece el usuario actual a esta familia?
create or replace function public.es_miembro(f uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (select 1 from miembros where familia = f and usuario = auth.uid());
$$;

-- Seguridad por filas: cada familia solo ve lo suyo
alter table public.familias enable row level security;
alter table public.miembros enable row level security;
alter table public.invitaciones enable row level security;
alter table public.registros enable row level security;

drop policy if exists familias_ver on public.familias;
create policy familias_ver on public.familias for select using (public.es_miembro(id));
drop policy if exists familias_editar on public.familias;
create policy familias_editar on public.familias for update using (public.es_miembro(id)) with check (public.es_miembro(id));

drop policy if exists miembros_ver on public.miembros;
create policy miembros_ver on public.miembros for select using (public.es_miembro(familia));

drop policy if exists invitaciones_ver on public.invitaciones;
create policy invitaciones_ver on public.invitaciones for select using (public.es_miembro(familia));
drop policy if exists invitaciones_crear on public.invitaciones;
create policy invitaciones_crear on public.invitaciones for insert with check (public.es_miembro(familia));
drop policy if exists invitaciones_borrar on public.invitaciones;
create policy invitaciones_borrar on public.invitaciones for delete using (public.es_miembro(familia));

drop policy if exists registros_todo on public.registros;
create policy registros_todo on public.registros for all using (public.es_miembro(familia)) with check (public.es_miembro(familia));

-- Crear familia (y apuntarse como administrador)
create or replace function public.crear_familia(p_nombre text, p_boveda jsonb) returns uuid
  language plpgsql security definer set search_path = public as $$
declare nueva uuid;
begin
  if auth.uid() is null then raise exception 'Sin sesión'; end if;
  insert into familias (nombre, boveda, creador) values (coalesce(p_nombre, 'Familia'), p_boveda, auth.uid()) returning id into nueva;
  insert into miembros (familia, usuario, rol) values (nueva, auth.uid(), 'admin');
  return nueva;
end $$;

-- Aceptar la invitación que corresponde al email de la sesión
create or replace function public.aceptar_invitacion() returns uuid
  language plpgsql security definer set search_path = public as $$
declare f uuid; mi_email text := lower(auth.jwt() ->> 'email');
begin
  if auth.uid() is null or mi_email is null then return null; end if;
  select familia into f from invitaciones where lower(email) = mi_email order by creada limit 1;
  if f is null then return null; end if;
  insert into miembros (familia, usuario) values (f, auth.uid()) on conflict do nothing;
  delete from invitaciones where familia = f and lower(email) = mi_email;
  return f;
end $$;

-- Lista de miembros con su email (solo para miembros de esa familia)
create or replace function public.miembros_familia(p_familia uuid) returns table (email text, rol text, desde timestamptz)
  language sql stable security definer set search_path = public as $$
  select u.email::text, m.rol, m.desde from miembros m join auth.users u on u.id = m.usuario
  where m.familia = p_familia and public.es_miembro(p_familia);
$$;

revoke all on function public.crear_familia(text, jsonb) from anon;
revoke all on function public.aceptar_invitacion() from anon;
revoke all on function public.miembros_familia(uuid) from anon;
