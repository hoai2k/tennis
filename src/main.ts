import * as THREE from 'three';
import { DEFAULT_SETTINGS, type Avatar, type CharacterId, type ControlSource, type CourtThemeDef, type MatchResult, type MatchSetup, type PlayerSlot } from './core/types';
import { characterById } from './core/roster';
import { InputManager } from './core/input';
import { createAudio } from './audio';
import { createUI, type UiApi } from './ui';
import { createStadium, themeDefs } from './world/stadium';
import { loadAvatar } from './characters';
import { MatchController } from './match/match';
import { MatchCamera } from './match/camera';

type AppState = 'title' | 'menu' | 'chars' | 'court' | 'loading' | 'match' | 'victory';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const uiRoot = document.getElementById('ui-root') as HTMLElement;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping; // world palette is tuned for raw sRGB

const scene = new THREE.Scene();
const matchCam = new MatchCamera(window.innerWidth / window.innerHeight);

function resize(): void {
  renderer.setSize(window.innerWidth, window.innerHeight);
  matchCam.resize(window.innerWidth / window.innerHeight);
}
window.addEventListener('resize', resize);
resize();

// ---------- global systems ----------

const audio = createAudio(DEFAULT_SETTINGS);
let state: AppState = 'title';
let chosenMode: 'singles' | 'doubles' = 'singles';
let pendingSlots: { characterId: CharacterId; control: ControlSource }[] = [];
let activePads: number[] = [];
let stadium = createStadium('shibuya', 'full');
scene.add(stadium.group);
let match: MatchController | null = null;
let idleT = 0;

const input = new InputManager(() => ui.getSettings().rumble);

const ui: UiApi = createUI(uiRoot, {
  sfx: (n) => audio.sfx(n),
  onTitleAdvance() {
    audio.unlock();
    audio.setMusic('menu');
    void document.documentElement.requestFullscreen?.().catch(() => {});
    state = 'menu';
    ui.showMainMenu();
  },
  onModeChosen(mode) {
    chosenMode = mode;
    state = 'chars';
    activePads = input.connectedPads();
    if (activePads.length === 0) activePads = [0];
    if (mode === 'singles') activePads = activePads.slice(0, 2);
    else activePads = activePads.slice(0, 4);
    ui.showCharacterSelect(activePads, mode);
  },
  onCharactersConfirmed(slots) {
    pendingSlots = slots;
    beginPrefetch(slots); // load models while the player picks a court
    state = 'court';
    const humans = slots.filter((s) => s.control !== 'ai').length;
    ui.showCourtSelect(themeDefs(), chosenMode === 'doubles' && humans >= 2);
  },
  onCourtConfirmed(theme, gamesToWin, splitHumans) {
    void startMatch(theme, gamesToWin, splitHumans);
  },
  onVictoryDone() {
    endMatch();
    state = 'menu';
    audio.setMusic('menu');
    ui.showMainMenu();
  },
  onPause() { if (match) match.paused = true; },
  onResume() { if (match) match.paused = false; },
  onQuitToMenu() {
    endMatch();
    state = 'menu';
    audio.setMusic('menu');
    ui.showMainMenu();
  },
  onSettingsChanged(s) {
    audio.setMusicVolume(s.musicVolume);
    audio.setSfxVolume(s.sfxVolume);
  },
}, DEFAULT_SETTINGS);

{
  const s = ui.getSettings();
  audio.setMusicVolume(s.musicVolume);
  audio.setSfxVolume(s.sfxVolume);
}

input.onMenuAction((action, pad) => {
  if (state === 'match') {
    if (action === 'start') ui.handleMenu(action, pad);
    // modals (pause/settings/instructions) still need nav while paused
    else if (match?.paused) ui.handleMenu(action, pad);
    return;
  }
  if (state === 'chars' && !activePads.includes(pad)) {
    activePads.push(pad);
    ui.padJoined(pad);
    return;
  }
  ui.handleMenu(action, pad);
});

// ---------- match lifecycle ----------

/* Avatars are the slow part of entering a match (multi-MB rigged GLBs), so
 * we start loading them the moment the roster is locked in — while the player
 * is still choosing a court. By the time they hit PLAY the models are usually
 * already in memory and the loading bar just flashes to 100%. */
interface Prefetch {
  key: string;
  fracs: number[];
  done: boolean[];
  promise: Promise<Avatar[]>;
}
let prefetch: Prefetch | null = null;

function slotsKey(slots: { characterId: CharacterId }[]): string {
  return slots.map((s) => s.characterId).join('|');
}

function beginPrefetch(slots: { characterId: CharacterId }[]): Prefetch {
  const defs = slots.map((s) => characterById(s.characterId));
  const fracs = defs.map(() => 0);
  const done = defs.map(() => false);
  const promise = Promise.all(
    defs.map((d, i) =>
      loadAvatar(d, (f) => { fracs[i] = f; }).then((a) => {
        fracs[i] = 1;
        done[i] = true;
        return a;
      }),
    ),
  );
  promise.catch(() => {}); // a failure is surfaced where it is awaited
  prefetch = { key: slotsKey(slots), fracs, done, promise };
  return prefetch;
}

