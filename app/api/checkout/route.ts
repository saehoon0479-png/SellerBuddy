import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Polar } from '@polar-sh/sdk'

export const dynamic = 'force-dynamic'

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

    // Initialize Polar SDK
    const polar = new Polar({
      accessToken: process.env.POLAR_ACCESS_TOKEN!,
    })

    if (!process.env.POLAR_ACCESS_TOKEN) {
      return NextResponse.json(
        { error: 'POLAR_ACCESS_TOKEN is not configured' },
        { status: 500 }
      )
    }

    if (!process.env.POLAR_PRODUCT_ID) {
      return NextResponse.json(
        { error: 'POLAR_PRODUCT_ID is not configured' },
        { status: 500 }
      )
    }

    // Create checkout link
    const checkoutLink = await polar.checkouts.create({
      productId: process.env.POLAR_PRODUCT_ID,
      successUrl: process.env.POLAR_SUCCESS_URL || `${request.nextUrl.origin}/upgrade?success=true`,
      cancelUrl: process.env.POLAR_CANCEL_URL || `${request.nextUrl.origin}/upgrade?canceled=true`,
      metadata: {
        user_id: user.id,
      },
    })

    if (!checkoutLink.url) {
      return NextResponse.json(
        { error: 'Failed to create checkout link' },
        { status: 500 }
      )
    }

    return NextResponse.json({ url: checkoutLink.url })
  } catch (error) {
    console.error('Error in /api/checkout:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
