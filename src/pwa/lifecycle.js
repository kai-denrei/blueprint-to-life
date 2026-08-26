/**
 * PWA lifecycle: registration, update-on-consent, install prompt, connectivity.
 *
 * No framework hooks here — this project has no framework. Each function takes callbacks and
 * returns a small control object; the chrome layer decides what the UI looks like.
 */

/** True when running from the home screen rather than a browser tab. */
export function isStandalone() {
  return matchMedia('(display-mode: standalone)').matches
    || matchMedia('(display-mode: fullscreen)').matches
    || navigator.standalone === true;   // iOS Safari's own flag; no display-mode support pre-17
}

export function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
    // iPadOS 13+ reports as a Mac; the touch-point count is what distinguishes it. This is a
    // heuristic, not a fact — see isIOSSafari for why it needs a second gate.
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export function isIOSSafari() {
  if (!isIOS()) return false;
  const ua = navigator.userAgent;
  // The MacIntel-plus-touch-points branch above fires on ANY Mac reporting touch points —
  // including a Chromium with touch emulation on, which is exactly how this was caught: the
  // desktop build grew an "ADD TO HOME" button that could never do anything. Requiring the UA
  // to actually be Safari closes it, since every non-Safari iOS browser stamps its own token.
  return /Safari/.test(ua) && !/Chrome|Chromium|Edg|Firefox|CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
}

/**
 * Register the service worker and report an update when one is waiting.
 *
 * The worker never calls skipWaiting() on its own. A new build sits in `waiting` until the
 * user accepts, at which point we message it, wait for `controllerchange`, and reload. The
 * alternative — activating immediately — swaps the module graph under a live WebGL context
 * mid-interaction, which is how PWAs earn their reputation.
 *
 * @param {(apply: () => void) => void} onUpdateReady called with a function that applies the update
 */
export async function registerServiceWorker(onUpdateReady) {
  if (!('serviceWorker' in navigator)) return null;
  // file:// and plain http on a non-localhost host will both reject; not worth surfacing.
  if (location.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(location.hostname)) {
    return null;
  }

  let reg;
  try {
    // Relative, so the worker's scope follows wherever the app is served from. Registering
    // '/sw.js' with scope '/' is a 404 on a project Pages path, and a worker that fails to
    // register takes the whole offline story with it.
    reg = await navigator.serviceWorker.register('./sw.js', { scope: './' });
  } catch (err) {
    console.warn('[pwa] service worker registration failed', err);
    return null;
  }

  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return;
    reloading = true;
    location.reload();
  });

  const apply = () => {
    if (reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' });
  };

  // Already waiting when the page loaded (user opened a second tab, say).
  if (reg.waiting && navigator.serviceWorker.controller) onUpdateReady(apply);

  reg.addEventListener('updatefound', () => {
    const sw = reg.installing;
    if (!sw) return;
    sw.addEventListener('statechange', () => {
      // `controller` is null on the very first install — that is not an update, it is the
      // initial one, and prompting the user to refresh into the build they already have
      // is the classic false positive.
      if (sw.state === 'installed' && navigator.serviceWorker.controller) onUpdateReady(apply);
    });
  });

  // Catch builds shipped while the tab sat open.
  setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000);
  addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') reg.update().catch(() => {});
  });

  return reg;
}

const DISMISS_KEY = 'btl.install.dismissed';

/**
 * Install affordance.
 *
 * Chrome/Edge/Android fire `beforeinstallprompt`, which we stash and replay on a user gesture.
 * iOS Safari never fires it and has no programmatic install at all, so the only honest option
 * there is a hint pointing at the Share sheet. Both are gated on a dismissal flag and on not
 * already running standalone.
 *
 * @param {(mode: 'prompt'|'ios') => void} onAvailable
 */
export function setupInstallPrompt(onAvailable) {
  if (isStandalone()) return { install: () => {}, dismiss: () => {} };
  let dismissed = false;
  try { dismissed = localStorage.getItem(DISMISS_KEY) === '1'; } catch { /* private mode */ }
  if (dismissed) return { install: () => {}, dismiss: () => {} };

  let deferred = null;

  addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();          // suppress the browser's own mini-infobar
    deferred = e;
    onAvailable('prompt');
  });

  addEventListener('appinstalled', () => {
    deferred = null;
    try { localStorage.setItem(DISMISS_KEY, '1'); } catch { /* ignore */ }
  });

  // Deferred by a microtask on purpose: this runs synchronously inside setupInstallPrompt,
  // so calling back immediately would hit the caller's `installer` binding before the return
  // value is assigned — a temporal dead zone error, on iOS Safari only.
  if (isIOSSafari()) queueMicrotask(() => onAvailable('ios'));

  return {
    async install() {
      if (!deferred) return 'unavailable';
      deferred.prompt();
      const { outcome } = await deferred.userChoice;
      deferred = null;
      if (outcome === 'dismissed') this.dismiss();
      return outcome;
    },
    dismiss() {
      try { localStorage.setItem(DISMISS_KEY, '1'); } catch { /* ignore */ }
    },
  };
}

/** @param {(online: boolean) => void} onChange */
export function watchConnectivity(onChange) {
  const emit = () => onChange(navigator.onLine);
  addEventListener('online', emit);
  addEventListener('offline', emit);
  emit();
}
