# Claude Code Live Bridge — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `@incultnitollc/cc-bridge` v1 — a single npm package providing a CLI (`cc-bridge`) and library for JSONL-based live messaging between local Claude Code sessions.

**Architecture:** Node-native (chokidar + proper-lockfile + ulid + zod), single package exports CLI + lib. Pure `lib/` modules (no I/O to stdout); CLI binary in `bin/cc-bridge.ts` is the only stdio surface. All file paths funnel through `lib/paths.ts` (security chokepoint).

**Tech Stack:** TypeScript strict, Node ≥20, ESM-only. Runtime: commander, chokidar, proper-lockfile, ulid, zod, ansi-regex. Dev: vitest, @vitest/coverage-v8, tsup, eslint, typescript-eslint, prettier, execa, tmp-promise.

**Spec:** `docs/superpowers/specs/2026-06-02-claude-code-live-bridge-design.md` (commit `6309de0`)

**Pre-flight assumption:** The executing session opens at `/Users/pengspirit/incultnito/Dev/Backend/repos/claude-code-live-bridge/` and runs in **auto-mode**. The repo already has a `main` branch with the spec committed. Node 20+ and npm 10+ are available.

---

## Task 1: Scaffold (config files only — no source code)

Per CLAUDE.md: first commit must be scaffold only.

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.gitignore`
- Create: `.npmignore`
- Create: `eslint.config.js`
- Create: `.prettierrc.json`
- Create: `vitest.config.ts`
- Create: `tsup.config.ts`
- Create: `LICENSE`

- [ ] **Step 1.1: Write `package.json`**

```json
{
  "name": "@incultnitollc/cc-bridge",
  "version": "0.1.0",
  "description": "Live JSONL message bridge between local Claude Code sessions",
  "type": "module",
  "license": "MIT",
  "author": "Peng (Incultnito LLC)",
  "homepage": "https://github.com/Incultnitollc/claude-code-live-bridge#readme",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/Incultnitollc/claude-code-live-bridge.git"
  },
  "bugs": {
    "url": "https://github.com/Incultnitollc/claude-code-live-bridge/issues"
  },
  "keywords": [
    "claude-code",
    "claude",
    "agent",
    "ipc",
    "jsonl",
    "bridge",
    "multi-agent"
  ],
  "engines": {
    "node": ">=20"
  },
  "bin": {
    "cc-bridge": "./dist/bin/cc-bridge.js"
  },
  "main": "./dist/lib/index.js",
  "types": "./dist/lib/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/lib/index.d.ts",
      "import": "./dist/lib/index.js"
    }
  },
  "files": [
    "dist",
    "README.md",
    "LICENSE"
  ],
  "scripts": {
    "build": "tsup",
    "typecheck": "tsc --noEmit",
    "lint": "eslint . --quiet",
    "format": "prettier --write .",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "prepublishOnly": "npm run typecheck && npm run lint && npm run test && npm run build"
  },
  "dependencies": {
    "ansi-regex": "^6.1.0",
    "chokidar": "^4.0.3",
    "commander": "^12.1.0",
    "proper-lockfile": "^4.1.2",
    "ulid": "^2.3.0",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/node": "^22.10.2",
    "@types/proper-lockfile": "^4.1.4",
    "@vitest/coverage-v8": "^2.1.8",
    "eslint": "^9.17.0",
    "execa": "^9.5.2",
    "prettier": "^3.4.2",
    "tmp-promise": "^3.0.3",
    "tsup": "^8.3.5",
    "typescript": "^5.7.2",
    "typescript-eslint": "^8.18.2",
    "vitest": "^2.1.8"
  }
}
```

- [ ] **Step 1.2: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "exactOptionalPropertyTypes": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "declaration": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "types": ["node"]
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

- [ ] **Step 1.3: Write `.gitignore`**

```
node_modules/
dist/
coverage/
.DS_Store
*.log
.env
.env.local
.vitest-tmp/
```

- [ ] **Step 1.4: Write `.npmignore`**

```
src/
tests/
docs/
.github/
coverage/
*.config.ts
*.config.js
.eslintrc*
.prettierrc*
tsconfig.json
.gitignore
```

- [ ] **Step 1.5: Write `eslint.config.js`**

```js
import js from '@eslint/js'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/explicit-function-return-type': 'off',
      'no-console': 'off',
    },
  },
  {
    ignores: ['dist/**', 'coverage/**', 'node_modules/**'],
  },
)
```

- [ ] **Step 1.6: Write `.prettierrc.json`**

```json
{
  "semi": false,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2,
  "arrowParens": "always"
}
```

- [ ] **Step 1.7: Write `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/lib/**/*.ts'],
      exclude: ['src/lib/index.ts'],
      thresholds: {
        lines: 85,
        functions: 85,
        branches: 80,
        statements: 85,
      },
    },
  },
})
```

- [ ] **Step 1.8: Write `tsup.config.ts`**

```ts
import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/lib/index.ts', 'src/bin/cc-bridge.ts'],
  format: ['esm'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  shims: true,
  target: 'node20',
})
```

- [ ] **Step 1.9: Write `LICENSE` (MIT)**

```
MIT License

Copyright (c) 2026 Incultnito LLC

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

- [ ] **Step 1.10: Install dependencies**

Run: `npm install`
Expected: `node_modules/` created, `package-lock.json` written, zero vulnerabilities (or moderate transitive only).

- [ ] **Step 1.11: Verify scaffold typechecks (no source yet → should error cleanly with no input files)**

Run: `npx tsc --noEmit`
Expected: error `TS18003: No inputs were found in config file` — acceptable; means scaffold is wired but src/ is empty. Continue.

- [ ] **Step 1.12: Commit scaffold**

```bash
git add package.json tsconfig.json .gitignore .npmignore eslint.config.js .prettierrc.json vitest.config.ts tsup.config.ts LICENSE package-lock.json
git commit -m "chore: scaffold project (package.json, tsconfig, eslint, vitest, tsup, MIT)

Scaffold-only first commit per CLAUDE.md rule. No source code yet.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 2: Schema module (TDD)

The schema is the foundation everything else depends on. Build first.

**Files:**
- Create: `src/lib/schema.ts`
- Create: `tests/unit/schema.test.ts`

- [ ] **Step 2.1: Write failing tests**

Create `tests/unit/schema.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { Message, parseMessage, buildMessage, SCHEMA_VERSION } from '../../src/lib/schema.js'

describe('schema', () => {
  test('SCHEMA_VERSION is 1', () => {
    expect(SCHEMA_VERSION).toBe(1)
  })

  test('valid message parses', () => {
    const raw = {
      v: 1,
      id: '01HZZZZZZZZZZZZZZZZZZZZZZZ',
      ts: '2026-06-02T12:00:00.000Z',
      room: 'default',
      from: 'host-1234-abc12345',
      msg: 'hello',
    }
    const result = parseMessage(JSON.stringify(raw))
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.msg).toBe('hello')
      expect(result.value.kind).toBe('text')
    }
  })

  test('missing required field fails', () => {
    const raw = { v: 1, id: '01HZZZZZZZZZZZZZZZZZZZZZZZ', ts: '2026-06-02T12:00:00.000Z' }
    const result = parseMessage(JSON.stringify(raw))
    expect(result.ok).toBe(false)
  })

  test('unknown fields are preserved on parse', () => {
    const raw = {
      v: 1,
      id: '01HZZZZZZZZZZZZZZZZZZZZZZZ',
      ts: '2026-06-02T12:00:00.000Z',
      room: 'default',
      from: 'host-1234-abc12345',
      msg: 'hi',
      custom_field: 'preserved',
    }
    const result = parseMessage(JSON.stringify(raw))
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect((result.value as Record<string, unknown>).custom_field).toBe('preserved')
    }
  })

  test('invalid ulid rejected', () => {
    const raw = {
      v: 1,
      id: 'not-a-ulid',
      ts: '2026-06-02T12:00:00.000Z',
      room: 'default',
      from: 'host-1234-abc12345',
      msg: 'hi',
    }
    const result = parseMessage(JSON.stringify(raw))
    expect(result.ok).toBe(false)
  })

  test('non-ISO ts rejected', () => {
    const raw = {
      v: 1,
      id: '01HZZZZZZZZZZZZZZZZZZZZZZZ',
      ts: 'yesterday',
      room: 'default',
      from: 'host-1234-abc12345',
      msg: 'hi',
    }
    const result = parseMessage(JSON.stringify(raw))
    expect(result.ok).toBe(false)
  })

  test('msg over 64KB rejected', () => {
    const raw = {
      v: 1,
      id: '01HZZZZZZZZZZZZZZZZZZZZZZZ',
      ts: '2026-06-02T12:00:00.000Z',
      room: 'default',
      from: 'host-1234-abc12345',
      msg: 'x'.repeat(64_001),
    }
    const result = parseMessage(JSON.stringify(raw))
    expect(result.ok).toBe(false)
  })

  test('buildMessage creates valid message with defaults', () => {
    const m = buildMessage({ from: 'me', room: 'default', msg: 'hi' })
    expect(m.v).toBe(1)
    expect(m.id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/)
    expect(m.ts).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/)
    expect(m.kind).toBe('text')
    expect(m.to).toBeUndefined()
  })

  test('buildMessage rejects empty msg', () => {
    expect(() => buildMessage({ from: 'me', room: 'default', msg: '' })).toThrow()
  })

  test('buildMessage rejects oversize msg', () => {
    expect(() =>
      buildMessage({ from: 'me', room: 'default', msg: 'x'.repeat(64_001) }),
    ).toThrow()
  })

  test('buildMessage rejects invalid room name', () => {
    expect(() => buildMessage({ from: 'me', room: '../etc', msg: 'hi' })).toThrow()
  })

  test('buildMessage rejects invalid from', () => {
    expect(() => buildMessage({ from: '', room: 'default', msg: 'hi' })).toThrow()
  })

  test('schema version > 1 returns special error', () => {
    const raw = {
      v: 2,
      id: '01HZZZZZZZZZZZZZZZZZZZZZZZ',
      ts: '2026-06-02T12:00:00.000Z',
      room: 'default',
      from: 'host-1234-abc12345',
      msg: 'hi',
    }
    const result = parseMessage(JSON.stringify(raw))
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe('unknown_version')
    }
  })

  test('malformed JSON returns parse error', () => {
    const result = parseMessage('{not json')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe('malformed')
    }
  })

  test('room name allows alphanum, dot, underscore, hyphen', () => {
    const valid = ['default', 'planning.v2', 'team_alpha', 'room-1']
    for (const room of valid) {
      const m = buildMessage({ from: 'me', room, msg: 'hi' })
      expect(m.room).toBe(room)
    }
  })

  test('room name rejects traversal attempts', () => {
    const bad = ['../foo', './foo', '/abs', 'foo/bar', 'foo bar', '']
    for (const room of bad) {
      expect(() => buildMessage({ from: 'me', room, msg: 'hi' })).toThrow()
    }
  })
})
```

- [ ] **Step 2.2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/schema.test.ts`
Expected: FAIL — module `src/lib/schema.ts` does not exist.

