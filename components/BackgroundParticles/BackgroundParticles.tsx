'use client'

import { useEffect, useRef, forwardRef, useImperativeHandle } from 'react'

interface Particle {
  x: number
  y: number
  radius: number
  baseRadius: number
  vx: number
  vy: number
  baseVx: number
  baseVy: number
  alpha: number
  baseAlpha: number
  color: string
}

type ParticleMode = 'idle' | 'converge' | 'charging' | 'burst' | 'backToIdle'

export interface BackgroundParticlesHandle {
  setTarget: (target: { x: number; y: number } | null) => void
  startConverge: () => void
  startBurst: () => void
  resetToIdle: () => void
}

const BackgroundParticles = forwardRef<BackgroundParticlesHandle>((props, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const particlesRef = useRef<Particle[]>([])
  const animationFrameRef = useRef<number>()
  const resizeObserverRef = useRef<ResizeObserver>()
  const dprRef = useRef<number>(1)
  const modeRef = useRef<ParticleMode>('idle')
  const targetRef = useRef<{ x: number; y: number } | null>(null)
  const modeStartTimeRef = useRef<number>(0)
  const prefersReducedMotionRef = useRef<boolean>(false)

  const easeInOutCubic = (t: number): number => {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
  }

  useImperativeHandle(ref, () => ({
    setTarget: (target: { x: number; y: number } | null) => {
      targetRef.current = target
    },
    startConverge: () => {
      if (prefersReducedMotionRef.current || !targetRef.current) return
      modeRef.current = 'converge'
      modeStartTimeRef.current = Date.now()
    },
    startBurst: () => {
      if (prefersReducedMotionRef.current || !targetRef.current) return
      modeRef.current = 'burst'
      modeStartTimeRef.current = Date.now()
      
      const particles = particlesRef.current
      const tx = targetRef.current.x
      const ty = targetRef.current.y
      
      particles.forEach((p) => {
        const dx = p.x - tx
        const dy = p.y - ty
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist > 0) {
          const impulse = 0.4
          p.vx += (dx / dist) * impulse
          p.vy += (dy / dist) * impulse
        }
        p.radius = p.baseRadius * 1.6
        p.alpha = Math.min(p.baseAlpha * 1.8, 0.85)
        p.color = `rgba(249, 115, 22, ${p.alpha.toFixed(2)})`
      })
    },
    resetToIdle: () => {
      modeRef.current = 'backToIdle'
      modeStartTimeRef.current = Date.now()
    },
  }))

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d', { alpha: false })
    if (!ctx) return

    prefersReducedMotionRef.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const getScrollHeight = (): number => {
      const docEl = document.documentElement
      return Math.max(
        docEl.scrollHeight,
        docEl.offsetHeight,
        docEl.clientHeight,
        document.body.scrollHeight,
        document.body.offsetHeight,
        document.body.clientHeight
      )
    }

    const updateCanvasSize = () => {
      if (!canvas) return
      
      dprRef.current = Math.min(window.devicePixelRatio || 1, 2)
      const width = window.innerWidth
      const height = getScrollHeight()
      
      canvas.width = width * dprRef.current
      canvas.height = height * dprRef.current
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      
      ctx.setTransform(dprRef.current, 0, 0, dprRef.current, 0, 0)
    }

    const createParticles = () => {
      if (!canvas) return
      const width = canvas.width / dprRef.current
      const height = canvas.height / dprRef.current
      const count = 345
      particlesRef.current = []

      for (let i = 0; i < count; i++) {
        const alpha = Math.random() * 0.27 + 0.28
        const vx = (Math.random() - 0.5) * 0.3
        const vy = (Math.random() - 0.5) * 0.3

        const radius = Math.random() * 1.5 + 1.3
        particlesRef.current.push({
          x: Math.random() * width,
          y: Math.random() * height,
          radius,
          baseRadius: radius,
          vx: vx,
          vy: vy,
          baseVx: vx,
          baseVy: vy,
          alpha: alpha,
          baseAlpha: alpha,
          color: `rgba(249, 115, 22, ${alpha.toFixed(2)})`,
        })
      }
    }

    const animate = () => {
      if (!canvas || !ctx) return

      const width = canvas.width / dprRef.current
      const height = canvas.height / dprRef.current
      const now = Date.now()
      const mode = modeRef.current
      const target = targetRef.current
      const modeElapsed = now - modeStartTimeRef.current

      ctx.clearRect(0, 0, width, height)

      particlesRef.current.forEach((particle) => {
        if ((mode === 'converge' || mode === 'charging') && target) {
          const dx = target.x - particle.x
          const dy = target.y - particle.y
          const dist = Math.sqrt(dx * dx + dy * dy)
          
          if (dist > 0) {
            let strength = 0.0008
            if (mode === 'converge') {
              const progress = Math.min(modeElapsed / 700, 1)
              const easeProgress = easeInOutCubic(progress)
              strength = 0.0008 + easeProgress * 0.0008
            }
            
            const ax = dx * strength
            const ay = dy * strength
            
            particle.vx += ax
            particle.vy += ay
            
            particle.vx *= 0.98
            particle.vy *= 0.98
            
            const maxVel = 1.4
            const vel = Math.sqrt(particle.vx * particle.vx + particle.vy * particle.vy)
            if (vel > maxVel) {
              particle.vx = (particle.vx / vel) * maxVel
              particle.vy = (particle.vy / vel) * maxVel
            }
            
            const alphaBoost = mode === 'charging' ? 1.45 : 1.25
            particle.alpha = Math.min(particle.baseAlpha * alphaBoost, 0.68)
            particle.color = `rgba(249, 115, 22, ${particle.alpha.toFixed(2)})`
          }
          
          if (mode === 'converge' && modeElapsed > 700) {
            modeRef.current = 'charging'
            modeStartTimeRef.current = Date.now()
          }
        } else if (mode === 'burst') {
          particle.vx *= 0.94
          particle.vy *= 0.94
          if (modeElapsed >= 200) {
            modeRef.current = 'backToIdle'
            modeStartTimeRef.current = Date.now()
          }
        } else if (mode === 'backToIdle') {
          const t = Math.min(modeElapsed / 400, 1)
          const ease = easeInOutCubic(t)

          particle.vx = particle.baseVx + (particle.vx - particle.baseVx) * (1 - ease)
          particle.vy = particle.baseVy + (particle.vy - particle.baseVy) * (1 - ease)
          particle.alpha = particle.baseAlpha + (particle.alpha - particle.baseAlpha) * (1 - ease)
          particle.radius = particle.baseRadius + (particle.radius - particle.baseRadius) * (1 - ease)
          particle.color = `rgba(249, 115, 22, ${particle.alpha.toFixed(2)})`

          if (t >= 1) {
            particle.vx = particle.baseVx
            particle.vy = particle.baseVy
            particle.alpha = particle.baseAlpha
            particle.radius = particle.baseRadius
            particle.color = `rgba(249, 115, 22, ${particle.alpha.toFixed(2)})`
            modeRef.current = 'idle'
            targetRef.current = null
          }
        }

        particle.x += particle.vx
        particle.y += particle.vy

        if (particle.x < 0) particle.x = width
        if (particle.x > width) particle.x = 0
        if (particle.y < 0) particle.y = height
        if (particle.y > height) particle.y = 0

        ctx.shadowColor = 'rgba(249, 115, 22, 0.35)'
        ctx.shadowBlur = 6
        ctx.beginPath()
        ctx.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2)
        ctx.fillStyle = particle.color
        ctx.fill()
      })

      animationFrameRef.current = requestAnimationFrame(animate)
    }

    const handleResize = () => {
      if (!canvas) return
      const oldHeight = canvas.height / dprRef.current
      updateCanvasSize()
      const newHeight = canvas.height / dprRef.current
      
      if (Math.abs(newHeight - oldHeight) > 50) {
        createParticles()
      } else if (newHeight !== oldHeight) {
        const scale = newHeight / oldHeight
        particlesRef.current.forEach((p) => {
          p.y *= scale
        })
      }
    }

    updateCanvasSize()
    createParticles()
    animate()

    window.addEventListener('resize', handleResize)

    resizeObserverRef.current = new ResizeObserver(() => {
      if (!canvas) return
      const oldHeight = canvas.height / dprRef.current
      updateCanvasSize()
      const newHeight = canvas.height / dprRef.current
      
      if (Math.abs(newHeight - oldHeight) > 50) {
        createParticles()
      } else if (newHeight !== oldHeight) {
        const scale = newHeight / oldHeight
        particlesRef.current.forEach((p) => {
          p.y *= scale
        })
      }
    })

    resizeObserverRef.current.observe(document.documentElement)
    if (document.body) {
      resizeObserverRef.current.observe(document.body)
    }

    return () => {
      window.removeEventListener('resize', handleResize)
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect()
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [])

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        pointerEvents: 'none',
        zIndex: 0,
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
          display: 'block',
        }}
      />
    </div>
  )
})

BackgroundParticles.displayName = 'BackgroundParticles'

export default BackgroundParticles
