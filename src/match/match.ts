import * as THREE from 'three';
import { COURT } from '../core/constants';
import {
  SWING_CONTACT_DELAY,
  type AudioApi, type Avatar, type CourtThemeDef, type MatchResult,
  type MatchSetup, type ShotKind, type StadiumApi, type SwingSide, type TeamInfo,
} from '../core/types';
import type { UiApi } from '../ui';
import type { InputManager } from '../core/input';
import { Ball } from './ball';
import { MatchFx } from './effects';
import { Scorer } from './rules';
import { Actor } from './actors';
import { AiBrain } from './ai';
import { SHOT_PROFILES, computeTarget, solveShot } from './shots';

type Phase = 'intro' | 'servePrep' | 'serveToss' | 'serveFlight' | 'rally' | 'pointEnd' | 'victory' | 'done';

/** highest ball a grounded swing can reach (racquet overhead) */
const STAND_HIT_HEIGHT = 2.35;
/** extra height unlocked by leaping for it */
const LEAP_EXTRA_HEIGHT = 0.95;
/** character-local racquet-head offset at the contact frame (measured on a
 *  1.73m body, per kind+side); the magnet subtracts this to find where the
 *  FEET belong for clean contact */
const CONTACT_OFFSET: Record<string, { x: number; z: number }> = {
  topspin_fore: { x: -1.03, z: 1.01 }, topspin_back: { x: 0.83, z: 0.17 },
  slice_fore: { x: -1.00, z: 1.02 },   slice_back: { x: 0.84, z: 0.31 },
  flat_fore: { x: -1.03, z: 1.02 },    flat_back: { x: 0.85, z: 0.21 },
  lob_fore: { x: -0.92, z: 1.08 },     lob_back: { x: 0.89, z: 0.37 },
  drop_fore: { x: -1.07, z: 0.76 },    drop_back: { x: 0.76, z: 0.04 },
  star_fore: { x: -1.02, z: 1.02 },    star_back: { x: 0.85, z: 0.21 },
  smash_fore: { x: -1.03, z: 1.02 },   smash_back: { x: 0.85, z: 0.21 },
  overhead: { x: 0.32, z: 0.60 },
};

/** how far ahead the chance-star looks for a playable point, and how finely */
const STAR_HORIZON = 2.2;
const STAR_SAMPLES = 30;
/** how close you must be to the star to trigger a star shot (metres) */
const STAR_HIT_RADIUS = 1.6;

/** look-ahead used to decide when to swing (seconds) */
const REACH_HORIZON = 0.5;
/** samples across that look-ahead */
const REACH_SAMPLES = 12;

interface PendingHit {
  t: number;
  actor: Actor;
  kind: ShotKind;
  aimX: number;
  aimY: number;
  power: number;
}

export class MatchController {
  readonly ball = new Ball();
  readonly fx = new MatchFx();
  readonly group = new THREE.Group();
  private scorer: Scorer;
  private actors: Actor[] = [];
  private brains = new Map<Actor, AiBrain>();
  private phase: Phase = 'intro';
  private phaseT = 0;
  private singles: boolean;
  /** humans on both teams ⇒ two panes, each with its own camera */
  private splitView = false;
  private lastHitTeam: 0 | 1 | -1 = -1;
  private rallyHits = 0;
  private pending: PendingHit | null = null;
  private serveFaults = 0;
  private serveNetCord = false;
  private server!: Actor;
  private tossActive = false;
  private tossT = 0;
  private tossY = 0;
  private serveGames: [number, number] = [0, 0];
  private pointMsg = '';
  private pointWinner: 0 | 1 = 0;
  private starConsumedBy: Actor | null = null;
  private _contactTmp = new THREE.Vector3();
  private _focus: THREE.Vector3[] = [];
  private _starPath: THREE.Vector3[] = Array.from({ length: 30 }, () => new THREE.Vector3());
  private _samples: THREE.Vector3[] = Array.from({ length: 12 }, () => new THREE.Vector3());
  /** tuning counters (read by the dev harness) */
  readonly stats = { swings: 0, lunges: 0, leaps: 0, rallies: [] as number[], endings: [] as string[], faults: 0 };
  paused = false;
  excitement = 0.3;
  onEnd: ((r: MatchResult) => void) | null = null;

  constructor(
    private setup: MatchSetup,
    avatars: Avatar[],
    private theme: CourtThemeDef,
    private deps: { audio: AudioApi; ui: UiApi; input: InputManager; stadium: StadiumApi },
  ) {
    this.singles = setup.mode === 'singles';
    this.scorer = new Scorer(setup.gamesToWin);
    this.ball.bounceRestitutionMul = theme.bounceMul;
    setup.players.forEach((slot, i) => {
      const actor = new Actor(avatars[i], i, slot.team, slot.control !== 'ai');
      if (slot.control !== 'ai') actor.pad = deps.input.pads[slot.control];
      else this.brains.set(actor, new AiBrain(actor));
      this.actors.push(actor);
      this.group.add(actor.avatar.root);
    });
    this.group.add(this.ball.group, this.fx.group);

    this.ball.events = {
      onBounce: (pos, n) => this.handleBounce(pos, n),
      onNetCord: () => this.handleNetCord(),
      onDead: () => this.handleDead(),
    };

    // drives per-pane input orientation; the game keeps this in step with
    // the camera setting (see setSplitView)
    this.splitView = this.needsSplitView;

    this.phase = 'intro';
    this.phaseT = 0;
    this.placeForServe();
    this.deps.ui.announce('READY?', 'big', 1000);
    this.deps.audio.sfx('countdown_tick');
  }

