import { describe, expect, it } from 'vitest'
import { SongClock } from '../src/renderer/clock'
import { THEMES } from '../src/renderer/themes/themes'
import { chooseTransition } from '../src/renderer/transitions/TransitionEngine'

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

  it('uses the OS timestamp to extrapolate stale samples', () => {
    const c = new SongClock()
    c.reset(5000, true, 1000)
    // The same sample seen 300ms later must not pull the clock back
    c.sync(5000, 1000, true, 200000, 1300)
    expect(c.now(1300)).toBe(5300)
  })
})

describe('chooseTransition', () => {
  const base = { sectionType: 'verse' as const, isSectionStart: false, energy: 0.5, lineIndex: 3, previousIn: null }

  it('uses the chorus entrance at the start of a chorus', () => {
    const c = chooseTransition({ ...base, theme: THEMES.revenge, sectionType: 'chorus', isSectionStart: true, intensity: 1 })
    expect(THEMES.revenge.transitions.chorus).toContain(c.in)
  })

  it('picks calm entrances for low intensity and intense ones for high', () => {
    const calm = chooseTransition({ ...base, theme: THEMES.hype, intensity: 0.3, energy: 0.1 })
    expect(THEMES.hype.transitions.calm).toContain(calm.in)
    const hot = chooseTransition({ ...base, theme: THEMES.hype, intensity: 1.4, energy: 0.9 })
    expect(THEMES.hype.transitions.intense).toContain(hot.in)
    expect(THEMES.hype.transitions.outIntense).toContain(hot.out)
  })

  it('avoids repeating the previous entrance', () => {
    for (let i = 0; i < 20; i++) {
      const c = chooseTransition({ ...base, theme: THEMES.romance, intensity: 0.5, lineIndex: i, previousIn: 'blur-dissolve' })
      expect(c.in).not.toBe('blur-dissolve')
    }
  })

  it('is deterministic per line', () => {
    const a = chooseTransition({ ...base, theme: THEMES.dark, intensity: 1 })
    const b = chooseTransition({ ...base, theme: THEMES.dark, intensity: 1 })
    expect(a).toEqual(b)
  })
})
