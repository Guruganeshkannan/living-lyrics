import { gsap } from 'gsap'
import * as THREE from 'three'

export type CameraPath = 'drift' | 'descend' | 'rise' | 'jump' | 'punch' | 'orbit' | 'zigzag' | 'pan'

export interface Pose {
  pos: THREE.Vector3
  quat: THREE.Quaternion
}

export interface CameraFx {
  /** 0..1 handheld wobble amount */
  handheld: number
  /** Beat envelope × punch: pushes the camera toward the text */
  beatPush: number
  shake: number
  /** Extra dolly-in (0..~0.1 of the viewing distance) */
  zoomKick: number
}

const DEG = Math.PI / 180
const tmpV = new THREE.Vector3()
const tmpQ = new THREE.Quaternion()
const tmpE = new THREE.Euler()

const clonePose = (p: Pose): Pose => ({ pos: p.pos.clone(), quat: p.quat.clone() })

/**
 * Places every lyric line somewhere new in 3D space and flies one shared
 * PerspectiveCamera between them. World units are CSS pixels, so a line seen
 * from `viewDistance()` straight on appears at its natural size.
 */
export class CameraDirector {
  readonly camera: THREE.PerspectiveCamera
  /** Pose of the line currently framed */
  private anchor: Pose = { pos: new THREE.Vector3(), quat: new THREE.Quaternion() }
  private from: Pose
  private to: Pose
  private ctrl = new THREE.Vector3()
  private t = 1
  private duration = 1
  private ease: (x: number) => number = (x) => x
  private base: Pose
  private time = 0
  private sideSign = 1
  private orbitAngle = 0
  private forward = new THREE.Vector3()

  constructor(private viewport: () => { w: number; h: number }) {
    const { w, h } = viewport()
    this.camera = new THREE.PerspectiveCamera(50, w / h, 1, 40000)
    const start = this.framing(this.anchor, 0, 0, 0)
    this.base = clonePose(start)
    this.from = clonePose(start)
    this.to = clonePose(start)
    this.apply(this.base)
  }

  resize(): void {
    const { w, h } = this.viewport()
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
  }

  /** Distance at which 1 world unit = 1 CSS pixel. */
  viewDistance(): number {
    return this.viewport().h / 2 / Math.tan((this.camera.fov * DEG) / 2)
  }

  reset(): void {
    this.anchor = { pos: new THREE.Vector3(), quat: new THREE.Quaternion() }
    const start = this.framing(this.anchor, 0, 0, 0)
    this.base = clonePose(start)
    this.to = clonePose(start)
    this.t = 1
  }

  get currentAnchor(): Pose {
    return this.anchor
  }

