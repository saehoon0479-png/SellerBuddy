import { GoogleGenAI } from '@google/genai'
import { z } from 'zod'
import { Plan } from '@/types'

function getModelText(result: any): { text: string; partsCount: number } {
  const parts = result?.candidates?.[0]?.content?.parts || []
  const texts = parts.map((p: any) => p?.text).filter((t: unknown) => typeof t === 'string' && t.length > 0)
  return {
    text: texts.join('\n') || result?.text || '',
    partsCount: parts.length,
  }
}

// Trademark detection helper
function detectTrademarks(text: string): string[] {
  const trademarks = [
    'nike',
    'adidas',
    'jordan',
    'disney',
    'marvel',
    'star wars',
    'hello kitty',
    'pokemon',
    'sanrio',
    'gucci',
    'louis vuitton',
    'chanel',
    'prada',
  ]

  const found: string[] = []
  const lowerText = text.toLowerCase()

  for (const brand of trademarks) {
    // Word boundary friendly regex
    const regex = new RegExp(`\\b${brand.replace(/\s+/g, '\\s+')}\\b`, 'i')
    if (regex.test(lowerText)) {
      found.push(brand)
    }
  }

  return found
}

interface GenerateListingParams {
  description: string
  competitorNotes?: string[]
  plan: Plan
  imageUrls?: string[] // Signed URLs for Gemini Vision
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
            return {
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
}

function getOptimizeSchema() {
  return {
    type: 'object',
    properties: {
      optimized_title: { type: 'string' },
      optimized_description: { type: 'string' },
    },
    required: ['optimized_title', 'optimized_description'],
  }
}

function extractJson(text: string): string {
  // Remove markdown fences if present
  let cleaned = text.trim()
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.replace(/^```json\s*/i, '').replace(/\s*```$/i, '')
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```\s*/i, '').replace(/\s*```$/i, '')
  }
  cleaned = cleaned.trim()

  // Extract JSON substring from first { to last }
  const firstBrace = cleaned.indexOf('{')
  const lastBrace = cleaned.lastIndexOf('}')
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.substring(firstBrace, lastBrace + 1)
  }

  return cleaned
}

function buildPrompt(description: string, competitorNotes: string[] | undefined, plan: Plan, detectedTrademarks: string[] = [], hasImages: boolean = false): string {
  // Build competitor data section
  let competitorDataSection = ''
  if (competitorNotes && competitorNotes.length > 0) {
    const competitorEntries = competitorNotes.map((note, i) => {
      const lines = note.split('\n')
      const url = lines[0] || ''
      const desc = lines.find(l => l.toLowerCase().includes('description:'))?.replace(/description:/i, '').trim() || ''
      return `${url}${desc ? ` | ${desc}` : ''}`
    }).join('; ')
    competitorDataSection = `\nCompetitors: ${competitorEntries}`
  }

  // Build safety section
  let safetySection = ''
  if (detectedTrademarks.length > 0) {
    const brandsList = detectedTrademarks.map(b => b.charAt(0).toUpperCase() + b.slice(1)).join(', ')
    safetySection = `\nTRADEMARK ALERT (${brandsList}): Do NOT use brand names. Use generic alternatives.`
  }

  const basePrompt = `Generate Etsy listing JSON.${safetySection}

Product: ${description}${competitorDataSection}

Output JSON with ONLY these fields:
- title: string (max 140 chars)
- tags: array of exactly 13 strings (each <= 20 chars)
- description: string (max 700 chars, scannable)
- differentiation_strategy: string (max 400 chars, 3 bullet lines max)

Return JSON only. No extra keys. No markdown.`

  return basePrompt
}

