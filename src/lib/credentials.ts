import { readFileSync, writeFileSync, rmSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { resolveCredentialsFile } from './paths.js'

type Store = Record<string, string>

function read(path: string): Store {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as Store
  } catch {
    return {}
  }
}

function write(path: string, store: Store): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(store), { mode: 0o600 })
}

export interface FileStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export function createFileStorage(path: string = resolveCredentialsFile()): FileStorage {
  return {
    getItem(key) {
      return read(path)[key] ?? null
    },
    setItem(key, value) {
      const store = read(path)
      store[key] = value
      write(path, store)
    },
    removeItem(key) {
      const store = read(path)
      delete store[key]
      write(path, store)
    },
  }
}

export function clearCredentials(path: string = resolveCredentialsFile()): void {
  try {
    rmSync(path)
  } catch {
    // already gone
  }
}
