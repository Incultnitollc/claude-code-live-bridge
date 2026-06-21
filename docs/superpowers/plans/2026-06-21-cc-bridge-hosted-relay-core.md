# cc-bridge Hosted Relay Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a cloud backend so one account's Claude Code sessions sync messages in real time across different machines, while local JSONL mode stays unchanged.

**Architecture:** The CLI already routes all storage through two functions — `sendMessage()` and `listen()` — with transport-agnostic code above them in `src/bin/cc-bridge.ts`. We add cloud equivalents (`sendRemote()` / `listenRemote()`) backed by Supabase (Postgres + Realtime + Auth + RLS), plus a backend resolver that picks cloud when logged in. No custom server: `send` = INSERT a row, `listen` = subscribe to `postgres_changes`, auth = Supabase email OTP, isolation = RLS `owner = auth.uid()`.

**Tech Stack:** TypeScript (ESM, Node ≥20), `@supabase/supabase-js` (the one new dep — covers auth + REST + realtime), commander, zod, vitest, tsup.

## Global Constraints

- Node `>=20`; ESM (`"type": "module"`), `.js` extensions on relative imports.
- **One** new runtime dependency only: `@supabase/supabase-js`. No others.
- Code style (prettier `.prettierrc.json`): no semicolons, single quotes, trailing commas `all`, printWidth 100, 2-space, `arrowParens: always`.
- `npm run typecheck` (`tsc --noEmit`) and `npm run lint` (`eslint . --quiet`) must pass after every task.
- Local JSONL mode (`sendMessage`, `listen`, room files) is **not modified** — it stays MIT/free with identical behavior.
- Reuse `buildMessage` / `parseMessage` / `MessageSchema` / `serializeMessage` from `schema.ts`. Map fields at the DB boundary only: `from → sender`, `to → recipient`.
- DB columns: `id, v, ts, room, sender, recipient, reply_to, kind, msg, owner, created_at`.
- RLS `owner = auth.uid()` on select + insert is mandatory (trust boundary — never skipped).
- Credentials file written mode `0600`.
- Supabase config: URL `https://lyktygwrmhfdxqoqzdxb.supabase.co`, anon key pending — both overridable via `CC_BRIDGE_SUPABASE_URL` / `CC_BRIDGE_SUPABASE_ANON_KEY`.
- Tests run offline. Network-touching functions take an **injected** `SupabaseClient` so tests use a fake. One live smoke test is env-gated and skipped by default.
- Every git commit message ends with the footer line: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>` (omitted from the short examples below for brevity — add it).
- Branch: `feat/hosted-relay` (already created).

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/20260621000000_messages.sql` | **Create** — `messages` table, index, RLS, realtime publication |
| `src/lib/config.ts` | **Create** — Supabase URL + anon key (env override, baked default) |
| `src/lib/paths.ts` | **Modify** — add `resolveCredentialsFile()` |
| `src/lib/credentials.ts` | **Create** — file-backed Supabase auth storage adapter (0600) |
| `src/lib/supabase.ts` | **Create** — `createBridgeClient()`, `isLoggedIn()` |
| `src/lib/message-row.ts` | **Create** — `MessageRow` type + `messageToRow` / `rowToMessage` |
| `src/lib/send-remote.ts` | **Create** — `sendRemote(input, client)` |
| `src/lib/async-queue.ts` | **Create** — reusable async-iterator queue (`createQueue`) |
| `src/lib/listen-remote.ts` | **Create** — `listenRemote(opts, client)` (subscribe + replay + dedupe) |
| `src/lib/backend.ts` | **Create** — `resolveBackend()` (cloud vs local) |
| `src/lib/auth.ts` | **Create** — `requestOtp` / `verifyOtp` / `logoutAndClear` / `whoami` |
| `src/bin/cc-bridge.ts` | **Modify** — `--local` flag, cloud routing, `login`/`logout`/`whoami` commands |
| `src/lib/index.ts` | **Modify** — export new public functions |
| `tests/unit/*.test.ts` | **Create** — unit tests per module |
| `tests/integration/cli.test.ts` | **Modify** — `--local` + `whoami` offline cases |
| `tests/integration/cloud-smoke.test.ts` | **Create** — env-gated live round-trip |
| `README.md` | **Modify** — "Cloud mode (beta)" section |

---

### Task 1: Dependency, DB migration, and config

**Files:**
- Modify: `package.json` (add dependency)
- Create: `supabase/migrations/20260621000000_messages.sql`
- Create: `src/lib/config.ts`
- Test: `tests/unit/config.test.ts`

**Interfaces:**
- Produces: `SUPABASE_URL: string`, `SUPABASE_ANON_KEY: string` from `config.ts`.

- [ ] **Step 1: Add the dependency**

Run: `npm install @supabase/supabase-js@^2`
Expected: `package.json` `dependencies` gains `"@supabase/supabase-js": "^2..."`; lockfile updates.

- [ ] **Step 2: Write the migration SQL**

Create `supabase/migrations/20260621000000_messages.sql`:

```sql
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
```

- [ ] **Step 3: Write the config module**

Create `src/lib/config.ts`:

