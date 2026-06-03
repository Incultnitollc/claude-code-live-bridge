# Claude Code Live Bridge — Design Spec

- **Status:** Approved for implementation
- **Date:** 2026-06-02
- **Owner:** Peng (Incultnito LLC)
- **Repo (target):** `Incultnitollc/claude-code-live-bridge`
- **Package (target):** `@incultnitollc/cc-bridge`
- **Binary:** `cc-bridge`
- **License:** MIT

## 1. Problem & Goal

When a user runs two or more Claude Code sessions on the same host, there is no built-in way for those sessions to talk to each other in real time. Polling is unacceptable; the user wants live push.

**Goal of v1:** Ship the smallest reliable primitive — a single npm package — that lets two (or more) local Claude Code sessions exchange JSONL messages through tailed files, surfaced live via the Monitor tool. The package must be defensible in a Show HN thread (no config-file horror stories), trivially installable (`npm i -g`), and forward-compatible with N-agent rooms.

**Non-goals (v1):**
- Cross-machine bridging.
- Auto-installing Claude Code hooks (deferred to v1.1).
- Group-chat orchestration beyond schema scaffolding.
- Encryption at rest.
- Web UI / observer dashboard.

## 2. Decisions Locked During Brainstorm

| # | Decision |
|---|---|
| Topology | 2-agent default, schema scales to N |
| v1 scope | Primitive + CLI wrapper (no auto-hooks) |
| Schema | Minimal forward-compat: required `v, id, ts, from, room, msg` + optional `to, reply_to, kind` |
| Room/identity | `~/.cc-bridge/rooms/<room>.jsonl`, default room `default`, auto session id |
| Name | `@incultnitollc/cc-bridge` → binary `cc-bridge` |
| Distribution | Single package, exports CLI + lib |
| Architecture | Node-native (chokidar + proper-lockfile), ~500 LoC |
| Extras for v1 | `cc-bridge rooms` shows mtime + size; `cc-bridge validate <file>` lint; `--json-errors` flag on listen |

## 3. Architecture

### 3.1 Module Layout

```
@incultnitollc/cc-bridge (single package)
│
├── src/
│   ├── lib/
│   │   ├── paths.ts         resolve ~/.cc-bridge/rooms/<room>.jsonl, ensure dir exists
│   │   ├── identity.ts      generate/load session id (hostname-pid-short)
│   │   ├── schema.ts        Zod-validated Message type + version constant
│   │   ├── send.ts          appendLine(room, msg) → write JSONL with lockfile
│   │   ├── listen.ts        async iterator yielding new messages from EOF
│   │   ├── rooms.ts         list / clear / stat rooms
│   │   ├── validate.ts      lint a JSONL file against schema
│   │   └── index.ts         public re-exports (send, listen, Message, validate)
│   │
│   └── bin/
│       └── cc-bridge.ts     commander.js CLI: send | listen | rooms | validate
│
├── tests/                   vitest unit + integration
├── package.json             "bin": { "cc-bridge": "dist/bin/cc-bridge.js" }, "type": "module"
└── README.md                quickstart + Monitor recipe + schema reference
```

### 3.2 Boundaries

- `lib/` is pure — no `console.log`, no `process.exit`. Library consumers can import freely without side effects.
- `bin/cc-bridge.ts` is the only file that writes to stdout/stderr or parses argv.
- All file path resolution funnels through `lib/paths.ts`. This is the security chokepoint — any path-related audit looks at one file.
- Tests target `lib/` directly. The CLI gets a thin integration test via `execa`.

### 3.3 Stack

- TypeScript strict mode
- Node ≥ 20 (ESM-only)
- Runtime deps: `commander`, `chokidar`, `proper-lockfile`, `ulid`, `zod`
- Dev deps: `vitest`, `tsup`, `eslint`, `prettier`, `execa`, `tmp-promise`

## 4. Message Schema

Single source of truth: `src/lib/schema.ts`.

```ts
const Message = z.object({
  v: z.literal(1),                                    // schema version
  id: z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/),   // ulid
  ts: z.string().datetime(),                          // ISO 8601 UTC
  room: z.string().min(1).max(64),
  from: z.string().min(1).max(64),
  msg: z.string().max(64_000),                        // 64KB hard cap
  to: z.string().min(1).max(64).optional(),
  reply_to: z.string().optional(),
  kind: z.enum(['text', 'event']).default('text'),
})
```

**Forward-compat rule:** unknown top-level fields are PRESERVED on read (no strict mode). Future versions can add `attachments`, `tool_call`, etc., without breaking v1 readers.

