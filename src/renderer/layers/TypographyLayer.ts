import { gsap } from 'gsap'
import * as THREE from 'three'
import { CSS3DObject, CSS3DRenderer } from 'three/examples/jsm/renderers/CSS3DRenderer.js'
import { detectScript, segment } from '@shared/script'
import type { KeywordEffect, LineAnalysis, LyricLine } from '@shared/types'
import type { AudioState } from '../audio/audioEngine'
import type { Pose } from '../camera/CameraDirector'
import { lineFont, type LineFont } from '../text/fonts'
import type { LivePalette } from '../themes/blend'
import { rgbCss } from '../themes/color'
import type { Theme } from '../themes/themes'
import { IN_PRESETS, OUT_PRESETS, type InPreset, type OutPreset, type TransitionCtx } from '../transitions/presets'
import { seeded } from '../transitions/TransitionEngine'
import type { TextParticles } from './TextParticles'

interface LiveLine {
  obj: CSS3DObject
  root: HTMLElement
  el: HTMLElement
  glow: HTMLElement
  shade: HTMLElement
  rgb: HTMLElement[]
  bar: HTMLElement
  words: HTMLElement[]
  chars: HTMLElement[]
  /** Per-char sung start (ms) and duration, for the karaoke sweep */
  charStart: number[]
  charDur: number[]
  charWord: number[]
  line: LyricLine | null
  keywords: Map<number, KeywordEffect>
  out: OutPreset
  exit: number
  /** Leave as particles (decided per line from the song) or with a DOM exit */
  particleExit: boolean
  wordDelays: number[]
  rtl: boolean
  latin: boolean
  theme: Theme
  activeWord: number
  lit: number
  karaoke: boolean
  entered: boolean
}

export interface ShowLineOptions {
  theme: Theme
  palette: LivePalette
  pose: Pose
  inPreset: InPreset
  outPreset: OutPreset
  exit: number
  particleExit: boolean
  intensity: number
  pace: number
  karaoke: boolean
  /** Fly the glyphs in as particles before the text appears */
  assemble: boolean
}

export interface HideOptions {
  intensity: number
  pace: number
  palette: LivePalette
  particles: boolean
}

export class TypographyLayer {
  readonly renderer = new CSS3DRenderer()
  readonly scene = new THREE.Scene()
  private current: LiveLine | null = null
  private measure: HTMLElement
  private rgbFlash = 0
  /** Camera/scene reactions to slams and keyword hits */
  onImpact: (strength: number) => void = () => {}
  onKeyword: (effect: KeywordEffect, obj: CSS3DObject, line: HTMLElement, word: HTMLElement) => void = () => {}

  constructor(
    host: HTMLElement,
    private particles: TextParticles
  ) {
    host.appendChild(this.renderer.domElement)
    this.renderer.domElement.classList.add('css3d')
    this.measure = document.createElement('div')
    this.measure.className = 'measure'
    document.body.appendChild(this.measure)
    this.resize()
  }

  resize(): void {
    this.renderer.setSize(window.innerWidth, window.innerHeight)
  }

  get showing(): 'line' | 'card' | null {
    return this.current ? (this.current.line ? 'line' : 'card') : null
  }

  get currentObject(): CSS3DObject | null {
    return this.current?.obj ?? null
  }

  /* ---------------- building ---------------- */

  private fontSizePx(text: string, font: LineFont): number {
    const h = window.innerHeight
    const w = window.innerWidth
    const len = Math.max(4, Array.from(text).length)
    const byLength = Math.min(1.35, Math.max(0.5, Math.sqrt(22 / len)))
    return Math.min(h * 0.13, w * 0.085) * font.scale * byLength
  }

