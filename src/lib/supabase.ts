import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js'
import { createFileStorage } from './credentials.js'

export function createBridgeClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      storage: createFileStorage(),
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  })
}

export async function isLoggedIn(client: SupabaseClient = createBridgeClient()): Promise<boolean> {
  const { data } = await client.auth.getSession()
  return data.session != null
}
