# Cursed Court — Image Requests (Pending)

## ⭐ Character-select portraits — all 20 fighters

Painted key-art portraits to replace the 3D-rendered ones currently in
`public/portraits/`. These are the face of the character-select screen, so
they carry more of the game's personality than any other art in it.

### Delivery spec (applies to every portrait)

| | |
|---|---|
| **Path** | `public/portraits/<id>.png` — exact ids in the table below |
| **Size** | 1024×1024 (square; the game downsamples) |
| **Background** | **Transparent.** A soft radial glow in the character's accent colour behind the figure is welcome, but no hard backdrop — the card tints show through |
| **Framing** | Head-and-upper-chest, filling the square. Chin around the lower third, a little headroom, shoulders cropped by the frame edges. The image is displayed with `object-fit: cover` in a square, so **nothing important within ~6% of any edge** |
| **Readability** | Must read at **two sizes**: ~110 px grid tile and ~200 px info panel. Silhouette and eyes have to survive the small one |
| **Files** | One PNG per fighter, overwriting the existing render |

### House style

Bright, saturated, cel-shaded anime key art with **chunky dark outlines** —
the arcade-poster energy of a Mario Tennis character select, not a realistic
render. Hard-edged shadow shapes, a bright rim light on the side away from
camera, high contrast so each face pops against a busy screen. Confident,
game-face expression: this is their tournament portrait — a smirk, a glare, a
grin. Slight upward hero angle. Keep the line weight and palette consistent
across all twenty so they read as one roster.

**No racquets, no tennis gear, no props in frame** — the portrait is the
character only. Costume stays canonical (see references); we are not putting
anyone in tennis whites.

### References — please open these before drawing

- **Jujutsu Kaisen (7)** — canonical art lives in the companion repo:
  `https://github.com/hoai2k/jjkbrawler/tree/main/assets/reference/canon`
  **The `<char>_idle.png` file is the authority** for costume, proportions,
  age, palette, line weight and shading. Where anything else disagrees with
  the idle, the idle wins. (`roster_idle.png` there shows the whole cast at
  matched figure scale if you need relative sizing.)
- **The Mandalorian (6) and Mech Mayhem (7)** — their **3D models are canon**:
  `public/models/<id>.glb` in this repo. Match the model's shapes, materials
  and colour scheme; the portrait is a stylised painting *of that model*, not
  a redesign. The existing `public/portraits/<id>.png` renders show the model
  from a usable portrait angle if that helps as a starting block-in.

> **Accent colour ≠ paint colour.** The accent in the tables below is the
> character's *UI* colour (card tint, trails, star shots) and often does not
> match the model's actual materials — Saurion's accent is green but the mech
> is black with red glow; Vulcan's accent is red but the armour is weathered
> white-grey with red panels. **Always match the reference's real colours**
> and use the accent only for the rim light and the background glow.

### The roster

Accent colour is the character's in-game theme colour — use it in the rim
light or glow so the portrait ties to their UI card.

#### Jujutsu Kaisen — reference: `assets/reference/canon/<file>` in `hoai2k/jjkbrawler`

| id | Character | Reference (idle = canon) | Accent | Portrait direction |
|---|---|---|---|---|
| `yuji` | Yuji Itadori | `yuji_idle.png` | `#e8514a` | Salmon-pink spiked hair over dark shaved sides; navy Jujutsu High uniform with the red hooded collar bunched at the throat, gold buttons. Open, game-for-anything grin — the eager one. |
| `megumi` | Megumi Fushiguro | `megumi_idle.png` | `#3b5fb8` | Black hair spiked outward in sharp points; navy uniform with the wrapped high collar and single gold button. Flat blue-grey stare, unimpressed; cool blue key light. The composed one. |
| `nobara` | Nobara Kugisaki | `nobara_idle.png` | `#e07a35` | Orange-brown bob with an inward curl, brown eyes; cropped navy uniform jacket, stand collar, three gold buttons down the front. Chin up, cocky half-smile — dares you to pick someone else. |
| `maki` | Maki Zenin | `maki_idle.png` | `#3fa66b` | Dark-green hair in a high ponytail with a straight blunt fringe, **red-framed rectangular glasses** (not round), pale green eyes. Navy high-collar uniform jacket, gold pin at the collarbone. Hard confident smirk; sharp jaw light. |
| `naoya` | Naoya Zenin | `naoya_idle.png` (extra: `naoya_anime.png`, `naoya_fullbody.jpg`) | `#8fd0e8` | Short **blond / olive-blond** hair with a jagged fringe, small earring, narrow half-lidded eyes. **Not a school uniform** — a black crossed-collar kimono/haori over a white high-buttoned under-collar. Smug, condescending smirk. Cold pale-cyan rim. |
| `jogo` | Jogo | `jogo_idle.png` | `#d63c2a` | One huge round eye in a pale grey-white head, wide mouth of pointed teeth; the skull opens into a **volcano crater crown** with orange lava welling over the rim, cork-like plug at the ear. Thick white fur collar, mustard mantle with big black spots. Ember light from below the crater. |
| `mahito` | Mahito | `mahito_idle.png` | `#7f6fd4` | **Long pale blue-grey hair** past the shoulders (not short or tousled grey), patchwork skin with visible **stitched seams** crossing the cheek, jaw and neck, mismatched grey-blue eyes. Black sleeveless top with a thin grey grid pattern; bare stitched arms. Playful, unsettling smile. |