- [ ] **Step 2.3: Implement `src/lib/schema.ts`**

```ts
import { ulid } from 'ulid'
import { z } from 'zod'

export const SCHEMA_VERSION = 1 as const

const ROOM_NAME_RE = /^[a-zA-Z0-9_.-]{1,64}$/
const ULID_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/

export const MessageSchema = z
  .object({
    v: z.literal(SCHEMA_VERSION),
    id: z.string().regex(ULID_RE),
    ts: z.string().datetime(),
    room: z.string().regex(ROOM_NAME_RE),
    from: z.string().min(1).max(64).regex(/^[a-zA-Z0-9._-]+$/),
    msg: z.string().min(1).max(64_000),
    to: z.string().min(1).max(64).regex(/^[a-zA-Z0-9._-]+$/).optional(),
    reply_to: z.string().regex(ULID_RE).optional(),
    kind: z.enum(['text', 'event']).default('text'),
  })
  .passthrough()

export type Message = z.infer<typeof MessageSchema>

export type ParseResult =
  | { ok: true; value: Message }
  | { ok: false; reason: 'malformed' | 'unknown_version' | 'invalid'; error: string }

export function parseMessage(line: string): ParseResult {
  let raw: unknown
  try {
    raw = JSON.parse(line)
  } catch (e) {
    return { ok: false, reason: 'malformed', error: (e as Error).message }
  }
  if (
    raw &&
    typeof raw === 'object' &&
    'v' in raw &&
    typeof (raw as { v: unknown }).v === 'number' &&
    (raw as { v: number }).v > SCHEMA_VERSION
  ) {
    return {
      ok: false,
      reason: 'unknown_version',
      error: `unknown schema version ${(raw as { v: number }).v}`,
    }
  }
  const result = MessageSchema.safeParse(raw)
  if (!result.success) {
    return { ok: false, reason: 'invalid', error: result.error.message }
  }
  return { ok: true, value: result.data }
}

export interface BuildMessageInput {
  from: string
  room: string
  msg: string
  to?: string
  reply_to?: string
  kind?: 'text' | 'event'
}

export function buildMessage(input: BuildMessageInput): Message {
  const candidate = {
    v: SCHEMA_VERSION,
    id: ulid(),
    ts: new Date().toISOString(),
    room: input.room,
    from: input.from,
    msg: input.msg,
    ...(input.to !== undefined ? { to: input.to } : {}),
    ...(input.reply_to !== undefined ? { reply_to: input.reply_to } : {}),
    kind: input.kind ?? 'text',
  }
  const result = MessageSchema.safeParse(candidate)
  if (!result.success) {
    throw new Error(`invalid message: ${result.error.message}`)
  }
  return result.data
}

export function serializeMessage(m: Message): string {
  return JSON.stringify(m)
}
```

- [ ] **Step 2.4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/schema.test.ts`
Expected: PASS — all 15 tests.

- [ ] **Step 2.5: Typecheck + lint**

Run: `npx tsc --noEmit && npx eslint . --quiet`
Expected: both clean.

- [ ] **Step 2.6: Commit**

```bash
git add src/lib/schema.ts tests/unit/schema.test.ts
git commit -m "feat(schema): add zod-validated Message type + parse/build

Schema v1 with required (v, id, ts, room, from, msg) and optional
(to, reply_to, kind) fields. Passthrough preserves unknown fields for
forward-compat. parseMessage returns tagged result so callers can
distinguish malformed JSON from unknown version from invalid shape.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 3: Paths module (TDD)

Security chokepoint. Everything touching the filesystem goes through here.

**Files:**
- Create: `src/lib/paths.ts`
- Create: `tests/unit/paths.test.ts`

- [ ] **Step 3.1: Write failing tests**

Create `tests/unit/paths.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { mkdir, symlink, writeFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { dir as tmpDir } from 'tmp-promise'
import {
  resolveBaseDir,
  resolveRoomFile,
  resolveSessionFile,
  resolveOffsetFile,
  ensureBaseDir,
  ensureRoomFile,
  refuseSymlink,
  isValidRoomName,
} from '../../src/lib/paths.js'

describe('paths', () => {
  let base: string
  let cleanup: () => Promise<void>

  beforeEach(async () => {
    const t = await tmpDir({ unsafeCleanup: true })
    base = t.path
    cleanup = async () => {
      await t.cleanup()
    }
    process.env.CC_BRIDGE_HOME = base
  })

  afterEach(async () => {
    delete process.env.CC_BRIDGE_HOME
    await cleanup()
  })

  test('resolveBaseDir reads CC_BRIDGE_HOME', () => {
    expect(resolveBaseDir()).toBe(base)
  })

  test('resolveRoomFile composes correctly', () => {
    expect(resolveRoomFile('default')).toBe(join(base, 'rooms', 'default.jsonl'))
  })

  test('resolveRoomFile rejects path traversal', () => {
    expect(() => resolveRoomFile('../etc/passwd')).toThrow()
    expect(() => resolveRoomFile('./foo')).toThrow()
    expect(() => resolveRoomFile('/abs')).toThrow()
    expect(() => resolveRoomFile('a/b')).toThrow()
  })

  test('isValidRoomName accepts/rejects per spec', () => {
    expect(isValidRoomName('default')).toBe(true)
    expect(isValidRoomName('a.b_c-1')).toBe(true)
    expect(isValidRoomName('a'.repeat(64))).toBe(true)
    expect(isValidRoomName('a'.repeat(65))).toBe(false)
    expect(isValidRoomName('')).toBe(false)
    expect(isValidRoomName('a b')).toBe(false)
    expect(isValidRoomName('../a')).toBe(false)
  })

  test('ensureBaseDir creates dir with mode 0o700', async () => {
    await ensureBaseDir()
    const s = await stat(base)
    expect(s.isDirectory()).toBe(true)
    expect(s.mode & 0o777).toBe(0o700)
  })

  test('ensureRoomFile creates file with mode 0o600 if missing', async () => {
    await ensureBaseDir()
    const p = await ensureRoomFile('default')
    const s = await stat(p)
    expect(s.isFile()).toBe(true)
    expect(s.mode & 0o777).toBe(0o600)
  })

  test('ensureRoomFile is idempotent', async () => {
    await ensureBaseDir()
    const p1 = await ensureRoomFile('default')
    await writeFile(p1, '{"existing":"line"}\n', { mode: 0o600 })
    const p2 = await ensureRoomFile('default')
    expect(p1).toBe(p2)
  })

  test('refuseSymlink throws if path is a symlink', async () => {
    await ensureBaseDir()
    const target = join(base, 'target.jsonl')
    const link = join(base, 'rooms', 'link.jsonl')
    await mkdir(join(base, 'rooms'), { recursive: true, mode: 0o700 })
    await writeFile(target, '')
    await symlink(target, link)
    await expect(refuseSymlink(link)).rejects.toThrow(/symlink/i)
  })

  test('refuseSymlink passes for regular files', async () => {
    await ensureBaseDir()
    const p = await ensureRoomFile('default')
    await expect(refuseSymlink(p)).resolves.toBeUndefined()
  })

  test('resolveSessionFile uses PPID', () => {
    const p = resolveSessionFile(12345)
    expect(p).toBe(join(base, 'sessions', '12345.id'))
  })

  test('resolveOffsetFile composes room+session', () => {
    const p = resolveOffsetFile('default', 'host-12345-abc')
    expect(p).toBe(join(base, 'state', 'default-host-12345-abc.offset'))
  })

  test('resolveBaseDir falls back to ~/.cc-bridge when env not set', () => {
    delete process.env.CC_BRIDGE_HOME
    const p = resolveBaseDir()
    expect(p).toMatch(/\.cc-bridge$/)
  })
})
```

- [ ] **Step 3.2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/paths.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3.3: Implement `src/lib/paths.ts`**

