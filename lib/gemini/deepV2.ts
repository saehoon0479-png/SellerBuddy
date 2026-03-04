import { GoogleGenAI } from '@google/genai'

// Structured per-competitor summary built in the route before calling Gemini.
// Each section is hard-capped to 800 chars in formatOneCompetitor().
// Total competitor context for 3 competitors: ≤ 2400 chars.
export type CompetitorSummary = {
  index: number       // 1-based display label
  url: string         // original URL (may be empty)
  title: string       // page og:title / title, max 90 chars
  notes: string       // user-provided notes, max 180 chars
  keywords: string    // comma-sep keywords extracted from title+desc, max 110 chars
  snippet: string     // visible text from page, max 400 chars
  fetchOk: boolean    // whether the URL was fetched successfully
  hasImage: boolean   // whether the user uploaded a competitor image
}

export type DeepStrategyV2Params = {
  description: string
  competitorInsights?: CompetitorSummary[]
}

export type DeepStrategyKVResult = {
  kv: Record<string, string>
  rawText: string
}

// ---------------------------------------------------------------------------
// Text extraction — handles every shape the @google/genai SDK might return
// ---------------------------------------------------------------------------
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getResultText(r: any): Promise<string> {
  if (typeof r?.text === 'string' && r.text.trim()) return r.text
  if (typeof r?.text === 'function') {
    const v = r.text()
    const resolved = v instanceof Promise ? await v : v
    if (typeof resolved === 'string' && resolved.trim()) return resolved
  }
  if (typeof r?.response?.text === 'function') {
    const v = r.response.text()
    const resolved = v instanceof Promise ? await v : v
    if (typeof resolved === 'string' && resolved.trim()) return resolved
  }
  const candidates = r?.candidates ?? r?.response?.candidates ?? []
  if (Array.isArray(candidates) && candidates.length > 0) {
    const parts: { text?: string }[] = candidates[0]?.content?.parts ?? []
    const joined = parts.map((p) => p?.text ?? '').join('')
    if (joined.trim()) return joined
  }
  return ''
}

// Matches a KEY line: all-caps words (optionally separated by _ or spaces), then colon.
const KEY_LINE_RE = /^([A-Z][A-Z0-9]*(?:[_\s][A-Z][A-Z0-9]*)*):\s*(.*)$/

