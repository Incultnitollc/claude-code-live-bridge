import { afterEach, beforeEach, expect, it, vi } from 'vitest'

beforeEach(() => vi.resetModules())
afterEach(() => {
  delete process.env.CC_BRIDGE_SUPABASE_URL
  delete process.env.CC_BRIDGE_SUPABASE_ANON_KEY
})

it('env vars override the baked defaults', async () => {
  process.env.CC_BRIDGE_SUPABASE_URL = 'https://example.test'
  process.env.CC_BRIDGE_SUPABASE_ANON_KEY = 'test-key'
  const { SUPABASE_URL, SUPABASE_ANON_KEY } = await import('../../src/lib/config.js')
  expect(SUPABASE_URL).toBe('https://example.test')
  expect(SUPABASE_ANON_KEY).toBe('test-key')
})
