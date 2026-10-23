import { describe, expect, it } from 'vitest'
import { detectScript, segment, syllableCount } from '../src/shared/script'

describe('detectScript', () => {
  it.each([
    ['hello world', 'latin'],
    ['உன் காதலில்', 'tamil'],
    ['तुम ही हो', 'devanagari'],
    ['నువ్వే నా ప్రేమ', 'telugu'],
    ['ನನ್ನ ಪ್ರೀತಿ', 'kannada'],
    ['എന്റെ പ്രണയം', 'malayalam'],
    ['আমার ভালোবাসা', 'bengali'],
    ['ਮੇਰਾ ਦਿਲ', 'gurmukhi'],
    ['મારો પ્રેમ', 'gujarati'],
    ['محبت', 'arabic'],
    ['♪ ♪', 'other']
  ])('%s → %s', (text, script) => expect(detectScript(text)).toBe(script))

  it('picks the dominant script in mixed lines', () => {
    expect(detectScript('kadhal காதலில் நான்')).toBe('tamil')
  })
})

describe('segment', () => {
  it('keeps Devanagari conjuncts and vowel signs together', () => {
    const parts = segment('क्षमा')
    expect(parts.join('')).toBe('क्षमा')
    expect(parts[0]).toBe('क्ष')
    expect(segment('प्यार')).toEqual(['प्या', 'र'])
  })

  it('keeps Tamil vowel signs and the க்ஷ / ஸ்ரீ conjuncts intact', () => {
    expect(segment('காதல்')).toEqual(['கா', 'த', 'ல்'])
    expect(segment('ஸ்ரீ')).toEqual(['ஸ்ரீ'])
    expect(segment('க்ஷேத்ரம்')[0]).toBe('க்ஷே')
  })

  it('handles Telugu, Kannada and Malayalam conjuncts', () => {
    expect(segment('ప్రేమ')[0]).toBe('ప్రే')
    expect(segment('ಪ್ರೀತಿ')[0]).toBe('ಪ್ರೀ')
    expect(segment('പ്രണയം')[0]).toBe('പ്ര')
  })

  it('never splits cursive Urdu', () => {
    expect(segment('محبت')).toEqual(['محبت'])
  })

  it('splits Latin into graphemes', () => {
    expect(segment('love')).toEqual(['l', 'o', 'v', 'e'])
  })
})

describe('syllableCount', () => {
  it('counts Latin vowel groups', () => {
    expect(syllableCount('beautiful')).toBe(3)
  })
  it('counts aksharas, not dead consonants', () => {
    expect(syllableCount('காதல்')).toBe(2)
    expect(syllableCount('प्यार')).toBe(2)
    expect(syllableCount('ప్రేమ')).toBe(2)
  })
})
