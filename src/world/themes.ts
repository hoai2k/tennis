import type { CourtTheme, CourtThemeDef } from '../core/types';

/* Visual palette + gameplay def per court theme. Everything the sub-builders
 * need to color/light the stadium lives here. */

export interface ThemePalette {
  def: CourtThemeDef;
  night: boolean;

  // ground colors
  courtIn: number;   // marked doubles-court rectangle
  apron: number;     // runoff around the court
  ground: number;    // world ground beyond the apron
  line: number;      // painted line color
  lineGlow: number;  // 0..1 extra pop for lines (night = strong)

  // stands
  wall: number;          // low wall around apron
  seatColors: number[];  // alternating stand section colors
  standBack: number;     // tall back wall behind last row
  accent: number;        // theme accent (torii red / lava orange / cursed purple)
  accent2: number;       // secondary accent (teal for night)
  glowStrips: boolean;   // emissive energy strips on the stands

  // banners
  bannerBg: string;
  bannerText: string;
  bannerOutline: string;

  // banners (falls back to the classic set when omitted)
  bannerTexts?: string[];

  // sky
  skyTop: number;
  skyHorizon: number;
  skyBottom: number;
  sunColor: number;
  sunPos: [number, number, number]; // direction, normalized-ish
  sunSize: number;
  /** optional second sun (Tatooine flavor) */
  sun2Pos?: [number, number, number];
  sun2Size?: number;
  sun2Color?: number;
  clouds: boolean;
  cloudColor: number;
  stars: boolean;
  skyline: 'city' | 'mesas' | 'nightcity' | 'shrine' | 'dunes' | 'domes' | 'foundry';

  // lighting
  hemiSky: number;
  hemiGround: number;
  hemiInt: number;
  dirColor: number;
  dirInt: number;
  dirPos: [number, number, number];
  /** character fill: two near-horizontal lights that lift the players off a
   *  dark court without washing the court itself out (see lights.ts) */
  fillColor: number;
  fillInt: number;
  /** self-lift carried on the characters' emissive channel — dark courts need
   *  more of it, bright ones would wash the costumes out (see characters/) */
  charLift: number;
  floodlights: boolean;
}

const DEFS: Record<CourtTheme, CourtThemeDef> = {
  shibuya: { id: 'shibuya', name: 'Shibuya Hard Court', ballSpeedMul: 1.0, bounceMul: 1.0 },
  night: { id: 'night', name: 'Cursed Night', ballSpeedMul: 1.06, bounceMul: 0.95 },
  jujutsuhigh: { id: 'jujutsuhigh', name: 'Jujutsu High Lawn', ballSpeedMul: 1.04, bounceMul: 0.86 },
  nevarro: { id: 'nevarro', name: 'Nevarro Clay', ballSpeedMul: 0.92, bounceMul: 1.08 },
  dune: { id: 'dune', name: 'Dune Sea', ballSpeedMul: 0.88, bounceMul: 0.97 },
  mandalore: { id: 'mandalore', name: 'Mandalore Dome', ballSpeedMul: 1.12, bounceMul: 0.92 },
  foundry: { id: 'foundry', name: 'Mayhem Foundry', ballSpeedMul: 0.97, bounceMul: 1.18 },
  circuit: { id: 'circuit', name: 'Neon Circuit', ballSpeedMul: 1.08, bounceMul: 1.06 },
};

/** grouped by series: JJK, Mandalorian, Mech Mayhem */
export function themeDefList(): CourtThemeDef[] {
  return [
    DEFS.shibuya, DEFS.night, DEFS.jujutsuhigh,
    DEFS.nevarro, DEFS.dune, DEFS.mandalore,
    DEFS.foundry, DEFS.circuit,
  ];
}

