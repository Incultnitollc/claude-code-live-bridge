#!/usr/bin/env node
import { Command } from 'commander'
import ansiRegex from 'ansi-regex'
import { createInterface } from 'node:readline'
import {
  sendMessage,
  listen,
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
  .action(
    async (
      room: string,
      opts: {
        replay: number
        pretty?: boolean
        filter?: string
        from?: string
        jsonErrors?: boolean
      },
    ) => {
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
              process.stdout.write(
                `[${parsed.value.ts}] ${parsed.value.from}${
                  parsed.value.to ? ` → ${parsed.value.to}` : ''
                }: ${stripped}\n`,
              )
            } else {
              process.stdout.write(`${ev.line}\n`)
            }
          } else {
            if (opts.jsonErrors) {
              process.stderr.write(
                `${JSON.stringify({ level: 'warn', reason: ev.reason, raw: ev.raw.slice(0, 200) })}\n`,
              )
            } else {
              process.stderr.write(`cc-bridge: warn — ${ev.reason}: ${ev.raw.slice(0, 200)}\n`)
            }
          }
        }
      } catch (e) {
        process.stderr.write(`cc-bridge: ${(e as Error).message}\n`)
        process.exit(2)
      }
    },
  )

program
  .command('send')
  .description('Send a message to a room (msg from arg or stdin)')
  .argument('[msg]', 'message text (or pipe via stdin)')
  .option('--room <room>', 'room name', 'default')
  .option('--from <id>', 'override session id')
  .option('--to <id>', 'direct-message target')
  .option('--reply-to <ulid>', 'message id this replies to')
  .option('--kind <kind>', 'message kind: text | event', 'text')
  .action(
    async (
      msgArg: string | undefined,
      opts: { room: string; from?: string; to?: string; replyTo?: string; kind: string },
    ) => {
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
    },
  )

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
      process.stdout.write(`${'NAME'.padEnd(nameW)}  ${'SIZE'.padStart(sizeW)}  MTIME\n`)
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
        process.stdout.write(
          `  line ${err.lineNumber}: ${err.reason} — ${err.detail.slice(0, 200)}\n`,
        )
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

function applyFilter(
  msg: { from: string; to?: string | undefined },
  f: { key: 'from' | 'to'; value: string },
): boolean {
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