#### The Mandalorian — reference: `public/models/<id>.glb`

| id | Character | Accent | Portrait direction |
|---|---|---|---|
| `din` | Din Djarin | `#9fb2bd` | Silver beskar helmet head-on: T-visor catching a hard specular streak, round ear discs, battle-scuffed plate. No face — the helmet *is* the portrait. Brown leather cape draped over one pauldron, brown chest wrap under grey armour. |
| `ig11` | IG-11 | `#c9c9c9` | Narrow cylindrical droid head with a domed cap and a thin **red photoreceptor slit** banding it, small antenna prongs jutting sideways, spindly neck onto a weathered gunmetal frame with bandolier straps. Deadpan machine stillness; cold steel palette. |
| `bossk` | Bossk | `#b9c25a` | Trandoshan: olive-khaki scaled hide, blunt reptilian snout with jagged teeth, a crest of small horns and spines over the brow, **red-orange eyes**. Tan flight suit with buckled bandolier straps and pouches. Predatory half-open jaw. |
| `tusken` | Tusken Raider | `#c9a26a` | Head fully wrapped in sand-coloured cloth, twin round metal **goggle lenses**, a ribbed breathing tube curling from the mouth grille down to the chest. Bandolier and layered desert wrappings. Menacing forward lean; warm sand light. |
| `quarren` | Quarren | `#5f8f8f` | Rust-orange squid head with **four thick face tentacles** hanging over the mouth, small dark eyes set wide on the sides of the skull, leathery mottled skin. Worn dark green-grey coat with buckled straps. Damp cool-teal underlight. |
| `duelist` | Cad Bane | `#3f7fa8` | Blue-skinned Duros, gaunt lined face, **red eyes** under the brim of a wide black hat, twin **breathing tubes** running from the corners of the mouth up to sockets at the temples. High-collared dark duster. Gunslinger stare. |

#### Mech Mayhem — reference: `public/models/<id>.glb`

| id | Character | Accent | Portrait direction |
|---|---|---|---|
| `titanus` | Titanus | `#ffa832` | "The Iron Avalanche" — the heaviest mech. Slab **mustard/amber armour** with chipped black edges and hazard weathering, `TITANUS` stencilled on the shoulder pad. Small head sunk between enormous shoulders, a **single round amber optic** in its housing. Immovable mass. |
| `konga` | Konga | `#d98a2a` | **Cyborg gorilla, not a mech suit**: a real black-furred gorilla head and face — heavy brow, organic muzzle, brooding eyes — with rusted plating bolted along the skull and jaw and cables at the temple. Blue and rust-red painted shoulder armour, **missile-pod racks over the shoulders**, muscular organic torso. Chest-beating aggression. |
| `saurion` | Saurion | `#5fd06a` | Raptor mech in **glossy black armour with red glowing accents and red glyph decals — not green**. Long predatory snout, and a **fan of long black bladed quills** running from the skull down the neck and spine. Spiked tail, hooked claws. Quick and lethal. |
| `nullbot` | Nullbot | `#9a5fff` | Not a smooth droid — a **black demonic armoured figure**: horned helmet with **glowing red slit eyes**, a red rune-glyph burning on the chest, and **violet and teal crystalline spikes** erupting from the shoulders, forearms and shins. Clawed gauntlets. Eerie and unreadable. |
| `fenrir` | Fenrir | `#9fb8e8` | Wolf mech in dark blue-steel plate: long lupine muzzle, upright ears, a **mane of blade-like spines** down the neck, pale ice-blue optics. Jaw slightly open. Lean and fast. |
| `frogger` | Frogger | `#3fd08a` | Squat amphibian mech, wide toad head with huge domed optics — coated head to foot in **bright acid-green ooze that drips and strings off every edge** (the slime is the signature; don't leave it out). Dark grey mechanical joints and hoses underneath. Comic bulk. |
| `vulcan` | Vulcan | `#e8503c` | Artillery mech in **weathered white-grey plating with red-orange panels** (not all-red). Huge boxy shoulder pods, a small visored head sunk between them, and **rotary gatling barrels for forearms**. Stencilled unit markings, gunmetal grime. |

### Why these are worth doing

The current portraits are 3D renders from the game models: consistent, but
flat and dark at tile size, and the JJK characters lose their anime line work
entirely. Painted key art would give the select screen the poster-wall feel
the rest of the UI is aiming at.

Drop the PNGs into `public/portraits/` with the ids above and they appear
immediately — the character select, the info panel and the victory screen all
read that path already, with the existing render kept as fallback if a file
is missing.

---

## How to add a new request
Add an entry below with: target **path** (under `public/`), **size**,
transparency yes/no, and a short **style prompt**. The game prefers assets
that drop into an existing `<img>` slot with a procedural fallback, so include
the intended screen/usage too.
