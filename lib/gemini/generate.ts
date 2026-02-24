import { GoogleGenAI } from '@google/genai'
import { z } from 'zod'
import { Plan } from '@/types'

interface GenerateListingParams {
  description: string
  competitorNotes?: string[]
  plan: Plan
}

interface GenerateListingResult {
  title: string
  tags: string[] // exactly 13
  description: string
  differentiation_strategy: string
  usp?: string
  why_this_works?: string
}

// Zod schema for validation
const GenerateListingSchema = z.object({
  title: z.string().min(1),
  tags: z.array(z.string()).length(13),
  description: z.string().min(1),
  differentiation_strategy: z.string().min(1),
  usp: z.string().optional(),
  why_this_works: z.string().optional(),
})

// JSON Schema for Gemini structured output
function getResponseSchema(plan: Plan) {
  const baseSchema: any = {
    type: 'object',
    properties: {
      title: { type: 'string' },
      tags: {
        type: 'array',
        items: { type: 'string' },
        minItems: 13,
        maxItems: 13,
      },
      description: { type: 'string' },
      differentiation_strategy: { type: 'string' },
    },
    required: ['title', 'tags', 'description', 'differentiation_strategy'],
  }

  if (plan === 'pro') {
    baseSchema.properties.usp = { type: 'string' }
    baseSchema.properties.why_this_works = { type: 'string' }
    baseSchema.required.push('usp', 'why_this_works')
  }

  return baseSchema
}

function buildPrompt(description: string, competitorNotes: string[] | undefined, plan: Plan, isRetry: boolean = false): string {
  const retryNote = isRetry 
    ? '\n\nCRITICAL: Return JSON ONLY. No markdown. No extra text. The JSON must have exactly 13 tags in the tags array.'
    : ''

  const competitorContext = competitorNotes && competitorNotes.length > 0
    ? `\n\nCompetitor notes:\n${competitorNotes.map((note, i) => `${i + 1}. ${note}`).join('\n')}`
    : ''

  const basePrompt = `You are an Etsy market strategist and conversion copy expert.

HARD REQUIREMENTS:
- Etsy title: under 140 characters, SEO-optimized, includes key search terms
- Tags: exactly 13 tags (array of 13 strings), each tag <= 20 characters if possible
- Description: skimmable format with:
  * Benefits highlighted
  * Materials mentioned
  * Sizing placeholders (e.g., "Available in sizes S-XL")
  * Shipping note (e.g., "Ships within 3-5 business days")
- Differentiation strategy: bullet points format

Product description: ${description}${competitorContext}${retryNote}`

  return basePrompt
}

async function callGeminiAPI(
  prompt: string,
  plan: Plan,
  isRetry: boolean = false
): Promise<GenerateListingResult> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not set')
  }

  const ai = new GoogleGenAI({ apiKey })

  try {
    const result = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          role: 'user',
          parts: [{ text: prompt }],
        },
      ],
      config: {
        temperature: 0.7,
        topP: 0.9,
        maxOutputTokens: 2048,
        responseMimeType: 'application/json',
        responseSchema: getResponseSchema(plan),
      },
    })

    // Parse response text safely
    const text = result.text ?? result.candidates?.[0]?.content?.parts?.[0]?.text

    if (!text) {
      throw new Error('No text in Gemini response')
    }

    // Parse JSON
    let parsed: any
    try {
      parsed = JSON.parse(text)
    } catch (parseError) {
      console.error('JSON parse error:', parseError)
      throw new Error('Failed to parse JSON from Gemini response')
    }

    // Validate with Zod
    const validated = GenerateListingSchema.parse(parsed)

    // Ensure tags length is exactly 13
    if (validated.tags.length !== 13) {
      throw new Error(`Tags array must have exactly 13 items, got ${validated.tags.length}`)
    }

    return validated
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('Zod validation error:', error.errors)
      throw new Error(`Validation failed: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`)
    }
    throw error
  }
}

export async function generateListing({
  description,
  competitorNotes,
  plan,
}: GenerateListingParams): Promise<GenerateListingResult> {
  const prompt = buildPrompt(description, competitorNotes, plan, false)

  try {
    // First attempt
    return await callGeminiAPI(prompt, plan, false)
  } catch (error) {
    // Retry once if JSON parsing/validation fails
    console.warn('First attempt failed, retrying with stricter prompt:', error)
    
    try {
      const retryPrompt = buildPrompt(description, competitorNotes, plan, true)
      return await callGeminiAPI(retryPrompt, plan, true)
    } catch (retryError) {
      console.error('Gemini API retry failed:', retryError)
      throw new Error(
        `Failed to generate valid listing after retry: ${retryError instanceof Error ? retryError.message : 'Unknown error'}`
      )
    }
  }
}