async function repairJson(brokenText: string, plan: Plan, isOptimize: boolean = false): Promise<GenerateListingResult | OptimizeListingResult> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not set')
  }

  const ai = new GoogleGenAI({ apiKey })
  const schema = isOptimize ? getOptimizeSchema() : getResponseSchema(plan)

  const repairPrompt = `Fix this into valid JSON matching this schema: ${JSON.stringify(schema)}. Return JSON only. Here is the broken text:\n\n${brokenText}`

  try {
    const result = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          role: 'user',
          parts: [{ text: repairPrompt }],
        },
      ],
      config: {
        temperature: 0.3,
        maxOutputTokens: 1000,
        responseMimeType: 'application/json',
        responseSchema: schema,
      },
    })

    const { text: rawRepairText } = getModelText(result)
    if (!rawRepairText) {
      throw new Error('No text in repair response')
    }

    let text = extractJson(rawRepairText)
    
    let parsed: any
    try {
      parsed = JSON.parse(text)
    } catch (parseError) {
      console.error('[REPAIR JSON] JSON parse error:', parseError, 'Text:', text.substring(0, 200))
      throw new Error('MODEL_JSON_INVALID')
    }
    
    let validated: GenerateListingResult | OptimizeListingResult
    if (isOptimize) {
      validated = z.object({
        optimized_title: z.string().min(1),
        optimized_description: z.string().min(1),
      }).parse(parsed) as OptimizeListingResult
    } else {
      validated = GenerateListingSchema.parse(parsed)
      if (validated.tags.length !== 13) {
        throw new Error(`Tags array must have exactly 13 items, got ${validated.tags.length}`)
      }
    }

    return validated
  } catch (error: unknown) {
    console.error('JSON repair failed:', error)
    throw new Error('MODEL_JSON_INVALID')
  }
}

async function callGeminiAPI(
  prompt: string,
  plan: Plan,
  imageUrls?: string[],
  isOptimize: boolean = false,
): Promise<{ result: GenerateListingResult | OptimizeListingResult; rawText: string }> {
  const apiKey = process.env.GEMINI_API_KEY
  // #region agent log
  fetch('http://127.0.0.1:7244/ingest/3412338a-0039-465b-a8f8-532fd9041227',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'lib/gemini/generate.ts:147',message:'Gemini API key check',data:{hasApiKey:!!apiKey,apiKeyLength:apiKey?.length},timestamp:Date.now(),runId:'run1',hypothesisId:'C'})}).catch(()=>{});
  // #endregion
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not set')
  }

  const ai = new GoogleGenAI({ apiKey })

  // Build parts array: text + images
  const parts: any[] = [{ text: prompt }]
  
  // Add image URLs if provided (fetch and convert to base64)
  if (imageUrls && imageUrls.length > 0) {
    for (const imageUrl of imageUrls) {
      if (imageUrl) {
        try {
          // Fetch image from signed URL
          const response = await fetch(imageUrl)
          if (!response.ok) {
            console.error(`Failed to fetch image from ${imageUrl}: ${response.statusText}`)
            continue
          }
          
          const arrayBuffer = await response.arrayBuffer()
          const base64 = Buffer.from(arrayBuffer).toString('base64')
          
          // Detect MIME type from response or default to jpeg
          const contentType = response.headers.get('content-type') || 'image/jpeg'
          
          parts.push({
            inlineData: {
              mimeType: contentType,
              data: base64,
            },
          })
  } catch (error) {
          console.error(`Error processing image from ${imageUrl}:`, error)
          // Continue without this image
        }
      }
    }
  }

  try {
    // #region agent log
    fetch('http://127.0.0.1:7244/ingest/3412338a-0039-465b-a8f8-532fd9041227',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'lib/gemini/generate.ts:189',message:'Before Gemini API call',data:{model:'gemini-2.5-flash',plan,partsCount:parts.length,hasImages:imageUrls && imageUrls.length > 0},timestamp:Date.now(),runId:'run1',hypothesisId:'D'})}).catch(()=>{});
    // #endregion
    const result = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
        contents: [
          {
            role: 'user',
          parts: parts,
        },
      ],
      config: {
        temperature: 0.7,
        topP: 0.9,
        maxOutputTokens: 900,
        responseMimeType: 'application/json',
        responseSchema: isOptimize ? getOptimizeSchema() : getResponseSchema(plan),
      },
    })
    // #region agent log
    fetch('http://127.0.0.1:7244/ingest/3412338a-0039-465b-a8f8-532fd9041227',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'lib/gemini/generate.ts:207',message:'Gemini API call completed',data:{hasText:!!result.text,hasCandidates:!!result.candidates},timestamp:Date.now(),runId:'run1',hypothesisId:'D'})}).catch(()=>{});
    // #endregion

    // Parse response text safely (join all parts)
    const { text: rawApiText, partsCount } = getModelText(result)
    let text = rawApiText

    if (!text) {
      throw new Error('No text in Gemini response')
    }

    // Store raw text before extraction
    const rawText = text

    // Extract JSON
    text = extractJson(text)

    // Parse JSON
    let parsed: any
    try {
      parsed = JSON.parse(text)
    } catch (parseError) {
      console.error('JSON parse error:', parseError, 'Text:', text.substring(0, 200))
      throw new Error(`MODEL_JSON_INVALID:${rawText}`)
    }

    // Validate with Zod
    let validated: GenerateListingResult | OptimizeListingResult
    if (isOptimize) {
      validated = z.object({
        optimized_title: z.string().min(1),
        optimized_description: z.string().min(1),
      }).parse(parsed) as OptimizeListingResult
    } else {
      const listingResult = GenerateListingSchema.parse(parsed) as GenerateListingResult
      // Ensure tags length is exactly 13
      if (listingResult.tags.length !== 13) {
        throw new Error(`Tags array must have exactly 13 items, got ${listingResult.tags.length}`)
      }
      validated = listingResult
    }

    return { result: validated, rawText }
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      console.error('Zod validation error:', error.issues)
      throw new Error(`Validation failed: ${error.issues.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`)
    }
    throw new Error(error instanceof Error ? error.message : String(error))
  }
}

