/**
 * MK-CX/2 — the MK-CX with the top taken off.
 *
 * Same tub, sponsons, nacelles and armament as the MK-CX; what changes is everything above the
 * sponson line. The MK-CX carries a faceted turret block on a raised deck, and in the game a
 * shell rack rides on a plate above that block again — three stacked things where the
 * silhouette wants one. Here the deck is lower and FLAT from the glacis to the tail, the main
 * gun sits in a blade of a turret a third the old height, the nine shells are racked flush in
 * the rear deck, and two long indicator strips run the deck's length on top. The read is a
 * wedge — a supercar's plan view with a gun on it — not a tank with a hat.
 *
 * Every number here is a deviation from CXDIM; anything not restated is the MK-CX's.
 */
import { CXDIM } from '../mkcx/dimensions.js';

export const CX2DIM = {
  ...CXDIM,
  hull: {
    ...CXDIM.hull,
    deckY: 1.40,        // 1.52 -> 1.40: the whole roof drops, and it is one plane now
    noseZ: 3.80,
  },
  turret: {
    // A blade, not a block: 0.34 tall against the MK-CX's 0.78, wider (2.30) so the gun still
    // reads as carried by something. Sits directly on the deck plane.
    ringZ: -0.30,
    // ELEVATED (operator, 2026-09-03: the gun clipped the secondaries on
    // traverse). The blade stands on a faceted pedestal 0.22 above the deck;
    // with the trunnion at 0.40 the bore is at 2.02 and the barrel's
    // underside clears the secondaries' shells (top 1.60) by 0.27 at the
    // crossing. The invariants test sweeps the full traverse to prove it.
    ringY: 1.62,
    pedestal: { height: 0.22, width: 1.80, length: 2.20 },
    width: 2.30,
    profile: [
      [-1.34, 0.00], [-1.46, 0.12], [-1.16, 0.30], [0.70, 0.34],
      [1.34, 0.18], [1.46, 0.05], [1.34, 0.00],
    ],
  },
  barrel: {
    ...CXDIM.barrel,
    // The cradle stands proud of the blade: a gun needs a trunnion, and a bore at deck level
    // would sweep straight through the secondaries. 0.38 puts the barrel's underside just over
    // their (lowered) shells at the crossing.
    trunnionY: 0.40,
    trunnionZ: 1.10,
    mantlet: { width: 0.92, height: 0.44, depth: 0.50 },
  },
  secondary: {
    ...CXDIM.secondary,
    y: 1.33,            // on the lower glacis
    // three quarters the MK-CX shell, so the main gun clears them
    profile: CXDIM.secondary.profile.map(([z, y]) => [z, y * 0.75]),
    gunTrunnionY: 0.15,
  },
  applique: { hull: CXDIM.applique.hull, turret: [] },   // nothing bolts onto a blade
  glow: {
    barrel: CXDIM.glow.barrel,
    // along the blade's edges rather than on a turret's flanks
    turret: [[1.16, 0.16, -0.10, 0.03, 0.05, 1.70], [-1.16, 0.16, -0.10, 0.03, 0.05, 1.70]],
    hull: CXDIM.glow.hull,
    // THE DECK INDICATORS: two long strips on top, the length of the flat deck, outboard of
    // the blade. These are what a health tint paints from above.
    deck: [[1.42, 1.425, -1.35, 0.26, 0.05, 4.30], [-1.42, 1.425, -1.35, 0.26, 0.05, 4.30]],
  },
  // The shell rack: nine flush sockets in the rear deck, row-major, the game's own dots sit in
  // them. Spacing matches the game's makeShellRack defaults for this model.
  rack: { z: -2.85, gapX: 0.46, gapZ: 0.50, socket: 0.17, depth: 0.04 },
};
