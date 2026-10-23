import Sentiment from 'sentiment'
import en from './data/lexicon/en.json'
import bn from './data/lexicon/bn.json'
import gu from './data/lexicon/gu.json'
import hi from './data/lexicon/hi.json'
import kn from './data/lexicon/kn.json'
import ml from './data/lexicon/ml.json'
import mr from './data/lexicon/mr.json'
import pa from './data/lexicon/pa.json'
import ta from './data/lexicon/ta.json'
import te from './data/lexicon/te.json'
import ur from './data/lexicon/ur.json'
import { MOOD_IDS, clamp, pointFromWeights } from '@shared/moods'
import { detectScript, scriptOf, type Script } from '@shared/script'
import type { Keyword, KeywordEffect, LineAnalysis, LyricAnalysis, LyricLine, MoodId, Section } from '@shared/types'
import { detectSections } from './sectionDetector'

type Weights = Partial<Record<MoodId, number>>
type Hit = { mood: MoodId; weight: number }

interface LangLexicon {
  lang: string
  name: string
  script: string
  markers: string[]
  moods: Record<string, string[]>
  effects: Record<string, string[]>
  negators: string[]
}

const INDIAN: LangLexicon[] = [ta, hi, ur, te, kn, ml, bn, mr, pa, gu] as LangLexicon[]
const SCRIPT_LANG: Partial<Record<Script, string>> = {
  tamil: 'ta',
  devanagari: 'hi',
  telugu: 'te',
  kannada: 'kn',
  malayalam: 'ml',
  bengali: 'bn',
  gurmukhi: 'pa',
  gujarati: 'gu',
  arabic: 'ur'
}

/* ---------- normalization ---------- */

const isLatinWord = (w: string) => scriptOf(w.codePointAt(0)!) === 'latin'

/** Native scripts: unify nukta / chandrabindu spellings so variants match. */
export function normalizeNative(w: string): string {
  return w
    .normalize('NFD')
    .replace(/[़়਼઼଼]/g, '')
    .replace(/ँ/g, 'ं')
    .normalize('NFC')
}

/** Romanized Indian words: fold common spelling variants (kaadhal/kadhal/kadal-ish). */
export function normalizeRoman(w: string): string {
  return w
    .toLowerCase()
    .replace(/zh/g, 'l')
    .replace(/([dtbkgp])h/g, '$1')
    .replace(/w/g, 'v')
    .replace(/q/g, 'k')
    .replace(/z/g, 'j')
    .replace(/(.)\1+/g, '$1')
}

