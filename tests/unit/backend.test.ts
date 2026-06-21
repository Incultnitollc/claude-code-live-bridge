import { afterEach, expect, it } from 'vitest'
import { resolveBackend } from '../../src/lib/backend.js'

afterEach(() => delete process.env.CC_BRIDGE_LOCAL)

const yes = { isLoggedIn: async () => true }
const no = { isLoggedIn: async () => false }

it('--local forces local even when logged in', async () => {
  expect(await resolveBackend({ local: true }, yes)).toBe('local')
})

it('CC_BRIDGE_LOCAL forces local', async () => {
  process.env.CC_BRIDGE_LOCAL = '1'
  expect(await resolveBackend({}, yes)).toBe('local')
})

it('logged in → cloud', async () => {
  expect(await resolveBackend({}, yes)).toBe('cloud')
})

it('logged out → local', async () => {
  expect(await resolveBackend({}, no)).toBe('local')
})