```ts
import { homedir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { lstat, mkdir, open } from 'node:fs/promises'
import { constants as fsc } from 'node:fs'

const ROOM_NAME_RE = /^[a-zA-Z0-9_.-]{1,64}$/

export function resolveBaseDir(): string {
  const fromEnv = process.env.CC_BRIDGE_HOME
  if (fromEnv && fromEnv.length > 0) return fromEnv
  return join(homedir(), '.cc-bridge')
}

export function isValidRoomName(room: string): boolean {
  return ROOM_NAME_RE.test(room)
}

export function resolveRoomFile(room: string): string {
  if (!isValidRoomName(room)) {
    throw new Error(
      `invalid room name (allowed: a-z, A-Z, 0-9, dot, underscore, hyphen, max 64): ${JSON.stringify(room)}`,
    )
  }
  const base = resolveBaseDir()
  const roomsDir = join(base, 'rooms')
  const resolved = resolve(roomsDir, `${room}.jsonl`)
  const expectedPrefix = resolve(roomsDir) + sep
  if (!(resolved + sep).startsWith(expectedPrefix) && resolved !== resolve(roomsDir, `${room}.jsonl`)) {
    throw new Error(`room path escapes rooms dir: ${resolved}`)
  }
  return resolved
}

export function resolveSessionFile(ppid: number): string {
  return join(resolveBaseDir(), 'sessions', `${ppid}.id`)
}

export function resolveOffsetFile(room: string, sessionId: string): string {
  if (!isValidRoomName(room)) {
    throw new Error(`invalid room name: ${room}`)
  }
  if (!/^[a-zA-Z0-9._-]+$/.test(sessionId)) {
    throw new Error(`invalid session id: ${sessionId}`)
  }
  return join(resolveBaseDir(), 'state', `${room}-${sessionId}.offset`)
}

export async function ensureBaseDir(): Promise<string> {
  const base = resolveBaseDir()
  await mkdir(base, { recursive: true, mode: 0o700 })
  await mkdir(join(base, 'rooms'), { recursive: true, mode: 0o700 })
  await mkdir(join(base, 'sessions'), { recursive: true, mode: 0o700 })
  await mkdir(join(base, 'state'), { recursive: true, mode: 0o700 })
  return base
}

export async function ensureRoomFile(room: string): Promise<string> {
  await ensureBaseDir()
  const p = resolveRoomFile(room)
  let exists = false
  try {
    await lstat(p)
    exists = true
  } catch {
    exists = false
  }
  if (!exists) {
    const fh = await open(p, fsc.O_CREAT | fsc.O_WRONLY | fsc.O_APPEND, 0o600)
    await fh.close()
  } else {
    await refuseSymlink(p)
  }
  return p
}

export async function refuseSymlink(p: string): Promise<void> {
  const s = await lstat(p)
  if (s.isSymbolicLink()) {
    throw new Error(`refusing to open symlink: ${p}`)
  }
}
```

- [ ] **Step 3.4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/paths.test.ts`
Expected: PASS — all 12 tests.

- [ ] **Step 3.5: Typecheck + lint**

Run: `npx tsc --noEmit && npx eslint . --quiet`
Expected: clean.

- [ ] **Step 3.6: Commit**

```bash
git add src/lib/paths.ts tests/unit/paths.test.ts
git commit -m "feat(paths): add filesystem path resolution + safety guards

Single chokepoint for all path resolution. Validates room names against
^[a-zA-Z0-9_.-]{1,64}$, asserts resolved paths stay under rooms dir,
creates ~/.cc-bridge tree with mode 0700, room files with mode 0600,
and refuses to open symlinks.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 4: Identity module (TDD)

**Files:**
- Create: `src/lib/identity.ts`
- Create: `tests/unit/identity.test.ts`

- [ ] **Step 4.1: Write failing tests**

Create `tests/unit/identity.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { readFile } from 'node:fs/promises'
import { dir as tmpDir } from 'tmp-promise'
import { getSessionId, resetSessionIdCache } from '../../src/lib/identity.js'

describe('identity', () => {
  let cleanup: () => Promise<void>

  beforeEach(async () => {
    const t = await tmpDir({ unsafeCleanup: true })
    process.env.CC_BRIDGE_HOME = t.path
    cleanup = async () => {
      await t.cleanup()
    }
    resetSessionIdCache()
  })

  afterEach(async () => {
    delete process.env.CC_BRIDGE_HOME
    delete process.env.CC_BRIDGE_FROM
    await cleanup()
  })

  test('env var CC_BRIDGE_FROM overrides everything', async () => {
    process.env.CC_BRIDGE_FROM = 'override-id'
    const id = await getSessionId()
    expect(id).toBe('override-id')
  })

  test('env var rejected if it contains invalid chars', async () => {
    process.env.CC_BRIDGE_FROM = 'bad id with spaces'
    await expect(getSessionId()).rejects.toThrow(/invalid/i)
  })

  test('auto id matches host-ppid-rand format', async () => {
    const id = await getSessionId()
    expect(id).toMatch(/^[a-zA-Z0-9.-]+-\d+-[a-z0-9]{8}$/)
  })

  test('auto id cached for same PPID', async () => {
    const id1 = await getSessionId()
    resetSessionIdCache()
    const id2 = await getSessionId()
    expect(id2).toBe(id1)
  })

  test('cached id is persisted to ~/.cc-bridge/sessions/<ppid>.id', async () => {
    const id = await getSessionId()
    const ppid = process.ppid
    const cached = await readFile(
      `${process.env.CC_BRIDGE_HOME}/sessions/${ppid}.id`,
      'utf8',
    )
    expect(cached.trim()).toBe(id)
  })
})
```

- [ ] **Step 4.2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/identity.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 4.3: Implement `src/lib/identity.ts`**

```ts
import { hostname } from 'node:os'
import { readFile, writeFile } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import { ensureBaseDir, resolveSessionFile } from './paths.js'

const SESSION_ID_RE = /^[a-zA-Z0-9._-]+$/

let cached: string | null = null

export function resetSessionIdCache(): void {
  cached = null
}

export async function getSessionId(): Promise<string> {
  const fromEnv = process.env.CC_BRIDGE_FROM
  if (fromEnv && fromEnv.length > 0) {
    if (!SESSION_ID_RE.test(fromEnv) || fromEnv.length > 64) {
      throw new Error(`invalid CC_BRIDGE_FROM (allowed: a-z, A-Z, 0-9, dot, underscore, hyphen, max 64): ${JSON.stringify(fromEnv)}`)
    }
    return fromEnv
  }
  if (cached) return cached

  await ensureBaseDir()
  const ppid = process.ppid
  const cachePath = resolveSessionFile(ppid)
  try {
    const existing = (await readFile(cachePath, 'utf8')).trim()
    if (SESSION_ID_RE.test(existing) && existing.length <= 64) {
      cached = existing
      return existing
    }
  } catch {
    // not cached yet
  }

  const host = hostname().toLowerCase().replace(/[^a-z0-9.-]/g, '').slice(0, 16) || 'host'
  const rand = randomBytes(4).toString('hex')
  const id = `${host}-${ppid}-${rand}`
  await writeFile(cachePath, `${id}\n`, { mode: 0o600 })
  cached = id
  return id
}
```

- [ ] **Step 4.4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/identity.test.ts`
Expected: PASS — all 5 tests.

- [ ] **Step 4.5: Typecheck + lint**

Run: `npx tsc --noEmit && npx eslint . --quiet`
Expected: clean.

- [ ] **Step 4.6: Commit**

```bash
git add src/lib/identity.ts tests/unit/identity.test.ts
git commit -m "feat(identity): auto-generate session id from host + ppid + rand

CC_BRIDGE_FROM env var overrides. Otherwise generates host-ppid-rand8
once and caches in ~/.cc-bridge/sessions/<ppid>.id for the life of the
parent shell.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 5: Send module (TDD)

**Files:**
- Create: `src/lib/send.ts`
- Create: `tests/unit/send.test.ts`

- [ ] **Step 5.1: Write failing tests**

Create `tests/unit/send.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { readFile, writeFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { dir as tmpDir } from 'tmp-promise'
import { sendMessage } from '../../src/lib/send.js'
import { parseMessage } from '../../src/lib/schema.js'

describe('send', () => {
  let base: string
  let cleanup: () => Promise<void>

  beforeEach(async () => {
    const t = await tmpDir({ unsafeCleanup: true })
    base = t.path
    cleanup = async () => {
      await t.cleanup()
    }
    process.env.CC_BRIDGE_HOME = base
  })

  afterEach(async () => {
    delete process.env.CC_BRIDGE_HOME
    await cleanup()
  })

  test('appends one valid JSONL line to room file', async () => {
    const result = await sendMessage({ from: 'me', room: 'default', msg: 'hello' })
    expect(result.id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/)
    const content = await readFile(join(base, 'rooms', 'default.jsonl'), 'utf8')
    const lines = content.split('\n').filter((l) => l.length > 0)
    expect(lines.length).toBe(1)
    const parsed = parseMessage(lines[0]!)
    expect(parsed.ok).toBe(true)
    if (parsed.ok) {
      expect(parsed.value.msg).toBe('hello')
      expect(parsed.value.from).toBe('me')
    }
  })

  test('empty msg rejected', async () => {
    await expect(sendMessage({ from: 'me', room: 'default', msg: '' })).rejects.toThrow()
  })

  test('oversize msg rejected', async () => {
    await expect(
      sendMessage({ from: 'me', room: 'default', msg: 'x'.repeat(64_001) }),
    ).rejects.toThrow()
  })

  test('invalid room name rejected', async () => {
    await expect(sendMessage({ from: 'me', room: '../etc', msg: 'hi' })).rejects.toThrow()
  })

  test('optional to/reply_to/kind included when provided', async () => {
    await sendMessage({
      from: 'me',
      room: 'default',
      msg: 'hi',
      to: 'you',
      kind: 'event',
    })
    const content = await readFile(join(base, 'rooms', 'default.jsonl'), 'utf8')
    const parsed = parseMessage(content.trim())
    expect(parsed.ok).toBe(true)
    if (parsed.ok) {
      expect(parsed.value.to).toBe('you')
      expect(parsed.value.kind).toBe('event')
    }
  })

  test('two parallel sends both land (race test)', async () => {
    const N = 20
    await Promise.all(
      Array.from({ length: N }, (_, i) =>
        sendMessage({ from: 'me', room: 'default', msg: `m${i}` }),
      ),
    )
    const content = await readFile(join(base, 'rooms', 'default.jsonl'), 'utf8')
    const lines = content.split('\n').filter((l) => l.length > 0)
    expect(lines.length).toBe(N)
    for (const line of lines) {
      const parsed = parseMessage(line)
      expect(parsed.ok).toBe(true)
    }
  })

  test('room file created with mode 0o600', async () => {
    await sendMessage({ from: 'me', room: 'default', msg: 'hi' })
    const s = await stat(join(base, 'rooms', 'default.jsonl'))
    expect(s.mode & 0o777).toBe(0o600)
  })

  test('warns at 10MB soft cap (stderr)', async () => {
    const big = 'x'.repeat(63_000)
    const p = join(base, 'rooms', 'default.jsonl')
    const stderrSpy: string[] = []
    const origWrite = process.stderr.write.bind(process.stderr)
    process.stderr.write = ((s: string | Uint8Array) => {
      stderrSpy.push(typeof s === 'string' ? s : Buffer.from(s).toString('utf8'))
      return true
    }) as typeof process.stderr.write
    try {
      await writeFile(p, 'x'.repeat(10_500_000), { mode: 0o600 })
      await sendMessage({ from: 'me', room: 'default', msg: big })
    } finally {
      process.stderr.write = origWrite
    }
    expect(stderrSpy.join('')).toMatch(/10MB|soft cap/i)
  })

  test('refuses send at 100MB hard cap', async () => {
    const p = join(base, 'rooms', 'default.jsonl')
    await writeFile(p, 'x'.repeat(100_000_001), { mode: 0o600 })
    await expect(
      sendMessage({ from: 'me', room: 'default', msg: 'hi' }),
    ).rejects.toThrow(/100MB|hard cap/i)
  })
})
```

