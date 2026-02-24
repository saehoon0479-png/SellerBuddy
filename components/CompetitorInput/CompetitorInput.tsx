'use client'

import { useState } from 'react'
import { Plan } from '@/types'
import { getMaxCompetitorUrls } from '@/lib/utils/plan-limits'
import styles from './CompetitorInput.module.css'

interface CompetitorInputProps {
  plan: Plan
  onUrlsChange: (urls: string[]) => void
  initialUrls?: string[]
  isCompetitorAnalysis?: boolean
}

export default function CompetitorInput({
  plan,
  onUrlsChange,
  initialUrls = [],
  isCompetitorAnalysis = false,
}: CompetitorInputProps) {
  const [urls, setUrls] = useState<string[]>(initialUrls)
  const [inputValue, setInputValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const maxUrls = getMaxCompetitorUrls(plan)
  const requiredUrls = isCompetitorAnalysis ? 3 : 0

  const validateUrl = (url: string): boolean => {
    try {
      new URL(url)
      return true
    } catch {
      return false
    }
  }

  const addUrl = () => {
    if (!inputValue.trim()) return

    if (!validateUrl(inputValue.trim())) {
      setError('유효한 URL을 입력해주세요.')
      return
    }

    if (urls.length >= maxUrls) {
      setError(`최대 ${maxUrls}개의 URL만 입력할 수 있습니다.`)
      return
    }

    if (urls.includes(inputValue.trim())) {
      setError('이미 추가된 URL입니다.')
      return
    }

    setError(null)
    const newUrls = [...urls, inputValue.trim()]
    setUrls(newUrls)
    onUrlsChange(newUrls)
    setInputValue('')
  }

  const removeUrl = (index: number) => {
    const newUrls = urls.filter((_, i) => i !== index)
    setUrls(newUrls)
    onUrlsChange(newUrls)
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      addUrl()
    }
  }

  return (
    <div className={styles.container}>
      <label className={styles.label}>
        경쟁 제품 URL {requiredUrls > 0 && `(${urls.length}/${requiredUrls} 필수)`}
        {requiredUrls === 0 && `(${urls.length}/${maxUrls})`}
      </label>
      <div className={styles.inputGroup}>
        <input
          type="text"
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value)
            setError(null)
          }}
          onKeyPress={handleKeyPress}
          placeholder="https://www.etsy.com/listing/..."
          disabled={urls.length >= maxUrls}
          className={styles.input}
        />
        <button
          type="button"
          onClick={addUrl}
          disabled={urls.length >= maxUrls || !inputValue.trim()}
          className={styles.addButton}
        >
          추가
        </button>
      </div>
      {error && <div className={styles.error}>{error}</div>}
      {urls.length > 0 && (
        <div className={styles.urlList}>
          {urls.map((url, index) => (
            <div key={index} className={styles.urlItem}>
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.urlLink}
              >
                {url}
              </a>
              <button
                type="button"
                onClick={() => removeUrl(index)}
                className={styles.removeButton}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
      {isCompetitorAnalysis && urls.length < requiredUrls && (
        <div className={styles.warning}>
          경쟁 분석 모드를 사용하려면 {requiredUrls}개의 URL이 필요합니다.
        </div>
      )}
    </div>
  )
}
