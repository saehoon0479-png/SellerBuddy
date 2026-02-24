import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import crypto from 'crypto'

export const dynamic = 'force-dynamic'

function verifySignature(body: string, signature: string, secret: string): boolean {
  try {
    const hmac = crypto.createHmac('sha256', secret)
    const digest = hmac.update(body).digest('hex')
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest))
  } catch (error) {
    return false
  }
}

export async function POST(request: NextRequest) {
  try {
    // Read raw request body
    const body = await request.text()
    
    // Get webhook secret
    const webhookSecret = process.env.POLAR_WEBHOOK_SECRET
    if (!webhookSecret) {
      return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 })
    }

    // Verify signature
    const signature = request.headers.get('x-polar-signature')
    if (!signature) {
      return NextResponse.json({ error: 'Missing signature' }, { status: 401 })
    }

    if (!verifySignature(body, signature, webhookSecret)) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }

    // Parse event
    const event = JSON.parse(body)

    // Log event type
    console.log('POLAR EVENT:', event.type)

    // Handle order.paid event
    if (event.type === 'order.paid') {
      // Extract user_id from metadata
      const metadata = event.data?.metadata || {}
      const userId = metadata.user_id

      if (!userId) {
        return NextResponse.json({ error: 'Missing user_id in metadata' }, { status: 400 })
      }

      // Update profile using service role client
      const serviceClient = createServiceClient()
      const { error: updateError } = await serviceClient
        .schema('public')
        .from('profiles')
        .update({ plan: 'pro' })
        .eq('user_id', userId)

      if (updateError) {
        console.error('Error updating profile plan:', updateError)
        return NextResponse.json({ error: 'Failed to update plan' }, { status: 500 })
      }
    }

    // Return 200 immediately
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Polar webhook error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