- [ ] **Step 5.2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/send.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 5.3: Implement `src/lib/send.ts`**

```ts
import { appendFile, stat } from 'node:fs/promises'
import lockfile from 'proper-lockfile'
import { ensureRoomFile, refuseSymlink } from './paths.js'
import { buildMessage, serializeMessage, type BuildMessageInput, type Message } from './schema.js'

const SOFT_CAP_BYTES = 10 * 1024 * 1024
const HARD_CAP_BYTES = 100 * 1024 * 1024

export async function sendMessage(input: BuildMessageInput): Promise<Message> {
  const message = buildMessage(input)
  const path = await ensureRoomFile(input.room)
  await refuseSymlink(path)

  const s = await stat(path)
  if (s.size >= HARD_CAP_BYTES) {
    throw new Error(
      `cc-bridge: room file exceeds 100MB hard cap. Run \`cc-bridge rooms clear ${input.room}\` to reset.`,
    )
  }
  if (s.size >= SOFT_CAP_BYTES) {
    process.stderr.write(
      `cc-bridge: warn — room file exceeds 10MB soft cap (${Math.floor(s.size / 1_048_576)}MB). Consider \`cc-bridge rooms clear ${input.room}\`.\n`,
    )
  }

  const release = await lockfile.lock(path, {
    retries: { retries: 5, minTimeout: 50, maxTimeout: 200 },
    stale: 10_000,
  })
  try {
    await appendFile(path, `${serializeMessage(message)}\n`, { mode: 0o600 })
  } finally {
    await release()
  }
  return message
}
```

- [ ] **Step 5.4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/send.test.ts`
Expected: PASS — all 9 tests.

- [ ] **Step 5.5: Typecheck + lint**

Run: `npx tsc --noEmit && npx eslint . --quiet`
Expected: clean.

- [ ] **Step 5.6: Commit**

