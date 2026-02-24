import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  // One-time console.log to verify Supabase URL
  if (typeof window !== 'undefined') {
    console.log('SUPABASE URL:', process.env.NEXT_PUBLIC_SUPABASE_URL)
  }
  
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
