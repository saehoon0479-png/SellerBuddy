export type Plan = 'free' | 'pro'

export interface Profile {
  user_id: string
  email: string
  plan: Plan
  generations_used: number
  created_at: string
  updated_at: string
  last_reset_at?: string
}

export interface Generation {
  id: string
  user_id: string
  images: string[]
  description: string
  competitor_urls: string[]
  result_json: GenerationResult
  created_at: string
}

export interface GenerationResult {
  title: string
  tags: string[]
  description: string
  usp?: string
  differentiation_strategy?: string | string[]
  why_this_works?: string
  positioning_analysis?: string
  price_positioning?: string
}

export interface GenerationRequest {
  images: string[]
  description: string
  competitor_urls: string[]
  is_competitor_analysis?: boolean
}
