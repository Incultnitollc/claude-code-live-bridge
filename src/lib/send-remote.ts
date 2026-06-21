import type { SupabaseClient } from '@supabase/supabase-js'
import { buildMessage, type BuildMessageInput, type Message } from './schema.js'
import { messageToRow } from './message-row.js'

export async function sendRemote(
  input: BuildMessageInput,
  client: SupabaseClient,
): Promise<Message> {
  const message = buildMessage(input)
  const { error } = await client.from('messages').insert(messageToRow(message))
  if (error) {
    throw new Error(`cloud send failed: ${error.message}`)
  }
  return message
}
