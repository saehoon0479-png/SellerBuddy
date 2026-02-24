import { Plan, User } from '@/types'

export function checkGenerationLimit(user: User): {
  allowed: boolean
  reason?: string
} {
  if (user.plan === 'free') {
    if (user.generations_used >= 1) {
      return {
        allowed: false,
        reason: 'FREE 플랜은 1회만 사용 가능합니다. PRO로 업그레이드하세요.',
      }
    }
  } else if (user.plan === 'pro') {
    // Check if monthly limit reached
    const now = new Date()
    const lastReset = user.last_reset_at ? new Date(user.last_reset_at) : null

    // If never reset or last reset was in a different month, reset the count
    if (!lastReset || lastReset.getMonth() !== now.getMonth() || lastReset.getFullYear() !== now.getFullYear()) {
      // This should be handled by the API, but we check here too
      return {
        allowed: true,
      }
    }

    if (user.generations_used >= 50) {
      return {
        allowed: false,
        reason: 'PRO 플랜의 월간 한도(50회)에 도달했습니다. 다음 달에 다시 사용할 수 있습니다.',
      }
    }
  }

  return { allowed: true }
}

export function getMaxImages(plan: Plan): number {
  return plan === 'pro' ? 3 : 1
}

export function getMaxCompetitorUrls(plan: Plan): number {
  return plan === 'pro' ? 3 : 1
}

export function shouldResetMonthlyUsage(user: User): boolean {
  if (user.plan !== 'pro') return false

  const now = new Date()
  const lastReset = user.last_reset_at ? new Date(user.last_reset_at) : null

  if (!lastReset) return true

  return (
    lastReset.getMonth() !== now.getMonth() ||
    lastReset.getFullYear() !== now.getFullYear()
  )
}
