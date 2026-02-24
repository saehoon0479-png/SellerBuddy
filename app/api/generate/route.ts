import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase/service'
import { generateListing } from '@/lib/gemini/generate'

export const dynamic = 'force-dynamic'

interface GenerateRequest {
  description: string
  imageUrls?: string[]
  competitors?: string[]
}

export async function POST(request: NextRequest) {
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

    // Parse request body
    const body: GenerateRequest = await request.json()

    if (!body.description || typeof body.description !== 'string') {
      return NextResponse.json(
        { error: 'description is required' },
        { status: 400 }
      )
    }

    // Use service role client to query profiles
    const serviceClient = createServiceClient()
    const { data: profileData, error: profileError } = await serviceClient
      .schema('public')
      .from('profiles')
      .select('plan, generations_used')
      .eq('user_id', user.id)
      .maybeSingle()

    if (profileError) {
      return NextResponse.json(
        { error: profileError.message },
        { status: 500 }
      )
    }

    if (!profileData) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    // Enforce limits
    if (profileData.plan === 'free' && profileData.generations_used >= 1) {
      return NextResponse.json(
        { code: 'upgrade_required', message: 'Free plan limit reached.' },
        { status: 403 }
      )
    }

    if (profileData.plan === 'pro' && profileData.generations_used >= 50) {
      return NextResponse.json(
        { code: 'limit_reached', message: 'Monthly limit reached.' },
        { status: 403 }
      )
    }

    // Atomically increment generations_used and get updated profile
    const { data: updatedProfile, error: updateError } = await serviceClient
      .schema('public')
      .from('profiles')
      .update({ generations_used: profileData.generations_used + 1 })
      .eq('user_id', user.id)
      .select('plan, generations_used')
      .single()

    if (updateError || !updatedProfile) {
      return NextResponse.json(
        { error: updateError?.message || 'Failed to update profile' },
        { status: 500 }
      )
    }

    // Generate listing using Gemini
    let result
    try {
      result = await generateListing({
        description: body.description,
        competitorNotes: body.competitors || undefined,
        plan: updatedProfile.plan,
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      console.error('GEMINI_ERROR', {
        message: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
      })
      return NextResponse.json(
        { error: `Failed to generate listing: ${errorMessage}` },
        { status: 500 }
      )
    }

    // Validate response (additional check)
    if (!result.title || !Array.isArray(result.tags) || result.tags.length !== 13 || !result.description) {
      console.error('Invalid Gemini response:', result)
      return NextResponse.json(
        { error: 'Invalid generation result: missing required fields or incorrect tags count' },
        { status: 500 }
      )
    }

    // Insert generation record
    const { data: generation, error: insertError } = await serviceClient
      .schema('public')
      .from('generations')
      .insert([
        {
          user_id: user.id,
          description: body.description,
          image_urls: body.imageUrls || [],
          competitor_urls: body.competitors || [],
          result_json: result,
        },
      ])
      .select('id')
      .single()

    if (insertError || !generation) {
      return NextResponse.json(
        { error: insertError?.message || 'Failed to save generation' },
        { status: 500 }
      )
    }

    // Return success response
    return NextResponse.json({
      generationId: generation.id,
      profile: {
        plan: updatedProfile.plan,
        generations_used: updatedProfile.generations_used,
      },
      result: result,
    })
  } catch (error) {
    console.error('Error in /api/generate:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