export function tokenize(text: string): string[] {
  return text
    .normalize('NFC')
    .replace(/[’`]/g, "'")
    .split(/[^\p{L}\p{M}\p{N}']+/u)
    .map((t) => t.replace(/^'+|'+$/g, ''))
    .filter(Boolean)
    .map((t) => (isLatinWord(t) ? t.toLowerCase().replace(/in'$/, 'ing') : normalizeNative(t)))
}

/* ---------- indexes ---------- */

const VIRAMA_END = /[्্੍્୍்్್്]$/

function parseEntry(entry: string): [string, number] {
  const i = entry.lastIndexOf(':')
  return i > 0 && /^\d+$/.test(entry.slice(i + 1)) ? [entry.slice(0, i), Number(entry.slice(i + 1))] : [entry, 1]
}

function push<T>(map: Map<string, T[]>, key: string, v: T) {
  const list = map.get(key) ?? []
  list.push(v)
  map.set(key, list)
}

// English: exact words + suffix stripping (existing behaviour)
const EN_MOOD = new Map<string, Hit[]>()
for (const mood of MOOD_IDS) for (const e of (en.moods as Record<string, string[]>)[mood] ?? []) {
  const [w, wt] = parseEntry(e)
  push(EN_MOOD, w, { mood, weight: wt })
}
const EN_EFFECT = new Map<string, KeywordEffect[]>()
for (const [effect, words] of Object.entries(en.effects)) for (const w of words) push(EN_EFFECT, w, effect as KeywordEffect)

// Native scripts are unambiguous: one shared index, always active
const NATIVE_MOOD = new Map<string, Hit[]>()
const NATIVE_EFFECT = new Map<string, KeywordEffect[]>()
// Romanized words collide with English ("sang", "rang", "pal"): indexed per language, enabled per song
const ROMAN_MOOD = new Map<string, Map<string, Hit[]>>()
const ROMAN_EFFECT = new Map<string, Map<string, KeywordEffect[]>>()
const NEGATORS = new Set<string>(en.negators)
const ROMAN_NEGATORS = new Map<string, Set<string>>()
const MARKERS = new Map<string, Set<string>>()

function indexNative<T>(map: Map<string, T[]>, word: string, v: T) {
  const w = normalizeNative(word)
  push(map, w, v)
  // காதல் → காதல (so suffixed forms like காதலில் prefix-match)
  if (VIRAMA_END.test(w)) push(map, w.slice(0, -1), v)
}

for (const lex of INDIAN) {
  const rm = new Map<string, Hit[]>()
  const re = new Map<string, KeywordEffect[]>()
  for (const mood of MOOD_IDS) for (const e of lex.moods[mood] ?? []) {
    const [w, wt] = parseEntry(e)
    if (w.includes(' ')) continue
    if (isLatinWord(w)) push(rm, normalizeRoman(w), { mood, weight: wt })
    else indexNative(NATIVE_MOOD, w, { mood, weight: wt })
  }
  for (const [effect, words] of Object.entries(lex.effects)) for (const w of words) {
    if (isLatinWord(w)) push(re, normalizeRoman(w), effect as KeywordEffect)
    else indexNative(NATIVE_EFFECT, w, effect as KeywordEffect)
  }
  ROMAN_MOOD.set(lex.lang, rm)
  ROMAN_EFFECT.set(lex.lang, re)
  ROMAN_NEGATORS.set(lex.lang, new Set(lex.negators.filter(isLatinWord).map(normalizeRoman)))
  lex.negators.filter((n) => !isLatinWord(n)).forEach((n) => NEGATORS.add(normalizeNative(n)))
  MARKERS.set(lex.lang, new Set(lex.markers.map(normalizeRoman)))
}

const OPPOSITES = en.opposites as Record<MoodId, MoodId>
const EN_SUFFIXES = ["'s", 's', 'es', 'ed', 'd', 'ing', 'in', 'ly', 'er', 'y']

function lookupEnglish<T>(index: Map<string, T[]>, token: string): T[] | undefined {
  const hit = index.get(token)
  if (hit) return hit
  for (const s of EN_SUFFIXES) {
    if (token.length > s.length + 2 && token.endsWith(s)) {
      const stem = token.slice(0, -s.length)
      const found = index.get(stem) ?? index.get(stem + 'e')
      if (found) return found
    }
  }
  return undefined
}

/** Longest-prefix match: Indian languages add suffixes (காதலில், दिलों, premalo). */
function lookupPrefix<T>(index: Map<string, T[]>, token: string, minLen: number): T[] | undefined {
  const exact = index.get(token)
  if (exact) return exact
  const cps = Array.from(token)
  for (let n = cps.length - 1; n >= minLen; n--) {
    const hit = index.get(cps.slice(0, n).join(''))
    if (hit) return hit
  }
  return undefined
}

/* ---------- language detection ---------- */

export interface LangContext {
  /** Romanized Indian languages detected in this song */
  roman: string[]
  /** Every language seen (for display) */
  all: string[]
}

export function detectLanguages(texts: string[]): LangContext {
  const scripts = new Map<string, number>()
  const markerHits = new Map<string, Set<string>>()
  let latinTokens = 0
  const markerTotal = new Map<string, number>()
  for (const text of texts) {
    for (const tok of tokenize(text)) {
      if (!isLatinWord(tok)) {
        const lang = SCRIPT_LANG[detectScript(tok)]
        if (lang) scripts.set(lang, (scripts.get(lang) ?? 0) + 1)
        continue
      }
      latinTokens++
      const n = normalizeRoman(tok)
      MARKERS.forEach((set, lang) => {
        if (!set.has(n)) return
        markerTotal.set(lang, (markerTotal.get(lang) ?? 0) + 1)
        const hits = markerHits.get(lang) ?? new Set()
        hits.add(n)
        markerHits.set(lang, hits)
      })
    }
  }
  // A romanized language needs several distinct markers and a real share of the words
  const roman = [...markerTotal.entries()]
    .filter(([lang, count]) => (markerHits.get(lang)?.size ?? 0) >= 3 && count / Math.max(1, latinTokens) >= 0.06)
    .sort((a, b) => b[1] - a[1])
    .map(([lang]) => lang)
  const englishLike = latinTokens > 0 && roman.length === 0
  const all = [...new Set([...[...scripts.keys()], ...roman, ...(englishLike ? ['en'] : [])])]
  return { roman: roman.slice(0, 3), all }
}

/* ---------- analysis ---------- */

const sentiment = new Sentiment()

interface TokenHits {
  moods?: Hit[]
  effect?: KeywordEffect
  negator: boolean
}

function lookupToken(tok: string, ctx: LangContext): TokenHits {
  if (!isLatinWord(tok)) {
    return {
      moods: lookupPrefix(NATIVE_MOOD, tok, 4),
      effect: lookupPrefix(NATIVE_EFFECT, tok, 4)?.[0],
      negator: NEGATORS.has(tok)
    }
  }
  let moods = lookupEnglish(EN_MOOD, tok)
  let effect = lookupEnglish(EN_EFFECT, tok)?.[0]
  let negator = NEGATORS.has(tok)
  const n = normalizeRoman(tok)
  for (const lang of ctx.roman) {
    moods ??= lookupPrefix(ROMAN_MOOD.get(lang)!, n, 5)
    effect ??= lookupPrefix(ROMAN_EFFECT.get(lang)!, n, 5)?.[0]
    negator ||= ROMAN_NEGATORS.get(lang)!.has(n)
  }
  return { moods, effect, negator }
}

const EN_ONLY: LangContext = { roman: [], all: ['en'] }

export function analyzeLine(text: string, ctx: LangContext = EN_ONLY): LineAnalysis {
  const rawWords = text.split(/\s+/).filter(Boolean)
  const weights: Weights = {}
  const keywords: Keyword[] = []
  // Tokenize word by word so keyword positions map back to displayed words
  const tokens: { tok: string; wordIndex: number }[] = []
  rawWords.forEach((w, wi) => tokenize(w).forEach((tok) => tokens.push({ tok, wordIndex: wi })))
  const hits = tokens.map((t) => lookupToken(t.tok, ctx))

  tokens.forEach(({ wordIndex }, i) => {
    // Indian languages often negate after the word ("varamaatten", "pyaar nahi"), so look both ways
    const negated = hits.slice(Math.max(0, i - 3), i).some((h) => h.negator) || (ctx.roman.length > 0 || !isLatinWord(tokens[i].tok) ? hits[i + 1]?.negator === true : false)
    hits[i].moods?.forEach(({ mood, weight }) => {
      const target = negated ? OPPOSITES[mood] : mood
      // Negation only nudges toward the opposite: "don't believe me, just watch" isn't heartbreak
      weights[target] = (weights[target] ?? 0) + (negated ? weight * 0.3 : weight)
    })
    const effect = hits[i].effect
    if (effect && !negated && keywords.length < 2 && !keywords.some((k) => k.wordIndex === wordIndex)) {
      keywords.push({ wordIndex, word: rawWords[wordIndex], effect })
    }
  })

  const lex = pointFromWeights(weights)
  const englishLine = ctx.roman.length === 0 && detectScript(text) === 'latin'
  const sent = englishLine ? sentiment.analyze(text) : { score: 0, comparative: 0 }
  const sentV = clamp(sent.comparative / 2.5)

  const letters = text.replace(/[^a-zA-Z]/g, '')
  const capsRatio = letters.length > 3 ? letters.replace(/[^A-Z]/g, '').length / letters.length : 0
  const bangs = (text.match(/!/g) ?? []).length
  const toks = tokens.map((t) => t.tok)
  const repeats = toks.length - new Set(toks).size
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
  const ctx = detectLanguages(lines.map((l) => l.text))
  const lineAnalyses = lines.map((l) => analyzeLine(l.text, ctx))

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
    overall: { valence: overallV, arousal: overallA, dominant, strength: rawTotal, weights: total },
    languages: ctx.all
  }
}
