import { expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { sendRemote } from '../../src/lib/send-remote.js'

function fakeClient(
  captured: { table?: string; row?: unknown },
  error: { message: string } | null = null,
) {
  return {
    from(table: string) {
      captured.table = table
      return {
        async insert(row: unknown) {
          captured.row = row
          return { error }
        },
      }
    },
  } as unknown as SupabaseClient
}

it('inserts a mapped row into messages and returns the Message', async () => {
  const captured: { table?: string; row?: Record<string, unknown> } = {}
  const m = await sendRemote({ from: 'A', room: 'demo', msg: 'hi', to: 'B' }, fakeClient(captured))
  expect(captured.table).toBe('messages')
  expect(captured.row?.sender).toBe('A')
  expect(captured.row?.recipient).toBe('B')
  expect(m.id).toBe(captured.row?.id)
})

it('throws when insert returns an error', async () => {
  const client = fakeClient({}, { message: 'rls denied' })
  await expect(sendRemote({ from: 'A', room: 'demo', msg: 'hi' }, client)).rejects.toThrow(
    /rls denied/,
  )
})