  private build(text: string, theme: Theme, palette: LivePalette, keywords: Map<number, KeywordEffect>, extraClass = '') {
    const font = lineFont(theme, detectScript(text))
    const root = document.createElement('div')
    root.className = `line3d ${extraClass}`
    if (font.rtl) root.dir = 'rtl'
    const maxW = Math.round(window.innerWidth * 0.8)
    Object.assign(root.style, {
      fontFamily: font.family,
      fontWeight: String(font.weight),
      fontStyle: font.style,
      textTransform: font.transform,
      letterSpacing: `${font.tracking}em`,
      lineHeight: String(font.lineHeight),
      maxWidth: `${maxW}px`
    })
    root.style.setProperty('--lit', rgbCss(palette.text))
    root.style.setProperty('--hot', rgbCss([Math.min(1, palette.glow[0] * 0.5 + 0.6), Math.min(1, palette.glow[1] * 0.5 + 0.6), Math.min(1, palette.glow[2] * 0.5 + 0.6)]))
    root.style.setProperty('--dim', rgbCss(palette.text, 0.34))
    root.style.setProperty('--glowc', rgbCss(palette.glow))
    root.style.setProperty('--accent', rgbCss(palette.accent))
    root.style.setProperty('--accent2', rgbCss(palette.accent2))

    const wordsText = text.split(/\s+/).filter(Boolean)
    const layer = (cls: string) => {
      const d = document.createElement('div')
      d.className = `layer ${cls}`
      d.setAttribute('aria-hidden', 'true')
      wordsText.forEach((w) => {
        const s = document.createElement('span')
        s.className = 'word'
        s.textContent = w
        d.appendChild(s)
        d.appendChild(document.createTextNode(' '))
      })
      root.appendChild(d)
      return d
    }
    const shade = layer('shade')
    const glow = layer('glow')
    const rgb = [layer('rgb rgb-r'), layer('rgb rgb-c')]
    const bar = document.createElement('div')
    bar.className = 'layer bar'
    root.appendChild(bar)

    const el = document.createElement('div')
    el.className = 'layer line'
    const words: HTMLElement[] = []
    const chars: HTMLElement[] = []
    const charWord: number[] = []
    wordsText.forEach((wText, wi) => {
      const w = document.createElement('span')
      w.className = 'word'
      if (keywords.has(wi)) w.classList.add('keyword')
      for (const unit of segment(wText)) {
        const c = document.createElement('span')
        c.className = 'ch'
        c.textContent = unit
        w.appendChild(c)
        chars.push(c)
        charWord.push(wi)
      }
      el.appendChild(w)
      el.appendChild(document.createTextNode(' '))
      words.push(w)
    })
    root.appendChild(el)

    // Fit: never clip or overflow, whatever the language or line length
    this.measure.appendChild(root)
    let size = this.fontSizePx(text, font)
    const maxH = window.innerHeight * 0.55
    for (let pass = 0; pass < 4; pass++) {
      root.style.fontSize = `${size}px`
      const tooWide = el.scrollWidth / maxW
      const tooTall = root.offsetHeight / maxH
      const over = Math.max(tooWide, tooTall)
      if (over <= 1) break
      size *= 0.97 / over
    }
    root.style.setProperty('--fs', `${size}px`)
    const obj = new CSS3DObject(root)
    return { obj, root, el, glow, shade, rgb, bar, words, chars, charWord, rtl: font.rtl, latin: font.script === 'latin' }
  }

  private ctx(live: Pick<LiveLine, 'el' | 'words' | 'chars' | 'rgb' | 'bar' | 'rtl' | 'latin'> & { wordDelays?: number[] }, theme: Theme, intensity: number, pace: number, seed: number): TransitionCtx {
    return {
      line: live.el,
      words: live.words,
      chars: live.chars,
      rgb: live.rgb,
      bar: live.bar,
      wordDelays: live.wordDelays ?? [],
      rtl: live.rtl,
      latin: live.latin,
      intensity: Math.min(1.6, Math.max(0.3, intensity)),
      pace,
      ease: theme.ease,
      rand: seeded(seed),
      onImpact: (s) => this.onImpact(s)
    }
  }

  private place(obj: CSS3DObject, pose: Pose): void {
    obj.position.copy(pose.pos)
    obj.quaternion.copy(pose.quat)
    this.scene.add(obj)
    obj.updateMatrixWorld(true)
  }

  /** Decorations fade in once the entrance has done its thing. */
  private settle(live: LiveLine, delay: number): void {
    gsap.fromTo(live.shade, { opacity: 0 }, { opacity: 0.85, duration: 0.6, delay: Math.max(0, delay * 0.4) })
    gsap.fromTo(live.glow, { opacity: 0 }, { opacity: 0.5, duration: 0.8, delay, onComplete: () => (live.entered = true) })
  }

  /* ---------------- lines ---------------- */

  showLine(line: LyricLine, analysis: LineAnalysis | null, o: ShowLineOptions, hide: HideOptions): void {
    this.hide(hide)
    const keywords = new Map<number, KeywordEffect>((analysis?.keywords ?? []).map((k) => [k.wordIndex, k.effect]))
    const b = this.build(line.text, o.theme, o.palette, keywords)
    this.place(b.obj, o.pose)

    // Karaoke timing per akshara: spread each word's sung span over its units
    const charStart: number[] = []
    const charDur: number[] = []
    line.words.forEach((w, wi) => {
      const units = b.charWord.filter((x) => x === wi).length
      const step = Math.max(1, w.endMs - w.startMs) / Math.max(1, units)
      for (let k = 0; k < units; k++) {
        charStart.push(w.startMs + step * k)
        charDur.push(step)
      }
    })
    const wordDelays = line.words.map((w) => (w.startMs - line.startMs) / 1000)
    const live: LiveLine = { ...b, charStart, charDur, line, keywords, out: o.outPreset, exit: o.exit, particleExit: o.particleExit, wordDelays, theme: o.theme, activeWord: -1, lit: 0, karaoke: o.karaoke && charStart.length === b.chars.length, entered: false }
    if (!live.karaoke) b.chars.forEach((c) => c.classList.add('lit', 'instant'))
    else b.words.forEach((w) => w.classList.add('upcoming'))

    const seed = line.index + 7
    if (o.assemble && this.particles.spawn(b.obj, b.el, 8, o.palette, 0.75)) {
      // Glyph particles fly in and land; the real text appears as they arrive
      gsap.fromTo(b.el, { opacity: 0 }, { opacity: 1, duration: 0.25, delay: 0.55 })
      this.settle(live, 0.7)
    } else {
      const tl = IN_PRESETS[o.inPreset](this.ctx(live, o.theme, o.intensity, o.pace, seed))
      this.settle(live, Math.min(1.2, tl.duration() * 0.8))
    }
    this.current = live
  }

