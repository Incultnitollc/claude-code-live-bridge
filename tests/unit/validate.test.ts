import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { dir as tmpDir } from 'tmp-promise'
import { validateFile } from '../../src/lib/validate.js'

describe('validate', () => {
  let dirPath: string
  let cleanup: () => Promise<void>

  beforeEach(async () => {
    const t = await tmpDir({ unsafeCleanup: true })
    dirPath = t.path
    cleanup = async () => {
      await t.cleanup()
    }
  })

  afterEach(async () => {
    await cleanup()
  })

  test('returns ok=true with zero errors for valid file', async () => {
    const path = join(dirPath, 'good.jsonl')
    const line = JSON.stringify({
      v: 1,
      id: '01HZZZZZZZZZZZZZZZZZZZZZZZ',
      ts: '2026-06-02T12:00:00.000Z',
      room: 'default',
      from: 'me',
      msg: 'hi',
    })
    await writeFile(path, `${line}\n${line}\n`)
    const result = await validateFile(path)
    expect(result.ok).toBe(true)
    expect(result.errors.length).toBe(0)
    expect(result.validLines).toBe(2)
  })

  test('returns ok=false with per-line errors', async () => {
    const path = join(dirPath, 'bad.jsonl')
    const good = JSON.stringify({
      v: 1,
      id: '01HZZZZZZZZZZZZZZZZZZZZZZZ',
      ts: '2026-06-02T12:00:00.000Z',
      room: 'default',
      from: 'me',
      msg: 'hi',
    })
    await writeFile(path, `${good}\nnot-json\n{"v":1}\n`)
    const result = await validateFile(path)
    expect(result.ok).toBe(false)
    expect(result.errors.length).toBe(2)
    expect(result.errors[0]!.lineNumber).toBe(2)
    expect(result.errors[1]!.lineNumber).toBe(3)
    expect(result.validLines).toBe(1)
  })

  test('skips blank lines without error', async () => {
    const path = join(dirPath, 'blanks.jsonl')
    const good = JSON.stringify({
      v: 1,
      id: '01HZZZZZZZZZZZZZZZZZZZZZZZ',
      ts: '2026-06-02T12:00:00.000Z',
      room: 'default',
      from: 'me',
      msg: 'hi',
    })
    await writeFile(path, `${good}\n\n${good}\n`)
    const result = await validateFile(path)
    expect(result.ok).toBe(true)
    expect(result.validLines).toBe(2)
  })

  test('missing file throws', async () => {
    await expect(validateFile(join(dirPath, 'nope.jsonl'))).rejects.toThrow()
  })
})
