import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import type { AudioState } from '../audio/audioEngine'
import type { BlendedLook } from '../themes/blend'
import bgFrag from './shaders/background.frag.glsl?raw'
import quadVert from './shaders/fullscreen.vert.glsl?raw'
import particlesFrag from './shaders/particles.frag.glsl?raw'
import particlesVert from './shaders/particles.vert.glsl?raw'
import postFrag from './shaders/post.frag.glsl?raw'

const PARTICLES = 2200

/** Per-frame camera effects shared with the typography layer. */
export interface Fx {
  shakeX: number
  shakeY: number
  flash: number
  glitch: number
  zoom: number
}

export class BackgroundLayer {
  private renderer: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  private composer: EffectComposer
  private bloom: UnrealBloomPass
  private post: ShaderPass
  private bgUniforms: Record<string, THREE.IUniform>
  private ptUniforms: Record<string, THREE.IUniform>
  private flow = 0
  private rise = 0
  private swirl = 0

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))

    const v3 = () => ({ value: new THREE.Color() })
    this.bgUniforms = {
      uTime: { value: 0 },
      uFlow: { value: 0 },
      uRes: { value: new THREE.Vector2() },
      uBg0: v3(),
      uBg1: v3(),
      uAccent: v3(),
      uAccent2: v3(),
      uGlow: v3(),
      ...Object.fromEntries(
        ['uEnergy', 'uBass', 'uTreble', 'uBeat', 'uBeatAge', 'uFlash', 'uIntensity', 'uWarp', 'uNoiseScale', 'uAccentMix', 'uRays', 'uRings', 'uRain', 'uStars', 'uEmbers', 'uBreathe', 'uPunch'].map((k) => [k, { value: 0 }])
      )
    }
    const bg = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({ vertexShader: quadVert, fragmentShader: bgFrag, uniforms: this.bgUniforms, depthTest: false, depthWrite: false }))
    bg.frustumCulled = false
    this.scene.add(bg)

    this.ptUniforms = {
      uTime: { value: 0 },
      uRise: { value: 0 },
      uSwirl: { value: 0 },
      uSize: { value: 1 },
      uDensity: { value: 0.5 },
      uStreak: { value: 0 },
      uSharp: { value: 0 },
      uBeat: { value: 0 },
      uEnergy: { value: 0 },
      uPunch: { value: 0 },
      uPixelRatio: { value: this.renderer.getPixelRatio() },
      uRes: { value: new THREE.Vector2() },
      uAccent: v3(),
      uAccent2: v3()
    }
    const geo = new THREE.BufferGeometry()
    const pos = new Float32Array(PARTICLES * 3)
    const seed = new Float32Array(PARTICLES * 4)
    for (let i = 0; i < PARTICLES * 3; i++) pos[i] = Math.random()
    for (let i = 0; i < PARTICLES * 4; i++) seed[i] = Math.random()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4))
    const points = new THREE.Points(
      geo,
      new THREE.ShaderMaterial({
        vertexShader: particlesVert,
        fragmentShader: particlesFrag,
        uniforms: this.ptUniforms,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      })
    )
    points.frustumCulled = false
    this.scene.add(points)

    this.composer = new EffectComposer(this.renderer)
    this.composer.addPass(new RenderPass(this.scene, this.camera))
    this.bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 1, 0.7, 0.3)
    this.composer.addPass(this.bloom)
    this.post = new ShaderPass({
      uniforms: {
        tDiffuse: { value: null },
        uTime: { value: 0 },
        uRes: { value: new THREE.Vector2() },
        uShake: { value: new THREE.Vector2() },
        uAberration: { value: 0 },
        uGlitch: { value: 0 },
        uGrain: { value: 0 },
        uVignette: { value: 0 },
        uZoom: { value: 1 }
      },
      vertexShader: quadVert,
      fragmentShader: postFrag
    })
    this.composer.addPass(this.post)

    window.addEventListener('resize', () => this.resize())
    this.resize()
  }

  resize(): void {
    const w = this.canvas.clientWidth || window.innerWidth
    const h = this.canvas.clientHeight || window.innerHeight
    this.renderer.setSize(w, h, false)
    this.composer.setSize(w, h)
    const pr = this.renderer.getPixelRatio()
    ;(this.bgUniforms.uRes.value as THREE.Vector2).set(w * pr, h * pr)
    ;(this.ptUniforms.uRes.value as THREE.Vector2).set(w * pr, h * pr)
    ;(this.post.uniforms.uRes.value as THREE.Vector2).set(w * pr, h * pr)
  }

  render(dt: number, time: number, look: BlendedLook, a: AudioState, intensity: number, fx: Fx): void {
    const s = look.scene
    const p = look.palette
    const activity = a.silent ? 0.25 : 0.6 + 0.8 * a.energy
    this.flow += dt * s.speed * activity
    this.rise += dt * s.drift * s.particleSpeed * (0.5 + a.energy)
    this.swirl += dt * (0.3 + s.particleSpeed)

    const u = this.bgUniforms
    u.uTime.value = time
    u.uFlow.value = this.flow
    ;(u.uBg0.value as THREE.Color).setRGB(...p.bg0)
    ;(u.uBg1.value as THREE.Color).setRGB(...p.bg1)
    ;(u.uAccent.value as THREE.Color).setRGB(...p.accent)
    ;(u.uAccent2.value as THREE.Color).setRGB(...p.accent2)
    ;(u.uGlow.value as THREE.Color).setRGB(...p.glow)
    u.uEnergy.value = a.energy
    u.uBass.value = a.bass
    u.uTreble.value = a.treble
    u.uBeat.value = a.beat
    u.uBeatAge.value = Math.min(a.beatAge, 5)
    u.uFlash.value = fx.flash
    u.uIntensity.value = intensity
    u.uWarp.value = s.warp
    u.uNoiseScale.value = s.noiseScale
    u.uAccentMix.value = s.accentMix
    u.uRays.value = s.rays
    u.uRings.value = s.rings
    u.uRain.value = s.rain
    u.uStars.value = s.stars
    u.uEmbers.value = s.embers
    u.uBreathe.value = s.breathe
    u.uPunch.value = s.beatPunch * intensity

    const pu = this.ptUniforms
    pu.uTime.value = time
    pu.uRise.value = this.rise
    pu.uSwirl.value = this.swirl
    pu.uSize.value = s.particleSize
    pu.uDensity.value = s.particleDensity
    pu.uStreak.value = s.streak
    pu.uSharp.value = s.sharp
    pu.uBeat.value = a.beat
    pu.uEnergy.value = a.energy
    pu.uPunch.value = s.beatPunch * intensity
    ;(pu.uAccent.value as THREE.Color).setRGB(...p.accent)
    ;(pu.uAccent2.value as THREE.Color).setRGB(...p.accent2)

    this.bloom.strength = s.bloom * (0.55 + 0.6 * a.energy + 0.5 * a.beat * s.beatPunch)
    this.bloom.radius = 0.6 + 0.2 * a.bass

    const pp = this.post.uniforms
    pp.uTime.value = time
    ;(pp.uShake.value as THREE.Vector2).set(fx.shakeX * 0.02, fx.shakeY * 0.02)
    pp.uAberration.value = s.aberration * (0.4 + a.beat * 1.2 + a.onset * 0.6) + fx.glitch * 0.8
    pp.uGlitch.value = Math.min(1, fx.glitch)
    pp.uGrain.value = s.grain
    pp.uVignette.value = s.vignette
    pp.uZoom.value = fx.zoom

    this.composer.render(dt)
  }
}
