/** Minimal sRGB <-> OKLab so palettes cross-fade through perceptually even colors. */
export type RGB = [number, number, number]

export function hexToRgb(hex: string): RGB {
  const h = hex.replace('#', '')
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

const toLin = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4))
const toSrgb = (c: number) => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055)

export function rgbToOklab([r, g, b]: RGB): RGB {
  const [lr, lg, lb] = [toLin(r), toLin(g), toLin(b)]
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb)
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb)
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb)
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  ]
}

export function oklabToRgb([L, A, B]: RGB): RGB {
  const l = Math.pow(L + 0.3963377774 * A + 0.2158037573 * B, 3)
  const m = Math.pow(L - 0.1055613458 * A - 0.0638541728 * B, 3)
  const s = Math.pow(L - 0.0894841775 * A - 1.291485548 * B, 3)
  const c = (x: number) => Math.min(1, Math.max(0, toSrgb(x)))
  return [
    c(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    c(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    c(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s)
  ]
}

/** Weighted mix of colors in OKLab. */
export function mixOklab(colors: RGB[], weights: number[]): RGB {
  const out: RGB = [0, 0, 0]
  colors.forEach((c, i) => {
    const lab = rgbToOklab(c)
    out[0] += lab[0] * weights[i]
    out[1] += lab[1] * weights[i]
    out[2] += lab[2] * weights[i]
  })
  return oklabToRgb(out)
}

export const rgbCss = ([r, g, b]: RGB, a = 1) => `rgba(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)},${a})`

/** Rotate hue in OKLab by an angle (radians). */
export function hueShift(c: RGB, angle: number): RGB {
  const [L, A, B] = rgbToOklab(c)
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  return oklabToRgb([L, A * cos - B * sin, A * sin + B * cos])
}
