import { expect, it } from 'vitest'
import { buildMessage } from '../../src/lib/schema.js'
import { messageToRow, rowToMessage } from '../../src/lib/message-row.js'

it('maps from→sender, to→recipient and round-trips', () => {
  const m = buildMessage({ from: 'A', room: 'demo', msg: 'hi', to: 'B', kind: 'text' })
  const row = messageToRow(m)
  expect(row.sender).toBe('A')
  expect(row.recipient).toBe('B')
  expect(row.id).toBe(m.id)
  const back = rowToMessage(row)
  expect(back).toEqual(m)
})

it('handles absent to/reply_to as null and back to undefined', () => {
  const m = buildMessage({ from: 'A', room: 'demo', msg: 'hi' })
  const row = messageToRow(m)
  expect(row.recipient).toBeNull()
  expect(row.reply_to).toBeNull()
  const back = rowToMessage(row)
  expect(back.to).toBeUndefined()
  expect(back.reply_to).toBeUndefined()
})

it('rejects a malformed row', () => {
  const bad = {
    id: 'x',
    v: 1,
    ts: 'nope',
    room: 'demo',
    sender: 'A',
    recipient: null,
    reply_to: null,
    kind: 'text',
    msg: 'hi',
  }
  expect(() => rowToMessage(bad as never)).toThrow(/invalid row/)
})
