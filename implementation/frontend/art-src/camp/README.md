# Camp art sources

Drop generated or hand-edited source images here (`.png`, `.jpg`, `.webp`), then run `npm run art:build`. Each source becomes a grid-exact, on-palette indexed PNG in `src/features/campaigns/camp/art/` and an entry in its `manifest.json`.

An optional sidecar `<name>.json` can set:

- `cell`: source pixels per art pixel (detected automatically when omitted)
- `key`: background colour to clear, as `#rrggbb` (for sprite parts on flat backgrounds)
- `parallax`: layer speed, 0 to 1
- `provenance`: the generation prompt or edit notes, recorded in the manifest

`npm run art:check` fails on any off-palette colour, partial alpha, extra PNG chunk, or size that disagrees with the manifest. `npm run art:placeholder` writes the procedural PLACEHOLDER layers.
