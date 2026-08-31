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
    audio.setMuted(s.muted);
  },
}, DEFAULT_SETTINGS);

{
  const s = ui.getSettings();
  audio.setMusicVolume(s.musicVolume);
  audio.setSfxVolume(s.sfxVolume);
  audio.setMuted(s.muted);
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

/** no bytes and no completion for this long ⇒ the request is wedged */
const LOAD_STALL_MS = Number(new URLSearchParams(location.search).get('stallMs') ?? 20000);
/** grace before the first progress event (slow links, or no content-length) */
const LOAD_FIRST_BYTE_MS = Number(new URLSearchParams(location.search).get('firstByteMs') ?? 30000);
/** absolute ceiling on a whole match load, however it fails */
const LOAD_WATCHDOG_MS = Number(new URLSearchParams(location.search).get('watchdogMs') ?? 90000);

/**
 * loadAvatar that cannot hang forever. A stalled network request otherwise
 * leaves the loading bar sitting at a fixed percentage with nothing to
 * recover it, so treat "no progress for a while" as a failure and retry once.
 */
function loadAvatarResilient(
  def: ReturnType<typeof characterById>,
  onProgress: (f: number) => void,
): Promise<Avatar> {
  const attempt = (url: string): Promise<Avatar> => new Promise<Avatar>((resolve, reject) => {
    let timer = 0;
    let settled = false;
    const arm = (ms: number): void => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(new Error(`stalled loading ${def.model}`));
      }, ms);
    };
    const finish = (fn: () => void): void => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      fn();
    };
    arm(LOAD_FIRST_BYTE_MS);
    loadAvatar({ ...def, model: url }, (f) => {
      if (settled) return;
      // Once the bytes are down, the remaining work is CPU-bound parsing and
      // rig setup, which emits no progress — a stall timer would misfire on a
      // slow device. Only the watchdog bounds that phase.
      if (f >= 1) window.clearTimeout(timer);
      else arm(LOAD_STALL_MS);
      onProgress(f);
    }).then(
      (av) => finish(() => resolve(av)),
      (err) => finish(() => reject(err)),
    );
  });

  return attempt(def.model).catch((err) => {
    console.warn('retrying character load', def.id, err);
    onProgress(0);
    // three's FileLoader de-dupes by URL and will happily attach to the
    // request that just wedged, so the retry needs a distinct URL
    return attempt(`${def.model}?retry=${Date.now()}`);
  });
}

function beginPrefetch(slots: { characterId: CharacterId }[]): Prefetch {
  const defs = slots.map((s) => characterById(s.characterId));
  const fracs = defs.map(() => 0);
  const done = defs.map(() => false);
  const promise = Promise.all(
    defs.map((d, i) =>
      loadAvatarResilient(d, (f) => { fracs[i] = f; }).then((a) => {
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

/** guards against a second PLAY press starting a parallel load */
let loadInFlight = false;

function abortToCourtSelect(msg: string): void {
  ui.hideLoading();
  prefetch = null;
  state = 'court';
  const humans = pendingSlots.filter((sl) => sl.control !== 'ai').length;
  ui.showCourtSelect(themeDefs(), chosenMode === 'doubles' && humans >= 2);
  ui.announce(msg, 'big', 2600);
}

async function startMatch(theme: CourtThemeDef, gamesToWin: 1 | 2 | 4, splitHumans: boolean): Promise<void> {
  if (loadInFlight) return; // ignore a double confirm
  loadInFlight = true;
  state = 'loading';
  ui.hideAll();
  ui.showLoading();

  const tick = window.setInterval(() => {
    if (prefetch) ui.setLoadingProgress(prefetchProgress(prefetch) * 0.97);
  }, 80);
  // Nothing below may leave the game wedged on the loading bar: the whole
  // body is guarded, with a watchdog for anything that never settles at all.
  let watchdog = 0;
  const watchdogFired = new Promise<never>((_, reject) => {
    watchdog = window.setTimeout(
      () => reject(new Error('load watchdog timeout')),
      LOAD_WATCHDOG_MS,
    );
  });

  try {
    const setup = buildSetup(theme, gamesToWin, splitHumans);

    // rebuild stadium for the chosen theme (cheap: ~30ms)
    scene.remove(stadium.group);
    stadium.dispose();
    stadium = createStadium(theme.id, ui.getSettings().crowdDensity);
    scene.add(stadium.group);

    const key = slotsKey(setup.players);
    const job = prefetch && prefetch.key === key ? prefetch : beginPrefetch(setup.players);
    const avatars = await Promise.race([job.promise, watchdogFired]);

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
  } catch (err) {
    console.error('failed to start match', err);
    abortToCourtSelect('COULDN\u2019T LOAD — TRY AGAIN');
  } finally {
    window.clearInterval(tick);
    window.clearTimeout(watchdog);
    loadInFlight = false;
  }
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
    if (match) matchCam.update(dt, match.ball.pos, match.fx.shake, match.focusPoints());
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
  get camera() { return matchCam.camera; },
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
