# blueprint-to-life

Vehicles built entirely from code as Three.js scene graphs, rendered two ways: as a technical
blueprint schematic, and as a game-ready PBR asset. Same hierarchy, different display mode.

Four subjects so far — the **MK-VI** main battle tank, the **MK-CX** hover tank, the **Hepta-T**
6×6 cargo transport, and an M777-pattern 155 mm towed howitzer — plus a primitives rig for
debugging the shader.

The scene graph is the deliverable. The blueprint look is a post-process on top of it and is
never baked into the asset — toggling display modes touches nothing under `src/tank/` or
`src/howitzer/`, and a test enforces that.

## Run it

```bash
npm install
npm run vendor        # copies three out of node_modules into vendor/ (no bundler)
npm run icons         # generates the PWA icon set (no image deps — see scripts/make-icons.js)
npm start             # http://127.0.0.1:5173/
```

- `/` — MK-VI main battle tank
- `/?subject=mkcx` — MK-CX, the forward projection: no running gear at all, lift nacelles with
  emissive emitters, a compact main turret and two secondary turrets tucked under the bore line
- `/?subject=heptat` — Hepta-T, a 6×6 industrial hauler: steered front axle, deploying tail
  ramp, blue accent lighting, and a deck of stowage that is deliberately not tidy
- `/?subject=howitzer` — 155 mm towed howitzer
- `/?subject=box` — shader isolation rig: a box, a sphere, and two flush plates

`?subject=tank` still resolves to the MK-VI; that link is published, so it keeps working rather
than silently falling through to a default.

Or use the SUBJECT row in the controls panel.

Keys: `1`–`6` views · `b` blueprint/PBR · `c` collision proxy · `h` hide chrome.

On a phone the four corner panels become bottom sheets driven by a persistent bar (KEY / DATA /
CTRL), one open at a time; in short landscape they become a right-hand drawer instead, because
a bottom sheet at that height covers the entire drawing. Same chrome either way — the panels
keep updating whether open or not, so there is no second code path for small screens.

## Layout

```
src/lib/        shared asset generators — geometry, materials, part registry
src/tank/       asset: MK-VI main battle tank
src/mkcx/       asset: MK-CX
src/heptat/     asset: Hepta-T
src/howitzer/   asset: 155 mm towed howitzer
src/render/     display modes — blueprint G-buffer + composite, PBR lighting
src/camera/     ortho elevations + perspective iso, snap-and-ease between them
src/chrome/     schematic overlay (title block, legend, instruments, callouts)
src/subjects/   what the app is pointed at — tank.js, howitzer.js, box.js
src/pwa/        registration, update-on-consent, install prompt, connectivity
server/serve.js static server with the cache-control split the busting layer needs
```

Asset code (`src/lib`, `src/tank`, `src/mkcx`, `src/heptat`, `src/howitzer`) must not import from display code, and
display code (`src/render`, `src/camera`, `src/chrome`) must not import from any specific
asset. `npm test` fails the build if either happens.

## Adding a subject

The howitzer was the test of whether the MK-VI's architecture was worth anything. It cost two
new files (`src/howitzer/**`) and one descriptor (`src/subjects/howitzer.js`). The chrome, the
blueprint pass, the camera controller and the export path were not touched.

The MK-CX did not come as cheap, and the difference is the interesting part. Geometry and
descriptor were free in the same way. But it wanted *glowing* parts, and the blueprint pass had
no notion of a powered element — so it needed a genuine renderer change: an `emissive` vertex
attribute, a spare G-buffer channel to carry it, and a third hue in the composite.

That is a real cost the second subject did not have, and it is worth being precise about why it
was acceptable. The addition is a **generic capability the asset declares data for**, exactly
like `partId` before it — `registerPart(mesh, { emissive: true })` writes an attribute, and a
renderer that ignores the attribute draws the part normally. What would *not* have been
acceptable is `if (subject.id === 'mkcx')` anywhere in `src/render/`.

