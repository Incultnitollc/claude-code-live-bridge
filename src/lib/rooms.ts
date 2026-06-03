import { readdir, stat, truncate, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { ensureBaseDir, resolveBaseDir, resolveRoomFile } from './paths.js'

export interface RoomInfo {
  name: string
  sizeBytes: number
  mtime: Date
}

export async function listRooms(): Promise<RoomInfo[]> {
  await ensureBaseDir()
  const roomsDir = join(resolveBaseDir(), 'rooms')
  let entries: string[]
  try {
    entries = await readdir(roomsDir)
  } catch {
    return []
  }
  const out: RoomInfo[] = []
  for (const entry of entries) {
    if (!entry.endsWith('.jsonl')) continue
    const name = entry.slice(0, -'.jsonl'.length)
    const path = join(roomsDir, entry)
    try {
      const s = await stat(path)
      if (!s.isFile()) continue
      out.push({ name, sizeBytes: s.size, mtime: s.mtime })
    } catch {
      // skip unreadable
    }
  }
  return out
}

export async function clearRoom(room: string): Promise<void> {
  const path = resolveRoomFile(room)
  await stat(path)
  await truncate(path, 0)
}

export async function reapStaleSessions(): Promise<number> {
  await ensureBaseDir()
  const sessDir = join(resolveBaseDir(), 'sessions')
  let entries: string[]
  try {
    entries = await readdir(sessDir)
  } catch {
    return 0
  }
  let reaped = 0
  for (const entry of entries) {
    const m = entry.match(/^(\d+)\.id$/)
    if (!m || !m[1]) continue
    const ppid = Number(m[1])
    if (!Number.isFinite(ppid) || ppid <= 0) {
      try {
        await unlink(join(sessDir, entry))
        reaped += 1
      } catch {
        // ignore
      }
      continue
    }
    let alive = false
    try {
      process.kill(ppid, 0)
      alive = true
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'EPERM') alive = true
    }
    if (!alive) {
      try {
        await unlink(join(sessDir, entry))
        reaped += 1
      } catch {
        // ignore
      }
    }
  }
  return reaped
}