  teamActors(team: 0 | 1): Actor[] { return this.actors.filter((a) => a.team === team); }

  teamInfo(team: 0 | 1): TeamInfo {
    const list = this.teamActors(team);
    return {
      characterIds: list.map((a) => a.avatar.def.id),
      label: list.map((a) => a.avatar.def.name.split(' ')[0]).join(' & '),
      color: list[0].avatar.def.color,
      human: list.some((a) => a.isHuman),
    };
  }

  // ---------- serve ----------

  private pickServer(): void {
    const t = this.scorer.servingTeam;
    const mates = this.teamActors(t);
    this.server = mates[this.serveGames[t] % mates.length];
  }

  private serveSideSign(): number {
    // world-x sign where the server stands
    return (this.scorer.servingTeam === 0 ? 1 : -1) * (this.scorer.serveCourt === 'right' ? 1 : -1);
  }

  private placeForServe(): void {
    this.pickServer();
    const sTeam = this.scorer.servingTeam;
    const rTeam = (1 - sTeam) as 0 | 1;
    const sx = this.serveSideSign();
    const sDir = sTeam === 0 ? 1 : -1;
    const standX = this.server.isHuman ? 1.7 : 0.7 + Math.random() * 2.2;
    this.server.teleport(sx * standX, sDir * (COURT.halfLength + 0.4));

    const sMates = this.teamActors(sTeam).filter((a) => a !== this.server);
    if (sMates[0]) sMates[0].teleport(-sx * 2.6, sDir * COURT.halfLength * 0.42);

    const rs = this.teamActors(rTeam);
    const receiver = rs[(this.scorer.pointsThisGame + this.serveGames[rTeam]) % rs.length];
    receiver.teleport(-sx * 2.4, -sDir * (COURT.halfLength + 0.2));
    const rMates = rs.filter((a) => a !== receiver);
    if (rMates[0]) rMates[0].teleport(sx * 2.6, -sDir * COURT.halfLength * 0.5);

    for (const a of this.actors) { a.cancelCharge(); a.avatar.playReady(); }
    this.tossActive = false;
    this.serveNetCord = false;
    this.holdBallAtServer();
  }

  private holdBallAtServer(): void {
    const p = this.server.pos;
    // in the toss (left) hand: character left = world -x for team0, +x for team1
    this.ball.hold(new THREE.Vector3(p.x - 0.33 * this.server.dir, 1.25, p.z));
  }

  /**
   * Serve flavour per face button. `kind` feeds the solver its speed and net
   * clearance; `depth` is where in the service box the ball lands, as a
   * fraction of the service line, lerped by toss quality. X is a drop serve
   * that dies just over the net rather than a lob — a lob serve would only
   * ever be a free smash for the receiver.
   */
  private static readonly SERVE_STYLES: Record<'a' | 'b' | 'x' | 'y', {
    kind: ShotKind; depth: [number, number]; power: number; spin: number; name: string;
  }> = {
    a: { kind: 'serve', depth: [0.50, 0.88], power: 1.00, spin: 1.0, name: 'TOPSPIN' },
    b: { kind: 'slice', depth: [0.46, 0.80], power: 0.95, spin: 2.2, name: 'SLICE' },
    // A drop serve cannot land right on top of the net: the ball crosses at
    // ~90% of its flight when the target is that short, so it is already
    // descending to the floor at the tape and clips it for a let. Landing a
    // third of the way into the box still dies well short of a real serve.
    x: { kind: 'drop',  depth: [0.34, 0.52], power: 0.95, spin: 0.6, name: 'DROP' },
    y: { kind: 'flat',  depth: [0.58, 0.95], power: 1.08, spin: 0.4, name: 'FLAT' },
  };

  /** whichever face button went down this frame, if any */
  private facePress(a: Actor): 'a' | 'b' | 'x' | 'y' | '' {
    const p = a.pad;
    if (!p) return '';
    if (p.pressed('a')) return 'a';
    if (p.pressed('b')) return 'b';
    if (p.pressed('x')) return 'x';
    if (p.pressed('y')) return 'y';
    return '';
  }

  private doToss(): void {
    this.tossActive = true;
    this.tossT = 0;
    this.server.avatar.serveToss();
    this.deps.audio.sfx('serve_toss');
  }

