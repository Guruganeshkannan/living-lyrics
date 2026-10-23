import { describe, expect, it } from 'vitest'
import { parseLrc } from '../src/main/lrcParser'
import { detectSections, repeatCounts } from '../src/main/sectionDetector'

const SONG = [
  '[00:10.00]Woke up early in the city',
  '[00:14.00]Streets were quiet and the sky was gray',
  '[00:18.00]',
  '[00:20.00]We are the fire in the night',
  '[00:24.00]We are burning so bright',
  '[00:28.00]Woke up thinking of a different day',
  '[00:32.00]Nothing left for me to say',
  '[00:36.00]',
  '[00:38.00]We are the fire in the night',
  '[00:42.00]We are burning so bright',
  '[01:00.00]Slowly everything is changing now',
  '[01:04.00]I can see the other side somehow',
  '[01:08.00]We are the fire in the night!',
  '[01:12.00]We are burning so bright'
].join('\n')

describe('section detection', () => {
  const lines = parseLrc(SONG, 90000)

  it('counts fuzzy repeats', () => {
    const counts = repeatCounts(lines)
    expect(counts[2]).toBe(3) // includes the variant with "!"
    expect(counts[0]).toBe(1)
  })

  it('labels intro, verse, chorus, instrumental, bridge and outro', () => {
    const types = detectSections(lines, 90000).map((s) => s.type)
    expect(types[0]).toBe('intro')
    expect(types).toContain('verse')
    expect(types.filter((t) => t === 'chorus').length).toBe(3)
    expect(types).toContain('instrumental')
    expect(types).toContain('bridge')
    expect(types[types.length - 1]).toBe('outro')
  })

  it('handles songs without lyrics', () => {
    expect(detectSections([], 1000)[0].type).toBe('instrumental')
  })
})
