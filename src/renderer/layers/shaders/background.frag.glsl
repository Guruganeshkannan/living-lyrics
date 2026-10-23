precision highp float;

uniform float uTime;      // wall time
uniform float uFlow;      // speed-scaled accumulated time
uniform vec2 uRes;
uniform vec2 uView;       // camera yaw/pitch drift, so worlds shift as the camera turns
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
uniform float uChorus;
uniform int uModeA;
uniform int uModeB;
uniform float uModeMix;
uniform int uOctaves;

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
  for (int i = 0; i < 6; i++) {
    if (i >= uOctaves) break;
    v += a * noise(p);
    p = ROT * p * 2.02 + 3.1;
    a *= 0.5;
  }
  return v;
}

// ---------------- scenes ----------------

vec3 nebula(vec2 p, float t) {
  vec2 sp = (p + uView * 0.25) * uNoiseScale;
  vec2 q = vec2(fbm(sp + vec2(0.0, t * 0.30)), fbm(sp + vec2(5.2, 1.3) - t * 0.22));
  float w = uWarp * (1.0 + uBass * 0.9 * uPunch);
  vec2 r = vec2(fbm(sp + 4.0 * q * w + vec2(1.7, 9.2) + t * 0.15), fbm(sp + 4.0 * q * w + vec2(8.3, 2.8) - t * 0.12));
  float f = fbm(sp + 4.0 * r * w);
  vec3 col = mix(uBg0, uBg1, clamp(f * f * 2.4, 0.0, 1.0));
  float hot = smoothstep(0.35, 0.95, f) * clamp(length(q) * uAccentMix * (0.55 + uEnergy * 0.9), 0.0, 1.0);
  col = mix(col, uAccent, hot);
  col = mix(col, uAccent2, clamp(r.x * r.x * uAccentMix * 0.9, 0.0, 1.0) * (0.35 + uTreble * 0.9));
  return col * (0.5 + 0.95 * f * f + 0.4 * uEnergy);
}

vec3 aurora(vec2 p, float t) {
  p += uView * 0.2;
  vec3 col = mix(uBg0, uBg1 * 0.55, smoothstep(-0.7, 0.9, p.y));
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float wave = fbm(vec2(p.x * 1.1 + t * 0.12 * (1.0 + fi * 0.35) + fi * 3.0, fi * 7.0)) * 0.7 - 0.35;
    float y0 = -0.05 + fi * 0.16 + wave;
    float d = p.y - y0;
    // Sharp lower edge, long soft curtain rising above it
    // max(d, 0) matters: exp(-d*3.5) overflows below the band and 0 * inf = NaN (white pixels)
    float band = exp(-d * d * (40.0 + fi * 20.0)) + smoothstep(0.0, 0.02, d) * exp(-max(d, 0.0) * 3.5) * 0.45;
    float streak = 0.45 + 0.55 * noise(vec2(p.x * 28.0 + fi * 10.0, t * 0.6));
    vec3 c = i == 0 ? uAccent : (i == 1 ? uAccent2 : uGlow);
    col += c * band * streak * (0.3 + 0.55 * uEnergy) * (1.0 + uBeat * 0.5 * uPunch);
  }
  return col;
}

vec3 tunnel(vec2 p, float t) {
  vec2 q = p - uView * 0.35;
  float r = length(q);
  float a = atan(q.y, q.x);
  float z = 0.35 / (r + 0.02) + t * 2.2 * (1.0 + uBass * 0.8);
  float u = a / 6.2831;
  float tex = fbm(vec2(u * 8.0, z * 0.5));
  vec3 col = mix(uBg0, uBg1, tex);
  float ringLine = pow(1.0 - abs(fract(z * 0.6) * 2.0 - 1.0), 14.0);
  float spokes = pow(1.0 - abs(fract(u * 16.0 + z * 0.05) * 2.0 - 1.0), 10.0);
  col += uAccent * ringLine * (0.5 + uEnergy + uBeat * 0.6) + uAccent2 * spokes * 0.35 * (0.4 + uTreble);
  col *= smoothstep(0.0, 0.45, r);
  col += uGlow * exp(-r * 7.0) * (0.35 + uBeat * 0.8);
  float speedLine = step(0.988, hash(vec2(floor(u * 140.0), floor(z * 2.0)))) * smoothstep(0.08, 0.6, r);
  col += uGlow * speedLine * (0.6 + uEnergy);
  return col;
}

