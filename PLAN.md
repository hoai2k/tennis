# Cursed Court — Master Plan

A Mario Tennis–style arcade tennis game for the web (up to 4 players), starring characters
from **Jujutsu Kaisen** and **The Mandalorian**. Xbox controllers are the primary input for
menus and gameplay (keyboard fallback for dev/testing).

## Tech stack

- **Vite + TypeScript + three.js** — single-page app, no framework.
- All 3D except the characters is **procedural** (court, net, stands, crowd, racquets, ball, sky, effects).
- Character models: `public/models/*.glb` — Tripo-generated, all share the same Rigify `DEF-*`
  skeleton with **no baked animations** → one shared **procedural animation system** drives all rigs.
- Music: `public/music/*.mp3` (see Audio). SFX: **procedurally synthesized** with WebAudio.

## Character roster (13)

| id | Name | Series | Play style |
|---|---|---|---|
| yuji | Yuji Itadori | JJK | All-Around |
| megumi | Megumi Fushiguro | JJK | Defense |
| nobara | Nobara Kugisaki | JJK | Technique |
| maki | Maki Zenin | JJK | Speed |
| naoya | Naoya Zenin | JJK | Speed |
| jogo | Jogo | JJK | Power |
| mahito | Mahito | JJK | Tricky |
| din | Din Djarin | Mandalorian | All-Around |
| ig11 | IG-11 | Mandalorian | Defense (reach) |
| bossk | Bossk | Mandalorian | Power |
| tusken | Tusken Raider | Mandalorian | Power |
| quarren | Quarren | Mandalorian | Defense |
| duelist | Cad Bane | Mandalorian | Technique |

## Mario Tennis mechanics we adopt

Researched from Mario Tennis 64 / Power Tennis / Open / Aces:

- **Shot types by button**: A = topspin (fast, dips), B/X = slice (slow, curves, skids low),
  Y or A+B = flat power shot, B→A = lob, A→B = drop shot. Shot color-coded ball trails
  (topspin red, slice blue, flat purple, lob/drop green) like modern Mario Tennis.
- **Charge system**: press a shot button early to charge; more charge = more power + aim
  control with the stick; character plants into a wind-up pose (tight action, flexible input).
- **Generous contact**: big swing windows + a subtle "magnet" that snaps the character's
  swing to the ball — swings feel flexible, resulting action is tight.
- **Chance/Star shots**: star markers appear on strong openings; swinging from the star fires a
  **Star Shot** (screen shake, big SFX, character-colored burst) — our stand-in for Power Shots.
- **Serving**: toss with A, hit near the peak for a power serve (purple flash on perfect timing).
- **Real tennis scoring**: 15/30/40, deuce/advantage, games per set configurable; tiebreaks.
- **Singles & doubles**: 1–4 human players on Xbox pads, AI fills empty slots.
- Cartoony **announcer-style UI**, chunky fonts, bouncy transitions, crowd reactions.

## Screen flow

1. **Title** — "CURSED COURT", "Press Start"; any pad button → fullscreen + main menu.
2. **Main menu** — Exhibition (Singles / Doubles), controls hint.
3. **Character select** — Mario-Tennis-style grid of portraits (pre-rendered PNGs in
   `public/portraits/`), each active pad picks; AI slots auto-pick.
4. **Court / rules select** — court theme (Shibuya Hard Court / Nevarro Clay / Cursed Night),
   games per set.
5. **Match** — gameplay; HUD scoreboard, announcements ("15 – LOVE", "Deuce", "Fault!").
6. **Victory** — winner celebration + "Cursed Court Short" jingle.

Persistent bottom-right icon buttons: **Fullscreen**, **Instructions** (Xbox controller
diagram, drawn as SVG), **Settings** (volumes, etc.).

## Audio spec

- Menus: *Cursed Court Rally 1* (loops).
- Gameplay: *Cursed Court Rally 2* first; when it ends → random mix of the other tracks
  (*Mushroom Dash*, *Cursed Court Interlude*, *Rally 1*).
- Victory: *Cursed Court Short*.
- SFX: WebAudio-synthesized — ball bounce, racquet hits per shot type, serve, star shot,
  crowd cheers/oohs/applause, menu move/confirm/back, score jingle, fault.

## Module map & ownership (parallel agents)

- `src/core/` — shared types & contracts, state machine, gamepad input. **(lead)**
- `src/world/` — procedural stadium: court, net, stands, crowd, sky, lighting, FX. **(agent: env)**
- `src/characters/` — GLB loading, rig mapping, procedural animation (idle/run/swings/serve/victory), procedural racquet. **(agent: chars)**
- `src/audio/` — music manager + procedural SFX synth. **(agent: audio)**
- `src/ui/` — DOM overlay screens, HUD, icon buttons, controller diagram, settings. **(agent: ui)**
- `src/match/` — ball physics, rules/scoring, player & AI controllers, camera, integration. **(lead)**

Contracts live in `src/core/types.ts` — written first; agents code against it.

## Progress tracker

See `PROGRESS.md` (updated as work lands so we can resume after interruption).