function parseKV(text: string): Record<string, string> {
  const out: Record<string, string> = {}
  const lines = String(text || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')

  let currentKey: string | null = null
  const valueLines: string[] = []

  const flush = () => {
    if (currentKey !== null) {
      out[currentKey] = valueLines.join('\n').trim()
    }
  }

  for (const raw of lines) {
    const line = raw.trim()
    const keyMatch = line.match(KEY_LINE_RE)

    if (keyMatch) {
      flush()
      currentKey = keyMatch[1].trim().replace(/\s+/g, '_')
      valueLines.length = 0
      const inlineValue = keyMatch[2].trim()
      if (inlineValue) valueLines.push(inlineValue)
    } else if (currentKey !== null && line) {
      valueLines.push(line)
    }
  }
  flush()
  return out
}

const REQUIRED_KEYS = [
  'HOOK',
  'POSITIONING',
  'UNDERSERVED_ANGLE',
  'MARKET_SATURATION',
  'KEYWORD_WAR_PLAN',
  'CREATOR_PROMPT',
] as const

const KEY_MIN_LEN: Record<string, number> = {
  HOOK:              120,
  POSITIONING:       250,
  UNDERSERVED_ANGLE: 220,
  MARKET_SATURATION: 200,
  KEYWORD_WAR_PLAN:  120,
  CREATOR_PROMPT:    400,
}

function getMissingKeys(kv: Record<string, string>): string[] {
  return REQUIRED_KEYS.filter((k) => (kv[k]?.trim() ?? '').length < (KEY_MIN_LEN[k] ?? 50))
}

// ---------------------------------------------------------------------------
// Format one competitor section — hard-capped at 800 chars total.
// Budget: header labels ~400 chars, remaining chars go to content snippet.
// ---------------------------------------------------------------------------
const SECTION_CHAR_CAP = 800

function formatOneCompetitor(c: CompetitorSummary): string {
  const lines: string[] = [`[COMPETITOR_${c.index}]`]
  if (c.url)      lines.push(`URL: ${c.url.slice(0, 80)}`)
  if (c.title)    lines.push(`Title: ${c.title.slice(0, 90)}`)
  if (c.keywords) lines.push(`Keywords: ${c.keywords.slice(0, 110)}`)
  if (c.notes)    lines.push(`Notes: ${c.notes.slice(0, 180)}`)
  if (c.hasImage) lines.push(`Image: [1 competitor image provided]`)

  const header = lines.join('\n')
  // Reserve 10 chars for "Content: " label + newline
  const snippetBudget = SECTION_CHAR_CAP - header.length - 10
  if (c.snippet && snippetBudget > 30) {
    lines.push(`Content: ${c.snippet.slice(0, snippetBudget)}`)
  }

  // Final hard cap — should not be needed, but guards against edge cases
  return lines.join('\n').slice(0, SECTION_CHAR_CAP)
}

function formatCompetitorContext(insights: CompetitorSummary[] | undefined): string {
  if (!insights || insights.length === 0) return '(none provided)'
  return insights.map(formatOneCompetitor).join('\n\n')
}

// Hard cap on product description sent to Gemini — keeps total prompt small
const DESC_CHAR_CAP = 600

function buildPrompt(args: {
  description: string
  competitorInsights?: CompetitorSummary[]
}): string {
  const { description, competitorInsights } = args

  const cappedDesc = description.slice(0, DESC_CHAR_CAP)
  const competitorBlock = formatCompetitorContext(competitorInsights)
  const competitorCount = competitorInsights?.length ?? 0
  const competitorRef = competitorCount === 0
    ? 'competitors'
    : competitorCount === 1
      ? 'the 1 competitor above'
      : `all ${competitorCount} competitors above`

  const comparisonRules = competitorCount === 0
    ? ''
    : competitorCount === 1
      ? '- Reference the competitor above directly by title or keyword in POSITIONING and UNDERSERVED_ANGLE.\n'
      : `- POSITIONING must reference at least 2 of the ${competitorCount} competitors by name or title.\n- Identify the shared structural pattern across all ${competitorCount} competitors and name the collective gap.\n- In UNDERSERVED_ANGLE, explain WHY each competitor structurally fails the target buyer (pricing model, keyword focus, or product mismatch).\n`

  return `
You are a senior competitive market strategist for Etsy sellers. Your output must be decision-grade — specific, evidence-based, and drawn directly from the competitor data provided. No fluff. No generic branding language. No JSON. No markdown. No bullets outside the defined formats below.
Do NOT stop until all 6 keys are complete and meet minimum lengths.

SECTION CONTRACT:
HOOK: 1–2 sentences. Identify the structural gap that ALL competitors share (what none of them are doing). Explain why this product is the structural solution to that gap. Length: 120–220 chars.
POSITIONING: Decision-grade strategy statement. Must reference at least ${competitorCount >= 2 ? '2 competitors by name or title' : 'the competitor above directly'}. State: who we target, what structural gap we occupy, and exactly how we differentiate from the specific competitive landscape. Length: 250–500 chars.
UNDERSERVED_ANGLE: Name a concrete buyer profile (demographic + psychographic). Explain WHY ${competitorRef} structurally fail to serve them — cite pricing model, keyword focus, or product category mismatch. Not a slogan. Length: 220–400 chars.
MARKET_SATURATION: EXACT 4-line format (no deviations):
Keyword overlap: <High/Medium/Low> — <1 sentence on shared keyword patterns across competitors>
Price-tier: <High/Medium/Low clustering> — <1 sentence on price band distribution>
Positioning similarity: <High/Medium/Low> — <1 sentence on how interchangeable competitor positioning is>
Risk profile: <Low/Medium/High> — <1 sentence on overall market entry risk given the above>
KEYWORD_WAR_PLAN: EXACT 4-line format (each sub-key on its own line, starting with the label):
TRAFFIC_CAPTURE > kw1, kw2, kw3, kw4, kw5 (high-intent category terms; ≥2 non-brand differentiators)
DIFFERENTIATION_DEFENSE > kw1, kw2, kw3, kw4 (style/material/fit/use-case modifiers that competitors are NOT targeting)
CONVERSION_TRIGGER > phrase1, phrase2, phrase3 (long-tail conversion phrases e.g. "cozy fleece hoodie women")
KEYWORDS_TO_AVOID > term1, term2, term3 (terms that signal the wrong buyer segment or are over-saturated)
CREATOR_PROMPT: Listing instruction blueprint that reflects the strategic gap identified above and the keyword war plan. Must include: target audience statement, tone guidance, 3 emphasis priorities drawn from the competitive gap analysis, 1 specific thing to avoid. Length: 400–700 chars.

RULES:
- HOOK, POSITIONING, UNDERSERVED_ANGLE, CREATOR_PROMPT: each key on its own line, inline value: KEYNAME: <value>
- MARKET_SATURATION: key on its own line followed by 4 sub-lines (Keyword overlap / Price-tier / Positioning similarity / Risk profile) — NO extra text between sub-lines.
- KEYWORD_WAR_PLAN: key on its own line followed by exactly 4 sub-lines (TRAFFIC_CAPTURE / DIFFERENTIATION_DEFENSE / CONVERSION_TRIGGER / KEYWORDS_TO_AVOID).
- Do NOT write "unknown". Do NOT invent certifications or brand names.
- Do NOT add handmade, artisan, one-of-a-kind, custom made to order, or handcrafted unless the product description explicitly states these characteristics.
- Every section must draw from ${competitorRef}.
${comparisonRules}
Complete this exact template — all 6 keys, nothing else:
HOOK: <1–2 sentences identifying structural gap + why this product is the solution>
POSITIONING: <250–500 char decision-grade statement referencing ≥${competitorCount >= 2 ? '2' : '1'} competitor(s) by name/title>
UNDERSERVED_ANGLE: <220–400 char concrete buyer profile + why competitors structurally fail them>
MARKET_SATURATION:
Keyword overlap: <assessment>
Price-tier: <assessment>
Positioning similarity: <assessment>
Risk profile: <Low/Medium/High> — <rationale>
KEYWORD_WAR_PLAN:
TRAFFIC_CAPTURE > kw1, kw2, kw3, kw4, kw5
DIFFERENTIATION_DEFENSE > kw1, kw2, kw3, kw4
CONVERSION_TRIGGER > phrase1, phrase2, phrase3
KEYWORDS_TO_AVOID > term1, term2, term3
CREATOR_PROMPT: <400–700 char listing blueprint: audience + tone + 3 priorities from gap analysis + 1 avoid>

FINAL CHECK: Verify all 6 keys exist and meet length minimums. Verify MARKET_SATURATION has 4 sub-lines. Verify KEYWORD_WAR_PLAN has 4 sub-lines. If any are missing or too short, rewrite them now.

[OUR PRODUCT]
${cappedDesc}

[COMPETITOR CONTEXT — analyze each before writing]
${competitorBlock}
`.trim()
}

// Per-key format hints used in the repair prompt
const KEY_GUIDES: Record<string, string> = {
  HOOK:              '1–2 sentences: identify structural gap ALL competitors share + why this product is the structural solution, 120–220 chars',
  POSITIONING:       'decision-grade strategy: reference ≥2 competitors by name/title, state target audience + structural gap occupied + exact differentiation, 250–500 chars',
  UNDERSERVED_ANGLE: 'name concrete buyer profile (demographic+psychographic) + explain WHY competitors structurally fail them (pricing/keyword/category mismatch), 220–400 chars',
  MARKET_SATURATION: 'EXACT 4-line format:\nKeyword overlap: <High/Medium/Low> — <assessment>\nPrice-tier: <High/Medium/Low clustering> — <assessment>\nPositioning similarity: <High/Medium/Low> — <assessment>\nRisk profile: <Low/Medium/High> — <rationale>',
  KEYWORD_WAR_PLAN:  'EXACT 4-line format:\nTRAFFIC_CAPTURE > kw1, kw2, kw3, kw4, kw5\nDIFFERENTIATION_DEFENSE > kw1, kw2, kw3, kw4\nCONVERSION_TRIGGER > phrase1, phrase2, phrase3\nKEYWORDS_TO_AVOID > term1, term2, term3',
  CREATOR_PROMPT:    'listing blueprint reflecting strategic gap and war plan: target audience + tone + 3 priorities from competitive gap + 1 avoid, 400–700 chars',
}

function buildRepairPrompt(
  missingKeys: string[],
  description: string,
  competitorInsights: CompetitorSummary[] | undefined
): string {
  const keyLines = missingKeys.map((k) => `${k}: ${KEY_GUIDES[k]}`).join('\n')
  const kwNote = missingKeys.includes('KEYWORD_WAR_PLAN')
    ? '\nKEYWORD_WAR_PLAN must be exactly 4 lines:\nTRAFFIC_CAPTURE > kw1, kw2, kw3\nDIFFERENTIATION_DEFENSE > kw1, kw2, kw3\nCONVERSION_TRIGGER > phrase1, phrase2\nKEYWORDS_TO_AVOID > term1, term2'
    : ''
  return `
You are a senior Etsy listing strategist.
Output ONLY these keys in KEY: value format — nothing else, no extra commentary.${kwNote}

${keyLines}

[OUR PRODUCT]
${description.slice(0, DESC_CHAR_CAP)}

[COMPETITOR CONTEXT]
${formatCompetitorContext(competitorInsights)}
`.trim()
}

// ---------------------------------------------------------------------------
// Competitor-reference validation helpers
// ---------------------------------------------------------------------------
// Matches generic competitor language the model may use instead of citing titles
const COMPETITOR_SIGNAL_RE = /\b(competitor|other listing|other shop|similar listing|rival|unlike other|compared to other)\b/i

function referencesCompetitor(text: string, insights: CompetitorSummary[]): boolean {
  if (!text.trim() || insights.length === 0) return true
  // Accept generic competitor language as sufficient
  if (COMPETITOR_SIGNAL_RE.test(text)) return true
  const lowerText = text.toLowerCase()
  // Accept if any meaningful word (>5 chars) from competitor title/keywords appears
  for (const c of insights) {
    const words = `${c.title} ${c.keywords} ${c.notes}`
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 5)
    if (words.some((w) => lowerText.includes(w))) return true
  }
  return false
}

