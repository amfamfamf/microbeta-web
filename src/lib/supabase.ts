import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { SUPABASE_ANON_KEY, SUPABASE_URL, isConfigured } from './env'

// PKCE puts `?code=` in the query string, so it does not clash with HashRouter's `#/…`.
export const supabase: SupabaseClient | null = isConfigured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { flowType: 'pkce', detectSessionInUrl: true, persistSession: true },
    })
  : null

export function requireSupabase(): SupabaseClient {
  if (!supabase) throw new Error('The app is not set up yet (missing Supabase settings).')
  return supabase
}

/** Strip a leading "bucket/" from a stored path, in case the backend stores it with the bucket name. */
export function objectPath(path: string, bucket: string): string {
  const p = path.replace(/^\/+/, '')
  return p.startsWith(bucket + '/') ? p.slice(bucket.length + 1) : p
}