  private doServeHit(aimX: number, btn: 'a' | 'b' | 'x' | 'y' = 'a'): void {
    const style = MatchController.SERVE_STYLES[btn];
    const apex = 0.47;
    const quality = 1 - Math.min(1, Math.abs(this.tossT - apex) / 0.3);
    const isPower = quality > 0.72 && btn !== 'x';
    const sx = this.serveSideSign();
    const sDir = this.server.dir;
    const halfSingles = COURT.widthSingles / 2;
    // diagonal service box: x sign opposite the server's stance
    const bx = -sx * (halfSingles * 0.5 + aimX * -sx * halfSingles * 0.32);
    const depth = THREE.MathUtils.lerp(style.depth[0], style.depth[1], quality);
    const bz = -sDir * COURT.serviceLine * depth;
    const from = new THREE.Vector3(this.server.pos.x, Math.max(1.9, 1.5 + this.tossY), this.server.pos.z);
    const target = new THREE.Vector3(THREE.MathUtils.clamp(bx, -halfSingles + 0.3, halfSingles - 0.3), 0.05, bz);
    const power = this.server.powerMul * (0.82 + 0.38 * quality) * this.theme.ballSpeedMul * style.power;
    const serveSpin = aimX * 0.4 * sx * style.spin;
    // the launch kind must match what the solver compensated for, or the
    // magnus drift it corrected would put the ball somewhere else
    const solved = solveShot(from, target, style.kind, power, serveSpin);
    this.server.avatar.serveHit(quality);
    this.tossActive = false;
    this.pending = null;
    // launch after the animation reaches contact
    this.schedule(SWING_CONTACT_DELAY, () => {
      this.ball.launch(from, solved.vel, style.kind, serveSpin);
      this.lastHitTeam = this.scorer.servingTeam;
      this.rallyHits = 0;
      this.phase = 'serveFlight';
      this.phaseT = 0;
      this.deps.audio.sfx(isPower ? 'serve_power' : 'serve_hit');
      if (isPower) {
        this.deps.ui.announce('POWER SERVE!', 'gold', 900);
        this.fx.hitSpark(from, 0xffe14a, true);
        this.server.pad?.rumble(0.7, 0.4, 120);
      } else {
        this.fx.hitSpark(from, 0xffe14a, false);
        this.server.pad?.rumble(0.3, 0.2, 70);
      }
    });
  }

  private timers: { t: number; fn: () => void }[] = [];
  private schedule(t: number, fn: () => void): void { this.timers.push({ t, fn }); }

  // ---------- ball events ----------

  private inCourt(pos: THREE.Vector3): boolean {
    const halfW = (this.singles ? COURT.widthSingles : COURT.widthDoubles) / 2;
    return Math.abs(pos.x) <= halfW + 0.06 && Math.abs(pos.z) <= COURT.halfLength + 0.06;
  }

  private inServeBox(pos: THREE.Vector3): boolean {
    const sx = this.serveSideSign();
    const sDir = this.scorer.servingTeam === 0 ? 1 : -1;
    const okX = pos.x * -sx >= -0.06 && Math.abs(pos.x) <= COURT.widthSingles / 2 + 0.06;
    const okZ = pos.z * -sDir >= -0.06 && Math.abs(pos.z) <= COURT.serviceLine + 0.06;
    return okX && okZ;
  }

  private handleBounce(pos: THREE.Vector3, n: number): void {
    if (this.phase === 'pointEnd' || this.phase === 'victory' || this.phase === 'done') return;
    this.fx.bouncePuff(pos);
    this.deps.audio.sfx('bounce', { rate: 0.9 + Math.random() * 0.2, gain: 0.7 });

    if (this.phase === 'serveFlight' && n === 1) {
      if (this.inServeBox(pos)) {
        if (this.serveNetCord) {
          this.deps.audio.sfx('let');
          this.deps.ui.announce('LET — REPLAY', 'normal', 1200);
          this.resetServe(false);
          return;
        }
        this.phase = 'rally';
        this.phaseT = 0;
        return;
      }
      this.serveFault();
      return;
    }

    if (this.phase !== 'rally' || this.lastHitTeam === -1) return;
    if (this.pending) return; // contact already committed; ignore ground noise

    const hitterSide = this.lastHitTeam === 0 ? 1 : -1;
    if (n === 1) {
      if (Math.sign(pos.z) === hitterSide) {
        // dumped on own side (net dribble back) — hitter loses
        this.endPoint((1 - this.lastHitTeam) as 0 | 1, 'NET!');
      } else if (!this.inCourt(pos)) {
        this.endPoint((1 - this.lastHitTeam) as 0 | 1, 'OUT!');
        this.deps.audio.sfx('crowd_ooh');
      }
      // else: clean bounce, rally continues
    } else if (n >= 2) {
      this.endPoint(this.lastHitTeam, this.rallyHits === 0 ? 'ACE!' : 'WINNER!');
    }
  }

  private handleNetCord(): void {
    this.deps.audio.sfx('net_cord');
    if (this.phase === 'serveFlight') this.serveNetCord = true;
  }

  private handleDead(): void {
    if (this.phase === 'rally' && this.lastHitTeam !== -1) {
      // never bounced ⇒ it sailed out on the full: hitter loses
      if (this.ball.bounceCount === 0) this.endPoint((1 - this.lastHitTeam) as 0 | 1, 'OUT!');
      else this.endPoint(this.lastHitTeam, 'WINNER!');
    } else if (this.phase === 'serveFlight') {
      this.serveFault();
    }
  }

  private serveFault(): void {
    this.serveFaults++;
    this.stats.faults++;
    if (this.serveFaults >= 2) {
      this.deps.audio.sfx('fault');
      this.endPoint((1 - this.scorer.servingTeam) as 0 | 1, 'DOUBLE FAULT!');
    } else {
      this.deps.audio.sfx('fault');
      this.deps.ui.announce('FAULT!', 'normal', 1100);
      this.resetServe(true);
    }
  }

  private resetServe(_keepFaults: boolean): void {
    this.phase = 'servePrep';
    this.phaseT = 0;
    this.pending = null;
    this.timers.length = 0;
    this.fx.hideStar();
    this.placeForServe();
  }

  // ---------- point / score flow ----------

