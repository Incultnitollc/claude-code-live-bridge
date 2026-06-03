import { readFile } from 'node:fs/promises'
import { parseMessage } from './schema.js'

export interface ValidationError {
  lineNumber: number
  reason: string
  detail: string
}

export interface ValidationResult {
  ok: boolean
  validLines: number
  errors: ValidationError[]
}

export async function validateFile(path: string): Promise<ValidationResult> {
  const content = await readFile(path, 'utf8')
  const lines = content.split('\n')
  const errors: ValidationError[] = []
  let valid = 0
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]!
    if (line.length === 0) continue
    const parsed = parseMessage(line)
    if (parsed.ok) {
      valid += 1
    } else {
      errors.push({ lineNumber: i + 1, reason: parsed.reason, detail: parsed.error })
    }
  }
  return { ok: errors.length === 0, validLines: valid, errors }
}
