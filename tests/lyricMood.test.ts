import { describe, expect, it } from 'vitest'
import { analyzeLine, analyzeLyrics } from '../src/main/lyricMood'
import { parseLrc } from '../src/main/lrcParser'
import { nearestMoods } from '../src/shared/moods'

const top = (text: string) => nearestMoods(analyzeLine(text), 1)[0].id

describe('lyric mood', () => {
  it('scores revenge lyrics as negative and intense', () => {
    const text = "I'll make you pay, burn it down, you liar"
    const a = analyzeLine(text)
    expect(a.valence).toBeLessThan(-0.2)
    expect(a.arousal).toBeGreaterThan(0.3)
    expect(top(text)).toBe('revenge')
  })

  it('scores romance lyrics as warm and gentle', () => {
    const text = 'hold me close tonight, my darling, kiss me slow'
    expect(analyzeLine(text).valence).toBeGreaterThan(0.3)
    expect(top(text)).toBe('romance')
  })

  it('reads heartbreak', () => {
    expect(top('tears on my pillow, now I am alone, goodbye')).toBe('heartbreak')
  })

  it('flips negated words', () => {
    const plain = analyzeLine('I love you')
    const negated = analyzeLine("I don't love you anymore")
    expect(negated.valence).toBeLessThan(plain.valence)
    expect(negated.weights.heartbreak ?? 0).toBeGreaterThan(0)
  })

  it('finds keyword effects at the right word', () => {
    expect(analyzeLine('my heart is on fire').keywords).toEqual([
      { wordIndex: 1, word: 'heart', effect: 'heartbeat' },
      { wordIndex: 4, word: 'fire', effect: 'burn' }
    ])
  })

  it('analyzes a whole song with sections', () => {
    const lrc = [
      '[00:01.00]Walking alone in the rain',
      '[00:05.00]Thinking about you',
      '[00:10.00]Hold me tonight',
      '[00:14.00]Never let me go',
      '[00:20.00]Another lonely day',
      '[00:25.00]Hold me tonight',
      '[00:29.00]Never let me go'
    ].join('\n')
    const res = analyzeLyrics(parseLrc(lrc, 40000), 40000)
    expect(res.lines).toHaveLength(7)
    expect(res.sections.some((s) => s.type === 'chorus')).toBe(true)
    expect(res.overall.strength).toBeGreaterThan(0)
  })
})
