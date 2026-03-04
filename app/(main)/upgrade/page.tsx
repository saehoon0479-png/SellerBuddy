'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import PlanBadge from '@/components/PlanBadge/PlanBadge'
import { Profile } from '@/types'
import styles from './page.module.css'

export default function UpgradePage() {
  const [user, setUser] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [checkingOut, setCheckingOut] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const loadUser = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (!session) {
        router.push('/login')
        return
      }

      // Load profile from /api/me
      try {
        const response = await fetch('/api/me', {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
          },
        })

        if (!response.ok) {
          router.push('/login')
          return
        }

        const data = await response.json()
        if (data.profile) {
          setUser(data.profile as Profile)
        }
      } catch (error) {
        console.error('Error loading profile:', error)
        router.push('/login')
      } finally {
        setLoading(false)
      }
    }

    loadUser()

    // Check for success parameter and refresh profile
    const urlParams = new URLSearchParams(window.location.search)
    if (urlParams.get('success') === 'true') {
      // Refresh profile after successful checkout
      const refreshProfile = async () => {
        const {
          data: { session },
        } = await supabase.auth.getSession()

        if (session) {
          const response = await fetch('/api/me', {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${session.access_token}`,
            },
          })

          if (response.ok) {
            const data = await response.json()
            if (data.profile) {
              setUser(data.profile as Profile)
            }
          }
        }
      }

      refreshProfile()
    }
  }, [router, supabase])

  const handleUpgrade = async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session) {
      router.push('/login')
      return
    }

    setCheckingOut(true)

    try {
      const response = await fetch('/api/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
      })

      const data = await response.json()

      if (!response.ok) {
        alert(data.error || 'Failed to create checkout link.')
        setCheckingOut(false)
        return
      }

      // Redirect to checkout URL immediately
      if (data.url) {
        window.location.href = data.url
      } else {
        alert('Unable to retrieve checkout link.')
        setCheckingOut(false)
      }
    } catch (error) {
      console.error('Error creating checkout:', error)
      alert('An error occurred while creating the checkout link.')
      setCheckingOut(false)
    }
  }

  if (loading || !user) {
    return null
  }

  if (user.plan === 'pro') {
    return (
      <div className={styles.container}>
        <div className={styles.card}>
          <div className={styles.brandHeader}>
            <span className={styles.brandA}>Seller</span>
            <span className={styles.brandB}>Buddy</span>
          </div>
          <h1 className={styles.title}>Already on Pro</h1>
          <p className={styles.description}>
            You're currently on the Pro plan. Contact us if you need additional features.
          </p>
          <a href="/" className={styles.backLink}>
            ← Back to app
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.brandHeader}>
          <span className={styles.brandA}>Seller</span>
          <span className={styles.brandB}>Buddy</span>
        </div>
        <h1 className={styles.title}>Upgrade to Pro</h1>
        <p className={styles.description}>
          Unlock more generations, more competitor analysis, and faster workflows.
        </p>

        <div className={styles.currentPlan}>
          <span>Current plan:</span>
          <PlanBadge plan={user.plan} />
        </div>

        <div className={styles.features}>
          <h2 className={styles.featuresTitle}>Pro plan benefits</h2>
          <div className={styles.featureList}>
            <div className={styles.feature}>
              <span className={styles.checkmark}>✓</span>
              <div>
                <strong>Upload up to 3 images</strong>
                <p>FREE: 1 image</p>
              </div>
            </div>
            <div className={styles.feature}>
              <span className={styles.checkmark}>✓</span>
              <div>
                <strong>Analyze up to 3 competitors</strong>
                <p>FREE: 1 competitor</p>
              </div>
            </div>
            <div className={styles.feature}>
              <span className={styles.checkmark}>✓</span>
              <div>
                <strong>Up to 50 generations / month</strong>
                <p>FREE: 1 generation (lifetime)</p>
              </div>
            </div>
            <div className={styles.feature}>
              <span className={styles.checkmark}>✓</span>
              <div>
                <strong>Competitor positioning insights</strong>
                <p>Market positioning and differentiation strategy analysis</p>
              </div>
            </div>
            <div className={styles.feature}>
              <span className={styles.checkmark}>✓</span>
              <div>
                <strong>Advanced strategy recommendations</strong>
                <p>USP, positioning, pricing suggestions, and more</p>
              </div>
            </div>
          </div>
        </div>

        <button 
          onClick={handleUpgrade} 
          className={styles.upgradeButton}
          disabled={checkingOut}
        >
          {checkingOut ? (
            <>
              <span className={styles.spinner}></span>
              Processing...
            </>
          ) : (
            'Upgrade to Pro'
          )}
        </button>

        <a href="/" className={styles.backLink}>
          ← Back to app
        </a>
      </div>
    </div>
  )
}
