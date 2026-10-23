import { describe, expect, it } from 'vitest'
import { estimateWords, parseLrc, spreadPlainLyrics } from '../src/main/lrcParser'

describe('parseLrc', () => {
  it('parses standard lines, sorts them and derives end times', () => {
    const lines = parseLrc('[ar:Someone]\n[00:12.50]Second\n[00:05.00]First line here\n[00:20.00]Third', 30000)
    expect(lines.map((l) => l.text)).toEqual(['First line here', 'Second', 'Third'])
    expect(lines[0].startMs).toBe(5000)
    expect(lines[0].endMs).toBe(12500)
    expect(lines[2].endMs).toBe(26000)
    expect(lines[0].words).toHaveLength(3)
  })

  it('expands repeated time tags and marks stanza breaks', () => {
    const lines = parseLrc('[00:01.00][00:10.00]Chorus\n[00:05.00]\n[00:06.00]Verse')
    expect(lines.map((l) => [l.startMs, l.text])).toEqual([
      [1000, 'Chorus'],
      [6000, 'Verse'],
      [10000, 'Chorus']
    ])
    expect(lines[1].stanzaBreak).toBe(true)
    expect(lines[0].endMs).toBe(5000)
  })

  it('reads enhanced word timestamps', () => {
    const [line] = parseLrc('[00:01.00]<00:01.00>Hello <00:01.50>big <00:02.00>world')
    expect(line.words.map((w) => [w.text, w.startMs])).toEqual([
      ['Hello', 1000],
      ['big', 1500],
      ['world', 2000]
    ])
    expect(line.text).toBe('Hello big world')
  })

  it('applies [offset:] and ignores garbage', () => {
    const lines = parseLrc('[offset:+500]\nnot a lyric\n[xx:yy]bad\n[00:02.00]ok')
    expect(lines).toHaveLength(1)
    expect(lines[0].startMs).toBe(1500)
  })

  it('estimates word timing within the line', () => {
    const w = estimateWords('beautiful day', 0, 10000)
    expect(w[0].startMs).toBe(0)
    expect(w[1].startMs).toBeGreaterThan(w[0].startMs)
    // Long gap: the sung window is capped well below the full 10s
    expect(w[1].endMs).toBeLessThan(4000)
  })

  it('weights Indic words by aksharas, not one syllable each', () => {
    const w = estimateWords('உன் காதலில் நான்', 0, 3000)
    const dur = w.map((x) => x.endMs - x.startMs)
    expect(dur[1]).toBeGreaterThan(dur[0] * 1.5)
  })

  it('learns the song’s singing rate and marks estimated lines', () => {
    const fast = parseLrc(['[00:01.00]one two three four five six', '[00:03.00]one two three four five six', '[00:05.00]one two three four five six', '[00:07.00]one two three four five six', '[00:09.00]one two three four five six', '[00:30.00]one two three four five six'].join('\n'))
    expect(fast[0].wordsEstimated).toBe(true)
    // The long last line is sung at the same quick pace, not stretched over 20+ seconds
    const last = fast[5]
    expect(last.words[last.words.length - 1].endMs - last.startMs).toBeLessThan(5000)
  })

  it('spreads plain lyrics across the song', () => {
    const lines = spreadPlainLyrics('a\nb\n\nc', 100000)
    expect(lines).toHaveLength(3)
    expect(lines[2].stanzaBreak).toBe(true)
    expect(lines[0].startMs).toBeLessThan(lines[1].startMs)
  })
})