**Why each piece:**
- **ulid not uuid** — lexicographically sortable by time, so the JSONL file is naturally chronologically ordered even with concurrent writers.
- **64KB msg cap** — keeps a single line within editor display limits and prevents a runaway agent from filling disk.
- **`kind` default `'text'`** — leaves room for `'event'` (and later `'tool_call'`, `'attachment'`) without a schema bump.

## 5. CLI Surface

```bash
# Listen (default room, auto session id)
cc-bridge listen
cc-bridge listen <room>
cc-bridge listen <room> --replay 20          # print last 20, then tail
cc-bridge listen <room> --pretty             # human-readable (default: raw JSONL)
cc-bridge listen <room> --filter from=B      # only show messages from B
cc-bridge listen <room> --from my-session-id # override auto session id
cc-bridge listen <room> --json-errors        # emit warnings as JSON to stderr

# Send (default room)
cc-bridge send "hello world"
cc-bridge send --room planning "next step?"
cc-bridge send --to coder-2 "review please"  # adds optional `to` field
cc-bridge send --reply-to <msg-id> "ack"
cc-bridge send --from reviewer "..."
echo "hi" | cc-bridge send                   # reads from stdin if piped

# Room management
cc-bridge rooms                              # list rooms with mtime + size
cc-bridge rooms clear <room>                 # truncate room file (confirms)

# Lint
cc-bridge validate <file>                    # lint a JSONL file against schema; exit 1 if invalid

# Meta
cc-bridge --version
cc-bridge --help
```

**Defaults that matter:**
- No args on `listen` → room=`default`, raw JSONL stdout (so Monitor sees one notification per line).
- `send` reads message from positional arg OR stdin if piped.
- Auto session id: `<hostname>-<PPID>-<8charrand>` where PPID is the parent shell PID (so two CC windows naturally get distinct IDs). Cached at `~/.cc-bridge/sessions/<PPID>.id` and reused for the life of the parent shell. Env var `CC_BRIDGE_FROM` overrides. Stale session files (PPID no longer alive — checked with `kill -0`) are reaped lazily during `cc-bridge rooms` runs.

**Exit codes:** `0` success, `1` user/validation error, `2` I/O error. `listen` runs until SIGINT, exits `0`.

