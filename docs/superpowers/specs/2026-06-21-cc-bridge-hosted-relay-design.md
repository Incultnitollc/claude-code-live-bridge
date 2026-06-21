# cc-bridge Hosted Relay — Design Spec

**Date:** 2026-06-21
**Status:** Approved (design), pending implementation plan
**Scope of this doc:** Sub-project #1 of 3 — the cross-machine relay core.

## Context

`cc-bridge` v0.1.0 is a local, single-machine JSONL message bridge between Claude
Code sessions (MIT, shipped to npm + global bin). `send` appends to a per-room
JSONL file; `listen` tails it. Everything lives on one machine's disk.

The goal is to **sell cc-bridge as a hosted relay SaaS** (recurring revenue). A
local single-machine MIT tool has no moat — it is trivially copyable. The moat is
a thing customers can't clone: rooms that live in *our* authed database, syncing
sessions across **different machines** (and later, teammates), behind a paywall.

This is three sub-projects. Each gets its own spec → plan → build:

| # | Sub-project | Delivers |
|---|---|---|
| **1 (this doc)** | **Cross-machine relay core** | One account's sessions sync in real time across machines + history |
| 2 | Billing / entitlement | Stripe subscription gates relay access |
| 3 | Distribution | `/b` command + `cc-bridge login` onboarding + pricing page |

2 and 3 are meaningless without 1, so 1 is designed and built first.

## Decisions locked (from brainstorm)

- **Relay model:** real-time (both sessions live), latency sub-second — fine for hand-offs, not an interrupt of a working agent.
- **Backend:** Supabase open-core. Postgres + Realtime + Auth + RLS in one managed service. **No custom server to run.**
- **Auth:** Supabase email OTP (6-digit code), CLI-friendly.
- **Default backend:** logged in → cloud (the point of logging in); `--local` / `CC_BRIDGE_LOCAL=1` forces today's JSONL files.
- **Open-core:** local JSONL mode stays MIT/free and untouched.

## Architecture

```
A's machine:  cc-bridge send  → INSERT into messages (room, body)         ┐
                                                                          ├─ Supabase
B's laptop:   cc-bridge listen → SUBSCRIBE realtime where room = X  ◀─────┘
              (RLS: owner = auth.uid() — you only ever see your own rooms)
```

The existing CLI already routes all storage through exactly two functions —
`sendMessage()` and `listen()`. The code above them (`src/bin/cc-bridge.ts`) is
transport-agnostic: it consumes a `ListenController { iterator, close }` and
prints. Cloud mode is therefore a **backend swap of two functions**, not a
rewrite. One new dependency, `@supabase/supabase-js`, covers auth + insert +
realtime.

A dedicated **new** Supabase project hosts this (isolation + clean billing later).
Free tier.

- **Account:** incultnitopeng@gmail.com
- **Project name:** cc-bridge
- **Project URL / anon key:** _provided by user; plugged into `CC_BRIDGE_SUPABASE_URL` + `CC_BRIDGE_SUPABASE_ANON_KEY` at implementation time._

## Data model — one table, one migration

```sql
create table messages (
  id         text primary key,            -- reuse existing ULID
  v          int  not null,               -- schema version (reuse SCHEMA_VERSION)
  ts         timestamptz not null,
  room       text not null,
  sender     text not null,               -- "from" (reserved word → sender)
  recipient  text,                        -- "to"
  reply_to   text,
  kind       text not null default 'text',-- text | event
  msg        text not null,
  owner      uuid not null default auth.uid(),
  created_at timestamptz not null default now()
);

create index on messages (owner, room, id);   -- replay + per-room queries

alter table messages enable row level security;
create policy own_select on messages for select using  (owner = auth.uid());
create policy own_insert on messages for insert with check (owner = auth.uid());

-- Realtime, RLS-aware
alter publication supabase_realtime add table messages;
```

Rooms stay implicit (a string column). No `rooms` table — YAGNI.

Column-name mapping in the CLI: `from → sender`, `to → recipient`. The wire
`Message` shape (validated by the existing zod schema) is unchanged; mapping
happens only at the DB boundary.

## Auth — Supabase email OTP

