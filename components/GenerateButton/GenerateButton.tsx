'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plan } from '@/types'
import styles from './GenerateButton.module.css'

interface GenerateButtonProps {
  plan: Plan
  description: string
  images: string[]
  competitorUrls: string[]
  isCompetitorAnalysis?: boolean
  onUpgradeRequired?: () => void
}

export default function GenerateButton({
  plan,
  description,
  images,
  competitorUrls,
  isCompetitorAnalysis = false,
  onUpgradeRequired,
}: GenerateButtonProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  const isDisabled = !description.trim() || loading

  const handleGenerate = async () => {
    if (isDisabled) return

    setLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          images,
          description: description.trim(),
          competitor_urls: competitorUrls,
          is_competitor_analysis: isCompetitorAnalysis,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        if (data.requiresUpgrade && onUpgradeRequired) {
          onUpgradeRequired()
        } else {
          setError(data.error || '생성 실패')
        }
        setLoading(false)
        return
      }

      // Redirect to results page
      router.push(`/results/${data.generation.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : '오류가 발생했습니다.')
      setLoading(false)
    }
  }

  return (
    <div className={styles.container}>
      <button
        onClick={handleGenerate}
        disabled={isDisabled}
        className={styles.button}
      >
        {loading ? '생성 중...' : '리스팅 생성'}
      </button>
      {error && <div className={styles.error}>{error}</div>}
      {!description.trim() && (
        <div className={styles.hint}>설명을 입력하면 생성할 수 있습니다.</div>
      )}
    </div>
  )
}
