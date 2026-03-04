'use client'

import { useRouter } from 'next/navigation'
import { Plan } from '@/types'
import styles from './PlanBadge.module.css'

interface PlanBadgeProps {
  plan: Plan | null
}

export default function PlanBadge({ plan }: PlanBadgeProps) {
  const router = useRouter()

  const handleClick = () => {
    router.push('/upgrade')
  }

  if (plan === null) {
    return (
      <span className={`${styles.badge} ${styles.loading}`}>
        …
      </span>
    )
  }

  return (
    <button
      className={`${styles.badge} ${styles[plan]} ${styles.clickable}`}
      onClick={handleClick}
      aria-label="Go to upgrade page"
    >
      {plan === 'pro' ? 'PRO' : 'FREE'}
    </button>
  )
}
