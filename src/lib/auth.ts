import type { SupabaseClient } from '@supabase/supabase-js'
import { clearCredentials } from './credentials.js'

export async function requestOtp(client: SupabaseClient, email: string): Promise<void> {
  const { error } = await client.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true },
  })
  if (error) throw new Error(`login request failed: ${error.message}`)
}

export async function verifyOtp(
  client: SupabaseClient,
  email: string,
  token: string,
): Promise<string> {
  const { data, error } = await client.auth.verifyOtp({ email, token, type: 'email' })
  if (error) throw new Error(`code verification failed: ${error.message}`)
  return data.user?.email ?? email
}

export async function logoutAndClear(client: SupabaseClient): Promise<void> {
  await client.auth.signOut().catch(() => undefined)
  clearCredentials()
}

export async function whoami(client: SupabaseClient): Promise<string | null> {
  const { data } = await client.auth.getUser()
  return data.user?.email ?? null
}
