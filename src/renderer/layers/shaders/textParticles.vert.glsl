// A lyric line turned into particles: each point starts on a glyph pixel and then
// flies off (or, for "assemble", flies in) in a mood-specific way.
attribute vec4 aRand;
attribute vec3 aColor;

uniform float uAge;
uniform float uLife;
uniform int uStyle;
uniform vec3 uCenter;
uniform vec3 uRight;
uniform vec3 uUp;
uniform vec3 uNormal;
uniform float uSize;
uniform float uPixelRatio;
uniform float uViewDist;
uniform float uWidth;
uniform vec3 uAccent;
uniform vec3 uAccent2;

varying float vAlpha;
varying vec3 vColor;
varying float vSoft;

vec3 hue(float h) {
  return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
}

void main() {
  vec3 r = aRand.xyz * 2.0 - 1.0;
  float a = uAge;
  float k = clamp(a / uLife, 0.0, 1.0);
  // Left-to-right wave: the line falls apart in reading order
  float across = clamp(dot(position - uCenter, uRight) / max(uWidth, 1.0) + 0.5, 0.0, 1.0);
  float t = max(0.0, a - across * 0.35 - aRand.w * 0.12);
  vec3 disp = vec3(0.0);
  vec3 col = aColor;
  float soft = 0.0;
  float size = 1.0;

  if (uStyle == 0) {          // ash & embers
    disp = uUp * (t * t * 140.0 + t * 70.0) + uRight * (sin(t * 3.0 + r.x * 6.0) * 40.0 * t + r.x * 70.0 * t) + uNormal * r.z * 90.0 * t;
    col = mix(aColor, mix(uAccent2, vec3(0.15, 0.02, 0.0), smoothstep(0.3, 1.0, k)), smoothstep(0.0, 0.25, t));
    size = 1.0 - k * 0.6;
  } else if (uStyle == 1) {   // droplets falling
    disp = -uUp * (0.5 * 950.0 * t * t) + uRight * r.x * 18.0 * t + uNormal * r.z * 25.0 * t;
    col = mix(aColor, uAccent2, smoothstep(0.0, 0.5, t));
  } else if (uStyle == 2) {   // petals / bokeh floating up
    disp = uUp * (70.0 * t + 30.0 * sin(t * 2.0 + r.y * 6.0)) + uRight * (r.x * 150.0 * t + 50.0 * sin(t * 1.5 + r.z * 6.0)) + uNormal * r.z * 170.0 * t;
    col = mix(aColor, mix(uAccent, uAccent2, aRand.y), smoothstep(0.0, 0.4, t));
    soft = 1.0;
    size = 1.0 + k * 1.6;
  } else if (uStyle == 3) {   // explosion
    vec3 dir = normalize(position - uCenter + r * 40.0 + uNormal * 1.0);
    disp = (dir * (650.0 + 400.0 * aRand.y) + uNormal * r.z * 550.0) * (1.0 - exp(-t * 3.5));
    col = mix(vec3(1.0), mix(uAccent, uAccent2, aRand.y), smoothstep(0.0, 0.3, t));
  } else if (uStyle == 4) {   // sucked into the void
    vec3 target = uCenter - uNormal * 1100.0;
    float s = smoothstep(0.0, 1.0, t / uLife * 1.4);
    disp = (target - position) * s * s + (uRight * sin(t * 7.0 + r.x * 6.0) + uUp * cos(t * 7.0 + r.y * 6.0)) * 70.0 * (1.0 - s) * s;
    col = mix(aColor, uAccent, s);
  } else if (uStyle == 5) {   // dust drifting
    disp = (uRight * r.x + uUp * (r.y + 0.5) + uNormal * r.z) * 75.0 * t;
    soft = 0.6;
  } else if (uStyle == 6) {   // golden sparks rising
    disp = uUp * (t * t * 520.0 + t * 220.0 * (0.5 + aRand.y)) + uRight * r.x * 130.0 * t;
    col = mix(vec3(1.0, 0.95, 0.8), uAccent, smoothstep(0.0, 0.6, t));
    size = 1.0 - k * 0.5;
  } else if (uStyle == 7) {   // confetti
    vec3 v0 = uUp * (420.0 + 320.0 * aRand.y) + uRight * r.x * 520.0 + uNormal * r.z * 320.0;
    disp = v0 * t - uUp * 0.5 * 1300.0 * t * t;
    col = mix(aColor, hue(aRand.x), smoothstep(0.0, 0.15, t));
    size = 1.4;
  } else {                    // 8: assemble — fly in and land on the glyphs
    float s = 1.0 - smoothstep(0.0, 1.0, k);
    disp = (r * 650.0 + uNormal * (300.0 + 400.0 * aRand.y)) * s * s;
    col = mix(aColor, uAccent, s);
  }

  vec4 mv = viewMatrix * vec4(position + disp, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp(uSize * size * uPixelRatio * uViewDist / max(-mv.z, 1.0), 0.0, 64.0);

  // Growing particles spread the same light over more area (stops additive pile-ups going white)
  float energy = 0.6 / max(1.0, size * size);
  vAlpha = energy * (uStyle == 8 ? smoothstep(0.0, 0.15, k) : 1.0 - smoothstep(0.35, 1.0, k));
  vColor = col;
  vSoft = soft;
}
