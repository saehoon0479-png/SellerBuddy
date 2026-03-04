import { createBrowserClient } from '@supabase/ssr'

let clientCache: ReturnType<typeof createBrowserClient> | null = null

export function createClient() {
  // Only create client in browser environment
  if (typeof window === 'undefined') {
    // Return a no-op client for SSR (shouldn't be used)
    return {
      auth: {
        getSession: async () => ({ data: { session: null }, error: null }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
        signOut: async () => ({ error: null }),
      },
    } as any
  }
  
  // Cache the client instance for browser
  if (!clientCache) {
    clientCache = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
  }
  
  return clientCache
}
