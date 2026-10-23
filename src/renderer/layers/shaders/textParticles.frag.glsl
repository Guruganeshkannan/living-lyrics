precision highp float;

varying float vAlpha;
varying vec3 vColor;
varying float vSoft;

void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  if (d > 1.0) discard;
  float core = mix(1.0 - smoothstep(0.55, 1.0, d), 1.0 - d * d, vSoft);
  float a = core * vAlpha;
  gl_FragColor = vec4(vColor * a, a);
}
