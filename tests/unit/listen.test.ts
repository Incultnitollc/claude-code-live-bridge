import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { appendFile, mkdir, writeFile } from 'node:fs/promises'
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
    await mkdir(join(base, 'rooms'), { recursive: true, mode: 0o700 })
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
