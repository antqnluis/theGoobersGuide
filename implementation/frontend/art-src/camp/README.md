# Camp art sources

Drop generated or hand-edited source images here (`.png`, `.jpg`, `.webp`), then run `npm run art:build`. Each source becomes grid-exact, on-palette indexed PNGs in `src/features/campaigns/camp/art/` and entries in its `manifest.json`. `npm run art:review -- <outDir> [worldType]` composites the shipped art into a preview panorama and a 4x crop, recoloured for any world type.

An optional sidecar `<name>.json` controls how a source is converted:

- `key`: background colour to clear, as `#rrggbb` (flat magenta for cut-outs)
- `scale`: multiply the source by this before quantizing, for ungridded sources (about 8 source pixels per art pixel for props)
- `materials`: the materials the asset may use (see `masterPalette.ts`). Restricting them keeps biome colours (`sky`, `haze`, `ground`, `foliage`, `rock`) recolourable per world
- `layer`: `{ tile, offsetY, mirrorDown? }` places the result on a full 960x270 parallax layer. `tile` is `mirror` (seamless repeat), `edges` (left half left, right half right), or `none`
- `sprites`: names for the separate objects on a sheet, in reading order (omit for a single sprite); `gap` merges parts closer than that many source pixels
- `cell`: source pixels per art pixel, for a source already on a clean grid
- `parallax` and `provenance`: recorded in the manifest

`npm run art:check` fails on any off-palette colour, partial alpha, extra PNG chunk, or size that disagrees with the manifest. `npm run art:placeholder` writes procedural PLACEHOLDER layers.

`comp-prompts.md` and `layer-prompts.md` hold the prompts used to generate the style comps and the batch 1 layers.