```bash
git add src/lib/send.ts tests/unit/send.test.ts
git commit -m "feat(send): atomic JSONL append with lockfile + size caps

proper-lockfile guards multi-line writes. 10MB stderr warn, 100MB hard
refuse. Room file mode 0600. Race-safe across N writers (tested).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 6: Listen module (TDD)

**Files:**
- Create: `src/lib/listen.ts`
- Create: `tests/unit/listen.test.ts`

- [ ] **Step 6.1: Write failing tests**

Create `tests/unit/listen.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { appendFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { dir as tmpDir } from 'tmp-promise'
import { listen, replayLastN } from '../../src/lib/listen.js'
import { sendMessage } from '../../src/lib/send.js'

describe('listen', () => {
  let base: string
  let cleanup: () => Promise<void>

  beforeEach(async () => {
    const t = await tmpDir({ unsafeCleanup: true })
    base = t.path
    cleanup = async () => {
      await t.cleanup()
    }
    process.env.CC_BRIDGE_HOME = base
  })

  afterEach(async () => {
    delete process.env.CC_BRIDGE_HOME
    await cleanup()
  })

  async function collect(
    iter: AsyncIterable<{ ok: true; line: string } | { ok: false; reason: string; raw: string }>,
    count: number,
    timeoutMs = 2000,
  ) {
    const out: Array<{ ok: true; line: string } | { ok: false; reason: string; raw: string }> = []
    const start = Date.now()
    for await (const ev of iter) {
      out.push(ev)
      if (out.length >= count) return out
      if (Date.now() - start > timeoutMs) return out
    }
    return out
  }

  test('emits new lines after subscribe', async () => {
    const ctrl = listen({ room: 'default', sessionId: 's1' })
    const collected = collect(ctrl.iterator, 3)
    await new Promise((r) => setTimeout(r, 100))
    await sendMessage({ from: 'me', room: 'default', msg: 'a' })
    await sendMessage({ from: 'me', room: 'default', msg: 'b' })
    await sendMessage({ from: 'me', room: 'default', msg: 'c' })
    const result = await collected
    await ctrl.close()
    expect(result.length).toBeGreaterThanOrEqual(3)
    const msgs = result.filter((r) => r.ok).map((r) => JSON.parse((r as { line: string }).line).msg)
    expect(msgs.slice(0, 3)).toEqual(['a', 'b', 'c'])
  })

  test('replayLastN returns last N lines', async () => {
    await sendMessage({ from: 'me', room: 'default', msg: '1' })
    await sendMessage({ from: 'me', room: 'default', msg: '2' })
    await sendMessage({ from: 'me', room: 'default', msg: '3' })
    const lines = await replayLastN('default', 2)
    expect(lines.length).toBe(2)
    expect(JSON.parse(lines[0]!).msg).toBe('2')
    expect(JSON.parse(lines[1]!).msg).toBe('3')
  })

  test('malformed line skipped with stderr warn', async () => {
    const p = join(base, 'rooms', 'default.jsonl')
    await writeFile(p, '', { mode: 0o600 })
    const ctrl = listen({ room: 'default', sessionId: 's1' })
    const collected = collect(ctrl.iterator, 2)
    await new Promise((r) => setTimeout(r, 100))
    await appendFile(p, 'not-json\n')
    await sendMessage({ from: 'me', room: 'default', msg: 'ok' })
    const result = await collected
    await ctrl.close()
    const errs = result.filter((r) => !r.ok)
    expect(errs.length).toBeGreaterThanOrEqual(1)
    const oks = result.filter((r) => r.ok)
    expect(oks.length).toBeGreaterThanOrEqual(1)
  })

  test('128KB line cap enforced', async () => {
    const p = join(base, 'rooms', 'default.jsonl')
    await writeFile(p, '', { mode: 0o600 })
    const ctrl = listen({ room: 'default', sessionId: 's1' })
    const collected = collect(ctrl.iterator, 1)
    await new Promise((r) => setTimeout(r, 100))
    await appendFile(p, 'x'.repeat(150_000) + '\n')
    await sendMessage({ from: 'me', room: 'default', msg: 'after' })
    const result = await collected
    await ctrl.close()
    expect(result.some((r) => !r.ok && (r as { reason: string }).reason === 'oversize')).toBe(true)
  })

  test('truncation resets offset, continues', async () => {
    await sendMessage({ from: 'me', room: 'default', msg: '1' })
    const ctrl = listen({ room: 'default', sessionId: 's1', replayLastN: 0 })
    const collected = collect(ctrl.iterator, 1)
    await new Promise((r) => setTimeout(r, 200))
    const p = join(base, 'rooms', 'default.jsonl')
    await writeFile(p, '', { mode: 0o600 })
    await sendMessage({ from: 'me', room: 'default', msg: 'after-trunc' })
    const result = await collected
    await ctrl.close()
    const msgs = result.filter((r) => r.ok).map((r) => JSON.parse((r as { line: string }).line).msg)
    expect(msgs).toContain('after-trunc')
  })

  test('unknown schema version emits unknown_version reason', async () => {
    const p = join(base, 'rooms', 'default.jsonl')
    await writeFile(p, '', { mode: 0o600 })
    const ctrl = listen({ room: 'default', sessionId: 's1' })
    const collected = collect(ctrl.iterator, 1)
    await new Promise((r) => setTimeout(r, 100))
    await appendFile(
      p,
      JSON.stringify({
        v: 99,
        id: '01HZZZZZZZZZZZZZZZZZZZZZZZ',
        ts: '2026-06-02T12:00:00.000Z',
        room: 'default',
        from: 'me',
        msg: 'hi',
      }) + '\n',
    )
    const result = await collected
    await ctrl.close()
    expect(
      result.some((r) => !r.ok && (r as { reason: string }).reason === 'unknown_version'),
    ).toBe(true)
  })

  test('replay 0 means no replay', async () => {
    await sendMessage({ from: 'me', room: 'default', msg: 'before' })
    const ctrl = listen({ room: 'default', sessionId: 's1', replayLastN: 0 })
    const collected = collect(ctrl.iterator, 1, 500)
    await new Promise((r) => setTimeout(r, 200))
    await sendMessage({ from: 'me', room: 'default', msg: 'after' })
    const result = await collected
    await ctrl.close()
    const msgs = result.filter((r) => r.ok).map((r) => JSON.parse((r as { line: string }).line).msg)
    expect(msgs).not.toContain('before')
    expect(msgs).toContain('after')
  })
})
```

- [ ] **Step 6.2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/listen.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 6.3: Implement `src/lib/listen.ts`**

```ts
import { open, readFile, stat, writeFile } from 'node:fs/promises'
import chokidar, { type FSWatcher } from 'chokidar'
import { ensureRoomFile, refuseSymlink, resolveOffsetFile } from './paths.js'
import { parseMessage } from './schema.js'

const MAX_LINE_BYTES = 128 * 1024

export type ListenEvent =
  | { ok: true; line: string }
  | { ok: false; reason: 'malformed' | 'unknown_version' | 'invalid' | 'oversize'; raw: string }

export interface ListenOptions {
  room: string
  sessionId: string
  replayLastN?: number
}

export interface ListenController {
  iterator: AsyncIterable<ListenEvent>
  close: () => Promise<void>
}

export function listen(opts: ListenOptions): ListenController {
  const replay = opts.replayLastN ?? 0
  const queue: ListenEvent[] = []
  const waiters: Array<(v: IteratorResult<ListenEvent>) => void> = []
  let closed = false
  let watcher: FSWatcher | null = null
  let offset = 0
  let buffer = ''

  function emit(ev: ListenEvent) {
    if (closed) return
    const w = waiters.shift()
    if (w) w({ value: ev, done: false })
    else queue.push(ev)
  }

  async function init() {
    const path = await ensureRoomFile(opts.room)
    await refuseSymlink(path)

    if (replay > 0) {
      const lines = await replayLastN(opts.room, replay)
      for (const line of lines) {
        processLine(line, emit)
      }
    }

    const s = await stat(path)
    offset = s.size

    watcher = chokidar.watch(path, { usePolling: false, ignoreInitial: true })
    watcher.on('change', async () => {
      try {
        await refuseSymlink(path)
        const cur = await stat(path)
        if (cur.size < offset) {
          offset = 0
          buffer = ''
        }
        if (cur.size === offset) return
        const fh = await open(path, 'r')
        try {
          const len = cur.size - offset
          const buf = Buffer.alloc(len)
          await fh.read(buf, 0, len, offset)
          offset = cur.size
          buffer += buf.toString('utf8')
          let newlineIdx: number
          while ((newlineIdx = buffer.indexOf('\n')) !== -1) {
            const line = buffer.slice(0, newlineIdx)
            buffer = buffer.slice(newlineIdx + 1)
            if (Buffer.byteLength(line, 'utf8') > MAX_LINE_BYTES) {
              emit({ ok: false, reason: 'oversize', raw: `${line.slice(0, 200)}...[truncated ${line.length} bytes]` })
            } else if (line.length > 0) {
              processLine(line, emit)
            }
          }
          if (Buffer.byteLength(buffer, 'utf8') > MAX_LINE_BYTES) {
            emit({ ok: false, reason: 'oversize', raw: `${buffer.slice(0, 200)}...[truncated]` })
            buffer = ''
          }
        } finally {
          await fh.close()
        }
        try {
          await writeFile(resolveOffsetFile(opts.room, opts.sessionId), String(offset), { mode: 0o600 })
        } catch {
          // best effort
        }
      } catch (e) {
        process.stderr.write(`cc-bridge: listen error: ${(e as Error).message}\n`)
      }
    })
  }

  const initPromise = init()

  const iterator: AsyncIterable<ListenEvent> = {
    [Symbol.asyncIterator]() {
      return {
        async next() {
          await initPromise
          if (queue.length > 0) return { value: queue.shift()!, done: false }
          if (closed) return { value: undefined, done: true }
          return new Promise<IteratorResult<ListenEvent>>((resolve) => {
            waiters.push(resolve)
          })
        },
        async return() {
          closed = true
          for (const w of waiters.splice(0)) w({ value: undefined, done: true })
          if (watcher) await watcher.close()
          return { value: undefined, done: true }
        },
      }
    },
  }

  async function close() {
    closed = true
    for (const w of waiters.splice(0)) w({ value: undefined, done: true })
    if (watcher) await watcher.close()
  }

  return { iterator, close }
}

function processLine(line: string, emit: (ev: ListenEvent) => void) {
  const parsed = parseMessage(line)
  if (parsed.ok) {
    emit({ ok: true, line })
  } else {
    emit({ ok: false, reason: parsed.reason, raw: line })
  }
}

export async function replayLastN(room: string, n: number): Promise<string[]> {
  if (n <= 0) return []
  const path = await ensureRoomFile(room)
  await refuseSymlink(path)
  const content = await readFile(path, 'utf8')
  const lines = content.split('\n').filter((l) => l.length > 0)
  return lines.slice(-n)
}
```

- [ ] **Step 6.4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/listen.test.ts`
Expected: PASS — all 7 tests.

- [ ] **Step 6.5: Typecheck + lint**

Run: `npx tsc --noEmit && npx eslint . --quiet`
Expected: clean.

- [ ] **Step 6.6: Commit**

```bash
git add src/lib/listen.ts tests/unit/listen.test.ts
git commit -m "feat(listen): async-iterator tail with chokidar + replay + safety caps

Watches a room file via chokidar, emits ListenEvent per line.
128KB per-line cap, truncation detection (offset reset), saves resume
offset to ~/.cc-bridge/state/. Unknown schema versions surface as
distinct event reason for upgrade prompts.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 7: Rooms module (TDD)

**Files:**
- Create: `src/lib/rooms.ts`
- Create: `tests/unit/rooms.test.ts`

- [ ] **Step 7.1: Write failing tests**

Create `tests/unit/rooms.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { writeFile, readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { dir as tmpDir } from 'tmp-promise'
import { listRooms, clearRoom, reapStaleSessions } from '../../src/lib/rooms.js'
import { ensureBaseDir } from '../../src/lib/paths.js'
import { sendMessage } from '../../src/lib/send.js'

describe('rooms', () => {
  let base: string
  let cleanup: () => Promise<void>

  beforeEach(async () => {
    const t = await tmpDir({ unsafeCleanup: true })
    base = t.path
    cleanup = async () => {
      await t.cleanup()
    }
    process.env.CC_BRIDGE_HOME = base
  })

  afterEach(async () => {
    delete process.env.CC_BRIDGE_HOME
    await cleanup()
  })

  test('listRooms returns empty when no rooms', async () => {
    await ensureBaseDir()
    const rooms = await listRooms()
    expect(rooms).toEqual([])
  })

  test('listRooms returns rooms with name, size, mtime', async () => {
    await sendMessage({ from: 'me', room: 'planning', msg: 'a' })
    await sendMessage({ from: 'me', room: 'review', msg: 'b' })
    const rooms = await listRooms()
    const names = rooms.map((r) => r.name).sort()
    expect(names).toEqual(['planning', 'review'])
    for (const r of rooms) {
      expect(r.sizeBytes).toBeGreaterThan(0)
      expect(r.mtime).toBeInstanceOf(Date)
    }
  })

  test('clearRoom truncates file', async () => {
    await sendMessage({ from: 'me', room: 'planning', msg: 'a' })
    const path = join(base, 'rooms', 'planning.jsonl')
    let content = await readFile(path, 'utf8')
    expect(content.length).toBeGreaterThan(0)
    await clearRoom('planning')
    content = await readFile(path, 'utf8')
    expect(content).toBe('')
  })

  test('clearRoom on missing room throws', async () => {
    await expect(clearRoom('does-not-exist')).rejects.toThrow()
  })

  test('reapStaleSessions removes session files whose PPID is gone', async () => {
    await ensureBaseDir()
    const sessDir = join(base, 'sessions')
    // PID 0 is never a valid user-process PPID on any platform → reap
    await writeFile(join(sessDir, '0.id'), 'stale-id\n', { mode: 0o600 })
    // Current process PID is alive → keep
    await writeFile(join(sessDir, `${process.pid}.id`), 'live-id\n', { mode: 0o600 })
    await reapStaleSessions()
    const remaining = await readdir(sessDir)
    expect(remaining).toContain(`${process.pid}.id`)
    expect(remaining).not.toContain('0.id')
  })
})
```

- [ ] **Step 7.2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/rooms.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 7.3: Implement `src/lib/rooms.ts`**

```ts
import { readdir, stat, truncate, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { ensureBaseDir, resolveBaseDir, resolveRoomFile } from './paths.js'

export interface RoomInfo {
  name: string
  sizeBytes: number
  mtime: Date
}

export async function listRooms(): Promise<RoomInfo[]> {
  await ensureBaseDir()
  const roomsDir = join(resolveBaseDir(), 'rooms')
  let entries: string[]
  try {
    entries = await readdir(roomsDir)
  } catch {
    return []
  }
  const out: RoomInfo[] = []
  for (const entry of entries) {
    if (!entry.endsWith('.jsonl')) continue
    const name = entry.slice(0, -'.jsonl'.length)
    const path = join(roomsDir, entry)
    try {
      const s = await stat(path)
      if (!s.isFile()) continue
      out.push({ name, sizeBytes: s.size, mtime: s.mtime })
    } catch {
      // skip unreadable
    }
  }
  return out
}

export async function clearRoom(room: string): Promise<void> {
  const path = resolveRoomFile(room)
  // throws ENOENT if missing
  await stat(path)
  await truncate(path, 0)
}

export async function reapStaleSessions(): Promise<number> {
  await ensureBaseDir()
  const sessDir = join(resolveBaseDir(), 'sessions')
  let entries: string[]
  try {
    entries = await readdir(sessDir)
  } catch {
    return 0
  }
  let reaped = 0
  for (const entry of entries) {
    const m = entry.match(/^(\d+)\.id$/)
    if (!m || !m[1]) continue
    const ppid = Number(m[1])
    if (!Number.isFinite(ppid) || ppid <= 0) {
      try {
        await unlink(join(sessDir, entry))
        reaped += 1
      } catch {
        // ignore
      }
      continue
    }
    let alive = false
    try {
      process.kill(ppid, 0)
      alive = true
    } catch (e) {
      // EPERM means process exists but we can't signal — still alive
      if ((e as NodeJS.ErrnoException).code === 'EPERM') alive = true
    }
    if (!alive) {
      try {
        await unlink(join(sessDir, entry))
        reaped += 1
      } catch {
        // ignore
      }
    }
  }
  return reaped
}
```

- [ ] **Step 7.4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/rooms.test.ts`
Expected: PASS — all 5 tests.

- [ ] **Step 7.5: Typecheck + lint**

Run: `npx tsc --noEmit && npx eslint . --quiet`
Expected: clean.

- [ ] **Step 7.6: Commit**

```bash
git add src/lib/rooms.ts tests/unit/rooms.test.ts
git commit -m "feat(rooms): list/clear rooms + reap stale session files

listRooms returns name, size, mtime per .jsonl in rooms dir.
clearRoom truncates. reapStaleSessions deletes session-id cache files
whose PPID is no longer alive (kill -0 probe).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 8: Validate module (TDD)

**Files:**
- Create: `src/lib/validate.ts`
- Create: `tests/unit/validate.test.ts`

- [ ] **Step 8.1: Write failing tests**

Create `tests/unit/validate.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { dir as tmpDir } from 'tmp-promise'
import { validateFile } from '../../src/lib/validate.js'

describe('validate', () => {
  let dirPath: string
  let cleanup: () => Promise<void>

  beforeEach(async () => {
    const t = await tmpDir({ unsafeCleanup: true })
    dirPath = t.path
    cleanup = async () => {
      await t.cleanup()
    }
  })

  afterEach(async () => {
    await cleanup()
  })

  test('returns ok=true with zero errors for valid file', async () => {
    const path = join(dirPath, 'good.jsonl')
    const line = JSON.stringify({
      v: 1,
      id: '01HZZZZZZZZZZZZZZZZZZZZZZZ',
      ts: '2026-06-02T12:00:00.000Z',
      room: 'default',
      from: 'me',
      msg: 'hi',
    })
    await writeFile(path, `${line}\n${line}\n`)
    const result = await validateFile(path)
    expect(result.ok).toBe(true)
    expect(result.errors.length).toBe(0)
    expect(result.validLines).toBe(2)
  })

  test('returns ok=false with per-line errors', async () => {
    const path = join(dirPath, 'bad.jsonl')
    const good = JSON.stringify({
      v: 1,
      id: '01HZZZZZZZZZZZZZZZZZZZZZZZ',
      ts: '2026-06-02T12:00:00.000Z',
      room: 'default',
      from: 'me',
      msg: 'hi',
    })
    await writeFile(path, `${good}\nnot-json\n{"v":1}\n`)
    const result = await validateFile(path)
    expect(result.ok).toBe(false)
    expect(result.errors.length).toBe(2)
    expect(result.errors[0]!.lineNumber).toBe(2)
    expect(result.errors[1]!.lineNumber).toBe(3)
    expect(result.validLines).toBe(1)
  })

  test('skips blank lines without error', async () => {
    const path = join(dirPath, 'blanks.jsonl')
    const good = JSON.stringify({
      v: 1,
      id: '01HZZZZZZZZZZZZZZZZZZZZZZZ',
      ts: '2026-06-02T12:00:00.000Z',
      room: 'default',
      from: 'me',
      msg: 'hi',
    })
    await writeFile(path, `${good}\n\n${good}\n`)
    const result = await validateFile(path)
    expect(result.ok).toBe(true)
    expect(result.validLines).toBe(2)
  })

  test('missing file throws', async () => {
    await expect(validateFile(join(dirPath, 'nope.jsonl'))).rejects.toThrow()
  })
})
```

- [ ] **Step 8.2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/validate.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 8.3: Implement `src/lib/validate.ts`**

```ts
import { readFile } from 'node:fs/promises'
import { parseMessage } from './schema.js'

export interface ValidationError {
  lineNumber: number
  reason: string
  detail: string
}

export interface ValidationResult {
  ok: boolean
  validLines: number
  errors: ValidationError[]
}

export async function validateFile(path: string): Promise<ValidationResult> {
  const content = await readFile(path, 'utf8')
  const lines = content.split('\n')
  const errors: ValidationError[] = []
  let valid = 0
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]!
    if (line.length === 0) continue
    const parsed = parseMessage(line)
    if (parsed.ok) {
      valid += 1
    } else {
      errors.push({ lineNumber: i + 1, reason: parsed.reason, detail: parsed.error })
    }
  }
  return { ok: errors.length === 0, validLines: valid, errors }
}
```

- [ ] **Step 8.4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/validate.test.ts`
Expected: PASS — all 4 tests.

- [ ] **Step 8.5: Typecheck + lint**

Run: `npx tsc --noEmit && npx eslint . --quiet`
Expected: clean.

- [ ] **Step 8.6: Commit**

```bash
git add src/lib/validate.ts tests/unit/validate.test.ts
git commit -m "feat(validate): lint a JSONL room file against schema

Per-line errors with line number + reason. Skips blank lines. Returns
structured result for CLI to render.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 9: Public library entry (`index.ts`)

**Files:**
- Create: `src/lib/index.ts`

- [ ] **Step 9.1: Write `src/lib/index.ts`**

```ts
export {
  Message,
  MessageSchema,
  SCHEMA_VERSION,
  buildMessage,
  parseMessage,
  serializeMessage,
  type BuildMessageInput,
  type ParseResult,
} from './schema.js'

export { sendMessage } from './send.js'

export {
  listen,
  replayLastN,
  type ListenEvent,
  type ListenOptions,
  type ListenController,
} from './listen.js'

export {
  listRooms,
  clearRoom,
  reapStaleSessions,
  type RoomInfo,
} from './rooms.js'

export { validateFile, type ValidationError, type ValidationResult } from './validate.js'

export { getSessionId, resetSessionIdCache } from './identity.js'

export {
  resolveBaseDir,
  resolveRoomFile,
  ensureBaseDir,
  ensureRoomFile,
  isValidRoomName,
} from './paths.js'
```

- [ ] **Step 9.2: Typecheck + lint**

Run: `npx tsc --noEmit && npx eslint . --quiet`
Expected: clean.

- [ ] **Step 9.3: Commit**

```bash
git add src/lib/index.ts
git commit -m "feat(lib): public re-exports for library consumers

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 10: CLI binary (`bin/cc-bridge.ts`) + integration tests

**Files:**
- Create: `src/bin/cc-bridge.ts`
- Create: `tests/integration/cli.test.ts`

- [ ] **Step 10.1: Implement `src/bin/cc-bridge.ts`**

```ts
#!/usr/bin/env node
import { Command } from 'commander'
import ansiRegex from 'ansi-regex'
import { createInterface } from 'node:readline'
import {
  sendMessage,
  listen,
  replayLastN,
  listRooms,
  clearRoom,
  reapStaleSessions,
  validateFile,
  getSessionId,
  parseMessage,
} from '../lib/index.js'

const program = new Command()
const VERSION = '0.1.0'

program
  .name('cc-bridge')
  .description('Live JSONL message bridge between local Claude Code sessions')
  .version(VERSION)

program
  .command('listen')
  .description('Tail a room file and stream new messages as JSONL to stdout')
  .argument('[room]', 'room name', 'default')
  .option('--replay <n>', 'print last N messages before tailing', (v) => parseInt(v, 10), 0)
  .option('--pretty', 'human-readable output (strips ANSI from msg)')
  .option('--filter <expr>', 'filter expression, e.g. from=B or to=me')
  .option('--from <id>', 'override session id (else CC_BRIDGE_FROM or auto)')
  .option('--json-errors', 'emit warnings as JSON to stderr')
  .action(async (room: string, opts: { replay: number; pretty?: boolean; filter?: string; from?: string; jsonErrors?: boolean }) => {
    try {
      const sessionId = opts.from ?? (await getSessionId())
      const filter = parseFilter(opts.filter)
      const ctrl = listen({ room, sessionId, replayLastN: opts.replay })
      const sigint = () => {
        ctrl.close().finally(() => process.exit(0))
      }
      process.once('SIGINT', sigint)
      process.once('SIGTERM', sigint)
      process.stdout.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EPIPE') process.exit(0)
      })
      for await (const ev of ctrl.iterator) {
        if (ev.ok) {
          const parsed = parseMessage(ev.line)
          if (!parsed.ok) continue
          if (filter && !applyFilter(parsed.value, filter)) continue
          if (opts.pretty) {
            const stripped = stripAnsi(parsed.value.msg)
            process.stdout.write(`[${parsed.value.ts}] ${parsed.value.from}${parsed.value.to ? ` → ${parsed.value.to}` : ''}: ${stripped}\n`)
          } else {
            process.stdout.write(`${ev.line}\n`)
          }
        } else {
          if (opts.jsonErrors) {
            process.stderr.write(`${JSON.stringify({ level: 'warn', reason: ev.reason, raw: ev.raw.slice(0, 200) })}\n`)
          } else {
            process.stderr.write(`cc-bridge: warn — ${ev.reason}: ${ev.raw.slice(0, 200)}\n`)
          }
        }
      }
    } catch (e) {
      process.stderr.write(`cc-bridge: ${(e as Error).message}\n`)
      process.exit(2)
    }
  })

program
  .command('send')
  .description('Send a message to a room (msg from arg or stdin)')
  .argument('[msg]', 'message text (or pipe via stdin)')
  .option('--room <room>', 'room name', 'default')
  .option('--from <id>', 'override session id')
  .option('--to <id>', 'direct-message target')
  .option('--reply-to <ulid>', 'message id this replies to')
  .option('--kind <kind>', 'message kind: text | event', 'text')
  .action(async (msgArg: string | undefined, opts: { room: string; from?: string; to?: string; replyTo?: string; kind: string }) => {
    try {
      let msg = msgArg
      if (msg === undefined) {
        if (process.stdin.isTTY) {
          process.stderr.write('cc-bridge: no message provided (pass as arg or pipe via stdin)\n')
          process.exit(1)
        }
        msg = await readStdin()
      }
      if (!msg || msg.length === 0) {
        process.stderr.write('cc-bridge: empty message\n')
        process.exit(1)
      }
      if (opts.kind !== 'text' && opts.kind !== 'event') {
        process.stderr.write(`cc-bridge: invalid --kind (allowed: text, event): ${opts.kind}\n`)
        process.exit(1)
      }
      const from = opts.from ?? (await getSessionId())
      const built = await sendMessage({
        from,
        room: opts.room,
        msg,
        ...(opts.to !== undefined ? { to: opts.to } : {}),
        ...(opts.replyTo !== undefined ? { reply_to: opts.replyTo } : {}),
        kind: opts.kind as 'text' | 'event',
      })
      process.stdout.write(`${built.id}\n`)
    } catch (e) {
      const msg = (e as Error).message
      const code = /invalid|empty|exceeds|hard cap/i.test(msg) ? 1 : 2
      process.stderr.write(`cc-bridge: ${msg}\n`)
      process.exit(code)
    }
  })

const roomsCmd = program.command('rooms').description('Room management')

roomsCmd
  .command('list', { isDefault: true })
  .description('List rooms with size and last-activity mtime')
  .action(async () => {
    try {
      await reapStaleSessions().catch(() => undefined)
      const rooms = await listRooms()
      if (rooms.length === 0) {
        process.stdout.write('(no rooms)\n')
        return
      }
      const rows = rooms.map((r) => ({
        name: r.name,
        size: formatBytes(r.sizeBytes),
        mtime: r.mtime.toISOString(),
      }))
      const nameW = Math.max(4, ...rows.map((r) => r.name.length))
      const sizeW = Math.max(4, ...rows.map((r) => r.size.length))
      process.stdout.write(
        `${'NAME'.padEnd(nameW)}  ${'SIZE'.padStart(sizeW)}  MTIME\n`,
      )
      for (const r of rows) {
        process.stdout.write(`${r.name.padEnd(nameW)}  ${r.size.padStart(sizeW)}  ${r.mtime}\n`)
      }
    } catch (e) {
      process.stderr.write(`cc-bridge: ${(e as Error).message}\n`)
      process.exit(2)
    }
  })

roomsCmd
  .command('clear <room>')
  .description('Truncate a room file (requires --yes to skip confirm)')
  .option('--yes', 'skip confirmation')
  .action(async (room: string, opts: { yes?: boolean }) => {
    try {
      if (!opts.yes && process.stdin.isTTY) {
        process.stderr.write(`cc-bridge: pass --yes to confirm clearing room "${room}"\n`)
        process.exit(1)
      }
      await clearRoom(room)
      process.stdout.write(`cleared: ${room}\n`)
    } catch (e) {
      process.stderr.write(`cc-bridge: ${(e as Error).message}\n`)
      process.exit(2)
    }
  })

program
  .command('validate <file>')
  .description('Lint a JSONL file against the schema')
  .action(async (file: string) => {
    try {
      const result = await validateFile(file)
      if (result.ok) {
        process.stdout.write(`OK: ${result.validLines} valid lines\n`)
        return
      }
      process.stdout.write(`${result.validLines} valid, ${result.errors.length} errors:\n`)
      for (const err of result.errors) {
        process.stdout.write(`  line ${err.lineNumber}: ${err.reason} — ${err.detail.slice(0, 200)}\n`)
      }
      process.exit(1)
    } catch (e) {
      process.stderr.write(`cc-bridge: ${(e as Error).message}\n`)
      process.exit(2)
    }
  })

await program.parseAsync(process.argv)

function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    let data = ''
    const rl = createInterface({ input: process.stdin })
    rl.on('line', (line) => {
      data += data.length === 0 ? line : `\n${line}`
    })
    rl.on('close', () => resolve(data))
  })
}

function parseFilter(expr: string | undefined): { key: 'from' | 'to'; value: string } | null {
  if (!expr) return null
  const m = expr.match(/^(from|to)=(.+)$/)
  if (!m || !m[1] || !m[2]) {
    process.stderr.write(`cc-bridge: invalid --filter (expected from=ID or to=ID): ${expr}\n`)
    process.exit(1)
  }
  return { key: m[1] as 'from' | 'to', value: m[2] }
}

function applyFilter(msg: { from: string; to?: string }, f: { key: 'from' | 'to'; value: string }): boolean {
  if (f.key === 'from') return msg.from === f.value
  return msg.to === f.value
}

function stripAnsi(s: string): string {
  return s.replace(ansiRegex(), '')
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n}B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}K`
  return `${(n / (1024 * 1024)).toFixed(1)}M`
}
```

- [ ] **Step 10.2: Build so the binary is invokable**

Run: `npx tsup`
Expected: `dist/bin/cc-bridge.js` + `dist/lib/index.js` produced.

- [ ] **Step 10.3: Write integration tests**

Create `tests/integration/cli.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { execa } from 'execa'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { dir as tmpDir } from 'tmp-promise'

