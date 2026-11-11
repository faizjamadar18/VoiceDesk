import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL?.trim() || 'https://mock.supabase.co'
const supabaseKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ||
  import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ||
  'mock-anon-key'

export const isSupabaseConfigured = (): boolean => {
  return (
    Boolean(import.meta.env.VITE_SUPABASE_URL?.trim()) &&
    Boolean(
      import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ||
        import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()
    )
  )
}

export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false
  }
})

