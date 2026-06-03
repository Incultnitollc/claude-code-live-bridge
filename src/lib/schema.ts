import { ulid } from 'ulid'
import { z } from 'zod'

export const SCHEMA_VERSION = 1 as const

const ROOM_NAME_RE = /^[a-zA-Z0-9_.-]{1,64}$/
const ULID_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/

export const MessageSchema = z
  .object({
    v: z.literal(SCHEMA_VERSION),
    id: z.string().regex(ULID_RE),
    ts: z.string().datetime(),
    room: z.string().regex(ROOM_NAME_RE),
    from: z.string().min(1).max(64).regex(/^[a-zA-Z0-9._-]+$/),
    msg: z.string().min(1).max(64_000),
    to: z.string().min(1).max(64).regex(/^[a-zA-Z0-9._-]+$/).optional(),
    reply_to: z.string().regex(ULID_RE).optional(),
    kind: z.enum(['text', 'event']).default('text'),
  })
  .passthrough()

export type Message = z.infer<typeof MessageSchema>

export type ParseResult =
  | { ok: true; value: Message }
  | { ok: false; reason: 'malformed' | 'unknown_version' | 'invalid'; error: string }

export function parseMessage(line: string): ParseResult {
  let raw: unknown
  try {
    raw = JSON.parse(line)
  } catch (e) {
    return { ok: false, reason: 'malformed', error: (e as Error).message }
  }
  if (
    raw &&
    typeof raw === 'object' &&
    'v' in raw &&
    typeof (raw as { v: unknown }).v === 'number' &&
    (raw as { v: number }).v > SCHEMA_VERSION
  ) {
    return {
      ok: false,
      reason: 'unknown_version',
      error: `unknown schema version ${(raw as { v: number }).v}`,
    }
  }
  const result = MessageSchema.safeParse(raw)
  if (!result.success) {
    return { ok: false, reason: 'invalid', error: result.error.message }
  }
  return { ok: true, value: result.data }
}

export interface BuildMessageInput {
  from: string
  room: string
  msg: string
  to?: string
  reply_to?: string
  kind?: 'text' | 'event'
}

export function buildMessage(input: BuildMessageInput): Message {
  const candidate = {
    v: SCHEMA_VERSION,
    id: ulid(),
    ts: new Date().toISOString(),
    room: input.room,
    from: input.from,
    msg: input.msg,
    ...(input.to !== undefined ? { to: input.to } : {}),
    ...(input.reply_to !== undefined ? { reply_to: input.reply_to } : {}),
    kind: input.kind ?? 'text',
  }
  const result = MessageSchema.safeParse(candidate)
  if (!result.success) {
    throw new Error(`invalid message: ${result.error.message}`)
  }
  return result.data
}

export function serializeMessage(m: Message): string {
  return JSON.stringify(m)
}