// Modern mesh gradient: big soft pools of colour drifting and breathing with the bass
vec3 liquid(vec2 p, float t) {
  p += uView * 0.2;
  // Slow domain warp so the pools flow like silk rather than orbiting circles
  p += 0.12 * vec2(noise(p * 1.3 + t * 0.2), noise(p * 1.3 - t * 0.17 + 4.0)) - 0.06;
  vec3 col = uBg0 * 0.9;
  vec3 tones[4];
  tones[0] = uBg1;
  tones[1] = uAccent;
  tones[2] = uAccent2;
  tones[3] = uGlow;
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    vec2 c = vec2(0.75 * sin(t * 0.21 * (1.0 + fi * 0.23) + fi * 1.9), 0.42 * cos(t * 0.17 * (1.0 + fi * 0.19) + fi * 2.7));
    float rad = 0.55 + 0.12 * sin(t * 0.3 + fi) + 0.1 * uBass * uPunch;
    float w = exp(-dot(p - c, p - c) / (rad * rad));
    col += tones[i] * w * (i == 0 ? 0.9 : 0.42 * uAccentMix * 1.5);
  }
  return col * (0.8 + 0.3 * uEnergy);
}

vec3 rainGlass(vec2 p, float t) {
  vec3 col = mix(uBg0, uBg1, 0.25 + 0.45 * fbm((p + uView * 0.15) * 1.4 + t * 0.03));
  // Out-of-focus city lights behind wet glass
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    vec2 g = (p + uView * (0.1 + fi * 0.08)) * (2.5 + fi * 1.8) + vec2(t * 0.015 * (fi + 1.0), fi * 3.1);
    vec2 id = floor(g);
    vec2 f = fract(g) - 0.5;
    float h = hash(id + fi * 7.0);
    vec2 off = (vec2(hash(id + 3.0), hash(id + 5.0)) - 0.5) * 0.6;
    float d = length(f - off);
    float b = smoothstep(0.42, 0.3, d) * step(0.5, h);
    col += mix(uAccent, uAccent2, hash(id + 9.0)) * b * (0.12 + 0.1 * uEnergy) * (0.6 + 0.4 * sin(uTime * 0.8 + h * 20.0));
  }
  // Droplets sliding down the glass
  vec2 g = p * vec2(9.0, 5.0);
  vec2 id = floor(g);
  vec2 f = fract(g) - 0.5;
  float h = hash(id);
  f.y += fract(h * 7.0 - uTime * (0.04 + h * 0.12)) - 0.5;
  float drop = smoothstep(0.09, 0.03, length(f * vec2(1.0, 0.7))) * step(0.45, h);
  col += drop * (uGlow * 0.35 + 0.12);
  return col;
}

vec3 inferno(vec2 p, float t) {
  vec2 q = p + uView * 0.15;
  q.y += 0.55;
  float n = fbm(vec2(q.x * 2.2, q.y * 1.4 - t * 1.6 * (1.0 + uBass * 0.6)));
  float n2 = fbm(vec2(q.x * 4.2, q.y * 2.8 - t * 3.0) + n * 1.5);
  float h = 1.0 - smoothstep(-0.1, 1.35, q.y);
  float fire = clamp((n * 0.7 + n2 * 0.55) * h * 1.9 - 0.42 + uEnergy * 0.25 + uBeat * 0.18 * uPunch, 0.0, 1.0);
  vec3 col = uBg0;
  col = mix(col, uBg1, smoothstep(0.0, 0.3, fire));
  col = mix(col, uAccent, smoothstep(0.25, 0.6, fire));
  col = mix(col, uAccent2, smoothstep(0.55, 0.85, fire));
  col = mix(col, vec3(1.0, 0.93, 0.75), smoothstep(0.88, 1.0, fire) * 0.7);
  // Sparks spiralling upward
  vec2 sg = vec2(p.x * 30.0, p.y * 12.0 - uTime * 4.0);
  vec2 sid = floor(sg);
  float sh = hash(sid);
  float spark = step(0.97, sh) * smoothstep(0.25, 0.0, length(fract(sg) - 0.5));
  col += uAccent2 * spark * (0.6 + uEnergy);
  return col;
}

