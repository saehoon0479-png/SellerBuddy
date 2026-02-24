import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase/service'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    // Read Authorization header
    const authHeader = request.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const token = authHeader.substring(7)

    // Verify token using Supabase client
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
    
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(token)

    if (userError || !user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    // Use service role client to query profiles
    const serviceClient = createServiceClient()
    const { data: profileData, error: profileError } = await serviceClient
      .schema('public')
      .from('profiles')
      .select('user_id, email, plan, generations_used')
      .eq('user_id', user.id)
      .maybeSingle()

    // If profile doesn't exist, create it
    if (!profileData && !profileError) {
      const { data: newProfile, error: upsertError } = await serviceClient
        .schema('public')
        .from('profiles')
        .upsert(
          {
            user_id: user.id,
            email: user.email!,
            plan: 'free',
            generations_used: 0,
          },
          {
            onConflict: 'user_id',
          }
        )
        .select('user_id, email, plan, generations_used')
        .single()

      if (upsertError || !newProfile) {
        return NextResponse.json(
          { error: upsertError?.message || 'Failed to create profile' },
          { status: 500 }
        )
      }

      return NextResponse.json({ profile: newProfile })
    }

    if (profileError) {
      return NextResponse.json(
        { error: profileError.message },
        { status: 500 }
      )
    }

    if (!profileData) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    return NextResponse.json({ profile: profileData })
  } catch (error) {
    console.error('Error in /api/me:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
