import type * as THREE from 'three';

/* ============================================================
 * Shared contracts for Cursed Court.
 * All modules (world, characters, audio, ui, match) code against
 * this file. Keep it dependency-free apart from three types.
 * ============================================================ */

// ---------- Characters ----------

export type CharacterId =
  | 'yuji' | 'megumi' | 'nobara' | 'maki' | 'naoya' | 'jogo' | 'mahito'
  | 'din' | 'ig11' | 'bossk' | 'tusken' | 'quarren' | 'duelist'
  | 'konga' | 'saurion' | 'nullbot' | 'fenrir' | 'frogger' | 'vulcan';

export type Series = 'jjk' | 'mandalorian' | 'mechmayhem';

export type PlayStyle = 'all-around' | 'power' | 'speed' | 'technique' | 'tricky' | 'defense';

export interface CharacterStats {
  /** 1..5 — shot speed multiplier basis */
  power: number;
  /** 1..5 — run speed basis */
  speed: number;
  /** 1..5 — curve/spin strength basis */
  spin: number;
  /** 1..5 — swing reach basis */
  reach: number;
}

export interface CharacterDef {
  id: CharacterId;
  name: string;
  series: Series;
  style: PlayStyle;
  /** model url relative to site root, e.g. 'models/yuji.glb' */
  model: string;
  /** uniform scale applied to normalize model height (world units = meters) */
  height: number; // target height in meters
  /** theme color (hex css) used for trails, UI accents, star shots */
  color: string;
  stats: CharacterStats;
  /** one-line flavor text for character select */
  tagline: string;
}

// ---------- Shots & animation ----------

export type ShotKind = 'topspin' | 'slice' | 'flat' | 'lob' | 'drop' | 'smash' | 'serve' | 'star';

export type SwingSide = 'fore' | 'back' | 'overhead';

/** Seconds from swing() call until the racquet visually meets the ball.
 *  Match logic applies the ball impulse after this delay. */
export const SWING_CONTACT_DELAY = 0.12;

export interface SwingOpts {
  side: SwingSide;
  kind: ShotKind;
  /** 0..1 charge amount — affects animation vigor */
  power: number;
  /** world-space height the ball will be met at; the animation crouches for
   *  low balls and reaches up for high ones (optional) */
  contactHeight?: number;
}

/**
 * A loaded, animatable character puppet. Implemented by src/characters.
 * The match logic owns root.position and root.rotation.y (facing);
 * the avatar animates bones beneath it.
 */
export interface Avatar {
  readonly def: CharacterDef;
  readonly root: THREE.Object3D;
  /** world-space position of the racquet head (updated each frame) */
  getRacquetPos(out: THREE.Vector3): THREE.Vector3;

  /** advance animation */
  update(dt: number): void;

  /** locomotion blending: speed in m/s (0 = idle/ready), dir is local
   *  movement direction relative to facing (x: right, z: forward) */
  setMovement(speed: number, dirX: number, dirZ: number): void;

  /** enter charge/windup loop pose on given side (call once) */
  startCharge(side: SwingSide): void;
  /** cancel charge without swinging */
  cancelCharge(): void;
  /** play full swing; contact pose occurs SWING_CONTACT_DELAY after call */
  swing(opts: SwingOpts): void;
  /** true while a swing animation is in progress */
  isSwinging(): boolean;

  /** serve: toss animation, then serveHit */
  serveToss(): void;
  serveHit(power: number): void;

  /** one-shot emotes */
  playVictory(): void;
  playDefeat(): void;
  /** reset to neutral gameplay stance */
  playReady(): void;

  /** tint/highlight for star shot etc. */
  setGlow(intensity: number): void;

  dispose(): void;
}

// ---------- Match setup ----------

export type CourtTheme =
  | 'shibuya' | 'night' | 'jujutsuhigh'          // Jujutsu Kaisen
  | 'nevarro' | 'dune' | 'mandalore'             // The Mandalorian
  | 'foundry' | 'circuit';                       // Mech Mayhem

export interface CourtThemeDef {
  id: CourtTheme;
  name: string;
  /** surface + bounce feel, arcade-flavored */
  ballSpeedMul: number;
  bounceMul: number;
}

export type ControlSource = 0 | 1 | 2 | 3 | 'ai'; // gamepad index or AI

export interface PlayerSlot {
  characterId: CharacterId;
  control: ControlSource;
  /** team 0 defends z>0 side (near/home), team 1 defends z<0 (far) */
  team: 0 | 1;
}

