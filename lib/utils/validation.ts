import { GenerationRequest, Plan } from '@/types'
import { getMaxImages, getMaxCompetitorUrls } from './plan-limits'

export function validateGenerationRequest(
  request: GenerationRequest,
  plan: Plan
): { valid: boolean; error?: string } {
  // Description is required
  if (!request.description || request.description.trim().length === 0) {
    return { valid: false, error: 'Description is required' }
  }

  // Check image limits
  const maxImages = getMaxImages(plan)
  if (request.images.length > maxImages) {
    return {
      valid: false,
      error: `Maximum ${maxImages} image(s) allowed for ${plan} plan`,
    }
  }

  // Check competitor URL limits
  const maxUrls = getMaxCompetitorUrls(plan)
  if (request.competitor_urls.length > maxUrls) {
    return {
      valid: false,
      error: `Maximum ${maxUrls} competitor URL(s) allowed for ${plan} plan`,
    }
  }

  // For competitor analysis mode, require 3 images and 3 URLs
  if (request.is_competitor_analysis) {
    if (plan !== 'pro') {
      return {
        valid: false,
        error: 'Competitor analysis mode is only available for PRO plan',
      }
    }
    if (request.images.length !== 3) {
      return {
        valid: false,
        error: 'Competitor analysis mode requires exactly 3 images',
      }
    }
    if (request.competitor_urls.length !== 3) {
      return {
        valid: false,
        error: 'Competitor analysis mode requires exactly 3 competitor URLs',
      }
    }
  }

  return { valid: true }
}
