import { MessageSchema, type Message } from './schema.js'

export interface MessageRow {
  id: string
  v: number
  ts: string
  room: string
  sender: string
  recipient: string | null
  reply_to: string | null
  kind: 'text' | 'event'
  msg: string
}

export function messageToRow(m: Message): MessageRow {
  return {
    id: m.id,
    v: m.v,
    ts: m.ts,
    room: m.room,
    sender: m.from,
    recipient: m.to ?? null,
    reply_to: m.reply_to ?? null,
    kind: m.kind,
    msg: m.msg,
  }
}

export function rowToMessage(row: MessageRow): Message {
  const candidate = {
    v: row.v,
    id: row.id,
    ts: row.ts,
    room: row.room,
    from: row.sender,
    msg: row.msg,
    ...(row.recipient !== null ? { to: row.recipient } : {}),
    ...(row.reply_to !== null ? { reply_to: row.reply_to } : {}),
    kind: row.kind,
  }
  const result = MessageSchema.safeParse(candidate)
  if (!result.success) {
    throw new Error(`invalid row → message: ${result.error.message}`)
  }
  return result.data
}
