import * as THREE from 'three';
import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';

/**
 * Schematic chrome: title block, key-to-items legend, instrumentation panel, view/mode controls
 * and numbered leader-line callouts.
 *
 * All of it is plain HTML/CSS over the canvas, and none of it knows what a tank is. It takes a
 * `subject` descriptor and renders whatever that describes — the same layer draws a tank, a
 * robotic jellyfish, or a test box. Everything subject-specific lives in src/subjects/**.
 *
 * Text is in the DOM rather than in the scene for a concrete reason beyond legibility: with a
 * post-process outline pass running, scene-space text becomes an input to the edge filter and
 * gets outlined like a machine part.
 */
export class SchematicChrome {
  /**
   * @param {object} opts
   * @param {HTMLElement} opts.root       overlay container (position: relative parent of canvas)
   * @param {object} opts.subject         subject descriptor, see src/subjects/*
   * @param {object} opts.handlers        { onView, onMode, onExplode, onAzimuth, onElevation, onExport, onBust }
   */
  constructor({ root, subject, subjects = [], views, joints = [], handlers = {} }) {
    this.root = root;
    this.subject = subject;
    this.subjects = subjects;
    this.views = views;
    this.joints = joints;
    this.handlers = handlers;
    this.readoutEls = new Map();
    this.calloutObjects = [];
    this.openSheet = null;
    this.viewButtonsCompact = new Map();
    this.installBtn = null;

    this.labelRenderer = new CSS2DRenderer();
    this.labelRenderer.domElement.className = 'label-layer';
    root.appendChild(this.labelRenderer.domElement);

    this.overlay = el('div', 'chrome');
    root.appendChild(this.overlay);

    // The two right-hand panels share one column so the instrumentation can take whatever the
    // controls leave. They used to be independent absolute boxes, which meant the taller a
    // subject's control panel got, the further the instrumentation ran underneath it — the RA-6
    // declares seven joints and put four readouts out of reach. A fraction tuned to today's
    // tallest subject would just have moved the failure to the next one.
    const rail = el('div', 'rail-r');
    rail.append(this._instrumentation(), this._controls());

    this.overlay.append(
      this._titleBlock(),
      this._legend(),
      rail,
      this._sheetTabs(),
      this._frameMarks(),
    );

    this.toastHost = el('div', 'toast-host');
    root.appendChild(this.toastHost);

    // Tapping the drawing area closes an open sheet — on a phone the sheets cover the model,
    // and hunting for the same tab again to dismiss is the wrong gesture.
    root.addEventListener('pointerdown', (e) => {
      if (this.openSheet && !e.target.closest('.panel, .sheet-tabs, .toast')) this.openPanel(null);
    });
  }

  // --- mobile sheet switching ----------------------------------------------

  /**
   * Below the desktop breakpoint the three data panels become bottom sheets, one at a time.
   * They stay in the DOM and keep updating either way — only their position changes — so
   * readouts do not need a second code path for small screens.
   */
  openPanel(name) {
    this.openSheet = this.openSheet === name ? null : name;
    this.root.dataset.sheet = this.openSheet || '';
    for (const [k, b] of this.sheetTabButtons) b.classList.toggle('on', k === this.openSheet);
  }

  _sheetTabs() {
    const bar = el('div', 'sheet-tabs');
    this.sheetTabButtons = new Map();
    for (const [key, label] of [['legend', 'KEY'], ['instrumentation', 'DATA'], ['controls', 'CTRL']]) {
      const b = el('button', 'btn', label);
      b.addEventListener('click', () => this.openPanel(key));
      this.sheetTabButtons.set(key, b);
      bar.appendChild(b);
    }
    const views = el('div', 'sheet-views');
    for (const [key, v] of Object.entries(this.views)) {
      const b = el('button', 'btn tiny', v.label);
      b.addEventListener('click', () => this.handlers.onView?.(key));
      this.viewButtonsCompact.set(key, b);
      views.appendChild(b);
    }
    const wrap = el('div', 'mobile-bar');
    wrap.append(views, bar);
    return wrap;
  }

  // --- panels --------------------------------------------------------------

  _titleBlock() {
    const s = this.subject;
    const box = el('div', 'panel title-block');
    box.append(
      el('div', 'tb-title', s.title),
      el('div', 'tb-sub', s.subtitle),
    );
    const grid = el('div', 'tb-grid');
    for (const [k, v] of Object.entries(s.drawing || {})) {
      const cell = el('div', 'tb-cell');
      cell.append(el('span', 'tb-k', k), el('span', 'tb-v', v));
      grid.appendChild(cell);
    }
    box.appendChild(grid);
    return box;
  }

