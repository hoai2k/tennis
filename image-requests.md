# Cursed Court — Image Requests (Pending)

Six new court-select preview cards. Same treatment as the delivered
`court-{shibuya,nevarro,night}.jpg` batch: painted arcade key-art of a tennis
court seen from a low three-quarter angle, stands and skyline behind it,
vibrant cartoon colors, no text, no characters. Each drops into an existing
`<img>` slot on the court-select screen (`src/ui/screens/courtSelect.ts`);
the CSS-art fallback stays behind it, so any that are missing simply show
the fallback.

All are **size 640×400 (16:10), JPG, no transparency**.

## 1. `public/images/court-jujutsuhigh.jpg` — Jujutsu High Lawn (JJK)
Bright spring day at a Japanese school campus in the mountains. Green grass
tennis court with white lines, tan gravel apron, dark-wood stands. Cherry
blossom trees in full pink bloom around the stands, a red torii gate and a
tiered pagoda silhouette on forested hills behind, soft blue sky with puffy
clouds. Palette: grass green #2e8b3f, gravel tan #b9a06a, sakura pink #e86a8a.

## 2. `public/images/court-dune.jpg` — Dune Sea (Star Wars / Tatooine)
Desert tennis court of packed golden sand with dark-brown painted lines,
adobe walls and stands. Rolling dunes to the horizon, a distant rusty
sandcrawler and a couple of moisture vaporators. **Two suns** low in a warm
haze-yellow sky — classic binary sunset. Palette: sand #e0b36a, adobe
#9a7a48, sky horizon #ffe9b0.

## 3. `public/images/court-mandalore.jpg` — Mandalore Dome (Star Wars)
Moody dusk court of polished blue-grey beskar-steel plates with pale-teal
glowing lines. Grey-teal stands, and on the horizon the shattered glass
domes and broken spires of a ruined Mandalorian city, low mist hugging the
ground, green-grey sky. Palette: steel #4a6070, glow teal #4fd0a8, sky
#2a4a4f→#9ac9b8.

## 4. `public/images/court-foundry.jpg` — Mayhem Foundry (Mech Mayhem)
Industrial robot-foundry arena: dark gunmetal deck-plate court with hazard
yellow painted lines, safety-orange and steel stands. Smokestacks with
glowing furnace mouths and blocky factories against a burning orange smog
sky, molten glow on the horizon. Palette: gunmetal #5a626c, hazard yellow
#ffcf2e, molten orange #ff6a1f.

## 5. `public/images/court-circuit.jpg` — Neon Circuit (Mech Mayhem)
Night e-sports mech arena in the MECH MAYHEM style: near-black navy court
(#0c1626) with glowing cyan (#38e8ff) lines, dark city skyline dotted with
neon lights, starfield sky, floodlight towers, a hot-pink (#ff4f8a)
secondary accent. Tron-like, sleek, high contrast.

## 6. `public/images/court-random.jpg` — RANDOM card
A swirling purple-and-gold "mystery court" portal: a tennis court dissolving
into a cosmic vortex that hints at all the worlds (a wisp of sakura, a sand
dune, a neon glow at the edges). Big glowing golden "?" is added by the UI
as an overlay, so **leave the center readable but empty of text**. Palette:
deep purple #2a2440, gold #ffd94f.

## How to add a new request
Add an entry below with: target **path** (under `public/`), **size**,
transparency yes/no, and a short **style prompt**. The game prefers assets
that drop into an existing `<img>` slot with a procedural fallback, so include
the intended screen/usage too.