```ts
export const SUPABASE_URL =
  process.env.CC_BRIDGE_SUPABASE_URL ?? 'https://lyktygwrmhfdxqoqzdxb.supabase.co'

export const SUPABASE_ANON_KEY =
  process.env.CC_BRIDGE_SUPABASE_ANON_KEY ?? 'REPLACE_WITH_ANON_KEY'
```

> When the anon key arrives, replace `'REPLACE_WITH_ANON_KEY'`. The anon key is public by design (safe to ship); access is gated by user JWT + RLS.

- [ ] **Step 4: Write the failing test**

Create `tests/unit/config.test.ts`:

```ts
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

beforeEach(() => vi.resetModules())
afterEach(() => {
  delete process.env.CC_BRIDGE_SUPABASE_URL
  delete process.env.CC_BRIDGE_SUPABASE_ANON_KEY
})

it('env vars override the baked defaults', async () => {
  process.env.CC_BRIDGE_SUPABASE_URL = 'https://example.test'
  process.env.CC_BRIDGE_SUPABASE_ANON_KEY = 'test-key'
  const { SUPABASE_URL, SUPABASE_ANON_KEY } = await import('../../src/lib/config.js')
  expect(SUPABASE_URL).toBe('https://example.test')
  expect(SUPABASE_ANON_KEY).toBe('test-key')
})
```

- [ ] **Step 5: Run the test**

Run: `npx vitest run tests/unit/config.test.ts`
Expected: PASS.

- [ ] **Step 6: Apply the migration to Supabase (manual / out-of-band)**

In the cc-bridge Supabase project SQL editor, paste and run the migration from Step 2. Then in **Auth → Email Templates → Magic Link**, ensure the body contains `{{ .Token }}` so the 6-digit OTP code is emailed (required for CLI login).
Expected: `messages` table exists with RLS enabled; realtime publication includes it.
> If the Supabase MCP is connected to this account, `apply_migration` can do Step 2's SQL instead of the editor.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json supabase/ src/lib/config.ts tests/unit/config.test.ts
git commit -m "feat(cloud): add supabase dep, messages migration, config module"
```

---

### Task 2: Credentials storage adapter

**Files:**
- Modify: `src/lib/paths.ts` (add `resolveCredentialsFile`)
- Create: `src/lib/credentials.ts`
- Test: `tests/unit/credentials.test.ts`

**Interfaces:**
- Consumes: `resolveBaseDir()` from `paths.ts`.
- Produces:
  - `resolveCredentialsFile(): string`
  - `interface FileStorage { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void }`
  - `createFileStorage(path?: string): FileStorage`
  - `clearCredentials(path?: string): void`

- [ ] **Step 1: Add the path helper**

In `src/lib/paths.ts`, after `resolveSessionFile` (line ~36), add:

```ts
export function resolveCredentialsFile(): string {
  return join(resolveBaseDir(), 'credentials.json')
}
```

- [ ] **Step 2: Write the failing test**

Create `tests/unit/credentials.test.ts`:

```ts
import { afterEach, beforeEach, expect, it } from 'vitest'
import { mkdtempSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createFileStorage, clearCredentials } from '../../src/lib/credentials.js'

let dir: string
let file: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ccb-cred-'))
  file = join(dir, 'credentials.json')
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

it('round-trips set/get/remove', () => {
  const s = createFileStorage(file)
  expect(s.getItem('k')).toBeNull()
  s.setItem('k', 'v')
  expect(s.getItem('k')).toBe('v')
  s.removeItem('k')
  expect(s.getItem('k')).toBeNull()
})

it('clearCredentials deletes the file', () => {
  const s = createFileStorage(file)
  s.setItem('k', 'v')
  expect(existsSync(file)).toBe(true)
  clearCredentials(file)
  expect(existsSync(file)).toBe(false)
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/unit/credentials.test.ts`
Expected: FAIL — cannot find module `credentials.js`.

- [ ] **Step 4: Write the implementation**

Create `src/lib/credentials.ts`:

```ts
import { readFileSync, writeFileSync, rmSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { resolveCredentialsFile } from './paths.js'

type Store = Record<string, string>

function read(path: string): Store {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as Store
  } catch {
    return {}
  }
}

function write(path: string, store: Store): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(store), { mode: 0o600 })
}

export interface FileStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export function createFileStorage(path: string = resolveCredentialsFile()): FileStorage {
  return {
    getItem(key) {
      return read(path)[key] ?? null
    },
    setItem(key, value) {
      const store = read(path)
      store[key] = value
      write(path, store)
    },
    removeItem(key) {
      const store = read(path)
      delete store[key]
      write(path, store)
    },
  }
}

export function clearCredentials(path: string = resolveCredentialsFile()): void {
  try {
    rmSync(path)
  } catch {
    // already gone
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/unit/credentials.test.ts`
Expected: PASS (both tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/paths.ts src/lib/credentials.ts tests/unit/credentials.test.ts
git commit -m "feat(cloud): file-backed credentials storage adapter"
```

---

### Task 3: Supabase client factory

**Files:**
- Create: `src/lib/supabase.ts`
- Test: `tests/unit/supabase.test.ts`

**Interfaces:**
- Consumes: `SUPABASE_URL`, `SUPABASE_ANON_KEY` (config), `createFileStorage` (credentials).
- Produces:
  - `createBridgeClient(): SupabaseClient`
  - `isLoggedIn(client?: SupabaseClient): Promise<boolean>`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/supabase.test.ts`:

```ts
import { afterEach, beforeEach, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createBridgeClient, isLoggedIn } from '../../src/lib/supabase.js'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ccb-sb-'))
  process.env.CC_BRIDGE_HOME = dir
})
afterEach(() => {
  delete process.env.CC_BRIDGE_HOME
  rmSync(dir, { recursive: true, force: true })
})

