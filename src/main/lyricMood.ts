import Sentiment from 'sentiment'
import lexicon from './data/emotionLexicon.json'
import { MOOD_IDS, clamp, pointFromWeights } from '@shared/moods'
import type { Keyword, KeywordEffect, LineAnalysis, LyricAnalysis, LyricLine, MoodId, Section } from '@shared/types'
import { detectSections } from './sectionDetector'

type Weights = Partial<Record<MoodId, number>>

// word -> [{ mood, weight }]
const MOOD_INDEX = new Map<string, { mood: MoodId; weight: number }[]>()
for (const mood of MOOD_IDS) {
  for (const entry of (lexicon.moods as Record<string, string[]>)[mood] ?? []) {
    const [word, w] = entry.split(':')
    const list = MOOD_INDEX.get(word) ?? []
    list.push({ mood, weight: w ? Number(w) : 1 })
    MOOD_INDEX.set(word, list)
  }
}
const EFFECT_INDEX = new Map<string, KeywordEffect>()
for (const [effect, words] of Object.entries(lexicon.effects)) {
  for (const w of words) if (!EFFECT_INDEX.has(w)) EFFECT_INDEX.set(w, effect as KeywordEffect)
}
const NEGATORS = new Set(lexicon.negators)
const OPPOSITES = lexicon.opposites as Record<MoodId, MoodId>
const sentiment = new Sentiment()

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[’`]/g, "'")
    .split(/[^a-z0-9']+/)
    .map((t) => t.replace(/^'+|'+$/g, '').replace(/in'$/, 'ing'))
    .filter(Boolean)
}

const SUFFIXES = ["'s", 's', 'es', 'ed', 'd', 'ing', 'in', 'ly', 'er', 'y']

/** Look a token up directly, then with common suffixes stripped. */
function lookup<T>(index: Map<string, T>, token: string): T | undefined {
  const hit = index.get(token)
  if (hit) return hit
  for (const s of SUFFIXES) {
    if (token.length > s.length + 2 && token.endsWith(s)) {
      const stem = token.slice(0, -s.length)
      const found = index.get(stem) ?? index.get(stem + 'e')
      if (found) return found
    }
  }
  return undefined
}

export function analyzeLine(text: string): LineAnalysis {
  const tokens = tokenize(text)
  const weights: Weights = {}
  const keywords: Keyword[] = []
  const rawWords = text.split(/\s+/).filter(Boolean)

  tokens.forEach((tok, i) => {
    const negated = tokens.slice(Math.max(0, i - 3), i).some((t) => NEGATORS.has(t))
    const hits = lookup(MOOD_INDEX, tok)
    hits?.forEach(({ mood, weight }) => {
      const target = negated ? OPPOSITES[mood] : mood
      // Negation only nudges toward the opposite: "don't believe me, just watch" isn't heartbreak
      weights[target] = (weights[target] ?? 0) + (negated ? weight * 0.3 : weight)
    })
    const effect = lookup(EFFECT_INDEX, tok)
    if (effect && !negated && keywords.length < 2) {
      // Map the token back to its position in the displayed (space-split) words
      const wordIndex = rawWords.findIndex((w, j) => tokenize(w).includes(tok) && !keywords.some((k) => k.wordIndex === j))
      if (wordIndex >= 0) keywords.push({ wordIndex, word: rawWords[wordIndex], effect })
    }
  })

  const lex = pointFromWeights(weights)
  const sent = sentiment.analyze(text)
  const sentV = clamp(sent.comparative / 2.5)

  // Delivery cues: shouting, exclamations and stuttered repetition read as intensity
  const letters = text.replace(/[^a-zA-Z]/g, '')
  const capsRatio = letters.length > 3 ? letters.replace(/[^A-Z]/g, '').length / letters.length : 0
  const bangs = (text.match(/!/g) ?? []).length
  const repeats = tokens.length - new Set(tokens).size
  const arousalCue = Math.min(0.5, (capsRatio > 0.6 ? 0.3 : 0) + bangs * 0.1 + repeats * 0.04)

  const strength = lex.total + Math.abs(sent.score) * 0.25
  const valence = lex.total > 0 ? 0.7 * lex.valence + 0.3 * sentV : sentV * 0.6
  const arousal = clamp((lex.total > 0 ? lex.arousal : 0) + arousalCue)
  return { valence, arousal, strength, weights, keywords }
}

function aggregate(items: { v: number; a: number; s: number }[]) {
  let v = 0
  let a = 0
  let s = 0
  for (const it of items) {
    v += it.v * it.s
    a += it.a * it.s
    s += it.s
  }
  return s > 0 ? { valence: v / s, arousal: a / s, strength: s } : { valence: 0, arousal: 0, strength: 0 }
}

export function analyzeLyrics(lines: LyricLine[], durationMs: number): LyricAnalysis {
  const lineAnalyses = lines.map((l) => analyzeLine(l.text))

  const total: Weights = {}
  for (const la of lineAnalyses) for (const [m, w] of Object.entries(la.weights)) total[m as MoodId] = (total[m as MoodId] ?? 0) + w
  const lex = pointFromWeights(total, 2.5)
  const rawTotal = Object.values(total).reduce((a, b) => a + b, 0)
  const meanSent = aggregate(lineAnalyses.map((l) => ({ v: l.valence, a: l.arousal, s: Math.max(0.2, l.strength) })))
  const overallV = lex.total > 0 ? 0.75 * lex.valence + 0.25 * meanSent.valence : meanSent.valence
  const overallA = lex.total > 0 ? 0.8 * lex.arousal + 0.2 * meanSent.arousal : meanSent.arousal
  const dominant = (Object.entries(total).sort((a, b) => b[1] - a[1])[0]?.[0] as MoodId) ?? 'nostalgic'

  const sections: Section[] = detectSections(lines, durationMs).map((raw) => {
    const slice = lineAnalyses.slice(raw.lineStart, raw.lineEnd)
    const agg = aggregate(slice.map((l) => ({ v: l.valence, a: l.arousal, s: l.strength })))
    // Weak sections lean on the song's overall mood
    const k = Math.min(1, agg.strength / 4)
    return { ...raw, valence: overallV + (agg.valence - overallV) * k, arousal: overallA + (agg.arousal - overallA) * k }
  })

  return {
    lines: lineAnalyses,
    sections,
    overall: { valence: overallV, arousal: overallA, dominant, strength: rawTotal, weights: total }
  }
}
