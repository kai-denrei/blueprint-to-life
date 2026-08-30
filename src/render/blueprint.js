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

  uniform vec3  uPaper;
  uniform vec3  uGridMinor;
  uniform vec3  uGridMajor;
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

  // Screen-space grid paper. Deliberately not scene geometry: it must not receive the
  // outline filter, and it must not move when the camera does.
  vec3 gridPaper(vec2 fragPx) {
    vec2 p = fragPx / uPixelRatio;
    float minorPitch = 14.0;
    float majorPitch = 84.0;

    vec2 mi = abs(fract(p / minorPitch) - 0.5) * minorPitch;
    float minorLine = 1.0 - smoothstep(0.0, 0.9, min(mi.x, mi.y));

    vec2 ma = abs(fract(p / majorPitch) - 0.5) * majorPitch;
    float majorLine = 1.0 - smoothstep(0.0, 1.1, min(ma.x, ma.y));

    vec3 c = mix(uPaper, uGridMinor, minorLine * 0.55);
    c = mix(c, uGridMajor, majorLine * 0.75);

    // Very slight corner falloff so a large viewport doesn't read as flat colour.
    vec2 q = vUv - 0.5;
    c *= 1.0 - dot(q, q) * 0.16;
    return c;
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
    vec3 paper = gridPaper(gl_FragCoord.xy);
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

export const BLUEPRINT_PALETTE = {
  paper:     0xe8eef6,
  gridMinor: 0xc2d2e6,
  gridMajor: 0x9fb6d2,
  inkLight:  0xa8bed8,
  inkDark:   0x53749c,
  outline:   0x14314f,
  accent:    0xd06a2a,
  glow:      0x8b46c9,
  glow2:     0x1f8fd0,
  glow3:     0x25b463,
  glow4:     0xd8442f,
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
        uGridMinor: { value: new THREE.Color(this.palette.gridMinor) },
        uGridMajor: { value: new THREE.Color(this.palette.gridMajor) },
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

  render(scene, camera) {
    const r = this.renderer;
    const prevOverride = scene.overrideMaterial;
    const prevBackground = scene.background;

    scene.overrideMaterial = this.gbufferMaterial;
    scene.background = null;
    r.setRenderTarget(this.target);
    r.setClearColor(0x000000, 0);
    r.clear(true, true, false);
    r.render(scene, camera);

    scene.overrideMaterial = prevOverride;
    scene.background = prevBackground;

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
