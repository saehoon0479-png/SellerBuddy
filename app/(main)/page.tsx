'use client'

import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/browser'
import { useRouter } from 'next/navigation'
import PlanBadge from '@/components/PlanBadge/PlanBadge'
import { Profile } from '@/types'
import type { Session } from '@supabase/supabase-js'
import BackgroundParticles, { type BackgroundParticlesHandle } from '@/components/BackgroundParticles/BackgroundParticles'
import EtsyListingPreview from '@/components/EtsyListingPreview/EtsyListingPreview'
import styles from './page.module.css'

export const dynamic = 'force-dynamic'

type DeepStrategyUiResult = {
  hook?: string
  positioning?: string
  underserved_angle?: string
  market_saturation?: string
  keyword_war_plan?: {
    traffic_capture: string[]
    differentiation_defense: string[]
    conversion_trigger: string[]
    keywords_to_avoid: string[]
  }
  creator_prompt?: string
}

const parseKeywordItems = (value: string): string[] =>
  value
    .split(/,/)
    .map((item) => item.trim())
    .filter(Boolean)

const parseKeywordWarPlan = (value: string): DeepStrategyUiResult['keyword_war_plan'] => {
  const str = String(value || '')
  // Format: multi-line with TRAFFIC_CAPTURE > kw1, kw2 / DIFFERENTIATION_DEFENSE > ... etc.
  const lines = str.split('\n').map((l) => l.trim()).filter(Boolean)
  const parsed: Record<string, string[]> = {}
  for (const line of lines) {
    const gtIdx = line.indexOf('>')
    if (gtIdx < 0) continue
    const label = line.slice(0, gtIdx).trim().toLowerCase().replace(/[\s_-]+/g, '_')
    parsed[label] = parseKeywordItems(line.slice(gtIdx + 1))
  }
  return {
    traffic_capture:         parsed['traffic_capture']         ?? [],
    differentiation_defense: parsed['differentiation_defense'] ?? [],
    conversion_trigger:      parsed['conversion_trigger']      ?? [],
    keywords_to_avoid:       parsed['keywords_to_avoid']       ?? [],
  }
}