function getKeysNeedingCompetitorRefs(
  kv: Record<string, string>,
  insights: CompetitorSummary[]
): string[] {
  return (['POSITIONING', 'UNDERSERVED_ANGLE'] as const).filter(
    (k) => !referencesCompetitor(kv[k] ?? '', insights)
  )
}

// ---------------------------------------------------------------------------
// Banned-terms enforcement — prevents false craftsmanship / quality claims
// ---------------------------------------------------------------------------
// Terms allowed only when the product description explicitly mentions them.
const CRAFTSMANSHIP_TERMS = [
  'handmade', 'hand-made', 'hand made',
  'artisan', 'handcrafted', 'hand-crafted',
  'one-of-a-kind', 'one of a kind',
  'custom made to order', 'made to order',
]
// Claims that must never be invented regardless of product type.
const FORBIDDEN_CLAIM_TERMS = ['certified', 'authentic']

function getBannedTermsForProduct(description: string): string[] {
  const lowerDesc = description.toLowerCase()
  // If the description already signals a handmade/crafted product, allow those terms.
  const isHandmade = CRAFTSMANSHIP_TERMS.some((t) => lowerDesc.includes(t))
  const banned: string[] = isHandmade ? [] : [...CRAFTSMANSHIP_TERMS]
  // certified/authentic are never invented — ban unless description includes them.
  for (const t of FORBIDDEN_CLAIM_TERMS) {
    if (!lowerDesc.includes(t)) banned.push(t)
  }
  return banned
}

