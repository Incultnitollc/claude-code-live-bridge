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

    watcher = chokidar.watch(path, { usePolling: true, interval: 50, ignoreInitial: true })
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
              emit({
                ok: false,
                reason: 'oversize',
                raw: `${line.slice(0, 200)}...[truncated ${line.length} bytes]`,
              })
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
          await writeFile(resolveOffsetFile(opts.room, opts.sessionId), String(offset), {
            mode: 0o600,
          })
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