const cleanChips = (items: string[]): string[] => {
  const seen = new Set<string>()
  return items.filter((item) => {
    const norm = item.toLowerCase().trim()
    if (!norm) return false
    if (seen.has(norm)) return false
    seen.add(norm)
    return true
  })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const normalizeDeepStrategyResult = (raw: any): DeepStrategyUiResult | null => {
  if (!raw || typeof raw !== 'object') return null

  const hook              = String(raw.HOOK              ?? raw.hook              ?? '').trim()
  const positioning       = String(raw.POSITIONING       ?? raw.positioning       ?? '').trim()
  const keywordWarPlanRaw = String(raw.KEYWORD_WAR_PLAN  ?? raw.keyword_war_plan  ?? '').trim()
  const marketSatRaw      = String(raw.MARKET_SATURATION ?? raw.market_saturation ?? '').trim()
  const creatorPrompt     = String(raw.CREATOR_PROMPT    ?? raw.creator_prompt    ?? '').trim()
  const underservedAngle  = String(raw.UNDERSERVED_ANGLE ?? raw.underserved_angle ?? '').trim()

  if (!hook && !positioning && !keywordWarPlanRaw && !creatorPrompt && !underservedAngle) {
    return null
  }

  return {
    hook:             hook || undefined,
    positioning:      positioning || undefined,
    underserved_angle: underservedAngle || undefined,
    market_saturation: marketSatRaw || undefined,
    keyword_war_plan:  parseKeywordWarPlan(keywordWarPlanRaw),
    creator_prompt:   creatorPrompt || undefined,
  }
}

export default function HomePage() {
  const [mounted, setMounted] = useState(false)
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [plan, setPlan] = useState<'free' | 'pro' | 'loading'>('loading')
  const [planLoading, setPlanLoading] = useState(true)
  const [planError, setPlanError] = useState<string | null>(null)
  const [apiResponse, setApiResponse] = useState<any>(null)
  const planFetchInFlightRef = useRef(false)
  const [description, setDescription] = useState('')
  const [generating, setGenerating] = useState(false)
  const [showErrorOverlay, setShowErrorOverlay] = useState(false)
  const [upgradeMessage, setUpgradeMessage] = useState<string | null>(null)
  const [rateLimitError, setRateLimitError] = useState(false)
  const [modalOpen, setModalOpen] = useState<'upgrade' | 'limit' | null>(null)
  const [freeLimitReached, setFreeLimitReached] = useState(false)
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false)
  const [upgradeModalMessage, setUpgradeModalMessage] = useState<{ title: string; body: string } | null>(null)
  const [activeMode, setActiveMode] = useState<'listing' | 'deep'>('listing')
  const [generationResult, setGenerationResult] = useState<{
    title: string
    tags: string[]
    description: string
    differentiation_strategy: string
    usp?: string
    why_this_works?: string
  } | null>(null)
  const [optimizedResult, setOptimizedResult] = useState<{
    optimized_title: string
    optimized_description: string
  } | null>(null)
  const [optimizing, setOptimizing] = useState(false)
  const [deepStrategyResult, setDeepStrategyResult] = useState<DeepStrategyUiResult | null>(null)
  const [deepError, setDeepError] = useState<{
    code: string
    message: string
    retryAfterSec?: number
    requestId?: string
  } | null>(null)
  const [selectedImages, setSelectedImages] = useState<File[]>([])
  const [imagePreviews, setImagePreviews] = useState<string[]>([])
  const [resultImagePreview, setResultImagePreview] = useState<string | null>(null)
  const [resultImages, setResultImages] = useState<(File | string)[]>([])
  const [descriptionExpanded, setDescriptionExpanded] = useState(false)
  const [uploadingImages, setUploadingImages] = useState(false)
  const [competitors, setCompetitors] = useState<Array<{
    url: string
    description: string
    images: File[]
    imagePreviews: string[]
    urlError?: string
  }>>([{ url: '', description: '', images: [], imagePreviews: [] }])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const competitorFileInputRefs = useRef<Array<HTMLInputElement | null>>([null])
  const particlesRef = useRef<BackgroundParticlesHandle>(null)
  const generateButtonRef = useRef<HTMLButtonElement>(null)
  const previousOverflowRef = useRef<string>('')
  const descriptionTextareaRef = useRef<HTMLTextAreaElement>(null)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const preventTouchMove = (e: TouchEvent) => {
      e.preventDefault()
    }

    if (generating || freeLimitReached || upgradeModalOpen) {
      previousOverflowRef.current = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      document.documentElement.style.overflow = 'hidden'
      // Prevent scroll on iOS Safari
      document.body.style.position = 'fixed'
      document.body.style.width = '100%'
      document.addEventListener('touchmove', preventTouchMove, { passive: false })
    } else {
      document.body.style.overflow = previousOverflowRef.current
      document.documentElement.style.overflow = ''
      document.body.style.position = ''
      document.body.style.width = ''
      document.removeEventListener('touchmove', preventTouchMove)
    }

    return () => {
      document.body.style.overflow = previousOverflowRef.current
      document.documentElement.style.overflow = ''
      document.body.style.position = ''
      document.body.style.width = ''
      document.removeEventListener('touchmove', preventTouchMove)
    }
  }, [generating, freeLimitReached, upgradeModalOpen])

  const fetchPlanFromAPI = async (accessToken: string): Promise<void> => {
    if (planFetchInFlightRef.current) return
    planFetchInFlightRef.current = true
    setPlanLoading(true)
    let timeoutId: NodeJS.Timeout | null = null

    try {
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error('plan fetch timeout'))
        }, 2000)
      })

      const fetchPromise = fetch('/api/me', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      }).then(async (response) => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`)
        }
        const data = await response.json()
        if (data.profile?.plan) {
          const planValue = data.profile.plan as 'free' | 'pro'
          setPlan(planValue)
          setPlanError(null)
          if (typeof window !== 'undefined') {
            localStorage.setItem('sb_plan', planValue)
          }
        }
      })

      await Promise.race([fetchPromise, timeoutPromise])
    } catch (err) {
      setPlanError(String(err))
      // Don't overwrite plan on error - keep current state
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
      setPlanLoading(false)
      planFetchInFlightRef.current = false
    }
  }

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!mounted) return

    let mountedFlag = true

    // Read cached plan from localStorage after mount
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('sb_plan')
      if (stored === 'free' || stored === 'pro') {
        setPlan(stored)
      }
    }

    const run = async () => {
      try {
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession()

        if (!mountedFlag) return

        if (sessionError) {
          setError(sessionError.message)
          setProfile(null)
          return
        }

        if (!sessionData.session) {
          setSession(null)
          setProfile(null)
          setError(null)
          return
        }

        setSession(sessionData.session)

        const response = await fetch('/api/me', {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${sessionData.session.access_token}`,
          },
        })

        const apiData = await response.json()

        if (!mountedFlag) return

        setApiResponse({
          status: response.status,
          statusText: response.statusText,
          data: apiData,
        })

        if (!response.ok) {
          setError(apiData.error || `HTTP ${response.status}`)
          setProfile(null)
          return
        }

        if (apiData.profile) {
          const profileData = apiData.profile as Profile
          setProfile(profileData)
          // Set plan from API response
          if (profileData.plan) {
            setPlan(profileData.plan)
            if (typeof window !== 'undefined') {
              localStorage.setItem('sb_plan', profileData.plan)
            }
          }
          setError(null)
        } else {
          setError('Profile not found in response')
          setProfile(null)
        }
      } catch (err) {
        if (!mountedFlag) return
        setError(String(err))
        setProfile(null)
      }
    }

    run()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event: string, session: Session | null) => {
      if (!mountedFlag) return

      setSession(session)

      if (session?.user) {
        try {
          const response = await fetch('/api/me', {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${session.access_token}`,
            },
          })

          const apiData = await response.json()

          if (!mountedFlag) return

          setApiResponse({
            status: response.status,
            statusText: response.statusText,
            data: apiData,
          })

          if (!response.ok) {
            setError(apiData.error || `HTTP ${response.status}`)
            setProfile(null)
            return
          }

          if (apiData.profile) {
            const profileData = apiData.profile as Profile
            setProfile(profileData)
            // Set plan from API response
            if (profileData.plan) {
              setPlan(profileData.plan)
              if (typeof window !== 'undefined') {
                localStorage.setItem('sb_plan', profileData.plan)
              }
            }
            setError(null)
          } else {
            setError('Profile not found in response')
            setProfile(null)
          }
        } catch (err) {
          if (!mountedFlag) return
          setError(String(err))
          setProfile(null)
        }
      } else {
        setProfile(null)
        setError(null)
        setApiResponse(null)
        setPlan('loading')
        setPlanLoading(false)
        setPlanError(null)
        if (typeof window !== 'undefined') {
          localStorage.removeItem('sb_plan')
        }
      }
    })

    return () => {
      mountedFlag = false
      subscription.unsubscribe()
    }
  }, [mounted])

  // Refresh plan when returning from upgrade page
  useEffect(() => {
    if (!mounted || !session?.user?.id || !session?.access_token) return

    const checkUpgradeReturn = () => {
      const urlParams = new URLSearchParams(window.location.search)
      if (urlParams.get('upgraded') === 'true') {
        fetchPlanFromAPI(session.access_token)
        window.history.replaceState({}, '', window.location.pathname)
      }
    }

    checkUpgradeReturn()
  }, [mounted, session?.user?.id, session?.access_token])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    setSession(null)
    setProfile(null)
    router.push('/login')
    router.refresh()
  }

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    const effectivePlan = plan === 'loading' ? 'free' : plan
    const imageLimit = effectivePlan === 'pro' ? 3 : 1

    // Check if adding these files would exceed limit
    const totalAfterAdd = imagePreviews.length + files.length
    if (totalAfterAdd > imageLimit) {
      if (effectivePlan === 'free') {
        setUpgradeModalMessage({
          title: 'Image limit reached',
          body: 'Free plan allows 1 image. Upgrade to Pro to upload up to 3 images.',
        })
        setUpgradeModalOpen(true)
      } else {
        setError(`Maximum ${imageLimit} image(s) allowed`)
      }
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
      return
    }

    setSelectedImages([...selectedImages, ...files])
    const newPreviews = files.map(file => URL.createObjectURL(file))
    setImagePreviews([...imagePreviews, ...newPreviews])
  }

  const handleRemoveImage = (index: number) => {
    const newImages = selectedImages.filter((_, i) => i !== index)
    const newPreviews = imagePreviews.filter((_, i) => i !== index)
    setSelectedImages(newImages)
    setImagePreviews(newPreviews)
    URL.revokeObjectURL(imagePreviews[index])
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleCompetitorUrlChange = (index: number, value: string) => {
    const newCompetitors = [...competitors]
    let urlError: string | undefined
    if (value.trim() !== '' && !value.trim().match(/^https?:\/\//i)) {
      urlError = 'URL must start with http:// or https://'
    }
    newCompetitors[index] = { ...newCompetitors[index], url: value, urlError }
    setCompetitors(newCompetitors)
  }

  const handleCompetitorDescriptionChange = (index: number, value: string) => {
    const newCompetitors = [...competitors]
    newCompetitors[index] = { ...newCompetitors[index], description: value }
    setCompetitors(newCompetitors)
  }


  const handleCompetitorImageSelect = (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    const imageLimit = 1  // Always 1 image per competitor
    const competitor = competitors[index]

    // Check if adding these files would exceed limit
    const totalAfterAdd = competitor.imagePreviews.length + files.length
    if (totalAfterAdd > imageLimit) {
      setError(`Maximum ${imageLimit} image per competitor`)
      if (competitorFileInputRefs.current[index]) {
        competitorFileInputRefs.current[index]!.value = ''
      }
      return
    }

    const newCompetitors = [...competitors]
    newCompetitors[index] = {
      ...newCompetitors[index],
      images: [...competitor.images, ...files],
      imagePreviews: [...competitor.imagePreviews, ...files.map(file => URL.createObjectURL(file))]
    }
    setCompetitors(newCompetitors)
  }

  const handleRemoveCompetitorImage = (competitorIndex: number, imageIndex: number) => {
    const newCompetitors = [...competitors]
    const competitor = newCompetitors[competitorIndex]
    URL.revokeObjectURL(competitor.imagePreviews[imageIndex])
    newCompetitors[competitorIndex] = {
      ...competitor,
      images: competitor.images.filter((_, i) => i !== imageIndex),
      imagePreviews: competitor.imagePreviews.filter((_, i) => i !== imageIndex)
    }
    setCompetitors(newCompetitors)
    if (competitorFileInputRefs.current[competitorIndex]) {
      competitorFileInputRefs.current[competitorIndex]!.value = ''
    }
  }

  const handleAddCompetitor = () => {
    const effectivePlan = plan === 'loading' ? 'free' : plan
    const maxCompetitors = effectivePlan === 'pro' ? 3 : 1
    
    if (effectivePlan === 'free' && competitors.length >= 1) {
      setUpgradeModalMessage({
        title: 'Competitor limit reached',
        body: 'Free plan allows 1 competitor. Upgrade to Pro to analyze up to 3 competitors.',
      })
      setUpgradeModalOpen(true)
      return
    }

    if (competitors.length < maxCompetitors) {
      setCompetitors([...competitors, { url: '', description: '', images: [], imagePreviews: [] }])
      if (competitorFileInputRefs.current.length <= competitors.length) {
        competitorFileInputRefs.current.push(null)
      }
    }
  }

  const handleRemoveCompetitor = (index: number) => {
    const competitor = competitors[index]
    competitor.imagePreviews.forEach(url => URL.revokeObjectURL(url))
    const newCompetitors = competitors.filter((_, i) => i !== index)
    setCompetitors(newCompetitors.length > 0 ? newCompetitors : [{ url: '', description: '', images: [], imagePreviews: [] }])
    competitorFileInputRefs.current = newCompetitors.length > 0 
      ? competitorFileInputRefs.current.filter((_, i) => i !== index)
      : [null]
  }

  const handleGenerate = async () => {
    // Prevent double-submit
    if (generating || uploadingImages) {
      return
    }

    if (!description.trim()) {
      return
    }

    if (!session) {
      router.push('/login')
      return
    }

    if (freeLimitReached) {
      return
    }

    // Validate competitor URLs
    const invalidCompetitorIndex = competitors.findIndex(comp => 
      comp.url.trim() !== '' && comp.urlError
    )
    if (invalidCompetitorIndex !== -1) {
      setError('Please fix invalid competitor URLs before generating')
      return
    }

   const isDeepMode = activeMode === 'deep'

    // Validate Deep Strategy requirements
    if (isDeepMode) {
      const validCompetitors = competitors.filter(comp => comp.url.trim() !== '')
      if (validCompetitors.length < 1) {
        setDeepError({
          code: 'DEEP_INPUT_MISSING',
          message: 'Add at least one competitor URL.',
        })
        setDeepStrategyResult(null)
        return
      }
    }

    setGenerating(true)
    setDeepError(null)
    setUpgradeMessage(null)
    setError(null)
    setRateLimitError(false)
    setModalOpen(null)
    setFreeLimitReached(false)

    // Start particle converge animation
    if (generateButtonRef.current && particlesRef.current) {
      const rect = generateButtonRef.current.getBoundingClientRect()
      const targetX = rect.left + rect.width / 2 + window.scrollX
      const targetY = rect.top + rect.height / 2 + window.scrollY
      particlesRef.current.setTarget({ x: targetX, y: targetY })
      particlesRef.current.startConverge()
    }

    try {
      let imagePaths: string[] = []
      if (selectedImages.length > 0) {
        setUploadingImages(true)
        const formData = new FormData()
        selectedImages.forEach(file => {
          formData.append('images', file)
        })

        const uploadResponse = await fetch('/api/upload', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: formData,
        })

        const uploadData = await uploadResponse.json()

        if (!uploadResponse.ok) {
          if (uploadResponse.status === 403 && uploadData.code === 'image_limit_exceeded') {
            setError(uploadData.error || 'Image limit exceeded')
            return
          }
          setError(uploadData.error || 'Failed to upload images')
          return
        }

        imagePaths = uploadData.image_paths || []
        setUploadingImages(false)
      }

      // Upload competitor images
      const competitorImagePaths: string[][] = []
      for (let i = 0; i < competitors.length; i++) {
        const competitor = competitors[i]
        if (competitor.images.length > 0) {
          setUploadingImages(true)
          const formData = new FormData()
          competitor.images.forEach(file => {
            formData.append('images', file)
          })

          const uploadResponse = await fetch('/api/upload', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${session.access_token}`,
            },
            body: formData,
          })

          const uploadData = await uploadResponse.json()

          if (!uploadResponse.ok) {
            if (uploadResponse.status === 403 && uploadData.code === 'image_limit_exceeded') {
              setError(uploadData.error || 'Image limit exceeded')
              return
            }
            setError(uploadData.error || 'Failed to upload competitor images')
            return
          }

          competitorImagePaths.push(uploadData.image_paths || [])
          setUploadingImages(false)
        } else {
          competitorImagePaths.push([])
        }
      }

      const validCompetitors = competitors
        .map((comp, idx) => ({
          url: comp.url.trim(),
          description: comp.description.trim(),
          image_paths: competitorImagePaths[idx] || [],
        }))
        .filter(comp => comp.url !== '')

      const payload = isDeepMode
        ? {
            description: description.trim(),
            image_paths: imagePaths,
            competitors: validCompetitors,
          }
        : {
            description: description.trim(),
            image_paths: imagePaths,
            competitors: validCompetitors,
            mode: activeMode,
          }

      console.log('deep payload', payload)

      const endpoint = isDeepMode ? '/api/deepstrategy' : '/api/generate'
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(payload),
      })

      const json = await response.json().catch(() => null)
      console.log('deep response', { status: response.status, json })

      // Handle HTTP errors (non-200 status)
      if (!response.ok) {
        // Reset particles on error
        if (particlesRef.current) {
          particlesRef.current.resetToIdle()
        }
        
        if (response.status === 401) {
          router.push('/login')
          return
        }
        if (isDeepMode) {
          setDeepError({
            code: json?.error?.code || json?.code || `HTTP_${response.status}`,
            message: json?.error?.message || json?.error || json?.message || 'Deep Strategy failed',
            retryAfterSec: json?.error?.retryAfterSec || json?.retryAfterSec,
            requestId: json?.error?.requestId || json?.requestId,
          })
          setDeepStrategyResult(null)
          return
        }
        if (response.status === 429) {
          if (json?.code === 'FREE_LIMIT') {
            setGenerating(false)
            setFreeLimitReached(true)
            return
          }
          setRateLimitError(true)
          setError('Rate limit exceeded. Please wait a moment and try again.')
          return
        }
        if (response.status === 400 && json?.code === 'BAD_REQUEST') {
          setError(json?.error || 'Invalid request. Please check your input.')
          return
        }
        if (response.status === 413 && json?.code === 'PAYLOAD_TOO_LARGE') {
          setError(json?.error || 'Please upload smaller images.')
          return
        }
        if (response.status === 502 && json?.code === 'MODEL_EMPTY') {
          setError(json?.error || 'AI returned an empty response. Please try again.')
          return
        }
        if (response.status === 504 && json?.code === 'TIMEOUT') {
          setError(json?.error || 'Generation timed out. Please try again.')
          return
        }
        if (response.status === 502 && json?.code === 'GENERATION_ERROR') {
          setError(json?.error || 'Generation failed. Please try again.')
          return
        }
        
        // For deep mode, set deep error
        if (isDeepMode) {
          setDeepError({
            code: `HTTP_${response.status}`,
            message: json?.error || json?.message || 'Request failed',
          })
          setDeepStrategyResult(null)
        } else {
          setShowErrorOverlay(true)
          setTimeout(() => {
            setShowErrorOverlay(false)
          }, 1000)
          setError(json?.error || json?.message || `HTTP ${response.status}`)
        }
        return
      }

      // Handle ok: false responses (backend returns 200 with ok:false for model errors)
      if (json?.ok === false || json?.error) {
        if (isDeepMode) {
          setDeepError({
            code: json?.error?.code || json?.code || 'UNKNOWN',
            message: json?.error?.message || json?.error || json?.message || 'Deep Strategy failed',
            retryAfterSec: json?.error?.retryAfterSec || json?.retryAfterSec,
            requestId: json?.error?.requestId || json?.requestId,
          })
          setDeepStrategyResult(null)
        } else {
          setShowErrorOverlay(true)
          setTimeout(() => {
            setShowErrorOverlay(false)
          }, 1000)
          setError(json.error?.message || json.error || 'Generation failed')
        }
        return
      }

      const meResponse = await fetch('/api/me', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      })

      if (meResponse.ok) {
        const meData = await meResponse.json()
        if (meData.profile) {
          setProfile(meData.profile as Profile)
          // Update plan from response
          if (meData.profile.plan) {
            setPlan(meData.profile.plan)
            if (typeof window !== 'undefined') {
              localStorage.setItem('sb_plan', meData.profile.plan)
            }
          }
        }
      }

      // Handle success - accept both response shapes
      if (isDeepMode) {
        setDeepError(null)

        const deepRaw =
          json?.data ??
          json?.result?.deep_strategy ??
          json?.deep_strategy ??
          json?.result ??
          json

        let deep = normalizeDeepStrategyResult(deepRaw)

        // If normalize returns null, build fallback from whatever fields exist.
        if (!deep) {
          const rawFull      = String(deepRaw?.rawText ?? '').trim()
          const fallbackHook = String(deepRaw?.HOOK ?? deepRaw?.hook ?? '').trim()
          const fallbackPos  = String(deepRaw?.POSITIONING ?? deepRaw?.positioning ?? '').trim()
          const fallbackKw   = String(deepRaw?.KEYWORD_WAR_PLAN ?? deepRaw?.keyword_war_plan ?? '').trim()
          const fallbackAngle = String(deepRaw?.UNDERSERVED_ANGLE ?? deepRaw?.underserved_angle ?? '').trim()
          const fallbackCreator = String(deepRaw?.CREATOR_PROMPT ?? deepRaw?.creator_prompt ?? rawFull).trim()

          if (fallbackHook || fallbackPos || fallbackCreator || fallbackKw || rawFull) {
            deep = {
              hook:             fallbackHook || undefined,
              positioning:      fallbackPos  || undefined,
              underserved_angle: fallbackAngle || rawFull.split('\n')[0] || undefined,
              creator_prompt:   fallbackCreator || undefined,
              keyword_war_plan:  parseKeywordWarPlan(fallbackKw),
              market_saturation: undefined,
            }
          }
        }

        // Only block on error if there is truly nothing to show
        if (!deep) {
          console.log('Deep normalize failed. raw:', deepRaw)
          setDeepError({
            code: 'MISSING_DEEP_RESULT',
            message: 'Deep Strategy returned no usable content. Please retry.',
          })
          setDeepStrategyResult(null)
          setGenerationResult(null)
          return
        }

        setDeepStrategyResult(deep)
        setDeepError(null)
        setGenerationResult(null)

        if (particlesRef.current) {
          particlesRef.current.startBurst()
        }

        return
      } else {
        if (json?.result) {
          setGenerationResult(json.result)
          setDeepStrategyResult(null)
          // Store images for result display (preserve before clearing)
          if (imagePreviews.length > 0) {
            setResultImages([...imagePreviews])
            setResultImagePreview(imagePreviews[0])
          } else if (selectedImages.length > 0) {
            setResultImages([...selectedImages])
          }
        }
        
        // Burst animation on success
        if (particlesRef.current) {
          particlesRef.current.startBurst()
        }
      }
      setDescription('')
      // Don't clear images yet - they're needed for preview
      // Cleanup will happen when component unmounts or new generation starts
      competitors.forEach(comp => comp.imagePreviews.forEach(url => URL.revokeObjectURL(url)))
      setCompetitors([{ url: '', description: '', images: [], imagePreviews: [] }])
      competitorFileInputRefs.current = [null]
      // Don't revoke imagePreviews URLs - they're stored in resultImages
      setSelectedImages([])
      setImagePreviews([])
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    } catch (err) {
      // Reset particles on error
      if (particlesRef.current) {
        particlesRef.current.resetToIdle()
      }
      setShowErrorOverlay(true)
      setTimeout(() => {
        setShowErrorOverlay(false)
      }, 1000)
      setError(String(err))
    } finally {
      setGenerating(false)
      setUploadingImages(false)
    }
  }

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text)
  }

  const hasSession = session !== null
  const effectivePlan = !mounted || plan === 'loading' ? 'free' : plan
  const imageLimit = effectivePlan === 'pro' ? 3 : 1
  const competitorLimit = effectivePlan === 'pro' ? 3 : 1

  return (
    <div className={styles.container}>
      <BackgroundParticles ref={particlesRef} />
      {(generating || showErrorOverlay) && (
        <div className={styles.generationOverlay} role="status" aria-live="polite">
          <div className={styles.generationOverlayContent}>
            {showErrorOverlay ? (
              <>
                <div className={styles.generationOverlayTitle}>Something went wrong. Try again.</div>
              </>
            ) : (
              <>
                <div className={styles.generationOverlayTitle}>
                  Generating your listing
                </div>
                <div className={styles.generationOverlaySubtext}>
                {activeMode === 'deep' ? 'Generate Strategy Report' : 'Generate my listing'}
                </div>
                <div className={styles.dotLoader}>
                  <span className={styles.dotLoaderDot}></span>
                  <span className={styles.dotLoaderDot}></span>
                  <span className={styles.dotLoaderDot}></span>
                </div>
              </>
            )}
          </div>
        </div>
      )}
      {freeLimitReached && (
        <div className={styles.upgradeModalOverlay} onClick={() => setFreeLimitReached(false)}>
          <div className={styles.upgradeModal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.upgradeModalBrand}>
              <span className={styles.upgradeModalBrandA}>Seller</span>
              <span className={styles.upgradeModalBrandB}>Buddy</span>
            </div>
            <h2 className={styles.upgradeModalTitle}>Free generation used</h2>
            <p className={styles.upgradeModalBody}>
              You get 1 free generation per cycle. Upgrade to Pro to keep generating listings.
            </p>
            <div className={styles.upgradeModalActions}>
              <a href="/upgrade" className={styles.upgradeModalPrimaryButton}>
                Upgrade to Pro
              </a>
              <button
                type="button"
                onClick={() => setFreeLimitReached(false)}
                className={styles.upgradeModalSecondaryLink}
              >
                Not now
              </button>
            </div>
          </div>
        </div>
      )}
      {upgradeModalOpen && upgradeModalMessage && (
        <div className={styles.upgradeModalOverlay} onClick={() => setUpgradeModalOpen(false)}>
          <div className={styles.upgradeModal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.upgradeModalBrand}>
              <span className={styles.upgradeModalBrandA}>Seller</span>
              <span className={styles.upgradeModalBrandB}>Buddy</span>
            </div>
            <h2 className={styles.upgradeModalTitle}>{upgradeModalMessage.title}</h2>
            <p className={styles.upgradeModalBody}>
              {upgradeModalMessage.body}
            </p>
            <div className={styles.upgradeModalActions}>
              <a href="/upgrade" className={styles.upgradeModalPrimaryButton}>
                Upgrade to Pro
              </a>
              <button
                type="button"
                onClick={() => setUpgradeModalOpen(false)}
                className={styles.upgradeModalSecondaryLink}
              >
                Not now
              </button>
            </div>
          </div>
        </div>
      )}
      <header className={styles.header}>
        <div className={styles.brand}>
          <span className={styles.brandA}>Seller</span>
          <span className={styles.brandB}>Buddy</span>
        </div>
        {hasSession ? (
          <div className={styles.userInfo}>
            <span className={styles.userEmail}>{profile?.email || session.user?.email || '…'}</span>
            <PlanBadge plan={!mounted || plan === 'loading' ? null : plan} />
            <button onClick={handleLogout} className={styles.logoutButton}>
              Logout
            </button>
          </div>
        ) : (
          <button 
            onClick={() => router.push('/login')} 
            className={styles.signInButton}
          >
            Sign in
          </button>
        )}
      </header>


      <main className={styles.main}>
        <div className={styles.hero}>
          <h1 className={styles.heroTitle}>
            <span className={styles.brandA}>Seller</span>
            <span className={styles.brandB}>Buddy</span>
          </h1>
          <p className={styles.heroSubtitle}>
            Turn photos and notes into a ready-to-sell listing.
          </p>
          <p className={styles.heroSecondary}>
            Generate titles, SEO tags, and a polished description in seconds.
          </p>
          <span className={styles.etsyPill}>Etsy</span>
          <div className={styles.modeToggle}>
            <button
              type="button"
              onClick={() => setActiveMode('listing')}
              className={`${styles.modeTab} ${activeMode === 'listing' ? styles.modeTabActive : ''}`}
            >
              Listing Creator
            </button>
            <button
              type="button"
              onClick={() => {
                if (effectivePlan === 'pro') {
                  setActiveMode('deep')
                } else {
                  setUpgradeModalMessage({
                    title: 'Deep Strategy',
                    body: 'Upgrade to Pro to unlock Deep Strategy mode for advanced market analysis.',
                  })
                  setUpgradeModalOpen(true)
                }
              }}
              className={`${styles.modeTab} ${activeMode === 'deep' ? styles.modeTabActive : ''} ${effectivePlan !== 'pro' ? styles.modeTabDisabled : ''}`}
              disabled={effectivePlan !== 'pro'}
              title={effectivePlan !== 'pro' ? 'Upgrade to Pro to unlock Deep Strategy' : undefined}
            >
              Deep Strategy
              {effectivePlan === 'pro' && <span className={styles.proBadge}>PRO</span>}
              {effectivePlan !== 'pro' && <span className={styles.proBadgeLocked}>🔒 PRO</span>}
            </button>
          </div>
        </div>

        <div className={styles.card}>
          <h2 className={styles.cardTitle}>
            {activeMode === 'deep' ? 'Compare competitors and find a market gap' : 'Build your listing'}
          </h2>

          <div className={styles.helperBullets}>
            {activeMode === 'deep' ? (
              <>
                <span>Add up to 3 competitor URLs</span>
                <span>What sets your product apart?</span>
                <span>Target market gap or niche</span>
                <span>Keyword opportunities to own</span>
              </>
            ) : (
              <>
                <span>What makes it unique?</span>
                <span>Who is it for?</span>
                <span>Materials, size, variations?</span>
                <span>Keywords you want to rank for?</span>
              </>
            )}
          </div>

          {rateLimitError && (
            <div className={styles.rateLimitBanner}>
              Rate limit exceeded. Please wait a moment and try again.
            </div>
          )}

          {error && !rateLimitError && (
            <div className={styles.errorMessage}>
              {error}
            </div>
          )}

          <div className={styles.formGroup}>
            <textarea
              ref={descriptionTextareaRef}
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className={styles.textarea}
              placeholder="Oversized vintage-inspired hoodie with heavyweight cotton, drop shoulders, and subtle embroidery. Designed for minimal everyday wear."
              rows={6}
              disabled={generating || uploadingImages}
            />
          </div>

          <div className={styles.twoColumnLayout}>
            <div className={styles.formGroup}>
              <label htmlFor="images" className={styles.label}>
                Images
              </label>
              <p className={styles.helper}>
                {!mounted || plan === 'loading' ? 'Images: up to 3 (plan-based)' : plan === 'pro' ? 'Pro: up to 3 images' : 'Free plan: 1 image'}
              </p>
              <div className={styles.imageUploadZone}>
                <input
                  ref={fileInputRef}
                  type="file"
                  id="images"
                  accept="image/*"
                  multiple={effectivePlan === 'pro'}
                  onChange={handleImageSelect}
                  disabled={generating || uploadingImages}
                  className={styles.fileInput}
                />
                <label htmlFor="images" className={styles.uploadButton}>
                  Upload images
                </label>
              </div>
              {imagePreviews.length > 0 && (
                <div className={styles.imagePreviews}>
                  {imagePreviews.map((preview, index) => (
                    <div key={index} className={styles.imagePreview}>
                      <img src={preview} alt={`Preview ${index + 1}`} />
                      <div className={styles.thumbBar}>
                        <button
                          type="button"
                          onClick={() => handleRemoveImage(index)}
                          disabled={generating || uploadingImages}
                          className={styles.removeImageButton}
                          aria-label="Remove image"
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>
                Competitor research (optional)
                {effectivePlan === 'pro' && <span className={styles.proPill}>PRO</span>}
              </label>
              <p className={styles.helper}>
                {!mounted || plan === 'loading' ? 'Competitors: up to 3 (plan-based)' : plan === 'pro' ? 'Pro: up to 3 competitors' : 'Free: 1 competitor'}
              </p>
              {competitors.map((competitor, index) => (
                <div key={index} className={styles.competitorCard}>
                  {competitors.length > 1 && (
                    <div className={styles.competitorLabel}>Competitor {index + 1}</div>
                  )}
                  <div className={styles.competitorInputRow}>
                    <input
                      type="url"
                      value={competitor.url}
                      onChange={(e) => handleCompetitorUrlChange(index, e.target.value)}
                      placeholder="https://etsy.com/listing/..."
                      className={`${styles.competitorInput} ${competitor.urlError ? styles.inputError : ''}`}
                      disabled={generating || uploadingImages}
                    />
                    {competitors.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveCompetitor(index)}
                        disabled={generating || uploadingImages}
                        className={styles.removeUrlButton}
                      >
                        ×
                      </button>
                    )}
                  </div>
                  {competitor.urlError && (
                    <div className={styles.inlineError}>{competitor.urlError}</div>
                  )}
                  <div className={styles.competitorImageSection}>
                    <label htmlFor={`competitor-images-${index}`} className={styles.label}>
                      Competitor image
                    </label>
                    <p className={styles.helper}>1 image per competitor</p>
                    <div className={styles.imageUploadZone}>
                      <input
                        ref={(el) => {
                          competitorFileInputRefs.current[index] = el
                        }}
                        type="file"
                        id={`competitor-images-${index}`}
                        accept="image/*"
                        multiple={false}
                        onChange={(e) => handleCompetitorImageSelect(index, e)}
                        disabled={generating || uploadingImages || competitors[index].imagePreviews.length >= 1}
                        className={styles.fileInput}
                      />
                      <label
                        htmlFor={`competitor-images-${index}`}
                        className={styles.uploadButton}
                        style={competitors[index].imagePreviews.length >= 1 ? { opacity: 0.4, cursor: 'not-allowed', pointerEvents: 'none' } : undefined}
                      >
                        Upload image
                      </label>
                    </div>
                    {competitor.imagePreviews.length > 0 && (
                      <div className={styles.imagePreviews}>
                        {competitor.imagePreviews.map((preview, imgIndex) => (
                          <div key={imgIndex} className={styles.imagePreview}>
                            <img src={preview} alt={`Competitor ${index + 1} preview ${imgIndex + 1}`} />
                            <div className={styles.thumbBar}>
                              <button
                                type="button"
                                onClick={() => handleRemoveCompetitorImage(index, imgIndex)}
                                disabled={generating || uploadingImages}
                                className={styles.removeImageButton}
                                aria-label="Remove image"
                              >
                                ×
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className={styles.competitorTextareaGroup}>
                    <label htmlFor={`competitor-description-${index}`} className={styles.label}>
                      Competitor description (optional)
                    </label>
                    <textarea
                      id={`competitor-description-${index}`}
                      value={competitor.description}
                      onChange={(e) => handleCompetitorDescriptionChange(index, e.target.value)}
                      className={styles.textarea}
                      placeholder="Describe this competitor's product..."
                      rows={3}
                      disabled={generating || uploadingImages}
                    />
                  </div>
                </div>
              ))}
              {(competitors.length < competitorLimit || effectivePlan === 'free') && (
                <button
                  type="button"
                  onClick={handleAddCompetitor}
                  disabled={generating || uploadingImages || (effectivePlan === 'free' && competitors.length >= 1)}
                  className={styles.addUrlButton}
                  title={effectivePlan === 'free' && competitors.length >= 1 ? 'Upgrade to Pro to add more competitors' : undefined}
                >
                  + Add competitor
                  {effectivePlan === 'free' && competitors.length >= 1 && <span className={styles.upgradeHint}> (Pro)</span>}
                </button>
              )}
            </div>
          </div>

          <button
            ref={generateButtonRef}
            onClick={handleGenerate}
            disabled={!description.trim() || generating || uploadingImages || freeLimitReached}
            className={styles.generateButton}
            title={freeLimitReached ? 'Upgrade to Pro to generate more.' : undefined}
          >
            {uploadingImages ? 'Uploading...' : generating ? 'Generating...' : hasSession ? (activeMode === 'deep' ? 'Generate Strategy Report' : 'Generate my listing') : 'Sign in to generate'}
          </button>
        </div>

            {deepError && (
              <div className={styles.card}>
                <h2 className={styles.cardTitle}>Deep Strategy Error</h2>
                <div className={styles.errorCard}>
                  <p className={styles.errorMessage}>{deepError.message}</p>
                  {deepError.code === 'RATE_LIMITED' && deepError.retryAfterSec && (
                    <p className={styles.retryInfo}>
                      Retry in ~{deepError.retryAfterSec}s
                    </p>
                  )}
                  <button
                    onClick={handleGenerate}
        
                    className={styles.retryButton}
                  >
                    Retry
                  </button>
                </div>
              </div>
            )}
            {deepStrategyResult && !deepError && (
              <div className={styles.card}>
                <h2 className={styles.cardTitle}>Deep Strategy Report</h2>
                <div className={styles.deepStrategyReport}>

                  {deepStrategyResult.hook && (
                    <div className={styles.strategySection}>
                      <h3 className={styles.strategySectionTitle}>Hook</h3>
                      <div className={styles.strategyHighlight}>{deepStrategyResult.hook}</div>
                    </div>
                  )}

                  {deepStrategyResult.positioning && (
                    <div className={styles.strategySection}>
                      <h3 className={styles.strategySectionTitle}>Competitive Positioning</h3>
                      <div className={styles.strategySectionContent}>{deepStrategyResult.positioning}</div>
                    </div>
                  )}

                  {deepStrategyResult.underserved_angle && (
                    <div className={styles.strategySection}>
                      <h3 className={styles.strategySectionTitle}>Underserved Angle</h3>
                      <div className={styles.underservedAngleContent}>{deepStrategyResult.underserved_angle}</div>
                    </div>
                  )}

                  {deepStrategyResult.market_saturation && (
                    <div className={styles.strategySection}>
                      <h3 className={styles.strategySectionTitle}>Market Saturation</h3>
                      <div className={styles.strategyMultiline}>{deepStrategyResult.market_saturation}</div>
                    </div>
                  )}

                  {deepStrategyResult.keyword_war_plan && (
                    <div className={styles.strategySection}>
                      <h3 className={styles.strategySectionTitle}>Keyword War Plan</h3>
                      <div className={styles.keywordLayers}>
                        <div className={styles.keywordLayerRow}>
                          <span className={styles.keywordLayerLabel}>Traffic Capture:</span>
                          <div className={styles.keywordLayerTags}>
                            {cleanChips(deepStrategyResult.keyword_war_plan.traffic_capture).map((kw, idx) => (
                              <span key={idx} className={styles.keywordTag}>{kw}</span>
                            ))}
                          </div>
                        </div>
                        <div className={styles.keywordLayerRow}>
                          <span className={styles.keywordLayerLabel}>Differentiation Defense:</span>
                          <div className={styles.keywordLayerTags}>
                            {cleanChips(deepStrategyResult.keyword_war_plan.differentiation_defense).map((kw, idx) => (
                              <span key={idx} className={styles.keywordTag}>{kw}</span>
                            ))}
                          </div>
                        </div>
                        <div className={styles.keywordLayerRow}>
                          <span className={styles.keywordLayerLabel}>Conversion Trigger:</span>
                          <div className={styles.keywordLayerTags}>
                            {cleanChips(deepStrategyResult.keyword_war_plan.conversion_trigger).map((kw, idx) => (
                              <span key={idx} className={styles.keywordTag}>{kw}</span>
                            ))}
                          </div>
                        </div>
                        <div className={styles.keywordLayerRow}>
                          <span className={styles.keywordLayerLabel}>Keywords to Avoid:</span>
                          <div className={styles.keywordLayerTags}>
                            {cleanChips(deepStrategyResult.keyword_war_plan.keywords_to_avoid).map((kw, idx) => (
                              <span key={idx} className={styles.keywordTag}>{kw}</span>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                </div>
              </div>
            )}
            {deepStrategyResult && deepStrategyResult.creator_prompt && (
              <div className={styles.card}>
                <h2 className={styles.cardTitle}>Creator Prompt</h2>
                <div className={styles.creatorPromptContainer}>
                  <div className={styles.creatorPromptBox}>
                    <pre className={styles.creatorPromptText}>{deepStrategyResult.creator_prompt}</pre>
                  </div>
                  <div className={styles.creatorPromptActions}>
                    <button
                      onClick={() => handleCopy(deepStrategyResult?.creator_prompt || '')}
                      className={styles.copyPromptButton}
                    >
                      Copy
                    </button>
                    <button
                      onClick={() => {
                        setActiveMode('listing')
                        setDescription(deepStrategyResult?.creator_prompt || '')
                        setTimeout(() => {
                          if (descriptionTextareaRef.current) {
                            descriptionTextareaRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
                            descriptionTextareaRef.current.focus()
                          }
                        }, 100)
                      }}
                      className={styles.sendToCreatorButton}
                    >
                      Send to Listing Creator
                    </button>
                  </div>
                </div>
              </div>
            )}
            {generationResult && (
          <div className={styles.card}>
            <div className={styles.resultCardHeader}>
              <h2 className={styles.cardTitle}>Your listing</h2>
              {effectivePlan === 'pro' ? (
                <button
                  onClick={async () => {
                    if (!generationResult) return
                    setOptimizing(true)
                    try {
                      const response = await fetch('/api/generate', {
                        method: 'POST',
                        headers: {
                          'Content-Type': 'application/json',
                        },
                        credentials: 'include',
                        body: JSON.stringify({
                          description: `${generationResult.title}\n\n${generationResult.description}`,
                          mode: 'optimize',
                        }),
                      })
                      const data = await response.json()
                      if (response.ok && data.result?.optimized) {
                        setOptimizedResult(data.result.optimized)
                      } else {
                        setError(data.error || 'Failed to optimize listing')
                      }
                    } catch (err) {
                      setError(String(err))
                    } finally {
                      setOptimizing(false)
                    }
                  }}
                  disabled={optimizing}
                  className={styles.optimizeButton}
                >
                  {optimizing ? 'Optimizing...' : '🔥 Optimize for More Sales'}
                </button>
              ) : (
                <button
                  onClick={() => {
                    setUpgradeModalMessage({
                      title: 'Optimize for More Sales',
                      body: 'Upgrade to Pro to unlock AI-powered listing optimization for higher conversion rates.',
                    })
                    setUpgradeModalOpen(true)
                  }}
                  className={`${styles.optimizeButton} ${styles.optimizeButtonDisabled}`}
                >
                  🔥 Optimize for More Sales
                  <span className={styles.proBadge}>PRO</span>
                </button>
              )}
            </div>
            
            {resultImages.length > 0 && (
              <EtsyListingPreview 
                images={resultImages}
                title={generationResult.title}
                description={generationResult.description}
              />
            )}

            <div className={styles.resultSection}>
              <div className={styles.resultHeader}>
                <h3 className={styles.resultLabel}>Title</h3>
                <button
                  onClick={() => handleCopy(generationResult.title)}
                  className={styles.copyButton}
                >
                  Copy
                </button>
              </div>
              <p className={styles.resultValue}>{generationResult.title}</p>
            </div>

            <div className={styles.resultSection}>
              <div className={styles.resultHeader}>
                <h3 className={styles.resultLabel}>Tags (13)</h3>
                <button
                  onClick={() => handleCopy(generationResult.tags.join(', '))}
                  className={styles.copyButton}
                >
                  Copy all tags
                </button>
              </div>
              <div className={styles.tagsContainer}>
                {generationResult.tags.map((tag, index) => (
                  <span key={index} className={styles.tag}>
                    {tag}
                  </span>
                ))}
              </div>
            </div>

            <div className={styles.resultSection}>
              <div className={styles.resultHeader}>
                <h3 className={styles.resultLabel}>Description</h3>
                <button
                  onClick={() => handleCopy(generationResult.description)}
                  className={styles.copyButton}
                >
                  Copy
                </button>
              </div>
              <div className={styles.descriptionContainer}>
                <div className={`${styles.resultValue} ${descriptionExpanded ? styles.descriptionExpanded : styles.descriptionCollapsed}`}>
                  {generationResult.description}
                </div>
                {(generationResult.description.split('\n').length > 6 || generationResult.description.length > 500) && (
                  <button
                    onClick={() => setDescriptionExpanded(!descriptionExpanded)}
                    className={styles.showMoreButton}
                  >
                    {descriptionExpanded ? 'Show less' : 'Show more'}
                  </button>
                )}
              </div>
            </div>

            <div className={styles.resultSection}>
              <div className={styles.differentiationCard}>
                <h3 className={styles.resultLabel}>Differentiation strategy</h3>
                <div className={styles.strategyContent}>
                  {generationResult.differentiation_strategy}
                </div>
                <button
                  onClick={() => handleCopy(generationResult.differentiation_strategy)}
                  className={styles.copyButton}
                >
                  Copy
                </button>
              </div>
            </div>

            {generationResult.usp && (
              <div className={styles.resultSection}>
                <h3 className={styles.resultLabel}>USP</h3>
                <div className={styles.resultValue}>{generationResult.usp}</div>
              </div>
            )}

            {generationResult.why_this_works && (
              <div className={styles.resultSection}>
                <h3 className={styles.resultLabel}>Why this works</h3>
                <div className={styles.resultValue}>{generationResult.why_this_works}</div>
              </div>
            )}
          </div>
        )}
        {optimizedResult && (
          <div className={styles.card}>
            <h2 className={styles.cardTitle}>Optimized Version (PRO)</h2>
            <div className={styles.resultSection}>
              <div className={styles.resultHeader}>
                <h3 className={styles.resultLabel}>Title</h3>
                <button
                  onClick={() => handleCopy(optimizedResult.optimized_title)}
                  className={styles.copyButton}
                >
                  Copy
                </button>
              </div>
              <p className={styles.resultValue}>{optimizedResult.optimized_title}</p>
            </div>
            <div className={styles.resultSection}>
              <div className={styles.resultHeader}>
                <h3 className={styles.resultLabel}>Description</h3>
                <button
                  onClick={() => handleCopy(optimizedResult.optimized_description)}
                  className={styles.copyButton}
                >
                  Copy
                </button>
              </div>
              <div className={styles.resultValue}>{optimizedResult.optimized_description}</div>
            </div>
          </div>
        )}
      </main>

      {modalOpen && (
        <div className={styles.modalOverlay} onClick={() => setModalOpen(null)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h3 className={styles.modalTitle}>
              {modalOpen === 'upgrade' ? 'Upgrade to Pro' : 'Monthly Limit Reached'}
            </h3>
            <p className={styles.modalText}>
              {modalOpen === 'upgrade' 
                ? 'You\'ve reached your free plan limit. Upgrade to Pro for unlimited generations.'
                : 'You\'ve reached your monthly generation limit. Your limit will reset next month.'}
            </p>
            <div className={styles.modalActions}>
              <button
                onClick={() => router.push('/upgrade')}
                className={styles.modalPrimaryButton}
              >
                Upgrade to Pro ($22/mo)
              </button>
              <button
                onClick={() => setModalOpen(null)}
                className={styles.modalSecondaryButton}
              >
                Not now
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
