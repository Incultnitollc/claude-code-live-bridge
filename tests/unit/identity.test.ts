import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { readFile } from 'node:fs/promises'
import { dir as tmpDir } from 'tmp-promise'
import { getSessionId, resetSessionIdCache } from '../../src/lib/identity.js'

describe('identity', () => {
  let cleanup: () => Promise<void>

  beforeEach(async () => {
    const t = await tmpDir({ unsafeCleanup: true })
    process.env.CC_BRIDGE_HOME = t.path
    cleanup = async () => {
      await t.cleanup()
    }
    resetSessionIdCache()
  })

  afterEach(async () => {
    delete process.env.CC_BRIDGE_HOME
    delete process.env.CC_BRIDGE_FROM
    await cleanup()
  })

  test('env var CC_BRIDGE_FROM overrides everything', async () => {
    process.env.CC_BRIDGE_FROM = 'override-id'
    const id = await getSessionId()
    expect(id).toBe('override-id')
  })

  test('env var rejected if it contains invalid chars', async () => {
    process.env.CC_BRIDGE_FROM = 'bad id with spaces'
    await expect(getSessionId()).rejects.toThrow(/invalid/i)
  })

  test('auto id matches host-ppid-rand format', async () => {
    const id = await getSessionId()
    expect(id).toMatch(/^[a-zA-Z0-9.-]+-\d+-[a-z0-9]{8}$/)
  })

  test('auto id cached for same PPID', async () => {
    const id1 = await getSessionId()
    resetSessionIdCache()
    const id2 = await getSessionId()
    expect(id2).toBe(id1)
  })

  test('cached id is persisted to ~/.cc-bridge/sessions/<ppid>.id', async () => {
    const id = await getSessionId()
    const ppid = process.ppid
    const cached = await readFile(
      `${process.env.CC_BRIDGE_HOME}/sessions/${ppid}.id`,
      'utf8',
    )
    expect(cached.trim()).toBe(id)
  })
})
