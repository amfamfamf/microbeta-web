export const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL ?? '').replace(/\/$/, '')
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY ?? ''
export const API_URL = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '')

export const isConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY && API_URL)

/** Site root (origin + Vite base), without the hash. Used for OAuth redirect and share links. */
export function siteRoot(): string {
  return window.location.origin + import.meta.env.BASE_URL
}

export const MAX_SECONDS = 60
export const MAX_BYTES = 200 * 1024 * 1024
