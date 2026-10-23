import { gsap } from 'gsap'
import type { KeywordEffect, LineAnalysis, LyricLine } from '@shared/types'
import type { AudioState } from '../audio/audioEngine'
import type { BlendedLook } from '../themes/blend'
import { rgbCss } from '../themes/color'
import type { Theme } from '../themes/themes'
import { IN_PRESETS, OUT_PRESETS, type InPreset, type OutPreset, type TransitionCtx } from '../transitions/presets'
import { seeded } from '../transitions/TransitionEngine'
import type { Fx } from './BackgroundLayer'

interface LiveLine {
  el: HTMLElement
  words: HTMLElement[]
  chars: HTMLElement[]
  line: LyricLine | null
  keywords: Map<number, KeywordEffect>
  out: OutPreset
  theme: Theme
  activeWord: number
  karaoke: boolean
}

export interface ShowLineOptions {
  theme: Theme
  inPreset: InPreset
  outPreset: OutPreset
  intensity: number
  pace: number
  karaoke: boolean
}

export class TypographyLayer {
  private current: LiveLine | null = null
  /** Fired when animations want the camera to react (slams, keyword hits) */
  onImpact: (strength: number, kind?: KeywordEffect) => void = () => {}

  constructor(
    private stage: HTMLElement,
    private host: HTMLElement
  ) {}

  /** Per-frame styling driven by the live look and audio. */
  update(look: BlendedLook, a: AudioState, fx: Fx, intensity: number, time: number): void {
    const p = look.palette
    const st = this.stage.style
    st.setProperty('--text', rgbCss(p.text))
    st.setProperty('--glow', rgbCss(p.glow, 0.85))
    st.setProperty('--accent', rgbCss(p.accent))
    st.setProperty('--accent2', rgbCss(p.accent2))
    st.setProperty('--beat', (a.beat * look.scene.beatPunch).toFixed(3))
    st.setProperty('--energy', a.energy.toFixed(3))
    const breathe = 1 + Math.sin(time * 1.4) * 0.012 * look.scene.breathe
    const pulse = 1 + a.beat * 0.035 * look.scene.beatPunch * intensity
    st.transform = `translate(${(fx.shakeX * 2.2).toFixed(2)}%, ${(fx.shakeY * 2.2).toFixed(2)}%) scale(${(breathe * pulse * fx.zoom).toFixed(4)})`
  }

  private fontSizePx(text: string, theme: Theme): number {
    const h = this.host.clientHeight || window.innerHeight
    const w = this.host.clientWidth || window.innerWidth
    const len = Math.max(4, text.length)
    const byLength = Math.min(1.35, Math.max(0.5, Math.sqrt(22 / len)))
    return Math.min(h * 0.13, w * 0.085) * theme.type.scale * byLength
  }

  private build(text: string, theme: Theme, keywords: Map<number, KeywordEffect>): Pick<LiveLine, 'el' | 'words' | 'chars'> {
    const el = document.createElement('div')
    el.className = 'line'
    const t = theme.type
    Object.assign(el.style, {
      fontFamily: `"${t.family}", serif`,
      fontWeight: String(t.weight),
      fontStyle: t.style,
      textTransform: t.transform,
      letterSpacing: `${t.tracking}em`,
      lineHeight: String(t.lineHeight),
      fontSize: `${this.fontSizePx(text, theme)}px`
    })
    const words: HTMLElement[] = []
    const chars: HTMLElement[] = []
    text.split(/\s+/).filter(Boolean).forEach((wText, wi) => {
      const w = document.createElement('span')
      w.className = 'word'
      if (keywords.has(wi)) w.classList.add('keyword')
      for (const ch of wText) {
        const c = document.createElement('span')
        c.className = 'char'
        c.textContent = ch
        w.appendChild(c)
        chars.push(c)
      }
      el.appendChild(w)
      el.appendChild(document.createTextNode(' '))
      words.push(w)
    })
    return { el, words, chars }
  }

  private ctx(live: Pick<LiveLine, 'el' | 'words' | 'chars'>, theme: Theme, intensity: number, pace: number, seed: number): TransitionCtx {
    return {
      line: live.el,
      words: live.words,
      chars: live.chars,
      intensity: Math.min(1.6, Math.max(0.3, intensity)),
      pace,
      ease: theme.ease,
      rand: seeded(seed),
      onImpact: (s) => this.onImpact(s)
    }
  }

  showLine(line: LyricLine, analysis: LineAnalysis | null, o: ShowLineOptions): void {
    this.hide(o.intensity, o.pace)
    const keywords = new Map<number, KeywordEffect>((analysis?.keywords ?? []).map((k) => [k.wordIndex, k.effect]))
    const built = this.build(line.text, o.theme, keywords)
    this.host.appendChild(built.el)
    const live: LiveLine = { ...built, line, keywords, out: o.outPreset, theme: o.theme, activeWord: -1, karaoke: o.karaoke }
    if (o.karaoke) live.words.forEach((w) => w.classList.add('upcoming'))
    IN_PRESETS[o.inPreset](this.ctx(live, o.theme, o.intensity, o.pace, line.index + 7))
    this.current = live
  }