const CLI = ['node', './dist/bin/cc-bridge.js']

function runCli(args: string[], env: NodeJS.ProcessEnv) {
  return execa(CLI[0]!, [CLI[1]!, ...args], { env: { ...process.env, ...env }, reject: false })
}

describe('cli integration', () => {
  let base: string
  let cleanup: () => Promise<void>

  beforeEach(async () => {
    const t = await tmpDir({ unsafeCleanup: true })
    base = t.path
    cleanup = async () => {
      await t.cleanup()
    }
    await mkdir(join(base, 'rooms'), { recursive: true, mode: 0o700 })
  })

  afterEach(async () => {
    await cleanup()
  })

  test('--version prints version', async () => {
    const r = await runCli(['--version'], { CC_BRIDGE_HOME: base, CC_BRIDGE_FROM: 'tester' })
    expect(r.exitCode).toBe(0)
    expect(r.stdout).toMatch(/0\.1\.0/)
  })

  test('send + validate round-trip', async () => {
    const send = await runCli(['send', '--room', 'default', 'hello world'], {
      CC_BRIDGE_HOME: base,
      CC_BRIDGE_FROM: 'tester',
    })
    expect(send.exitCode).toBe(0)
    const validate = await runCli(['validate', join(base, 'rooms', 'default.jsonl')], {
      CC_BRIDGE_HOME: base,
    })
    expect(validate.exitCode).toBe(0)
    expect(validate.stdout).toMatch(/OK:/)
  })

  test('send empty msg exits 1', async () => {
    const r = await runCli(['send', '--room', 'default', ''], {
      CC_BRIDGE_HOME: base,
      CC_BRIDGE_FROM: 'tester',
    })
    expect(r.exitCode).toBe(1)
  })

  test('send rejects bad room', async () => {
    const r = await runCli(['send', '--room', '../etc', 'hi'], {
      CC_BRIDGE_HOME: base,
      CC_BRIDGE_FROM: 'tester',
    })
    expect(r.exitCode).toBe(1)
  })

  test('rooms list shows recently-written room', async () => {
    await runCli(['send', '--room', 'planning', 'a'], {
      CC_BRIDGE_HOME: base,
      CC_BRIDGE_FROM: 'tester',
    })
    const r = await runCli(['rooms'], { CC_BRIDGE_HOME: base })
    expect(r.exitCode).toBe(0)
    expect(r.stdout).toMatch(/planning/)
  })

  test('rooms clear --yes truncates', async () => {
    await runCli(['send', '--room', 'planning', 'a'], {
      CC_BRIDGE_HOME: base,
      CC_BRIDGE_FROM: 'tester',
    })
    const r = await runCli(['rooms', 'clear', 'planning', '--yes'], {
      CC_BRIDGE_HOME: base,
    })
    expect(r.exitCode).toBe(0)
    expect(r.stdout).toMatch(/cleared: planning/)
  })

  test('validate flags bad file', async () => {
    const p = join(base, 'rooms', 'bad.jsonl')
    await writeFile(p, 'not-json\n')
    const r = await runCli(['validate', p], { CC_BRIDGE_HOME: base })
    expect(r.exitCode).toBe(1)
    expect(r.stdout).toMatch(/errors/)
  })

  test('listen with --replay prints prior messages and exits on SIGTERM', async () => {
    await runCli(['send', '--room', 'default', 'before'], {
      CC_BRIDGE_HOME: base,
      CC_BRIDGE_FROM: 'tester',
    })
    const child = execa(CLI[0]!, [CLI[1]!, 'listen', 'default', '--replay', '1'], {
      env: { ...process.env, CC_BRIDGE_HOME: base, CC_BRIDGE_FROM: 'tester' },
      reject: false,
    })
    await new Promise((r) => setTimeout(r, 500))
    child.kill('SIGTERM')
    const r = await child
    expect(r.stdout).toMatch(/"msg":"before"/)
  })
})
```

- [ ] **Step 10.4: Run integration tests**

Run: `npx vitest run tests/integration/cli.test.ts`
Expected: PASS — all 8 tests.

- [ ] **Step 10.5: Run full suite + coverage**

Run: `npx vitest run --coverage`
Expected: all tests pass, coverage ≥ 85% on lib/.

- [ ] **Step 10.6: Typecheck + lint**

Run: `npx tsc --noEmit && npx eslint . --quiet`
Expected: clean.

- [ ] **Step 10.7: Commit**

```bash
git add src/bin/cc-bridge.ts tests/integration/cli.test.ts
git commit -m "feat(cli): commander-based CLI with send/listen/rooms/validate

