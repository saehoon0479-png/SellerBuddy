import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    // Verify secret only in production
    if (process.env.NODE_ENV === 'production') {
      const webhookSecret = process.env.POLAR_WEBHOOK_SECRET
      if (!webhookSecret) {
        return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 })
      }

      const headerSecret = request.headers.get('x-polar-webhook-secret')
      if (!headerSecret || headerSecret !== webhookSecret) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
    }

    // Parse JSON body once
    const event = await request.json()

    // Extract event type from different payload shapes
    const eventType = event.type || event.event

    if (!eventType) {
      return NextResponse.json({ error: 'Missing event type' }, { status: 400 })
    }

    const serviceClient = createServiceClient()

    // Log to billing_events BEFORE processing (best-effort, ignore failure)
    try {
      await serviceClient
        .schema('public')
        .from('billing_events')
        .insert({
          event_type: eventType,
          payload: event,
          user_id: null, // MVP: null is fine
        })
    } catch (logError) {
      console.warn('Failed to log billing event (non-critical):', logError)
    }

    // Extract customer email from different payload shapes
    const customerEmail = event.data?.customer?.email || event.data?.customer_email

    if (!customerEmail) {
      return NextResponse.json({ error: 'Missing customer email' }, { status: 400 })
    }

    console.log('POLAR EVENT:', eventType, 'for email:', customerEmail)

    // Handle payment success events
    if (eventType === 'order.paid' || eventType === 'subscription.created' || eventType === 'subscription.updated') {
      const now = new Date().toISOString()
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() // 30 days from now

      // Update profile by email
      const { error: updateError } = await serviceClient
        .schema('public')
        .from('profiles')
        .update({
          plan: 'pro',
          generations_used: 0,
          pro_cycle_start_at: now,
          pro_expires_at: expiresAt,
        })
        .eq('email', customerEmail)

      if (updateError) {
        console.error('Error updating profile plan:', updateError)
        return NextResponse.json({ error: 'Failed to update plan' }, { status: 500 })
      }
    }

    // Handle cancel events
    if (eventType === 'subscription.cancelled' || eventType === 'subscription.canceled') {
      const { error: updateError } = await serviceClient
        .schema('public')
        .from('profiles')
        .update({
          plan: 'free',
        })
        .eq('email', customerEmail)

      if (updateError) {
        console.error('Error downgrading profile:', updateError)
        return NextResponse.json({ error: 'Failed to downgrade plan' }, { status: 500 })
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
