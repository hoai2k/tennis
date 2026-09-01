import type { CharacterDef } from './types';

/* Heights are ~15% above life-size. Mario Tennis characters are not literally
 * bigger than real players relative to the court — the exaggeration lives in
 * the racquet, the ball and a tight camera — but a modest bump makes them read
 * clearly at the gameplay camera distance without overshooting that look. */
export const ROSTER: CharacterDef[] = [
  // --- Jujutsu Kaisen ---
  { id: 'yuji', name: 'Yuji Itadori', series: 'jjk', style: 'all-around',
    model: 'models/yuji.glb', height: 1.989, color: '#e8514a',
    stats: { power: 3, speed: 4, spin: 3, reach: 3 },
    tagline: 'The vessel — balanced and relentless.' },
  { id: 'megumi', name: 'Megumi Fushiguro', series: 'jjk', style: 'defense',
    model: 'models/megumi.glb', height: 2.012, color: '#3b5fb8',
    stats: { power: 3, speed: 3, spin: 3, reach: 4 },
    tagline: 'Ten shadows cover every corner of the court.' },
  { id: 'nobara', name: 'Nobara Kugisaki', series: 'jjk', style: 'technique',
    model: 'models/nobara.glb', height: 1.84, color: '#e07a35',
    stats: { power: 3, speed: 3, spin: 4, reach: 3 },
    tagline: 'Hammer, nails, and pinpoint placement.' },
  { id: 'maki', name: 'Maki Zenin', series: 'jjk', style: 'speed',
    model: 'models/maki.glb', height: 1.955, color: '#3fa66b',
    stats: { power: 3, speed: 5, spin: 2, reach: 3 },
    tagline: 'No cursed energy. No wasted steps.' },
  { id: 'naoya', name: 'Naoya Zenin', series: 'jjk', style: 'speed',
    model: 'models/naoya.glb', height: 2.012, color: '#8fd0e8',
    stats: { power: 2, speed: 5, spin: 3, reach: 3 },
    tagline: 'Faster than everyone, and he knows it.' },
  { id: 'jogo', name: 'Jogo', series: 'jjk', style: 'power',
    model: 'models/jogo.glb', height: 2.07, color: '#d63c2a',
    stats: { power: 5, speed: 2, spin: 3, reach: 3 },
    tagline: 'Every forehand is a volcanic eruption.' },
  { id: 'mahito', name: 'Mahito', series: 'jjk', style: 'tricky',
    model: 'models/mahito.glb', height: 2.035, color: '#7f6fd4',
    stats: { power: 2, speed: 3, spin: 5, reach: 3 },
    tagline: 'The ball’s shape is his to distort.' },
  // --- The Mandalorian ---
  { id: 'din', name: 'Din Djarin', series: 'mandalorian', style: 'all-around',
    model: 'models/din.glb', height: 2.07, color: '#9fb2bd',
    stats: { power: 4, speed: 3, spin: 3, reach: 3 },
    tagline: 'This is the way — down the line.' },
  { id: 'ig11', name: 'IG-11', series: 'mandalorian', style: 'defense',
    model: 'models/ig11.glb', height: 2.3, color: '#c9c9c9',
    stats: { power: 3, speed: 3, spin: 2, reach: 5 },
    tagline: 'Nurse droid. Assassin droid. Net-play droid.' },
  { id: 'bossk', name: 'Bossk', series: 'mandalorian', style: 'power',
    model: 'models/bossk.glb', height: 2.185, color: '#b9c25a',
    stats: { power: 5, speed: 2, spin: 2, reach: 4 },
    tagline: 'Cold blood, scorching serves.' },
  { id: 'tusken', name: 'Tusken Raider', series: 'mandalorian', style: 'power',
    model: 'models/tusken.glb', height: 2.012, color: '#c9a26a',
    stats: { power: 4, speed: 3, spin: 2, reach: 4 },
    tagline: 'Swings the gaderffii — and now a racquet.' },
  { id: 'quarren', name: 'Quarren', series: 'mandalorian', style: 'defense',
    model: 'models/quarren.glb', height: 2.047, color: '#5f8f8f',
    stats: { power: 3, speed: 2, spin: 4, reach: 4 },
    tagline: 'Deep-sea patience, baseline endurance.' },
  { id: 'duelist', name: 'Cad Bane', series: 'mandalorian', style: 'technique',
    model: 'models/duelist.glb', height: 2.127, color: '#3f7fa8',
    stats: { power: 3, speed: 4, spin: 4, reach: 2 },
    tagline: 'The fastest draw is now the fastest volley.' },
  // --- Mech Mayhem (clip-animated robot rigs — see characters/clipAvatar.ts) ---
  { id: 'titanus', name: 'Titanus', series: 'mechmayhem', style: 'power',
    model: 'models/titanus.glb', height: 2.5, color: '#ffa832',
    stats: { power: 5, speed: 1, spin: 2, reach: 4 },
    tagline: 'The Iron Avalanche. Rocket-fist winners.' },
  { id: 'konga', name: 'Konga', series: 'mechmayhem', style: 'power',
    model: 'models/konga.glb', height: 2.45, color: '#d98a2a',
    stats: { power: 5, speed: 2, spin: 1, reach: 5 },
    tagline: 'Skyline slams from the iron ape.' },
  { id: 'saurion', name: 'Saurion', series: 'mechmayhem', style: 'speed',
    model: 'models/saurion.glb', height: 2.25, color: '#5fd06a',
    stats: { power: 3, speed: 5, spin: 2, reach: 3 },
    tagline: 'Claw-swipe volleys at raptor speed.' },
  { id: 'nullbot', name: 'Nullbot', series: 'mechmayhem', style: 'tricky',
    model: 'models/nullbot.glb', height: 2.07, color: '#9a5fff',
    stats: { power: 2, speed: 3, spin: 5, reach: 3 },
    tagline: 'ERROR 404: your return not found.' },
  { id: 'fenrir', name: 'Fenrir', series: 'mechmayhem', style: 'all-around',
    model: 'models/fenrir.glb', height: 2.2, color: '#9fb8e8',
    stats: { power: 3, speed: 4, spin: 3, reach: 3 },
    tagline: 'The last wild thing, off the leash.' },
  { id: 'frogger', name: 'Frogger', series: 'mechmayhem', style: 'defense',
    model: 'models/frogger.glb', height: 1.95, color: '#3fd08a',
    stats: { power: 2, speed: 4, spin: 3, reach: 4 },
    tagline: 'Full-court hops. Nothing gets past.' },
  { id: 'vulcan', name: 'Vulcan', series: 'mechmayhem', style: 'technique',
    model: 'models/vulcan.glb', height: 2.3, color: '#e8503c',
    stats: { power: 4, speed: 2, spin: 4, reach: 3 },
    tagline: 'A lead storm of pinpoint forehands.' },
];

export const ROSTER_BY_ID = new Map(ROSTER.map((c) => [c.id, c]));

/** Mech Mayhem models ship in two variants: the original clip-animated rig
 *  from the source game (def.model), and a *_rig.glb humanoid re-rig with
 *  the same Rigify DEF-* skeleton as the rest of the roster, driven by the
 *  procedural tennis animator. All seven re-rigs are verified aligned
 *  (every DEF bone sits inside the skinned bind-pose mesh). */
export function modelUrl(def: CharacterDef, humanoidRigs: boolean): string {
  return humanoidRigs && def.series === 'mechmayhem'
    ? def.model.replace(/\.glb$/, '_rig.glb')
    : def.model;
}

export function characterById(id: string): CharacterDef {
  const def = ROSTER_BY_ID.get(id as CharacterDef['id']);
  if (!def) throw new Error(`unknown character: ${id}`);
  return def;
}
