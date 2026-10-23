// Latin display fonts (one per mood)
import '@fontsource/playfair-display/500-italic.css'
import '@fontsource/cormorant-garamond/500.css'
import '@fontsource/dm-serif-display/400.css'
import '@fontsource/anton/400.css'
import '@fontsource/cinzel/700.css'
import '@fontsource/fredoka/600.css'
import '@fontsource/instrument-serif/400-italic.css'
import '@fontsource/bebas-neue/400.css'
import '@fontsource/oswald/300.css'
import '@fontsource/inter/400.css'
// Indian scripts: elegant (serif) / bold (sans heavy) / rounded (Baloo) per script
import '@fontsource/noto-serif-tamil/600.css'
import '@fontsource/noto-sans-tamil/800.css'
import '@fontsource/baloo-thambi-2/700.css'
import '@fontsource/noto-serif-devanagari/600.css'
import '@fontsource/noto-sans-devanagari/800.css'
import '@fontsource/baloo-2/700.css'
import '@fontsource/noto-serif-telugu/600.css'
import '@fontsource/noto-sans-telugu/800.css'
import '@fontsource/baloo-tammudu-2/700.css'
import '@fontsource/noto-serif-kannada/600.css'
import '@fontsource/noto-sans-kannada/800.css'
import '@fontsource/baloo-tamma-2/700.css'
import '@fontsource/noto-serif-malayalam/600.css'
import '@fontsource/noto-sans-malayalam/800.css'
import '@fontsource/baloo-chettan-2/700.css'
import '@fontsource/noto-serif-bengali/600.css'
import '@fontsource/noto-sans-bengali/800.css'
import '@fontsource/baloo-da-2/700.css'
import '@fontsource/noto-serif-gurmukhi/600.css'
import '@fontsource/noto-sans-gurmukhi/800.css'
import '@fontsource/baloo-paaji-2/700.css'
import '@fontsource/noto-serif-gujarati/600.css'
import '@fontsource/noto-sans-gujarati/800.css'
import '@fontsource/baloo-bhai-2/700.css'
import '@fontsource/noto-serif-oriya/600.css'
import '@fontsource/noto-sans-oriya/800.css'
import '@fontsource/baloo-bhaina-2/700.css'
import '@fontsource/noto-nastaliq-urdu/500.css'
import '@fontsource/baloo-bhaijaan-2/700.css'
import '@fontsource/baloo-bhaijaan-2/800.css'
// Character display faces
import '@fontsource/teko/600.css'
import '@fontsource/rozha-one/400.css'
import '@fontsource/arima/600.css'

import { isIndic, isRtl, type Script } from '@shared/script'
import type { Theme } from '../themes/themes'

export type Persona = 'elegant' | 'bold' | 'rounded'
interface Face {
  family: string
  weight: number
}

const f = (family: string, weight: number): Face => ({ family, weight })

const SCRIPT_FACES: Partial<Record<Script, Record<Persona, Face>>> = {
  tamil: { elegant: f('Noto Serif Tamil', 600), bold: f('Noto Sans Tamil', 800), rounded: f('Baloo Thambi 2', 700) },
  devanagari: { elegant: f('Noto Serif Devanagari', 600), bold: f('Noto Sans Devanagari', 800), rounded: f('Baloo 2', 700) },
  telugu: { elegant: f('Noto Serif Telugu', 600), bold: f('Noto Sans Telugu', 800), rounded: f('Baloo Tammudu 2', 700) },
  kannada: { elegant: f('Noto Serif Kannada', 600), bold: f('Noto Sans Kannada', 800), rounded: f('Baloo Tamma 2', 700) },
  malayalam: { elegant: f('Noto Serif Malayalam', 600), bold: f('Noto Sans Malayalam', 800), rounded: f('Baloo Chettan 2', 700) },
  bengali: { elegant: f('Noto Serif Bengali', 600), bold: f('Noto Sans Bengali', 800), rounded: f('Baloo Da 2', 700) },
  gurmukhi: { elegant: f('Noto Serif Gurmukhi', 600), bold: f('Noto Sans Gurmukhi', 800), rounded: f('Baloo Paaji 2', 700) },
  gujarati: { elegant: f('Noto Serif Gujarati', 600), bold: f('Noto Sans Gujarati', 800), rounded: f('Baloo Bhai 2', 700) },
  oriya: { elegant: f('Noto Serif Oriya', 600), bold: f('Noto Sans Oriya', 800), rounded: f('Baloo Bhaina 2', 700) },
  arabic: { elegant: f('Noto Nastaliq Urdu', 500), bold: f('Baloo Bhaijaan 2', 800), rounded: f('Baloo Bhaijaan 2', 700) }
}