The Hepta-T then wanted the same effect in blue, which turned the boolean into a **channel**:
`registerPart(mesh, { emissive: 'secondary' })`. Which accent channel a part is on is a fact
about the vehicle; what channel 2 *looks* like is a decision for whoever is drawing it. Putting
the colour itself in the asset would have moved display state back into the geometry.

The give-away that it landed on the right side of the line: the PBR path expresses the same
fact through `MeshStandardMaterial.emissive`, and neither display mode reads the other's
representation. Had the glow been material-only it would have shown in the game view and
silently vanished from the schematic, because the blueprint pass renders with an
`overrideMaterial` and never looks at a material at all. There is an invariant for that.

What makes that possible is that articulation is **declared on the scene graph**, not coded
into the viewer:

```js
root.userData.joints = [
  { key: 'elevation', label: 'ELEVATE', unit: '°', min: 0, max: 71.7, step: 0.5, value: 0,
    targets: [{ node: 'Elevation_Pivot', axis: 'x', from: 0, to: -71.7 }] },
];
```

A joint maps one slider's `min..max` linearly onto each target's `from..to`, in degrees. The
indirection earns its keep immediately: `rotation.x` positive pitches a gun *down*, so the
gunner's number and the scene's number have opposite signs, and that belongs with the vehicle
rather than in the viewer. The viewer builds one slider per joint and knows nothing about
turret rings, trunnions or trail hinges.

The howitzer's third joint swings four trail hinges from a towing package to a firing
cruciform. The MK-CX declares four joints, the last two driving a remote weapon station that
traverses and elevates independently of the main gun. Neither required viewer code: the sliders,
the readouts and the sign conventions all come from the graph.