All public commands wired. Pretty mode strips ANSI. Filter expressions
parse from=X / to=X. SIGINT/SIGTERM exit 0 cleanly. EPIPE swallowed.
Integration suite via execa proves end-to-end round-trip.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 11: README + manual two-window test

**Files:**
- Create: `README.md`
- Create: `tests/manual/two-windows.ts`
- Create: `.cc-bridge.nosync` (no-op marker file, included for documentation)

- [ ] **Step 11.1: Write `README.md`**

```markdown
# @incultnitollc/cc-bridge

> Live JSONL message bridge between local Claude Code sessions.

Two (or more) Claude Code windows on the same machine. They need to talk in real time. `cc-bridge` gives each session a CLI to **send** a message to a shared file and **listen** for new messages via a file-tail stream that Claude's `Monitor` tool consumes as live push notifications. No daemon, no network, no polling.

## Install

```bash
npm install -g @incultnitollc/cc-bridge
```

Requires Node ≥ 20.

## Quickstart — two windows

**Window A:**
```bash
cc-bridge listen
```

**Window B:**
```bash
cc-bridge send "hello from B"
```

Window A immediately receives the JSONL line.

## Inside Claude Code

In each session, run the listen command under the `Monitor` tool so every appended line arrives as a live push notification — no polling.

```
Monitor: cc-bridge listen default
```

Then send from the other window via the `Bash` tool:

```
Bash: cc-bridge send "ready for review"
```

## Concepts

- **Room** — a named JSONL file under `~/.cc-bridge/rooms/<room>.jsonl`. Default room is `default`. Names allowed: `[a-zA-Z0-9_.-]{1,64}`.
- **Session id** — auto-generated `<host>-<ppid>-<rand8>` (parent shell PID, so two windows differ naturally). Override with `CC_BRIDGE_FROM=...`.
- **Message** — single-line JSON. Required: `v, id, ts, room, from, msg`. Optional: `to, reply_to, kind`. Unknown fields preserved for forward-compat.

## Commands

```bash
cc-bridge listen [room] [--replay N] [--pretty] [--filter from=X] [--from ID] [--json-errors]
cc-bridge send <msg> [--room R] [--to ID] [--reply-to ULID] [--kind text|event] [--from ID]
echo "hi" | cc-bridge send       # reads from stdin if piped
cc-bridge rooms                  # list rooms with size + mtime
cc-bridge rooms clear <room> --yes
cc-bridge validate <file>        # lint a JSONL room file
cc-bridge --version
cc-bridge --help
```

## Library use

```ts
import { sendMessage, listen, listRooms } from '@incultnitollc/cc-bridge'