```
cc-bridge login you@email.com   → Supabase emails a 6-digit code
                                → paste code → tokens cached at
                                   ~/.cc-bridge/credentials (mode 0600)
cc-bridge whoami                → prints account email
cc-bridge logout                → clears creds
```

The cached **user JWT** is used for both the REST insert and the Realtime
subscribe, so RLS isolation is automatic — no custom auth server. The refresh
token keeps the session alive across CLI invocations.

Alternative considered and deferred: dashboard-generated API keys. More to build
(a web dashboard, a keys table, custom JWT minting). OTP needs none of that.

## CLI seam

New dependency: `@supabase/supabase-js`.

- **`sendRemote(input)`** — calls `buildMessage()` (reused, unchanged) to produce
  the validated `Message`, then INSERTs the mapped row. Returns the same `Message`
  the local path returns.
- **`listenRemote(opts)`** — subscribes to `postgres_changes` INSERT on `messages`
  filtered by `room=eq.X`, yields the **same `ListenController { iterator, close }`**
  the bin already consumes. Bin code unchanged.
- **Backend switch** — a small resolver: logged in and not `--local`/`CC_BRIDGE_LOCAL`
  → cloud; else → existing JSONL path. Both `send` and `listen` consult it.

New commands: `login`, `logout`, `whoami`. Existing `send` / `listen` / `rooms` /
`validate` keep their flags.

## Realtime + replay (the one fiddly bit)

`--replay N` and reconnect risk dropping or duplicating messages in the gap
between "query backlog" and "subscription starts". Correct order:

1. Subscribe to the room's realtime channel; buffer live inserts.
2. Query the backlog (last N by `id` — ULIDs sort by time).
3. Dedupe buffered live inserts against backlog by `id`.
4. Drain backlog, then live buffer, then steady-state.

ULID `id`s make ordering and dedupe trivial (no separate sequence needed).

## Security (trust boundaries — not simplified away)

- **Isolation** via RLS `owner = auth.uid()` on select and insert. A customer can
  never read or write another account's rooms. This is the core trust boundary
  and is mandatory even in the free beta.
- Credentials file `~/.cc-bridge/credentials` written mode `0600`.
- The anon/public Supabase key is shippable in the CLI (it is public by design);
  all access is gated by the user JWT + RLS, not by key secrecy.
- Message size cap (existing 64 KB schema limit) carries over; enforced by zod
  before insert.

## Open-core boundary

| Mode | Storage | License | Cost to user |
|---|---|---|---|
| Local (today) | per-room JSONL files | MIT, free | free |
| Cloud (this spec) | Supabase, authed | hosted service | free in beta; paid in #2 |

Local mode is not modified. Cloud mode is additive.

## Deliberate ceilings (`ponytail:`)

- **One account across many machines** is the MVP. Teammates = a `team_members`
  table + an RLS tweak (`owner in (my teams' owners)`); that is a separate spec,
  built only after one-account works.
- **No billing gate yet** → any authenticated user can use the relay (free private
  beta). The `owner`/RLS structure already leaves the seam for #2's `subscribed`
  check (a `profiles.subscribed` boolean folded into the RLS policy).
- **Realtime latency** is sub-second, not instant. Accepted ceiling.
- If Supabase Realtime ever caps out, the transport can be swapped behind the same
  two-function seam without touching the CLI surface.

## Success criteria

1. `cc-bridge login` on two different machines with the same email → both authed.
2. `cc-bridge send "hi" --room demo` on machine A appears in
   `cc-bridge listen --room demo` on machine B within ~1s.
3. `cc-bridge listen --room demo --replay 10` prints the last 10 messages then
   tails live, with no duplicates across the replay/live boundary.
4. A second account cannot see account #1's `demo` room (RLS verified).
5. `--local` / `CC_BRIDGE_LOCAL=1` still uses JSONL files, behavior identical to
   v0.1.0.

## Deferred to later specs

- **#2 Billing:** Stripe subscription, webhook → `profiles.subscribed`, RLS gate.
- **#3 Distribution:** `/b` slash command (folder-derived room name at the command
  layer), `cc-bridge login` onboarding flow, pricing page.
- Teams / shared rooms across multiple accounts.