function getKeysWithBannedTerms(kv: Record<string, string>, description: string): string[] {
  const banned = getBannedTermsForProduct(description)
  if (banned.length === 0) return []
  return (['KEYWORD_WAR_PLAN', 'CREATOR_PROMPT'] as const).filter((k) => {
    const lowerVal = (kv[k] ?? '').toLowerCase()
    return banned.some((t) => lowerVal.includes(t))
  })
}

function buildCorrectionPrompt(
  keysToCorrect: string[],
  description: string,
  competitorInsights: CompetitorSummary[] | undefined,
  bannedTerms: string[] = []
): string {
  const keyLines = keysToCorrect.map((k) => `${k}: ${KEY_GUIDES[k]}`).join('\n')
  const competitorNote = competitorInsights && competitorInsights.length > 0
    ? '\nEach value MUST reference specific words, phrases, or angles from the competitor listings provided.'
    : ''
  const bannedNote = bannedTerms.length > 0
    ? `\nDo NOT use any of these terms: ${bannedTerms.join(', ')}`
    : ''
  return `
You are a senior Etsy listing strategist.
Rewrite ONLY the keys below.${competitorNote}${bannedNote}
Output ONLY these keys in KEY: value format — nothing else.

${keyLines}

[OUR PRODUCT]
${description.slice(0, DESC_CHAR_CAP)}

[COMPETITOR CONTEXT]
${formatCompetitorContext(competitorInsights)}
`.trim()
}

