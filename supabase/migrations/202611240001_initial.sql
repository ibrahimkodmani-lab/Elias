-- Elias: private family groups, milestones and media metadata.
create extension if not exists pgcrypto;

create table if not exists public.families (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  birth_date date,
  invite_code text not null unique default upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 10)),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.family_members (
  family_id uuid not null references public.families(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','member')),
  joined_at timestamptz not null default now(),
  primary key (family_id, user_id)
);

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  description text not null default '',
  happened_on date not null default current_date,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.event_media (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  storage_path text not null unique,
  original_name text not null,
  media_type text not null check (media_type in ('image','video')),
  uploaded_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists events_family_date_idx on public.events(family_id, happened_on desc);
create index if not exists media_event_idx on public.event_media(event_id);

create or replace function public.is_family_member(target_family uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select exists(select 1 from public.family_members where family_id = target_family and user_id = auth.uid()); $$;

create or replace function public.is_family_creator(target_family uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select exists(select 1 from public.families where id = target_family and created_by = auth.uid()); $$;

alter table public.families enable row level security;
alter table public.family_members enable row level security;
alter table public.events enable row level security;
alter table public.event_media enable row level security;

create policy "members and creator read family" on public.families for select to authenticated using (public.is_family_member(id) or created_by = auth.uid());
create policy "signed in users create family" on public.families for insert to authenticated with check (created_by = auth.uid());
create policy "owners update family" on public.families for update to authenticated using (created_by = auth.uid()) with check (created_by = auth.uid());

create policy "members read memberships" on public.family_members for select to authenticated using (public.is_family_member(family_id));
create policy "creator adds self" on public.family_members for insert to authenticated with check (
  user_id = auth.uid() and public.is_family_creator(family_id)
);

create policy "members read events" on public.events for select to authenticated using (public.is_family_member(family_id));
create policy "members create events" on public.events for insert to authenticated with check (public.is_family_member(family_id) and created_by = auth.uid());
create policy "members update events" on public.events for update to authenticated using (public.is_family_member(family_id)) with check (public.is_family_member(family_id));
create policy "members delete events" on public.events for delete to authenticated using (public.is_family_member(family_id));

create policy "members read media metadata" on public.event_media for select to authenticated using (public.is_family_member(family_id));
create policy "members add media metadata" on public.event_media for insert to authenticated with check (public.is_family_member(family_id) and uploaded_by = auth.uid());
create policy "uploader delete media metadata" on public.event_media for delete to authenticated using (public.is_family_member(family_id) and uploaded_by = auth.uid());

-- Joining with an invite code is done through this function so users cannot self-assign arbitrary family IDs.
create or replace function public.join_family_by_code(code text)
returns uuid language plpgsql security definer set search_path = public
as $$
declare target_id uuid;
begin
  if auth.uid() is null then raise exception 'Bitte zuerst anmelden.'; end if;
  select id into target_id from public.families where invite_code = upper(trim(code));
  if target_id is null then raise exception 'Einladungscode nicht gefunden.'; end if;
  insert into public.family_members(family_id, user_id, role)
  values (target_id, auth.uid(), 'member') on conflict do nothing;
  return target_id;
end;
$$;
revoke all on function public.join_family_by_code(text) from public;
grant execute on function public.join_family_by_code(text) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('elias-media', 'elias-media', false, 52428800, array['image/jpeg','image/png','image/webp','image/heic','video/mp4','video/quicktime','video/webm'])
on conflict (id) do nothing;

create policy "family members read media files" on storage.objects for select to authenticated
using (bucket_id = 'elias-media' and public.is_family_member(((storage.foldername(name))[1])::uuid));
create policy "family members upload media files" on storage.objects for insert to authenticated
with check (bucket_id = 'elias-media' and public.is_family_member(((storage.foldername(name))[1])::uuid));
create policy "family members delete media files" on storage.objects for delete to authenticated
using (bucket_id = 'elias-media' and public.is_family_member(((storage.foldername(name))[1])::uuid));