  private endPoint(winner: 0 | 1, msg: string): void {
    if (this.phase === 'pointEnd') return;
    this.phase = 'pointEnd';
    this.phaseT = 0;
    this.pointWinner = winner;
    this.pointMsg = msg;
    this.stats.rallies.push(this.rallyHits);
    this.stats.endings.push(msg);
    if (this.stats.rallies.length > 40) { this.stats.rallies.shift(); this.stats.endings.shift(); }
    this.pending = null;
    this.timers.length = 0;
    this.fx.hideStar();
    this.deps.audio.chargeLoop(false);
    for (const a of this.actors) {
      a.cancelCharge();
      a.avatar.setGlow(0);
      a.intent.moveX = 0; a.intent.moveZ = 0; a.intent.shotPressed = '';
    }
    this.excitement = Math.min(1, 0.5 + this.rallyHits * 0.06);
    this.deps.ui.announce(msg, this.rallyHits >= 6 ? 'big' : 'normal', 1200);
    this.deps.stadium.cheer(this.rallyHits >= 6);
    this.deps.audio.sfx(this.rallyHits >= 6 ? 'crowd_big' : 'crowd_cheer');
    for (const a of this.actors) a.pad?.rumble(0.25, 0.35, 150);
  }

  private applyScore(): void {
    const outcome = this.scorer.wonPoint(this.pointWinner);
    this.deps.ui.updateScore(this.scorer.snapshot());
    if (outcome.kind === 'match') {
      this.deps.audio.sfx('score_game');
      this.deps.ui.announce('GAME, SET & MATCH!', 'gold', 2600);
      this.phase = 'victory';
      this.phaseT = 0;
      for (const a of this.actors) {
        if (a.team === outcome.winner) a.avatar.playVictory();
        else a.avatar.playDefeat();
      }
      this.deps.stadium.cheer(true);
      this.deps.audio.sfx('applause');
      return;
    }
    if (outcome.kind === 'game') {
      this.serveGames[this.scorer.servingTeam === 0 ? 1 : 0]++; // previous server finished a game
      this.deps.audio.sfx('score_game');
      this.deps.ui.announce('GAME!', 'big', 1500);
      this.schedule(1.6, () => {
        if (this.scorer.isFinalGame) this.deps.ui.announce('FINAL GAME!', 'gold', 1600);
      });
    } else {
      this.deps.audio.sfx('score_point');
      this.schedule(1.0, () => this.deps.ui.announce(this.scorer.callout(), 'normal', 1300));
    }
    const mp = ([0, 1] as const).find((t) => this.scorer.isMatchPointFor(t));
    if (mp !== undefined) this.schedule(2.2, () => this.deps.ui.announce('MATCH POINT!', 'gold', 1500));
  }

  // ---------- swings ----------

