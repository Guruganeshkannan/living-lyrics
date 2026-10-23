import * as THREE from 'three'
import type { CSS3DObject } from 'three/examples/jsm/renderers/CSS3DRenderer.js'
import type { LivePalette } from '../themes/blend'
import fragmentShader from './shaders/textParticles.frag.glsl?raw'
import vertexShader from './shaders/textParticles.vert.glsl?raw'

interface Burst {
  points: THREE.Points
  uniforms: Record<string, THREE.IUniform>
  age: number
  life: number
}

const SAMPLE_SCALE = 0.5

/**
 * Rasterizes a DOM lyric line (the browser shapes Tamil, Hindi and Urdu correctly
 * in canvas too) and turns its glyph pixels into GPU particles placed exactly over
 * the text in 3D, so a line can disintegrate, explode or assemble in place.
 */
export class TextParticles {
  private bursts: Burst[] = []
  private canvas = document.createElement('canvas')
  private ctx = this.canvas.getContext('2d', { willReadFrequently: true })!
  /** Particle budget per line, scaled by the quality governor */
  budget = 7000

  constructor(
    private world: THREE.Scene,
    private viewDist: () => number,
    private pixelRatio: () => number
  ) {}

  /** Sample the glyphs of `lineEl` (child of the CSS3DObject's element) into world-space points. */
  private sample(obj: CSS3DObject, lineEl: HTMLElement, palette: LivePalette, only?: HTMLElement): { pos: Float32Array; col: Float32Array; count: number; step: number } | null {
    const W = obj.element.offsetWidth
    const H = obj.element.offsetHeight
    if (!W || !H) return null
    const cw = Math.ceil(W * SAMPLE_SCALE)
    const ch = Math.ceil(H * SAMPLE_SCALE)
    this.canvas.width = cw
    this.canvas.height = ch
    const ctx = this.ctx
    ctx.clearRect(0, 0, cw, ch)
    const cs = getComputedStyle(lineEl)
    const size = parseFloat(cs.fontSize) * SAMPLE_SCALE
    ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${size}px ${cs.fontFamily}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.direction = cs.direction === 'rtl' ? 'rtl' : 'ltr'
    ctx.fillStyle = '#fff'
    // Each akshara/word span is drawn where the DOM laid it out
    ;(only ?? lineEl).querySelectorAll<HTMLElement>('.ch').forEach((c) => {
      let x = 0
      let y = 0
      // offsetLeft/Top ignore 3D transforms, which is what we want
      let n: HTMLElement | null = c
      while (n && n !== obj.element) {
        x += n.offsetLeft
        y += n.offsetTop
        n = n.offsetParent as HTMLElement | null
      }
      ctx.fillText(c.textContent ?? '', (x + c.offsetWidth / 2) * SAMPLE_SCALE, (y + c.offsetHeight / 2) * SAMPLE_SCALE)
    })
    const data = ctx.getImageData(0, 0, cw, ch).data
    let opaque = 0
    for (let i = 3; i < data.length; i += 4) if (data[i] > 110) opaque++
    if (!opaque) return null
    const step = Math.max(1, Math.ceil(Math.sqrt(opaque / this.budget)))
    const pos: number[] = []
    const col: number[] = []
    const local = new THREE.Vector3()
    const text = palette.text
    const glow = palette.glow
    for (let y = 0; y < ch; y += step) {
      for (let x = 0; x < cw; x += step) {
        if (data[(y * cw + x) * 4 + 3] <= 110) continue
        // CSS px (y down) around the element centre → object local (y up)
        local.set(x / SAMPLE_SCALE - W / 2, H / 2 - y / SAMPLE_SCALE, 0).applyMatrix4(obj.matrixWorld)
        pos.push(local.x, local.y, local.z)
        const m = Math.random() * 0.45
        col.push(text[0] + (glow[0] - text[0]) * m, text[1] + (glow[1] - text[1]) * m, text[2] + (glow[2] - text[2]) * m)
      }
    }
    return { pos: new Float32Array(pos), col: new Float32Array(col), count: pos.length / 3, step: step / SAMPLE_SCALE }
  }

  /** Turn a line into particles with the given style (see textParticles.vert.glsl). Returns false if nothing to sample. */
  spawn(obj: CSS3DObject, lineEl: HTMLElement, style: number, palette: LivePalette, life: number, only?: HTMLElement): boolean {
    obj.updateMatrixWorld(true)
    const s = this.sample(obj, lineEl, palette, only)
    if (!s || !s.count) return false
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(s.pos, 3))
    geo.setAttribute('aColor', new THREE.BufferAttribute(s.col, 3))
    const rand = new Float32Array(s.count * 4)
    for (let i = 0; i < rand.length; i++) rand[i] = Math.random()
    geo.setAttribute('aRand', new THREE.BufferAttribute(rand, 4))

    const e = obj.matrixWorld.elements
    const right = new THREE.Vector3(e[0], e[1], e[2]).normalize()
    const up = new THREE.Vector3(e[4], e[5], e[6]).normalize()
    const normal = new THREE.Vector3(e[8], e[9], e[10]).normalize()
    const center = new THREE.Vector3().setFromMatrixPosition(obj.matrixWorld)
    const uniforms: Record<string, THREE.IUniform> = {
      uAge: { value: 0 },
      uLife: { value: life },
      uStyle: { value: style },
      uCenter: { value: center },
      uRight: { value: right },
      uUp: { value: up },
      uNormal: { value: normal },
      uSize: { value: s.step * 1.5 },
      uPixelRatio: { value: this.pixelRatio() },
      uViewDist: { value: this.viewDist() },
      uWidth: { value: obj.element.offsetWidth },
      uAccent: { value: new THREE.Color(...palette.accent) },
      uAccent2: { value: new THREE.Color(...palette.accent2) }
    }
    const points = new THREE.Points(
      geo,
      new THREE.ShaderMaterial({ vertexShader, fragmentShader, uniforms, transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending })
    )
    points.frustumCulled = false
    this.world.add(points)
    this.bursts.push({ points, uniforms, age: 0, life })
    // Keep at most a few bursts alive
    while (this.bursts.length > 4) this.dispose(this.bursts.shift()!)
    return true
  }

  /** Small sparkle burst around a word (keyword effects). */
  burstAt(obj: CSS3DObject, line: HTMLElement, word: HTMLElement, style: number, palette: LivePalette): void {
    const prevBudget = this.budget
    this.budget = Math.min(900, prevBudget)
    this.spawn(obj, line, style, palette, 1.4, word)
    this.budget = prevBudget
  }

  update(dt: number): void {
    for (let i = this.bursts.length - 1; i >= 0; i--) {
      const b = this.bursts[i]
      b.age += dt
      b.uniforms.uAge.value = b.age
      if (b.age > b.life + 0.2) {
        this.dispose(b)
        this.bursts.splice(i, 1)
      }
    }
  }

  clear(): void {
    this.bursts.forEach((b) => this.dispose(b))
    this.bursts = []
  }

  private dispose(b: Burst): void {
    this.world.remove(b.points)
    b.points.geometry.dispose()
    ;(b.points.material as THREE.Material).dispose()
  }
}
