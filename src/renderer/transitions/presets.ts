import { gsap } from 'gsap'
import { EasePack } from 'gsap/EasePack'

gsap.registerPlugin(EasePack)

export type InPreset =
  | 'blur-dissolve'
  | 'rise-soft'
  | 'typewriter'
  | 'wave'
  | 'bounce'
  | 'scatter-in'
  | 'slam'
  | 'zoom-through'
  | 'glitch-slice'
  | 'unfold'
  | 'bloom-open'

export type OutPreset = 'fade-up' | 'dissolve' | 'drift-down' | 'shatter' | 'slam-out' | 'zoom-past' | 'glitch-out' | 'pop-out'

export interface TransitionCtx {
  line: HTMLElement
  words: HTMLElement[]
  chars: HTMLElement[]
  /** 0.2..1.6: scales distances, blur and violence */
  intensity: number
  /** Multiplies durations so motion follows the song's tempo */
  pace: number
  ease: { in: string; out: string; pop: string }
  rand: () => number
  /** Fired at the moment of impact (camera shake, flash) */
  onImpact?: (strength: number) => void
}

const r = (ctx: TransitionCtx, lo: number, hi: number) => lo + (hi - lo) * ctx.rand()

export const IN_PRESETS: Record<InPreset, (c: TransitionCtx) => gsap.core.Timeline> = {
  'blur-dissolve': (c) =>
    gsap.timeline().from(c.chars, {
      opacity: 0,
      filter: `blur(${10 + 8 * c.intensity}px)`,
      y: 14,
      duration: 1.0 * c.pace,
      ease: c.ease.in,
      stagger: { each: 0.025 * c.pace, from: 'start' }
    }),

  'rise-soft': (c) =>
    gsap.timeline().from(c.words, {
      opacity: 0,
      y: 50 * c.intensity,
      rotateX: -55,
      filter: 'blur(6px)',
      transformOrigin: '50% 100%',
      duration: 0.9 * c.pace,
      ease: c.ease.in,
      stagger: 0.07 * c.pace
    }),

  typewriter: (c) =>
    gsap
      .timeline()
      .from(c.chars, { opacity: 0, duration: 0.01, stagger: 0.035 * c.pace, ease: 'none' })
      .from(c.chars, { color: '#ffffff', textShadow: '0 0 24px #fff', duration: 0.5, stagger: 0.035 * c.pace, ease: 'power1.out' }, 0),

  wave: (c) =>
    gsap.timeline().from(c.chars, {
      opacity: 0,
      y: 70 * c.intensity,
      scaleY: 1.6,
      duration: 0.8 * c.pace,
      ease: 'back.out(2)',
      stagger: { each: 0.022 * c.pace, from: 'center' }
    }),

  bounce: (c) =>
    gsap.timeline().from(c.chars, {
      opacity: 0,
      y: () => -r(c, 80, 160) * c.intensity,
      rotate: () => r(c, -25, 25),
      duration: 0.9 * c.pace,
      ease: 'bounce.out',
      stagger: 0.028 * c.pace
    }),

  'scatter-in': (c) =>
    gsap.timeline().from(c.chars, {
      opacity: 0,
      x: () => r(c, -400, 400) * c.intensity,
      y: () => r(c, -300, 300) * c.intensity,
      rotate: () => r(c, -180, 180),
      scale: () => r(c, 0.2, 2.5),
      filter: 'blur(8px)',
      duration: 0.75 * c.pace,
      ease: 'expo.out',
      stagger: { each: 0.012, from: 'random' }
    }),

  slam: (c) => {
    const tl = gsap.timeline()
    c.words.forEach((w, i) => {
      const at = i * 0.07 * c.pace
      tl.from(w, { scale: 2.8 + c.intensity, opacity: 0, filter: 'blur(10px)', duration: 0.32 * c.pace, ease: 'expo.in' }, at)
      tl.call(() => c.onImpact?.(0.5 + 0.5 * c.intensity), undefined, at + 0.32 * c.pace)
      tl.to(w, { y: 6 * c.intensity, duration: 0.06, yoyo: true, repeat: 1, ease: 'power2.out' }, at + 0.32 * c.pace)
    })
    return tl
  },

  'zoom-through': (c) =>
    gsap
      .timeline()
      .from(c.line, { scale: 0.2, opacity: 0, filter: 'blur(14px)', duration: 0.7 * c.pace, ease: 'expo.out' })
      .from(c.chars, { letterSpacing: '0.6em', duration: 0.9 * c.pace, ease: 'expo.out' }, 0),

  'glitch-slice': (c) => {
    const tl = gsap.timeline()
    tl.set(c.line, { '--ab': 1 })
    tl.from(c.chars, {
      opacity: 0,
      x: () => r(c, -90, 90) * c.intensity,
      skewX: () => r(c, -40, 40),
      duration: 0.38 * c.pace,
      ease: 'steps(6)',
      stagger: { each: 0.01, from: 'random' }
    })
    // Horizontal slice flicker across the whole line
    for (let i = 0; i < 4; i++) {
      const top = r(c, 0, 70)
      tl.set(c.line, { clipPath: `inset(${top}% 0 ${Math.max(0, 85 - top)}% 0)`, x: r(c, -30, 30) * c.intensity }, 0.05 + i * 0.06)
    }
    tl.set(c.line, { clipPath: 'inset(-50% -50% -50% -50%)', x: 0 }, 0.32)
    tl.call(() => c.onImpact?.(0.6 * c.intensity), undefined, 0.3)
    tl.to(c.line, { '--ab': 0, duration: 0.6, ease: 'power2.out' }, 0.35)
    return tl
  },

  unfold: (c) =>
    gsap.timeline().from(c.chars, {
      opacity: 0,
      rotateY: 95,
      z: -200,
      transformOrigin: '50% 50% -30px',
      duration: 1.0 * c.pace,
      ease: c.ease.in,
      stagger: { each: 0.035 * c.pace, from: 'center' }
    }),

  'bloom-open': (c) => {
    const tl = gsap.timeline()
    tl.call(() => c.onImpact?.(0.35 * c.intensity), undefined, 0)
    tl.from(c.line, { scale: 1.25, duration: 1.4 * c.pace, ease: 'power3.out' }, 0)
    tl.from(c.chars, { opacity: 0, filter: 'blur(20px) brightness(3)', y: () => r(c, -20, 20), duration: 1.1 * c.pace, ease: 'power2.out', stagger: { each: 0.02, from: 'center' } }, 0)
    return tl
  }
}

