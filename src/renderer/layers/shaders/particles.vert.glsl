// Ambient particles living in world space around the camera (infinite wrapped box)
attribute vec4 aSeed;

uniform float uTime;
uniform float uBox;
uniform vec3 uCam;
uniform vec3 uDrift;       // accumulated drift offset (world units)
uniform float uSwirl;
uniform float uSize;
uniform float uDensity;
uniform float uStreak;
uniform float uBeat;
uniform float uEnergy;
uniform float uPunch;
uniform float uPixelRatio;
uniform float uViewDist;

varying float vAlpha;
varying float vMix;
varying float vStreak;

void main() {
  float visible = step(aSeed.x, uDensity * (0.5 + 0.7 * uEnergy));
  vec3 wp = position * uBox + uDrift * (0.5 + aSeed.y);
  wp.x += sin(uSwirl * (0.4 + aSeed.y) + aSeed.z * 6.283) * 40.0;
  wp.y += cos(uSwirl * (0.3 + aSeed.w) + aSeed.x * 6.283) * 25.0;
  // Wrap into a box centred on the camera, so the field never runs out
  wp = mod(wp - uCam, uBox) - uBox * 0.5 + uCam;

  vec4 mv = viewMatrix * vec4(wp, 1.0);
  gl_Position = projectionMatrix * mv;
  float dist = -mv.z;

  float size = uSize * (2.5 + 7.0 * aSeed.z * aSeed.z) * (1.0 + uBeat * uPunch * 0.6) * (1.0 + uStreak * 2.0);
  gl_PointSize = clamp(size * uPixelRatio * uViewDist / max(dist, 1.0), 0.0, 44.0);

  float twinkle = 0.65 + 0.35 * sin(uTime * (1.0 + aSeed.w * 3.0) + aSeed.y * 40.0);
  // Fade in from the far wall and out well before the lens (no giant blobs over the text)
  float depthFade = smoothstep(uBox * 0.5, uBox * 0.3, dist) * smoothstep(250.0, 650.0, dist);
  vAlpha = 0.6 * visible * twinkle * depthFade * (0.35 + 0.65 * aSeed.z) * (0.55 + 0.7 * uEnergy) * step(0.0, dist);
  // Huge out-of-focus sprites read as blobs over the lyrics: keep them faint
  vAlpha *= 1.0 - 0.75 * smoothstep(16.0, 44.0, gl_PointSize / uPixelRatio);
  vMix = aSeed.w;
  vStreak = uStreak;
}
