/**
 * Check if Pro plan is active based on plan and expiry
 */
export function isProActive(plan: string, proExpiresAt: string | null): boolean {
  if (plan !== 'pro') {
    return false
  }
  if (!proExpiresAt) {
    return false
  }
  const expiresAt = new Date(proExpiresAt)
  const now = new Date()
  return expiresAt > now
}
