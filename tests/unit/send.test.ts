import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises'
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
      await mkdir(join(base, 'rooms'), { recursive: true, mode: 0o700 })
      await writeFile(p, 'x'.repeat(10_500_000), { mode: 0o600 })
      await sendMessage({ from: 'me', room: 'default', msg: big })
    } finally {
      process.stderr.write = origWrite
    }
    expect(stderrSpy.join('')).toMatch(/10MB|soft cap/i)
  })

  test('refuses send at 100MB hard cap', async () => {
    const p = join(base, 'rooms', 'default.jsonl')
    await mkdir(join(base, 'rooms'), { recursive: true, mode: 0o700 })
    await writeFile(p, 'x'.repeat(105 * 1024 * 1024), { mode: 0o600 })
    await expect(
      sendMessage({ from: 'me', room: 'default', msg: 'hi' }),
    ).rejects.toThrow(/100MB|hard cap/i)
  })
})