// Post-process output to reduce trademark repetition
function sanitizeOutput(result: GenerateListingResult, detectedTrademarks: string[]): GenerateListingResult {
  if (detectedTrademarks.length === 0) {
    return result
  }

  const sanitized = { ...result }
  const brandRegexes = detectedTrademarks.map(brand => new RegExp(`\\b${brand.replace(/\s+/g, '\\s+')}\\b`, 'gi'))

  // Remove brand names from title
  for (const regex of brandRegexes) {
    sanitized.title = sanitized.title.replace(regex, '').replace(/\s+/g, ' ').trim()
  }

  // Remove brand names from tags, replace with generic alternatives
  const genericAlternatives = ['vintage style', 'retro aesthetic', 'streetwear', 'athletic style', 'designer-inspired', 'classic look', 'timeless design']
  sanitized.tags = sanitized.tags.map(tag => {
    let cleaned = tag
    let hasBrand = false
    for (const regex of brandRegexes) {
      if (regex.test(cleaned)) {
        hasBrand = true
        cleaned = cleaned.replace(regex, '').trim()
      }
    }
    // If tag was mostly brand name, replace with generic alternative
    if (hasBrand && cleaned.length < 3) {
      return genericAlternatives[Math.floor(Math.random() * genericAlternatives.length)]
    }
    return cleaned
  }).filter(tag => tag.length > 0)

  // Ensure we still have exactly 13 tags (pad with generic alternatives if needed)
  while (sanitized.tags.length < 13) {
    const alt = genericAlternatives[Math.floor(Math.random() * genericAlternatives.length)]
    if (!sanitized.tags.includes(alt)) {
      sanitized.tags.push(alt)
    } else {
      sanitized.tags.push('vintage style')
    }
  }
  sanitized.tags = sanitized.tags.slice(0, 13)

  // Remove all brand mentions from description completely
  for (const regex of brandRegexes) {
    sanitized.description = sanitized.description.replace(regex, '').replace(/\s+/g, ' ').trim()
  }

  // Ensure compliance note is in differentiation_strategy
  if (!sanitized.differentiation_strategy.includes('=== COMPLIANCE NOTE ===')) {
    const alternatives = detectedTrademarks.map(b => {
      if (b.includes('nike') || b.includes('adidas') || b.includes('jordan')) {
        return 'vintage athletic style, retro sportswear, streetwear-inspired'
      }
      if (b.includes('disney') || b.includes('marvel') || b.includes('star wars') || b.includes('pokemon') || b.includes('hello kitty') || b.includes('sanrio')) {
        return 'vintage character aesthetic, retro pop culture, nostalgic design'
      }
      if (b.includes('gucci') || b.includes('louis vuitton') || b.includes('chanel') || b.includes('prada')) {
        return 'designer-inspired, luxury aesthetic, high-end style'
      }
      return 'vintage style, retro aesthetic'
    }).join('; ')

    sanitized.differentiation_strategy += `\n\n=== COMPLIANCE NOTE ===\nFor safer SEO, consider using these alternatives instead of brand names: ${alternatives}.`
  }

  return sanitized
}

