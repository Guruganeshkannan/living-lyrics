import { gsap } from 'gsap'
import { EasePack } from 'gsap/EasePack'

gsap.registerPlugin(EasePack)

/**
 * Modern kinetic-typography moves only: masks, slots, slices, bars, 3D turns and
 * word-synced pops. Transform/opacity/clip-path only — no fog, no glyph blur.
 */
export type InPreset =
  | 'word-pop'
  | 'odometer'
  | 'interleave'
  | 'bar-wipe'
  | 'scramble'
  | 'split-reveal'
  | 'mask-wipe'
  | 'rise-soft'
  | 'flip-up'
  | 'cube-turn'
  | 'unfold'
  | 'swing'
  | 'wave'
  | 'ripple'
  | 'elastic-stretch'
  | 'spiral-in'
  | 'letter-rain'
  | 'depth-fly'
  | 'scatter-in'
  | 'slide-words'
  | 'slam'
  | 'stamp'
  | 'zoom-through'
  | 'glitch-slice'
  | 'neon-flicker'
  | 'light-burst'

export type OutPreset =
  | 'lift-out'
  | 'slice-out'
  | 'collapse'
  | 'bar-wipe-out'
  | 'wipe-out'
  | 'flip-out'
  | 'drift-down'
  | 'sink'
  | 'fall-apart'
  | 'shatter'
  | 'slam-out'
  | 'zoom-past'
  | 'slide-out'
  | 'spin-out'
  | 'stretch-out'
  | 'glitch-out'
  | 'pop-out'

export interface TransitionCtx {
  line: HTMLElement
  words: HTMLElement[]
  /** Akshara / grapheme spans (whole words for Urdu) */
  chars: HTMLElement[]
  /** Red/cyan split copies used by glitch moves */
  rgb: HTMLElement[]
  /** Accent bar used by bar wipes */
  bar?: HTMLElement
  /** Seconds from line start to each word being sung (for word-synced moves) */
  wordDelays: number[]
  /** 0.2..1.6: scales distances and violence */
  intensity: number
  /** Multiplies durations so motion follows the song's tempo */
  pace: number
  rtl: boolean
  latin: boolean
  ease: { in: string; out: string; pop: string }
  rand: () => number
  /** Fired at the moment of impact (camera shake, flash) */
  onImpact?: (strength: number) => void
}

const r = (ctx: TransitionCtx, lo: number, hi: number) => lo + (hi - lo) * ctx.rand()
const SLOT = 'inset(-45% -8% -45% -8%)'

/** Letters/words move inside a fixed slot so they appear out of nowhere, crisp. */
function slotWords(tl: gsap.core.Timeline, c: TransitionCtx, dur: number) {
  tl.set(c.words, { clipPath: SLOT }, 0)
  tl.set(c.words, { clearProps: 'clipPath' }, dur)
}

