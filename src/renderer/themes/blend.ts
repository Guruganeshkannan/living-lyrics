import type { MoodId } from '@shared/types'
import { type RGB, hexToRgb, mixOklab } from './color'
import { THEMES, type Palette, type SceneParams, type Theme } from './themes'

export interface LivePalette {
  bg0: RGB
  bg1: RGB
  accent: RGB
  accent2: RGB
  text: RGB
  glow: RGB
}

/** The frame-by-frame look: numbers and colors interpolated across the active moods. */
export interface BlendedLook {
  /** Discrete choices (fonts, transitions) follow the strongest mood */
  dominant: Theme
  palette: LivePalette
  scene: SceneParams
}

const PALETTE_KEYS: (keyof Palette)[] = ['bg0', 'bg1', 'accent', 'accent2', 'text', 'glow']
const rgbCache = new Map<string, RGB>()
const rgb = (hex: string) => rgbCache.get(hex) ?? (rgbCache.set(hex, hexToRgb(hex)), rgbCache.get(hex)!)

export function blendThemes(blend: { id: MoodId; weight: number }[]): BlendedLook {
  const themes = blend.map((b) => THEMES[b.id])
  const weights = blend.map((b) => b.weight)
  const palette = {} as LivePalette
  for (const k of PALETTE_KEYS) palette[k] = mixOklab(themes.map((t) => rgb(t.palette[k])), weights)
  const scene = {} as SceneParams
  for (const k of Object.keys(themes[0].scene) as (keyof SceneParams)[]) {
    scene[k] = themes.reduce((acc, t, i) => acc + t.scene[k] * weights[i], 0)
  }
  return { dominant: themes[0], palette, scene }
}

/** Exponential approach of one look toward another; keeps section changes silky. */
export function approachLook(cur: BlendedLook, target: BlendedLook, k: number): BlendedLook {
  const palette = {} as LivePalette
  for (const key of PALETTE_KEYS) {
    const a = cur.palette[key]
    const b = target.palette[key]
    palette[key] = [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]
  }
  const scene = { ...cur.scene }
  for (const key of Object.keys(scene) as (keyof SceneParams)[]) scene[key] += (target.scene[key] - scene[key]) * k
  return { dominant: target.dominant, palette, scene }
}