interface OptimizeListingParams {
  title: string
  description: string
  plan: Plan
}

interface OptimizeListingResult {
  optimized_title: string
  optimized_description: string
}

export async function optimizeListing({
  title,
  description,
  plan,
}: OptimizeListingParams): Promise<OptimizeListingResult> {
  const prompt = `Optimize this Etsy listing for maximum sales conversion.

Current title: ${title}

Current description: ${description}

Output JSON with ONLY these fields:
- optimized_title: string (stronger hook, emotional appeal, buyer intent keywords, max 140 chars)
- optimized_description: string (enhanced emotional tone, clearer benefits, stronger CTA, max 700 chars)

Make it more compelling, add urgency, emphasize benefits, and include a clear call-to-action.`

  try {
    const { result } = await callGeminiAPI(prompt, plan, undefined, true)
    return result as OptimizeListingResult
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    if (errorMessage.startsWith('MODEL_JSON_INVALID:')) {
      const rawText = errorMessage.substring('MODEL_JSON_INVALID:'.length)
      console.warn('First attempt JSON invalid, attempting repair')
      
      try {
        let repaired = await repairJson(rawText, plan, true)
        return repaired as OptimizeListingResult
      } catch (repairError: unknown) {
        console.error('JSON repair failed:', repairError)
        throw new Error('MODEL_JSON_INVALID')
      }
    }
    throw error
  }
}

export async function generateListing({
  description,
  competitorNotes,
  plan,
  imageUrls,
}: GenerateListingParams): Promise<GenerateListingResult> {
  // Detect trademarks in combined text
  let combinedText = description
  if (competitorNotes && competitorNotes.length > 0) {
    combinedText += ' ' + competitorNotes.join(' ')
  }
  const detectedTrademarks = detectTrademarks(combinedText)

  const hasImages = imageUrls && imageUrls.length > 0
  const prompt = buildPrompt(description, competitorNotes, plan, detectedTrademarks, hasImages)

  try {
    // First attempt
    const { result, rawText } = await callGeminiAPI(prompt, plan, imageUrls)
    
    // Post-process to reduce trademark repetition (only for listing results)
    const listingResult = result as GenerateListingResult
    if (detectedTrademarks.length > 0) {
      return sanitizeOutput(listingResult, detectedTrademarks)
    }
    
    return listingResult
  } catch (error: unknown) {
    // If JSON parsing fails, attempt repair
    const errorMessage = error instanceof Error ? error.message : String(error)
    if (errorMessage.startsWith('MODEL_JSON_INVALID:')) {
      const rawText = errorMessage.substring('MODEL_JSON_INVALID:'.length)
      console.warn('First attempt JSON invalid, attempting repair')
      
      try {
        // Attempt repair
        const repaired = await repairJson(rawText, plan) as GenerateListingResult
        
        // Post-process to reduce trademark repetition (only for listing results)
        if (detectedTrademarks.length > 0) {
          return sanitizeOutput(repaired, detectedTrademarks)
        }
        
        return repaired
      } catch (repairError: unknown) {
        console.error('JSON repair failed:', repairError)
        throw new Error('MODEL_JSON_INVALID')
      }
    }
    
    throw error
  }
}
