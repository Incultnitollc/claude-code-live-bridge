import { afterEach, beforeEach, expect, it } from 'vitest'
import { mkdtempSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createFileStorage, clearCredentials } from '../../src/lib/credentials.js'

let dir: string
let file: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ccb-cred-'))
  file = join(dir, 'credentials.json')
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

it('round-trips set/get/remove', () => {
  const s = createFileStorage(file)
  expect(s.getItem('k')).toBeNull()
  s.setItem('k', 'v')
  expect(s.getItem('k')).toBe('v')
  s.removeItem('k')
  expect(s.getItem('k')).toBeNull()
})

it('clearCredentials deletes the file', () => {
  const s = createFileStorage(file)
  s.setItem('k', 'v')
  expect(existsSync(file)).toBe(true)
  clearCredentials(file)
  expect(existsSync(file)).toBe(false)
})