Subjects may also declare `afterArticulate(root)` for fix-ups the scene graph cannot express.
The howitzer needs one: its two road wheels are a single `InstancedMesh` (the same contract the
tank's running gear follows) but they are mounted on two independently hinging trails, and
instance matrices cannot be inherited from different parents.

## How the blueprint pass works

One scene pass into a two-attachment MRT target with a depth texture, then one fullscreen
composite. No EffectComposer — there is exactly one effect.

| attachment | contents |
|---|---|
| 0 | view-space normal (rgb) + part id (a) |
| 1 | flat banded ink fill |
| depth | silhouette and occlusion edges |

The outline is a discontinuity filter over all three. Depth alone misses coplanar plates;
normals alone miss two different parts that happen to face the same way. The per-vertex
`partId` attribute closes both gaps — `/?subject=box` exists to show exactly that: the seam
between the two flush plates is produced by the id channel and nothing else.

## Versioning

Asset versioning is the cache-busting token, not a bundler hash (there is no bundler).

```bash
npm run bust      # bump the token; rewrites ?v= on every asset URL, the <meta name="cb">, the favicon
npm run watch     # re-bump on every source save (opt-in; not started by npm start)
```

The corner badge and the tab favicon change shape and colour on every bump, so "did my change
actually load?" is answerable without opening devtools.

The token only reaches the browser because `server/serve.js` sets the headers to match:

| response | Cache-Control |
|---|---|
| HTML | `no-cache, no-store, must-revalidate` |
| URL carrying `?v=` | `public, max-age=31536000, immutable` |
| everything else | `no-cache` |

Without that pairing the fingerprints are decoration: the browser never refetches the HTML that
carries the new URLs. **Known limitation:** only `index.html`'s own asset references get
fingerprinted. ES module imports inside `src/**` are not rewritten, so they fall into the third
row and revalidate on every load. Correct, but not free — a real deploy should either bundle or
fingerprint the module graph.

**Gotcha:** `scripts/bust.sh` rewrites `<meta name="cb" content="...">` in *every* file it
walks, not just HTML. Do not write that tag as a literal in source; assemble it. See the last
test in `test/invariants.test.js`.

## Installable and offline

It is a PWA: manifest, hand-rolled service worker, icons including a maskable one, and the iOS
head tags. Precached cold, it runs with no network at all — the geometry is generated at load,
so once the runtime is cached there is no content left to fetch.

Workbox is not used. There is no bundler to run `injectManifest` in, and the precache list is
~30 known static files, so Workbox would have been the larger dependency.

**The service worker's cache name is the cache-bust token.** There is exactly one version
number in this project. `scripts/bust.sh` stamps it into `sw.js` on every bump, old caches are
deleted on activate, and `npm test` fails if the SW token ever stops matching `index.html` —
because a drifted SW token pins every installed user to the build they first cached, forever,
and nothing else in the system would notice.

The worker never calls `skipWaiting()` on its own. A new build waits, the app shows a toast,
and only on consent does it message the worker and reload on `controllerchange`. Swapping the
module graph under a live WebGL context mid-orbit is how PWAs earn their reputation.

Install: Chrome/Android get a real button wired to `beforeinstallprompt`; iOS Safari gets a
Share-sheet hint, because there is no programmatic install there and a button that does nothing
is worse than none.

### Making something look lived-in, procedurally

The Hepta-T's brief included "believable, lived-in", which is a texturing word — and there are
no textures here. The blueprint pass renders flat ink; wear, grime and paint chips are simply
unavailable. So it had to become structural: things that *accumulated* rather than things that
were *designed*.

Two techniques carry it. The first is asymmetry — the ladder is on one side, the spare wheel and
toolbox on the other, the fuel cans on one flank only. A vehicle whose every part is mirrored
reads as a product render no matter how much detail it has.

The second is a seeded jitter on every stowed item's position and cant. Crates strapped down by
hand do not line up, and a grid of perfectly aligned boxes reads as cargo the modeller placed
rather than cargo a crew threw on. Critically it is a small LCG seeded from a constant, not
`Math.random()`: the scene graph is the deliverable and has to be byte-identical every build, or
the invariants go flaky and an exported GLB stops matching the one before it. *Random-looking*
and *random* are different requirements and only the first one is wanted.

There is an invariant for both halves — that the jitter source is reproducible, and that the
crates do not all share a rotation, which is what "the jitter silently stopped applying" looks
like.

### What the MK-CX broke

It hovers, so it has no wheels — and the shared invariant list required `Wheels_Instanced` of
every subject. That list was written when both existing vehicles happened to roll, and it had
quietly encoded "vehicles have wheels" as though it were part of the contract.

The two options were to make the contract conditional or to bolt decorative running gear onto a
hovering vehicle so the checklist stayed green. A contract that forces geometry to exist for the
test's benefit has stopped describing the thing it tests, so `MODELS` now carries a `wheels`
flag, and a subject that declares no wheels is checked for the opposite: that no orphaned road
wheel, sprocket, roller or track survived the change. A hovering vehicle still carrying its
running gear looks like the edit was abandoned halfway.

Two more invariants came out of the same change: that the lowest geometry actually clears the
ground (otherwise it is resting, not hovering), and that the secondary turrets stay below the
main gun's bore line — a design constraint that is easy to violate later with a small tweak and
that shows up as a silhouette collision rather than an error.

## Deployed

Live at **https://kai-denrei.github.io/blueprint-to-life/** — GitHub Pages, straight from
`main`. There is no build step and no CI: the repo root *is* the site root, which is why
`public/` was flattened away and every URL in the project is relative rather than
root-absolute.

That relativity is load-bearing, not stylistic. Pages serves this from a project path, so
`/styles.css`, an import-map value of `/vendor/three/...`, a `register('/sw.js')` and a
`start_url` of `/` all 404 there while working perfectly on localhost. Import-map values, the
service-worker scope and the manifest's URLs each resolve against a base URL, so relative is
correct in all of them — and `npm test` now fails on any root-absolute reference in those
places, because that class of bug is invisible until deploy.

### What Pages does to the cache-busting story

Pages does not let you set response headers. Everything comes back `Cache-Control: max-age=600`.
So the arrangement this project argues for — `no-cache` on HTML, `immutable` on fingerprinted
assets — is only true under `npm start`. On Pages:

- the HTML carrying the fingerprints is cached for up to 10 minutes, so a new build reaches a
  returning visitor on that delay rather than immediately;
- fingerprinted assets get 10 minutes instead of a year, which is merely wasteful, not wrong;
- **the service worker becomes the primary invalidation mechanism**, not the headers. Its cache
  name is the build token, it deletes every non-matching cache on activate, and the update
  toast is what actually moves a user onto a new build.

That inverts the priority stated further down in this README, and it is worth being explicit
about: on a host you cannot configure, the SW is the control surface. The headers section still
applies to any host where you *can* set them.

## Verifying

```bash
npm test          # scene-graph invariants — names, pivots, instancing, UVs, explode, boundaries
```

The structural invariants are parameterised over every model, so they define what "a subject
this pipeline can render and export" means rather than describing one vehicle. Adding a third
is one line in `MODELS`, and anything it breaks is a real incompatibility.

These assert the properties the spec calls the deliverable, not pixels. A screenshot test would
assert the display mode, which is explicitly not the asset.

For anything needing a live WebGL context there is a headless harness that drives Chrome over
CDP using nothing but Node's built-in WebSocket:

```bash
# start Chrome once
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new \
  --remote-debugging-port=9222 --enable-unsafe-swiftshader \
  --use-angle=swiftshader --user-data-dir=/tmp/cb-profile about:blank &

npm run shot -- http://127.0.0.1:5173/ /tmp/iso.png
npm run shot -- http://127.0.0.1:5173/ /tmp/exp.png "$(cat test/export-probe.js)"

VIEWPORT=390x844 DPR=3 MOBILE=1 npm run shot -- http://127.0.0.1:5173/ /tmp/phone.png
PWA=1 OFFLINE=1 npm run shot -- http://127.0.0.1:5173/ /tmp/offline.png
```

It reports console errors (shader compile failures land there) alongside the screenshot.

| env | effect |
|---|---|
| `VIEWPORT=WxH`, `DPR`, `MOBILE=1` | device emulation, including a coarse pointer |
| `PWA=1` | keep the service worker (default: unregister it and clear caches first) |
| `OFFLINE=1` | cut the network after first load, so the reload is served by the worker |

`PWA=1` is not the default for a reason that cost an hour: once installed, the worker serves the
module graph stale-while-revalidate, so a screenshot taken right after an edit shows the
*previous* build and the fix looks like it did nothing. Correct SW behaviour; useless in a
harness. `OFFLINE=1` cuts the network rather than killing the dev server — a dead socket is a
different failure from no network.

## Phase status

| Phase | State |
|---|---|
| 1 — geometry | done. Hierarchy, pivots at mechanical origins, instanced running gear, separate collision proxy, stored explode vectors. |
| 2 — blueprint shader | done. Prototyped against primitives first; that rig is kept at `?subject=box`. |
| 3 — camera | done. Ortho elevations, perspective iso, snap-and-crossfade across projection types. |
| 4 — chrome | done, subject-driven. Pointing it at something other than a tank is a new file in `src/subjects/`, not a layout change. |
| 5 — export | partial. GLB round-trips correctly: spec node names survive, `Turret_Pivot.translation` is `[0, 1.66, -0.35]`, `Barrel_Pivot` stays its child at the trunnion, TEXCOORD_1 is present, wheels survive as `EXT_mesh_gpu_instancing`. **Nothing has imported it into a second engine**, so "engine-portable" is a well-formed-file claim, not a tested rigging claim. No LOD tiers. |

### On reference material

Geometry is derived from published dimensional specifications — for the howitzer: 155 mm L/39
(so a 6.045 m tube), 10.7 m towed length, 2.77 m towed width, 0° to +71.7° elevation, ±22.5°
on-carriage traverse. Those are facts about the object. The reference imagery supplied for the
build was a watermarked stock illustration and a copyrighted technical diagram, neither of
which was traced; the spec treats blueprints as a proportion sanity-check, and published
figures serve that purpose without copying anyone's line art.

Two questions from the spec are still open and are recorded in `.deban/roles/pm.md`: whether
this is a real MBT or a fictional vehicle (the spec instructs both), and whether the shipped
artifact is the generator code or the exported GLB.
