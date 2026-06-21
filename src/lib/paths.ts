import { homedir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { lstat, mkdir, open } from 'node:fs/promises'
import { constants as fsc } from 'node:fs'

const ROOM_NAME_RE = /^[a-zA-Z0-9_.-]{1,64}$/

export function resolveBaseDir(): string {
  const fromEnv = process.env.CC_BRIDGE_HOME
  if (fromEnv && fromEnv.length > 0) return fromEnv
  return join(homedir(), '.cc-bridge')
}

export function isValidRoomName(room: string): boolean {
  return ROOM_NAME_RE.test(room)
}

export function resolveRoomFile(room: string): string {
  if (!isValidRoomName(room)) {
    throw new Error(
      `invalid room name (allowed: a-z, A-Z, 0-9, dot, underscore, hyphen, max 64): ${JSON.stringify(room)}`,
    )
  }
  const base = resolveBaseDir()
  const roomsDir = join(base, 'rooms')
  const resolved = resolve(roomsDir, `${room}.jsonl`)
  const expectedPrefix = resolve(roomsDir) + sep
  if (!(resolved + sep).startsWith(expectedPrefix) && resolved !== resolve(roomsDir, `${room}.jsonl`)) {
    throw new Error(`room path escapes rooms dir: ${resolved}`)
  }
  return resolved
}

export function resolveSessionFile(ppid: number): string {
  return join(resolveBaseDir(), 'sessions', `${ppid}.id`)
}

export function resolveCredentialsFile(): string {
  return join(resolveBaseDir(), 'credentials.json')
}

export function resolveOffsetFile(room: string, sessionId: string): string {
  if (!isValidRoomName(room)) {
    throw new Error(`invalid room name: ${room}`)
  }
  if (!/^[a-zA-Z0-9._-]+$/.test(sessionId)) {
    throw new Error(`invalid session id: ${sessionId}`)
  }
  return join(resolveBaseDir(), 'state', `${room}-${sessionId}.offset`)
}

export async function ensureBaseDir(): Promise<string> {
  const base = resolveBaseDir()
  await mkdir(base, { recursive: true, mode: 0o700 })
  await mkdir(join(base, 'rooms'), { recursive: true, mode: 0o700 })
  await mkdir(join(base, 'sessions'), { recursive: true, mode: 0o700 })
  await mkdir(join(base, 'state'), { recursive: true, mode: 0o700 })
  return base
}

export async function ensureRoomFile(room: string): Promise<string> {
  await ensureBaseDir()
  const p = resolveRoomFile(room)
  let exists = false
  try {
    await lstat(p)
    exists = true
  } catch {
    exists = false
  }
  if (!exists) {
    const fh = await open(p, fsc.O_CREAT | fsc.O_WRONLY | fsc.O_APPEND, 0o600)
    await fh.close()
  } else {
    await refuseSymlink(p)
  }
  return p
}

export async function refuseSymlink(p: string): Promise<void> {
  const s = await lstat(p)
  if (s.isSymbolicLink()) {
    throw new Error(`refusing to open symlink: ${p}`)
  }
}