await sendMessage({ from: 'planner', room: 'team', msg: 'kicking off build' })

const ctrl = listen({ room: 'team', sessionId: 'reviewer' })
for await (const ev of ctrl.iterator) {
  if (ev.ok) console.log(ev.line)
}
```

## Security model

`cc-bridge` is a **local-host IPC primitive**. The trust boundary is your user account. Do not place `~/.cc-bridge/` on a shared filesystem, network drive, or cloud-synced directory.

- Files in `~/.cc-bridge/` are created with mode `0700` (dir) / `0600` (files).
- Room names sanitized; path traversal refused.
- Symlinks at room paths refused.
- 64KB per-message cap. 10MB room file soft-warn; 100MB hard-refuse.
- `--pretty` strips ANSI escape sequences to prevent terminal hijack.
- The `from` field is sender-asserted (no signature). v1 explicitly trusts everyone with write access to your `$HOME`.

## Roadmap

- **v1.1** — `cc-bridge install-hooks` (auto-wire Claude Code Stop/UserPromptSubmit hooks), DM filtering (`--me`), time-based replay (`--replay 1h`), read receipts, Windows support.
- **v2** — MCP server wrapper, cross-machine backend (Supabase Realtime / Redis), webhook fanout, observer dashboard.

## License

MIT © 2026 Incultnito LLC.
```

- [ ] **Step 11.2: Write `tests/manual/two-windows.ts`**

```ts
import { execa } from 'execa'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

async function main() {
  const base = await mkdtemp(join(tmpdir(), 'cc-bridge-manual-'))
  const env = { ...process.env, CC_BRIDGE_HOME: base, CC_BRIDGE_FROM: 'manual-A' }

  console.log(`[manual] using temp base: ${base}`)
  const listener = execa('node', ['./dist/bin/cc-bridge.js', 'listen', 'default'], {
    env: { ...env, CC_BRIDGE_FROM: 'manual-B' },
    reject: false,
  })

  let received = ''
  listener.stdout?.on('data', (chunk: Buffer) => {
    received += chunk.toString('utf8')
    console.log(`[B received] ${chunk.toString('utf8').trim()}`)
  })

  await new Promise((r) => setTimeout(r, 500))

  for (const msg of ['hello', 'world', 'goodbye']) {
    const r = await execa(
      'node',
      ['./dist/bin/cc-bridge.js', 'send', '--room', 'default', msg],
      { env },
    )
    console.log(`[A sent] ${msg} (id ${r.stdout.trim()})`)
  }

  await new Promise((r) => setTimeout(r, 500))
  listener.kill('SIGINT')
  await listener

  const lines = received.split('\n').filter((l) => l.length > 0)
  const ok = lines.length === 3 && lines.every((l) => l.includes('"from":"manual-A"'))
  console.log(`[manual] result: ${ok ? 'PASS' : 'FAIL'} (received ${lines.length}/3)`)

  await rm(base, { recursive: true, force: true })
  process.exit(ok ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
```

- [ ] **Step 11.3: Build + run manual test**

Run: `npx tsup && npx tsx tests/manual/two-windows.ts`
Expected: `[manual] result: PASS (received 3/3)` and exit 0.

- [ ] **Step 11.4: Commit**

```bash
git add README.md tests/manual/two-windows.ts
git commit -m "docs: README quickstart + Monitor recipe + manual two-window test

README covers install, two-window quickstart, Monitor recipe, schema,
security model, and v1.1/v2 roadmap. Manual test exercises the
end-to-end primitive with a child listen process and three sends.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 12: CI workflow

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 12.1: Write `.github/workflows/ci.yml`**

```yaml
name: ci

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    strategy:
      matrix:
        node: [20, 22]
        os: [ubuntu-latest, macos-latest]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node }}
          cache: npm
      - run: npm ci
      - run: npx tsc --noEmit
      - run: npx eslint . --quiet
      - run: npx vitest run --coverage
      - run: npm run build
      - run: node ./dist/bin/cc-bridge.js --version
      - run: npx tsx tests/manual/two-windows.ts
      - run: npm audit --audit-level=high
```

- [ ] **Step 12.2: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: github actions matrix (node 20+22, ubuntu+macos)

Runs typecheck, lint, vitest with coverage gate, build, version
smoke test, manual two-window test, and high-severity npm audit.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 13: Publish gates + dry-run pack

**Files:** none new; verification only.

- [ ] **Step 13.1: Final clean build**

Run: `rm -rf dist && npm run build`
Expected: clean dist/ with both `bin/cc-bridge.js` and `lib/index.js` + `.d.ts`.

- [ ] **Step 13.2: Full local CI mirror**

Run: `npx tsc --noEmit && npx eslint . --quiet && npx vitest run --coverage && npx tsx tests/manual/two-windows.ts`
Expected: every gate passes, coverage ≥ 85%, manual test PASS.

- [ ] **Step 13.3: Pack dry-run**

Run: `npm pack --dry-run`
Expected: package contents = `dist/**`, `README.md`, `LICENSE`, `package.json`. No `src/`, `tests/`, `docs/`, `.github/`.

- [ ] **Step 13.4: Install from local tarball + smoke test**

Run:
```bash
npm pack
mkdir -p /tmp/cc-bridge-smoke && cd /tmp/cc-bridge-smoke && npm init -y >/dev/null && npm install /Users/pengspirit/incultnito/Dev/Backend/repos/claude-code-live-bridge/incultnitollc-cc-bridge-0.1.0.tgz && ./node_modules/.bin/cc-bridge --version
cd - && rm -rf /tmp/cc-bridge-smoke incultnitollc-cc-bridge-0.1.0.tgz
```
Expected: `0.1.0` printed.

- [ ] **Step 13.5: Final commit (if any state changed)**

```bash
git status
# If clean: nothing to commit.
# If dist artifacts or lockfile shifted that should be tracked, stage and commit:
git add -A
git diff --cached
git commit -m "chore: lock final state for v0.1.0 publish gate

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>" || true
```

- [ ] **Step 13.6: PAUSE — do not publish to npm or push to a public remote without Peng's confirmation.**

CLAUDE.md autonomous-mode rule: reversible local actions OK without confirm; `npm publish` and public `git push` are NOT reversible and require explicit user approval. Stop here. Leave the repo in a publish-ready state with all gates green. Report:

- Final commit hash
- Coverage % on lib/
- Bundle size (`du -sh dist/`)
- Manual two-window test result

---

## Out of scope for v1 (documented for clarity)

- Auto-install hooks into `.claude/settings.json` → v1.1
- DM filtering on listen → v1.1
- Read receipts → v1.1
- Time-based replay (`--replay 1h`) → v1.1
- Windows-native support → v1.1
- MCP server wrapper → v2 (separate package)
- Cross-machine backend → v2
- Webhook fanout → v2
- Web observer → v2
- At-rest encryption → never
- TUI chat mode → never
- Compressed rotation → never

## Self-Review Notes

- **Spec coverage:** every spec section (§3 architecture, §4 schema, §5 CLI, §6 data flow, §7 security, §8 errors, §9 testing, §10 publish gates) has tasks. Extras (rooms-mtime, validate, json-errors) covered in Tasks 7, 8, 10.
- **Placeholder scan:** none.
- **Type consistency:** `Message`, `BuildMessageInput`, `ListenEvent`, `ListenController`, `ListenOptions`, `RoomInfo`, `ValidationResult`, `ValidationError` defined once and re-used by exact name across tasks.
- **Ambiguity check:** session-id derivation pinned to PPID (spec §3.3 / 5 / Task 4). Soft/hard caps explicit (10MB warn, 100MB refuse — Task 5). Replay default = 0 (Task 6 + 10). `--pretty` strips ANSI; raw JSONL pass-through is the default (Task 10).
- **TDD discipline:** every lib module has a failing test → minimal impl → passing test → commit cycle.
- **Publish safety:** Task 13.6 explicitly halts before `npm publish` per CLAUDE.md autonomous-mode rule.
