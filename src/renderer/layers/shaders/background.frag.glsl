precision highp float;

uniform float uTime;      // wall time
uniform float uFlow;      // speed-scaled accumulated time
uniform vec2 uRes;
uniform vec3 uBg0;
uniform vec3 uBg1;
uniform vec3 uAccent;
uniform vec3 uAccent2;
uniform vec3 uGlow;
uniform float uEnergy;
uniform float uBass;
uniform float uTreble;
uniform float uBeat;
uniform float uBeatAge;
uniform float uFlash;
uniform float uIntensity;
uniform float uWarp;
uniform float uNoiseScale;
uniform float uAccentMix;
uniform float uRays;
uniform float uRings;
uniform float uRain;
uniform float uStars;
uniform float uEmbers;
uniform float uBreathe;
uniform float uPunch;

varying vec2 vUv;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

const mat2 ROT = mat2(0.80, 0.60, -0.60, 0.80);

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p = ROT * p * 2.02 + 3.1;
    a *= 0.5;
  }
  return v;
}

void main() {
  vec2 p = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
  float t = uFlow;

  // The whole world "breathes in" on each kick
  p *= 1.0 - 0.05 * uBeat * uPunch;

  // Domain-warped fbm: q warps r, r warps the final field -> liquid smoke
  vec2 sp = p * uNoiseScale;
  vec2 q = vec2(fbm(sp + vec2(0.0, t * 0.30)), fbm(sp + vec2(5.2, 1.3) - t * 0.22));
  float w = uWarp * (1.0 + uBass * 0.9 * uPunch);
  vec2 r = vec2(fbm(sp + 4.0 * q * w + vec2(1.7, 9.2) + t * 0.15),
                fbm(sp + 4.0 * q * w + vec2(8.3, 2.8) - t * 0.12));
  float f = fbm(sp + 4.0 * r * w);

  vec3 col = mix(uBg0, uBg1, clamp(f * f * 2.4, 0.0, 1.0));
  float hot = smoothstep(0.35, 0.95, f) * clamp(length(q) * uAccentMix * (0.55 + uEnergy * 0.9), 0.0, 1.0);
  col = mix(col, uAccent, hot);
  col = mix(col, uAccent2, clamp(r.x * r.x * uAccentMix * 0.9, 0.0, 1.0) * (0.35 + uTreble * 0.9));
  col *= 0.5 + 0.95 * f * f + 0.4 * uEnergy;

  // Volumetric-ish rays from above
  vec2 rp = p - vec2(0.0, 0.95);
  float ang = atan(rp.x, -rp.y);
  float rays = pow(noise(vec2(ang * 9.0, t * 0.5)), 3.0) + 0.5 * pow(noise(vec2(ang * 23.0, -t * 0.7)), 4.0);
  rays *= smoothstep(1.9, 0.0, length(rp));
  col += uGlow * rays * uRays * (0.35 + 0.9 * uEnergy);

  // Shockwave ring from each beat
  float rad = length(p);
  float ringR = uBeatAge * (1.2 + 0.8 * uIntensity);
  float ring = exp(-abs(rad - ringR) * 24.0) * exp(-uBeatAge * 2.4);
  float ring2 = exp(-abs(rad - ringR * 0.6) * 40.0) * exp(-uBeatAge * 3.5);
  col += (uAccent * ring + uAccent2 * ring2 * 0.6) * uRings * (0.5 + 0.7 * uIntensity);

  // Twinkling stars
  vec2 sg = p * 70.0;
  float sh = hash(floor(sg));
  float star = step(0.982, sh) * smoothstep(0.12, 0.0, length(fract(sg) - 0.5));
  star *= 0.4 + 0.6 * sin(uTime * (2.0 + sh * 4.0) + sh * 60.0);
  col += vec3(star) * uStars * (0.6 + uTreble);

  // Rain sheets, two parallax layers
  for (int i = 0; i < 2; i++) {
    float fi = float(i);
    vec2 g = p * vec2(55.0 + fi * 35.0, 1.6 + fi);
    g.y += uTime * (2.2 + fi * 1.3);
    float id = floor(g.x);
    float h = hash(vec2(id, fi));
    float drop = fract(g.y + h * 13.0);
    float streak = smoothstep(0.0, 0.07, drop) * smoothstep(0.35, 0.07, drop);
    streak *= smoothstep(0.5, 0.0, abs(fract(g.x) - 0.5)) * step(0.55, h);
    col += mix(uAccent2, vec3(1.0), 0.4) * streak * uRain * (0.18 - fi * 0.06);
  }

  // Ember glow rising from below, flickering with the bass
  float floorGlow = smoothstep(0.1, -0.75, p.y) * (0.5 + 0.5 * noise(vec2(p.x * 3.0, t * 1.5)));
  col += uAccent2 * uEmbers * floorGlow * (0.2 + 0.7 * uBass);

  col *= 1.0 + 0.07 * sin(uTime * 1.2) * uBreathe;
  col += uGlow * uFlash * 0.45;

  gl_FragColor = vec4(col, 1.0);
}
