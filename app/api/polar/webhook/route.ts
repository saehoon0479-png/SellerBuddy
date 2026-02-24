import { NextRequest, NextResponse } from 'next/server'
import { getServerClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    // Verify webhook secret
    const secret = request.headers.get('x-polar-signature')
    const expectedSecret = process.env.POLAR_WEBHOOK_SECRET

    if (!secret || secret !== expectedSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { event, data } = body

    // Handle subscription created/updated
    if (event === 'subscription.created' || event === 'subscription.updated') {
      const { customer_email, product_id } = data

      if (!customer_email) {
        return NextResponse.json({ error: 'Missing customer_email' }, { status: 400 })
      }

      const supabase = getServerClient()

      // Find user by email
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('id')
        .eq('email', customer_email)
        .single()

      if (userError || !userData) {
        console.error('User not found:', customer_email)
        return NextResponse.json({ error: 'User not found' }, { status: 404 })
      }

      // Update user plan to pro
      const { error: updateError } = await supabase
        .from('users')
        .update({
          plan: 'pro',
          last_reset_at: new Date().toISOString(),
        })
        .eq('id', userData.id)

      if (updateError) {
        console.error('Error updating user plan:', updateError)
        return NextResponse.json({ error: 'Failed to update plan' }, { status: 500 })
      }

      return NextResponse.json({ success: true })
    }

    // Handle subscription cancelled
    if (event === 'subscription.cancelled') {
      const { customer_email } = data

      if (!customer_email) {
        return NextResponse.json({ error: 'Missing customer_email' }, { status: 400 })
      }

      const supabase = getServerClient()

      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('id')
        .eq('email', customer_email)
        .single()

      if (userError || !userData) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 })
      }

      // Downgrade to free plan
      const { error: updateError } = await supabase
        .from('users')
        .update({
          plan: 'free',
        })
        .eq('id', userData.id)

      if (updateError) {
        console.error('Error downgrading user:', updateError)
        return NextResponse.json({ error: 'Failed to downgrade' }, { status: 500 })
      }

      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Polar webhook error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