vec3 synthwave(vec2 p, float t) {
  float horizon = -0.08 - uView.y * 0.12;
  vec2 sp = p - vec2(uView.x * 0.12, horizon + 0.3);
  float sd = length(sp);
  vec3 col = mix(uBg1, uBg0, smoothstep(horizon, 0.8, p.y));
  // Striped sun
  float sun = smoothstep(0.31, 0.3, sd) * step(0.0, sin(sp.y * 55.0 - t * 2.0) + (sp.y + 0.12) * 9.0);
  col = mix(col, mix(uAccent2, uAccent, smoothstep(-0.3, 0.3, sp.y)), sun);
  col += uAccent2 * exp(-sd * 3.5) * 0.3 * (0.6 + uBass);
  // Mountains
  float m = horizon + 0.03 + 0.09 * fbm(vec2((p.x + uView.x * 0.2) * 3.0, 1.0));
  if (p.y < m && p.y > horizon) col = mix(uBg0 * 0.6, uBg1 * 0.5, (p.y - horizon) / (m - horizon + 1e-3));
  // Neon floor grid racing toward us
  if (p.y < horizon) {
    float z = 0.22 / (horizon - p.y + 0.001);
    vec2 gg = vec2((p.x + uView.x * 0.3) * z, z + t * 1.6 * (1.0 + uBass * 0.6));
    vec2 gl = abs(fract(gg) - 0.5);
    float w = 0.02 + 0.015 * z;
    float grid = max(smoothstep(w, 0.0, 0.5 - gl.x), smoothstep(w, 0.0, 0.5 - gl.y));
    col = mix(uBg0, uBg1 * 0.35, 0.4) + uAccent * grid * exp(-z * 0.12) * (0.7 + uBeat * 0.9 * uPunch);
  }
  return col;
}

vec3 shards(vec2 p, float t) {
  vec2 q = (p + uView * 0.1) * (1.0 - uBeat * 0.07 * uPunch);
  float r = length(q);
  float a = atan(q.y, q.x) + t * 0.15;
  float seg = 6.2831 / 6.0;
  a = mod(a, seg);
  a = abs(a - seg * 0.5);
  q = r * vec2(cos(a), sin(a));
  // Crystalline Voronoi facets with lit edges
  vec2 g = q * 7.0 + vec2(t * 0.4, 0.0);
  vec2 id = floor(g);
  vec2 f = fract(g);
  float md = 8.0;
  float md2 = 8.0;
  vec2 mid = id;
  vec2 toC = vec2(0.0);
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 o = vec2(float(i), float(j));
      vec2 pnt = vec2(hash(id + o), hash(id + o + 17.0));
      pnt = 0.5 + 0.4 * sin(t * 0.6 + 6.2831 * pnt);
      vec2 v = o + pnt - f;
      float d = length(v);
      if (d < md) {
        md2 = md;
        md = d;
        mid = id + o;
        toC = v;
      } else if (d < md2) {
        md2 = d;
      }
    }
  }
  float cell = hash(mid);
  // Each facet is a tilted mirror: shade by its angle to a light that orbits with the beat
  vec2 light = vec2(cos(t * 0.7), sin(t * 0.7));
  float facet = 0.35 + 0.65 * clamp(dot(normalize(toC + 1e-4), light) * 0.5 + 0.5, 0.0, 1.0);
  vec3 col = mix(uBg0, uBg1, cell) * facet;
  col = mix(col, uAccent * facet, step(0.78, cell) * (0.45 + uEnergy * 0.5));
  col = mix(col, uAccent2, step(0.95, cell) * 0.8);
  float edge = 1.0 - smoothstep(0.0, 0.06, md2 - md);
  col += uGlow * edge * (0.25 + uBeat * 0.9 * uPunch) * (0.6 + 0.4 * sin(cell * 30.0 + t * 3.0));
  col *= 0.7 + 0.5 * exp(-r * 1.5);
  return col;
}

