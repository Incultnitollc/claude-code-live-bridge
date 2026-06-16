![cc-bridge — live JSONL bridge between local Claude Code sessions](https://raw.githubusercontent.com/Incultnitollc/claude-code-live-bridge/main/og-card.png)

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
