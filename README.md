# blueprint-to-life

Vehicles built entirely from code as Three.js scene graphs, rendered two ways: as a technical
blueprint schematic, and as a game-ready PBR asset. Same hierarchy, different display mode.

Eleven subjects so far — the **MK-VI** main battle tank, the **MK-CX** hover tank, the
**Hepta-T** 6×6 cargo transport, the **Heptapod Walker** eight-legged sentry, **BP-Headless01**
(a headless bipedal exoframe), the **Moto // Pod** hubless monocycle, the **RA-6** six-axis
robot arm, the **GS-3** three-axis gimbal platform, **SERVER01** (a 42U compute rack), the
**CX-20** intermodal container, and an M777-pattern 155 mm towed howitzer — plus a primitives
rig for debugging the shader.

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
- `/?subject=heptapod` — Heptapod Walker, an eight-legged autonomous sentry: a 30 mm rail gun
  on a gyro ring, twenty-four driven limb pivots behind two sliders, and a ride height that is
  computed from the legs rather than authored
- `/?subject=headless` — BP-Headless01, a headless powered exoframe: no head and no weapon at
  all, a hunched carapace whose only aperture is a lit sensor band on the chest, two legs whose
  fold sets the ride height, and five driven digits on each hand
- `/?subject=motopod` — Moto // Pod (R-POD), a two-wheel monocycle: hubless wheels with five
  concentric rings apiece, a canopy on a hinge, a vectoring thruster, and a lean that rolls
  about the road rather than about the machine
- `/?subject=robotarm` — RA-6, a six-axis industrial arm whose sliders are the head's aim
  rather than its axes: set a bearing and an elevation, then move the arm underneath and the
  head keeps pointing where it was told
- `/?subject=gimbal` — GS-3, a stabilised director: three concentric sets of four rings nested
  about one point on three perpendicular axes, with the sensor ball at the centre
- `/?subject=server` — SERVER01, a 42U compute rack: 28 instanced sleds on the EIA-310 grid,
  one pulled out on a slide to expose its board and package, a rear fan door, and green light
  accents in the manner of the MK-CX's lift emitters
- `/?subject=container` — CX-20, a 20 ft ISO 668 intermodal container with its doors folded
  back: corrugated sheet walls, eight ISO 1161 corner castings, cam-lock rods, and a lit
  interior carrying eight unit loads
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

### The control rows had a growth bug

Every button row in the CTRL panel used to be a single non-wrapping flex line inside a
fixed-width panel, which works until the row is wider than the panel — and then the surplus is
simply not there. By the sixth subject, `FREE` had fallen off the VIEW row and `HOWITZER` and
`BOX RIG` off the SUBJECT row on desktop; on a 390 px phone three subjects were unreachable,
including the newest one. Nothing indicated it: the panel just ended.

The fix is that the buttons now sit in their own wrapping group (`.ctl-opts`) rather than being
direct children of the row. Wrapping the row itself would have let the 54 px key wrap down with
the buttons and the labels would stop lining up; wrapping only the buttons keeps the label
column intact and lets a row grow downward. Another subject now costs a line, never a button.

Two consequences worth recording, because both are about the phone rather than the desktop:

- **The sheet was capped.** At `56dvh` the CTRL sheet plus the 86 px bar covered ~63% of a
  390×844 screen — you were posing a model you could no longer see. It is `44dvh` now. The
  sheet already scrolled, so the cap costs reach, not content.
- **Row order is reach.** In a capped, scrolling sheet the last row is permanently below the
  fold, and the last row was SUBJECT — under seven joint sliders. It is ordered to the top on
  small screens: what you are looking at goes above how it is posed. That reorder is a
  stylesheet concern, so each option row carries a `opt-<name>` modifier class and the media
  query does the rest; the old rule hid the VIEW row with `:first-child`, which was correct
  only for as long as VIEW stayed first — exactly the assumption the phone layout wanted to
  break.

