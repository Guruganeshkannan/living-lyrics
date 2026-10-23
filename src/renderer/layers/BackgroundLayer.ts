import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import type { AudioState } from '../audio/audioEngine'
import type { QualityLevel } from '../perf/QualityGovernor'
import type { BlendedLook } from '../themes/blend'
import bgFrag from './shaders/background.frag.glsl?raw'
import quadVert from './shaders/fullscreen.vert.glsl?raw'
import particlesFrag from './shaders/particles.frag.glsl?raw'
import particlesVert from './shaders/particles.vert.glsl?raw'
import postFrag from './shaders/post.frag.glsl?raw'

const MAX_PARTICLES = 3000

/** Per-frame camera/screen effects shared by the layers. */
export interface Fx {
  shake: number
  flash: number
  glitch: number
  zoom: number
  /** Darken behind the lyrics (0..1) */
  scrim: number
  /** Overall brightness (drops dim the world, surges blow it open) */
  exposure: number
}

export interface SceneState {
  modeA: number
  modeB: number
  mix: number
  chorus: number
}

/**
 * WebGL world: a fullscreen shader "world" behind everything, a 3D particle field
 * and text-particle bursts in world space (seen through the shared camera), then
 * bloom and a grading pass.
 */
export class BackgroundLayer {
  readonly renderer: THREE.WebGLRenderer
  /** World-space scene for anything that should parallax with the camera */
  readonly world = new THREE.Scene()
  private bgScene = new THREE.Scene()
  private orthoCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  private composer: EffectComposer
  private bloom: UnrealBloomPass
  private post: ShaderPass
  private bgUniforms: Record<string, THREE.IUniform>
  private ptUniforms: Record<string, THREE.IUniform>
  private ptGeo: THREE.BufferGeometry
  private flow = 0
  private drift = new THREE.Vector3()
  private swirl = 0
  private camUp = new THREE.Vector3()
  private fwd = new THREE.Vector3()
  private pixelRatio = 1.5

