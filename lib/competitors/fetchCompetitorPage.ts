/**
 * Lightweight competitor URL fetcher
 * Extracts title, meta description, og tags, and readable text snippet
 * NO heavy scraping - only first 500KB of HTML
 * Caches results in-memory for 30 minutes by URL
 */

export interface CompetitorPageData {
  ok: true
  url: string
  title: string
  description: string
  ogTitle: string
  ogDescription: string
  textSnippet: string  // up to 8000 chars of visible text
}

export interface CompetitorPageError {
  ok: false
  url: string
  reason: string
}

export type CompetitorPageResult = CompetitorPageData | CompetitorPageError

// ---------------------------------------------------------------------------
// In-memory URL cache — 30-minute TTL
// ---------------------------------------------------------------------------
interface UrlCacheEntry {
  result: CompetitorPageResult
  expiresAt: number
}
const urlPageCache = new Map<string, UrlCacheEntry>()
const URL_CACHE_TTL_MS = 30 * 60 * 1000

function getCachedPage(url: string): CompetitorPageResult | null {
  const entry = urlPageCache.get(url)
  if (!entry) return null
  if (Date.now() > entry.expiresAt) {
    urlPageCache.delete(url)
    return null
  }
  return entry.result
}

function setCachedPage(url: string, result: CompetitorPageResult): void {
  urlPageCache.set(url, { result, expiresAt: Date.now() + URL_CACHE_TTL_MS })
}

// ---------------------------------------------------------------------------

export async function fetchCompetitorPage(url: string): Promise<CompetitorPageResult> {
  // Return cached result if still fresh
  const cached = getCachedPage(url)
  if (cached) return cached

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 7000) // 7-second timeout

  try {
    const response = await fetch(url, {
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; SellerBuddyBot/1.0)',
        'Accept': 'text/html,application/xhtml+xml',
      },
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    const contentType = response.headers.get('content-type') || ''
    if (!contentType.includes('text/html')) {
      const res: CompetitorPageResult = { ok: false, url, reason: `Not HTML content: ${contentType}` }
      setCachedPage(url, res)
      return res
    }

    if (!response.ok) {
      const res: CompetitorPageResult = { ok: false, url, reason: `HTTP ${response.status}` }
      setCachedPage(url, res)
      return res
    }

    // Read body up to 500KB
    const reader = response.body?.getReader()
    if (!reader) {
      const res: CompetitorPageResult = { ok: false, url, reason: 'No response body' }
      setCachedPage(url, res)
      return res
    }

    const decoder = new TextDecoder()
    let html = ''
    const maxBytes = 500 * 1024 // 500KB
    let totalBytes = 0

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      totalBytes += value.length
      if (totalBytes > maxBytes) {
        const remaining = maxBytes - (totalBytes - value.length)
        html += decoder.decode(value.slice(0, remaining), { stream: true })
        break
      }
      html += decoder.decode(value, { stream: true })
    }

    // Extract <title>
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i)
    const title = titleMatch ? titleMatch[1].trim() : ''

    // Extract meta description
    const metaDescMatch = html.match(/<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i)
      ?? html.match(/<meta\s+content=["']([^"']+)["']\s+name=["']description["']/i)
    const description = metaDescMatch ? metaDescMatch[1].trim() : ''

    // Extract og:title
    const ogTitleMatch = html.match(/<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i)
      ?? html.match(/<meta\s+content=["']([^"']+)["']\s+property=["']og:title["']/i)
    const ogTitle = ogTitleMatch ? ogTitleMatch[1].trim() : ''

    // Extract og:description
    const ogDescMatch = html.match(/<meta\s+property=["']og:description["']\s+content=["']([^"']+)["']/i)
      ?? html.match(/<meta\s+content=["']([^"']+)["']\s+property=["']og:description["']/i)
    const ogDescription = ogDescMatch ? ogDescMatch[1].trim() : ''

    // Extract readable text: strip scripts, styles, comments, then tags
    const textSnippet = html
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, '')
      .replace(/<svg[^>]*>[\s\S]*?<\/svg>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 8000) // hard cap at 8000 chars

    const res: CompetitorPageResult = {
      ok: true,
      url,
      title,
      description,
      ogTitle,
      ogDescription,
      textSnippet,
    }
    setCachedPage(url, res)
    return res
  } catch (error: unknown) {
    clearTimeout(timeoutId)
    const reason = error instanceof Error ? error.message : String(error)
    const res: CompetitorPageResult = {
      ok: false,
      url,
      reason: reason.includes('aborted') ? 'Timeout' : reason,
    }
    // Cache failures briefly (2 min) to avoid hammering dead URLs
    urlPageCache.set(url, { result: res, expiresAt: Date.now() + 2 * 60 * 1000 })
    return res
  }
}