it('creates a client and reports logged-out with no credentials', async () => {
  const client = createBridgeClient()
  expect(client).toBeTruthy()
  expect(await isLoggedIn(client)).toBe(false)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/supabase.test.ts`
Expected: FAIL — cannot find module `supabase.js`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/supabase.ts`:

```ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js'
import { createFileStorage } from './credentials.js'

export function createBridgeClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      storage: createFileStorage(),
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  })
}

export async function isLoggedIn(client: SupabaseClient = createBridgeClient()): Promise<boolean> {
  const { data } = await client.auth.getSession()
  return data.session != null
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/supabase.test.ts`
Expected: PASS. (`getSession()` reads local storage only — no network with empty creds.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/supabase.ts tests/unit/supabase.test.ts
git commit -m "feat(cloud): supabase client factory + isLoggedIn"
```

---

### Task 4: Message ↔ row mapping

**Files:**
- Create: `src/lib/message-row.ts`
- Test: `tests/unit/message-row.test.ts`

**Interfaces:**
- Consumes: `MessageSchema`, `type Message`, `buildMessage` (schema).
- Produces:
  - `interface MessageRow { id: string; v: number; ts: string; room: string; sender: string; recipient: string | null; reply_to: string | null; kind: 'text' | 'event'; msg: string }`
  - `messageToRow(m: Message): MessageRow`
  - `rowToMessage(row: MessageRow): Message`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/message-row.test.ts`:

```ts
import { expect, it } from 'vitest'
import { buildMessage } from '../../src/lib/schema.js'
import { messageToRow, rowToMessage } from '../../src/lib/message-row.js'

it('maps from→sender, to→recipient and round-trips', () => {
  const m = buildMessage({ from: 'A', room: 'demo', msg: 'hi', to: 'B', kind: 'text' })
  const row = messageToRow(m)
  expect(row.sender).toBe('A')
  expect(row.recipient).toBe('B')
  expect(row.id).toBe(m.id)
  const back = rowToMessage(row)
  expect(back).toEqual(m)
})

it('handles absent to/reply_to as null and back to undefined', () => {
  const m = buildMessage({ from: 'A', room: 'demo', msg: 'hi' })
  const row = messageToRow(m)
  expect(row.recipient).toBeNull()
  expect(row.reply_to).toBeNull()
  const back = rowToMessage(row)
  expect(back.to).toBeUndefined()
  expect(back.reply_to).toBeUndefined()
})

it('rejects a malformed row', () => {
  const bad = { id: 'x', v: 1, ts: 'nope', room: 'demo', sender: 'A', recipient: null, reply_to: null, kind: 'text', msg: 'hi' }
  expect(() => rowToMessage(bad as never)).toThrow(/invalid row/)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/message-row.test.ts`
Expected: FAIL — cannot find module `message-row.js`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/message-row.ts`:

```ts
import { MessageSchema, type Message } from './schema.js'

export interface MessageRow {
  id: string
  v: number
  ts: string
  room: string
  sender: string
  recipient: string | null
  reply_to: string | null
  kind: 'text' | 'event'
  msg: string
}

export function messageToRow(m: Message): MessageRow {
  return {
    id: m.id,
    v: m.v,
    ts: m.ts,
    room: m.room,
    sender: m.from,
    recipient: m.to ?? null,
    reply_to: m.reply_to ?? null,
    kind: m.kind,
    msg: m.msg,
  }
}

export function rowToMessage(row: MessageRow): Message {
  const candidate = {
    v: row.v,
    id: row.id,
    ts: row.ts,
    room: row.room,
    from: row.sender,
    msg: row.msg,
    ...(row.recipient !== null ? { to: row.recipient } : {}),
    ...(row.reply_to !== null ? { reply_to: row.reply_to } : {}),
    kind: row.kind,
  }
  const result = MessageSchema.safeParse(candidate)
  if (!result.success) {
    throw new Error(`invalid row → message: ${result.error.message}`)
  }
  return result.data
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/message-row.test.ts`
Expected: PASS (all three).

- [ ] **Step 5: Commit**

```bash
git add src/lib/message-row.ts tests/unit/message-row.test.ts
git commit -m "feat(cloud): message <-> db row mapping"
```

---

### Task 5: sendRemote

**Files:**
- Create: `src/lib/send-remote.ts`
- Test: `tests/unit/send-remote.test.ts`

**Interfaces:**
- Consumes: `buildMessage`, `type BuildMessageInput`, `type Message` (schema); `messageToRow` (message-row); `type SupabaseClient`.
- Produces: `sendRemote(input: BuildMessageInput, client: SupabaseClient): Promise<Message>`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/send-remote.test.ts`:

```ts
import { expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { sendRemote } from '../../src/lib/send-remote.js'

function fakeClient(captured: { table?: string; row?: unknown }, error: { message: string } | null = null) {
  return {
    from(table: string) {
      captured.table = table
      return {
        async insert(row: unknown) {
          captured.row = row
          return { error }
        },
      }
    },
  } as unknown as SupabaseClient
}

it('inserts a mapped row into messages and returns the Message', async () => {
  const captured: { table?: string; row?: any } = {}
  const m = await sendRemote({ from: 'A', room: 'demo', msg: 'hi', to: 'B' }, fakeClient(captured))
  expect(captured.table).toBe('messages')
  expect(captured.row.sender).toBe('A')
  expect(captured.row.recipient).toBe('B')
  expect(m.id).toBe(captured.row.id)
})

it('throws when insert returns an error', async () => {
  const client = fakeClient({}, { message: 'rls denied' })
  await expect(sendRemote({ from: 'A', room: 'demo', msg: 'hi' }, client)).rejects.toThrow(/rls denied/)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/send-remote.test.ts`
Expected: FAIL — cannot find module `send-remote.js`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/send-remote.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import { buildMessage, type BuildMessageInput, type Message } from './schema.js'
import { messageToRow } from './message-row.js'

export async function sendRemote(
  input: BuildMessageInput,
  client: SupabaseClient,
): Promise<Message> {
  const message = buildMessage(input)
  const { error } = await client.from('messages').insert(messageToRow(message))
  if (error) {
    throw new Error(`cloud send failed: ${error.message}`)
  }
  return message
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/send-remote.test.ts`
Expected: PASS (both).

- [ ] **Step 5: Commit**

```bash
git add src/lib/send-remote.ts tests/unit/send-remote.test.ts
git commit -m "feat(cloud): sendRemote inserts via supabase"
```

---

### Task 6: Async-iterator queue helper

**Files:**
- Create: `src/lib/async-queue.ts`
- Test: `tests/unit/async-queue.test.ts`

**Interfaces:**
- Produces:
  - `interface Queue<T> { emit(value: T): void; close(): void | Promise<void>; iterator: AsyncIterable<T> }`
  - `createQueue<T>(onClose?: () => void | Promise<void>): Queue<T>`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/async-queue.test.ts`:

```ts
import { expect, it } from 'vitest'
import { createQueue } from '../../src/lib/async-queue.js'

it('delivers values emitted before and after a waiter, then closes', async () => {
  const onCloseCalls: number[] = []
  const q = createQueue<number>(() => {
    onCloseCalls.push(1)
  })
  const it = q.iterator[Symbol.asyncIterator]()

  q.emit(1) // buffered before consumer
  expect((await it.next()).value).toBe(1)

  const pending = it.next() // waiter registered first
  q.emit(2)
  expect((await pending).value).toBe(2)

  await q.close()
  expect(onCloseCalls).toEqual([1])
  expect((await it.next()).done).toBe(true)
})

it('return() closes the queue and runs onClose', async () => {
  let closed = false
  const q = createQueue<number>(() => {
    closed = true
  })
  const it = q.iterator[Symbol.asyncIterator]()
  await it.return!()
  expect(closed).toBe(true)
  expect((await it.next()).done).toBe(true)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/async-queue.test.ts`
Expected: FAIL — cannot find module `async-queue.js`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/async-queue.ts`:

```ts
export interface Queue<T> {
  emit(value: T): void
  close(): void | Promise<void>
  iterator: AsyncIterable<T>
}

export function createQueue<T>(onClose?: () => void | Promise<void>): Queue<T> {
  const buffer: T[] = []
  const waiters: Array<(r: IteratorResult<T>) => void> = []
  let closed = false

  function emit(value: T): void {
    if (closed) return
    const w = waiters.shift()
    if (w) w({ value, done: false })
    else buffer.push(value)
  }

  function close(): void | Promise<void> {
    if (closed) return
    closed = true
    for (const w of waiters.splice(0)) w({ value: undefined as never, done: true })
    return onClose?.()
  }

  const iterator: AsyncIterable<T> = {
    [Symbol.asyncIterator]() {
      return {
        next(): Promise<IteratorResult<T>> {
          if (buffer.length > 0) return Promise.resolve({ value: buffer.shift() as T, done: false })
          if (closed) return Promise.resolve({ value: undefined as never, done: true })
          return new Promise((resolve) => waiters.push(resolve))
        },
        async return(): Promise<IteratorResult<T>> {
          await close()
          return { value: undefined as never, done: true }
        },
      }
    },
  }

  return { emit, close, iterator }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/async-queue.test.ts`
Expected: PASS (both).

- [ ] **Step 5: Commit**

```bash
git add src/lib/async-queue.ts tests/unit/async-queue.test.ts
git commit -m "feat: reusable async-iterator queue helper"
```

---

### Task 7: listenRemote

**Files:**
- Create: `src/lib/listen-remote.ts`
- Test: `tests/unit/listen-remote.test.ts`

**Interfaces:**
- Consumes: `createQueue` (async-queue); `rowToMessage`, `type MessageRow` (message-row); `serializeMessage` (schema); `type ListenController`, `type ListenEvent`, `type ListenOptions` (listen); `type SupabaseClient`.
- Produces: `listenRemote(opts: ListenOptions, client: SupabaseClient): ListenController`

> **Behaviour note (`ponytail:` accepted ceiling):** live INSERTs arriving during backlog replay are emitted before older backlog rows, but the `seen` Set guarantees no duplicates and no drops. Minor boundary reordering on `--replay` only; not worth a reorder buffer.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/listen-remote.test.ts`:

```ts
import { expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { buildMessage } from '../../src/lib/schema.js'
import { messageToRow } from '../../src/lib/message-row.js'
import { listenRemote } from '../../src/lib/listen-remote.js'

// Fake client: captures the postgres_changes handler, lets the test push rows,
// and serves a fixed backlog from .from().select()...
function fakeClient(backlog: unknown[]) {
  let handler: ((p: { new: unknown }) => void) | null = null
  const client = {
    channel() {
      return {
        on(_event: string, _cfg: unknown, h: (p: { new: unknown }) => void) {
          handler = h
          return this
        },
        subscribe() {
          return this
        },
      }
    },
    removeChannel() {
      return Promise.resolve('ok')
    },
    from() {
      return {
        select() {
          return this
        },
        eq() {
          return this
        },
        order() {
          return this
        },
        limit() {
          return Promise.resolve({ data: backlog, error: null })
        },
      }
    },
  } as unknown as SupabaseClient
  return { client, push: (row: unknown) => handler?.({ new: row }) }
}

it('emits a serialized line for a live insert', async () => {
  const { client, push } = fakeClient([])
  const ctrl = listenRemote({ room: 'demo', sessionId: 's' }, client)
  const it = ctrl.iterator[Symbol.asyncIterator]()
  const m = buildMessage({ from: 'A', room: 'demo', msg: 'hi' })
  push(messageToRow(m))
  const ev = (await it.next()).value as { ok: boolean; line: string }
  expect(ev.ok).toBe(true)
  expect(JSON.parse(ev.line).id).toBe(m.id)
  await ctrl.close()
})

it('replays backlog without duplicating a live row of the same id', async () => {
  const live = buildMessage({ from: 'A', room: 'demo', msg: 'live' })
  const old = buildMessage({ from: 'B', room: 'demo', msg: 'old' })
  const { client, push } = fakeClient([messageToRow(old), messageToRow(live)]) // newest-first
  const ctrl = listenRemote({ room: 'demo', sessionId: 's', replayLastN: 2 }, client)
  const it = ctrl.iterator[Symbol.asyncIterator]()
  push(messageToRow(live)) // arrives live before backlog query resolves
  const ids: string[] = []
  ids.push(JSON.parse(((await it.next()).value as { line: string }).line).id)
  ids.push(JSON.parse(((await it.next()).value as { line: string }).line).id)
  expect(new Set(ids).size).toBe(2) // no dupe
  expect(ids).toContain(live.id)
  expect(ids).toContain(old.id)
  await ctrl.close()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/listen-remote.test.ts`
Expected: FAIL — cannot find module `listen-remote.js`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/listen-remote.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import { createQueue } from './async-queue.js'
import { rowToMessage, type MessageRow } from './message-row.js'
import { serializeMessage } from './schema.js'
import type { ListenController, ListenEvent, ListenOptions } from './listen.js'

export function listenRemote(opts: ListenOptions, client: SupabaseClient): ListenController {
  const seen = new Set<string>()
  let channel: ReturnType<SupabaseClient['channel']> | null = null

  const queue = createQueue<ListenEvent>(async () => {
    if (channel) await client.removeChannel(channel)
  })

  function emitRow(row: MessageRow): void {
    if (seen.has(row.id)) return
    seen.add(row.id)
    try {
      queue.emit({ ok: true, line: serializeMessage(rowToMessage(row)) })
    } catch {
      queue.emit({ ok: false, reason: 'invalid', raw: JSON.stringify(row).slice(0, 200) })
    }
  }

  channel = client
    .channel(`room:${opts.room}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages', filter: `room=eq.${opts.room}` },
      (payload: { new: MessageRow }) => emitRow(payload.new),
    )
    .subscribe()

  const replay = opts.replayLastN ?? 0
  if (replay > 0) {
    void (async () => {
      const { data, error } = await client
        .from('messages')
        .select('*')
        .eq('room', opts.room)
        .order('id', { ascending: false })
        .limit(replay)
      if (error || !data) return
      for (const row of (data as MessageRow[]).reverse()) emitRow(row)
    })()
  }

  return {
    iterator: queue.iterator,
    close: async () => {
      await queue.close()
    },
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/listen-remote.test.ts`
Expected: PASS (both).

- [ ] **Step 5: Commit**

```bash
git add src/lib/listen-remote.ts tests/unit/listen-remote.test.ts
git commit -m "feat(cloud): listenRemote subscribe + replay + dedupe"
```

---

### Task 8: Backend resolver

**Files:**
- Create: `src/lib/backend.ts`
- Test: `tests/unit/backend.test.ts`

**Interfaces:**
- Consumes: `isLoggedIn` (supabase) as the default dependency.
- Produces:
  - `type Backend = 'cloud' | 'local'`
  - `resolveBackend(opts: { local?: boolean }, deps?: { isLoggedIn: () => Promise<boolean> }): Promise<Backend>`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/backend.test.ts`:

```ts
import { afterEach, expect, it } from 'vitest'
import { resolveBackend } from '../../src/lib/backend.js'

afterEach(() => delete process.env.CC_BRIDGE_LOCAL)

const yes = { isLoggedIn: async () => true }
const no = { isLoggedIn: async () => false }

it('--local forces local even when logged in', async () => {
  expect(await resolveBackend({ local: true }, yes)).toBe('local')
})

it('CC_BRIDGE_LOCAL forces local', async () => {
  process.env.CC_BRIDGE_LOCAL = '1'
  expect(await resolveBackend({}, yes)).toBe('local')
})

it('logged in → cloud', async () => {
  expect(await resolveBackend({}, yes)).toBe('cloud')
})

it('logged out → local', async () => {
  expect(await resolveBackend({}, no)).toBe('local')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/backend.test.ts`
Expected: FAIL — cannot find module `backend.js`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/backend.ts`:

```ts
import { isLoggedIn as realIsLoggedIn } from './supabase.js'

export type Backend = 'cloud' | 'local'

export async function resolveBackend(
  opts: { local?: boolean },
  deps: { isLoggedIn: () => Promise<boolean> } = { isLoggedIn: () => realIsLoggedIn() },
): Promise<Backend> {
  if (opts.local) return 'local'
  if (process.env.CC_BRIDGE_LOCAL && process.env.CC_BRIDGE_LOCAL.length > 0) return 'local'
  return (await deps.isLoggedIn()) ? 'cloud' : 'local'
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/backend.test.ts`
Expected: PASS (all four).

- [ ] **Step 5: Commit**

```bash
git add src/lib/backend.ts tests/unit/backend.test.ts
git commit -m "feat(cloud): backend resolver (cloud vs local)"
```

---

### Task 9: Auth library

**Files:**
- Create: `src/lib/auth.ts`
- Test: `tests/unit/auth.test.ts`

**Interfaces:**
- Consumes: `clearCredentials` (credentials); `type SupabaseClient`.
- Produces:
  - `requestOtp(client: SupabaseClient, email: string): Promise<void>`
  - `verifyOtp(client: SupabaseClient, email: string, token: string): Promise<string>` (returns email)
  - `logoutAndClear(client: SupabaseClient): Promise<void>`
  - `whoami(client: SupabaseClient): Promise<string | null>`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/auth.test.ts`:

```ts
import { afterEach, beforeEach, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requestOtp, verifyOtp, whoami, logoutAndClear } from '../../src/lib/auth.js'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ccb-auth-'))
  process.env.CC_BRIDGE_HOME = dir
})
afterEach(() => {
  delete process.env.CC_BRIDGE_HOME
  rmSync(dir, { recursive: true, force: true })
})

function fakeAuth(over: Record<string, unknown> = {}) {
  return { auth: { 
    signInWithOtp: async () => ({ error: null }),
    verifyOtp: async () => ({ data: { user: { email: 'me@x.com' } }, error: null }),
    signOut: async () => ({ error: null }),
    getUser: async () => ({ data: { user: { email: 'me@x.com' } } }),
    ...over,
  } } as unknown as SupabaseClient
}

it('requestOtp throws on error', async () => {
  const c = fakeAuth({ signInWithOtp: async () => ({ error: { message: 'bad email' } }) })
  await expect(requestOtp(c, 'x')).rejects.toThrow(/bad email/)
})

it('verifyOtp returns the email', async () => {
  expect(await verifyOtp(fakeAuth(), 'me@x.com', '123456')).toBe('me@x.com')
})

it('whoami returns the email', async () => {
  expect(await whoami(fakeAuth())).toBe('me@x.com')
})

it('logoutAndClear does not throw', async () => {
  await expect(logoutAndClear(fakeAuth())).resolves.toBeUndefined()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/auth.test.ts`
Expected: FAIL — cannot find module `auth.js`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/auth.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import { clearCredentials } from './credentials.js'

export async function requestOtp(client: SupabaseClient, email: string): Promise<void> {
  const { error } = await client.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true },
  })
  if (error) throw new Error(`login request failed: ${error.message}`)
}

export async function verifyOtp(
  client: SupabaseClient,
  email: string,
  token: string,
): Promise<string> {
  const { data, error } = await client.auth.verifyOtp({ email, token, type: 'email' })
  if (error) throw new Error(`code verification failed: ${error.message}`)
  return data.user?.email ?? email
}

export async function logoutAndClear(client: SupabaseClient): Promise<void> {
  await client.auth.signOut().catch(() => undefined)
  clearCredentials()
}

export async function whoami(client: SupabaseClient): Promise<string | null> {
  const { data } = await client.auth.getUser()
  return data.user?.email ?? null
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/auth.test.ts`
Expected: PASS (all four).

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth.ts tests/unit/auth.test.ts
git commit -m "feat(cloud): email-OTP auth library"
```

---

### Task 10: Wire the CLI

**Files:**
- Modify: `src/bin/cc-bridge.ts`
- Modify: `src/lib/index.ts`
- Test: `tests/integration/cli.test.ts`

**Interfaces:**
- Consumes: `createBridgeClient` (supabase), `sendRemote` (send-remote), `listenRemote` (listen-remote), `resolveBackend` (backend), `requestOtp`/`verifyOtp`/`logoutAndClear`/`whoami` (auth).
- Produces: CLI commands `login` / `logout` / `whoami`; `--local` flag on `send` and `listen`; expanded `src/lib/index.ts` exports.

- [ ] **Step 1: Add new exports to the library index**

In `src/lib/index.ts`, append:

```ts
export { createBridgeClient, isLoggedIn } from './supabase.js'
export { sendRemote } from './send-remote.js'
export { listenRemote } from './listen-remote.js'
export { resolveBackend, type Backend } from './backend.js'
export { requestOtp, verifyOtp, logoutAndClear, whoami } from './auth.js'
export { messageToRow, rowToMessage, type MessageRow } from './message-row.js'
export { createFileStorage, clearCredentials, type FileStorage } from './credentials.js'
export { createQueue, type Queue } from './async-queue.js'
export { resolveCredentialsFile } from './paths.js'
```

- [ ] **Step 2: Extend bin imports and add a prompt helper**

In `src/bin/cc-bridge.ts`, extend the import from `'../lib/index.js'` (lines 5-14) to also include:

```ts
  createBridgeClient,
  sendRemote,
  listenRemote,
  resolveBackend,
  requestOtp,
  verifyOtp,
  logoutAndClear,
  whoami,
```

Then add this helper next to `readStdin` (near line 211):

```ts
function prompt(label: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stderr })
    rl.question(label, (answer) => {
      rl.close()
      resolve(answer)
    })
  })
}
```

- [ ] **Step 3: Add `--local` and cloud routing to `listen`**

In the `listen` command, add the option (after line 32's `--json-errors`):

```ts
  .option('--local', 'force local JSONL files even if logged in')
```

Add `local?: boolean` to the action's `opts` type, and replace the `const ctrl = listen({ ... })` line (line 47) with:

```ts
        const backend = await resolveBackend({ local: opts.local })
        const ctrl =
          backend === 'cloud'
            ? listenRemote({ room, sessionId, replayLastN: opts.replay }, createBridgeClient())
            : listen({ room, sessionId, replayLastN: opts.replay })
```

- [ ] **Step 4: Add `--local` and cloud routing to `send`**

In the `send` command, add the option (after line 96's `--kind`):

```ts
  .option('--local', 'force local JSONL files even if logged in')
```

Add `local?: boolean` to the action's `opts` type, and replace the `const built = await sendMessage({ ... })` block (lines 120-127) with:

```ts
        const backend = await resolveBackend({ local: opts.local })
        const payload = {
          from,
          room: opts.room,
          msg,
          ...(opts.to !== undefined ? { to: opts.to } : {}),
          ...(opts.replyTo !== undefined ? { reply_to: opts.replyTo } : {}),
          kind: opts.kind as 'text' | 'event',
        }
        const built =
          backend === 'cloud'
            ? await sendRemote(payload, createBridgeClient())
            : await sendMessage(payload)
```

- [ ] **Step 5: Add `login` / `logout` / `whoami` commands**

In `src/bin/cc-bridge.ts`, before `await program.parseAsync(process.argv)` (line 209), add:

```ts
program
  .command('login')
  .description('Log in via email one-time code (enables cloud relay)')
  .argument('[email]', 'account email')
  .action(async (emailArg: string | undefined) => {
    try {
      const email = emailArg ?? (await prompt('Email: ')).trim()
      if (!email) {
        process.stderr.write('cc-bridge: email required\n')
        process.exit(1)
      }
      const client = createBridgeClient()
      await requestOtp(client, email)
      process.stderr.write(`cc-bridge: 6-digit code sent to ${email}\n`)
      const token = (await prompt('Code: ')).trim()
      const who = await verifyOtp(client, email, token)
      process.stdout.write(`logged in as ${who}\n`)
    } catch (e) {
      process.stderr.write(`cc-bridge: ${(e as Error).message}\n`)
      process.exit(1)
    }
  })

program
  .command('logout')
  .description('Log out and clear cached credentials')
  .action(async () => {
    await logoutAndClear(createBridgeClient())
    process.stdout.write('logged out\n')
  })

program
  .command('whoami')
  .description('Show the logged-in account email (or "not logged in")')
  .action(async () => {
    try {
      const who = await whoami(createBridgeClient())
      process.stdout.write(who ? `${who}\n` : 'not logged in\n')
    } catch {
      process.stdout.write('not logged in\n')
    }
  })
```

- [ ] **Step 6: Add offline CLI integration tests**

In `tests/integration/cli.test.ts`, add cases that run the built binary with a temp `CC_BRIDGE_HOME` and no credentials (so it stays in local/logged-out mode). Match the file's existing execa/run helper and `dist/bin/cc-bridge.js` path. Example shape (adapt to the file's existing helpers):

```ts
it('whoami reports not logged in with no credentials', async () => {
  const { stdout } = await runCli(['whoami'], { env: { CC_BRIDGE_HOME: tmpHome } })
  expect(stdout.trim()).toBe('not logged in')
})

it('send --local then listen --local --replay round-trips offline', async () => {
  await runCli(['send', 'hello', '--room', 'itest', '--local'], { env: { CC_BRIDGE_HOME: tmpHome } })
  const { stdout } = await runCli(['listen', 'itest', '--local', '--replay', '1', '--pretty'], {
    env: { CC_BRIDGE_HOME: tmpHome },
    timeoutKill: 1500, // existing pattern: kill the tail after it prints
  })
  expect(stdout).toContain('hello')
})
```

- [ ] **Step 7: Build, typecheck, lint, test everything**

Run: `npm run build && npm run typecheck && npm run lint && npm test`
Expected: build succeeds; no type errors; no lint errors; all tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/bin/cc-bridge.ts src/lib/index.ts tests/integration/cli.test.ts
git commit -m "feat(cloud): wire login/logout/whoami + --local cloud routing into CLI"
```

---

### Task 11: Live smoke test + README

**Files:**
- Create: `tests/integration/cloud-smoke.test.ts`
- Modify: `README.md`

**Interfaces:**
- Consumes: `createBridgeClient`, `sendRemote`, `listenRemote` (public exports).

- [ ] **Step 1: Write the env-gated smoke test**

Create `tests/integration/cloud-smoke.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { createBridgeClient } from '../../src/lib/supabase.js'
import { sendRemote } from '../../src/lib/send-remote.js'
import { listenRemote } from '../../src/lib/listen-remote.js'

// Runs only when a real, logged-in session + anon key are configured.
// Requires: CC_BRIDGE_SUPABASE_ANON_KEY set, CC_BRIDGE_HOME pointing at creds
// from a prior `cc-bridge login`, and CC_BRIDGE_SMOKE=1.
const run = process.env.CC_BRIDGE_SMOKE === '1'

describe.skipIf(!run)('cloud smoke', () => {
  it('send then listen round-trips through Supabase', async () => {
    const room = `smoke-${Date.now()}`
    const client = createBridgeClient()
    const ctrl = listenRemote({ room, sessionId: 'smoke', replayLastN: 0 }, client)
    const it = ctrl.iterator[Symbol.asyncIterator]()
    await new Promise((r) => setTimeout(r, 1000)) // let subscription establish
    const sent = await sendRemote({ from: 'smoke', room, msg: 'ping' }, client)
    const ev = (await it.next()).value as { ok: boolean; line: string }
    expect(JSON.parse(ev.line).id).toBe(sent.id)
    await ctrl.close()
  }, 15_000)
})
```

- [ ] **Step 2: Verify the gate skips by default**

Run: `npx vitest run tests/integration/cloud-smoke.test.ts`
Expected: test is skipped (no failure) because `CC_BRIDGE_SMOKE` is unset.

- [ ] **Step 3: Document cloud mode in the README**

In `README.md`, add a section:

```markdown
## Cloud mode (beta)

Sync sessions across machines, not just one disk.

```bash
cc-bridge login you@email.com   # emails a 6-digit code; paste it
cc-bridge whoami                # confirms the account
# now send/listen use the cloud automatically:
cc-bridge listen demo           # on machine B
cc-bridge send "API is yours"   # on machine A → appears on B in ~1s
cc-bridge send "..." --local    # force the old local JSONL mode
cc-bridge logout
```

Local JSONL mode is unchanged and stays the default until you log in.
```

- [ ] **Step 4: Commit**

```bash
git add tests/integration/cloud-smoke.test.ts README.md
git commit -m "test(cloud): env-gated live smoke test; docs: cloud mode section"
```

---

## Self-Review

**Spec coverage:**
- Data model / migration → Task 1. RLS + realtime publication → Task 1 (Step 2/6).
- Auth (OTP login/logout/whoami, JWT via storage) → Tasks 2, 3, 9, 10.
- CLI seam (sendRemote/listenRemote, backend switch, `--local`) → Tasks 4–8, 10.
- Realtime + replay + dedupe ordering → Task 7.
- Security (RLS, 0600 creds, public anon key) → Task 1 (RLS), Task 2 (0600), Task 1 Step 3 note.
- Open-core (local untouched) → enforced by Global Constraints; `--local` + logged-out default in Task 8/10.
- Success criteria 1–4 (cross-machine, replay no-dupe, RLS isolation) → covered by Tasks 7, 9, 10 + the Task 11 live smoke; criterion 5 (local unchanged) → Task 10 Step 6 offline round-trip.

**Placeholder scan:** No "TBD/TODO/handle edge cases" steps; every code step shows complete code. The only intentional literal placeholder is `'REPLACE_WITH_ANON_KEY'` in `config.ts`, called out as a real value pending from the user.

**Type consistency:** `MessageRow` defined once (Task 4), consumed by Tasks 5 & 7. `ListenController`/`ListenEvent`/`ListenOptions` reused from existing `listen.ts`. `createQueue<T>` (Task 6) consumed by Task 7. `resolveBackend` signature identical across Tasks 8 & 10. `createBridgeClient`/`sendRemote`/`listenRemote` signatures consistent across producer and CLI consumer. Field mapping `from→sender`, `to→recipient` consistent in mapping, send, and listen.

**Note for executor:** Tasks 1 (Step 6, migration apply) and Task 11 smoke depend on the pending anon key + a configured Supabase project. All other tasks (2–10) run fully offline and are unblocked now.
