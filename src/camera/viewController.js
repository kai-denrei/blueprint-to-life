import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

/**
 * View controller.
 *
 * Two real cameras, not one camera with a swapped projection. Orthographic for the four
 * elevations (front / rear / starboard / plan), perspective for the iso and free views.
 *
 * Switching *within* a projection type eases the position and target. Switching *across*
 * projection types snaps and fires an `onCrossfade` callback, because interpolating between
 * an orthographic and a perspective projection matrix produces a matrix that is neither —
 * the intermediate frames are geometrically meaningless and read as a glitch. The UI covers
 * the snap with a short opacity fade instead.
 */

export const VIEWS = {
  iso:       { label: 'ISO',   projection: 'perspective', dir: [1.0, 0.62, 1.15], orbit: true },
  front:     { label: 'FRONT', projection: 'orthographic', dir: [0, 0, 1] },
  rear:      { label: 'REAR',  projection: 'orthographic', dir: [0, 0, -1] },
  side:      { label: 'SIDE',  projection: 'orthographic', dir: [1, 0, 0] },
  plan:      { label: 'PLAN',  projection: 'orthographic', dir: [0, 1, 0.0001] },
  free:      { label: 'FREE',  projection: 'perspective', dir: [1.3, 0.5, 1.0], orbit: true },
};

export class ViewController {
  /**
   * @param {HTMLElement} domElement  the element OrbitControls listens on
   * @param {object} opts  { target: [x,y,z], radius: number, onCrossfade: fn }
   */
  constructor(domElement, opts = {}) {
    this.target = new THREE.Vector3(...(opts.target || [0, 1.0, 0]));
    this.radius = opts.radius ?? 5.2;
    this.frameScale = 1;   // widened by the explode view, which needs far more room than the assembly
    this.onCrossfade = opts.onCrossfade || (() => {});
    this.aspect = 1;

    this.perspective = new THREE.PerspectiveCamera(34, 1, 0.5, 260);
    this.orthographic = new THREE.OrthographicCamera(-1, 1, 1, -1, -80, 260);

    this.controls = {
      perspective: new OrbitControls(this.perspective, domElement),
      orthographic: new OrbitControls(this.orthographic, domElement),
    };
    for (const c of Object.values(this.controls)) {
      c.enableDamping = true;
      c.dampingFactor = 0.08;
      c.target.copy(this.target);
      c.enabled = false;
    }
    this.controls.orthographic.enableRotate = false; // an elevation that can be rotated is not an elevation
    this.controls.perspective.minDistance = 4;
    this.controls.perspective.maxDistance = 40;

    this.viewKey = null;
    this.camera = this.perspective;
    this._ease = null;
    this.setView('iso', { immediate: true });
  }

  get view() { return VIEWS[this.viewKey]; }

  /**
   * Portrait compensation.
   *
   * Every frustum here is specified vertically — ortho by half-height, perspective by vertical
   * FOV — which is correct on a landscape screen where the vertical is the tight axis. On a
   * phone in portrait the tight axis is horizontal, so a 7-metre hull framed to the vertical
   * ends up cropped off both sides. Widening by 1/aspect puts the constraint back on the axis
   * that actually constrains.
   */
  _aspectFit() {
    if (this.aspect >= 1) return 1;
    // Capped, not a straight 1/aspect. The exact reciprocal fits the *vertical* extent into
    // the horizontal axis, which is more room than a vehicle roughly twice as long as it is
    // tall actually needs — it left the model floating in a third of the sheet on a phone.
    return Math.min(1 / this.aspect, 1.72);
  }

  setView(key, { immediate = false } = {}) {
    const view = VIEWS[key];
    if (!view) throw new Error(`unknown view: ${key}`);

    const next = view.projection === 'orthographic' ? this.orthographic : this.perspective;
    const crossing = this.camera !== next;

    const dir = new THREE.Vector3(...view.dir).normalize();
    const dist = view.projection === 'orthographic'
      ? 60
      : this.radius * 2.6 * this.frameScale * this._aspectFit();
    const position = this.target.clone().addScaledVector(dir, dist);

    this.viewKey = key;
    this.camera = next;

    for (const [name, c] of Object.entries(this.controls)) {
      const active = (name === view.projection);
      c.enabled = active && !!view.orbit;
      if (active) c.target.copy(this.target);
    }

    if (crossing || immediate) {
      next.position.copy(position);
      next.up.set(0, 1, 0);
      if (key === 'plan') next.up.set(0, 0, -1);
      next.lookAt(this.target);
      this._ease = null;
      if (crossing && !immediate) this.onCrossfade();
    } else {
      this._ease = { position, up: key === 'plan' ? new THREE.Vector3(0, 0, -1) : new THREE.Vector3(0, 1, 0), t: 0 };
    }
    this._applyOrthoFrustum();
    return this;
  }

  /**
   * Widen the framing. Explode pushes parts several metres off the hull, so the frame that
   * fits the assembled vehicle cuts half of them off. Ortho gets a wider frustum; perspective
   * gets dollied back along its current direction, which preserves the user's orbit angle but
   * does override a manual zoom — re-framing on an explicit mode change is the intent.
   */
  setFrameScale(k) {
    if (Math.abs(k - this.frameScale) < 0.001) return;
    this.frameScale = k;
    this._applyOrthoFrustum();
    const offset = this.perspective.position.clone().sub(this.target);
    if (offset.lengthSq() > 0) {
      this.perspective.position.copy(this.target).addScaledVector(
        offset.normalize(), this.radius * 2.6 * k * this._aspectFit(),
      );
    }
  }

  setSize(width, height) {
    const previousFit = this._aspectFit();
    this.aspect = width / height;
    this.perspective.aspect = this.aspect;
    this.perspective.updateProjectionMatrix();
    this._applyOrthoFrustum();
    // A rotation from landscape to portrait changes how much room the model needs, so the
    // perspective camera has to be re-dollied or the vehicle ends up half off-screen.
    const ratio = this._aspectFit() / previousFit;
    if (Math.abs(ratio - 1) > 0.001) {
      const offset = this.perspective.position.clone().sub(this.target);
      if (offset.lengthSq() > 0) this.perspective.position.copy(this.target).add(offset.multiplyScalar(ratio));
    }
  }

  update(dt) {
    if (this._ease) {
      const e = this._ease;
      e.t = Math.min(1, e.t + dt * 3.6);
      const k = 1 - Math.pow(1 - e.t, 3);   // ease-out cubic
      this.camera.position.lerp(e.position, k);
      this.camera.up.lerp(e.up, k).normalize();
      this.camera.lookAt(this.target);
      if (e.t >= 1) this._ease = null;
    }
    const c = this.controls[this.camera.isOrthographicCamera ? 'orthographic' : 'perspective'];
    if (c.enabled) c.update();
  }

  _applyOrthoFrustum() {
    // Each elevation frames a different extent, so one frustum cannot serve all four.
    // Front/rear see the narrow axis; plan sees the full hull *plus* the gun overhang, which
    // is why it needs the widest of the three — framing it like a side elevation cropped the
    // muzzle straight off the sheet.
    const key = this.viewKey;
    const base = key === 'plan' ? this.radius * 1.22
      : (key === 'front' || key === 'rear') ? this.radius * 0.62
      : this.radius * 0.86;
    const halfHeight = base * this.frameScale * this._aspectFit();
    const halfWidth = halfHeight * this.aspect;
    const o = this.orthographic;
    o.left = -halfWidth; o.right = halfWidth;
    o.top = halfHeight; o.bottom = -halfHeight;
    o.updateProjectionMatrix();
  }
}