  private tryExecuteHit(actor: Actor): void {
    const ball = this.ball;
    if (!ball.active || this.pending) return;
    if (this.phase !== 'rally' && this.phase !== 'serveFlight') return;
    if (this.phase === 'serveFlight') return; // must let serve bounce first
    if (this.lastHitTeam === actor.team) return;
    if (actor.swingLock > 0 || actor.avatar.isSwinging()) return;

    // Look ahead along the ball's path once, then decide *when* to swing.
    // The racquet sweeps an arc, so anything passing within range during the
    // swing counts; but if the ball is still closing, wait for it rather than
    // flailing at it early — that is what makes contact feel clean.
    ball.sampleForward(REACH_HORIZON, REACH_SAMPLES, this._samples);
    const swingIdx = Math.max(1, Math.round((SWING_CONTACT_DELAY / REACH_HORIZON) * REACH_SAMPLES));
    let dSwing = Infinity;
    let dLater = Infinity;
    for (let i = 0; i < REACH_SAMPLES; i++) {
      const sp = this._samples[i];
      if (sp.y > STAND_HIT_HEIGHT + LEAP_EXTRA_HEIGHT) continue;
      const d = Math.hypot(sp.x - actor.pos.x, sp.z - actor.pos.z);
      if (i < swingIdx) dSwing = Math.min(dSwing, d);
      else dLater = Math.min(dLater, d);
    }
    // exact ball position at the animation's contact frame — the magnet
    // target must be precise, not a coarse sample
    const contact = ball.predictAt(SWING_CONTACT_DELAY, this._contactTmp);
    const dx = contact.x - actor.pos.x;
    const dz = contact.z - actor.pos.z;
    const dContact = Math.hypot(dx, dz);
    const dHoriz = dSwing;

    // Mario Tennis lets you stretch, dive and leap for balls outside your
    // standing reach — the shot just comes off weaker.
    const stand = actor.reachStand;
    const ext = actor.reachExtended;
    if (dHoriz > ext) return;
    if (contact.y > STAND_HIT_HEIGHT + LEAP_EXTRA_HEIGHT || contact.y < 0) return;
    // Still closing and it will come inside a comfortable reach? Hold the
    // wind-up — swinging now would only produce a stretched, weak contact.
    if (dHoriz > stand && dLater < dHoriz) return;
    const needLeap = contact.y > STAND_HIT_HEIGHT;
    const needLunge = dHoriz > stand;

    // ball must be on / coming to our side
    if (ball.vel.z * actor.dir < -3 && Math.sign(ball.pos.z) !== Math.sign(actor.dir)) return;

    this.stats.swings++;
    if (needLunge) this.stats.lunges++;
    if (needLeap) this.stats.leaps++;
    // star shot?
    let kind = actor.chargeKind;
    let star = false;
    const starDist = this.fx.starActive
      ? Math.min(
        Math.hypot(actor.pos.x - this.fx.starPos.x, actor.pos.z - this.fx.starPos.z),
        Math.hypot(contact.x - this.fx.starPos.x, contact.z - this.fx.starPos.z),
      )
      : Infinity;
    if (starDist < STAR_HIT_RADIUS) {
      kind = 'star';
      star = true;
      this.fx.hideStar();
      this.starConsumedBy = actor;
    } else if (contact.y > 1.5 && (kind === 'flat' || kind === 'topspin')) {
      kind = 'smash';
    }

    const aimX = actor.intent.aimX;
    const aimY = actor.intent.aimY;
    const charge = actor.charge;
    const side = actor.sideForBallX(contact.x);
    const overhead = contact.y > 1.4 && (kind === 'smash' || kind === 'star' || needLeap);
    const swingSide: SwingSide = overhead ? 'overhead' : side;

    // ---- contact magnet (the Mario Tennis "tight action") ----
    // Glide the body during the wind-through so the animation's racquet
    // contact point lands exactly on the ball, instead of swinging from
    // wherever the feet happen to be. Big gaps become a visible dive/leap;
    // small ones read as a step into the shot.
    const off = swingSide === 'overhead'
      ? CONTACT_OFFSET.overhead
      : CONTACT_OFFSET[`${kind}_${swingSide}`] ?? CONTACT_OFFSET.topspin_fore;
    const hScale = actor.avatar.def.height / 1.989; // calibration body height
    // rotate the character-local offset into world space (yaw π for team 0)
    const f = actor.team === 0 ? -1 : 1;
    const worldOffX = off.x * hScale * f;
    const worldOffZ = off.z * hScale * f;
    let tx = contact.x - worldOffX;
    let tz = contact.z - worldOffZ;
    const xLim = COURT.widthDoubles / 2 + 3.0;
    tx = THREE.MathUtils.clamp(tx, -xLim, xLim);
    tz = actor.team === 0
      ? THREE.MathUtils.clamp(tz, 0.7, COURT.halfLength + COURT.runoff - 1.5)
      : THREE.MathUtils.clamp(tz, -(COURT.halfLength + COURT.runoff - 1.5), -0.7);
    const glide = Math.hypot(tx - actor.pos.x, tz - actor.pos.z);
    const hop = needLeap
      ? THREE.MathUtils.clamp(contact.y - STAND_HIT_HEIGHT + 0.32, 0.25, 0.95)
      : glide > stand ? 0.26 : 0;
    actor.startLunge(tx, tz, SWING_CONTACT_DELAY, hop);
    if ((needLunge || needLeap) && glide > stand) actor.pad?.rumble(0.2, 0.5, 90);

    actor.avatar.swing({ side: swingSide, kind, power: charge, contactHeight: contact.y });
    actor.avatar.setGlow(0);
    actor.cancelCharge();
    actor.swingLock = 0.55;
    this.deps.audio.chargeLoop(false);

    // off-balance shots are weaker and less precise
    const stretchMul = needLunge ? (dHoriz > stand * 1.3 ? 0.76 : 0.87) : 1;
    const power = actor.powerMul * (0.9 + charge * 0.32) * this.theme.ballSpeedMul * stretchMul;
    const aimJitter = needLunge ? (Math.random() - 0.5) * 0.22 : 0;
    this.pending = {
      t: SWING_CONTACT_DELAY, actor, kind,
      aimX: THREE.MathUtils.clamp(aimX + aimJitter, -1, 1), aimY, power,
    };
  }

  private launchPending(): void {
    const p = this.pending!;
    this.pending = null;
    const ball = this.ball;
    const from = ball.pos.clone();
    from.y = Math.max(0.35, Math.min(from.y, 2.6));
    const target = computeTarget(p.kind, p.actor.dir, p.aimX, p.aimY, this.singles);
    const sidespin = p.aimX * SHOT_PROFILES[p.kind].curve * p.actor.spinMul * -p.actor.dir;
    const solved = solveShot(from, target, p.kind, p.power, sidespin);
    ball.launch(from, solved.vel, p.kind, sidespin);
    this.lastHitTeam = p.actor.team;
    this.rallyHits++;
    this.excitement = Math.min(1, 0.3 + this.rallyHits * 0.05);

    const sfxMap: Partial<Record<ShotKind, Parameters<AudioApi['sfx']>[0]>> = {
      topspin: 'hit_topspin', slice: 'hit_slice', flat: 'hit_flat',
      lob: 'hit_lob', drop: 'hit_drop', smash: 'hit_smash', star: 'hit_star',
    };
    this.deps.audio.sfx(sfxMap[p.kind] ?? 'hit_flat');
    const color = new THREE.Color(p.actor.avatar.def.color).getHex();
    const big = p.kind === 'star' || p.kind === 'smash';
    this.fx.hitSpark(from, big ? 0xffd700 : color, big);
    p.actor.pad?.rumble(big ? 0.9 : 0.35, big ? 0.6 : 0.3, big ? 200 : 80);
    if (big) {
      this.fx.addShake(p.kind === 'star' ? 0.9 : 0.5);
      this.deps.audio.sfx('crowd_big', { gain: 0.5 });
      if (p.kind === 'star') this.deps.ui.announce(`${p.actor.avatar.def.name.split(' ')[0]} STAR SHOT!`, 'gold', 1100);
    }

    // chance-shot star for the receiving side on floaty balls
    this.maybeSpawnStar(p.kind, target, solved.time, p.actor);
  }

