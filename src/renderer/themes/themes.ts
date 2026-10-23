import type { MoodId } from '@shared/types'
import type { InPreset, OutPreset } from '../transitions/presets'

export interface Palette {
  bg0: string
  bg1: string
  accent: string
  accent2: string
  text: string
  glow: string
}

/** Every number here is blendable between moods; the shader reads them directly. */
export interface SceneParams {
  /** Domain-warp strength of the fluid background */
  warp: number
  /** Flow speed */
  speed: number
  noiseScale: number
  /** How much accent color bleeds into the fluid */
  accentMix: number
  rays: number
  rings: number
  rain: number
  stars: number
  embers: number
  grain: number
  vignette: number
  /** Particle look: 0 soft bokeh .. 1 sharp sparks */
  sharp: number
  /** Particle vertical drift (-1 falls, +1 rises) */
  drift: number
  /** Rain-like vertical stretching of particles */
  streak: number
  particleSize: number
  particleDensity: number
  particleSpeed: number
  /** How violently the scene reacts to beats */
  beatPunch: number
  shake: number
  glitch: number
  aberration: number
  bloom: number
  /** Slow sinusoidal breathing of scale/glow */
  breathe: number
  /** Hue wobble with spectral brightness (radians) */
  hueDrift: number
}

export interface Typography {
  family: string
  weight: number
  style: 'normal' | 'italic'
  transform: 'none' | 'uppercase' | 'lowercase'
  /** em */
  tracking: number
  /** Relative size multiplier */
  scale: number
  lineHeight: number
}

export interface Theme {
  id: MoodId
  label: string
  palette: Palette
  type: Typography
  scene: SceneParams
  ease: { in: string; out: string; pop: string }
  transitions: { calm: InPreset[]; intense: InPreset[]; chorus: InPreset[]; out: OutPreset[]; outIntense: OutPreset[] }
}

const base: SceneParams = {
  warp: 0.5,
  speed: 0.3,
  noiseScale: 1.6,
  accentMix: 0.5,
  rays: 0,
  rings: 0.3,
  rain: 0,
  stars: 0,
  embers: 0,
  grain: 0.06,
  vignette: 0.6,
  sharp: 0.2,
  drift: 0.2,
  streak: 0,
  particleSize: 1,
  particleDensity: 0.5,
  particleSpeed: 0.5,
  beatPunch: 0.5,
  shake: 0,
  glitch: 0,
  aberration: 0.2,
  bloom: 0.8,
  breathe: 0.3,
  hueDrift: 0.15
}