  /** Title card for intros, instrumentals and songs without lyrics. */
  showCard(title: string, subtitle: string, theme: Theme, intensity: number): void {
    this.hide(intensity, 1)
    const built = this.build(title, theme, new Map())
    built.el.classList.add('card')
    built.el.style.fontSize = `${this.fontSizePx(title, theme) * 0.8}px`
    const sub = document.createElement('div')
    sub.className = 'card-sub'
    sub.textContent = subtitle
    built.el.appendChild(sub)
    this.host.appendChild(built.el)
    this.current = { ...built, line: null, keywords: new Map(), out: 'dissolve', theme, activeWord: -1, karaoke: false }
    IN_PRESETS['blur-dissolve'](this.ctx(built, theme, intensity, 1.4, title.length))
    gsap.from(sub, { opacity: 0, y: 20, duration: 1.4, delay: 0.6, ease: 'power2.out' })
  }

  get showing(): 'line' | 'card' | null {
    return this.current ? (this.current.line ? 'line' : 'card') : null
  }

  hide(intensity = 1, pace = 1): void {
    const old = this.current
    if (!old) return
    this.current = null
    gsap.killTweensOf([old.el, ...old.words, ...old.chars])
    old.el.classList.add('leaving')
    const tl = OUT_PRESETS[old.out](this.ctx(old, old.theme, intensity, pace, (old.line?.index ?? 0) + 99))
    tl.eventCallback('onComplete', () => old.el.remove())
    // Safety net in case a timeline is interrupted
    setTimeout(() => old.el.isConnected && old.el.remove(), 4000)
  }

  clear(): void {
    this.host.querySelectorAll('.line').forEach((el) => {
      gsap.killTweensOf(el)
      el.remove()
    })
    this.current = null
  }

  /** Karaoke: light words as they're sung and fire keyword effects. */
  updateWords(tMs: number): void {
    const cur = this.current
    if (!cur?.line || !cur.karaoke) return
    const words = cur.line.words
    let idx = -1
    for (let i = 0; i < words.length; i++) if (words[i].startMs <= tMs) idx = i
    if (idx === cur.activeWord) return
    for (let i = Math.max(0, cur.activeWord); i <= idx; i++) {
      const w = cur.words[i]
      if (!w) continue
      w.classList.remove('upcoming')
      w.classList.toggle('sung', i < idx)
      if (i === idx) {
        w.classList.add('active')
        gsap.fromTo(w, { scale: 1.16, y: -4 }, { scale: 1, y: 0, duration: 0.45, ease: cur.theme.ease.pop, overwrite: 'auto' })
        const effect = cur.keywords.get(i)
        if (effect) this.keywordEffect(w, effect)
      } else w.classList.remove('active')
    }
    cur.activeWord = idx
  }

  private keywordEffect(word: HTMLElement, effect: KeywordEffect): void {
    const chars = Array.from(word.querySelectorAll<HTMLElement>('.char'))
    const rand = seeded(word.textContent?.length ?? 1)
    this.onImpact(effect === 'shatter' || effect === 'shake' ? 0.7 : 0.35, effect)
    word.classList.add(`fx-${effect}`)
    switch (effect) {
      case 'burn':
        gsap.to(chars, { y: () => -4 - rand() * 8, duration: 0.12, repeat: 9, yoyo: true, ease: 'rough({strength: 2, points: 8})', stagger: 0.02 })
        break
      case 'heartbeat':
        gsap.timeline({ repeat: 2 }).to(word, { scale: 1.32, duration: 0.12, ease: 'power2.out' }).to(word, { scale: 1, duration: 0.18 }).to(word, { scale: 1.18, duration: 0.1 }).to(word, { scale: 1, duration: 0.35, ease: 'power2.out' })
        break
      case 'drip':
        gsap.to(chars, { y: () => 8 + rand() * 22, scaleY: 1.25, transformOrigin: '50% 0%', duration: 1.6, ease: 'power2.in', stagger: { each: 0.08, from: 'random' } })
        break
      case 'shatter':
        gsap.fromTo(
          chars,
          { x: () => (rand() - 0.5) * 140, y: () => (rand() - 0.5) * 120, rotate: () => (rand() - 0.5) * 120, opacity: 0.3 },
          { x: 0, y: 0, rotate: 0, opacity: 1, duration: 0.9, ease: 'elastic.out(1, 0.45)', stagger: 0.015 }
        )
        break
      case 'glow':
        gsap.fromTo(word, { letterSpacing: '0.25em' }, { letterSpacing: '0em', duration: 1.2, ease: 'expo.out' })
        break
      case 'shake':
        gsap.fromTo(word, { x: -10 }, { x: 0, duration: 0.6, ease: 'rough({strength: 3, points: 20, taper: "out"})' })
        break
      case 'float':
        gsap.to(chars, { y: (i) => -10 - Math.sin(i) * 8, duration: 1.4, ease: 'sine.inOut', yoyo: true, repeat: 3, stagger: 0.06 })
        break
    }
  }
}
