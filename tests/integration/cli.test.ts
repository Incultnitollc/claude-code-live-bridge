import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { execa } from 'execa'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { dir as tmpDir } from 'tmp-promise'

const CLI = ['node', './dist/bin/cc-bridge.js']

function runCli(args: string[], env: NodeJS.ProcessEnv) {
  return execa(CLI[0]!, [CLI[1]!, ...args], { env: { ...process.env, ...env }, reject: false })
}

describe('cli integration', () => {
  let base: string
  let cleanup: () => Promise<void>

  beforeEach(async () => {
    const t = await tmpDir({ unsafeCleanup: true })
    base = t.path
    cleanup = async () => {
      await t.cleanup()
    }
    await mkdir(join(base, 'rooms'), { recursive: true, mode: 0o700 })
  })

  afterEach(async () => {
    await cleanup()
  })

  test('--version prints version', async () => {
    const r = await runCli(['--version'], { CC_BRIDGE_HOME: base, CC_BRIDGE_FROM: 'tester' })
    expect(r.exitCode).toBe(0)
    expect(r.stdout).toMatch(/0\.1\.0/)
  })

  test('send + validate round-trip', async () => {
    const send = await runCli(['send', '--room', 'default', 'hello world'], {
      CC_BRIDGE_HOME: base,
      CC_BRIDGE_FROM: 'tester',
    })
    expect(send.exitCode).toBe(0)
    const validate = await runCli(['validate', join(base, 'rooms', 'default.jsonl')], {
      CC_BRIDGE_HOME: base,
    })
    expect(validate.exitCode).toBe(0)
    expect(validate.stdout).toMatch(/OK:/)
  })

  test('send empty msg exits 1', async () => {
    const r = await runCli(['send', '--room', 'default', ''], {
      CC_BRIDGE_HOME: base,
      CC_BRIDGE_FROM: 'tester',
    })
    expect(r.exitCode).toBe(1)
  })

  test('send rejects bad room', async () => {
    const r = await runCli(['send', '--room', '../etc', 'hi'], {
      CC_BRIDGE_HOME: base,
      CC_BRIDGE_FROM: 'tester',
    })
    expect(r.exitCode).toBe(1)
  })

  test('rooms list shows recently-written room', async () => {
    await runCli(['send', '--room', 'planning', 'a'], {
      CC_BRIDGE_HOME: base,
      CC_BRIDGE_FROM: 'tester',
    })
    const r = await runCli(['rooms'], { CC_BRIDGE_HOME: base })
    expect(r.exitCode).toBe(0)
    expect(r.stdout).toMatch(/planning/)
  })

  test('rooms clear --yes truncates', async () => {
    await runCli(['send', '--room', 'planning', 'a'], {
      CC_BRIDGE_HOME: base,
      CC_BRIDGE_FROM: 'tester',
    })
    const r = await runCli(['rooms', 'clear', 'planning', '--yes'], {
      CC_BRIDGE_HOME: base,
    })
    expect(r.exitCode).toBe(0)
    expect(r.stdout).toMatch(/cleared: planning/)
  })

  test('validate flags bad file', async () => {
    const p = join(base, 'rooms', 'bad.jsonl')
    await writeFile(p, 'not-json\n')
    const r = await runCli(['validate', p], { CC_BRIDGE_HOME: base })
    expect(r.exitCode).toBe(1)
    expect(r.stdout).toMatch(/errors/)
  })

  test('listen with --replay prints prior messages and exits on SIGTERM', async () => {
    await runCli(['send', '--room', 'default', 'before'], {
      CC_BRIDGE_HOME: base,
      CC_BRIDGE_FROM: 'tester',
    })
    const child = execa(CLI[0]!, [CLI[1]!, 'listen', 'default', '--replay', '1'], {
      env: { ...process.env, CC_BRIDGE_HOME: base, CC_BRIDGE_FROM: 'tester' },
      reject: false,
    })
    await new Promise((r) => setTimeout(r, 500))
    child.kill('SIGTERM')
    const r = await child
    expect(r.stdout).toMatch(/"msg":"before"/)
  })
})
