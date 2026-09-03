import * as THREE from 'three';

/**
 * Blueprint display mode.
 *
 * One scene pass into a two-attachment MRT target (+ depth texture), then one fullscreen
 * composite. That is the whole pipeline — no EffectComposer, because there is exactly one
 * effect and ping-ponging buys nothing.
 *
 *   attachment 0  gNormalId : view normal (rgb) + part id (a)
 *   attachment 1  gInk      : flat banded fill, the "printed" body of each part
 *   depthTexture            : silhouette and occlusion edges
 *
 * The outline is a discontinuity filter over all three. Depth alone misses coplanar plates;
 * normals alone miss two parts that happen to face the same way; the part id closes both gaps.
 * Per-mesh wireframe was never on the table — it draws every triangle edge, which is a function
 * of mesh density rather than of what the eye reads as an edge.
 *
 * The PAPER is the Fable Cabinet's "gridline" (onkochishin/atelier/gridline, MIT, after
 * pulkitxm/claude-directory): a deep-navy blueprint grid under a four-point mesh gradient,
 * ASCII glyphs stamped on the major intersections, a slow scroll, grain and an ordered dither.
 * It became the project's identity on 2026-09-03, and the ink flipped with it: light lines on
 * navy, the way a blueprint actually is. Drawn inside the composite, in screen space, so it
 * never receives the outline filter and never moves with the camera. Two things the operator
 * asked for are kept as switches: the scroll can be frozen (uTime simply stops advancing), and
 * the paper can be PLAIN — one flat colour — for checking a model against nothing.
 *
 * This module imports nothing from src/tank/. It renders whatever scene it is handed.
 */

const GBUFFER_VERT = /* glsl */`
  attribute float partId;
  attribute float emissive;
  out vec3 vNormalView;
  out float vPartId;
  out float vEmissive;

  void main() {
    #ifdef USE_INSTANCING
      mat4 im = instanceMatrix;
    #else
      mat4 im = mat4(1.0);
    #endif
    vPartId = partId;
    vEmissive = emissive;
    vNormalView = normalize(normalMatrix * mat3(im) * normal);
    vec4 mv = modelViewMatrix * im * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
  }
`;

const GBUFFER_FRAG = /* glsl */`
  precision highp float;
  in vec3 vNormalView;
  in float vPartId;
  in float vEmissive;

  uniform vec3 uInkLight;
  uniform vec3 uInkDark;
  uniform vec3 uLightDir;   // view space

  layout(location = 0) out vec4 gNormalId;
  layout(location = 1) out vec4 gInk;

  void main() {
    vec3 n = normalize(vNormalView);
    if (!gl_FrontFacing) n = -n;

    // Part id is quantised into a byte. 255 distinct parts is well past what this asset needs;
    // if it ever isn't, this becomes two channels, not a bigger float.
    gNormalId = vec4(n * 0.5 + 0.5, mod(vPartId, 255.0) / 255.0);

    // Banded flat fill: a schematic reads as drawn, not lit, so the ramp is stepped hard.
    float nl = clamp(dot(n, normalize(uLightDir)) * 0.5 + 0.5, 0.0, 1.0);
    float band = floor(nl * 4.0) / 3.0;

    // Alpha carries which accent channel this part is on, scaled so the halffloat target holds
    // it cleanly. gInk.rgb is the printed body of the part and gNormalId is fully spoken for,
    // so this rides in the one channel nothing else wanted.
    gInk = vec4(mix(uInkDark, uInkLight, clamp(band, 0.0, 1.0)), vEmissive * 0.25);
  }
`;