  /** Where the next line lives, relative to the current one. Deterministic per line. */
  nextLinePose(path: CameraPath, rand: () => number, big: boolean): Pose {
    const r = (lo: number, hi: number) => lo + (hi - lo) * rand()
    const pm = () => (rand() < 0.5 ? -1 : 1)
    const k = big ? 1.45 : 1
    const off = new THREE.Vector3()
    const rot = new THREE.Euler(0, 0, 0, 'YXZ')
    this.sideSign *= -1
    switch (path) {
      case 'drift':
        off.set(r(-350, 350), r(-180, 180), -r(700, 1100) * k)
        rot.set(r(-6, 6) * DEG, r(-10, 10) * DEG, r(-5, 5) * DEG)
        break
      case 'descend':
        off.set(r(-250, 250), -r(380, 520) * k, -r(500, 800))
        rot.set(-r(3, 8) * DEG, r(-5, 5) * DEG, r(-4, 4) * DEG)
        break
      case 'rise':
        off.set(r(-300, 300), r(420, 600) * k, -r(600, 900))
        rot.set(r(3, 8) * DEG, r(-6, 6) * DEG, r(-3, 3) * DEG)
        break
      case 'jump': {
        off.set(this.sideSign * r(900, 1500) * k, r(-700, 700), -r(400, 1400))
        const axis = Math.floor(rand() * 3)
        if (axis === 0) rot.set(0, pm() * r(55, 95) * DEG, 0)
        else if (axis === 1) rot.set(pm() * r(40, 70) * DEG, 0, 0)
        else rot.set(0, 0, pm() * r(30, 90) * DEG)
        break
      }
      case 'punch':
        off.set(r(-500, 500), r(-250, 250), -r(1300, 1800) * k)
        rot.set(0, pm() * r(10, 30) * DEG, pm() * r(10, 22) * DEG)
        break
      case 'orbit': {
        // Swing around a pivot behind the line, like circling the text
        const pivot = new THREE.Vector3(0, 0, -1400).applyQuaternion(this.anchor.quat).add(this.anchor.pos)
        const yaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0).applyQuaternion(this.anchor.quat), (big ? 55 : 32) * DEG * this.sideSign)
        const pos = this.anchor.pos.clone().sub(pivot).applyQuaternion(yaw).add(pivot)
        pos.add(new THREE.Vector3(0, r(-200, 200), 0).applyQuaternion(this.anchor.quat))
        return { pos, quat: yaw.multiply(this.anchor.quat.clone()) }
      }
      case 'zigzag':
        off.set(this.sideSign * r(600, 820) * k, r(-260, 260), -r(300, 600))
        rot.set(0, r(-8, 8) * DEG, this.sideSign * r(8, 15) * DEG)
        break
      case 'pan':
        off.set(r(1100, 1400) * k, r(-60, 60), -r(100, 300))
        rot.set(0, -r(6, 12) * DEG, r(-2, 2) * DEG)
        break
    }
    const pos = off.applyQuaternion(this.anchor.quat).add(this.anchor.pos)
    const quat = this.anchor.quat.clone().multiply(tmpQ.setFromEuler(rot))
    return { pos, quat }
  }

  /** Camera pose that frames a line, optionally from a slight angle for depth. */
  framing(line: Pose, yawDeg: number, pitchDeg: number, rollDeg: number, distanceScale = 1): Pose {
    const view = new THREE.Quaternion().setFromEuler(tmpE.set(pitchDeg * DEG, yawDeg * DEG, rollDeg * DEG, 'YXZ'))
    const quat = line.quat.clone().multiply(view)
    const pos = new THREE.Vector3(0, 0, this.viewDistance() * distanceScale).applyQuaternion(quat).add(line.pos)
    return { pos, quat }
  }

  /** Fly to frame `line`. Chorus moves pull back first, then push in. */
  flyTo(line: Pose, path: CameraPath, seconds: number, ease: string, rand: () => number, dramatic: boolean): void {
    const r = (lo: number, hi: number) => lo + (hi - lo) * rand()
    const angle: Record<CameraPath, [number, number, number]> = {
      drift: [r(-8, 8), r(-5, 5), 0],
      descend: [r(-5, 5), -10, 0],
      rise: [r(-6, 6), 12, 0],
      jump: [r(-15, 15), r(-10, 10), r(-6, 6)],
      punch: [r(-10, 10), r(-6, 6), r(-12, 12)],
      orbit: [r(-12, 12), r(-6, 6), 12 * this.sideSign],
      zigzag: [r(-10, 10), r(-5, 5), 0],
      pan: [r(-6, 6), 0, 0]
    }
    const [yaw, pitch, roll] = angle[path]
    this.anchor = clonePose(line)
    this.from = clonePose(this.base)
    this.to = this.framing(line, yaw, pitch, roll)
    const d = this.viewDistance()
    // Bezier control point: midway, pulled back along the destination's view axis
    const back = new THREE.Vector3(0, 0, 1).applyQuaternion(this.to.quat)
    this.ctrl.copy(this.from.pos).lerp(this.to.pos, 0.5).addScaledVector(back, d * (dramatic ? 1.3 : 0.18))
    this.duration = Math.max(0.3, seconds)
    this.ease = gsap.parseEase(ease) as (x: number) => number
    this.t = 0
  }

  /** Slow cinematic orbit around the current anchor when there's nothing to read. */
  idle(dt: number): void {
    if (this.t < 1) return
    this.orbitAngle += dt * 0.08
    const target = this.framing(this.anchor, Math.sin(this.orbitAngle) * 18, Math.sin(this.orbitAngle * 0.7) * 6, Math.sin(this.orbitAngle * 0.5) * 4, 1.25)
    const k = 1 - Math.exp(-dt * 0.8)
    this.base.pos.lerp(target.pos, k)
    this.base.quat.slerp(target.quat, k)
  }

  update(dt: number, fx: CameraFx): void {
    this.time += dt
    if (this.t < 1) {
      this.t = Math.min(1, this.t + dt / this.duration)
      const e = this.ease(this.t)
      const u = 1 - e
      // Quadratic bezier position, slerped rotation
      this.base.pos.set(0, 0, 0).addScaledVector(this.from.pos, u * u).addScaledVector(this.ctrl, 2 * u * e).addScaledVector(this.to.pos, e * e)
      this.base.quat.copy(this.from.quat).slerp(this.to.quat, e)
    }

    const d = this.viewDistance()
    const t = this.time
    const h = fx.handheld
    // Layered sines: organic handheld drift without a noise texture
    const wob = tmpV.set(
      (Math.sin(t * 0.71) + Math.sin(t * 1.37 + 1.3) * 0.5) * h,
      (Math.sin(t * 0.53 + 2.1) + Math.sin(t * 1.11 + 0.4) * 0.5) * h,
      0
    )
    const cam = this.camera
    cam.position.copy(this.base.pos).addScaledVector(wob.applyQuaternion(this.base.quat), d * 0.012)
    const forward = this.forward.set(0, 0, -1).applyQuaternion(this.base.quat)
    cam.position.addScaledVector(forward, d * (fx.beatPush * 0.035 + fx.zoomKick))
    const rotWob = tmpQ.setFromEuler(
      tmpE.set(
        (Math.sin(t * 0.9 + 3) * 0.4 * h + (Math.random() - 0.5) * fx.shake * 1.6) * DEG,
        (Math.sin(t * 0.77) * 0.5 * h + (Math.random() - 0.5) * fx.shake * 1.6) * DEG,
        (Math.sin(t * 0.43 + 1) * 0.6 * h + (Math.random() - 0.5) * fx.shake * 2.4) * DEG,
        'YXZ'
      )
    )
    cam.quaternion.copy(this.base.quat).multiply(rotWob)
    cam.updateMatrixWorld()
  }

  private apply(p: Pose): void {
    this.camera.position.copy(p.pos)
    this.camera.quaternion.copy(p.quat)
    this.camera.updateMatrixWorld()
  }
}
