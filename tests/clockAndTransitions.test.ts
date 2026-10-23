import { describe, expect, it } from 'vitest'
import { SongClock } from '../src/renderer/clock'
import { ExitStyle, THEMES } from '../src/renderer/themes/themes'
import { IN_PROFILES, chooseTransition, type TransitionChoiceInput } from '../src/renderer/transitions/TransitionEngine'
import type { InPreset } from '../src/renderer/transitions/presets'

describe('SongClock', () => {
  it('extrapolates while playing and freezes when paused', () => {
    const c = new SongClock()
    c.reset(10000, true, 0)
    expect(c.now(500)).toBe(10500)
    c.sync(10500, 500, false, 200000, 500)
    expect(c.now(5000)).toBe(10500)
  })

  it('slews small drift but jumps on seeks', () => {
    const c = new SongClock()
    c.reset(0, true, 0)
    // OS says we're 200ms ahead: partial correction only
    expect(c.sync(1200, 1000, true, 200000, 1000)).toBe(false)
    const t = c.now(1000)
    expect(t).toBeGreaterThan(1000)
    expect(t).toBeLessThan(1200)
    expect(c.sync(60000, 2000, true, 200000, 2000)).toBe(true)
    expect(c.now(2000)).toBe(60000)
  })

  it('ignores repeated samples instead of dragging the clock back', () => {
    const c = new SongClock()
    c.reset(0, true, 0)
    // Source without usable timestamps (updatedAt = 0) keeps re-sending position 1000
    c.sync(1000, 0, true, 200000, 1000)
    const t1 = c.now(3000)
    c.sync(1000, 0, true, 200000, 3000)
    c.sync(1000, 0, true, 200000, 5000)
    expect(c.now(5000)).toBe(t1 + 2000)
  })

  it('stamps samples without usable timestamps with their arrival time', () => {
    const c = new SongClock()
    c.reset(10000, true, 0)
    c.sync(10000, 0, true, 200000, 0)
    // A fresh sample arrives 2s later saying 12000: no correction needed
    expect(c.sync(12000, 0, true, 200000, 2000)).toBe(false)
    expect(c.now(2000)).toBe(12000)
  })

  it('uses the OS timestamp to extrapolate stale samples', () => {
    const c = new SongClock()
    c.reset(5000, true, 1000)
    // The same sample seen 300ms later must not pull the clock back
    c.sync(5000, 1000, true, 200000, 1300)
    expect(c.now(1300)).toBe(5300)
  })
})

describe('chooseTransition (song-driven)', () => {
  const base: TransitionChoiceInput = {
    theme: THEMES.romance,
    blend: [{ id: 'romance', weight: 1 }],
    sectionType: 'verse',
    isSectionStart: false,
    isSectionEnd: false,
    intensity: 0.8,
    energy: 0.4,
    bpm: 100,
    lineIndex: 3,
    lineDurationMs: 3500,
    lineChars: 24,
    lineArousal: 0,
    keywords: [],
    recentIn: [],
    recentOut: [],
    pace: 1,
    latin: true,
    synced: true
  }
  const energyOf = (name: string) => IN_PROFILES[name as keyof typeof IN_PROFILES].energy

  it('hits harder for intense songs and moments than for gentle ones', () => {
    const gentle = chooseTransition({ ...base, theme: THEMES.calm, blend: [{ id: 'calm', weight: 1 }], intensity: 0.4, energy: 0.1, bpm: 72, lineArousal: -0.7 })
    const brutal = chooseTransition({ ...base, theme: THEMES.revenge, blend: [{ id: 'revenge', weight: 1 }], intensity: 1.5, energy: 0.95, bpm: 160, lineArousal: 0.9 })
    expect(energyOf(brutal.in)).toBeGreaterThan(energyOf(gentle.in) + 0.3)
    expect(brutal.targetEnergy).toBeGreaterThan(gentle.targetEnergy)
  })

  it('never uses fog / old-school moves', () => {
    for (let i = 0; i < 40; i++) {
      const c = chooseTransition({ ...base, lineIndex: i })
      expect(['blur-dissolve', 'typewriter', 'bounce', 'dissolve', 'fade-up']).not.toContain(c.in)
    }
  })

  it('lets the lyrics pick the exit: "break" shatters, "tears" fall', () => {
    const breaking = chooseTransition({ ...base, theme: THEMES.revenge, blend: [{ id: 'revenge', weight: 1 }], keywords: ['shatter'], energy: 0.9, intensity: 1.3 })
    expect(breaking.particleExit).toBe(true)
    expect(breaking.exitStyle).toBe(ExitStyle.Explode)
    const tears = chooseTransition({ ...base, theme: THEMES.heartbreak, blend: [{ id: 'heartbreak', weight: 1 }], keywords: ['drip'] })
    expect(tears.exitStyle).toBe(ExitStyle.Droplets)
    expect(['drift-down', 'fall-apart', 'sink']).toContain(tears.out)
  })

  it('uses particle exits as punctuation, not every line', () => {
    let particles = 0
    for (let i = 0; i < 60; i++) if (chooseTransition({ ...base, lineIndex: i }).particleExit) particles++
    expect(particles).toBeLessThan(25)
    expect(chooseTransition({ ...base, isSectionEnd: true }).particleExit).toBe(true)
  })

  it('respects how much time the line gives', () => {
    for (let i = 0; i < 20; i++) {
      const c = chooseTransition({ ...base, lineIndex: i, lineDurationMs: 900 })
      expect(IN_PROFILES[c.in].needs).toBeLessThanOrEqual(0.8)
    }
  })

  it('keeps script- and timing-specific moves where they work', () => {
    for (let i = 0; i < 30; i++) {
      const c = chooseTransition({ ...base, theme: THEMES.dark, blend: [{ id: 'dark', weight: 1 }], lineIndex: i, latin: false, synced: false })
      expect(c.in).not.toBe('scramble')
      expect(c.in).not.toBe('word-pop')
    }
  })

  it('varies line to line and avoids immediate repeats', () => {
    const seen = new Set<string>()
    let recentIn: InPreset[] = []
    for (let i = 0; i < 16; i++) {
      const c = chooseTransition({ ...base, lineIndex: i, recentIn })
      expect(c.in).not.toBe(recentIn[0])
      recentIn = [c.in, ...recentIn].slice(0, 3)
      seen.add(c.in)
    }
    expect(seen.size).toBeGreaterThanOrEqual(4)
  })

  it('is deterministic for the same song moment', () => {
    expect(chooseTransition(base)).toEqual(chooseTransition(base))
  })
})