  private maybeSpawnStar(kind: ShotKind, target: THREE.Vector3, time: number, hitter: Actor): void {
    if (this.fx.starActive) return;
    const floaty = kind === 'lob' || kind === 'drop';
    const slow = time > 1.3;
    const force = (window as unknown as { __ccAlwaysStar?: boolean }).__ccAlwaysStar === true;
    if (!force && !floaty && !(slow && Math.random() < 0.45)) return;
    if (!this.inCourt(target)) return;

    // Mark where the ball can ACTUALLY be struck, not where the shot was
    // aimed. Spin, drag and the bounce all move the ball off its target, so
    // a star placed from the target sat somewhere the ball never arrived —
    // you would stand on it and the ball would bounce past you.
    const receiverSide = -hitter.dir;
    this.ball.sampleForward(STAR_HORIZON, STAR_SAMPLES, this._starPath);
    let found = -1;
    for (let i = 0; i < STAR_SAMPLES; i++) {
      const sp = this._starPath[i];
      if (Math.sign(sp.z) !== Math.sign(receiverSide)) continue;
      if (sp.y < 0.45 || sp.y > 1.8) continue;      // comfortable strike height
      if (!this.inCourt(sp)) continue;
      found = i;
      break;                                        // earliest playable point
    }
    if (found < 0) return;
    const sp = this._starPath[found];
    this.fx.showStar(new THREE.Vector3(sp.x, 0, sp.z));
    this.deps.audio.sfx('star_appear');
  }

  // ---------- per-frame ----------

  update(dt: number): void {
    if (this.paused || this.phase === 'done') return;
    this.phaseT += dt;

    for (let i = this.timers.length - 1; i >= 0; i--) {
      this.timers[i].t -= dt;
      if (this.timers[i].t <= 0) { const fn = this.timers[i].fn; this.timers.splice(i, 1); fn(); }
    }

    this.excitement = Math.max(0.25, this.excitement - dt * 0.05);

    switch (this.phase) {
      case 'intro':
        if (this.phaseT > 1.1 && this.phaseT - dt <= 1.1) {
          this.deps.ui.announce('GO!', 'big', 700);
          this.deps.audio.sfx('countdown_go');
        }
        if (this.phaseT > 1.7) { this.phase = 'servePrep'; this.phaseT = 0; this.deps.ui.updateScore(this.scorer.snapshot()); }
        break;

      case 'servePrep':
      case 'serveToss':
        this.updateServe(dt);
        break;

      case 'serveFlight':
      case 'rally':
        this.updateRally(dt);
        break;

      case 'pointEnd':
        if (this.phaseT > 1.4 && this.phaseT - dt <= 1.4) this.applyScore();
        if (this.phaseT > 3.0 && this.phase === 'pointEnd') {
          this.serveFaults = 0;
          this.resetServe(false);
        }
        break;

      case 'victory':
        if (this.phaseT > 3.0) {
          this.phase = 'done';
          const result: MatchResult = {
            winnerTeam: this.scorer.games[0] >= this.scorer.gamesToWin ? 0 : 1,
            teams: [this.teamInfo(0), this.teamInfo(1)],
            finalGames: [this.scorer.games[0], this.scorer.games[1]],
          };
          this.onEnd?.(result);
        }
        break;
    }

    // pending contact
    if (this.pending) {
      this.pending.t -= dt;
      if (this.pending.t <= 0) this.launchPending();
    }

    // retire balls that left the stadium area; resolve the point if still live
    if (this.ball.active && (Math.abs(this.ball.pos.x) > 16 || Math.abs(this.ball.pos.z) > 19)) {
      this.ball.active = false;
      this.handleDead();
    }

    // Between points the controls stay alive for practice swings. This must
    // run BEFORE driveIntents, which drops any wind-up whose button is no
    // longer held — otherwise the release is cancelled before it can swing
    // (the rally path gets this ordering from the phase switch above).
    if (this.phase !== 'rally' && this.phase !== 'serveFlight'
        && this.phase !== 'victory' && this.phase !== 'done') {
      this.processIdleSwings();
    }

    // actors
    this.driveIntents(dt);
    for (const a of this.actors) a.update(dt);
    if (this.phase === 'servePrep' || this.phase === 'serveToss') this.clampServeStance();
    this.ball.update(dt);
    this.fx.update(dt);

    // charge + stamina meters for humans
    for (const a of this.actors) {
      if (!a.isHuman) continue;
      this.deps.ui.setCharge(a.slot, a.charging ? a.charge : -1);
      this.deps.ui.setStamina(a.slot, a.energy);
    }
  }

  private updateServe(dt: number): void {
    const isHuman = this.server.isHuman;
    if (!this.tossActive) {
      // the server may walk the baseline to pick their spot before tossing
      if (isHuman && this.server.pad) {
        const vs = this.viewSign(this.server);
        this.server.intent.moveX = this.server.pad.moveX * vs;
        this.server.intent.moveZ = this.server.pad.moveY * 0.65 * vs;
      } else {
        this.server.intent.moveX = 0;
        this.server.intent.moveZ = 0;
      }
      this.holdBallAtServer();
      if (isHuman) {
        if (this.facePress(this.server)) this.doToss();
      } else {
        const brain = this.brains.get(this.server)!;
        if (brain.serveTick(dt, 0, false) === 'toss') this.doToss();
      }
    } else {
      this.server.intent.moveX = 0;
      this.server.intent.moveZ = 0;
      this.tossT += dt;
      const g = 9.8, v0 = 4.6;
      this.tossY = v0 * this.tossT - 0.5 * g * this.tossT * this.tossT;
      const p = this.server.pos;
      // rises from the toss hand, drifting slightly in toward the strike zone
      const lateral = -0.33 * this.server.dir * (1 - Math.min(1, this.tossT / 0.5));
      this.ball.hold(new THREE.Vector3(p.x + lateral, 1.25 + Math.max(0, this.tossY), p.z));
      if (this.tossY < -0.05) {
        // caught it — re-toss
        this.tossActive = false;
        this.server.avatar.playReady();
        return;
      }
      if (isHuman) {
        const btn = this.facePress(this.server);
        if (btn) {
          this.doServeHit(this.server.pad!.moveX * this.viewSign(this.server), btn);
        }
      } else {
        const brain = this.brains.get(this.server)!;
        if (brain.serveTick(dt, this.tossT, true) === 'hit') {
          const r = Math.random();
          this.doServeHit(brain.serveAimX, r < 0.6 ? 'a' : r < 0.85 ? 'b' : 'y');
        }
      }
    }
    // non-serving actors may shuffle around
    this.driveFormationDuringServe();
  }

