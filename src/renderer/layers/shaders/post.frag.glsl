precision highp float;

uniform sampler2D tDiffuse;
uniform float uTime;
uniform vec2 uRes;
uniform vec2 uShake;
uniform float uAberration;
uniform float uGlitch;
uniform float uGrain;
uniform float uVignette;
uniform float uZoom;

varying vec2 vUv;

float hash(vec2 p) {
  p = fract(p * vec2(443.897, 441.423));
  p += dot(p, p.yx + 19.19);
  return fract((p.x + p.y) * p.x);
}

void main() {
  vec2 uv = (vUv - 0.5) / uZoom + 0.5 + uShake;

  // Glitch: tear random horizontal bands sideways
  float frame = floor(uTime * 24.0);
  float band = floor(uv.y * 18.0);
  float tear = step(1.0 - uGlitch * 0.4, hash(vec2(band, frame))) * uGlitch;
  uv.x += (hash(vec2(band * 1.7, frame)) - 0.5) * 0.18 * tear;
  float block = step(0.985 - uGlitch * 0.05, hash(floor(uv * vec2(14.0, 9.0)) + frame)) * uGlitch;
  uv += (vec2(hash(vec2(frame, 3.0)), hash(vec2(frame, 7.0))) - 0.5) * 0.06 * block;

  // Chromatic aberration grows toward the edges
  vec2 dir = uv - 0.5;
  float ca = uAberration * 0.014 * (0.3 + length(dir) * 1.6) + tear * 0.01;
  vec3 col;
  col.r = texture2D(tDiffuse, uv + dir * ca).r;
  col.g = texture2D(tDiffuse, uv).g;
  col.b = texture2D(tDiffuse, uv - dir * ca).b;

  col *= 1.0 - uVignette * 0.6 * dot(dir, dir) * 2.0;
  col += (hash(vUv * uRes + fract(uTime) * 100.0) - 0.5) * uGrain;
  // Gentle filmic shoulder so bloom never clips harshly
  col = col / (1.0 + col * 0.25);

  gl_FragColor = vec4(col, 1.0);
}