// ---------------------------------------------------------------------------
// Server-side fallback templates — injected when Gemini output still fails
// validation after repair + correction calls. Guarantees 6 non-empty sections.
// ---------------------------------------------------------------------------
const FALLBACK_TEMPLATES: Record<string, string> = {
  HOOK: 'Most listings in this category crowd the same search terms and serve the same buyer — this product targets the structural gap they all miss: a specific quality and context where generic alternatives consistently fall short.',
  POSITIONING: 'Competing listings optimize for broad keyword volume and mass-market appeal, leaving a structural gap for a buyer who has already filtered out the category default. While competitors fight for the same high-volume terms with interchangeable positioning, this listing occupies the gap: a precise, evidence-based case to a smaller but higher-converting audience that generic shops cannot credibly reach.',
  UNDERSERVED_ANGLE: 'The underserved buyer is the quality-first repeat buyer — someone who has purchased from category leaders, been disappointed by inconsistent quality, and is now searching with deliberate intent. Competitors structurally fail this buyer by prioritizing broad keyword reach over product credibility, leaving no listing that speaks directly to their informed, skeptical purchase decision.',
  MARKET_SATURATION: 'Keyword overlap: High — top competitors share primary search terms, creating strong overlap in traffic targeting.\nPrice-tier: Medium clustering — most listings fall within a similar price band, limiting price-based differentiation.\nPositioning similarity: High — competitor positioning is generic and interchangeable; no listing occupies a distinct structural niche.\nRisk profile: Medium — high keyword competition but a clear structural positioning gap available for a differentiated entry.',
  KEYWORD_WAR_PLAN: 'TRAFFIC_CAPTURE > quality, premium, gift, unique, stylish\nDIFFERENTIATION_DEFENSE > purpose-built, occasion-specific, curated, versatile\nCONVERSION_TRIGGER > quality gift for her, premium everyday essential, thoughtful present idea\nKEYWORDS_TO_AVOID > generic, cheap, bulk, basic, everyday basic',
  CREATOR_PROMPT: 'Write this listing for a quality-conscious buyer who has browsed category alternatives and been disappointed by generic options. Tone: confident, specific, and credible — no vague superlatives. Reflect the strategic gap: this product serves a buyer the competition cannot credibly reach. Emphasize: 1) the specific quality attribute or use-case that separates this from category defaults, 2) the concrete occasion or buyer context where this is the clear best choice, 3) the competitive detail that no competing listing addresses directly. Avoid: unsubstantiated claims, generic lifestyle language, or craftsmanship terms not supported by the product description.',
}

