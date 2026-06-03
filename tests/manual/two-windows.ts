import { execa } from 'execa'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

async function main() {
  const base = await mkdtemp(join(tmpdir(), 'cc-bridge-manual-'))
  const env = { ...process.env, CC_BRIDGE_HOME: base, CC_BRIDGE_FROM: 'manual-A' }

  console.log(`[manual] using temp base: ${base}`)
  const listener = execa('node', ['./dist/bin/cc-bridge.js', 'listen', 'default'], {
    env: { ...env, CC_BRIDGE_FROM: 'manual-B' },
    reject: false,
  })

  let received = ''
  listener.stdout?.on('data', (chunk: Buffer) => {
    received += chunk.toString('utf8')
    console.log(`[B received] ${chunk.toString('utf8').trim()}`)
  })

  await new Promise((r) => setTimeout(r, 500))

  for (const msg of ['hello', 'world', 'goodbye']) {
    const r = await execa(
      'node',
      ['./dist/bin/cc-bridge.js', 'send', '--room', 'default', msg],
      { env },
    )
    console.log(`[A sent] ${msg} (id ${r.stdout.trim()})`)
  }

  await new Promise((r) => setTimeout(r, 500))
  listener.kill('SIGINT')
  await listener

  const lines = received.split('\n').filter((l) => l.length > 0)
  const ok = lines.length === 3 && lines.every((l) => l.includes('"from":"manual-A"'))
  console.log(`[manual] result: ${ok ? 'PASS' : 'FAIL'} (received ${lines.length}/3)`)

  await rm(base, { recursive: true, force: true })
  process.exit(ok ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
