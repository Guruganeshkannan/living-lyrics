import { describe, expect, it } from 'vitest'
import { estimateKey } from '../src/renderer/mood/keyDetector'
import { estimateTempo } from '../src/renderer/mood/tempoTracker'

// Synthetic chroma: strong triad, medium scale tones, faint everything else
function chromaFor(tones: number[], strong: number[]): number[] {
  const c = new Array(12).fill(0.05)
  tones.forEach((t) => (c[t] = 0.5))
  strong.forEach((t) => (c[t] = 1))
  return c
}

describe('key detection', () => {
  it('detects C major', () => {
    const k = estimateKey(chromaFor([2, 5, 9, 11], [0, 4, 7]))
    expect(k.name).toBe('C major')
    expect(k.modeScore).toBeGreaterThan(0)
  })

  it('detects A minor', () => {
    const k = estimateKey(chromaFor([2, 5, 7, 11], [9, 0, 4]))
    expect(k.name).toBe('A minor')
    expect(k.modeScore).toBeLessThan(0)
  })
})

describe('tempo', () => {
  it('estimates 120 bpm from steady beats', () => {
    const beats = Array.from({ length: 20 }, (_, i) => i * 500)
    expect(estimateTempo(beats).bpm).toBe(120)
  })

  it('folds slow half-time detections up', () => {
    const beats = Array.from({ length: 20 }, (_, i) => i * 1200) // 50 bpm
    expect(estimateTempo(beats).bpm).toBe(100)
  })

  it('needs enough beats', () => {
    expect(estimateTempo([0, 500]).bpm).toBe(0)
  })
})