export const THEMES: Record<MoodId, Theme> = {
  romance: {
    id: 'romance',
    label: 'Romance',
    palette: { bg0: '#12030f', bg1: '#5a0f38', accent: '#ff5c8a', accent2: '#ffb38a', text: '#fff1f4', glow: '#ff7aa2' },
    type: { family: 'Playfair Display', weight: 500, style: 'italic', transform: 'none', tracking: 0, scale: 1, lineHeight: 1.12 },
    scene: { ...base, warp: 0.55, speed: 0.18, accentMix: 0.55, rings: 0.35, stars: 0.15, sharp: 0.0, drift: 0.35, particleSize: 1.6, particleDensity: 0.55, particleSpeed: 0.25, beatPunch: 0.45, bloom: 1.1, breathe: 0.8, aberration: 0.1 },
    ease: { in: 'power2.out', out: 'power2.in', pop: 'sine.out' },
    transitions: { calm: ['blur-dissolve', 'rise-soft'], intense: ['wave', 'blur-dissolve'], chorus: ['bloom-open'], out: ['dissolve', 'fade-up'], outIntense: ['fade-up'] }
  },
  calm: {
    id: 'calm',
    label: 'Calm',
    palette: { bg0: '#03121a', bg1: '#0f4152', accent: '#7fe0d4', accent2: '#b8c9ff', text: '#eefcff', glow: '#8ff0e6' },
    type: { family: 'Cormorant Garamond', weight: 500, style: 'normal', transform: 'none', tracking: 0.02, scale: 1.05, lineHeight: 1.1 },
    scene: { ...base, warp: 0.35, speed: 0.1, accentMix: 0.35, rings: 0.15, stars: 0.35, sharp: 0.0, drift: 0.15, particleSize: 1.3, particleDensity: 0.35, particleSpeed: 0.15, beatPunch: 0.2, bloom: 0.8, breathe: 1, aberration: 0.05, grain: 0.04 },
    ease: { in: 'sine.out', out: 'sine.in', pop: 'sine.out' },
    transitions: { calm: ['blur-dissolve', 'rise-soft'], intense: ['rise-soft'], chorus: ['bloom-open'], out: ['dissolve', 'fade-up'], outIntense: ['dissolve'] }
  },
  nostalgic: {
    id: 'nostalgic',
    label: 'Nostalgic',
    palette: { bg0: '#140d06', bg1: '#4f3519', accent: '#f2b56b', accent2: '#c98f6b', text: '#fff4e3', glow: '#ffc983' },
    type: { family: 'DM Serif Display', weight: 400, style: 'normal', transform: 'none', tracking: 0.01, scale: 1, lineHeight: 1.1 },
    scene: { ...base, warp: 0.4, speed: 0.14, accentMix: 0.45, rays: 0.35, rings: 0.1, sharp: 0.1, drift: 0.1, particleSize: 0.8, particleDensity: 0.6, particleSpeed: 0.12, beatPunch: 0.3, bloom: 0.9, breathe: 0.6, grain: 0.16, vignette: 0.9, aberration: 0.15 },
    ease: { in: 'power2.out', out: 'power1.in', pop: 'power1.out' },
    transitions: { calm: ['typewriter', 'blur-dissolve'], intense: ['rise-soft', 'typewriter'], chorus: ['bloom-open'], out: ['dissolve', 'drift-down'], outIntense: ['fade-up'] }
  },
  playful: {
    id: 'playful',
    label: 'Playful',
    palette: { bg0: '#14052e', bg1: '#4a1f8f', accent: '#ffe14d', accent2: '#4dffd2', text: '#ffffff', glow: '#ff7ae0' },
    type: { family: 'Fredoka', weight: 600, style: 'normal', transform: 'none', tracking: 0, scale: 1.05, lineHeight: 1.05 },
    scene: { ...base, warp: 0.65, speed: 0.45, accentMix: 0.7, rings: 0.6, stars: 0.2, sharp: 0.35, drift: 0.5, particleSize: 1.2, particleDensity: 0.7, particleSpeed: 0.6, beatPunch: 0.8, bloom: 0.9, breathe: 0.3, hueDrift: 0.5, aberration: 0.25 },
    ease: { in: 'back.out(2.2)', out: 'back.in(1.6)', pop: 'elastic.out(1, 0.4)' },
    transitions: { calm: ['bounce', 'wave'], intense: ['bounce', 'scatter-in'], chorus: ['scatter-in'], out: ['pop-out', 'fade-up'], outIntense: ['pop-out', 'shatter'] }
  },
  triumphant: {
    id: 'triumphant',
    label: 'Triumphant',
    palette: { bg0: '#0a0a14', bg1: '#3a2a06', accent: '#ffd34d', accent2: '#ff8a3d', text: '#fffaf0', glow: '#ffcf5a' },
    type: { family: 'Cinzel', weight: 700, style: 'normal', transform: 'uppercase', tracking: 0.08, scale: 0.88, lineHeight: 1.15 },
    scene: { ...base, warp: 0.5, speed: 0.35, accentMix: 0.6, rays: 0.9, rings: 0.5, embers: 0.5, sharp: 0.6, drift: 0.7, particleSize: 0.9, particleDensity: 0.7, particleSpeed: 0.6, beatPunch: 0.75, shake: 0.15, bloom: 1.3, breathe: 0.2, aberration: 0.2 },
    ease: { in: 'expo.out', out: 'power3.in', pop: 'back.out(1.7)' },
    transitions: { calm: ['unfold', 'rise-soft'], intense: ['unfold', 'zoom-through'], chorus: ['slam'], out: ['fade-up', 'zoom-past'], outIntense: ['zoom-past'] }
  },
  hype: {
    id: 'hype',
    label: 'Hype',
    palette: { bg0: '#07001a', bg1: '#3a0ca3', accent: '#00f5ff', accent2: '#ff00e5', text: '#ffffff', glow: '#7b5cff' },
    type: { family: 'Anton', weight: 400, style: 'normal', transform: 'uppercase', tracking: 0.01, scale: 1.25, lineHeight: 0.98 },
    scene: { ...base, warp: 0.8, speed: 0.75, noiseScale: 2.2, accentMix: 0.8, rings: 1, stars: 0.3, sharp: 0.8, drift: 0.0, streak: 0.3, particleSize: 1, particleDensity: 0.9, particleSpeed: 1.2, beatPunch: 1.1, shake: 0.5, glitch: 0.25, aberration: 0.6, bloom: 1.2, breathe: 0, hueDrift: 0.6 },
    ease: { in: 'expo.out', out: 'expo.in', pop: 'back.out(3)' },
    transitions: { calm: ['slam', 'zoom-through'], intense: ['slam', 'scatter-in', 'zoom-through'], chorus: ['slam'], out: ['zoom-past', 'slam-out'], outIntense: ['shatter', 'zoom-past', 'slam-out'] }
  },
  heartbreak: {
    id: 'heartbreak',
    label: 'Heartbreak',
    palette: { bg0: '#02040d', bg1: '#172647', accent: '#6f8fd8', accent2: '#a7b4d6', text: '#dfe7ff', glow: '#5b7fe0' },
    type: { family: 'Instrument Serif', weight: 400, style: 'italic', transform: 'none', tracking: 0, scale: 1.1, lineHeight: 1.08 },
    scene: { ...base, warp: 0.45, speed: 0.12, accentMix: 0.35, rain: 0.8, rings: 0.1, sharp: 0.3, drift: -0.9, streak: 0.85, particleSize: 0.9, particleDensity: 0.7, particleSpeed: 0.6, beatPunch: 0.25, bloom: 0.8, breathe: 0.6, aberration: 0.12, grain: 0.1, vignette: 0.95, hueDrift: 0.05 },
    ease: { in: 'power1.out', out: 'power2.in', pop: 'sine.out' },
    transitions: { calm: ['blur-dissolve', 'rise-soft'], intense: ['blur-dissolve', 'wave'], chorus: ['bloom-open'], out: ['drift-down', 'dissolve'], outIntense: ['drift-down', 'shatter'] }
  },
  dark: {
    id: 'dark',
    label: 'Dark',
    palette: { bg0: '#000000', bg1: '#170a24', accent: '#8a2be2', accent2: '#3dffb0', text: '#e8e0ff', glow: '#7a2cff' },
    type: { family: 'Oswald', weight: 300, style: 'normal', transform: 'uppercase', tracking: 0.22, scale: 0.85, lineHeight: 1.15 },
    scene: { ...base, warp: 0.9, speed: 0.22, noiseScale: 1.2, accentMix: 0.4, rings: 0.3, sharp: 0.5, drift: 0.25, particleSize: 0.7, particleDensity: 0.45, particleSpeed: 0.3, beatPunch: 0.7, shake: 0.3, glitch: 0.45, aberration: 0.55, bloom: 0.9, breathe: 0.5, grain: 0.2, vignette: 1.2 },
    ease: { in: 'power4.out', out: 'power4.in', pop: 'rough({strength: 1, points: 12, taper: "out"})' },
    transitions: { calm: ['glitch-slice', 'blur-dissolve'], intense: ['glitch-slice', 'slam'], chorus: ['glitch-slice'], out: ['glitch-out', 'dissolve'], outIntense: ['glitch-out', 'shatter'] }
  },
  revenge: {
    id: 'revenge',
    label: 'Revenge',
    palette: { bg0: '#050000', bg1: '#3d0007', accent: '#ff1a2e', accent2: '#ff6a00', text: '#ffffff', glow: '#ff2233' },
    type: { family: 'Bebas Neue', weight: 400, style: 'normal', transform: 'uppercase', tracking: 0.03, scale: 1.3, lineHeight: 0.95 },
    scene: { ...base, warp: 1, speed: 0.6, noiseScale: 2.4, accentMix: 0.75, rings: 0.7, embers: 1, sharp: 0.9, drift: 0.8, particleSize: 0.9, particleDensity: 0.9, particleSpeed: 1, beatPunch: 1.2, shake: 0.9, glitch: 0.7, aberration: 0.9, bloom: 1.25, breathe: 0, grain: 0.14, vignette: 1.1, hueDrift: 0.08 },
    ease: { in: 'expo.out', out: 'expo.in', pop: 'power4.out' },
    transitions: { calm: ['glitch-slice', 'slam'], intense: ['slam', 'glitch-slice'], chorus: ['slam'], out: ['glitch-out', 'shatter'], outIntense: ['shatter', 'glitch-out'] }
  }
}
