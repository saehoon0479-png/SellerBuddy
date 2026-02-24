'use client'

import { useState } from 'react'
import { GenerationResult, Plan } from '@/types'
import styles from './ResultDisplay.module.css'

interface ResultDisplayProps {
  result: GenerationResult
  plan: Plan
  isBlurred?: boolean
}

export default function ResultDisplay({
  result,
  plan,
  isBlurred = false,
}: ResultDisplayProps) {
  const [copied, setCopied] = useState<string | null>(null)

  const copyToClipboard = async (text: string, type: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(type)
      setTimeout(() => setCopied(null), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  const copyTitle = () => {
    copyToClipboard(result.title, 'title')
  }

  const copyTags = () => {
    copyToClipboard(result.tags.join(', '), 'tags')
  }

  return (
    <div className={`${styles.container} ${isBlurred ? styles.blurred : ''}`}>
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <h3 className={styles.sectionTitle}>Title</h3>
          <button onClick={copyTitle} className={styles.copyButton}>
            {copied === 'title' ? '복사됨!' : '복사'}
          </button>
        </div>
        <div className={styles.content}>{result.title}</div>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <h3 className={styles.sectionTitle}>SEO Tags (13개)</h3>
          <button onClick={copyTags} className={styles.copyButton}>
            {copied === 'tags' ? '복사됨!' : '복사'}
          </button>
        </div>
        <div className={styles.tags}>
          {result.tags.map((tag, index) => (
            <span key={index} className={styles.tag}>
              {tag}
            </span>
          ))}
        </div>
      </div>

      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>Description</h3>
        <div className={styles.content}>{result.description}</div>
      </div>

      {plan === 'pro' && result.usp && (
        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>USP (Unique Selling Proposition)</h3>
          <div className={styles.content}>{result.usp}</div>
        </div>
      )}

      {result.differentiation_strategy && (
        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>
            {plan === 'pro' ? '차별화 전략 5가지' : '차별화 전략'}
          </h3>
          <div className={styles.content}>
            {Array.isArray(result.differentiation_strategy) ? (
              <ul className={styles.strategyList}>
                {result.differentiation_strategy.map((strategy, index) => (
                  <li key={index}>{strategy}</li>
                ))}
              </ul>
            ) : (
              result.differentiation_strategy
            )}
          </div>
        </div>
      )}

      {plan === 'pro' && result.why_this_works && (
        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>Why This Works</h3>
          <div className={styles.content}>{result.why_this_works}</div>
        </div>
      )}

      {plan === 'pro' && result.positioning_analysis && (
        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>포지셔닝 분석</h3>
          <div className={styles.content}>{result.positioning_analysis}</div>
        </div>
      )}

      {plan === 'pro' && result.price_positioning && (
        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>가격 포지셔닝 제안</h3>
          <div className={styles.content}>{result.price_positioning}</div>
        </div>
      )}
    </div>
  )
}
