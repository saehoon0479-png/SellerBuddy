'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/browser'
import { useRouter, useSearchParams } from 'next/navigation'
import styles from './page.module.css'

export default function LoginPage() {
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
      setError('인증에 실패했습니다. 다시 시도해주세요.')
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
        <h1 className={styles.title}>SellerBuddy 로그인</h1>
        {success ? (
          <div className={styles.successMessage}>
            <p>이메일을 확인해주세요!</p>
            <p className={styles.successSubtext}>
              {email}로 로그인 링크를 보냈습니다. 이메일의 링크를 클릭하여 로그인하세요.
            </p>
          </div>
        ) : (
          <form onSubmit={handleMagicLink} className={styles.form}>
            <div className={styles.inputGroup}>
              <label htmlFor="email">이메일</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                required
                disabled={loading}
              />
            </div>
            {error && <div className={styles.error}>{error}</div>}
            <button type="submit" disabled={loading} className={styles.button}>
              {loading ? '전송 중...' : '매직 링크 보내기'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
