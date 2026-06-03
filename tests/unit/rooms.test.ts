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
    await writeFile(join(sessDir, '0.id'), 'stale-id\n', { mode: 0o600 })
    await writeFile(join(sessDir, `${process.pid}.id`), 'live-id\n', { mode: 0o600 })
    await reapStaleSessions()
    const remaining = await readdir(sessDir)
    expect(remaining).toContain(`${process.pid}.id`)
    expect(remaining).not.toContain('0.id')
  })
})
