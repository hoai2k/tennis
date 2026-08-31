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

  // sky
  skyTop: number;
  skyHorizon: number;
  skyBottom: number;
  sunColor: number;
  sunPos: [number, number, number]; // direction, normalized-ish
  sunSize: number;
  clouds: boolean;
  cloudColor: number;
  stars: boolean;
  skyline: 'city' | 'mesas' | 'nightcity';

  // lighting
  hemiSky: number;
  hemiGround: number;
  hemiInt: number;
  dirColor: number;
  dirInt: number;
  dirPos: [number, number, number];
  floodlights: boolean;
}

const DEFS: Record<CourtTheme, CourtThemeDef> = {
  shibuya: { id: 'shibuya', name: 'Shibuya Hard Court', ballSpeedMul: 1.0, bounceMul: 1.0 },
  nevarro: { id: 'nevarro', name: 'Nevarro Clay', ballSpeedMul: 0.92, bounceMul: 1.08 },
  night: { id: 'night', name: 'Cursed Night', ballSpeedMul: 1.06, bounceMul: 0.95 },
};

export function themeDefList(): CourtThemeDef[] {
  return [DEFS.shibuya, DEFS.nevarro, DEFS.night];
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
    floodlights: true,
  },
};

export function getPalette(theme: CourtTheme): ThemePalette {
  return PALETTES[theme];
}
