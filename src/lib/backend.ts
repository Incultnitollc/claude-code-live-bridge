import { isLoggedIn as realIsLoggedIn } from './supabase.js'

export type Backend = 'cloud' | 'local'

export async function resolveBackend(
  opts: { local?: boolean | undefined },
  deps: { isLoggedIn: () => Promise<boolean> } = { isLoggedIn: () => realIsLoggedIn() },
): Promise<Backend> {
  if (opts.local) return 'local'
  if (process.env.CC_BRIDGE_LOCAL && process.env.CC_BRIDGE_LOCAL.length > 0) return 'local'
  return (await deps.isLoggedIn()) ? 'cloud' : 'local'
}
