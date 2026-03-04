'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, Suspense } from 'react'
import { createClient } from '@/lib/supabase/browser'
import { useRouter, useSearchParams } from 'next/navigation'
import styles from './page.module.css'

function LoginForm() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()

  useEffect(() => {
    const errorParam = searchParams.get('error')
    if (errorParam === 'callback') {
      setError('Authentication failed. Please try again.')
    }
  }, [searchParams])

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setSuccess(false)

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    })

    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      setSuccess(true)
      setLoading(false)
    }
  }

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.brandHeader}>
          <span className={styles.brandA}>Seller</span>
          <span className={styles.brandB}>Buddy</span>
        </div>
        <h1 className={styles.title}>Log in</h1>
        {success ? (
          <div className={styles.successMessage}>
            <p>Check your inbox for a login link.</p>
            <p className={styles.successSubtext}>
              We sent a login link to {email}. Click the link in your email to sign in.
            </p>
          </div>
        ) : (
          <form onSubmit={handleMagicLink} className={styles.form}>
            <div className={styles.inputGroup}>
              <label htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@email.com"
                required
                disabled={loading}
              />
            </div>
            <p className={styles.helperText}>We'll email you a magic link.</p>
            {error && <div className={styles.error}>{error}</div>}
            <button type="submit" disabled={loading} className={styles.button}>
              {loading ? 'Sending...' : 'Send magic link'}
            </button>
            <p className={styles.microcopy}>No password needed.</p>
          </form>
        )}
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className={styles.container}>
        <div className={styles.card}>
          <div className={styles.brandHeader}>
            <span className={styles.brandA}>Seller</span>
            <span className={styles.brandB}>Buddy</span>
          </div>
          <h1 className={styles.title}>Log in</h1>
        </div>
      </div>
    }>
      <LoginForm />
    </Suspense>
  )
}