export const IN_PRESETS: Record<InPreset, (c: TransitionCtx) => gsap.core.Timeline> = {
  // Caption style: each word pops exactly when it is sung
  'word-pop': (c) => {
    const tl = gsap.timeline()
    tl.set(c.words, { opacity: 0, scale: 0.55, y: 18 }, 0)
    c.words.forEach((w, i) => {
      const at = Math.max(0, c.wordDelays[i] ?? i * 0.2) - 0.04
      tl.to(w, { opacity: 1, scale: 1, y: 0, rotate: r(c, -3, 3), duration: 0.32, ease: 'back.out(2.6)' }, at)
      tl.to(w, { rotate: 0, duration: 0.4, ease: 'power2.out' }, at + 0.32)
    })
    return tl
  },

  // Letters roll up into their slots like a mechanical counter
  odometer: (c) => {
    const tl = gsap.timeline()
    const dur = 0.55 * c.pace + c.chars.length * 0.02
    slotWords(tl, c, dur + 0.1)
    tl.from(c.chars, { yPercent: 115, duration: 0.55 * c.pace, ease: 'expo.out', stagger: { each: 0.02, from: 'start' } }, 0)
    return tl
  },

  // Alternate letters slide in from above and below and lock together
  interleave: (c) => {
    const tl = gsap.timeline()
    const dur = 0.6 * c.pace + 0.2
    slotWords(tl, c, dur)
    tl.from(c.chars, { yPercent: (i) => (i % 2 ? 120 : -120), duration: 0.6 * c.pace, ease: 'power4.out', stagger: 0.012 }, 0)
    return tl
  },

  // Title-sequence wipe: an accent bar sweeps across and leaves the line behind it
  'bar-wipe': (c) => {
    const tl = gsap.timeline()
    const from = c.rtl ? '100% 50%' : '0% 50%'
    const to = c.rtl ? '0% 50%' : '100% 50%'
    tl.set(c.line, { opacity: 0 }, 0)
    if (c.bar) {
      tl.fromTo(c.bar, { scaleX: 0, transformOrigin: from, opacity: 1 }, { scaleX: 1, duration: 0.28 * c.pace, ease: 'power3.in' }, 0)
      tl.set(c.line, { opacity: 1 }, 0.28 * c.pace)
      tl.to(c.bar, { scaleX: 0, transformOrigin: to, duration: 0.32 * c.pace, ease: 'power3.out' }, 0.28 * c.pace)
    } else tl.set(c.line, { opacity: 1 }, 0.2)
    tl.from(c.chars, { x: c.rtl ? -18 : 18, duration: 0.5 * c.pace, ease: 'power3.out', stagger: 0.008 }, 0.28 * c.pace)
    return tl
  },

  // Decoder: letters cycle through random glyphs and lock into place (Latin lines)
  scramble: (c) => {
    const tl = gsap.timeline()
    const glyphs = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&*+=/<>'
    c.chars.forEach((ch, i) => {
      const final = ch.textContent ?? ''
      if (!c.latin || !/\S/.test(final)) return
      const proxy = { t: 0 }
      tl.to(
        proxy,
        {
          t: 1,
          duration: 0.35 * c.pace,
          ease: 'none',
          onUpdate: () => {
            ch.textContent = proxy.t < 1 ? glyphs[Math.floor(Math.random() * glyphs.length)] : final
          },
          onComplete: () => {
            ch.textContent = final
          }
        },
        i * 0.025 * c.pace
      )
    })
    tl.from(c.chars, { opacity: 0, duration: 0.05, stagger: 0.025 * c.pace }, 0)
    return tl
  },

  // Each word rises out of an invisible slot
  'split-reveal': (c) =>
    gsap.timeline().fromTo(
      c.words,
      { clipPath: 'inset(100% -10% -10% -10%)', yPercent: 70 },
      { clipPath: SLOT, yPercent: 0, duration: 0.65 * c.pace, ease: 'power4.out', stagger: 0.08 * c.pace, clearProps: 'clipPath' }
    ),

  // Hard-edged reveal sweeping across in reading direction
  'mask-wipe': (c) => {
    const tl = gsap.timeline()
    tl.fromTo(c.line, { clipPath: c.rtl ? 'inset(-30% -20% -30% 100%)' : 'inset(-30% 100% -30% -20%)' }, { clipPath: 'inset(-30% -20% -30% -20%)', duration: 0.6 * c.pace, ease: 'power4.inOut', clearProps: 'clipPath' })
    tl.from(c.chars, { x: c.rtl ? -24 : 24, duration: 0.7 * c.pace, ease: 'power3.out', stagger: 0.01 }, 0)
    return tl
  },

  'rise-soft': (c) =>
    gsap.timeline().from(c.words, { opacity: 0, y: 50 * c.intensity, rotateX: -55, transformOrigin: '50% 100%', duration: 0.8 * c.pace, ease: 'expo.out', stagger: 0.06 * c.pace }),

  // Split-flap board: every letter flips down into place
  'flip-up': (c) =>
    gsap.timeline().from(c.chars, { rotateX: -100, opacity: 0, transformOrigin: '50% 0%', duration: 0.55 * c.pace, ease: 'back.out(2)', stagger: { each: 0.025 * c.pace, from: 'start' } }),

  // Words turn in like the faces of a cube
  'cube-turn': (c) =>
    gsap.timeline().from(c.words, { rotateY: c.rtl ? 95 : -95, transformOrigin: c.rtl ? '100% 50% -40px' : '0% 50% -40px', opacity: 0, duration: 0.7 * c.pace, ease: 'power3.out', stagger: 0.08 * c.pace }),

  unfold: (c) =>
    gsap.timeline().from(c.chars, { opacity: 0, rotateY: 95, z: -200, transformOrigin: '50% 50% -30px', duration: 0.9 * c.pace, ease: 'expo.out', stagger: { each: 0.025 * c.pace, from: 'center' } }),

  // Letters swing down on hinges and settle
  swing: (c) => gsap.timeline().from(c.chars, { rotateX: 110, transformOrigin: '50% 0%', opacity: 0, duration: 1.0 * c.pace, ease: 'elastic.out(1, 0.35)', stagger: 0.03 * c.pace }),

  wave: (c) => gsap.timeline().from(c.chars, { opacity: 0, yPercent: 120, scaleY: 1.6, duration: 0.7 * c.pace, ease: 'back.out(2)', stagger: { each: 0.02 * c.pace, from: 'center' } }),

  // A ripple runs out from the middle of the line
  ripple: (c) => {
    const mid = (c.chars.length - 1) / 2
    return gsap.timeline().from(c.chars, { scale: 0, y: (i) => -Math.abs(i - mid) * 6 - 20, opacity: 0, duration: 0.65 * c.pace, ease: 'back.out(3)', stagger: { each: 0.025 * c.pace, from: 'center' } })
  },

  'elastic-stretch': (c) => gsap.timeline().from(c.chars, { scaleX: 0, scaleY: 1.8, opacity: 0, duration: 0.9 * c.pace, ease: 'elastic.out(1, 0.4)', stagger: { each: 0.02, from: 'center' } }),

  'spiral-in': (c) => {
    const n = c.chars.length
    return gsap.timeline().from(c.chars, {
      x: (i) => Math.cos((i / n) * 12) * (220 + i * 8) * c.intensity,
      y: (i) => Math.sin((i / n) * 12) * (160 + i * 6) * c.intensity,
      rotate: (i) => (i % 2 ? 1 : -1) * 220,
      scale: 0,
      opacity: 0,
      duration: 0.85 * c.pace,
      ease: 'power3.out',
      stagger: 0.015
    })
  },

  'letter-rain': (c) =>
    gsap.timeline().from(c.chars, { y: () => -r(c, 250, 500) * c.intensity, rotate: () => r(c, -40, 40), opacity: 0, duration: 0.65 * c.pace, ease: 'expo.out', stagger: { each: 0.022 * c.pace, from: 'random' } }),

  // Letters stream in out of the depths of the scene
  'depth-fly': (c) =>
    gsap.timeline().from(c.chars, { z: () => -r(c, 900, 2200), x: () => r(c, -200, 200), y: () => r(c, -150, 150), opacity: 0, duration: 0.95 * c.pace, ease: 'expo.out', stagger: { each: 0.016, from: 'random' } }),

  'scatter-in': (c) =>
    gsap.timeline().from(c.chars, {
      opacity: 0,
      x: () => r(c, -400, 400) * c.intensity,
      y: () => r(c, -300, 300) * c.intensity,
      z: () => r(c, -300, 500),
      rotate: () => r(c, -180, 180),
      scale: () => r(c, 0.2, 2.5),
      duration: 0.65 * c.pace,
      ease: 'expo.out',
      stagger: { each: 0.01, from: 'random' }
    }),

  'slide-words': (c) => {
    const tl = gsap.timeline()
    c.words.forEach((w, i) => {
      const side = i % 2 ? 1 : -1
      tl.from(w, { x: side * 520 * c.intensity, skewX: side * -25, opacity: 0, duration: 0.4 * c.pace, ease: 'expo.out' }, i * 0.07 * c.pace)
    })
    return tl
  },

  // Word-by-word slams, each one a camera hit
  slam: (c) => {
    const tl = gsap.timeline()
    c.words.forEach((w, i) => {
      const at = i * 0.07 * c.pace
      tl.from(w, { scale: 2.8 + c.intensity, z: 300, opacity: 0, duration: 0.28 * c.pace, ease: 'expo.in' }, at)
      tl.call(() => c.onImpact?.(0.45 + 0.45 * c.intensity), undefined, at + 0.28 * c.pace)
      tl.to(w, { y: 6 * c.intensity, duration: 0.06, yoyo: true, repeat: 1, ease: 'power2.out' }, at + 0.28 * c.pace)
    })
    return tl
  },

  stamp: (c) => {
    const tl = gsap.timeline()
    tl.from(c.line, { scale: 3.2, rotate: () => r(c, -10, 10), opacity: 0, duration: 0.26 * c.pace, ease: 'power4.in' })
    tl.call(() => c.onImpact?.(0.7 + 0.3 * c.intensity))
    tl.to(c.line, { scale: 1.04, duration: 0.06, yoyo: true, repeat: 1, ease: 'power2.out' })
    return tl
  },

  // Rockets in from deep space; letters snap together
  'zoom-through': (c) => {
    const tl = gsap.timeline()
    tl.from(c.line, { scale: 0.25, z: -600, opacity: 0, duration: 0.65 * c.pace, ease: 'expo.out' }, 0)
    const mid = (c.chars.length - 1) / 2
    tl.from(c.chars, { x: (i) => (i - mid) * 28 * c.intensity, duration: 0.8 * c.pace, ease: 'expo.out' }, 0)
    return tl
  },

  'glitch-slice': (c) => {
    const tl = gsap.timeline()
    tl.set(c.rgb, { opacity: 0.85 })
    tl.from(c.chars, { opacity: 0, x: () => r(c, -90, 90) * c.intensity, skewX: () => r(c, -40, 40), duration: 0.34 * c.pace, ease: 'steps(6)', stagger: { each: 0.008, from: 'random' } })
    for (let i = 0; i < 4; i++) {
      const top = r(c, 0, 70)
      tl.set(c.line, { clipPath: `inset(${top}% -20% ${Math.max(0, 85 - top)}% -20%)`, x: r(c, -30, 30) * c.intensity }, 0.05 + i * 0.06)
    }
    tl.set(c.line, { clipPath: 'none', x: 0 }, 0.32)
    tl.call(() => c.onImpact?.(0.6 * c.intensity), undefined, 0.3)
    tl.to(c.rgb, { opacity: 0, duration: 0.45, ease: 'power2.out' }, 0.35)
    return tl
  },

  // A neon sign stuttering on
  'neon-flicker': (c) => {
    const tl = gsap.timeline()
    tl.set(c.chars, { opacity: 0 })
    c.chars.forEach((ch) => {
      const at = r(c, 0, 0.45) * c.pace
      tl.to(ch, { opacity: 1, duration: 0.02 }, at)
        .to(ch, { opacity: 0.15, duration: 0.02 }, at + 0.06)
        .to(ch, { opacity: 1, duration: 0.02 }, at + 0.1)
        .to(ch, { opacity: 0.4, duration: 0.02 }, at + 0.16)
        .to(ch, { opacity: 1, duration: 0.02 }, at + 0.2)
    })
    tl.set(c.rgb, { opacity: 0.5 }, 0).to(c.rgb, { opacity: 0, duration: 0.5 }, 0.3)
    return tl
  },

  // Light burst: the line flashes out of a point of light at full size (chorus openers)
  'light-burst': (c) => {
    const tl = gsap.timeline()
    tl.call(() => c.onImpact?.(0.4 * c.intensity), undefined, 0)
    tl.from(c.line, { scale: 1.35, duration: 1.1 * c.pace, ease: 'expo.out' }, 0)
    tl.from(c.chars, { opacity: 0, scale: 0, z: () => r(c, -150, 150), duration: 0.6 * c.pace, ease: 'back.out(2.5)', stagger: { each: 0.016, from: 'center' } }, 0)
    return tl
  }
}

