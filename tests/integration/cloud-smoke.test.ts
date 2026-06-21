import { describe, expect, it } from 'vitest'
import { createBridgeClient } from '../../src/lib/supabase.js'
import { sendRemote } from '../../src/lib/send-remote.js'
import { listenRemote } from '../../src/lib/listen-remote.js'

// Runs only when a real, logged-in session + anon key are configured.
// Requires: CC_BRIDGE_SUPABASE_ANON_KEY set, CC_BRIDGE_HOME pointing at creds
// from a prior `cc-bridge login`, and CC_BRIDGE_SMOKE=1.
const run = process.env.CC_BRIDGE_SMOKE === '1'

describe.skipIf(!run)('cloud smoke', () => {
  it(
    'send then listen round-trips through Supabase',
    async () => {
      const room = `smoke-${process.pid}`
      const client = createBridgeClient()
      const ctrl = listenRemote({ room, sessionId: 'smoke', replayLastN: 0 }, client)
      const it = ctrl.iterator[Symbol.asyncIterator]()
      await new Promise((r) => setTimeout(r, 1000)) // let subscription establish
      const sent = await sendRemote({ from: 'smoke', room, msg: 'ping' }, client)
      const ev = (await it.next()).value as { ok: boolean; line: string }
      expect(JSON.parse(ev.line).id).toBe(sent.id)
      await ctrl.close()
    },
    15_000,
  )
})
