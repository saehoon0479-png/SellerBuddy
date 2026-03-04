import { NextRequest, NextResponse } from 'next/server'
import { getServerClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { generateListing, optimizeListing } from '@/lib/gemini/generate'
import { randomUUID } from 'node:crypto'

export const dynamic = 'force-dynamic'

interface CompetitorData {
  url: string
  description?: string
  extraDetails?: string
  image_paths?: string[]
}

interface GenerateRequest {
  description: string
  extraDetails?: string
  image_paths?: string[] // Storage paths from upload
  competitors?: CompetitorData[] | string[] // Support both old format (string[]) and new format (CompetitorData[])
  mode?: 'listing' | 'optimize' // Generation mode
}

export async function POST(request: NextRequest) {
  try {
    // #region agent log
    fetch('http://127.0.0.1:7244/ingest/3412338a-0039-465b-a8f8-532fd9041227',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/api/generate/route.ts:22',message:'Route entry',data:{hasAuthHeader:!!request.headers.get('authorization')},timestamp:Date.now(),runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    
    // Use cookie-based Supabase client
    const supabase = getServerClient()
    
    // Get user from cookies (cookie-based auth)
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    // #region agent log
    fetch('http://127.0.0.1:7244/ingest/3412338a-0039-465b-a8f8-532fd9041227',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/api/generate/route.ts:30',message:'User validation result (cookie-based)',data:{hasUser:!!user,hasError:!!userError,errorMessage:userError?.message},timestamp:Date.now(),runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion

    if (userError || !user) {
      return NextResponse.json(
        { error: 'Not authenticated', code: 'AUTH_REQUIRED' },
        { status: 401 }
      )
    }

    // Parse request body
    let body: GenerateRequest
    try {
      body = await request.json()
      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/3412338a-0039-465b-a8f8-532fd9041227',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/api/generate/route.ts:48',message:'Request body parsed',data:{hasDescription:!!body.description,descriptionType:typeof body.description,hasCompetitors:!!body.competitors,competitorsType:Array.isArray(body.competitors) ? (body.competitors.length > 0 ? typeof body.competitors[0] : 'empty') : typeof body.competitors},timestamp:Date.now(),runId:'run1',hypothesisId:'E'})}).catch(()=>{});
      // #endregion
    } catch (parseError) {
      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/3412338a-0039-465b-a8f8-532fd9041227',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/api/generate/route.ts:48',message:'Request body parse error',data:{errorMessage:parseError instanceof Error ? parseError.message : String(parseError)},timestamp:Date.now(),runId:'run1',hypothesisId:'E'})}).catch(()=>{});
      // #endregion
      return NextResponse.json(
        { error: 'Invalid request body' },
        { status: 400 }
      )
    }

    // Validate required fields
    const hasDescription = body.description && typeof body.description === 'string' && body.description.trim().length > 0
    const hasImages = body.image_paths && Array.isArray(body.image_paths) && body.image_paths.length > 0
    
    if (!hasDescription && !hasImages) {
      return NextResponse.json(
        { code: 'BAD_REQUEST', error: 'Please provide a product description or upload at least one image.' },
        { status: 400 }
      )
    }

    // Use service role client to query profiles
    const serviceClient = createServiceClient()
    const { data: profileData, error: profileError } = await serviceClient
      .schema('public')
      .from('profiles')
      .select('plan, generations_used, last_generate_at')
      .eq('user_id', user.id)
      .maybeSingle()

    // #region agent log
    fetch('http://127.0.0.1:7244/ingest/3412338a-0039-465b-a8f8-532fd9041227',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/api/generate/route.ts:59',message:'Profile fetch result',data:{hasProfile:!!profileData,hasError:!!profileError,errorMessage:profileError?.message,plan:profileData?.plan,generationsUsed:profileData?.generations_used},timestamp:Date.now(),runId:'run1',hypothesisId:'B,F'})}).catch(()=>{});
    // #endregion

    if (profileError) {
      console.error('Profile fetch error:', profileError)
      return NextResponse.json(
        { code: 'GENERATION_ERROR', error: 'Failed to fetch user profile. Please try again.' },
        { status: 502 }
      )
    }

    if (!profileData) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    // Check mode and PRO requirement for optimize
    const modeRaw = body.mode as string | undefined
    if (modeRaw && modeRaw !== 'listing' && modeRaw !== 'optimize') {
      return NextResponse.json(
        { code: 'BAD_REQUEST', error: 'Unsupported mode. Use listing or optimize.' },
        { status: 400 }
      )
    }
    const mode: 'listing' | 'optimize' = modeRaw === 'optimize' ? 'optimize' : 'listing'
    if (mode === 'optimize' && profileData.plan !== 'pro') {
      return NextResponse.json(
        { error: 'Optimize requires Pro plan', code: 'PRO_REQUIRED' },
        { status: 403 }
      )
    }

    // Enforce generation limits
    // #region agent log
    fetch('http://127.0.0.1:7244/ingest/3412338a-0039-465b-a8f8-532fd9041227',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/api/generate/route.ts:78',message:'Plan check before enforcement',data:{plan:profileData.plan,generationsUsed:profileData.generations_used,freeCheck:profileData.plan === 'free' && profileData.generations_used >= 1,proCheck:profileData.plan === 'pro' && profileData.generations_used >= 50},timestamp:Date.now(),runId:'run1',hypothesisId:'B'})}).catch(()=>{});
    // #endregion
    if (profileData.plan === 'free' && profileData.generations_used >= 1) {
      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/3412338a-0039-465b-a8f8-532fd9041227',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/api/generate/route.ts:80',message:'FREE plan blocked - 429',data:{generationsUsed:profileData.generations_used},timestamp:Date.now(),runId:'run1',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
      return NextResponse.json(
        { error: 'Free plan limit reached', code: 'FREE_LIMIT', remaining: 0 },
        { status: 429 }
      )
    }

    if (profileData.plan === 'pro' && profileData.generations_used >= 50) {
      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/3412338a-0039-465b-a8f8-532fd9041227',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/api/generate/route.ts:86',message:'PRO plan blocked - 403',data:{generationsUsed:profileData.generations_used},timestamp:Date.now(),runId:'run1',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
      return NextResponse.json(
        { code: 'limit_reached', message: 'Monthly limit reached.' },
        { status: 403 }
      )
    }

    // Enforce image count limits (defense in depth)
    const imagePaths = body.image_paths || []
    const imageLimit = profileData.plan === 'pro' ? 3 : 1
    if (imagePaths.length > imageLimit) {
      return NextResponse.json(
        {
          code: 'image_limit_exceeded',
          message: `Maximum ${imageLimit} image(s) allowed for ${profileData.plan} plan`,
          limit: imageLimit,
        },
        { status: 403 }
      )
    }

    // Atomically increment generations_used and get updated profile
    const { data: updatedProfile, error: updateError } = await serviceClient
      .schema('public')
      .from('profiles')
      .update({ generations_used: profileData.generations_used + 1 })
      .eq('user_id', user.id)
      .select('plan, generations_used')
      .single()

    if (updateError || !updatedProfile) {
      console.error('Profile update error:', updateError)
      return NextResponse.json(
        { code: 'GENERATION_ERROR', error: 'Failed to update profile. Please try again.' },
        { status: 502 }
      )
    }

    // Rate limit check (before calling Gemini)
    const now = new Date()
    if (profileData.last_generate_at) {
      const lastGenerateAt = new Date(profileData.last_generate_at)
      const diffMs = now.getTime() - lastGenerateAt.getTime()
      if (diffMs < 2000) {
        return NextResponse.json('rate_limited', { status: 429 })
      }
    }

    // Update last_generate_at
    const { error: rateLimitUpdateError } = await serviceClient
      .schema('public')
      .from('profiles')
      .update({ last_generate_at: now.toISOString() })
      .eq('user_id', user.id)

    if (rateLimitUpdateError) {
      console.error('Failed to update last_generate_at:', rateLimitUpdateError)
      // Continue anyway, rate limit update is best-effort
    }

    // Generate signed URLs for images (if any) for Gemini Vision
    let signedImageUrls: string[] = []
    let totalImageSizeBytes = 0
    const MAX_PAYLOAD_SIZE = 7 * 1024 * 1024 // 7MB
    const HEAD_TIMEOUT_MS = 800 // 800ms per HEAD request
    
    if (imagePaths.length > 0) {
      for (const path of imagePaths) {
        try {
          const { data, error } = await serviceClient.storage
            .from('listing-images')
            .createSignedUrl(path, 60 * 60) // 1 hour

          if (error || !data) {
            console.error(`Failed to create signed URL for ${path}:`, error)
            // Continue without this image
          } else {
            // Estimate image size by fetching headers with timeout
            try {
              const headTimeoutPromise = new Promise<never>((_, reject) => {
                setTimeout(() => reject(new Error('HEAD_TIMEOUT')), HEAD_TIMEOUT_MS)
              })
              const headResponse = await Promise.race([
                fetch(data.signedUrl, { method: 'HEAD' }),
                headTimeoutPromise,
              ])
              const contentLength = headResponse.headers.get('content-length')
              if (contentLength) {
                const sizeBytes = parseInt(contentLength, 10)
                // Base64 encoding increases size by ~33%, estimate total
                const estimatedBase64Size = sizeBytes * 1.33
                totalImageSizeBytes += estimatedBase64Size
              }
            } catch (headError) {
              // If HEAD fails or times out, estimate conservatively (assume 1MB per image)
              totalImageSizeBytes += 1.33 * 1024 * 1024
            }
            
            signedImageUrls.push(data.signedUrl)
          }
        } catch (error) {
          console.error(`Error creating signed URL for ${path}:`, error)
          // Continue without this image
        }
      }
      
      // Check total payload size
      if (totalImageSizeBytes > MAX_PAYLOAD_SIZE) {
        return NextResponse.json(
          { code: 'PAYLOAD_TOO_LARGE', error: 'Please upload smaller images. Total image size exceeds the limit.' },
          { status: 413 }
        )
      }
    }

    // Process competitors (support both old string[] and new CompetitorData[] format)
    // Only include competitors with valid URLs
    let competitorNotes: string[] = []
    if (body.competitors) {
      if (Array.isArray(body.competitors) && body.competitors.length > 0) {
        if (typeof body.competitors[0] === 'string') {
          // Old format: string[] - filter empty strings
          competitorNotes = (body.competitors as string[]).filter(c => c && c.trim().length > 0)
        } else {
          // New format: CompetitorData[] - filter empty URLs
          const competitorData = body.competitors as CompetitorData[]
          competitorNotes = competitorData
            .filter(comp => comp.url && comp.url.trim().length > 0)
            .map(comp => {
              let note = comp.url.trim()
              if (comp.description?.trim()) {
                note += `\nDescription: ${comp.description.trim()}`
              }
              if (comp.extraDetails?.trim()) {
                note += `\nExtra details: ${comp.extraDetails.trim()}`
              }
              return note
            })
        }
      }
    }

    // Build full description with extraDetails if provided
    let fullDescription = body.description
    if (body.extraDetails?.trim()) {
      fullDescription += `\n\nExtra details: ${body.extraDetails.trim()}`
    }

    // Generate listing using Gemini with timeout
    const requestId = randomUUID()
    // #region agent log
    fetch('http://127.0.0.1:7244/ingest/3412338a-0039-465b-a8f8-532fd9041227',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/api/generate/route.ts:196',message:'Before Gemini call',data:{hasApiKey:!!process.env.GEMINI_API_KEY,plan:updatedProfile.plan,hasCompetitorNotes:competitorNotes.length > 0,imageUrlsCount:signedImageUrls.length},timestamp:Date.now(),runId:'run1',hypothesisId:'C,D'})}).catch(()=>{});
    // #endregion
    let result
    try {
      // Create timeout promise for entire generation operation
      const timeoutMs = 30000 // 30 seconds
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error('TIMEOUT'))
        }, timeoutMs)
      })

      // Race between generation and timeout
      if (mode === 'optimize') {
        const titleMatch = body.description.match(/^([\s\S]+?)\n\n([\s\S]+)$/)
        const title = titleMatch ? titleMatch[1] : body.description
        const description = titleMatch ? titleMatch[2] : body.description
        result = await Promise.race([
          optimizeListing({
            title,
            description,
            plan: updatedProfile.plan,
          }),
          timeoutPromise,
        ])
      } else {
        result = await Promise.race([
          generateListing({
            description: fullDescription,
            competitorNotes: competitorNotes.length > 0 ? competitorNotes : undefined,
            plan: updatedProfile.plan,
            imageUrls: signedImageUrls.length > 0 ? signedImageUrls : undefined,
          }),
          timeoutPromise,
        ])
      }
      
      // #region agent log
      const listingResult = result as any
      fetch('http://127.0.0.1:7244/ingest/3412338a-0039-465b-a8f8-532fd9041227',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/api/generate/route.ts:205',message:'Gemini call success',data:{hasTitle:!!listingResult.title,tagsCount:listingResult.tags?.length,hasDescription:!!listingResult.description},timestamp:Date.now(),runId:'run1',hypothesisId:'D'})}).catch(()=>{});
      // #endregion
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      
      const requestId = (error as any)?.requestId || randomUUID()
      
      // Handle timeout
      if (errorMessage === 'TIMEOUT') {
        return NextResponse.json(
          {
            ok: false,
            error: {
              code: 'TIMEOUT',
              message: 'Generation timed out. Please try again.',
              requestId,
            },
          },
          { status: 200 }
        )
      }
      
      // Handle JSON invalid error
      if (errorMessage === 'MODEL_JSON_INVALID') {
        return NextResponse.json(
          { code: 'MODEL_JSON_INVALID', error: 'AI returned invalid JSON. Please try again.' },
          { status: 502 }
        )
      }
      
      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/3412338a-0039-465b-a8f8-532fd9041227',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/api/generate/route.ts:207',message:'Gemini call error',data:{errorMessage,errorStack:error instanceof Error ? error.stack : undefined},timestamp:Date.now(),runId:'run1',hypothesisId:'C,D'})}).catch(()=>{});
      // #endregion
      console.error('GEMINI_ERROR', {
        message: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
      })
      return NextResponse.json(
        { code: 'GENERATION_ERROR', error: `Failed to generate listing: ${errorMessage}` },
        { status: 502 }
      )
    }

    // Validate response (additional check)
    if (mode === 'optimize') {
      const optimizeResult = result as any
      if (!optimizeResult || !optimizeResult.optimized_title || !optimizeResult.optimized_description) {
        console.error('Invalid Optimize response:', result)
        return NextResponse.json(
          { code: 'MODEL_EMPTY', error: 'AI returned an empty response. Try again.' },
          { status: 502 }
        )
      }
    } else {
      const listingResult = result as any
      if (!listingResult || !listingResult.title || !Array.isArray(listingResult.tags) || listingResult.tags.length !== 13 || !listingResult.description) {
        console.error('Invalid Gemini response:', result)
        return NextResponse.json(
          { code: 'MODEL_EMPTY', error: 'AI returned an empty response. Try again.' },
          { status: 502 }
        )
      }
      
      // Check for empty strings
      if (!listingResult.title.trim() || !listingResult.description.trim() || listingResult.tags.some((tag: string) => !tag || !tag.trim())) {
        console.error('Empty fields in Gemini response:', result)
        return NextResponse.json(
          { code: 'MODEL_EMPTY', error: 'AI returned an empty response. Try again.' },
          { status: 502 }
        )
      }
    }

    // Process competitors for storage (extract URLs for backward compatibility)
    let competitorUrlsForStorage: string[] = []
    if (body.competitors) {
      if (Array.isArray(body.competitors) && body.competitors.length > 0) {
        if (typeof body.competitors[0] === 'string') {
          competitorUrlsForStorage = body.competitors as string[]
        } else {
          competitorUrlsForStorage = (body.competitors as CompetitorData[]).map(comp => comp.url)
        }
      }
    }

    // Insert generation record only for listing mode
    let generationId: number | null = null
    if (mode === 'listing') {
      const { data: generation, error: insertError } = await serviceClient
        .schema('public')
      .from('generations')
      .insert([
        {
          user_id: user.id,
          description: body.description,
            image_urls: imagePaths, // Store storage paths
            competitor_urls: competitorUrlsForStorage,
          result_json: result,
        },
      ])
        .select('id')
      .single()

      if (insertError || !generation) {
        console.error('Generation insert error:', insertError)
        return NextResponse.json(
          { code: 'GENERATION_ERROR', error: 'Failed to save generation. Please try again.' },
          { status: 502 }
        )
      }
      generationId = generation.id
    }

    // Return success response
    if (mode === 'optimize') {
      return NextResponse.json({
        profile: {
          plan: updatedProfile.plan,
          generations_used: updatedProfile.generations_used,
        },
        result: {
          optimized: result,
        },
      })
    } else {
      return NextResponse.json({
        generationId: generationId,
        profile: {
          plan: updatedProfile.plan,
          generations_used: updatedProfile.generations_used,
        },
        result: result,
      })
    }
  } catch (error) {
    // #region agent log
    fetch('http://127.0.0.1:7244/ingest/3412338a-0039-465b-a8f8-532fd9041227',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/api/generate/route.ts:270',message:'Top-level catch error',data:{errorMessage:error instanceof Error ? error.message : String(error),errorStack:error instanceof Error ? error.stack : undefined},timestamp:Date.now(),runId:'run1',hypothesisId:'A,B,C,D,E,F'})}).catch(()=>{});
    // #endregion
    console.error('Error in /api/generate:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
