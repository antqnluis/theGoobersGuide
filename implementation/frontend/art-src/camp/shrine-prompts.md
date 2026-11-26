# Shrine stone art brief (M04 Phase 0)

The Maker's Visions is a new camp destination: a shrine stone beside the campfire (see `docs/in-progress/M04-Crafting-Guide-Plan.md`, W13/W14). It needs one source sheet with two sprites, an idle state and a lit state. The lit state shows while the viewing character has something new in their guide.

## Where it stands

- Spot: `x 625, y 246` (bottom centre, base art pixels on the 960 x 270 panorama). It sits between the cream bedroll (x 580, spans about 559 to 602) and the map table (x 690, spans about 667 to 713), about 7 px clear of the bedroll and 26 px clear of the table. The farthest party seat is at x 566, so it never covers a seated figure.
- Its depth (`y 246`) draws it behind the bedrolls (`y 252 to 260`) and in front of the map table's back edge (`y 242`), so the stone reads as standing a little behind the circle.
- Click target: about 36 x 44 art pixels (the sprite plus a margin).
- Target sprite size: **about 28 to 32 px wide and 40 to 44 px tall**, matching the journal crates (32 x 38) and the waystone (44 x 60). It should read clearly smaller than the waystone, which stays the camp's tallest landmark.

## Look

A small weathered standing stone, taller than wide, slightly leaning, with a flat top worn smooth. Carved maker's marks run down its face: a hammer, an anvil, a gear-like ring, and a few tally strokes, cut as shallow grooves. A short plinth of two or three flat stones at the base. A thin curl of faint smoke or incense rises from a small brass dish set on the plinth. It should feel old, warm, and a little mysterious: a place where something crafted is remembered, not a magic portal. The waystone is cold blue and tall, so the shrine uses **warm ember light** (orange and gold) to contrast.

- **Idle:** the carvings are dark grooves. The brass dish holds a few dull coals and a wisp of smoke.
- **Lit:** same silhouette, same pixels for the stone, but the carved grooves glow warm gold and orange, the coals burn bright, and a small halo of embers sits at the top. Keep the lit state inside the same bounding box so the sprite never shifts.

## Pipeline rules

Source sheet `shrine.png` with sidecar `shrine.json`:

```json
{"scale":0.048,"key":"#ff00ff","gap":40,"materials":["rock","wood","brass","fire","ink"],"sprites":["shrine-stone","shrine-stone-lit"],"provenance":"ChatGPT, comp A style; shrine stone"}
```

- Flat magenta `#ff00ff` background, no shadow on the ground, no text.
- Two objects side by side with **clear magenta between them (at least 60 source pixels)**, idle on the left and lit on the right. The sprites are named in reading order.
- About 8 source pixels per art pixel (`scale 0.1` gives roughly a 320 x 420 source per sprite for a 32 x 42 result). The pipeline snaps to the master palette, so exact colours do not matter.
- Stone uses the `rock` ramp so it recolours per world type. Glow uses `fire` and `brass`, not the cyan `glow` ramp, which is reserved for the waystone.
- True pixel art on a strict grid, crisp hand-placed dithering, no anti-aliasing, no gradients, hue-shifted shadows, light from the campfire on the left.

## Prompt (ChatGPT, 1:1 or 4:3)

> True pixel art on a strict pixel grid, no anti-aliasing, no gradients, classic 16-bit RPG look with about 24 colours. A flat magenta (#ff00ff) background with no ground shadow and no text. Two copies of the same small prop side by side with a wide gap between them: a weathered standing shrine stone, taller than wide, slightly leaning, flat worn top, with shallow carved maker's marks (a hammer, an anvil, a ring like a gear, and a few tally strokes) running down its face, standing on a short plinth of two or three flat stones, with a small brass incense dish on the plinth. Left copy, idle: carvings are dark grooves, the dish holds dull coals and a faint wisp of smoke. Right copy, lit: identical silhouette and stone, but the carvings glow warm gold and orange, the coals burn bright, and a few embers drift above. Cool blue-grey stone, warm orange firelight from the left, deep shadows. Same visual style as a night campsite on a forest planet.

## Delivery

Save the generated image as `implementation/frontend/art-src/camp/shrine.png` (the sidecar above is already in this file), then run `npm run art:build` and `npm run art:check` from `implementation/frontend`. Until the art lands, Phase 2 mounts the DM tab behind the new location with a placeholder sprite, as the plan allows.
