import { describe, expect, test } from 'vitest'
import { parseMessage, buildMessage, SCHEMA_VERSION } from '../../src/lib/schema.js'

describe('schema', () => {
  test('SCHEMA_VERSION is 1', () => {
    expect(SCHEMA_VERSION).toBe(1)
  })

  test('valid message parses', () => {
    const raw = {
      v: 1,
      id: '01HZZZZZZZZZZZZZZZZZZZZZZZ',
      ts: '2026-06-02T12:00:00.000Z',
      room: 'default',
      from: 'host-1234-abc12345',
      msg: 'hello',
    }
    const result = parseMessage(JSON.stringify(raw))
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.msg).toBe('hello')
      expect(result.value.kind).toBe('text')
    }
  })

  test('missing required field fails', () => {
    const raw = { v: 1, id: '01HZZZZZZZZZZZZZZZZZZZZZZZ', ts: '2026-06-02T12:00:00.000Z' }
    const result = parseMessage(JSON.stringify(raw))
    expect(result.ok).toBe(false)
  })

  test('unknown fields are preserved on parse', () => {
    const raw = {
      v: 1,
      id: '01HZZZZZZZZZZZZZZZZZZZZZZZ',
      ts: '2026-06-02T12:00:00.000Z',
      room: 'default',
      from: 'host-1234-abc12345',
      msg: 'hi',
      custom_field: 'preserved',
    }
    const result = parseMessage(JSON.stringify(raw))
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect((result.value as Record<string, unknown>).custom_field).toBe('preserved')
    }
  })

  test('invalid ulid rejected', () => {
    const raw = {
      v: 1,
      id: 'not-a-ulid',
      ts: '2026-06-02T12:00:00.000Z',
      room: 'default',
      from: 'host-1234-abc12345',
      msg: 'hi',
    }
    const result = parseMessage(JSON.stringify(raw))
    expect(result.ok).toBe(false)
  })

  test('non-ISO ts rejected', () => {
    const raw = {
      v: 1,
      id: '01HZZZZZZZZZZZZZZZZZZZZZZZ',
      ts: 'yesterday',
      room: 'default',
      from: 'host-1234-abc12345',
      msg: 'hi',
    }
    const result = parseMessage(JSON.stringify(raw))
    expect(result.ok).toBe(false)
  })

  test('msg over 64KB rejected', () => {
    const raw = {
      v: 1,
      id: '01HZZZZZZZZZZZZZZZZZZZZZZZ',
      ts: '2026-06-02T12:00:00.000Z',
      room: 'default',
      from: 'host-1234-abc12345',
      msg: 'x'.repeat(64_001),
    }
    const result = parseMessage(JSON.stringify(raw))
    expect(result.ok).toBe(false)
  })

  test('buildMessage creates valid message with defaults', () => {
    const m = buildMessage({ from: 'me', room: 'default', msg: 'hi' })
    expect(m.v).toBe(1)
    expect(m.id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/)
    expect(m.ts).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/)
    expect(m.kind).toBe('text')
    expect(m.to).toBeUndefined()
  })

  test('buildMessage rejects empty msg', () => {
    expect(() => buildMessage({ from: 'me', room: 'default', msg: '' })).toThrow()
  })

  test('buildMessage rejects oversize msg', () => {
    expect(() =>
      buildMessage({ from: 'me', room: 'default', msg: 'x'.repeat(64_001) }),
    ).toThrow()
  })

  test('buildMessage rejects invalid room name', () => {
    expect(() => buildMessage({ from: 'me', room: '../etc', msg: 'hi' })).toThrow()
  })

  test('buildMessage rejects invalid from', () => {
    expect(() => buildMessage({ from: '', room: 'default', msg: 'hi' })).toThrow()
  })

  test('schema version > 1 returns special error', () => {
    const raw = {
      v: 2,
      id: '01HZZZZZZZZZZZZZZZZZZZZZZZ',
      ts: '2026-06-02T12:00:00.000Z',
      room: 'default',
      from: 'host-1234-abc12345',
      msg: 'hi',
    }
    const result = parseMessage(JSON.stringify(raw))
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe('unknown_version')
    }
  })

  test('malformed JSON returns parse error', () => {
    const result = parseMessage('{not json')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe('malformed')
    }
  })

  test('room name allows alphanum, dot, underscore, hyphen', () => {
    const valid = ['default', 'planning.v2', 'team_alpha', 'room-1']
    for (const room of valid) {
      const m = buildMessage({ from: 'me', room, msg: 'hi' })
      expect(m.room).toBe(room)
    }
  })

  test('room name rejects traversal attempts', () => {
    const bad = ['../foo', './foo', '/abs', 'foo/bar', 'foo bar', '']
    for (const room of bad) {
      expect(() => buildMessage({ from: 'me', room, msg: 'hi' })).toThrow()
    }
  })
})
