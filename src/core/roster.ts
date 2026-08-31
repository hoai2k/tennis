import type { CharacterDef } from './types';

export const ROSTER: CharacterDef[] = [
  // --- Jujutsu Kaisen ---
  { id: 'yuji', name: 'Yuji Itadori', series: 'jjk', style: 'all-around',
    model: 'models/yuji.glb', height: 1.73, color: '#e8514a',
    stats: { power: 3, speed: 4, spin: 3, reach: 3 },
    tagline: 'The vessel — balanced and relentless.' },
  { id: 'megumi', name: 'Megumi Fushiguro', series: 'jjk', style: 'defense',
    model: 'models/megumi.glb', height: 1.75, color: '#3b5fb8',
    stats: { power: 3, speed: 3, spin: 3, reach: 4 },
    tagline: 'Ten shadows cover every corner of the court.' },
  { id: 'nobara', name: 'Nobara Kugisaki', series: 'jjk', style: 'technique',
    model: 'models/nobara.glb', height: 1.6, color: '#e07a35',
    stats: { power: 3, speed: 3, spin: 4, reach: 3 },
    tagline: 'Hammer, nails, and pinpoint placement.' },
  { id: 'maki', name: 'Maki Zenin', series: 'jjk', style: 'speed',
    model: 'models/maki.glb', height: 1.7, color: '#3fa66b',
    stats: { power: 3, speed: 5, spin: 2, reach: 3 },
    tagline: 'No cursed energy. No wasted steps.' },
  { id: 'naoya', name: 'Naoya Zenin', series: 'jjk', style: 'speed',
    model: 'models/naoya.glb', height: 1.75, color: '#8fd0e8',
    stats: { power: 2, speed: 5, spin: 3, reach: 3 },
    tagline: 'Faster than everyone, and he knows it.' },
  { id: 'jogo', name: 'Jogo', series: 'jjk', style: 'power',
    model: 'models/jogo.glb', height: 1.8, color: '#d63c2a',
    stats: { power: 5, speed: 2, spin: 3, reach: 3 },
    tagline: 'Every forehand is a volcanic eruption.' },
  { id: 'mahito', name: 'Mahito', series: 'jjk', style: 'tricky',
    model: 'models/mahito.glb', height: 1.77, color: '#7f6fd4',
    stats: { power: 2, speed: 3, spin: 5, reach: 3 },
    tagline: 'The ball’s shape is his to distort.' },
  // --- The Mandalorian ---
  { id: 'din', name: 'Din Djarin', series: 'mandalorian', style: 'all-around',
    model: 'models/din.glb', height: 1.8, color: '#9fb2bd',
    stats: { power: 4, speed: 3, spin: 3, reach: 3 },
    tagline: 'This is the way — down the line.' },
  { id: 'ig11', name: 'IG-11', series: 'mandalorian', style: 'defense',
    model: 'models/ig11.glb', height: 2.0, color: '#c9c9c9',
    stats: { power: 3, speed: 3, spin: 2, reach: 5 },
    tagline: 'Nurse droid. Assassin droid. Net-play droid.' },
  { id: 'bossk', name: 'Bossk', series: 'mandalorian', style: 'power',
    model: 'models/bossk.glb', height: 1.9, color: '#b9c25a',
    stats: { power: 5, speed: 2, spin: 2, reach: 4 },
    tagline: 'Cold blood, scorching serves.' },
  { id: 'tusken', name: 'Tusken Raider', series: 'mandalorian', style: 'power',
    model: 'models/tusken.glb', height: 1.75, color: '#c9a26a',
    stats: { power: 4, speed: 3, spin: 2, reach: 4 },
    tagline: 'Swings the gaderffii — and now a racquet.' },
  { id: 'quarren', name: 'Quarren', series: 'mandalorian', style: 'defense',
    model: 'models/quarren.glb', height: 1.78, color: '#5f8f8f',
    stats: { power: 3, speed: 2, spin: 4, reach: 4 },
    tagline: 'Deep-sea patience, baseline endurance.' },
  { id: 'duelist', name: 'Cad Bane', series: 'mandalorian', style: 'technique',
    model: 'models/duelist.glb', height: 1.85, color: '#3f7fa8',
    stats: { power: 3, speed: 4, spin: 4, reach: 2 },
    tagline: 'The fastest draw is now the fastest volley.' },
];

export const ROSTER_BY_ID = new Map(ROSTER.map((c) => [c.id, c]));

export function characterById(id: string): CharacterDef {
  const def = ROSTER_BY_ID.get(id as CharacterDef['id']);
  if (!def) throw new Error(`unknown character: ${id}`);
  return def;
}