The build badge collided with both layouts once the panel grew (it is pinned `bottom: 8px;
right: 8px` by `cb-badge.js`, inside the controls panel's own corner). The desktop panel steps
up out of that corner so the badge reads as its footer, and on a phone the badge fades while a
sheet is open — the build token is in the DATA sheet anyway.

## Layout

```
src/lib/        shared asset generators — geometry, materials, part registry
src/tank/       asset: MK-VI main battle tank
src/mkcx/       asset: MK-CX
src/heptat/     asset: Hepta-T
src/heptapod/   asset: Heptapod Walker
src/headless/   asset: BP-Headless01
src/motopod/    asset: Moto // Pod
src/robotarm/   asset: RA-6 articulated arm
src/gimbal/     asset: GS-3 gimbal platform
src/server/     asset: SERVER01 compute rack
src/container/  asset: CX-20 intermodal container
src/howitzer/   asset: 155 mm towed howitzer
src/render/     display modes — blueprint G-buffer + composite, PBR lighting
src/camera/     ortho elevations + perspective iso, snap-and-ease between them
src/chrome/     schematic overlay (title block, legend, instruments, callouts)
src/subjects/   what the app is pointed at — tank.js, howitzer.js, box.js
src/pwa/        registration, update-on-consent, install prompt, connectivity
server/serve.js static server with the cache-control split the busting layer needs
```

Asset code (`src/lib`, `src/tank`, `src/mkcx`, `src/heptat`, `src/heptapod`, `src/headless`,
`src/motopod`, `src/robotarm`, `src/gimbal`, `src/server`, `src/container`, `src/howitzer`)
must not import from display code, and
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
traverses and elevates independently of the main gun. BP-Headless01's GRIP joint closes twenty
finger segments. None of them required viewer code: the sliders, the readouts and the sign
conventions all come from the graph.

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

**The same gotcha, second form.** The fingerprinter rewrites `src=`/`href=` in every `.html` it
walks too — including HTML that is source for something other than this site. `design/` holds
design-canvas artboards whose runtime matches `<script src="./support.js">` literally, and a
stamped `?v=` on that line silently broke the canvas. `fingerprint-urls.py` now takes a
repeatable `--skip DIR`, and `bust.sh` passes `--skip design`. Both files are owned by the
cache-busting installer, so re-running it drops these edits — the same standing risk as the
service-worker token stamp two paragraphs down.

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

### What the walker cost

The Heptapod Walker is the first subject that added **no renderer capability at all**, and that
is the interesting result rather than a boring one. It is an eight-legged sentry with
twenty-four driven limb pivots, a ride height that changes as it crouches, and two accent
channels — and the blueprint pass, the composite, the camera and the chrome are byte-identical
to what they were before it existed. Two asset files, one descriptor, one entry in the registry.

Three things made that possible, and each one was already there for a different reason:

**A joint fans out.** Twenty-four limb pivots are not twenty-four sliders. A joint maps one
range onto *every* target it names, which the Hepta-T's steer joint already used for two hub
carriers; STANCE is the same declaration with thirty-two targets and STRIDE is it with eight.
The viewer builds one slider per joint and has no idea it is folding a leg.

**The pose table is a midpoint.** STANCE runs crouch-to-extend and its default of 50 has to land
on the machine's rest posture, so `neutral` is not authored — it is the midpoint of the other
two, and an invariant says so. Author a third pose freehand and the walker silently stops
resting at the height every figure in the title block was derived from.

**`afterArticulate` carries the ride height.** A tank's hull height is a number; a walker's is a
consequence of where it put its feet. Fold the legs and the hull has to come down with them, and
no parent transform can express that — the legs are children of the thing that has to move. So
the ride height is solved from three angles every frame, exactly the escape hatch the howitzer's
trail-mounted wheels and the Hepta-T's steered axle needed. The invariant that matters is that
all eight pads sit on y = 0 at every stance, because a walker that floats a centimetre is
invisible in a still and obvious the moment anything casts a shadow.

The one genuinely new thing is a shared generator, `taperedBeam` — a limb is a box with two
different ends, and `extrudeProfile` extrudes along X, so authoring a limb with it would have
put the segment's rest orientation in a transform instead of in the pose table.

**What it deliberately does not do is instance its feet.** Eight pads are the most-repeated part
on the machine and look like the obvious `InstancedMesh`, which is what the Hepta-T's six wheels
are. They are not the same case: six wheels are six copies of one static transform, whereas
every foot here carries a different articulated one, and instance matrices cannot inherit a
parent's. Instancing them would mean recomputing eight world matrices from eight sockets every
frame to replace eight parent transforms the scene graph was already doing for free. The
contract's `wheels` flag — added for the MK-CX, which hovers — is what lets a subject say that
without a checklist forcing decorative geometry into existence.

On the name: the reference sheet the brief came from is titled *Heptapod*, annotates its leg
callout `(7x)`, and then draws eight legs. It is concept art, not a blueprint, and the brief
resolved it in favour of the drawing. The designation is carried as a programme name and the leg
count is stated on its own line in the title block, which is what a real drawing would do with an
inherited name that stopped describing the thing.

### What the headless frame cost

BP-Headless01 is the second legged subject and the first unarmed one: a bipedal exoframe with a
hunched carapace, no head at all, and five driven digits on each hand instead of a gun. It cost
two asset files, one descriptor, one registry line, one shared generator and one small change in
`main.js` — and the renderer, the composite, the camera and the chrome were not touched.

Three results are worth stating precisely, because two of them are about what *didn't* happen.

**Ride height turned out to be a legged feature, not a walker feature.** `afterArticulate` was
added for the howitzer's trail-mounted wheels and pressed into service for the walker's hull
height; the biped uses it in exactly the same shape, reading two limb angles instead of three.
That is the evidence the hook generalised rather than being a walker-specific escape hatch. What
does *not* generalise is the solve itself — two segments versus three, measured from a different
zero — so `src/headless/dimensions.js` has its own `stand()` rather than importing the walker's.
Sharing the pose maths would have coupled two machines that have nothing mechanical in common
beyond the fact that they both stand up.

**"Vehicles are armed" was never in the contract.** The MK-CX had to teach the shared invariant
list that a vehicle might have no wheels, because `Wheels_Instanced` had been required of
everything. Nothing equivalent happened here: a weapon only ever appeared in each subject's own
`required` list, so an unarmed subject needed no concession at all. The `armed` flag that now
sits beside `wheels` was added for the *negative* case only — an unarmed frame must be checked
for leftover turret rings, breeches and coil housings, exactly as the MK-CX is checked for
leftover road wheels. A machine still carrying the mounts for a weapon it no longer has looks
like the edit was abandoned halfway.

**A biped has no stability margin to be sloppy inside.** Eight feet give the walker a support
polygon it can land anywhere in; two feet in a row give none. So the leg pose table is authored
against a second constraint the walker never needed — the ankle has to stay under the hip
through the *entire* fold, not merely on the ground — and there is an invariant that says the
hip/ankle offset never leaves the sole. The related trick is that the ankle pivot carries the
negated shin angle minus the mount's 90°, which cancels the whole chain and leaves the foot
frame world-aligned. That, and not an IK solver, is what keeps both soles flat at every stance;
the invariant checks the sole's y-*extent*, not just its lowest point, because "one corner is
touching" and "flat on the ground" are different things and only the second one is wanted.

The one genuinely new shared generator is `cableRun` — a hose swept along a curve. The reference
sheet's signature is loom: bundles over both shoulders, three conduits down the spine, a run down
each calf, and none of that is an extrusion, a lathe or a box. Unlike `taperedBeam` it is mostly
a wrapper over `TubeGeometry`, and the honest justification is narrower: what it adds is the
contract the rest of that module keeps — non-indexed so the facets stay hard, `uv/uv1/uv2`
written, and a radial count chosen for a hard-surface hose. The constraint it carries in its
docstring is the load-bearing part: **a run must stay inside one rigid frame**, because there is
no skinning anywhere in this project and a hose authored across a driven pivot tears the moment
the joint moves. Every cable here stops at the shroud of the joint it appears to cross.

#### The bug the height figure caught

The title block quotes an overall height, and like the walker's figures it is derived rather than
typed — leg solve, plus the waist, plus the crown of the carapace. The first version read that
crown off `torso.profile` with `Math.max`, which was wrong by 9 cm: `extrudeProfile` scales
**both** caps toward the profile centroid, so the full-size profile never appears in the mesh at
all. The shell is the *tapered* profile swept between two tapered caps.

Nothing in the project would have noticed. The drawing would simply have printed a confident
2.68 m about a 2.59 m object, and the only way to find it is to measure the render. So the
invariant does exactly that: it walks the built vertices — not bounding boxes, because a
transformed AABB of a rotated cylinder is inflated by its own diagonal, which here is larger than
the tolerance being asserted — and requires that the highest point in the graph is within a
centimetre of the quoted figure *and* that the mesh it belongs to is the carapace. That second
clause is what forced the loom, the spine cover and the dorsal conduits down under the shell
instead of letting a hose quietly become the tallest thing on the machine.

### What the two-wheeler cost

The Moto // Pod is a hubless monocycle, and it is the first subject that cannot stand up on its
own. Two asset files, one descriptor, one registry line, one shared generator — and the useful
result is again mostly what it did *not* need.

**Hubless wheels were free.** Four of the five concentric rings on each wheel — mag-lev stator,
hubless motor, gyro sensor, mag-lev rotor — are `trackBand` with a single circle in the list.
That generator was written to trace the taut band around a tank's running gear via the support
function of a union of disks; a union of *one* disk is a circle, and the band around it is a
ring. The tank's track generator turned out to have been "a band around a set of disks" all
along, and nobody had to notice that until a vehicle wanted rings.

**The tyre was not free, and the reason is mechanical.** A flat-treaded tyre leaned over stands
on its shoulder edge, which is `sqrt(r² + (w/2)²) − r` further from the axle than the tread is:
the machine would climb as it banked and the contact patch would be a corner. So the tyre — and
only the tyre — is a new generator, `crownedTyre`, whose tread follows a circular arc across the
width. `trackBand` stays flat, because a track never leans.

**Leaning is a ground-contact problem, not a rotation.** Roll a vehicle about its own centreline
and the tyres go through the tarmac, so LEAN drives a pivot on the ground contact line. That
gets it most of the way and is still wrong, by an amount worth writing down: with a crowned
tread the contact point migrates round the crown to `u = −crown·sin t`, and working the lowest
point out from there, the axle has to sit at `radius·cos t + crown·(1 − cos t)`. A rigid roll
leaves it at `radius·cos t`, so the machine sinks by `crown·(1 − cos t)` — 20 mm at the 34°
lean limit. That correction is `afterArticulate`, and it has to hang on a node *above* the lean
pivot: it is a lift along world Y, and a child of the lean node would lift along the leaned Y
and be wrong by `cos t` at exactly the angles that matter.

That makes three subjects in a row using `afterArticulate`, and this one is the first whose
reason has nothing to do with legs. The walker's hull height and the exoframe's both fell out of
a limb solve; this one falls out of the shape of a tyre. What the hook actually generalises to
is *any vehicle whose ground contact moves as it articulates*, and a tree of rotations cannot
express that in any of the three cases.

**The steering has no rake and no trail**, which is a design decision the reference sheet
licenses rather than an omission: it declares DYNAMIC GYRO + AI ASSIST, so nothing on the
machine relies on caster stability. The geometric payoff is that a vertical steering axis
through the axle keeps the front contact patch directly underneath it. A raked axis drags that
patch sideways as the bar moves, and a schematic drawn at full lock would show a wheel hovering.

#### What is deliberately not corrected

Lean and steer interact. With both at their limits the front wheel's effective tilt is
`asin(cos ψ · sin θ)` rather than `θ`, so the contact solve above is off by ~24 mm at full lean
*and* full lock. Fixing it needs the machine to pitch about the rear contact — a third derived
degree of freedom, about 0.8° — and it is left out on purpose. Every elevation on the sheet is
dimensioned at zero lean and zero steer, where the solve is exact, and a drawing that quotes a
pitch angle it invented is worse than one that does not. The contact invariant therefore sweeps
the full lean range at zero steer, which is the claim actually being made.

#### Two things the invariants caught

The width figure is derived from the sponsons, which are the widest part of the machine, and
the check that the graph matches it failed the moment the magnetic access hatch was placed 5 mm
proud of them. That is the entire job of a derived title block: the drawing said 0.86 m and the
object had quietly become 0.87 m.

The bodywork also started as one extrusion with `frontScale`/`backScale` set to taper it, which
does not do that. Equal cap scales shrink the whole ZY profile about its centroid and extrude it
straight — so the fairing was a half-size prism floating inside a full-width box. The howitzer's
trail arms had already hit this and left a note; the fix here is the same one, which is not to
use cap scaling for shape. The body is four narrow extrusions stacked at different heights
instead, and the ovoid front elevation comes from the sponsons standing proud of the fairing.

### What the arm changed: the sliders stopped being the axes

Every subject before the RA-6 exposed its mechanism directly. A slider was a joint, a joint was
a rotation, and the number on screen was the number in the graph. That is the right default —
it is exactly what lets the viewer drive a machine it has never heard of — and for an arm it is
the wrong control. Nobody points a tool by reasoning about J1 through J6.

So on this subject **BEARING and TOOL PITCH are the head's aim, in world terms, and J1 and J5
are solved from them.** Drag SHOULDER, ELBOW and WRIST ROLL through their entire travel and the
head keeps aiming exactly where it was told to; the wrist absorbs the posture change. There is
an invariant that sweeps 180 combinations of the five controls and requires the head's measured
world direction to match the command to within 0.01°.

Three things made that fit the existing contract instead of breaking it.

**The commands ride on the axes they dominate.** BEARING's declared target is `J1_Pivot.y` and
TOOL PITCH's is `J5_Pivot.x`. A viewer that never calls `afterArticulate` therefore still gets a
working arm — just a joint-frame one, where the aim drifts as the arm moves. Degraded, not
broken: the same graceful fallback as a renderer that ignores the `emissive` attribute and draws
the part normally. Nothing in `src/render/`, `src/camera/` or `src/chrome/` knows this subject
is different from the tank.

**The solve is closed-form.** The tool axis in the J1 frame works out to a single sinusoid in
J5 — `sin(elevation) = cos(s)·cos(j5) − cos(j4)·sin(s)·sin(j5)` where `s = J2 + J3` — so it
inverts by writing it as `R·cos(j5 − δ)` and reading J5 straight off. No iteration, no solver
state, and the same numbers every build. An iterative IK seeded from the previous frame would
have made the scene graph non-reproducible, which is the same argument the Hepta-T's seeded
jitter makes about `Math.random`.

**The bearing falls out of the same vector.** With the wrist rolled, the aim leaves the arm's
own plane and J1 stops being the direction the head is looking. The solve takes the tool
vector's azimuth in the J1 frame and subtracts it, so BEARING means "where the head is looking"
rather than "where the arm is pointing" — which are not the same thing, and only one of them is
useful.

That is the fourth subject to use `afterArticulate` and the first to use it for something other
than ground contact. The walker's hull height, the exoframe's and the pod's ride lift were all
*where does this machine sit*; this is *which way is it looking*. What the hook has turned out
to be is the place where a fact a tree of rotations cannot carry gets computed — and an inverse
relationship between a command and two axes is that kind of fact.

#### The envelope is a design constraint, not a clamp

An arm has poses it cannot reach, and a schematic that silently fudges one is worse than a
schematic that cannot make the promise. The reachable elevation is bounded by
`R = sqrt(1 − sin²(s)·sin²(J4))`, whose worst case over the arm's travel is `cos(J4max)`. So the
commanded pitch is reachable everywhere if and only if

```
sin(pitchMax) <= cos(wristRollMax)
```

which is why ±40° of tool pitch and ±45° of wrist roll are a *pair* in the limits table rather
than two independent tastes. Widen the wrist roll without narrowing the pitch and the head
stops being able to hold its aim — silently, in the corners of the envelope nobody drags a
slider to. There is an invariant on the inequality itself, and a second that sweeps the envelope
and asserts the solved J5 never exceeds its declared travel (it peaks at 123° of 130°).

#### Two smaller things it turned up

The `armed: false` check is a heuristic over node names, and it flagged this machine as armed:
the J1 casting had been called `Turret_Mesh`, borrowed from the tank subjects. The right
response to a false positive on an ambiguous name is a better name — an industrial arm has a
base casting — not a weaker check.

The instrumentation and the controls were two independent absolute boxes in the same corner, so
the taller a subject's control panel got, the further the instrumentation ran underneath it.
The RA-6 declares seven joints and thirteen derived figures and put four readouts out of reach.
Any `max-height` would have been a fraction tuned to whichever subject was tallest that week, so
they share a flex column now: the controls take what they need and the instrumentation scrolls
in the remainder. Measured across every subject at 1400×900, nothing overlaps and only the two
tallest scroll at all.

### What the gimbal cost: nothing, and two millimetres

The GS-3 is twelve rings in three concentric sets about one point, on three perpendicular axes,
with a sensor ball at the centre. Two asset files, one descriptor, one registry line, and no new
geometry generator at all: every one of the twelve rings is `trackBand` with a single circle in
the list, which is the third subject running to lean on the tank's track generator as a general
ring primitive.

**The geometry is derived from one radius.** A gimbal ring pivots about its own *diameter* — its
axis lies in its own plane — so an inner set sweeps a sphere inside the next set's bore. That
single fact places everything: `ringStack` walks the three sets outside-in, and each set's outer
race is solved from the previous set's bore. Twelve typed radii would have been twelve chances
to put one ring through another, invisible until someone rotated a stage and watched the drawing
tear. The invariant drives all three stages through their declared travel and measures the real
gap on real vertices.

That invariant found the two millimetres. The first version of the nesting rule was
`outer = bore − clearance`, which is wrong: a ring has *width*, so its corners sit at
`sqrt(r² + (w/2)²)` from the centre, not at `r`. The rings still did not touch — but the
drawing's 22 mm clearance figure was a number nothing in the geometry honoured, and the real gap
was 20 mm. Solving for `r` instead makes the swept corner land exactly on `bore − clearance`.

The same class of error, one link further down the chain: the payload's aperture disc had been
seated by eye and its rim stood 0.5 mm proud of the ball, which put it inside the innermost ring
set. A disc of radius `a` is inscribed in a sphere of radius `R` at `sqrt(R² − a²)`; seating it
there and backing off half its thickness is exact, and the payload radius itself is just whatever
the innermost bore leaves.

#### Gimbal lock is quoted, not hidden

Three rings on three axes have a famous failure: at 90° of bank the elevation axis lies on top of
the azimuth axis, the two become one control, and the platform can no longer be pointed where it
likes. The axes' scalar triple product works out to exactly `cos(bank)`, so this is the real
condition rather than a proxy for it.

A real director accepts lock, adds a fourth axis, or restricts travel. This one restricts travel
— ±72°, stopping 18° short — and the title block carries `LOCK AT BANK ±90°`, `LOCK MARGIN 18°`
and `AXIS INDEP. 0.309` rather than a footnote. There is an invariant on the condition, on the
margin, and on independence falling monotonically as bank grows, so "margin" means something.

#### A machine that cannot be dressed

`cableRun` carries one rule in its docstring: a run must stay inside one rigid frame, because
there is no skinning here and a hose across a driven pivot tears. On a gimbal that rule has no
solution at all — nothing can cross three continuously-rotating axes without winding up. So the
machine uses different hardware: a slip ring on each axis, and all the dress-out (junction box,
conduit, data plate) on the fixed frame. That is the honest answer, and it is why this is the
first subject with a `Details_Group` that touches nothing which moves.

### What the rack changed: joints stopped being hinges

SERVER01 is the tenth subject and the first that is not a vehicle. Two things came out of that,
and both are about repetition.

**It earns an InstancedMesh, and it is the first thing since the tanks to.** Twenty-eight of the
compute sleds are the same part at the same pitch — twenty-eight copies of one static transform,
which is exactly the test the walker's docstring set when it declined to instance its feet. Five
subjects in a row had come out on the *other* side of that test; this is the first to come out
on this one.

**The twenty-ninth is not, for the same reason read backwards.** One sled is pulled out for
service, so it carries a different transform and has to be its own node — and getting it out
needed the project's first **prismatic joint**. Eight subjects of turret rings, trunnions,
trails, canopies and wrists had never made "a joint is a rotation, in degrees" have to be
anything else. A target can now say `prop: 'position'`, its range is in metres, and a target
that omits `prop` behaves exactly as it always did. One conditional in `applyArticulation`.

That extension brought a collision worth an invariant: `applyExplode` also writes `position`,
restoring every part from a stored rest pose. A node driven by both would snap back to wherever
the slider left it the first time anyone touched EXPLODE — so a position-driven node must not be
explodable, and the joint contract check now says so for every subject.

The other correction the extension needed was quieter. A position target sets an **absolute**
coordinate, exactly as a rotation target sets an absolute angle, so its `from` is the node's rest
Z rather than zero. Getting that wrong made the sled travel 0.20 m of its declared 0.62 m — and
`faceZ()` moved into the dimensions module so the builder and the joint could not disagree about
where "closed" is.

#### Two more accent channels, and why it was cheap

The brief asked for green light accents "like the MK-CX's lift emitters", plus red and white
buttons. Green and red are accent channels 3 and 4 — new colours, and *nothing on the asset side
changed to get them*: `registerPart(mesh, { emissive: 'tertiary' })` is the same call it always
was. Two palette entries and two shader branches. That is precisely what the Hepta-T bought when
it turned `emissive` from a boolean into a channel, and it took until now to collect.

Four is also the ceiling, which is worth knowing rather than discovering. The channel travels as
`emissive * 0.25` in an 8-bit alpha, so 1–4 land on 64, 128, 191 and 255 and come back exactly;
a fifth would encode as 1.25, clamp to 1.0 and silently render as channel 4. `EMISSIVE_MAX`
exists so that limit is asserted, and an invariant sweeps every subject against it.

**White is the one colour the schematic cannot say.** The blueprint's paper is itself near-white,
so a white accent is invisible on it. The illuminated start buttons are therefore a white PBR
material with a lit *green ring* — which is both what a real illuminated start button looks like
and the only version of "white button" that survives being drawn on paper.

#### A rack is a pitch before it is a shape

EIA-310 fixes the rack unit at 44.45 mm, so the layout is a table of U spans and every Y on the
machine is `u * U`. Nothing is eyeballed vertically, the 2.000 m height is plinth + 42U + cap,
and an invariant checks that the elevation covers all 42 units exactly once — two units claiming
one slot is a collision and a gap is a hole, and neither is visible in a render of a closed rack.

It also ships **open**: front door at 118°, rear at 96°, one sled 0.42 m out. Every other subject
rests closed because a vehicle's silhouette is the drawing; a rack's silhouette is a box, and
everything worth dimensioning is inside it.

#### Two things that cost part ids

The first pass modelled the vent grids, port rows and heatsink fins as individual meshes and
spent 215 of the id channel's 255 on louvres. They are each *one* part — a vent grid belongs to
its panel, a port row is a connector block, a heatsink is a heatsink — so they merge into single
geometries, and the count came down to 82. The same argument makes each fan rotor one mesh
rather than a hub and seven blades: the outline pass would otherwise draw a seam through the
middle of a turned component that has none.

`instancedGear` also grew a second time. It had been renamed from `wheels` by the Moto // Pod;
now it holds the node *name*, because the check hardcoded `Wheels_Instanced` and a rack has no
version of that noun. Twice a vehicle assumption has been filed off this flag, and both times the
fix was to let the subject say what it has instead of the checklist guessing.

### What the container cost: a hollow box that both renderers agree on

The CX-20 is the eleventh subject and the first you look INTO rather than at. That turns out to
be a modelling constraint rather than a framing choice, and finding out why is the interesting
part.

**The two display modes disagree about back faces.** The blueprint pass renders the whole scene
with `side: THREE.DoubleSide`, so a container whose walls were single-sided planes would look
completely correct in the schematic — and you would see straight out through the back of it the
moment anyone pressed GAME / PBR, where the standard materials cull. One mode would have hidden
the bug the other showed.

So the walls are real sheets with thickness, which needed the one new generator:
`corrugatedPanel`, a solid folded sheet with an outer surface, an inner surface and closed
edges. `extrudeProfile` could not do it — a corrugation is about as non-convex as a profile
gets, and that generator fans its caps on an assumption of convexity. Neither renderer changed.
There is an invariant that measures each wall's thinnest dimension, because "it is a sheet, not
a plane" is exactly the sort of thing that survives a refactor by accident.

**The fold pitch is derived per panel.** A wall that ends on a half fold is a wall nobody
pressed, so `foldPitch` snaps the pitch to divide its panel exactly — which is why the side, end,
roof and door pitches are four different numbers rather than one taste.

#### The standard is the design, and it caught three errors

ISO 668 fixes a 1CC at 6.058 × 2.438 × 2.591 m and ISO 1161 fixes the corner castings. Those are
not styling; they are the reason the format works, and a futuristic container that stopped
fitting a spreader would have thrown the brief away. The envelope is measured on the built
vertices — and it failed three times, each for a real reason:

- **The casting lock lamps stood 8 mm proud of the top castings.** Anything above them is what
  the next container down the stack lands on. They are recessed flush now.
- **The telemetry panel and readout stood 34 mm past the front face**, mounted on the outside of
  the corrugation rather than in it. A fitting outside the envelope is a fitting a cell guide
  shears off.
- **The cam-rod hardware stood 66 mm proud of the door end even stowed.** The leaves are
  recessed behind the corner posts now. The envelope test runs in the *shipping* configuration —
  doors closed, handles stowed — because that is the only configuration the envelope is a claim
  about; a real cam handle swings outside it while you are unlocking, and the box is not in a
  cell guide while you do that.

A fourth came from the interior. The clear internal length first came out 5.75 m against a real
1CC's 5.90, because the derivation subtracted the corner posts as well as the sheet — but the
corrugation bulges *outward*, so the interior boundary is the trough and the post sits behind
the wall rather than inside it. Corrected, the internal volume lands at 33.9 m³ against a real
20 ft's ~33.1.

#### Two invariants that were asking the wrong question

The interior checks were first written against the clear internal prism, and they flagged the
four top corner castings and both open door leaves — all of which are exactly where they belong.
A container's usable space has fittings in its corners and stops short of the door opening; the
prism drawn right into the corners is a number for a brochure, not a volume anything sits in.
Both tests moved to a **cargo envelope** derived from where the unit load actually sits.

That reframing then found a real fault. With the leaves hinged on the corner posts' *inner*
edge, a door folded back to 262° ended up inside the box's own footprint. A container door hangs
near the post's outer face and is wide enough that the two leaves meet on the centreline — which
is what lets it close *over* its frame and, folded back, lie outside the side wall. The load also
moved forward on the deck, because freight is loaded from the front and the last row was sitting
under the folded-back hardware.

#### One change in display code

`main.js` used to find the collision proxy with
`getObjectByName('Hull_Collision') || getObjectByName('Chassis_Collision')` — display code
holding a list of asset node names, one short every time a subject named its proxy something
else. This subject's proxy is `Torso_Collision`, which would have made the list three long. It
reads `userData.isCollision` instead, which is the actual contract and is what the invariant
suite has always asserted. Same argument as the subject registry replacing a hardcoded list of
ids: a menu is not a reason for the viewer to know what it is drawing.

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

Two flags keep the shared list honest about what a subject actually is: `instancedGear` (added
by the MK-CX, which hovers) and `armed` (added by BP-Headless01, which has hands instead of a
gun). Both check the negative case as well as the positive one — a subject that declares no
instanced running gear must carry no orphaned road wheels, and a subject that declares no
armament must not still be carrying a breech.

The first flag was called `wheels` until the Moto // Pod, which made the name undeniably wrong:
that subject is *mostly* wheels and instances none of them. It had never meant "has wheels" —
the walker set it false with eight legs — it meant "the running gear is one InstancedMesh". Now
it says so.

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
| 5 — export | partial. GLB round-trips correctly: spec node names survive, `Turret_Pivot.translation` is `[0, 1.66, -0.35]`, `Barrel_Pivot` stays its child at the trunnion, TEXCOORD_1 is present, wheels survive as `EXT_mesh_gpu_instancing`. The round-trip probe resolves everything it checks from the subject's own declared joints, so it runs unchanged on the unarmed, wheel-less, legged subjects too — BP-Headless01 exports 163 nodes with its waist and arm pivot chains intact. **Nothing has imported it into a second engine**, so "engine-portable" is a well-formed-file claim, not a tested rigging claim. No LOD tiers. |

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
