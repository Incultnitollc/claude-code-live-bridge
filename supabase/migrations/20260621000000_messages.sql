create table if not exists public.messages (
  id         text primary key,
  v          int  not null,
  ts         timestamptz not null,
  room       text not null,
  sender     text not null,
  recipient  text,
  reply_to   text,
  kind       text not null default 'text',
  msg        text not null,
  owner      uuid not null default auth.uid(),
  created_at timestamptz not null default now()
);

create index if not exists messages_owner_room_id_idx
  on public.messages (owner, room, id);

alter table public.messages enable row level security;

create policy own_select on public.messages
  for select using (owner = auth.uid());

create policy own_insert on public.messages
  for insert with check (owner = auth.uid());

alter publication supabase_realtime add table public.messages;