  constructor(
    private canvas: HTMLCanvasElement,
    private camera: THREE.PerspectiveCamera,
    private viewDist: () => number
  ) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.pixelRatio))

    const v3 = () => ({ value: new THREE.Color() })
    const num = (keys: string[]) => Object.fromEntries(keys.map((k) => [k, { value: 0 }]))
    this.bgUniforms = {
      uRes: { value: new THREE.Vector2() },
      uView: { value: new THREE.Vector2() },
      uBg0: v3(),
      uBg1: v3(),
      uAccent: v3(),
      uAccent2: v3(),
      uGlow: v3(),
      uModeA: { value: 0 },
      uModeB: { value: 0 },
      uOctaves: { value: 5 },
      ...num(['uTime', 'uFlow', 'uEnergy', 'uBass', 'uTreble', 'uBeat', 'uBeatAge', 'uFlash', 'uIntensity', 'uWarp', 'uNoiseScale', 'uAccentMix', 'uRays', 'uRings', 'uRain', 'uStars', 'uEmbers', 'uBreathe', 'uPunch', 'uChorus', 'uModeMix'])
    }
    const bg = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({ vertexShader: quadVert, fragmentShader: bgFrag, uniforms: this.bgUniforms, depthTest: false, depthWrite: false }))
    bg.frustumCulled = false
    this.bgScene.add(bg)

    this.ptUniforms = {
      uCam: { value: new THREE.Vector3() },
      uDrift: { value: new THREE.Vector3() },
      uAccent: v3(),
      uAccent2: v3(),
      uBox: { value: 4200 },
      uPixelRatio: { value: 1 },
      ...num(['uTime', 'uSwirl', 'uSize', 'uDensity', 'uStreak', 'uSharp', 'uBeat', 'uEnergy', 'uPunch', 'uViewDist'])
    }
    this.ptGeo = new THREE.BufferGeometry()
    const pos = new Float32Array(MAX_PARTICLES * 3)
    const seed = new Float32Array(MAX_PARTICLES * 4)
    for (let i = 0; i < pos.length; i++) pos[i] = Math.random()
    for (let i = 0; i < seed.length; i++) seed[i] = Math.random()
    this.ptGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    this.ptGeo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4))
    const points = new THREE.Points(
      this.ptGeo,
      new THREE.ShaderMaterial({ vertexShader: particlesVert, fragmentShader: particlesFrag, uniforms: this.ptUniforms, transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending })
    )
    points.frustumCulled = false
    this.world.add(points)

    this.composer = new EffectComposer(this.renderer)
    this.composer.addPass(new RenderPass(this.bgScene, this.orthoCam))
    const worldPass = new RenderPass(this.world, camera)
    worldPass.clear = false
    this.composer.addPass(worldPass)
    this.bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 1, 0.7, 0.65)
    this.composer.addPass(this.bloom)
    this.post = new ShaderPass({
      uniforms: {
        tDiffuse: { value: null },
        uRes: { value: new THREE.Vector2() },
        uShake: { value: new THREE.Vector2() },
        uZoom: { value: 1 },
        uExposure: { value: 1 },
        ...num(['uTime', 'uAberration', 'uGlitch', 'uGrain', 'uVignette', 'uScrim'])
      },
      vertexShader: quadVert,
      fragmentShader: postFrag
    })
    this.composer.addPass(this.post)
    this.resize()
  }

  setQuality(q: QualityLevel): void {
    if (q.pixelRatio !== this.pixelRatio) {
      this.pixelRatio = q.pixelRatio
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, q.pixelRatio))
      this.resize()
    }
    this.ptGeo.setDrawRange(0, Math.floor(MAX_PARTICLES * q.particles))
    this.bgUniforms.uOctaves.value = q.octaves
  }

  resize(): void {
    const w = this.canvas.clientWidth || window.innerWidth
    const h = this.canvas.clientHeight || window.innerHeight
    this.renderer.setSize(w, h, false)
    this.composer.setPixelRatio(this.renderer.getPixelRatio())
    this.composer.setSize(w, h)
    const pr = this.renderer.getPixelRatio()
    ;(this.bgUniforms.uRes.value as THREE.Vector2).set(w * pr, h * pr)
    ;(this.post.uniforms.uRes.value as THREE.Vector2).set(w * pr, h * pr)
    this.ptUniforms.uPixelRatio.value = pr
  }

  render(dt: number, time: number, look: BlendedLook, a: AudioState, intensity: number, fx: Fx, scene: SceneState): void {
    const s = look.scene
    const p = look.palette
    const activity = a.silent ? 0.25 : 0.6 + 0.8 * a.energy
    this.flow += dt * s.speed * activity
    this.swirl += dt * (0.3 + s.particleSpeed)
    // Particles drift along the camera's "up" (rain falls on screen, embers rise on screen)
    this.camUp.set(0, 1, 0).applyQuaternion(this.camera.quaternion)
    this.drift.addScaledVector(this.camUp, dt * s.drift * s.particleSpeed * 260 * (0.5 + a.energy))

    // Background worlds shift slightly as the camera turns
    this.fwd.set(0, 0, -1).applyQuaternion(this.camera.quaternion)
    const view = this.bgUniforms.uView.value as THREE.Vector2
    view.set(Math.atan2(this.fwd.x, -this.fwd.z), Math.asin(Math.max(-1, Math.min(1, this.fwd.y))))

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
    u.uAccentMix.value = s.accentMix * (1 + scene.chorus * 0.35)
    u.uRays.value = s.rays
    u.uRings.value = s.rings
    u.uRain.value = s.rain
    u.uStars.value = s.stars
    u.uEmbers.value = s.embers
    u.uBreathe.value = s.breathe
    u.uPunch.value = s.beatPunch * intensity
    u.uChorus.value = scene.chorus
    u.uModeA.value = scene.modeA
    u.uModeB.value = scene.modeB
    u.uModeMix.value = scene.mix

    const pu = this.ptUniforms
    pu.uTime.value = time
    ;(pu.uCam.value as THREE.Vector3).copy(this.camera.position)
    ;(pu.uDrift.value as THREE.Vector3).copy(this.drift)
    pu.uSwirl.value = this.swirl
    pu.uSize.value = s.particleSize
    pu.uDensity.value = s.particleDensity
    pu.uStreak.value = s.streak
    pu.uSharp.value = s.sharp
    pu.uBeat.value = a.beat
    pu.uEnergy.value = a.energy
    pu.uPunch.value = s.beatPunch * intensity
    pu.uViewDist.value = this.viewDist()
    ;(pu.uAccent.value as THREE.Color).setRGB(...p.accent)
    ;(pu.uAccent2.value as THREE.Color).setRGB(...p.accent2)

    this.bloom.strength = s.bloom * (0.35 + 0.4 * a.energy + 0.35 * a.beat * s.beatPunch) * (1 + scene.chorus * 0.2) + fx.flash * 0.8
    this.bloom.radius = 0.55 + 0.2 * a.bass

    const pp = this.post.uniforms
    pp.uTime.value = time
    ;(pp.uShake.value as THREE.Vector2).set((Math.random() - 0.5) * fx.shake * 0.012, (Math.random() - 0.5) * fx.shake * 0.012)
    pp.uAberration.value = s.aberration * (0.4 + a.beat * 1.2 + a.onset * 0.6) + fx.glitch * 0.8
    pp.uGlitch.value = Math.min(1, fx.glitch)
    pp.uGrain.value = s.grain
    pp.uVignette.value = s.vignette
    pp.uZoom.value = fx.zoom
    pp.uScrim.value = fx.scrim
    pp.uExposure.value = fx.exposure

    this.composer.render(dt)
  }
}
