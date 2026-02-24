'use client'

import { Plan } from '@/types'
import styles from './PlanBadge.module.css'

interface PlanBadgeProps {
  plan: Plan
}

export default function PlanBadge({ plan }: PlanBadgeProps) {
  return (
    <span className={`${styles.badge} ${styles[plan]}`}>
      {plan === 'pro' ? 'PRO' : 'FREE'}
    </span>
  )
}