  _legend() {
    const box = el('div', 'panel legend');
    box.appendChild(el('div', 'panel-h', 'KEY TO ITEMS'));
    const list = el('ol', 'legend-list');
    for (const item of this.subject.legend || []) {
      const li = el('li', 'legend-item');
      li.dataset.node = item.node || '';
      li.append(
        el('span', 'legend-n', String(item.n).padStart(2, '0')),
        el('span', 'legend-l', item.label),
        el('span', 'legend-q', item.qty ? `×${item.qty}` : ''),
      );
      li.addEventListener('mouseenter', () => this.handlers.onHighlight?.(item.node));
      li.addEventListener('mouseleave', () => this.handlers.onHighlight?.(null));
      list.appendChild(li);
    }
    box.appendChild(list);
    return box;
  }

  _instrumentation() {
    const box = el('div', 'panel instrumentation');
    box.appendChild(el('div', 'panel-h', 'INSTRUMENTATION'));
    const grid = el('div', 'instr-grid');
    for (const row of this.subject.instrumentation || []) {
      const cell = el('div', 'instr-row');
      const v = el('span', 'instr-v', row.value ?? '—');
      cell.append(el('span', 'instr-k', row.label), v);
      grid.appendChild(cell);
      if (row.key) this.readoutEls.set(row.key, v);
    }
    box.appendChild(grid);
    box.appendChild(el('div', 'instr-foot', 'VALUES COSMETIC — NOT ENGINEERING DATA'));
    return box;
  }

  _controls() {
    const box = el('div', 'panel controls');

    const views = this._optionRow(
      'VIEW',
      Object.entries(this.views).map(([key, v]) => [key, v.label]),
      (key) => this.handlers.onView?.(key),
    );
    this.viewButtons = views.buttons;
    box.appendChild(views.row);

    const modes = this._optionRow(
      'MODE',
      [['blueprint', 'BLUEPRINT'], ['pbr', 'GAME / PBR']],
      (key) => this.handlers.onMode?.(key),
    );
    this.modeButtons = modes.buttons;
    const calloutBtn = el('button', 'btn', 'CALLOUTS');
    calloutBtn.addEventListener('click', () => {
      const on = this.root.classList.toggle('no-callouts');
      calloutBtn.classList.toggle('on', !on);
    });
    calloutBtn.classList.add('on');
    modes.row.querySelector('.ctl-opts').appendChild(calloutBtn);
    box.appendChild(modes.row);

    box.appendChild(this._slider('EXPLODE', 0, 1, 0.001, 0, (v) => this.handlers.onExplode?.(v)));

    // One slider per declared joint. The viewer has no idea whether it is driving a turret
    // ring, a trunnion or four trail hinges — the subject's scene graph says what exists and
    // what its range is, which is why a second vehicle with a different mechanism added no
    // code here at all.
    for (const joint of this.joints) {
      box.appendChild(this._slider(
        joint.label, joint.min, joint.max, joint.step, joint.value,
        (v) => this.handlers.onJoint?.(joint.key, v),
      ));
    }

    box.appendChild(this._optionRow(
      'SUBJECT',
      this.subjects.map((s) => [s.id, s.label]),
      (id) => this.handlers.onSubject?.(id),
      (id) => id === this.subject.id,
    ).row);

    box.appendChild(this._optionRow(
      'ASSET',
      [['export', 'EXPORT GLB'], ['dump', 'DUMP GRAPH']],
      (key) => (key === 'export' ? this.handlers.onExport?.() : this.handlers.onDumpGraph?.()),
    ).row);

    return box;
  }

  /**
   * A label plus a group of buttons that wraps.
   *
   * The buttons used to be direct children of `.ctl-row`, which is one non-wrapping flex line
   * inside a fixed-width panel — so every subject and every view added past the width ran off
   * the right edge and became unclickable. Two vehicles and one camera view were unreachable
   * by the time there were six subjects, and nothing said so: the panel just ended.
   *
   * Wrapping the buttons in their own group rather than putting `flex-wrap` on the row is what
   * keeps the label column intact. `flex-wrap` on the row itself would let the 54px key wrap
   * down with the buttons and the rows would stop lining up.
   */
  _optionRow(label, entries, onPick, isOn) {
    // The modifier class is what lets the stylesheet reorder rows per breakpoint without the
    // chrome knowing anything about breakpoints. It replaced a `:first-child` rule that hid
    // the VIEW row on mobile purely by position — correct only for as long as VIEW stayed
    // first, which is exactly the assumption the phone layout then wanted to break.
    const row = el('div', `ctl-row opt-row opt-${label.toLowerCase()}`);
    row.appendChild(el('span', 'ctl-k', label));
    const opts = el('div', 'ctl-opts');
    const buttons = new Map();
    for (const [key, text] of entries) {
      const b = el('button', 'btn', text);
      b.classList.toggle('on', !!isOn?.(key));
      b.addEventListener('click', () => onPick(key, b));
      buttons.set(key, b);
      opts.appendChild(b);
    }
    row.appendChild(opts);
    return { row, buttons };
  }

