import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const next = requestUrl.searchParams.get('next') || '/'

  if (code) {
    const supabase = createClient()
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error && data.session) {
      // Redirect to home after successful authentication
      const response = NextResponse.redirect(new URL(next, request.url))
      return response
    }
  }

  // Redirect to login with error if callback fails
  return NextResponse.redirect(new URL('/login?error=callback', request.url))
}