/** 0..1 across download (weighted 55%) and parse/rig completion (45%) */
function prefetchProgress(p: Prefetch): number {
  const n = p.fracs.length || 1;
  let sum = 0;
  for (let i = 0; i < p.fracs.length; i++) sum += 0.55 * p.fracs[i] + (p.done[i] ? 0.45 : 0);
  return sum / n;
}

function buildSetup(theme: CourtThemeDef, gamesToWin: 1 | 2 | 4, splitHumans: boolean): MatchSetup {
  const slots = pendingSlots;
  const players: PlayerSlot[] = slots.map((s, i) => {
    let team: 0 | 1;
    if (chosenMode === 'singles') team = i === 0 ? 0 : 1;
    else if (splitHumans) team = (i % 2) as 0 | 1;
    else team = i < 2 ? 0 : 1;
    return { characterId: s.characterId, control: s.control, team };
  });
  return { mode: chosenMode, players, court: theme.id, gamesToWin };
}

async function startMatch(theme: CourtThemeDef, gamesToWin: 1 | 2 | 4, splitHumans: boolean): Promise<void> {
  state = 'loading';
  ui.hideAll();
  ui.showLoading();
  const setup = buildSetup(theme, gamesToWin, splitHumans);

  // rebuild stadium for the chosen theme (cheap: ~30ms)
  scene.remove(stadium.group);
  stadium.dispose();
  stadium = createStadium(theme.id, ui.getSettings().crowdDensity);
  scene.add(stadium.group);

  const key = slotsKey(setup.players);
  const job = prefetch && prefetch.key === key ? prefetch : beginPrefetch(setup.players);
  const tick = window.setInterval(
    () => ui.setLoadingProgress(prefetchProgress(job) * 0.97),
    80,
  );
  let avatars: Avatar[];
  try {
    avatars = await job.promise;
  } catch (err) {
    window.clearInterval(tick);
    console.error('failed to load characters', err);
    ui.hideLoading();
    prefetch = null;
    state = 'menu';
    ui.showMainMenu();
    ui.announce('LOAD FAILED — TRY AGAIN', 'big', 2600);
    return;
  }
  window.clearInterval(tick);
  prefetch = null; // these instances are now owned by the match
  ui.setLoadingProgress(1, 'READY!');

  match = new MatchController(setup, avatars, theme, { audio, ui, input, stadium });
  scene.add(match.group);
  match.onEnd = (result: MatchResult) => {
    state = 'victory';
    audio.setMusic('victory');
    ui.showVictory(result);
  };

  state = 'match';
  audio.setMusic('gameplay');
  ui.hideLoading();
  ui.showMatchHud([match.teamInfo(0), match.teamInfo(1)]);
}

function endMatch(): void {
  if (match) {
    scene.remove(match.group);
    match.dispose();
    match = null;
  }
  ui.hideAll();
}

// ---------- main loop ----------

let last = performance.now();
function frame(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  input.update(dt);

  if (state === 'match' || state === 'victory') {
    match?.update(dt);
    stadium.update(dt, match ? match.excitement : 0.6);
    if (match) matchCam.update(dt, match.ball.pos, match.fx.shake);
  } else {
    idleT += dt;
    stadium.update(dt, 0.25);
    matchCam.idleOrbit(idleT);
  }

  renderer.render(scene, matchCam.camera);
  requestAnimationFrame(frame);
}

ui.showTitle();
requestAnimationFrame(frame);

// ---------- debug hooks (used by automated tests; harmless in prod) ----------

const params = new URLSearchParams(location.search);
(window as any).__cc = {
  get state() { return state; },
  get match() { return match; },
  ui, input, audio,
  /** advance the simulation synchronously (headless testing — rendering
   *  still happens on the next rAF) */
  fastForward(seconds: number) {
    const h = 1 / 60;
    for (let t = 0; t < seconds; t += h) {
      input.update(h);
      match?.update(h);
      if (match) stadium.update(h, match.excitement);
    }
  },
  async demoMatch(mode: 'singles' | 'doubles' = 'singles', themeId = 'shibuya') {
    chosenMode = mode;
    const ids: CharacterId[] = mode === 'singles' ? ['yuji', 'din'] : ['yuji', 'megumi', 'din', 'bossk'];
    pendingSlots = ids.map((characterId) => ({ characterId, control: 'ai' as const }));
    const theme = themeDefs().find((t) => t.id === themeId) ?? themeDefs()[0];
    await startMatch(theme, 1, false);
  },
};
if (params.get('demo')) {
  void (window as any).__cc.demoMatch(params.get('demo') === 'doubles' ? 'doubles' : 'singles', params.get('theme') ?? 'shibuya');
}