  /** Title card for intros, instrumentals and songs without lyrics. */
  showCard(title: string, subtitle: string, theme: Theme, palette: LivePalette, pose: Pose, hide: HideOptions, assemble: boolean): void {
    this.hide(hide)
    const b = this.build(title, theme, palette, new Map(), 'card')
    b.root.style.fontSize = `${parseFloat(b.root.style.fontSize) * 0.85}px`
    const sub = document.createElement('div')
    sub.className = 'card-sub'
    sub.textContent = subtitle
    b.root.appendChild(sub)
    this.place(b.obj, pose)
    b.chars.forEach((c) => c.classList.add('lit', 'instant'))
    const live: LiveLine = { ...b, charStart: [], charDur: [], charWord: b.charWord, line: null, keywords: new Map(), out: 'lift-out', exit: 5, particleExit: true, wordDelays: [], theme, activeWord: -1, lit: 0, karaoke: false, entered: false }
    if (assemble && this.particles.spawn(b.obj, b.el, 8, palette, 1.1)) gsap.fromTo(b.el, { opacity: 0 }, { opacity: 1, duration: 0.4, delay: 0.85 })
    else IN_PRESETS['split-reveal'](this.ctx(live, theme, 0.8, 1.4, title.length))
    gsap.from(sub, { opacity: 0, y: 20, duration: 1.4, delay: 0.8, ease: 'power2.out' })
    this.settle(live, 1)
    this.current = live
  }

  hide(o: HideOptions): void {
    const old = this.current
    if (!old) return
    this.current = null
    gsap.killTweensOf([old.root, old.el, old.glow, old.shade, old.bar, ...old.rgb, ...old.words, ...old.chars])
    old.root.classList.add('leaving')
    const remove = () => {
      this.scene.remove(old.obj)
      old.root.remove()
    }
    // The beast exit: glyphs become particles that fly off in the mood's style
    if (o.particles && old.particleExit && this.particles.spawn(old.obj, old.el, old.exit, o.palette, 2.4)) {
      gsap.to(old.root, { opacity: 0, duration: 0.12, ease: 'power1.in', onComplete: remove })
      return
    }
    gsap.to([old.glow, old.shade, ...old.rgb], { opacity: 0, duration: 0.2 })
    const tl = OUT_PRESETS[old.out](this.ctx(old, old.theme, o.intensity, o.pace, (old.line?.index ?? 0) + 99))
    // Whatever the exit, the old line never lingers over the new one
    gsap.to(old.root, { opacity: 0, duration: 0.25, delay: Math.min(0.35, tl.duration() * 0.6), ease: 'power1.in' })
    tl.eventCallback('onComplete', remove)
    setTimeout(() => old.root.isConnected && remove(), 3000)
  }

  clear(): void {
    for (const obj of [...this.scene.children]) {
      const el = (obj as CSS3DObject).element
      if (el) {
        gsap.killTweensOf(el)
        el.remove()
      }
      this.scene.remove(obj)
    }
    this.current = null
  }

  /* ---------------- per frame ---------------- */

