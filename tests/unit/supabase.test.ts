import { afterEach, beforeEach, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createBridgeClient, isLoggedIn } from '../../src/lib/supabase.js'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ccb-sb-'))
  process.env.CC_BRIDGE_HOME = dir
})
afterEach(() => {
  delete process.env.CC_BRIDGE_HOME
  rmSync(dir, { recursive: true, force: true })
})

it('creates a client and reports logged-out with no credentials', async () => {
  const client = createBridgeClient()
  expect(client).toBeTruthy()
  expect(await isLoggedIn(client)).toBe(false)
})
