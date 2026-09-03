# game-exports — reverse exports from spherical-stalberg-grid

Units **as the game dresses them**: the cast model plus what the game adds —
the shell rack, the heat sleeves, the health-tinted materials, the edge
outlines (glTF LINES). Produced by the units viewer's EXPORT button there
(`#units?unit=<id>`), or headless with `?export=1&dump=1`. The token in the
filename is that repo's build token at export time. Root node: `<id>_Game_Root`.

These are for looking at on the bench, not for building from: the authored
subject in `src/` is the source; this is what it became.

Committed on purpose: `.gitignore` un-ignores this directory's `.glb`, because the viewer
serves it (`?subject=mkcx2game`) and Pages deploys straight from main.
