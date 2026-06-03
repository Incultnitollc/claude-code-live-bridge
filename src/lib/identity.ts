import { hostname } from 'node:os'
import { readFile, writeFile } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import { ensureBaseDir, resolveSessionFile } from './paths.js'

const SESSION_ID_RE = /^[a-zA-Z0-9._-]+$/

let cached: string | null = null

export function resetSessionIdCache(): void {
  cached = null
}

export async function getSessionId(): Promise<string> {
  const fromEnv = process.env.CC_BRIDGE_FROM
  if (fromEnv && fromEnv.length > 0) {
    if (!SESSION_ID_RE.test(fromEnv) || fromEnv.length > 64) {
      throw new Error(
        `invalid CC_BRIDGE_FROM (allowed: a-z, A-Z, 0-9, dot, underscore, hyphen, max 64): ${JSON.stringify(fromEnv)}`,
      )
    }
    return fromEnv
  }
  if (cached) return cached

  await ensureBaseDir()
  const ppid = process.ppid
  const cachePath = resolveSessionFile(ppid)
  try {
    const existing = (await readFile(cachePath, 'utf8')).trim()
    if (SESSION_ID_RE.test(existing) && existing.length <= 64) {
      cached = existing
      return existing
    }
  } catch {
    // not cached yet
  }

  const host = hostname().toLowerCase().replace(/[^a-z0-9.-]/g, '').slice(0, 16) || 'host'
  const rand = randomBytes(4).toString('hex')
  const id = `${host}-${ppid}-${rand}`
  await writeFile(cachePath, `${id}\n`, { mode: 0o600 })
  cached = id
  return id
}
