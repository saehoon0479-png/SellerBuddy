'use client'

import { useEffect } from 'react'
import styles from './UpgradeModal.module.css'

interface UpgradeModalProps {
  isOpen: boolean
  onClose: () => void
}

export default function UpgradeModal({ isOpen, onClose }: UpgradeModalProps) {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = 'unset'
    }
    return () => {
      document.body.style.overflow = 'unset'
    }
  }, [isOpen])

  if (!isOpen) return null

  const handleUpgrade = () => {
    // TODO: Integrate with Polar
    window.location.href = '/upgrade'
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <button className={styles.closeButton} onClick={onClose}>
          ×
        </button>
        <h2 className={styles.title}>PRO로 업그레이드</h2>
        <p className={styles.description}>
          FREE 플랜은 1회만 사용 가능합니다. PRO 플랜으로 업그레이드하여 더 많은 기능을 이용하세요.
        </p>
        <div className={styles.features}>
          <div className={styles.feature}>
            <span className={styles.checkmark}>✓</span>
            <span>이미지 최대 3장 업로드</span>
          </div>
          <div className={styles.feature}>
            <span className={styles.checkmark}>✓</span>
            <span>경쟁 URL 최대 3개 분석</span>
          </div>
          <div className={styles.feature}>
            <span className={styles.checkmark}>✓</span>
            <span>월 50회 생성</span>
          </div>
          <div className={styles.feature}>
            <span className={styles.checkmark}>✓</span>
            <span>경쟁 분석 모드</span>
          </div>
          <div className={styles.feature}>
            <span className={styles.checkmark}>✓</span>
            <span>상세한 전략 분석</span>
          </div>
        </div>
        <div className={styles.actions}>
          <button onClick={onClose} className={styles.cancelButton}>
            나중에
          </button>
          <button onClick={handleUpgrade} className={styles.upgradeButton}>
            업그레이드
          </button>
        </div>
      </div>
    </div>
  )
}
