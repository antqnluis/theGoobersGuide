# Layer prompts, batch 1 (terrestrial core)

Direction chosen: **comp A, classic 16-bit warm firelight** (`docs/art/camp-comp-a.png`). In ChatGPT, attach that file to every request and start with:

> Match the attached image's pixel-art style, colour palette, and night lighting exactly. True pixel art on a strict grid, no anti-aliasing, no smooth gradients, no text. Hue-shifted shadows, crisp hand-placed dithering.

Save each result as `art-src/camp/<name>.png` (the name in the heading). Don't bake firelight into anything: the fire's glow is drawn in code, so keep everything lit by cool night light only (lanterns and the waystone excepted). Where a prompt says "flat magenta", use pure `#ff00ff` with nothing else touching that colour. I clean up size, crop, and palette in `art:build`, so one clean result per file is enough.

Wide layers: ask for a **3:2 canvas (1536×1024)** and keep all content inside the **middle horizontal third** so I can crop a wide strip.

## sky

Night sky only: deep navy, many small stars with a few bright four-point sparkles, a soft Milky Way band, and one small warm orange star low near the horizon at centre. No ground, trees, or hills. Fills the whole canvas.

## ridge

Distant teal rolling hills, a single soft silhouette with two or three overlapping ridge lines, in the middle third. Everything above and below on flat magenta.

## trees

A dense mid-distance pine forest silhouette in very dark blue-green, a slightly ragged crown line, in the middle third. Flat magenta above and below.

## ground

An empty night meadow floor seen from slightly above: dark moss-green grass with tufts, a few small stones, a few tiny white flowers. No fire light, no props. The top edge is an irregular grass line against flat magenta; the grass fills the rest of the middle third downwards.

## foreground

Foreground framing only: one large pine trunk with branches at the far left, one at the far right, mossy boulders and ferns along the bottom, all on flat magenta. The middle stays empty magenta.

## wagon

The steward's wagon: canvas-covered, wooden wheels, a blue banner with a gold compass star, a lantern hanging from a bracket glowing warm yellow, and a small iron-banded ledger chest on the ground beside it. Side view, flat magenta background, 1024×1024.

## waystone

A tall standing stone with moss at the base and a glowing blue star rune with a faint cyan glow on the ground around it. Flat magenta background, 1024×1024.

## firepit

A ring of rounded stones around a bed of unlit logs and dark embers, **no flame and no glow**. Seen from slightly above. Flat magenta background, 1024×1024.

## bedrolls

Six bedrolls laid out spaced apart in a 3×2 grid on flat magenta, each a different colour and pattern (red, blue, green, purple, gold, striped cream), each seen from slightly above. 1536×1024.

## props

On flat magenta, spaced apart: a wooden map table with an unrolled map, a quill, and an inkwell; a stack of three journal crates with book emblems; a small empty canvas tent. 1536×1024.

---

Batch 2 will cover the other five biome skylines (desert, volcanic, frozen, rocky, gas) and the adventurer sprites. I may hand-author the small sprites as pixel maps in code instead, since AI sprites of this size are inconsistent and the palette swap needs exact colours.

---

# Batch 1 fix, foreground (regenerate)

Replace `foreground.png`. The first version cut the trunks flat. Attach the old `foreground.png` and comp A, and ask:

> Redo this foreground framing. Same style and colours. The two big pine trunks must run all the way up and off the **top edge** of the canvas, with a few branches at different heights, and the boulders, ferns, and flowers must run flush to the **bottom edge**. Use the **full height** of the 3:2 canvas (1536x1024), not just the middle third. Keep the middle 50% of the width empty flat magenta (#ff00ff). Pixel art, no anti-aliasing, no text.

# Batch 2: other biomes

The sky, props, and bedrolls recolour from the terrestrial set, so each biome needs only its own landscape shapes. **Keep the terrestrial colours** (blue hills, dark green foliage, moss-green ground, same dark night values): the game recolours them per world, and only exact master-palette hues recolour. Only the shapes change.

For each biome, generate **one 3:2 canvas (1536x1024)** with three stacked bands on flat magenta (#ff00ff), attaching `ridge.png`, `trees.png`, and `ground.png` as style references:

- **top third:** the far ridge silhouette, bottom-aligned in the band
- **middle third:** the mid-distance layer, bottom-aligned in the band
- **bottom third:** the ground floor, top edge irregular, filling down to the bottom of the band

Leave a clear magenta gap between bands. Save as `biome-<name>.png`.

## biome-desert

Ridge: long soft dune crests. Mid: scattered saguaro-like cacti, dry shrubs, and a few rock spires. Ground: sand ripples, pebbles, a few dry tufts.

## biome-volcanic

Ridge: jagged volcano silhouettes with one broad cone. Mid: dead twisted trees and tall basalt columns. Ground: cracked ash and basalt slabs, a few small rocks.

## biome-frozen

Ridge: smooth snow-capped peaks. Mid: snow-laden pines and ice spikes. Ground: snow drifts, ice patches, tufts of frozen grass.

## biome-rocky

Ridge: broken mesa and cliff silhouettes. Mid: stunted scrub and boulder stacks. Ground: scree, flat stones, sparse lichen tufts.

## biome-gas

Ridge: billowing cloud banks. Mid: floating cloud-reef stacks and coral-like spires. Ground: a cloud-reef highland of soft rounded lumps, sparse tufts of cloud-grass.

---

The adventurer sprites in batch 2 are hand-authored in code (exact palette, so the cloak and skin swaps stay precise), so there is nothing to generate for those.