  /** Karaoke sweep, active-word lift and keyword effects. */
  updateKaraoke(tMs: number): void {
    const cur = this.current
    if (!cur?.line || !cur.karaoke) return
    // Light every akshara whose moment has come; its sweep lasts as long as it's sung
    while (cur.lit < cur.chars.length && cur.charStart[cur.lit] <= tMs) {
      const c = cur.chars[cur.lit]
      // If we're late (seek, slow frame), finish quickly instead of lagging behind
      const late = tMs - cur.charStart[cur.lit]
      const dur = Math.max(40, Math.min(650, cur.charDur[cur.lit] - late))
      c.style.transitionDuration = `${dur}ms`
      c.classList.add('lit')
      cur.lit++
    }
    const words = cur.line.words
    let idx = -1
    for (let i = 0; i < words.length; i++) if (words[i].startMs <= tMs) idx = i
    if (idx === cur.activeWord) return
    const prev = cur.words[cur.activeWord]
    if (prev) {
      prev.classList.remove('active')
      prev.classList.add('sung')
      gsap.to(prev, { z: 0, scale: 1, duration: 0.35, ease: 'power2.out', overwrite: 'auto' })
    }
    // Words skipped over (seek / very fast lines) just become sung
    for (let i = Math.max(0, cur.activeWord + 1); i < idx; i++) cur.words[i]?.classList.replace('upcoming', 'sung')
    const w = cur.words[idx]
    if (w) {
      w.classList.remove('upcoming')
      w.classList.add('active')
      // The word being sung comes toward the camera
      gsap.fromTo(w, { z: 0, scale: 1 }, { z: 36, scale: 1.05, duration: 0.28, ease: cur.theme.ease.pop, overwrite: 'auto' })
      cur.words[idx + 1]?.classList.add('next')
      const effect = cur.keywords.get(idx)
      if (effect) this.keywordEffect(cur, w, effect)
    }
    cur.activeWord = idx
  }

  /** Compositor-only pulses: opacity/transform of pre-rendered glow and split layers. */
  pulse(a: AudioState, beatPunch: number, chorus: number, strongBeat: boolean, edge: number, dt: number): void {
    const cur = this.current
    if (!cur) return
    // RGB split is an aggressive look: only moods with real glitch/aberration character get it
    if (strongBeat && chorus > 0.5 && edge > 0.45) this.rgbFlash = Math.min(1, edge)
    this.rgbFlash *= Math.exp(-dt * 9)
    if (cur.entered) {
      cur.glow.style.opacity = (0.4 + a.beat * 0.45 * beatPunch + a.energy * 0.15).toFixed(3)
      cur.glow.style.transform = `scale(${(1 + a.beat * 0.05 * beatPunch).toFixed(4)})`
      const split = this.rgbFlash * 0.75
      cur.rgb[0].style.opacity = split.toFixed(3)
      cur.rgb[1].style.opacity = split.toFixed(3)
      cur.rgb[0].style.transform = `translate3d(${(this.rgbFlash * 7).toFixed(2)}px,0,0)`
      cur.rgb[1].style.transform = `translate3d(${(-this.rgbFlash * 7).toFixed(2)}px,0,0)`
    }
  }

  render(camera: THREE.PerspectiveCamera): void {
    this.renderer.render(this.scene, camera)
  }

  private keywordEffect(cur: LiveLine, word: HTMLElement, effect: KeywordEffect): void {
    const chars = Array.from(word.querySelectorAll<HTMLElement>('.ch'))
    const rand = seeded(word.textContent?.length ?? 1)
    this.onImpact(effect === 'shatter' || effect === 'shake' ? 0.7 : 0.35)
    this.onKeyword(effect, cur.obj, cur.el, word)
    word.classList.add(`fx-${effect}`)
    switch (effect) {
      case 'burn':
        gsap.to(chars, { y: () => -4 - rand() * 8, duration: 0.12, repeat: 9, yoyo: true, ease: 'rough({strength: 2, points: 8})', stagger: 0.02 })
        break
      case 'heartbeat':
        gsap.timeline({ repeat: 2 }).to(chars, { scale: 1.3, duration: 0.12, ease: 'power2.out' }).to(chars, { scale: 1, duration: 0.18 }).to(chars, { scale: 1.15, duration: 0.1 }).to(chars, { scale: 1, duration: 0.35, ease: 'power2.out' })
        break
      case 'drip':
        gsap.to(chars, { y: () => 8 + rand() * 22, scaleY: 1.25, transformOrigin: '50% 0%', duration: 1.6, ease: 'power2.in', stagger: { each: 0.08, from: 'random' } })
        break
      case 'shatter':
        gsap.fromTo(
          chars,
          { x: () => (rand() - 0.5) * 140, y: () => (rand() - 0.5) * 120, rotate: () => (rand() - 0.5) * 120, z: () => rand() * 200 },
          { x: 0, y: 0, rotate: 0, z: 0, duration: 0.9, ease: 'elastic.out(1, 0.45)', stagger: 0.015 }
        )
        break
      case 'glow':
        gsap.fromTo(chars, { x: (i) => (i - (chars.length - 1) / 2) * 14 }, { x: 0, duration: 1.2, ease: 'expo.out' })
        break
      case 'shake':
        gsap.fromTo(chars, { x: -10 }, { x: 0, duration: 0.6, ease: 'rough({strength: 3, points: 20, taper: "out"})' })
        break
      case 'float':
        gsap.to(chars, { y: (i) => -10 - Math.sin(i) * 8, duration: 1.4, ease: 'sine.inOut', yoyo: true, repeat: 3, stagger: 0.06 })
        break
    }
  }
}