export interface MatchSetup {
  mode: 'singles' | 'doubles';
  players: PlayerSlot[]; // 2 (singles) or 4 (doubles)
  court: CourtTheme;
  /** games needed to win the (single) set: 1, 2 or 4 */
  gamesToWin: 1 | 2 | 4;
}

// ---------- Scoring ----------

export interface ScoreState {
  /** display points per team: '0' | '15' | '30' | '40' | 'Ad' */
  points: [string, string];
  games: [number, number];
  gamesToWin: number;
  /** team currently serving */
  servingTeam: 0 | 1;
  isTiebreak: boolean;
  isDeuce: boolean;
}

export interface TeamInfo {
  characterIds: CharacterId[];
  /** display label, e.g. 'Yuji' or 'Yuji & Megumi' */
  label: string;
  color: string;
  human: boolean;
}

export interface MatchResult {
  winnerTeam: 0 | 1;
  teams: [TeamInfo, TeamInfo];
  finalGames: [number, number];
}

// ---------- Input ----------

/** logical gamepad buttons (Xbox layout) */
export type PadButton =
  | 'a' | 'b' | 'x' | 'y'
  | 'lb' | 'rb' | 'lt' | 'rt'
  | 'back' | 'start' | 'up' | 'down' | 'left' | 'right';

export type MenuAction = 'up' | 'down' | 'left' | 'right' | 'confirm' | 'back' | 'start' | 'prev' | 'next';

export interface PadState {
  connected: boolean;
  /** left stick with deadzone applied, each -1..1 */
  moveX: number;
  moveY: number;
  /** held state */
  held(btn: PadButton): boolean;
  /** true only on the frame the button went down */
  pressed(btn: PadButton): boolean;
  released(btn: PadButton): boolean;
  rumble(intensityLo: number, intensityHi: number, ms: number): void;
}

// ---------- Audio ----------

export type MusicMode = 'menu' | 'gameplay' | 'victory' | 'off';

export type SfxName =
  | 'bounce' | 'net_cord' | 'whiff'
  | 'hit_topspin' | 'hit_slice' | 'hit_flat' | 'hit_lob' | 'hit_drop' | 'hit_smash' | 'hit_star'
  | 'serve_toss' | 'serve_hit' | 'serve_power'
  | 'charge_loop' | 'star_appear' | 'footstep'
  | 'menu_move' | 'menu_confirm' | 'menu_back' | 'menu_error'
  | 'score_point' | 'score_game' | 'fault' | 'let'
  | 'crowd_cheer' | 'crowd_big' | 'crowd_ooh' | 'applause'
  | 'countdown_tick' | 'countdown_go' | 'victory_sting';

export interface SfxOpts {
  /** playback gain 0..1 (default 1) */
  gain?: number;
  /** semitone-ish random or fixed pitch offset, 1 = normal */
  rate?: number;
  /** stereo pan -1..1 */
  pan?: number;
}

export interface AudioApi {
  /** must be called from a user-gesture handler before anything plays */
  unlock(): void;
  /** `court` selects the gameplay soundtrack: that court's own theme(s)
   *  play first, then an endless shuffle that keeps them in the mix */
  setMusic(mode: MusicMode, court?: CourtTheme): void;
  sfx(name: SfxName, opts?: SfxOpts): void;
  /** start/stop the looping charge shimmer */
  chargeLoop(on: boolean): void;
  setMusicVolume(v: number): void;
  setSfxVolume(v: number): void;
  getMusicVolume(): number;
  getSfxVolume(): number;
  /** user-facing mute toggle (independent of the automatic tab-hidden duck) */
  setMuted(muted: boolean): void;
  isMuted(): boolean;
}

// ---------- World / stadium ----------

export interface StadiumApi {
  group: THREE.Group;
  /** per-frame; excitement 0..1 drives crowd sway/bounce intensity */
  update(dt: number, excitement: number): void;
  /** big crowd reaction burst (point won, star shot) */
  cheer(big: boolean): void;
  dispose(): void;
}

// ---------- Settings ----------

export interface GameSettings {
  musicVolume: number; // 0..1
  sfxVolume: number;   // 0..1
  /** user mute toggle (corner button); volumes are preserved underneath */
  muted: boolean;
  rumble: boolean;
  crowdDensity: 'full' | 'light';
}

export const DEFAULT_SETTINGS: GameSettings = {
  musicVolume: 0.7,
  sfxVolume: 0.9,
  muted: false,
  rumble: true,
  crowdDensity: 'full',
};
