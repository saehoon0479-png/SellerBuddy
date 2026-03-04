import { createHash } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { getServerClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { generateDeepStrategyStep2KV } from '@/lib/gemini/deepV2'
import type { CompetitorSummary } from '@/lib/gemini/deepV2'
import { fetchCompetitorPage } from '@/lib/competitors/fetchCompetitorPage'

export const dynamic = 'force-dynamic'

type CompetitorIn = {
  url?: string
  description?: string
  image_paths?: string[]
}

type DeepStrategyRequest = {
  description: string
  image_paths?: string[]
  competitors?: CompetitorIn[]
}

// ---------------------------------------------------------------------------
// In-memory caches
// ---------------------------------------------------------------------------

// Per-URL competitor summary cache — 30-minute TTL
interface SummaryCacheEntry {
  summary: CompetitorSummary
  expiresAt: number
}
const summaryCache = new Map<string, SummaryCacheEntry>()
const SUMMARY_CACHE_TTL_MS = 30 * 60 * 1000

// Full strategy result cache — 15-minute TTL
interface ResultCacheEntry {
  data: { kv: Record<string, string>; rawText: string }
  expiresAt: number
}
const resultCache = new Map<string, ResultCacheEntry>()
const RESULT_CACHE_TTL_MS = 15 * 60 * 1000

// SHA-256 hash of the exact inputs sent to Gemini — same inputs always hit the same cache entry.
function makeResultCacheKey(description: string, imagePaths: string[], competitors: CompetitorIn[]): string {
  const payload = JSON.stringify({
    d: description,
    i: [...(imagePaths || [])].sort(),
    c: (competitors || []).map((c) => ({
      u: String(c.url || '').trim(),
      n: String(c.description || '').trim().slice(0, 180),
    })),
  })
  return createHash('sha256').update(payload).digest('hex')
}

// ---------------------------------------------------------------------------
// Keyword extraction helper
// ---------------------------------------------------------------------------
const STOP_WORDS = new Set([
  'the','and','for','with','this','that','from','your','have','will',
  'been','more','than','also','into','over','each','when','they','them',
  'etsy','shop','item','made','hand','free','sale','gift','best','fast',
])

function extractKeywords(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 3 && !STOP_WORDS.has(w))
    .slice(0, 12)
    .join(', ')
}

