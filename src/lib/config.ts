export const SUPABASE_URL =
  process.env.CC_BRIDGE_SUPABASE_URL ?? 'https://lyktygwrmhfdxqoqzdxb.supabase.co'

// anon/publishable key — public by design; access is gated by user JWT + RLS.
export const SUPABASE_ANON_KEY =
  process.env.CC_BRIDGE_SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx5a3R5Z3dybWhmZHhxb3F6ZHhiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE5ODg4NDQsImV4cCI6MjA5NzU2NDg0NH0.8Vjq2a98qKuoHkHlr_qwGJ5UgJtJviXOQU1WdgClgqc'