const PALETTES: Record<CourtTheme, ThemePalette> = {
  shibuya: {
    def: DEFS.shibuya,
    night: false,
    courtIn: 0x1758b8,
    apron: 0x33a852,
    ground: 0x2b7a3f,
    line: 0xffffff,
    lineGlow: 0.25,
    wall: 0x1d6f38,
    seatColors: [0xff5a4e, 0xffc93c, 0x3fa9f5, 0x62d26f],
    standBack: 0xd93a2b,
    accent: 0xd93a2b,
    accent2: 0xffc93c,
    glowStrips: false,
    bannerBg: '#0f4f9e',
    bannerText: '#ffffff',
    bannerOutline: '#072b57',
    skyTop: 0x2f8fe8,
    skyHorizon: 0xbfe8ff,
    skyBottom: 0x8fd0e8,
    sunColor: 0xfff6c9,
    sunPos: [0.55, 0.62, -0.55],
    sunSize: 14,
    clouds: true,
    cloudColor: 0xffffff,
    stars: false,
    skyline: 'city',
    hemiSky: 0xcfe8ff,
    hemiGround: 0x7fae6f,
    hemiInt: 1.05,
    dirColor: 0xfff3d8,
    dirInt: 2.1,
    dirPos: [18, 30, 14],
    fillColor: 0xffe9d0,
    fillInt: 0.45,
    charLift: 0.05,
    floodlights: false,
  },
  nevarro: {
    def: DEFS.nevarro,
    night: false,
    courtIn: 0xd2622a,
    apron: 0x4a2f26,
    ground: 0x3a241d,
    line: 0xfff2df,
    lineGlow: 0.3,
    wall: 0x2e1c16,
    seatColors: [0xff8a3c, 0xd94f3c, 0xf2c14e, 0x8c5a3c],
    standBack: 0x542f22,
    accent: 0xff5a1f,
    accent2: 0xf2c14e,
    glowStrips: false,
    bannerBg: '#5a2a18',
    bannerText: '#ffd9a0',
    bannerOutline: '#2a120a',
    skyTop: 0x4a3f8c,
    skyHorizon: 0xff9a4a,
    skyBottom: 0x7a4a3a,
    sunColor: 0xffb347,
    sunPos: [-0.35, 0.22, -0.9],
    sunSize: 20,
    clouds: true,
    cloudColor: 0xffc9a0,
    stars: false,
    skyline: 'mesas',
    hemiSky: 0xffc9a0,
    hemiGround: 0x6a4432,
    hemiInt: 0.95,
    dirColor: 0xffc178,
    dirInt: 1.9,
    dirPos: [-16, 20, -26],
    fillColor: 0xffd9b0,
    fillInt: 0.55,
    charLift: 0.06,
    floodlights: false,
  },
  night: {
    def: DEFS.night,
    night: true,
    courtIn: 0x2a1650,
    apron: 0x191033,
    ground: 0x110b24,
    line: 0x7ffcff,
    lineGlow: 1.0,
    wall: 0x241a4a,
    seatColors: [0x6a3cff, 0x2ad4c8, 0xff4fa0, 0x4a5cff],
    standBack: 0x1c1240,
    accent: 0xa050ff,
    accent2: 0x2ad4c8,
    glowStrips: true,
    bannerBg: '#1a0f3a',
    bannerText: '#8ffcff',
    bannerOutline: '#5a2aff',
    skyTop: 0x07031a,
    skyHorizon: 0x2a1a55,
    skyBottom: 0x0a0620,
    sunColor: 0xe8ecff,
    sunPos: [-0.5, 0.6, -0.62],
    sunSize: 9,
    clouds: false,
    cloudColor: 0x333355,
    stars: true,
    skyline: 'nightcity',
    hemiSky: 0x5a4a9e,
    hemiGround: 0x1a1030,
    hemiInt: 0.55,
    dirColor: 0xbfd0ff,
    dirInt: 1.1,
    dirPos: [10, 34, 12],
    fillColor: 0xd8dcff,
    fillInt: 1.15,
    charLift: 0.13,
    floodlights: true,
  },
  jujutsuhigh: {
    def: DEFS.jujutsuhigh,
    night: false,
    courtIn: 0x2e8b3f,
    apron: 0xb9a06a,
    ground: 0x2a6032,
    line: 0xffffff,
    lineGlow: 0.2,
    wall: 0x5a4030,
    seatColors: [0xe86a8a, 0x3a7d4f, 0xf2e6c9, 0x8a5a3c],
    standBack: 0x6a4a38,
    accent: 0xe86a8a,
    accent2: 0x3fa66b,
    glowStrips: false,
    bannerBg: '#274a2e',
    bannerText: '#ffe9f0',
    bannerOutline: '#12240f',
    bannerTexts: ['CURSED COURT', 'JUJUTSU HIGH', 'EXCHANGE EVENT', 'DOMAIN EXPANSION', 'GO GO YUJI'],
    skyTop: 0x5aa8e8,
    skyHorizon: 0xd8ecff,
    skyBottom: 0xa8d8c8,
    sunColor: 0xfff8d8,
    sunPos: [0.4, 0.7, -0.5],
    sunSize: 13,
    clouds: true,
    cloudColor: 0xffffff,
    stars: false,
    skyline: 'shrine',
    hemiSky: 0xd8ecff,
    hemiGround: 0x5a7d4f,
    hemiInt: 1.05,
    dirColor: 0xfff3d8,
    dirInt: 2.0,
    dirPos: [14, 28, 10],
    fillColor: 0xfff0d8,
    fillInt: 0.45,
    charLift: 0.05,
    floodlights: false,
  },
  dune: {
    def: DEFS.dune,
    night: false,
    courtIn: 0xe0b36a,
    apron: 0xc99b52,
    ground: 0xb9853f,
    line: 0x5f3a1e,
    lineGlow: 0.15,
    wall: 0x9a7a48,
    seatColors: [0xd9c9a0, 0xb98a4a, 0x8a5a3a, 0xe8d8b0],
    standBack: 0xab8452,
    accent: 0xd97a2a,
    accent2: 0x4aa8c9,
    glowStrips: false,
    bannerBg: '#7a5222',
    bannerText: '#ffefd0',
    bannerOutline: '#3a2408',
    bannerTexts: ['CURSED COURT', 'DUNE SEA OPEN', 'THIS IS THE WAY', 'MOS EISLEY CUP', 'BEWARE THE PIT'],
    skyTop: 0x7ac9e8,
    skyHorizon: 0xffe9b0,
    skyBottom: 0xe8c98a,
    sunColor: 0xffe9a0,
    sunPos: [0.4, 0.17, -0.8],
    sunSize: 15,
    sun2Pos: [0.53, 0.1, -0.73],
    sun2Size: 10,
    sun2Color: 0xffd9a0,
    clouds: true,
    cloudColor: 0xfff2dc,
    stars: false,
    skyline: 'dunes',
    hemiSky: 0xffe9c0,
    hemiGround: 0x9a7a48,
    hemiInt: 1.0,
    dirColor: 0xffe9b8,
    dirInt: 2.2,
    dirPos: [20, 26, -8],
    fillColor: 0xffeccf,
    fillInt: 0.45,
    charLift: 0.05,
    floodlights: false,
  },
  mandalore: {
    def: DEFS.mandalore,
    night: false,
    courtIn: 0x4a6070,
    apron: 0x33454f,
    ground: 0x24333a,
    line: 0xbfe8d8,
    lineGlow: 0.6,
    wall: 0x2a3a42,
    seatColors: [0x5a7a88, 0x8fb0b8, 0x3a5a68, 0xc9d8d8],
    standBack: 0x33454f,
    accent: 0x4fd0a8,
    accent2: 0xc9d8e0,
    glowStrips: true,
    bannerBg: '#1d3038',
    bannerText: '#c9f2e0',
    bannerOutline: '#0a1418',
    bannerTexts: ['CURSED COURT', 'MANDALORE CUP', 'THIS IS THE WAY', 'FOR THE CREED', 'THE GREAT FORGE'],
    skyTop: 0x2a4a4f,
    skyHorizon: 0x9ac9b8,
    skyBottom: 0x3a5550,
    sunColor: 0xe8f2e0,
    sunPos: [-0.4, 0.35, -0.7],
    sunSize: 11,
    clouds: true,
    cloudColor: 0x7a9a94,
    stars: false,
    skyline: 'domes',
    hemiSky: 0x9ac9b8,
    hemiGround: 0x33454f,
    hemiInt: 0.9,
    dirColor: 0xd8f2e0,
    dirInt: 1.7,
    dirPos: [-14, 24, -20],
    fillColor: 0xdff2ea,
    fillInt: 0.7,
    charLift: 0.08,
    floodlights: false,
  },
  foundry: {
    def: DEFS.foundry,
    night: false,
    courtIn: 0x5a626c,
    apron: 0x3a4047,
    ground: 0x282c32,
    line: 0xffcf2e,
    lineGlow: 0.7,
    wall: 0x2a2e34,
    seatColors: [0xff8a2a, 0x4a5058, 0xffcf2e, 0x6a7078],
    standBack: 0x3a3f45,
    accent: 0xff6a1f,
    accent2: 0xffcf2e,
    glowStrips: true,
    bannerBg: '#2a2e35',
    bannerText: '#ffd94f',
    bannerOutline: '#101216',
    bannerTexts: ['CURSED COURT', 'MECH MAYHEM', 'FOUNDRY SLAM', 'TITANUS', 'VULCAN', 'INFERNO'],
    skyTop: 0x3a3540,
    skyHorizon: 0xd97a3a,
    skyBottom: 0x4a3228,
    sunColor: 0xff9a4a,
    sunPos: [-0.3, 0.28, -0.85],
    sunSize: 17,
    clouds: true,
    cloudColor: 0x6a5a58,
    stars: false,
    skyline: 'foundry',
    hemiSky: 0xc9a08a,
    hemiGround: 0x3a3230,
    hemiInt: 0.95,
    dirColor: 0xffb878,
    dirInt: 1.8,
    dirPos: [-12, 22, -18],
    fillColor: 0xffd8b8,
    fillInt: 0.9,
    charLift: 0.12,
    floodlights: false,
  },
  circuit: {
    def: DEFS.circuit,
    night: true,
    courtIn: 0x0c1626,
    apron: 0x080d18,
    ground: 0x05070c,
    line: 0x38e8ff,
    lineGlow: 1.0,
    wall: 0x101a2e,
    seatColors: [0x2a4a7a, 0x38b8d8, 0x142a44, 0x3a6a9a],
    standBack: 0x0c1420,
    accent: 0x38e8ff,
    accent2: 0xff4f8a,
    glowStrips: true,
    bannerBg: '#081220',
    bannerText: '#7ff2ff',
    bannerOutline: '#1f4a6a',
    bannerTexts: ['CURSED COURT', 'MECH MAYHEM', 'NEON CIRCUIT', 'WRAITH', 'TEMPEST', 'GLACIER'],
    skyTop: 0x05070c,
    skyHorizon: 0x123048,
    skyBottom: 0x05080e,
    sunColor: 0xdff6ff,
    sunPos: [0.55, 0.5, -0.6],
    sunSize: 8,
    clouds: false,
    cloudColor: 0x333555,
    stars: true,
    skyline: 'nightcity',
    hemiSky: 0x3a6a8a,
    hemiGround: 0x0a1220,
    hemiInt: 0.55,
    dirColor: 0xbfe8ff,
    dirInt: 1.1,
    dirPos: [-10, 32, 14],
    fillColor: 0xcfe8ff,
    fillInt: 1.2,
    charLift: 0.14,
    floodlights: true,
  },
};

export function getPalette(theme: CourtTheme): ThemePalette {
  return PALETTES[theme];
}
