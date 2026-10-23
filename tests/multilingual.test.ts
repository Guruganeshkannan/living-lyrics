import { describe, expect, it } from 'vitest'
import { analyzeLine, analyzeLyrics, detectLanguages, normalizeRoman } from '../src/main/lyricMood'
import { parseLrc } from '../src/main/lrcParser'
import { nearestMoods } from '../src/shared/moods'
import type { LangContext } from '../src/main/lyricMood'

const ctx = (...roman: string[]): LangContext => ({ roman, all: roman })
const top = (text: string, c?: LangContext) => nearestMoods(analyzeLine(text, c), 1)[0].id

describe('native-script moods', () => {
  it.each([
    ['உன் காதலில் நான் உருகினேன் கண்ணே', 'romance'],
    ['கண்ணீர் மட்டும் மிச்சம், பிரிவு தந்த வலி', 'heartbreak'],
    ['பழி தீர்க்க ரத்தம் சிந்தும் கோபம்', 'revenge'],
    ['तेरे प्यार में दिल दीवाना', 'romance'],
    ['दिल टूटा, आँसू और तन्हाई', 'heartbreak'],
    ['बदला लूँगा, खून और नफ़रत', 'revenge'],
    ['నువ్వే నా ప్రేమ చెలి', 'romance'],
    ['కన్నీరు బాధ ఒంటరి', 'heartbreak'],
    ['ನನ್ನ ಪ್ರೀತಿ ನೀನೇ ಚೆಲುವೆ', 'romance'],
    ['ಕಣ್ಣೀರು ನೋವು ವಿರಹ', 'heartbreak'],
    ['എന്റെ പ്രണയം നീയാണ് പൊന്നേ', 'romance'],
    ['കണ്ണുനീർ വേദന വിരഹം', 'heartbreak'],
    ['درد آنسو تنہائی', 'heartbreak']
  ])('%s → %s', (line, mood) => expect(top(line)).toBe(mood))

  it('matches Indic suffixed forms via prefix (காதலில் → காதல்)', () => {
    expect(analyzeLine('காதலில்').weights.romance).toBeGreaterThan(0)
    expect(analyzeLine('ప్రేమలో').weights.romance).toBeGreaterThan(0)
  })

  it('treats nukta spellings as the same word', () => {
    expect(analyzeLine('इश्क').weights.romance).toBe(analyzeLine('इश्क़').weights.romance)
  })
})

describe('romanized moods', () => {
  it('folds spelling variants', () => {
    expect(normalizeRoman('kaadhal')).toBe(normalizeRoman('kadhal'))
    expect(normalizeRoman('azhagu')).toBe(normalizeRoman('alagu'))
  })

  it.each([
    ['un kadhalil naan urugi ponen kanne', 'ta', 'romance'],
    ['kanneer mattum thanimai vali', 'ta', 'heartbreak'],
    ['ithu kuthu aattam verithanam', 'ta', 'hype'],
    ['tere pyaar mein dil deewana', 'hi', 'romance'],
    ['dil toot gaya, aansu aur tanhai', 'hi', 'heartbreak'],
    ['badla lunga, khoon aur nafrat', 'hi', 'revenge'],
    ['nuvve naa prema cheli', 'te', 'romance'],
    ['ente pranayam neeyanu ponne', 'ml', 'romance']
  ])('%s (%s) → %s', (line, lang, mood) => expect(top(line, ctx(lang))).toBe(mood))

  it('does not apply romanized lists to English songs', () => {
    // "sang" / "male" / "thee" are Hindi/Kannada/Tamil words too, but not here
    const a = analyzeLine('she sang to thee, the male voice', ctx())
    expect(Object.keys(a.weights)).toHaveLength(0)
  })

  it('handles negation after the word in Indian languages', () => {
    const plain = analyzeLine('pyaar', ctx('hi'))
    const neg = analyzeLine('pyaar nahi', ctx('hi'))
    expect(neg.valence).toBeLessThan(plain.valence)
  })

  it('finds multilingual keyword effects', () => {
    expect(analyzeLine('நெருப்பு போல').keywords[0]?.effect).toBe('burn')
    expect(analyzeLine('dil ki dhadkan', ctx('hi')).keywords[0]?.effect).toBe('heartbeat')
    expect(analyzeLine('kanneer thuli', ctx('ta')).keywords[0]?.effect).toBe('drip')
  })
})

describe('language detection', () => {
  it('detects Tanglish', () => {
    expect(detectLanguages(['naan unna paathen', 'nee illa naan illa', 'enna da idhu']).roman).toContain('ta')
  })
  it('detects Hinglish', () => {
    expect(detectLanguages(['tum hi ho', 'ab tum hi ho', 'meri aashiqui ab tum hi ho']).roman).toContain('hi')
  })
  it('leaves English alone', () => {
    const d = detectLanguages(['I will always love you', 'and I hope life treats you kind'])
    expect(d.roman).toEqual([])
    expect(d.all).toContain('en')
  })
  it('reports native scripts', () => {
    expect(detectLanguages(['உன் காதலில்']).all).toContain('ta')
  })
})

describe('whole Tamil song', () => {
  it('detects the chorus in native script and gets a mood', () => {
    const lrc = [
      '[00:05.00]மழை வரும் நேரம்',
      '[00:10.00]உன் காதல் என் உயிரே',
      '[00:15.00]கண்ணே கண்மணி',
      '[00:20.00]நினைவுகள் நெஞ்சில்',
      '[00:25.00]உன் காதல் என் உயிரே',
      '[00:30.00]கண்ணே கண்மணி'
    ].join('\n')
    const res = analyzeLyrics(parseLrc(lrc, 40000), 40000)
    expect(res.sections.some((s) => s.type === 'chorus')).toBe(true)
    expect(nearestMoods(res.overall, 1)[0].id).toBe('romance')
    expect(res.languages).toContain('ta')
  })
})