export const OUT_PRESETS: Record<OutPreset, (c: TransitionCtx) => gsap.core.Timeline> = {
  // Crisp modern exit: lift, slight shrink, gone
  'lift-out': (c) => gsap.timeline().to(c.line, { y: -50, scale: 0.94, opacity: 0, duration: 0.3 * c.pace, ease: 'expo.in' }),

  // Words drop back into their slots
  'slice-out': (c) =>
    gsap.timeline().set(c.words, { clipPath: SLOT }).to(c.words, { yPercent: 120, duration: 0.4 * c.pace, ease: 'power4.in', stagger: { each: 0.04, from: 'end' } }),

  // Letters squash flat toward the baseline from the edges inward
  collapse: (c) => gsap.timeline().to(c.chars, { scaleY: 0, transformOrigin: '50% 80%', opacity: 0, duration: 0.3 * c.pace, ease: 'power3.in', stagger: { each: 0.012, from: 'edges' } }),

  'bar-wipe-out': (c) => {
    const tl = gsap.timeline()
    const from = c.rtl ? '100% 50%' : '0% 50%'
    const to = c.rtl ? '0% 50%' : '100% 50%'
    if (c.bar) {
      tl.fromTo(c.bar, { scaleX: 0, transformOrigin: from, opacity: 1 }, { scaleX: 1, duration: 0.24 * c.pace, ease: 'power3.in' })
      tl.set(c.line, { opacity: 0 })
      tl.to(c.bar, { scaleX: 0, transformOrigin: to, duration: 0.26 * c.pace, ease: 'power3.out' })
    } else tl.to(c.line, { opacity: 0, duration: 0.2 })
    return tl
  },

  'wipe-out': (c) => gsap.timeline().to(c.line, { clipPath: c.rtl ? 'inset(-30% 100% -30% -20%)' : 'inset(-30% -20% -30% 100%)', duration: 0.45 * c.pace, ease: 'power4.in' }),

  'flip-out': (c) => gsap.timeline().to(c.chars, { rotateX: 100, opacity: 0, transformOrigin: '50% 100%', duration: 0.4 * c.pace, ease: 'power2.in', stagger: { each: 0.012, from: 'start' } }),

  // Tears: letters slide down and away at their own speeds
  'drift-down': (c) =>
    gsap.timeline().to(c.chars, { opacity: 0, y: () => r(c, 60, 180), rotate: () => r(c, -12, 12), duration: () => r(c, 0.8, 1.3) * c.pace, ease: 'power2.in', stagger: { each: 0.012, from: 'random' } }),

  sink: (c) => gsap.timeline().to(c.chars, { y: 60, scaleY: 0.1, opacity: 0, transformOrigin: '50% 100%', duration: 0.55 * c.pace, ease: 'power2.in', stagger: { each: 0.018, from: 'end' } }),

  'fall-apart': (c) =>
    gsap.timeline().to(c.chars, { y: () => r(c, 300, 700), x: () => r(c, -60, 60), rotate: () => r(c, -120, 120), opacity: 0, duration: () => r(c, 0.6, 1.0) * c.pace, ease: 'power2.in', stagger: { each: 0.02, from: 'random' } }),

  shatter: (c) => {
    c.onImpact?.(0.5 * c.intensity)
    return gsap.timeline().to(c.chars, {
      opacity: 0,
      x: () => r(c, -500, 500) * c.intensity,
      y: () => r(c, -350, 350) * c.intensity,
      z: () => r(c, -200, 600),
      rotate: () => r(c, -540, 540),
      duration: 0.6 * c.pace,
      ease: 'expo.out',
      stagger: { each: 0.004, from: 'center' }
    })
  },

  'slam-out': (c) => gsap.timeline().to(c.line, { scale: 0.4, z: -400, opacity: 0, duration: 0.22 * c.pace, ease: 'expo.in' }),

  'zoom-past': (c) => gsap.timeline().to(c.line, { scale: 2.5, z: 500, opacity: 0, duration: 0.4 * c.pace, ease: 'expo.in' }),

  'slide-out': (c) => {
    const tl = gsap.timeline()
    c.words.forEach((w, i) => tl.to(w, { x: (i % 2 ? 1 : -1) * 600, skewX: (i % 2 ? -1 : 1) * 25, opacity: 0, duration: 0.33 * c.pace, ease: 'expo.in' }, i * 0.04))
    return tl
  },

  'spin-out': (c) =>
    gsap.timeline().to(c.chars, {
      rotate: () => r(c, 180, 540) * (c.rand() < 0.5 ? -1 : 1),
      scale: 0,
      x: () => r(c, -150, 150),
      y: () => r(c, -150, 150),
      opacity: 0,
      duration: 0.5 * c.pace,
      ease: 'power3.in',
      stagger: { each: 0.008, from: 'center' }
    }),

  'stretch-out': (c) => gsap.timeline().to(c.chars, { scaleX: 3, scaleY: 0.05, opacity: 0, duration: 0.38 * c.pace, ease: 'expo.in', stagger: { each: 0.01, from: 'center' } }),

  'glitch-out': (c) => {
    const tl = gsap.timeline()
    tl.set(c.rgb, { opacity: 0.9 })
    for (let i = 0; i < 5; i++) tl.set(c.line, { x: r(c, -40, 40) * c.intensity, skewX: r(c, -20, 20), opacity: i % 2 ? 0.3 : 1 }, i * 0.04)
    tl.to(c.chars, { opacity: 0, scaleY: () => r(c, 0.05, 0.3), duration: 0.12, stagger: { each: 0.003, from: 'random' } }, 0.2)
    return tl
  },

  'pop-out': (c) => gsap.timeline().to(c.chars, { scale: 0, opacity: 0, y: -30, duration: 0.3 * c.pace, ease: 'back.in(3)', stagger: { each: 0.01, from: 'edges' } })
}
