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
  const { client, push } = fakeClient([messageToRow(old), messageToRow(live)])
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