  /** keep the server behind their baseline and on the correct service half */
  private clampServeStance(): void {
    const sx = this.serveSideSign();
    const dir = this.server.dir;
    const halfW = (this.singles ? COURT.widthSingles : COURT.widthDoubles) / 2;
    const p = this.server.pos;
    const ax = THREE.MathUtils.clamp(Math.abs(p.x), 0.35, halfW - 0.25);
    p.x = sx * ax;
    const behind = THREE.MathUtils.clamp(p.z * dir, COURT.halfLength + 0.15, COURT.halfLength + 2.2);
    p.z = behind * dir;
    p.y = 0;
  }

  /** one-shot kick when a sprint begins (not every frame it continues) */
  private onSprintStart(actor: Actor): void {
    this.deps.audio.sfx('footstep', { gain: 0.5, rate: 1.5 });
    actor.pad?.rumble(0.25, 0.15, 70);
  }

  private driveFormationDuringServe(): void {
    for (const a of this.actors) {
      if (a === this.server) continue;
      a.intent.moveX = 0; a.intent.moveZ = 0;
      if (a.isHuman && a.pad) {
        const vs = this.viewSign(a);
        a.intent.moveX = a.pad.moveX * 0.4 * vs;
        a.intent.moveZ = a.pad.moveY * 0.4 * vs;
      }
    }
  }

  private updateRally(dt: number): void {
    // designated AI receivers per team (closest to predicted landing)
    const landing = new THREE.Vector3();
    const receiving: (Actor | null)[] = [null, null];
    if (this.ball.active) {
      this.ball.predictLanding(landing);
      for (const team of [0, 1] as const) {
        const mayHit = this.lastHitTeam !== team;
        if (!mayHit) continue;
        let best: Actor | null = null, bestD = Infinity;
        for (const a of this.teamActors(team)) {
          const d = Math.hypot(a.pos.x - landing.x, a.pos.z - landing.z);
          if (d < bestD) { bestD = d; best = a; }
        }
        receiving[team] = best;
      }
    }

    for (const a of this.actors) {
      const brain = this.brains.get(a);
      if (brain) {
        brain.update(dt, {
          ball: this.ball,
          ballLive: this.phase === 'rally' || this.phase === 'serveFlight',
          myTeamMayHit: this.lastHitTeam !== a.team,
          iAmReceiver: receiving[a.team] === a,
          opponents: this.teamActors((1 - a.team) as 0 | 1),
          partner: this.teamActors(a.team).find((x) => x !== a) ?? null,
          fx: this.fx,
          singles: this.singles,
          rallyLen: this.rallyHits,
        });
      }
    }
    this.processShotInputs();
  }

  private driveIntents(dt: number): void {
    // human stick → intent (screen-relative: up = away from camera = -z)
    for (const a of this.actors) {
      if (!a.isHuman || !a.pad) continue;
      if (this.phase === 'rally' || this.phase === 'serveFlight') {
        // stick in the player's own view frame, then into world space
        const vs = this.viewSign(a);
        const px = a.pad.moveX * vs;
        const py = a.pad.moveY * vs;
        a.intent.moveX = px;
        a.intent.moveZ = py;
        a.intent.aimX = px;
        a.intent.aimY = -py * (a.team === 0 ? 1 : -1); // push toward far side = deeper
      }
      // Only drop a wind-up the player is no longer holding; while the button
      // is down the coiled pose is exactly the feedback they asked for.
      if (a.charging && a.chargeBtn && !a.pad.held(a.chargeBtn)) {
        a.cancelCharge();
        a.avatar.setGlow(0);
        this.deps.audio.chargeLoop(false);
      }

      // visible wind-up feedback: the character glows brighter as it charges
      if (a.charging) a.avatar.setGlow(0.14 + a.charge * 0.56);

      // hold LB to sprint — steerable, and you can still swing out of it
      const wasSprinting = a.isSprinting;
      a.sprintHeld = a.pad.held('lb');
      if (!wasSprinting && a.sprintHeld && a.energy > 0.02) this.onSprintStart(a);
    }
  }