function injectFallbacks(kv: Record<string, string>): void {
  for (const key of REQUIRED_KEYS) {
    if ((kv[key]?.trim() ?? '').length < (KEY_MIN_LEN[key] ?? 50)) {
      kv[key] = FALLBACK_TEMPLATES[key]
    }
  }
}

export async function generateDeepStrategyStep2KV(params: DeepStrategyV2Params): Promise<DeepStrategyKVResult> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set')

  const ai = new GoogleGenAI({ apiKey })
  const prompt = buildPrompt({ description: params.description, competitorInsights: params.competitorInsights })

  // Call 1 — main generation
  const result = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: {
      temperature: 0.05,
      maxOutputTokens: 1800,
      responseMimeType: 'text/plain',
    },
  })

  const rawText = await getResultText(result)

  if (!rawText.trim()) {
    throw new Error('MODEL_EMPTY')
  }

  const kv = parseKV(rawText)

  // Call 2 (if needed) — targeted repair for any key missing or below length threshold.
  const missing = getMissingKeys(kv)
  if (missing.length > 0) {
    const repairPrompt = buildRepairPrompt(missing, params.description, params.competitorInsights)
    const repairResult = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [{ role: 'user', parts: [{ text: repairPrompt }] }],
      config: { temperature: 0.05, maxOutputTokens: 1400, responseMimeType: 'text/plain' },
    })
    const repairText = await getResultText(repairResult)
    if (repairText.trim()) {
      const repairKV = parseKV(repairText)
      for (const key of missing) {
        const v = repairKV[key]?.trim() ?? ''
        if (v.length > 0) kv[key] = v
      }
    }
  }

  // Call 3 (if needed) — unified quality correction.
  // Merges two independent checks into one call (max total calls = 3):
  //   a) Competitor-reference: POSITIONING/UNDERSERVED_ANGLE must cite competitors.
  //   b) Banned-terms: KEYWORD_LAYERS/CREATOR_PROMPT must not include false claims.
  const insights = params.competitorInsights
  const bannedTerms = getBannedTermsForProduct(params.description)
  const keysNeedingRefs   = insights && insights.length > 0 ? getKeysNeedingCompetitorRefs(kv, insights) : []
  const keysWithBanned    = getKeysWithBannedTerms(kv, params.description)
  const allKeysToCorrect  = [...new Set([...keysNeedingRefs, ...keysWithBanned])]

  if (allKeysToCorrect.length > 0) {
    const correctionPrompt = buildCorrectionPrompt(allKeysToCorrect, params.description, insights, bannedTerms)
    const correctionResult = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [{ role: 'user', parts: [{ text: correctionPrompt }] }],
      config: { temperature: 0.05, maxOutputTokens: 900, responseMimeType: 'text/plain' },
    })
    const correctionText = await getResultText(correctionResult)
    if (correctionText.trim()) {
      const correctionKV = parseKV(correctionText)
      for (const key of allKeysToCorrect) {
        const v = correctionKV[key]?.trim() ?? ''
        if (v.length > 0) kv[key] = v
      }
    }
  }

  // Step 6 — inject server-side fallbacks for any key still missing or below threshold.
  // No Gemini call — guarantees 6 non-empty sections regardless of model compliance.
  injectFallbacks(kv)

  // Strip any remaining placeholder "unknown" values (should not occur after fallback injection)
  for (const key of Object.keys(kv)) {
    if (kv[key].trim().toLowerCase() === 'unknown') kv[key] = FALLBACK_TEMPLATES[key] ?? kv[key]
  }

  return { kv, rawText }
}