const COMPOSITE_VERT = /* glsl */`
  out vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const COMPOSITE_FRAG = /* glsl */`
  precision highp float;
  in vec2 vUv;

  uniform sampler2D tNormalId;
  uniform sampler2D tInk;
  uniform sampler2D tDepth;
  uniform vec2  uResolution;
  uniform float uNear;
  uniform float uFar;
  uniform float uOrtho;        // 1.0 when the camera is orthographic
  uniform float uPixelRatio;

  uniform vec3  uPaper;        // the PLAIN paper, and the gridline's ground
  uniform float uPaperMode;    // 0 = gridline, 1 = plain
  uniform float uTime;         // the host advances it only while MOTION is on
  uniform float uGridScale;    // gridline faders, the demo's names
  uniform float uMajorStep;
  uniform float uScrollSpeed;
  uniform float uMeshAmt;
  uniform float uAsciiAmt;
  uniform float uAsciiScale;
  uniform float uVignetteAmt;
  uniform float uNoiseAmt;
  uniform vec3  uOutline;
  uniform float uFillOpacity;
  uniform float uDepthWeight;
  uniform float uNormalWeight;
  uniform float uOutlineWidth;
  uniform float uHighlightId;   // -1 when nothing is highlighted
  uniform vec3  uAccent;
  uniform vec3  uGlow;        // accent channel 1
  uniform vec3  uGlow2;       // accent channel 2
  uniform vec3  uGlow3;       // accent channel 3
  uniform vec3  uGlow4;       // accent channel 4

  out vec4 fragColor;

  float viewZ(vec2 uv) {
    float d = texture(tDepth, uv).x;
    if (d >= 1.0) return uFar;
    float persp = (2.0 * uNear * uFar) / (uFar + uNear - (d * 2.0 - 1.0) * (uFar - uNear));
    float ortho = uNear + d * (uFar - uNear);
    return mix(persp, ortho, uOrtho);
  }

  // ---- THE PAPER: gridline, ported from the Cabinet's atelier/gridline ------------------
  // Screen space on purpose: it must not receive the outline filter, and it must not move
  // when the camera does. Constants and function bodies are the demo's; only the entry
  // point changed (fragment px in, colour out) so a re-port stays mechanical.
  const float THIN_WIDTH   = 0.010;
  const float MAJOR_WIDTH  = 0.018;
  const float DITHER_DARK  = 0.010;
  const float DITHER_LIGHT = 0.004;
  const float ASCII_EVERY  = 2.0;

  float bayer4(vec2 p) {
    ivec2 ip = ivec2(int(mod(p.x, 4.0)), int(mod(p.y, 4.0)));
    int idx = ip.y * 4 + ip.x;
    int m[16]; m[0]=0;m[1]=8;m[2]=2;m[3]=10;m[4]=12;m[5]=4;m[6]=14;m[7]=6;
    m[8]=3;m[9]=11;m[10]=1;m[11]=9;m[12]=15;m[13]=7;m[14]=13;m[15]=5;
    return float(m[idx]) / 15.0;
  }
  float hash21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    float a = hash21(i), b = hash21(i + vec2(1, 0)), c = hash21(i + vec2(0, 1)), d = hash21(i + vec2(1, 1));
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }
  float gridLineAA(vec2 uv, float scale, float width) {
    vec2 g = abs(fract(uv * scale) - 0.5);
    float d = min(g.x, g.y);
    float aa = fwidth(d);
    return 1.0 - smoothstep(width, width + aa, d);
  }
  float majorGridAA(vec2 uv, float scale, float stepN, float width) {
    return gridLineAA(uv, max(1.0, scale / stepN), width);
  }
  vec3 meshGradient(vec2 uv) {
    vec2 p0 = vec2(-0.70, -0.45), p1 = vec2(0.75, -0.35), p2 = vec2(-0.65, 0.65), p3 = vec2(0.80, 0.55);
    vec3 c0 = vec3(0.05, 0.10, 0.26), c1 = vec3(0.08, 0.16, 0.36), c2 = vec3(0.03, 0.09, 0.22), c3 = vec3(0.10, 0.20, 0.40);
    float e = 2.0;
    float w0 = pow(1.0 / (0.2 + distance(uv, p0)), e), w1 = pow(1.0 / (0.2 + distance(uv, p1)), e);
    float w2 = pow(1.0 / (0.2 + distance(uv, p2)), e), w3 = pow(1.0 / (0.2 + distance(uv, p3)), e);
    return (c0 * w0 + c1 * w1 + c2 * w2 + c3 * w3) / (w0 + w1 + w2 + w3);
  }
  float sdLineX(vec2 p, float w) { return 1.0 - smoothstep(w, w + fwidth(p.y), abs(p.y)); }
  float sdLineY(vec2 p, float w) { return 1.0 - smoothstep(w, w + fwidth(p.x), abs(p.x)); }
  float sdDiag1(vec2 p, float w) { float d = abs(p.x + p.y) / sqrt(2.0); return 1.0 - smoothstep(w, w + fwidth(d), d); }
  float sdDiag2(vec2 p, float w) { float d = abs(p.x - p.y) / sqrt(2.0); return 1.0 - smoothstep(w, w + fwidth(d), d); }
  float sdDot(vec2 p, float r) { float d = length(p); return 1.0 - smoothstep(r, r + fwidth(d), d); }
  float asciiGlyph(vec2 p, float level) {
    float w = 0.11, r = 0.10;
    float g0 = sdDot(p, r), g1 = sdLineX(p, w), g2 = sdLineY(p, w), g3 = max(sdLineX(p, w), sdLineY(p, w)),
          g4 = sdDiag1(p, w), g5 = sdDiag2(p, w), g6 = max(sdDiag1(p, w), sdDiag2(p, w)),
          g7 = max(sdLineX(p, w), max(sdLineY(p, w), g6));
    float m = 0.0;
    m = mix(m, g0, smoothstep(0.00, 0.12, level) * (1.0 - step(level, 0.12)));
    m = mix(m, g1, smoothstep(0.12, 0.28, level) * (1.0 - step(level, 0.28)));
    m = mix(m, g2, smoothstep(0.28, 0.44, level) * (1.0 - step(level, 0.44)));
    m = mix(m, g3, smoothstep(0.44, 0.60, level) * (1.0 - step(level, 0.60)));
    m = mix(m, g4, smoothstep(0.60, 0.72, level) * (1.0 - step(level, 0.72)));
    m = mix(m, g5, smoothstep(0.72, 0.84, level) * (1.0 - step(level, 0.84)));
    m = mix(m, g6, smoothstep(0.84, 0.94, level) * (1.0 - step(level, 0.94)));
    m = mix(m, g7, smoothstep(0.94, 1.00, level));
    return clamp(m, 0.0, 1.0);
  }
  vec3 gridlinePaper(vec2 fragPx) {
    vec2 R = uResolution;
    float t = uTime;
    vec2 uv = (fragPx - 0.5 * R) / max(R.y, 1.0);

    vec3 baseDeep = vec3(0.03, 0.06, 0.12);
    vec3 baseTint = vec3(0.05, 0.09, 0.18);
    float vgrad = smoothstep(-0.92, 0.55, -uv.y);
    vec3 bg = mix(baseDeep, baseTint, vgrad);
    bg = mix(bg, meshGradient(uv), uMeshAmt);
    float vig = 1.0 - uVignetteAmt * length(uv);
    bg *= clamp(vig, 0.0, 1.0);

    vec2 scrollDir = normalize(vec2(1.0, -0.55));
    vec2 uvAnim = uv + uScrollSpeed * t * scrollDir;
    float thin = gridLineAA(uvAnim, uGridScale, THIN_WIDTH);
    float major = majorGridAA(uvAnim, uGridScale, uMajorStep, MAJOR_WIDTH);
    vec3 col = bg + vec3(0.58, 0.66, 0.95) * thin * 0.25 + vec3(0.78, 0.84, 1.00) * major * 0.52;

    vec2 idx = floor(uvAnim * (uGridScale / uMajorStep) + 0.5);
    float selX = 1.0 - step(0.001, abs(fract(idx.x / ASCII_EVERY)));
    float selY = 1.0 - step(0.001, abs(fract(idx.y / ASCII_EVERY)));
    if (uAsciiAmt > 0.001) {
      vec2 cellF = fract(uv * uAsciiScale) - 0.5;
      float lvl = clamp(dot(col, vec3(0.2126, 0.7152, 0.0722)), 0.0, 1.0);
      float glyph = asciiGlyph(cellF, lvl);
      vec3 asciiColor = mix(vec3(0.50, 0.70, 1.0), meshGradient(uv), 0.25);
      col = mix(col, col + asciiColor * glyph * 0.30, uAsciiAmt * max(selX, selY) * major);
    }
    float n = vnoise(fragPx * 0.6 + vec2(t * 12.0, -t * 9.0));
    col += (n - 0.5) * uNoiseAmt;
    float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
    col += (bayer4(fragPx) - 0.5) * mix(DITHER_DARK, DITHER_LIGHT, luma);
    return tanh(col);
  }

  void main() {
    vec2 texel = 1.0 / uResolution;
    vec2 o = texel * uOutlineWidth;

    float zC = viewZ(vUv);
    vec4 nC = texture(tNormalId, vUv);
    vec3 normC = nC.xyz * 2.0 - 1.0;

    // Sobel over linear depth, plus max normal divergence and a hard part-id break.
    float gx = 0.0, gy = 0.0;
    float normalEdge = 0.0;
    float idEdge = 0.0;
    const float kx[9] = float[9](-1.0, 0.0, 1.0, -2.0, 0.0, 2.0, -1.0, 0.0, 1.0);
    const float ky[9] = float[9](-1.0, -2.0, -1.0, 0.0, 0.0, 0.0, 1.0, 2.0, 1.0);

    for (int i = 0; i < 9; i++) {
      vec2 d = vec2(float(i % 3) - 1.0, float(i / 3) - 1.0) * o;
      vec2 uv = clamp(vUv + d, vec2(0.0), vec2(1.0));
      float z = viewZ(uv);
      gx += z * kx[i];
      gy += z * ky[i];

      vec4 s = texture(tNormalId, uv);
      normalEdge = max(normalEdge, 1.0 - dot(normalize(s.xyz * 2.0 - 1.0), normalize(normC)));
      idEdge = max(idEdge, step(0.002, abs(s.a - nC.a)));
    }

    // Normalise the depth gradient by distance so a far part outlines as crisply as a near one.
    float depthEdge = length(vec2(gx, gy)) / (zC * 0.35 + 1.0);

    float edge = clamp(max(
      max(depthEdge * uDepthWeight, normalEdge * uNormalWeight),
      idEdge
    ), 0.0, 1.0);
    edge = smoothstep(0.22, 0.65, edge);

    bool hasGeo = texture(tDepth, vUv).x < 1.0;
    vec3 paper = uPaperMode > 0.5 ? uPaper : gridlinePaper(gl_FragCoord.xy);
    vec3 col = paper;
    vec4 ink = texture(tInk, vUv);
    if (hasGeo) {
      col = mix(paper, ink.rgb, uFillOpacity);
      // Powered elements print in an accent hue. A deliberate exception to the
      // two-blues-and-paper restraint: on a schematic "this part is energised" is a category of
      // information, not decoration, and it is the one thing a blue-on-blue fill cannot say.
      // Two channels, so a vehicle can distinguish its systems — or simply have its own accent.
      //
      // FOUR channels, and four is the ceiling rather than a round number. The channel travels
      // as emissive * 0.25 in an 8-bit alpha, so 1..4 land on 64, 128, 191 and 255 and come
      // back exactly; a fifth would encode as 1.25, clamp to 1.0 and read as channel 4. The
      // encoding was sized for four by accident of that 0.25, and EMISSIVE_MAX in
      // src/lib/parts.js is where that limit is asserted rather than discovered.
      //
      // (No backticks in here: this whole shader is a template literal, and a stray one ends
      // the string with a syntax error a hundred lines away from the comment that caused it.)
      int chan = int(floor(ink.a * 4.0 + 0.5));
      if (chan == 1) col = mix(col, uGlow, 0.82);
      else if (chan == 2) col = mix(col, uGlow2, 0.82);
      else if (chan == 3) col = mix(col, uGlow3, 0.82);
      else if (chan >= 4) col = mix(col, uGlow4, 0.82);
    }
    // Legend hover highlight. Resolved from the part-id channel, so it costs nothing at the
    // asset end: no per-mesh material swap, no second draw.
    if (hasGeo && uHighlightId >= 0.0) {
      float id = floor(nC.a * 255.0 + 0.5);
      if (abs(id - uHighlightId) < 0.5) col = mix(col, uAccent, 0.55);
    }

    col = mix(col, uOutline, edge);

    fragColor = vec4(col, 1.0);
  }