// ---------------------------------------------------------------------------
// Build structured competitor summaries (fetch URLs in parallel, cache results)
// MAX 1 image_path per competitor — trim silently
// ---------------------------------------------------------------------------
async function buildCompetitorInsights(comps: CompetitorIn[] | undefined): Promise<CompetitorSummary[]> {
  const items = (comps || [])
    .filter((c) => String(c?.url || '').trim().length > 0 || String(c?.description || '').trim().length > 0)
    .slice(0, 3)  // max 3 competitors
    .map((c) => ({
      ...c,
      // Enforce max 1 image per competitor (trim silently)
      image_paths: (c.image_paths || []).slice(0, 1),
    }))

  if (items.length === 0) return []

  // Cache key includes url + notes + hasImage so changing notes/image busts the cache
  const makeSummaryCacheKey = (url: string, notes: string, hasImage: boolean) =>
    `${url}|${notes.slice(0, 50)}|${hasImage ? '1' : '0'}`

  // Check per-URL summary cache before fetching
  const urlsToFetch: { index: number; url: string }[] = []
  const cachedSummaries = new Map<string, CompetitorSummary>()

  for (let i = 0; i < items.length; i++) {
    const url = String(items[i].url || '').trim()
    if (!url) continue

    const notes = String(items[i].description || '').trim()
    const hasImage = (items[i].image_paths?.length ?? 0) > 0
    const cKey = makeSummaryCacheKey(url, notes, hasImage)
    const cached = summaryCache.get(cKey)
    if (cached && Date.now() < cached.expiresAt) {
      cachedSummaries.set(cKey, { ...cached.summary, index: i + 1 })
    } else {
      urlsToFetch.push({ index: i, url })
    }
  }

  // Fetch uncached URLs in parallel
  const fetchResults = await Promise.allSettled(
    urlsToFetch.map(({ url }) => fetchCompetitorPage(url))
  )

  // Build summaries
  return items.map((comp, i): CompetitorSummary => {
    const url      = String(comp.url || '').trim()
    const notes    = String(comp.description || '').trim()
    const hasImage = (comp.image_paths?.length ?? 0) > 0
    const cKey     = makeSummaryCacheKey(url, notes, hasImage)

    // Use cached summary if available
    if (url && cachedSummaries.has(cKey)) {
      return cachedSummaries.get(cKey)!
    }

    // Find the fetch result for this URL
    const fetchIdx = urlsToFetch.findIndex((u) => u.index === i)
    const res = fetchIdx >= 0 && fetchResults[fetchIdx].status === 'fulfilled'
      ? fetchResults[fetchIdx].value
      : null
    const page = res?.ok ? res : null

    const titleText   = (page?.ogTitle || page?.title || '').slice(0, 90)
    const descText    = (page?.ogDescription || page?.description || '').slice(0, 200)
    const rawKeywords = extractKeywords(`${titleText} ${descText}`).slice(0, 110)
    const userNotes   = notes.slice(0, 180)

    // Cap snippet at 400 chars — formatOneCompetitor() will further trim within the 800-char section budget
    const snippet = (page?.textSnippet || '').slice(0, 400)

    const summary: CompetitorSummary = {
      index:    i + 1,
      url,
      title:    titleText,
      notes:    userNotes,
      keywords: rawKeywords,
      snippet,
      fetchOk:  !!page,
      hasImage,
    }

    // Cache keyed by (url + notes + hasImage)
    if (url) {
      summaryCache.set(cKey, { summary, expiresAt: Date.now() + SUMMARY_CACHE_TTL_MS })
    }

    return summary
  })
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest) {
  try {
    const supabase = getServerClient()
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ ok: false, error: { code: 'AUTH_REQUIRED', message: 'Not authenticated' } }, { status: 401 })
    }

    const body = (await request.json()) as DeepStrategyRequest
    const description = String(body?.description || '').trim()
    if (!description) {
      return NextResponse.json({ ok: false, error: { code: 'BAD_REQUEST', message: 'Description is required.' } }, { status: 400 })
    }

    const serviceClient = createServiceClient()
    const { data: profileData, error: profileError } = await serviceClient
      .schema('public')
      .from('profiles')
      .select('plan, generations_used, last_generate_at')
      .eq('user_id', user.id)
      .maybeSingle()

    if (profileError || !profileData) {
      return NextResponse.json({ ok: false, error: { code: 'GENERATION_ERROR', message: 'Failed to fetch user profile.' } })
    }

    if (profileData.plan !== 'pro') {
      return NextResponse.json({ ok: false, error: { code: 'PRO_REQUIRED', message: 'Deep Strategy requires Pro plan.' } }, { status: 403 })
    }

    if (profileData.generations_used >= 50) {
      return NextResponse.json({ ok: false, error: { code: 'limit_reached', message: 'Monthly limit reached.' } }, { status: 403 })
    }

    if (profileData.last_generate_at) {
      const diffMs = Date.now() - new Date(profileData.last_generate_at).getTime()
      if (diffMs < 2000) {
        return NextResponse.json({ ok: false, error: { code: 'RATE_LIMITED', message: 'Too many requests' } }, { status: 429 })
      }
    }

    // Check full result cache before touching Gemini
    const cacheKey = makeResultCacheKey(description, body?.image_paths || [], body?.competitors || [])
    const cachedResult = resultCache.get(cacheKey)
    if (cachedResult && Date.now() < cachedResult.expiresAt) {
      // Serve cached result — still deduct a generation for accounting consistency
      // (but skip the actual Gemini call)
      const nowIso = new Date().toISOString()
      const { data: updatedProfile, error: updateError } = await serviceClient
        .schema('public')
        .from('profiles')
        .update({ generations_used: profileData.generations_used + 1, last_generate_at: nowIso })
        .eq('user_id', user.id)
        .select('plan, generations_used')
        .single()

      if (updateError || !updatedProfile) {
        return NextResponse.json({ ok: false, error: { code: 'GENERATION_ERROR', message: 'Failed to update profile.' } })
      }

      return NextResponse.json({
        ok: true,
        profile: { plan: updatedProfile.plan, generations_used: updatedProfile.generations_used },
        data: { ...cachedResult.data.kv, rawText: cachedResult.data.rawText },
      })
    }

    // Build structured competitor insights (fetches URLs in parallel, caps images to 1)
    const competitorInsights = await buildCompetitorInsights(body?.competitors)

    const nowIso = new Date().toISOString()
    const { data: updatedProfile, error: updateError } = await serviceClient
      .schema('public')
      .from('profiles')
      .update({
        generations_used: profileData.generations_used + 1,
        last_generate_at: nowIso,
      })
      .eq('user_id', user.id)
      .select('plan, generations_used')
      .single()

    if (updateError || !updatedProfile) {
      return NextResponse.json({ ok: false, error: { code: 'GENERATION_ERROR', message: 'Failed to update profile.' } })
    }

    const { kv, rawText } = await generateDeepStrategyStep2KV({
      description,
      competitorInsights,
    })

    // Store in result cache
    resultCache.set(cacheKey, { data: { kv, rawText }, expiresAt: Date.now() + RESULT_CACHE_TTL_MS })

    return NextResponse.json({
      ok: true,
      profile: {
        plan: updatedProfile.plan,
        generations_used: updatedProfile.generations_used,
      },
      data: { ...kv, rawText },
    })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)

    if (msg === 'MODEL_EMPTY') {
      return NextResponse.json({
        ok: false,
        error: { code: 'MODEL_EMPTY', message: 'AI returned incomplete deep strategy. Please retry.' },
      })
    }

    return NextResponse.json({
      ok: false,
      error: { code: 'GENERATION_ERROR', message: msg || 'Internal server error' },
    })
  }
}
