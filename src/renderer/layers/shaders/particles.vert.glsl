attribute vec4 aSeed;

uniform float uTime;
uniform float uRise;       // accumulated vertical travel (drift * speed integrated in JS)
uniform float uSwirl;      // accumulated horizontal sway time
uniform float uSize;
uniform float uDensity;
uniform float uStreak;
uniform float uBeat;
uniform float uEnergy;
uniform float uPunch;
uniform float uPixelRatio;
uniform vec2 uRes;

varying float vAlpha;
varying float vMix;
varying float vStreak;

void main() {
  // position holds 3 randoms: x, y phase, depth
  float depth = position.z;
  float visible = step(aSeed.x, uDensity * (0.5 + 0.7 * uEnergy));

  float speed = 0.25 + depth * 0.9;
  float y = fract(position.y + uRise * speed * 0.12) * 2.4 - 1.2;
  float x = position.x * 2.4 - 1.2;
  x += sin(uSwirl * (0.4 + aSeed.y) + aSeed.z * 6.283) * 0.04 * (1.0 + depth);
  // Kicks push particles outward from the center
  x *= 1.0 + uBeat * uPunch * 0.04 * depth;

  gl_Position = vec4(x, y, 0.0, 1.0);

  float size = uSize * (3.0 + 16.0 * depth * depth) * (1.0 + uBeat * uPunch * 0.5) * (1.0 + uStreak * 2.0);
  gl_PointSize = size * uPixelRatio * (uRes.y / 1080.0);

  float twinkle = 0.65 + 0.35 * sin(uTime * (1.0 + aSeed.w * 3.0) + aSeed.y * 40.0);
  float edge = smoothstep(1.2, 0.9, abs(y));
  vAlpha = visible * twinkle * edge * (0.25 + 0.6 * depth) * (0.55 + 0.7 * uEnergy);
  vMix = aSeed.w;
  vStreak = uStreak;
}