`;

// LIGHT ON NAVY. The palette flipped with the paper: the outline is the brightest thing on
// the sheet and the fills sit between the ground and the line, which is how a blueprint
// reads. `paper` is the PLAIN sheet and the gridline's darkest ground; there is no grid
// colour here any more because the gridline carries its own.
export const BLUEPRINT_PALETTE = {
  paper:     0x0b1526,
  inkLight:  0x7fa3d6,
  inkDark:   0x22406b,
  outline:   0xe8f1ff,
  accent:    0xf2903f,
  glow:      0xb07cff,
  glow2:     0x3fb3ff,
  glow3:     0x3ddc84,
  glow4:     0xff5f4f,
};

// The gridline's faders. The demo's defaults are 18 / 4 / 0.02 / 0.85 / 0.23 / 26 / 0.28 /
// 0.03; the sheet under a drawing wants a finer pitch than a sheet that IS the picture —
// at 18 the major lines were as bold as the model's own outline — so the grid is 26 cells
// tall with a major every 5. Everything else is the demo's. `set()` changes any live.
export const GRIDLINE_DEFAULTS = {
  uGridScale: 26, uMajorStep: 5, uScrollSpeed: 0.02, uMeshAmt: 0.85,
  uAsciiAmt: 0.23, uAsciiScale: 26, uVignetteAmt: 0.28, uNoiseAmt: 0.03,
};

export class BlueprintRenderer {
  constructor(renderer, opts = {}) {
    this.renderer = renderer;
    this.palette = { ...BLUEPRINT_PALETTE, ...(opts.palette || {}) };
    this.enabled = true;

    const size = renderer.getDrawingBufferSize(new THREE.Vector2());

    this.target = new THREE.WebGLRenderTarget(size.x, size.y, {
      count: 2,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      type: THREE.HalfFloatType,
      depthBuffer: true,
    });
    this.target.depthTexture = new THREE.DepthTexture(size.x, size.y);
    this.target.depthTexture.type = THREE.UnsignedIntType;
    this.target.textures[0].name = 'gNormalId';
    this.target.textures[1].name = 'gInk';

    this.gbufferMaterial = new THREE.ShaderMaterial({
      name: 'BlueprintGBuffer',
      glslVersion: THREE.GLSL3,
      vertexShader: GBUFFER_VERT,
      fragmentShader: GBUFFER_FRAG,
      side: THREE.DoubleSide,
      uniforms: {
        uInkLight: { value: new THREE.Color(this.palette.inkLight) },
        uInkDark: { value: new THREE.Color(this.palette.inkDark) },
        uLightDir: { value: new THREE.Vector3(0.35, 0.72, 0.60).normalize() },
      },
    });

    this.compositeMaterial = new THREE.ShaderMaterial({
      name: 'BlueprintComposite',
      glslVersion: THREE.GLSL3,
      vertexShader: COMPOSITE_VERT,
      fragmentShader: COMPOSITE_FRAG,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        tNormalId: { value: this.target.textures[0] },
        tInk: { value: this.target.textures[1] },
        tDepth: { value: this.target.depthTexture },
        uResolution: { value: new THREE.Vector2(size.x, size.y) },
        uNear: { value: 0.1 },
        uFar: { value: 100 },
        uOrtho: { value: 0 },
        uPixelRatio: { value: renderer.getPixelRatio() },
        uPaper: { value: new THREE.Color(this.palette.paper) },
        uPaperMode: { value: 0 },
        uTime: { value: 0 },
        ...Object.fromEntries(Object.entries(GRIDLINE_DEFAULTS).map(([k, v]) => [k, { value: v }])),
        uOutline: { value: new THREE.Color(this.palette.outline) },
        uFillOpacity: { value: 0.88 },
        uDepthWeight: { value: 0.55 },
        uNormalWeight: { value: 0.85 },
        uOutlineWidth: { value: 1.0 },
        uHighlightId: { value: -1 },
        uAccent: { value: new THREE.Color(this.palette.accent) },
        uGlow: { value: new THREE.Color(this.palette.glow) },
        uGlow2: { value: new THREE.Color(this.palette.glow2) },
        uGlow3: { value: new THREE.Color(this.palette.glow3) },
        uGlow4: { value: new THREE.Color(this.palette.glow4) },
      },
    });

    this.quadScene = new THREE.Scene();
    this.quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quadScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.compositeMaterial));
  }

  setSize(width, height, pixelRatio) {
    const w = Math.max(1, Math.floor(width * pixelRatio));
    const h = Math.max(1, Math.floor(height * pixelRatio));
    this.target.setSize(w, h);
    this.compositeMaterial.uniforms.uResolution.value.set(w, h);
    this.compositeMaterial.uniforms.uPixelRatio.value = pixelRatio;
  }

  /** Tunables the UI exposes. */
  set(name, value) {
    const u = this.compositeMaterial.uniforms[name];
    if (u) u.value = value;
  }

  /** The paper: 'gridline' or 'plain'. */
  setPaper(mode) {
    this.compositeMaterial.uniforms.uPaperMode.value = mode === 'plain' ? 1 : 0;
  }

  /**
   * @param {number} [time]  seconds, for the gridline's scroll and grain. The host owns the
   *   clock so that MOTION OFF is simply a clock that does not advance — nothing here knows
   *   whether the sheet is moving.
   */
  render(scene, camera, time = 0) {
    const r = this.renderer;
    this.compositeMaterial.uniforms.uTime.value = time;
    const prevOverride = scene.overrideMaterial;
    const prevBackground = scene.background;

    // Line primitives are somebody else's outline — a game export carries its edges as glTF
    // LINES — and this pass derives its own from depth, normal and id. Drawing them into the
    // G-buffer would put a normal-less sliver of geometry over every edge it was about to find.
    // Hidden for the pass and restored after it: the asset is not touched, only not looked at.
    const lines = [];
    scene.traverse((o) => { if ((o.isLine || o.isLineSegments) && o.visible) lines.push(o); });
    for (const l of lines) l.visible = false;

    scene.overrideMaterial = this.gbufferMaterial;
    scene.background = null;
    r.setRenderTarget(this.target);
    r.setClearColor(0x000000, 0);
    r.clear(true, true, false);
    r.render(scene, camera);

    scene.overrideMaterial = prevOverride;
    scene.background = prevBackground;
    for (const l of lines) l.visible = true;

    const u = this.compositeMaterial.uniforms;
    u.uNear.value = camera.near;
    u.uFar.value = camera.far;
    u.uOrtho.value = camera.isOrthographicCamera ? 1 : 0;

    r.setRenderTarget(null);
    r.render(this.quadScene, this.quadCamera);
  }

  dispose() {
    this.target.dispose();
    this.gbufferMaterial.dispose();
    this.compositeMaterial.dispose();
  }
}
