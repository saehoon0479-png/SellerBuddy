import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll()
          },
          setAll(cookiesToSet: { name: string; value: string; options?: any }[]) {
            // Cookies are set via response headers
          },
        },
      }
    )

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      console.log('[api/me] No user:', userError?.message || 'No user found')
      const response = NextResponse.json(
        { code: 'AUTH_REQUIRED', error: 'Unauthorized' },
        { status: 401 }
      )
      response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
      return response
    }

    console.log('[api/me] User:', { id: user.id, email: user.email })

    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('user_id, email, plan, generations_used')
      .eq('user_id', user.id)
      .single()

    if (profileError || !profileData) {
      console.log('[api/me] Profile error or missing:', profileError?.message || 'No profile data')
      const response = NextResponse.json(
        {
          user: { id: user.id, email: user.email },
          plan: 'free',
          profile_missing: true,
        },
        { status: 200 }
      )
      response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
      return response
    }

    const plan = profileData.plan as 'free' | 'pro'
    console.log('[api/me] Fetched plan:', plan)

    const response = NextResponse.json({
      user: { id: user.id, email: user.email },
      plan: plan,
      profile: profileData,
    })
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
    response.headers.set('Pragma', 'no-cache')
    response.headers.set('Expires', '0')
    return response
  } catch (error) {
    console.error('[api/me] Error:', error)
    const response = NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
    return response
  }
}
