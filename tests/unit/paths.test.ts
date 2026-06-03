import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { mkdir, symlink, writeFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { dir as tmpDir } from 'tmp-promise'
import {
  resolveBaseDir,
  resolveRoomFile,
  resolveSessionFile,
  resolveOffsetFile,
  ensureBaseDir,
  ensureRoomFile,
  refuseSymlink,
  isValidRoomName,
} from '../../src/lib/paths.js'

describe('paths', () => {
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

  test('resolveBaseDir reads CC_BRIDGE_HOME', () => {
    expect(resolveBaseDir()).toBe(base)
  })

  test('resolveRoomFile composes correctly', () => {
    expect(resolveRoomFile('default')).toBe(join(base, 'rooms', 'default.jsonl'))
  })

  test('resolveRoomFile rejects path traversal', () => {
    expect(() => resolveRoomFile('../etc/passwd')).toThrow()
    expect(() => resolveRoomFile('./foo')).toThrow()
    expect(() => resolveRoomFile('/abs')).toThrow()
    expect(() => resolveRoomFile('a/b')).toThrow()
  })

  test('isValidRoomName accepts/rejects per spec', () => {
    expect(isValidRoomName('default')).toBe(true)
    expect(isValidRoomName('a.b_c-1')).toBe(true)
    expect(isValidRoomName('a'.repeat(64))).toBe(true)
    expect(isValidRoomName('a'.repeat(65))).toBe(false)
    expect(isValidRoomName('')).toBe(false)
    expect(isValidRoomName('a b')).toBe(false)
    expect(isValidRoomName('../a')).toBe(false)
  })

  test('ensureBaseDir creates dir with mode 0o700', async () => {
    await ensureBaseDir()
    const s = await stat(base)
    expect(s.isDirectory()).toBe(true)
    expect(s.mode & 0o777).toBe(0o700)
  })

  test('ensureRoomFile creates file with mode 0o600 if missing', async () => {
    await ensureBaseDir()
    const p = await ensureRoomFile('default')
    const s = await stat(p)
    expect(s.isFile()).toBe(true)
    expect(s.mode & 0o777).toBe(0o600)
  })

  test('ensureRoomFile is idempotent', async () => {
    await ensureBaseDir()
    const p1 = await ensureRoomFile('default')
    await writeFile(p1, '{"existing":"line"}\n', { mode: 0o600 })
    const p2 = await ensureRoomFile('default')
    expect(p1).toBe(p2)
  })

  test('refuseSymlink throws if path is a symlink', async () => {
    await ensureBaseDir()
    const target = join(base, 'target.jsonl')
    const link = join(base, 'rooms', 'link.jsonl')
    await mkdir(join(base, 'rooms'), { recursive: true, mode: 0o700 })
    await writeFile(target, '')
    await symlink(target, link)
    await expect(refuseSymlink(link)).rejects.toThrow(/symlink/i)
  })

  test('refuseSymlink passes for regular files', async () => {
    await ensureBaseDir()
    const p = await ensureRoomFile('default')
    await expect(refuseSymlink(p)).resolves.toBeUndefined()
  })

  test('resolveSessionFile uses PPID', () => {
    const p = resolveSessionFile(12345)
    expect(p).toBe(join(base, 'sessions', '12345.id'))
  })

  test('resolveOffsetFile composes room+session', () => {
    const p = resolveOffsetFile('default', 'host-12345-abc')
    expect(p).toBe(join(base, 'state', 'default-host-12345-abc.offset'))
  })

  test('resolveBaseDir falls back to ~/.cc-bridge when env not set', () => {
    delete process.env.CC_BRIDGE_HOME
    const p = resolveBaseDir()
    expect(p).toMatch(/\.cc-bridge$/)
  })
})