export const OUT_PRESETS: Record<OutPreset, (c: TransitionCtx) => gsap.core.Timeline> = {
  'fade-up': (c) => gsap.timeline().to(c.line, { y: -60 * c.intensity, opacity: 0, filter: 'blur(10px)', duration: 0.6 * c.pace, ease: c.ease.out }),

  dissolve: (c) =>
    gsap.timeline().to(c.chars, {
      opacity: 0,
      filter: 'blur(12px)',
      y: () => r(c, -20, 20),
      duration: 0.6 * c.pace,
      ease: 'power1.in',
      stagger: { each: 0.01, from: 'random' }
    }),

  'drift-down': (c) =>
    gsap.timeline().to(c.chars, {
      opacity: 0,
      y: () => r(c, 60, 180),
      rotate: () => r(c, -12, 12),
      filter: 'blur(4px)',
      duration: () => r(c, 0.9, 1.6) * c.pace,
      ease: 'power2.in',
      stagger: { each: 0.015, from: 'random' }
    }),

  shatter: (c) => {
    c.onImpact?.(0.5 * c.intensity)
    return gsap.timeline().to(c.chars, {
      opacity: 0,
      x: () => r(c, -500, 500) * c.intensity,
      y: () => r(c, -350, 350) * c.intensity,
      rotate: () => r(c, -540, 540),
      scale: () => r(c, 0.2, 1.8),
      duration: 0.7 * c.pace,
      ease: 'expo.out',
      stagger: { each: 0.004, from: 'center' }
    })
  },

  'slam-out': (c) => gsap.timeline().to(c.line, { scale: 0.4, opacity: 0, filter: 'blur(8px)', duration: 0.22 * c.pace, ease: 'expo.in' }),

  'zoom-past': (c) => gsap.timeline().to(c.line, { scale: 3.5, opacity: 0, filter: 'blur(18px)', duration: 0.45 * c.pace, ease: 'expo.in' }),

  'glitch-out': (c) => {
    const tl = gsap.timeline()
    tl.set(c.line, { '--ab': 1 })
    for (let i = 0; i < 5; i++) {
      tl.set(c.line, { x: r(c, -40, 40) * c.intensity, skewX: r(c, -20, 20), opacity: i % 2 ? 0.3 : 1 }, i * 0.04)
    }
    tl.to(c.chars, { opacity: 0, scaleY: () => r(c, 0.05, 0.3), duration: 0.12, stagger: { each: 0.003, from: 'random' } }, 0.2)
    return tl
  },

  'pop-out': (c) =>
    gsap.timeline().to(c.chars, {
      scale: 0,
      opacity: 0,
      y: -30,
      duration: 0.35 * c.pace,
      ease: 'back.in(3)',
      stagger: { each: 0.012, from: 'edges' }
    })
}
