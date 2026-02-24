'use client'

import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/browser'
import { useRouter } from 'next/navigation'
import PlanBadge from '@/components/PlanBadge/PlanBadge'
import { Profile } from '@/types'
import type { Session } from '@supabase/supabase-js'
import styles from './page.module.css'

export const dynamic = 'force-dynamic'

export default function HomePage() {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [apiResponse, setApiResponse] = useState<any>(null)
  const [description, setDescription] = useState('')
  const [generating, setGenerating] = useState(false)
  const [upgradeMessage, setUpgradeMessage] = useState<string | null>(null)
  const [generationResult, setGenerationResult] = useState<{
    title: string
    tags: string[]
    description: string
    differentiation_strategy: string
    usp?: string
    why_this_works?: string
  } | null>(null)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    let mounted = true
    let timeoutId: NodeJS.Timeout | null = null

    // Hard timeout guard - force setLoading(false) after 2000ms
    timeoutId = setTimeout(() => {
      if (mounted && loading) {
        console.warn('Loading timeout reached, forcing setLoading(false)')
        setLoading(false)
      }
    }, 2000)

    // Inner async function
    const run = async () => {
      try {
        // getSession()
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession()

        if (!mounted) return

        if (sessionError) {
          setError(sessionError.message)
          setProfile(null)
          return
        }

        // if no session -> setProfile(null) and exit
        if (!sessionData.session) {
          setSession(null)
          setProfile(null)
          setError(null)
          return
        }

        // if session -> call /api/me
        setSession(sessionData.session)

        console.log('SESSION USER ID:', sessionData.session.user.id)

        const response = await fetch('/api/me', {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${sessionData.session.access_token}`,
          },
        })

        const apiData = await response.json()

        console.log('API /api/me status:', response.status)
        console.log('API /api/me response:', apiData)

        if (!mounted) return

        // Store API response for debugging
        setApiResponse({
          status: response.status,
          statusText: response.statusText,
          data: apiData,
        })

        if (!response.ok) {
          setError(apiData.error || `HTTP ${response.status}`)
          setProfile(null)
          return
        }

        // if success -> setProfile(data) and setError(null)
        if (apiData.profile) {
          setProfile(apiData.profile as Profile)
          setError(null)
        } else {
          setError('Profile not found in response')
          setProfile(null)
        }
      } catch (err) {
        if (!mounted) return
        setError(String(err))
        setProfile(null)
      } finally {
        // ALWAYS call setLoading(false) in finally block
        if (mounted) {
          setLoading(false)
        }
        if (timeoutId) {
          clearTimeout(timeoutId)
        }
      }
    }

    run()

    // Subscribe to auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return

      setSession(session)

      if (session?.user) {
        try {
          console.log('SESSION USER ID:', session.user.id)

          const response = await fetch('/api/me', {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${session.access_token}`,
            },
          })

          const apiData = await response.json()

          console.log('API /api/me status:', response.status)
          console.log('API /api/me response:', apiData)

          if (!mounted) return

          setApiResponse({
            status: response.status,
            statusText: response.statusText,
            data: apiData,
          })

          if (!response.ok) {
            setError(apiData.error || `HTTP ${response.status}`)
            setProfile(null)
            setLoading(false)
            return
          }

          if (apiData.profile) {
            setProfile(apiData.profile as Profile)
            setError(null)
          } else {
            setError('Profile not found in response')
            setProfile(null)
          }

          setLoading(false)
        } catch (err) {
          if (!mounted) return
          setError(String(err))
          setProfile(null)
          setLoading(false)
        }
      } else {
        setProfile(null)
        setError(null)
        setApiResponse(null)
        setLoading(false)
      }
    })

    return () => {
      mounted = false
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
      subscription.unsubscribe()
    }
  }, [])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    setSession(null)
    setProfile(null)
    router.push('/login')
    router.refresh()
  }

  const handleGenerate = async () => {
    if (!session || !description.trim()) {
      return
    }

    setGenerating(true)
    setUpgradeMessage(null)
    setError(null)

    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          description: description.trim(),
          imageUrls: [],
          competitors: [],
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        if (response.status === 403 && data.code === 'upgrade_required') {
          setUpgradeMessage(data.message || 'Free plan limit reached.')
          return
        }
        setError(data.error || data.message || `HTTP ${response.status}`)
        return
      }

      // Success - refresh profile to get updated generations_used
      const meResponse = await fetch('/api/me', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      })

      if (meResponse.ok) {
        const meData = await meResponse.json()
        if (meData.profile) {
          setProfile(meData.profile as Profile)
        }
      }

      // Store result and clear description on success
      if (data.result) {
        setGenerationResult(data.result)
      }
      setDescription('')
    } catch (err) {
      setError(String(err))
    } finally {
      setGenerating(false)
    }
  }

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>로딩 중...</div>
      </div>
    )
  }

  // Debug block
  const hasSession = session !== null
  const userEmail = session?.user?.email || null

  return (
    <div className={styles.container}>
      {/* Debug block */}
      <div className={styles.debugBlock}>
        <div className={styles.debugRow}>
          <strong>Supabase URL:</strong> {process.env.NEXT_PUBLIC_SUPABASE_URL || 'NOT SET'}
        </div>
        <div className={styles.debugRow}>
          <strong>session:</strong> {hasSession ? 'yes' : 'no'}
        </div>
        <div className={styles.debugRow}>
          <strong>session_user_id:</strong> {session?.user?.id || '-'}
        </div>
        <div className={styles.debugRow}>
          <strong>profile?.user_id:</strong> {profile?.user_id || '-'}
        </div>
        <div className={styles.debugRow}>
          <strong>email:</strong> {userEmail || '-'}
        </div>
        <div className={styles.debugRow}>
          <strong>error:</strong> {error || '-'}
        </div>
        {apiResponse && (
          <>
            <div className={styles.debugRow}>
              <strong>API status:</strong> {apiResponse.status || '-'}
            </div>
            <div className={styles.debugRow}>
              <strong>API statusText:</strong> {apiResponse.statusText || '-'}
            </div>
            <div className={styles.debugRow}>
              <strong>API response.data:</strong> {apiResponse.data ? JSON.stringify(apiResponse.data) : 'null'}
            </div>
            <div className={styles.debugRow}>
              <strong>Full API Response JSON:</strong>
            </div>
            <pre className={styles.jsonPre}>
              {JSON.stringify(apiResponse, null, 2)}
            </pre>
          </>
        )}
      </div>

      {!hasSession ? (
        <div className={styles.card}>
          <h1 className={styles.title}>SellerBuddy</h1>
          <p className={styles.description}>로그인이 필요합니다.</p>
          {error && (
            <div className={styles.errorMessage}>
              <p>{error}</p>
            </div>
          )}
          <a href="/login" className={styles.loginLink}>
            로그인
          </a>
        </div>
      ) : hasSession && !profile ? (
        <div className={styles.card}>
          <h1 className={styles.title}>SellerBuddy</h1>
          <div className={styles.errorMessage}>
            {error && <p>Profile error: {error}</p>}
          </div>
          {apiResponse && (
            <div className={styles.debugBlock}>
              <h3>API /api/me Response:</h3>
              <div className={styles.debugRow}>
                <strong>status:</strong> {apiResponse.status || '-'}
              </div>
              <div className={styles.debugRow}>
                <strong>statusText:</strong> {apiResponse.statusText || '-'}
              </div>
              <div className={styles.debugRow}>
                <strong>response.data:</strong> {apiResponse.data ? JSON.stringify(apiResponse.data) : 'null'}
              </div>
              <pre className={styles.jsonPre}>
                {JSON.stringify(apiResponse, null, 2)}
              </pre>
            </div>
          )}
          <button onClick={handleLogout} className={styles.logoutButton}>
            로그아웃
          </button>
        </div>
      ) : profile ? (
        <>
          <header className={styles.header}>
            <h1 className={styles.title}>SellerBuddy</h1>
            <div className={styles.userInfo}>
              <PlanBadge plan={profile.plan} />
              <span className={styles.email}>{profile.email}</span>
              <button onClick={handleLogout} className={styles.logoutButton}>
                로그아웃
              </button>
            </div>
          </header>

          <main className={styles.main}>
            <div className={styles.card}>
              <h2 className={styles.cardTitle}>프로필</h2>
              <div className={styles.profileInfo}>
                <div className={styles.infoRow}>
                  <span className={styles.infoLabel}>이메일:</span>
                  <span className={styles.infoValue}>{profile.email}</span>
                </div>
                <div className={styles.infoRow}>
                  <span className={styles.infoLabel}>플랜:</span>
                  <span className={styles.infoValue}>
                    <PlanBadge plan={profile.plan} />
                  </span>
                </div>
                <div className={styles.infoRow}>
                  <span className={styles.infoLabel}>사용 횟수:</span>
                  <span className={styles.infoValue}>{profile.generations_used}</span>
                </div>
              </div>
            </div>

            <div className={styles.card}>
              <h2 className={styles.cardTitle}>생성하기</h2>
              {upgradeMessage && (
                <div className={styles.errorMessage}>
                  <p>{upgradeMessage}</p>
                  <a href="/upgrade" className={styles.loginLink}>
                    업그레이드
                  </a>
                </div>
              )}
              {error && (
                <div className={styles.errorMessage}>
                  <p>{error}</p>
                </div>
              )}
              <div className={styles.formGroup}>
                <label htmlFor="description" className={styles.label}>
                  상품 설명 (필수)
                </label>
                <textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className={styles.textarea}
                  placeholder="생성할 상품에 대한 설명을 입력하세요..."
                  rows={6}
                  disabled={generating}
                />
              </div>
              <button
                onClick={handleGenerate}
                disabled={!description.trim() || generating}
                className={styles.generateButton}
              >
                {generating ? '생성 중...' : '생성하기'}
              </button>
            </div>

            {generationResult && (
              <div className={styles.card}>
                <h2 className={styles.cardTitle}>생성 결과</h2>
                
                <div className={styles.resultSection}>
                  <div className={styles.resultHeader}>
                    <h3 className={styles.resultLabel}>제목</h3>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(generationResult.title)
                      }}
                      className={styles.copyButton}
                    >
                      복사
                    </button>
                  </div>
                  <p className={styles.resultValue}>{generationResult.title}</p>
                </div>

                <div className={styles.resultSection}>
                  <div className={styles.resultHeader}>
                    <h3 className={styles.resultLabel}>태그 (13개)</h3>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(generationResult.tags.join(', '))
                      }}
                      className={styles.copyButton}
                    >
                      모두 복사
                    </button>
                  </div>
                  <div className={styles.tagsContainer}>
                    {generationResult.tags.map((tag, index) => (
                      <span key={index} className={styles.tag}>
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>

                <div className={styles.resultSection}>
                  <div className={styles.resultHeader}>
                    <h3 className={styles.resultLabel}>설명</h3>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(generationResult.description)
                      }}
                      className={styles.copyButton}
                    >
                      복사
                    </button>
                  </div>
                  <div className={styles.resultValue} style={{ whiteSpace: 'pre-wrap' }}>
                    {generationResult.description}
                  </div>
                </div>

                <div className={styles.resultSection}>
                  <h3 className={styles.resultLabel}>차별화 전략</h3>
                  <div className={styles.resultValue} style={{ whiteSpace: 'pre-wrap' }}>
                    {generationResult.differentiation_strategy}
                  </div>
                </div>

                {generationResult.usp && (
                  <div className={styles.resultSection}>
                    <h3 className={styles.resultLabel}>USP</h3>
                    <div className={styles.resultValue}>
                      {generationResult.usp}
                    </div>
                  </div>
                )}

                {generationResult.why_this_works && (
                  <div className={styles.resultSection}>
                    <h3 className={styles.resultLabel}>왜 이것이 작동하는가</h3>
                    <div className={styles.resultValue}>
                      {generationResult.why_this_works}
                    </div>
                  </div>
                )}
              </div>
            )}
          </main>
        </>
      ) : null}
    </div>
  )
}
