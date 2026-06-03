import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { writeFile, readdir, readFile, chmod } from 'node:fs/promises'
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

  test('listRooms returns [] when rooms dir is unreadable (readdir fails)', async () => {
    // Strip read permission from the rooms dir so readdir throws EACCES.
    await ensureBaseDir()
    const roomsPath = join(base, 'rooms')
    await chmod(roomsPath, 0o000)
    try {
      const rooms = await listRooms()
      expect(rooms).toEqual([])
    } finally {
      // Restore so afterEach cleanup works.
      await chmod(roomsPath, 0o700)
    }
  })

  test('reapStaleSessions returns 0 when sessions dir is unreadable', async () => {
    // Strip read permission from the sessions dir so readdir throws EACCES.
    await ensureBaseDir()
    const sessPath = join(base, 'sessions')
    await chmod(sessPath, 0o000)
    try {
      const reaped = await reapStaleSessions()
      expect(reaped).toBe(0)
    } finally {
      await chmod(sessPath, 0o700)
    }
  })

  test('reapStaleSessions treats EPERM from process.kill as alive (PID 1 not reaped)', async () => {
    // PID 1 is init/launchd — for a non-root user, process.kill(1, 0) raises EPERM,
    // which the reaper must interpret as "alive" and skip unlink.
    await ensureBaseDir()
    const sessDir = join(base, 'sessions')
    await writeFile(join(sessDir, '1.id'), 'pid1-id\n', { mode: 0o600 })
    // Also include a stale entry to confirm reaping still happens for dead PIDs.
    const deadPid = 2_147_483_640
    await writeFile(join(sessDir, `${deadPid}.id`), 'dead\n', { mode: 0o600 })
    await reapStaleSessions()
    const remaining = await readdir(sessDir)
    expect(remaining).toContain('1.id')
    expect(remaining).not.toContain(`${deadPid}.id`)
  })
})