vec3 scene(int mode, vec2 p, float t) {
  if (mode == 1) return aurora(p, t);
  if (mode == 2) return tunnel(p, t);
  if (mode == 3) return liquid(p, t);
  if (mode == 4) return rainGlass(p, t);
  if (mode == 5) return inferno(p, t);
  if (mode == 6) return synthwave(p, t);
  if (mode == 7) return shards(p, t);
  return nebula(p, t);
}

void main() {
  vec2 p = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
  float t = uFlow;
  // The whole world "breathes in" on each kick
  p *= 1.0 - 0.05 * uBeat * uPunch;

  vec3 col = scene(uModeA, p, t);
  if (uModeMix > 0.001) col = mix(col, scene(uModeB, p, t), uModeMix);

  // Volumetric-ish rays from above
  vec2 rp = p - vec2(0.0, 0.95);
  float ang = atan(rp.x, -rp.y);
  float rays = pow(noise(vec2(ang * 9.0, t * 0.5)), 3.0) + 0.5 * pow(noise(vec2(ang * 23.0, -t * 0.7)), 4.0);
  col += uGlow * rays * smoothstep(1.9, 0.0, length(rp)) * uRays * (0.35 + 0.9 * uEnergy);

  // Shockwave ring from each beat
  float rad = length(p);
  float ringR = uBeatAge * (1.2 + 0.8 * uIntensity);
  float ring = exp(-abs(rad - ringR) * 24.0) * exp(-uBeatAge * 2.4);
  float ring2 = exp(-abs(rad - ringR * 0.6) * 40.0) * exp(-uBeatAge * 3.5);
  col += (uAccent * ring + uAccent2 * ring2 * 0.6) * uRings * (0.45 + 0.6 * uIntensity);

  // Twinkling stars
  vec2 sg = (p + uView * 0.05) * 70.0;
  float sh = hash(floor(sg));
  float star = step(0.982, sh) * smoothstep(0.12, 0.0, length(fract(sg) - 0.5));
  col += vec3(star * (0.4 + 0.6 * sin(uTime * (2.0 + sh * 4.0) + sh * 60.0))) * uStars * (0.6 + uTreble);

  // Rain sheets
  for (int i = 0; i < 2; i++) {
    float fi = float(i);
    vec2 g = p * vec2(55.0 + fi * 35.0, 1.6 + fi);
    g.y += uTime * (2.2 + fi * 1.3);
    float h = hash(vec2(floor(g.x), fi));
    float drop = fract(g.y + h * 13.0);
    float streak = smoothstep(0.0, 0.07, drop) * smoothstep(0.35, 0.07, drop) * smoothstep(0.5, 0.0, abs(fract(g.x) - 0.5)) * step(0.55, h);
    col += mix(uAccent2, vec3(1.0), 0.4) * streak * uRain * (0.16 - fi * 0.05);
  }

  // Ember glow from below
  col += uAccent2 * uEmbers * smoothstep(0.1, -0.75, p.y) * (0.5 + 0.5 * noise(vec2(p.x * 3.0, t * 1.5))) * (0.2 + 0.7 * uBass);

  col *= (1.0 + 0.07 * sin(uTime * 1.2) * uBreathe) * (1.0 + uChorus * 0.18);
  // Flash tints toward the scene's own light, never a white frame
  col += mix(uBg1, uGlow, 0.35) * uFlash * 0.5;

  // The world is a stage, never brighter than the lyrics: soft-knee luminance ceiling
  float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
  // Kept below the bloom threshold (0.65) so big bright regions never bloom into white;
  // bloom is reserved for particles and sparks
  float cap = 0.35 + 0.06 * uChorus;
  // Asymptotic: however hot a scene runs, it tops out around cap + 0.17 and keeps its hue
  if (lum > cap) col *= (cap + 0.17 * (1.0 - exp(-(lum - cap) * 3.0))) / lum;
  col = min(col, vec3(0.85));

  gl_FragColor = vec4(col, 1.0);
}