**Logging discipline:**
- `stdout` = message payload only (so Monitor's stream is clean).
- `stderr` = warnings, errors, hints. Prefixed `cc-bridge:`.
- No log files. Users redirect stderr if they want capture.

## 6. Data Flow

### 6.1 Send

```
cc-bridge send "hi"
  → schema.ts: build Message {v:1, id:ulid(), ts:now(), from:sessionId, room, msg}
  → JSON.stringify → append "\n"
  → proper-lockfile acquire (retry 5x, 50ms backoff)
  → fs.appendFile(roomPath, line, {flag:'a'})
  → release lock
  → exit 0
```

### 6.2 Listen

```
cc-bridge listen
  → ensure room file exists (touch if not, mode 0o600)
  → if --replay N: read last N lines, validate, emit
  → fs.open + seek to EOF (or to replay point)
  → chokidar.watch(roomPath, {usePolling: false})
  → on 'change': read from saved offset → EOF, split on \n, JSON.parse each
  → schema.safeParse — skip malformed lines with stderr warning (don't crash)
  → write valid JSONL to stdout, flush
  → repeat on next change event
  → on SIGINT: flush stdout, save offset, exit 0
```

**Offset state:** saved to `~/.cc-bridge/state/<room>-<sessionId>.offset` so `listen` can resume after SIGINT without re-replaying. Stale state for vanished sessions is reaped during `cc-bridge rooms` runs (best-effort, non-fatal).

### 6.3 Watcher Mode — Polling Decision (v0.1.0)

The listen module's chokidar watcher was originally configured with `usePolling: false` (native FSEvents on darwin, inotify on linux). Under chokidar 4.x on macOS, `change` events from FSEvents fire unreliably for our local append-only JSONL workload — tests timed out waiting for events that arrived 5+ seconds late or not at all. Switched to `usePolling: true, interval: 50` for v0.1.0.

**Tradeoff:** ~50ms latency floor on message delivery (negligible for human-driven Claude Code IPC), and constant low background `fs.stat` load (one syscall per room being listened to per 50ms — bounded by number of active sessions, not by message rate).

**Revisit if:** (a) chokidar 4 fixes FSEvents reliability, or (b) profiling shows polling overhead matters at scale. Not a v1.1 priority.

## 7. Security Model

**Threat model:** local-host IPC only. Same user, same machine. Trust boundary = the user account. This is NOT a network protocol. README states this explicitly.

| Threat | Mitigation |
|---|---|
| **Path traversal** (`--room "../../etc/passwd"`) | Sanitize: room name must match `^[a-zA-Z0-9_.-]{1,64}$`. Reject otherwise. Resolve final path with `path.resolve` and assert it starts with `~/.cc-bridge/rooms/`. |
| **Symlink attack** (attacker pre-creates room file as symlink to sensitive path) | `fs.lstat` before any open. If file is a symlink, refuse and warn. Use `O_NOFOLLOW` on supported platforms. |
| **Permissions leak** (other users on shared host) | Create `~/.cc-bridge/` with mode `0o700`. All room files written with mode `0o600`. Verify on every open; warn on stderr if drifted (don't auto-chmod — user may have intentional setup). |
| **Terminal hijack via ANSI in msg** | `--pretty` output strips ANSI escape sequences (`\x1b[...m`) before printing. Raw JSONL output is inherently safe (JSON.stringify escapes control chars). |
| **DoS — runaway agent fills disk** | Per-message 64KB cap (enforced by schema). Per-room soft cap: warn at 10MB, refuse send at 100MB. User runs `cc-bridge rooms clear` to reset. |
| **OOM on listen** (giant line in file) | Streaming line reader with 128KB per-line hard limit; skip and stderr-warn on overflow. |
| **`from` spoofing** | Documented non-goal v1. Anyone with write access to $HOME already owns the session. Signed messages = v2 if/when remote bridge ships. |
| **Cloud sync leak** ($HOME synced to Dropbox/iCloud) | README warning. `cc-bridge` writes a `.nosync` marker file on first init. |
| **Network exposure** | Zero by design. No socket binding. README forbids placing `~/.cc-bridge/` on shared/networked filesystems. |

**Audit posture:**
- All file ops go through `lib/paths.ts` (single chokepoint). Easy to grep/audit.
- No `eval`, no `child_process.exec` from user input.
- Dependencies pinned in `package-lock.json`; `npm audit` gate in CI.

## 8. Error Handling & Edge Cases

| Scenario | Behavior |
|---|---|
| Room dir missing | `paths.ts` creates `~/.cc-bridge/rooms/` with mode `0o700` on first use. Idempotent. |
| Room file missing on listen | Touch with `0o600`, then begin tailing. No error. |
| Two writers race-append | `proper-lockfile` retries 5× (50ms backoff). If still locked → exit 2 with stderr hint. |
| Lockfile stale (writer crashed) | `proper-lockfile` stale-detection (default 10s) auto-clears. |
| Malformed JSON line in file | `listen` logs `WARN: skipping malformed line at offset N` to stderr, continues. Never crashes. |
| Schema-invalid line | Same as malformed: skip + warn. Forward-compat means unknown fields preserved on pass-through. |
| File rotated/truncated mid-listen | Chokidar fires `change` with size < saved offset → reset offset to 0, re-open, continue. |
| Disk full on send | Catch ENOSPC → stderr `ERROR: disk full` → exit 2. Lockfile released. |
| Permission denied on file | Stderr clear message naming the path. Hint: check `~/.cc-bridge/` ownership. Exit 2. |
| Room name invalid | `cc-bridge: invalid room name (allowed: a-z, A-Z, 0-9, dot, underscore, hyphen, max 64)` → exit 1. |
| Message > 64KB | Reject before write: `cc-bridge: message exceeds 64KB cap`. Exit 1. |
| Empty msg | Reject: `cc-bridge: empty message`. Exit 1. |
| SIGINT on listen | Flush stdout, save offset, exit 0 cleanly. |
| Stdout closed (parent died, broken pipe) | Catch EPIPE → exit 0 silently. |
| Concurrent `rooms clear` while listener active | Listener detects truncation → resets offset → continues with empty file. No crash. |
| Schema version bump (future v2 messages in file) | v1 reader: if `v` field > 1, skip line with stderr warn `unknown schema version N at offset M, upgrade cc-bridge`. |
| Symlink detected at room path | Refuse to open. Stderr: `ERROR: room file is a symlink, refusing for safety`. Exit 2. |
| Wrong permissions on existing room file (e.g., 0o644) | Warn on stderr, continue. (Don't auto-chmod.) |

## 9. Testing Strategy

| Layer | What's covered | Approx count |
|---|---|---|
| **Unit — schema** | Valid messages parse. Missing required fields fail. Unknown fields preserved. Version mismatch rejected. ulid format enforced. Message > 64KB rejected. Room name regex (path traversal attempts: `../`, `~`, absolute paths, unicode tricks). | ~15 |
| **Unit — paths** | `~/.cc-bridge/rooms/<room>.jsonl` resolution. Dir created with `0o700`. File created with `0o600`. Symlink detection refuses. Sanitization rejects bad names. | ~8 |
| **Unit — identity** | Auto session id matches format `<host>-<pid>-<rand>`. Env var `CC_BRIDGE_FROM` override wins. Cached session id reused within process. | ~4 |
| **Unit — send** | Single append writes valid JSONL. Lockfile acquired + released. Empty msg rejected. Oversize msg rejected. ENOSPC propagated. | ~6 |
| **Unit — listen** | New lines after subscribe are emitted. `--replay N` prints last N then tails. Malformed lines skipped with stderr warn. Truncation resets offset. 128KB line cap enforced. Unknown schema version warned. `--json-errors` produces structured stderr. | ~12 |
| **Unit — rooms** | `rooms` lists existing rooms with mtime + size. `rooms clear` truncates and prompts. | ~4 |
| **Unit — validate** | Lints a JSONL file, reports per-line errors, exit 1 on any failure. | ~5 |
| **Integration — CLI** | (via `execa`) `cc-bridge send` then `cc-bridge listen --replay 1` → message round-trips. Two parallel `send` processes don't corrupt file (race test, 100 writes each). `listen` exits 0 on SIGINT. Invalid args exit 1. | ~8 |
| **Integration — Monitor recipe** | A documented test runs `cc-bridge listen` under a child process, sends 3 messages from another process, asserts stdout receives exactly 3 lines in order. Proves the "Monitor tail-f live push" pattern works. | ~2 |

**Tooling:**
- `vitest` with `--coverage` (c8). Target ≥85% line coverage on `lib/`.
- `tmp-promise` for per-test isolated temp dirs (no test ever touches real `~/.cc-bridge/`).
- All file ops in `lib/paths.ts` take a `baseDir` arg with env-overridable default — tests inject temp dir via `CC_BRIDGE_HOME`.
- CI runs on Node 20 + 22, macOS + Linux (ubuntu-latest). Windows deferred to v1.1 unless trivial.

**What's NOT tested in v1:**
- Cross-machine bridge (doesn't exist).
- Performance benchmarks (no perf claim made in README).
- Fuzz testing of schema parser (zod is well-tested upstream).

## 10. Publish Gates

Before `npm publish`:

1. `npx tsc --noEmit` clean.
2. `npx eslint . --quiet` clean.
3. `npx vitest run --coverage` ≥ 85% on `lib/`.
4. `npm pack` + install in scratch dir + run `cc-bridge --version` smoke test.
5. `npx tsx tests/manual/two-windows.ts` — manual two-process round-trip.

## 11. Roadmap Beyond v1

**v1.1 (after Show HN feedback):**
- `cc-bridge install-hooks` — auto-wire Stop / UserPromptSubmit / PostToolUse into `.claude/settings.json` with backup. Opt-in.
- DM filtering — `send --to coder-2`, `listen --me coder-1` shows broadcasts + DMs to me only.
- Read receipts via `<sessionId>.cursor` sidecar files.
- Time-based replay — `--replay 1h`.
- Room TTL / auto-cleanup of stale rooms.
- Windows-native support.

**v2 (separate package or major version):**
- MCP server wrapper — `@incultnitollc/cc-bridge-mcp` exposes `bridge_send` / `bridge_listen` as MCP tools.
- Cross-machine backend swap (Supabase Realtime / Redis / SQS) via env-var-selected adapter.
- Webhook fanout — POST each msg to a URL.
- `cc-bridge serve` — local HTML observer dashboard.

**Explicitly dropped / never:**
- TUI chat mode (Monitor is the UI).
- At-rest encryption (trust boundary is $HOME owner).
- Compressed rotation of old JSONL.

## 12. Show HN Prep (Not Code)

- 30-second asciinema demo (two terminals, send/listen round-trip).
- Single-page landing on GH Pages with quickstart + schema.
- README hero gif (two-window quickstart).
- No domain purchase for v1; revisit post-launch if traction warrants.

## 13. Open Questions Resolved During Brainstorm

All seven bootstrap questions were resolved in the decision table (§2). No open questions remain for v1.
