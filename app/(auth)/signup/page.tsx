'use client'

export const dynamic = 'force-dynamic'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import styles from './page.module.css'

export default function SignupPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const router = useRouter()
  const supabase = createClient()

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
        <h1 className={styles.title}>SellerBuddy 회원가입</h1>
        {success ? (
          <div className={styles.successMessage}>
            <p>이메일을 확인해주세요!</p>
            <p className={styles.successSubtext}>
              {email}로 로그인 링크를 보냈습니다. 이메일의 링크를 클릭하여 계정을 활성화하세요.
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
        <p className={styles.linkText}>
          이미 계정이 있으신가요?{' '}
          <a href="/login" className={styles.link}>
            로그인
          </a>
        </p>
      </div>
    </div>
  )
}