  /**
   * Between points there is nothing to hit, but a player waiting on a serve
   * still wants to feel the controls — winding up and swinging at air is how
   * you learn the timing. Humans may swing freely in the idle phases; the
   * ball is not live, so these are purely animation. The server is left out
   * while they are on the ball: their A button is the toss.
   */
  private processIdleSwings(): void {
    for (const a of this.actors) {
      if (!a.isHuman || !a.pad) continue;
      const isServerOnBall =
        a === this.server && (this.phase === 'servePrep' || this.phase === 'serveToss');
      if (isServerOnBall) continue;

      let btn: 'a' | 'b' | 'x' | 'y' | '' = '';
      if (a.pad.pressed('a')) btn = 'a';
      else if (a.pad.pressed('b')) btn = 'b';
      else if (a.pad.pressed('x')) btn = 'x';
      else if (a.pad.pressed('y')) btn = 'y';

      if (btn) {
        if (a.charging) a.comboPress(btn);
        else if (a.swingLock <= 0) {
          // no live ball to read a side from — let the stick pick, as the
          // player would when lining a real shot up
          // stick-right is the character's racquet side in EITHER pane, so
          // the raw screen-relative stick is the right thing to read here
          const side = a.pad.moveX < -0.3 ? 'back' : 'fore';
          a.beginCharge(btn, side);
          this.deps.audio.chargeLoop(true);
        }
      }
      // releasing swings through, exactly as a whiffed shot does in a rally
      if (a.charging && a.chargeBtn && a.pad.released(a.chargeBtn)) {
        this.whiffSwing(a);
      }
    }
  }

  private processShotInputs(): void {
    if (this.phase !== 'rally' && this.phase !== 'serveFlight') return;
    for (const a of this.actors) {
      let btn: 'a' | 'b' | 'x' | 'y' | '' = '';
      if (a.isHuman && a.pad) {
        if (a.pad.pressed('a')) btn = 'a';
        else if (a.pad.pressed('b')) btn = 'b';
        else if (a.pad.pressed('x')) btn = 'x';
        else if (a.pad.pressed('y')) btn = 'y';
      } else {
        btn = a.intent.shotPressed;
        a.intent.shotPressed = '';
      }
      if (btn) {
        if (a.charging) a.comboPress(btn);
        // A human who presses gets a wind-up immediately, even if the ball is
        // still on the far side — pressing and seeing nothing happen is the
        // single most confusing thing the controls can do. The swing simply
        // will not connect until the ball is theirs to hit.
        else if ((a.isHuman || this.lastHitTeam !== a.team) && a.swingLock <= 0) {
          const side = a.sideForBallX(this.ball.pos.x);
          a.beginCharge(btn, side);
          if (a.isHuman) this.deps.audio.chargeLoop(true);
        }
      }
      if (a.charging || btn) this.tryExecuteHit(a);
      else if (this.lastHitTeam !== a.team) this.tryAutoSwing(a);

      // Releasing the button always resolves the wind-up: if the ball never
      // came, swing through anyway rather than freezing in the coiled pose.
      if (a.isHuman && a.pad && a.charging && a.chargeBtn && a.pad.released(a.chargeBtn)) {
        this.whiffSwing(a);
      }
    }
  }

  /** swing through empty air and return to the ready stance */
  private whiffSwing(actor: Actor): void {
    const side = actor.chargeSide;
    const kind = actor.chargeKind;
    const power = actor.charge;
    actor.avatar.swing({ side, kind, power });
    actor.avatar.setGlow(0);
    actor.cancelCharge();
    actor.swingLock = 0.42;
    this.deps.audio.chargeLoop(false);
    this.deps.audio.sfx('whiff', { gain: 0.5 });
  }

  /** tiny mercy: if ball is about to pass a non-charging human within easy
   *  reach, do nothing (they must press). AI always charges via brain. */
  private tryAutoSwing(_a: Actor): void {}

  /** true when humans are on BOTH teams — each needs their own view */
  get needsSplitView(): boolean {
    const t0 = this.teamActors(0).some((a) => a.isHuman);
    const t1 = this.teamActors(1).some((a) => a.isHuman);
    return t0 && t1;
  }

  /** Tell the match whether two panes are actually being rendered, so stick
   *  input is read in the frame the player is really looking at. Follows the
   *  MULTI-VIEW / SINGLE camera setting, which can change mid-match. */
  setSplitView(on: boolean): void {
    this.splitView = on;
  }

  /**
   * Stick → world mapping for one actor, as seen through the camera THEY are
   * looking at. Everyone shares the team-0 camera normally, so raw stick input
   * is already world-space. In split view team 1 gets its own camera behind
   * the far baseline: that view is rotated 180°, so screen-right is world -x
   * and screen-up is world +z, and their stick has to be flipped to match.
   */
  private viewSign(a: Actor): 1 | -1 {
    return this.splitView && a.team === 1 ? -1 : 1;
  }

  /** which team each slot plays for (drives per-half HUD placement) */
  slotTeams(): (0 | 1)[] {
    const out: (0 | 1)[] = [];
    for (const a of this.actors) out[a.slot] = a.team;
    return out;
  }

  /** everything the camera must keep on screen: the ball and every player */
  focusPoints(): THREE.Vector3[] {
    this._focus.length = 0;
    for (const a of this.actors) this._focus.push(a.pos);
    this._focus.push(this.ball.pos);
    return this._focus;
  }

  /** debug/testing accessors */

  get phaseName(): string { return this.phase; }
  get score() { return this.scorer.snapshot(); }
  get rallyCount(): number { return this.rallyHits; }

  getResultNow(): MatchResult {
    return {
      winnerTeam: this.scorer.games[0] >= this.scorer.games[1] ? 0 : 1,
      teams: [this.teamInfo(0), this.teamInfo(1)],
      finalGames: [this.scorer.games[0], this.scorer.games[1]],
    };
  }

  dispose(): void {
    this.phase = 'done';
    this.group.removeFromParent();
  }
}