  _slider(label, min, max, step, value, onInput) {
    const row = el('div', 'ctl-row slider-row');
    const out = el('span', 'ctl-v', fmt(value));
    const input = document.createElement('input');
    Object.assign(input, { type: 'range', min, max, step, value });
    input.addEventListener('input', () => {
      out.textContent = fmt(Number(input.value));
      onInput(Number(input.value));
    });
    row.append(el('span', 'ctl-k', label), input, out);
    return row;
  }

  _frameMarks() {
    const f = el('div', 'frame');
    for (const c of ['tl', 'tr', 'bl', 'br']) f.appendChild(el('div', `corner ${c}`));
    return f;
  }

  // --- callouts ------------------------------------------------------------

  /**
   * Pin numbered labels to nodes in the scene graph. Anchors are declared by node name in the
   * subject config, so the chrome never has to know the hierarchy.
   */
  buildCallouts(sceneRoot) {
    for (const o of this.calloutObjects) o.parent?.remove(o);
    this.calloutObjects = [];

    for (const c of this.subject.callouts || []) {
      const host = sceneRoot.getObjectByName(c.node);
      if (!host) { console.warn(`[chrome] callout target missing: ${c.node}`); continue; }

      const label = el('div', `callout dir-${c.dir || 'ne'}`);
      const tag = el('div', 'cal-tag');
      tag.append(el('span', 'cal-num', String(c.n).padStart(2, '0')), el('span', 'cal-txt', c.label));
      label.append(el('span', 'cal-dot'), el('span', 'cal-line'), tag);
      const obj = new CSS2DObject(label);
      obj.position.set(...(c.offset || [0, 0, 0]));
      obj.name = `Callout_${c.n}`;
      obj.userData.displayOnly = true;
      host.add(obj);
      this.calloutObjects.push(obj);
    }
  }

  // --- per-frame -----------------------------------------------------------

  setReadouts(values) {
    for (const [k, v] of Object.entries(values)) {
      const node = this.readoutEls.get(k);
      if (node && node.textContent !== v) node.textContent = v;
    }
  }

  setActiveView(key) {
    for (const [k, b] of this.viewButtons) b.classList.toggle('on', k === key);
    for (const [k, b] of (this.viewButtonsCompact || [])) b.classList.toggle('on', k === key);
  }

  setActiveMode(key) {
    for (const [k, b] of this.modeButtons) b.classList.toggle('on', k === key);
    this.root.classList.toggle('mode-pbr', key === 'pbr');
  }

  crossfade() {
    this.root.classList.add('crossfade');
    setTimeout(() => this.root.classList.remove('crossfade'), 220);
  }

  /**
   * Non-blocking toast. Used for the service-worker update prompt, which must never be a
   * modal: the user may be mid-orbit, and a new build is not an emergency.
   */
  toast(text, { actionLabel, onAction, dismissLabel = 'LATER', persist = false } = {}) {
    const box = el('div', 'toast');
    box.appendChild(el('span', 'toast-t', text));
    if (actionLabel) {
      const b = el('button', 'btn on', actionLabel);
      b.addEventListener('click', () => { box.remove(); onAction?.(); });
      box.appendChild(b);
    }
    const d = el('button', 'btn', dismissLabel);
    d.addEventListener('click', () => box.remove());
    box.appendChild(d);
    this.toastHost.appendChild(box);
    if (!persist) setTimeout(() => box.remove(), 12000);
    return box;
  }

  /**
   * Install affordance. Chrome gets a real button wired to the deferred prompt; iOS Safari
   * gets a Share-sheet hint, because there is no programmatic install there and pretending
   * otherwise produces a button that does nothing.
   */
  showInstall(mode, installer) {
    if (this.installBtn) return;
    const row = this.overlay.querySelector('.controls .ctl-row:last-child');
    const b = el('button', 'btn install', mode === 'ios' ? 'ADD TO HOME' : 'INSTALL');
    b.addEventListener('click', () => {
      if (mode === 'ios') {
        this.toast('iOS: tap the Share icon, then “Add to Home Screen”.',
          { dismissLabel: 'GOT IT', persist: true });
      } else {
        installer.install();
      }
    });
    row?.appendChild(b);
    this.installBtn = b;
  }

  setOnline(online) {
    this.root.classList.toggle('offline', !online);
    this.setReadouts({ link: online ? 'ONLINE' : 'OFFLINE' });
  }

  setSize(w, h) { this.labelRenderer.setSize(w, h); }

  renderLabels(scene, camera) { this.labelRenderer.render(scene, camera); }
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function fmt(v) {
  return Number.isInteger(v) ? String(v) : v.toFixed(2);
}
