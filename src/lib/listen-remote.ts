import type { SupabaseClient } from '@supabase/supabase-js'
import { createQueue } from './async-queue.js'
import { rowToMessage, type MessageRow } from './message-row.js'
import { serializeMessage } from './schema.js'
import type { ListenController, ListenEvent, ListenOptions } from './listen.js'

export function listenRemote(opts: ListenOptions, client: SupabaseClient): ListenController {
  const seen = new Set<string>()
  let channel: ReturnType<SupabaseClient['channel']> | null = null

  const queue = createQueue<ListenEvent>(async () => {
    if (channel) await client.removeChannel(channel)
  })

  function emitRow(row: MessageRow): void {
    if (seen.has(row.id)) return
    seen.add(row.id)
    try {
      queue.emit({ ok: true, line: serializeMessage(rowToMessage(row)) })
    } catch {
      queue.emit({ ok: false, reason: 'invalid', raw: JSON.stringify(row).slice(0, 200) })
    }
  }

  channel = client
    .channel(`room:${opts.room}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages', filter: `room=eq.${opts.room}` },
      (payload: { new: MessageRow }) => emitRow(payload.new),
    )
    .subscribe()

  const replay = opts.replayLastN ?? 0
  if (replay > 0) {
    void (async () => {
      const { data, error } = await client
        .from('messages')
        .select('*')
        .eq('room', opts.room)
        .order('id', { ascending: false })
        .limit(replay)
      if (error || !data) return
      for (const row of (data as MessageRow[]).reverse()) emitRow(row)
    })()
  }

  return {
    iterator: queue.iterator,
    close: async () => {
      await queue.close()
    },
  }
}
