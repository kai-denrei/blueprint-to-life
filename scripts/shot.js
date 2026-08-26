#!/usr/bin/env node
/**
 * Headless verification harness.
 *
 * Drives Chrome over CDP with nothing but Node's built-in WebSocket — no puppeteer, no
 * 150MB Chromium download on a 16GB machine. Captures console errors (shader compile
 * failures land here) and a screenshot per view.
 *
 * Usage: node scripts/shot.js <url> <out.png> [setupJS]
 */
const [, , url, out, setup = ''] = process.argv;
// VIEWPORT=390x844 to emulate a phone (also flips the pointer to coarse and DPR to 3).
const [VW, VH] = (process.env.VIEWPORT || '1600x1000').split('x').map(Number);
const DPR = Number(process.env.DPR || 1);
const MOBILE = process.env.MOBILE === '1';
const PORT = process.env.CDP_PORT || 9222;

const rpc = (ws) => {
  let id = 0;
  const pending = new Map();
  const events = [];
  ws.addEventListener('message', (e) => {
    const msg = JSON.parse(e.data);
    if (msg.id != null && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
    } else if (msg.method) {
      events.push(msg);
    }
  });
  return {
    events,
    send(method, params = {}) {
      const i = ++id;
      return new Promise((resolve, reject) => {
        pending.set(i, { resolve, reject });
        ws.send(JSON.stringify({ id: i, method, params }));
      });
    },
  };
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
const ws = new WebSocket(targets.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
const cdp = rpc(ws);

await cdp.send('Network.enable');
await cdp.send('Runtime.enable');
await cdp.send('Log.enable');
await cdp.send('Page.enable');
await cdp.send('Emulation.setDeviceMetricsOverride', { width: VW, height: VH, deviceScaleFactor: DPR, mobile: MOBILE });
if (MOBILE) {
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await cdp.send('Emulation.setEmitTouchEventsForMouse', { enabled: true, configuration: 'mobile' });
}

await cdp.send('Page.navigate', { url });
await sleep(1200);

// OFFLINE=1 cuts the network after the first load, so the reload below is served entirely by
// the service worker. This is the Playwright context.setOffline equivalent; killing the dev
// server is not — it leaves the browser able to reach a dead socket, which is a different
// failure than having no network at all.
// The HTTP cache is a second staleness path, separate from the service worker. GitHub Pages
// serves HTML with max-age=600, so a browser profile that loaded the page minutes ago keeps
// serving the old build back to the harness even after the worker is unregistered — which is
// exactly how a verified-live check reported a previous build as current.
if (process.env.PWA !== '1') {
  await cdp.send('Network.clearBrowserCache');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
}

if (process.env.OFFLINE === '1') {
  await cdp.send('Network.emulateNetworkConditions', {
    offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0,
  });
}

// By default, wipe any service worker and cache first, then reload.
//
// This bit me: once the SW is installed it serves the module graph stale-while-revalidate, so
// a screenshot taken right after an edit shows the PREVIOUS build and the fix looks like it
// did nothing. That is the SW behaving correctly — but a verification harness must not be
// verifying a cached copy of the thing it is verifying. Set PWA=1 to keep the worker when the
// worker itself is what is under test.
if (process.env.PWA !== '1') {
  await cdp.send('Runtime.evaluate', {
    expression: `(async () => {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r => r.unregister()));
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
    })()`, awaitPromise: true,
  });
  await cdp.send('Page.navigate', { url });
  await sleep(2600);
} else {
  await sleep(1600);
}
if (setup) {
  const r = await cdp.send('Runtime.evaluate', { expression: setup, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) console.error('setup threw:', JSON.stringify(r.exceptionDetails.exception?.description));
  else if (r.result?.value !== undefined) console.log('setup ->', r.result.value);
  await sleep(1400);
}

const problems = cdp.events
  .filter((e) => e.method === 'Log.entryAdded' && ['error', 'warning'].includes(e.params.entry.level))
  .map((e) => `${e.params.entry.level.toUpperCase()}: ${e.params.entry.text}`)
  .concat(cdp.events
    .filter((e) => e.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(e.params.type))
    .map((e) => `console.${e.params.type}: ${e.params.args.map((a) => a.value ?? a.description).join(' ')}`))
  .concat(cdp.events
    .filter((e) => e.method === 'Runtime.exceptionThrown')
    .map((e) => `EXCEPTION: ${e.params.exceptionDetails.exception?.description || e.params.exceptionDetails.text}`));

const probe = await cdp.send('Runtime.evaluate', {
  expression: `(async () => JSON.stringify({
    canvas: (() => { const c = document.getElementById('view'); return c ? c.width + 'x' + c.height : 'missing'; })(),
    nodes: globalThis.root ? (() => { let n = 0; globalThis.root.traverse(() => n++); return n; })() : null,
    tris: document.querySelector('.instr-row:nth-child(13) .instr-v')?.textContent ?? null,
    build: document.querySelector('meta[name="cb"]')?.content,
    readouts: Object.fromEntries([...document.querySelectorAll('.instr-row')].map(r =>
      [r.querySelector('.instr-k').textContent, r.querySelector('.instr-v').textContent])),
    callouts: document.querySelectorAll('.callout').length,
    sw: navigator.serviceWorker?.controller ? 'controlled' : (await navigator.serviceWorker?.getRegistration())?.active ? 'active' : 'none',
    caches: (await caches.keys()),
    cachedEntries: await (async () => { const k = (await caches.keys())[0]; return k ? (await (await caches.open(k)).keys()).length : 0; })(),
    coarse: matchMedia('(pointer: coarse)').matches,
    barVisible: getComputedStyle(document.querySelector('.mobile-bar')).display,
    webgl2: !!document.createElement('canvas').getContext('webgl2'),
  }))()`, returnByValue: true, awaitPromise: true,
});

const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
const { writeFileSync } = await import('node:fs');
writeFileSync(out, Buffer.from(shot.data, 'base64'));

console.log('probe:', probe.result.value);
console.log(problems.length ? `\nPROBLEMS (${problems.length}):\n` + problems.join('\n') : '\nno console errors or warnings');
console.log(`\nwrote ${out}`);

await cdp.send('Page.close').catch(() => {});
ws.close();
process.exit(0);
