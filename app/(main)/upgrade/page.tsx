'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import PlanBadge from '@/components/PlanBadge/PlanBadge'
import { User } from '@/types'
import styles from './page.module.css'

export default function UpgradePage() {
  const [user, setUser] = useState<User | null>(null)
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
          setUser(data.profile as User)
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
              setUser(data.profile as User)
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
        alert(data.error || '결제 링크 생성에 실패했습니다.')
        setCheckingOut(false)
        return
      }

      // Redirect to checkout URL
      if (data.url) {
        window.location.href = data.url
      } else {
        alert('결제 링크를 받을 수 없습니다.')
        setCheckingOut(false)
      }
    } catch (error) {
      console.error('Error creating checkout:', error)
      alert('결제 링크 생성 중 오류가 발생했습니다.')
      setCheckingOut(false)
    }
  }

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>로딩 중...</div>
      </div>
    )
  }

  if (!user) {
    return null
  }

  if (user.plan === 'pro') {
    return (
      <div className={styles.container}>
        <div className={styles.card}>
          <h1 className={styles.title}>이미 PRO 플랜입니다</h1>
          <p className={styles.description}>
            현재 PRO 플랜을 사용 중입니다. 추가 기능이 필요하시면 문의해주세요.
          </p>
          <a href="/" className={styles.backLink}>
            ← 홈으로 돌아가기
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <h1 className={styles.title}>PRO로 업그레이드</h1>
        <p className={styles.description}>
          PRO 플랜으로 업그레이드하여 더 많은 기능을 이용하세요.
        </p>

        <div className={styles.currentPlan}>
          <span>현재 플랜:</span>
          <PlanBadge plan={user.plan} />
        </div>

        <div className={styles.features}>
          <h2 className={styles.featuresTitle}>PRO 플랜 혜택</h2>
          <div className={styles.featureList}>
            <div className={styles.feature}>
              <span className={styles.checkmark}>✓</span>
              <div>
                <strong>이미지 최대 3장 업로드</strong>
                <p>FREE: 1장</p>
              </div>
            </div>
            <div className={styles.feature}>
              <span className={styles.checkmark}>✓</span>
              <div>
                <strong>경쟁 URL 최대 3개 분석</strong>
                <p>FREE: 1개</p>
              </div>
            </div>
            <div className={styles.feature}>
              <span className={styles.checkmark}>✓</span>
              <div>
                <strong>월 50회 생성</strong>
                <p>FREE: 1회 (lifetime)</p>
              </div>
            </div>
            <div className={styles.feature}>
              <span className={styles.checkmark}>✓</span>
              <div>
                <strong>경쟁 분석 모드</strong>
                <p>시장 포지셔닝 및 차별화 전략 분석</p>
              </div>
            </div>
            <div className={styles.feature}>
              <span className={styles.checkmark}>✓</span>
              <div>
                <strong>상세한 전략 분석</strong>
                <p>USP, 포지셔닝, 가격 제안 등</p>
              </div>
            </div>
          </div>
        </div>

        <button 
          onClick={handleUpgrade} 
          className={styles.upgradeButton}
          disabled={checkingOut}
        >
          {checkingOut ? '처리 중...' : 'PRO로 업그레이드'}
        </button>

        <a href="/" className={styles.backLink}>
          ← 홈으로 돌아가기
        </a>
      </div>
    </div>
  )
}
