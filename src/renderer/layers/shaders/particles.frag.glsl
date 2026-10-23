precision highp float;

uniform vec3 uAccent;
uniform vec3 uAccent2;
uniform float uSharp;

varying float vAlpha;
varying float vMix;
varying float vStreak;

void main() {
  vec2 c = gl_PointCoord - 0.5;
  // Rain: squeeze horizontally so the sprite becomes a falling streak
  c.x *= 1.0 + vStreak * 9.0;
  float d = length(c) * 2.0;
  if (d > 1.0) discard;
  // Bokeh disc with a slightly brighter rim vs. a hot spark core
  float bokeh = smoothstep(1.0, 0.82, d) * 0.55 + smoothstep(0.95, 0.0, d) * 0.35;
  float spark = pow(1.0 - d, 3.5) * 1.6;
  float a = mix(bokeh, spark, uSharp) * vAlpha;
  vec3 col = mix(uAccent, uAccent2, vMix);
  col = mix(col, vec3(1.0), pow(1.0 - d, 6.0) * 0.6);
  gl_FragColor = vec4(col * a, a);
}
