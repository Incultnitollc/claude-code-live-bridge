import { afterEach, beforeEach, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requestOtp, verifyOtp, whoami, logoutAndClear } from '../../src/lib/auth.js'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ccb-auth-'))
  process.env.CC_BRIDGE_HOME = dir
})
afterEach(() => {
  delete process.env.CC_BRIDGE_HOME
  rmSync(dir, { recursive: true, force: true })
})

function fakeAuth(over: Record<string, unknown> = {}) {
  return {
    auth: {
      signInWithOtp: async () => ({ error: null }),
      verifyOtp: async () => ({ data: { user: { email: 'me@x.com' } }, error: null }),
      signOut: async () => ({ error: null }),
      getUser: async () => ({ data: { user: { email: 'me@x.com' } } }),
      ...over,
    },
  } as unknown as SupabaseClient
}

it('requestOtp throws on error', async () => {
  const c = fakeAuth({ signInWithOtp: async () => ({ error: { message: 'bad email' } }) })
  await expect(requestOtp(c, 'x')).rejects.toThrow(/bad email/)
})

it('verifyOtp returns the email', async () => {
  expect(await verifyOtp(fakeAuth(), 'me@x.com', '123456')).toBe('me@x.com')
})

it('whoami returns the email', async () => {
  expect(await whoami(fakeAuth())).toBe('me@x.com')
})

it('logoutAndClear does not throw', async () => {
  await expect(logoutAndClear(fakeAuth())).resolves.toBeUndefined()
})