/** Per-mood character faces that beat the generic persona for a script. */
const MOOD_OVERRIDES: Partial<Record<Theme['id'], Partial<Record<Script, Face>>>> = {
  romance: { devanagari: f('Rozha One', 400), tamil: f('Arima', 600), malayalam: f('Arima', 600) },
  hype: { devanagari: f('Teko', 600) },
  revenge: { devanagari: f('Teko', 600) },
  playful: { tamil: f('Arima', 600), malayalam: f('Arima', 600) }
}

export interface LineFont {
  family: string
  weight: number
  style: 'normal' | 'italic'
  transform: 'none' | 'uppercase' | 'lowercase'
  tracking: number
  lineHeight: number
  scale: number
  rtl: boolean
  script: Script
}

/** Font settings for a line: the theme's Latin face, with the right Indian/Urdu face behind it. */
export function lineFont(theme: Theme, script: Script): LineFont {
  const t = theme.type
  const face = MOOD_OVERRIDES[theme.id]?.[script] ?? SCRIPT_FACES[script]?.[theme.persona]
  if (!face || script === 'latin' || script === 'other') {
    return { family: `"${t.family}", "Noto Sans", sans-serif`, weight: t.weight, style: t.style, transform: t.transform, tracking: t.tracking, lineHeight: Math.max(1.05, t.lineHeight), scale: t.scale, rtl: false, script }
  }
  return {
    // Latin face first so romanized words in mixed lines keep the mood's look
    family: `"${t.family}", "${face.family}", "Noto Sans", sans-serif`,
    weight: face.weight,
    style: 'normal',
    transform: 'none',
    // Letter-spacing breaks Indic shaping and Urdu joining
    tracking: 0,
    lineHeight: script === 'arabic' && face.family.includes('Nastaliq') ? 2.1 : isIndic(script) ? 1.45 : 1.3,
    // Indic glyphs carry more detail; give them a touch less size than Latin display caps
    scale: Math.min(1.05, t.scale) * 0.92,
    rtl: isRtl(script),
    script
  }
}

let ready: Promise<void> | null = null

/** Load every face up front so the first line in a script is measured with the right font. */
export function preloadFonts(): Promise<void> {
  ready ??= (async () => {
    const samples: Partial<Record<Script, string>> = {
      tamil: 'காதல்',
      devanagari: 'प्यार',
      telugu: 'ప్రేమ',
      kannada: 'ಪ್ರೀತಿ',
      malayalam: 'പ്രണയം',
      bengali: 'প্রেম',
      gurmukhi: 'ਪਿਆਰ',
      gujarati: 'પ્રેમ',
      oriya: 'ପ୍ରେମ',
      arabic: 'محبت'
    }
    const loads: Promise<unknown>[] = []
    for (const [script, faces] of Object.entries(SCRIPT_FACES)) {
      for (const face of Object.values(faces!)) loads.push(document.fonts.load(`${face.weight} 32px "${face.family}"`, samples[script as Script]))
    }
    for (const over of Object.values(MOOD_OVERRIDES)) for (const [script, face] of Object.entries(over!)) loads.push(document.fonts.load(`${face!.weight} 32px "${face!.family}"`, samples[script as Script]))
    for (const fam of ['500 italic 32px "Playfair Display"', '500 32px "Cormorant Garamond"', '32px "DM Serif Display"', '32px Anton', '700 32px Cinzel', '600 32px Fredoka', 'italic 32px "Instrument Serif"', '32px "Bebas Neue"', '300 32px Oswald', '32px Inter'])
      loads.push(document.fonts.load(fam, 'Aa'))
    await Promise.allSettled(loads)
  })()
  return ready
}
