import * as THREE from 'three';
import { COURT } from '../core/constants';
import {
  SWING_CONTACT_DELAY,
  type AudioApi, type Avatar, type CourtThemeDef, type MatchResult,
  type MatchSetup, type ShotKind, type StadiumApi, type TeamInfo,
} from '../core/types';
import type { UiApi } from '../ui';
import type { InputManager } from '../core/input';
import { Ball } from './ball';
import { MatchFx } from './effects';
import { Scorer } from './rules';
import { Actor } from './actors';
import { AiBrain } from './ai';
import { computeTarget, solveShot } from './shots';

type Phase = 'intro' | 'servePrep' | 'serveToss' | 'serveFlight' | 'rally' | 'pointEnd' | 'victory' | 'done';

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
    this.server.teleport(sx * 1.7, sDir * (COURT.halfLength + 0.4));

    const sMates = this.teamActors(sTeam).filter((a) => a !== this.server);
    if (sMates[0]) sMates[0].teleport(-sx * 2.6, sDir * COURT.halfLength * 0.42);

    const rs = this.teamActors(rTeam);
    const receiver = rs[(this.scorer.pointsThisGame + this.serveGames[rTeam]) % rs.length];
    receiver.teleport(-sx * 2.4, -sDir * (COURT.halfLength - 0.3));
    const rMates = rs.filter((a) => a !== receiver);
    if (rMates[0]) rMates[0].teleport(sx * 2.6, -sDir * COURT.halfLength * 0.5);

    for (const a of this.actors) { a.cancelCharge(); a.avatar.playReady(); }
    this.tossActive = false;
    this.serveNetCord = false;
    this.holdBallAtServer();
  }

  private holdBallAtServer(): void {
    const p = this.server.pos;
    this.ball.hold(new THREE.Vector3(p.x, 1.5, p.z));
  }

  private doToss(): void {
    this.tossActive = true;
    this.tossT = 0;
    this.server.avatar.serveToss();
    this.deps.audio.sfx('serve_toss');
  }

  private doServeHit(aimX: number): void {
    const apex = 0.47;
    const quality = 1 - Math.min(1, Math.abs(this.tossT - apex) / 0.3);
    const isPower = quality > 0.72;
    const sx = this.serveSideSign();
    const sDir = this.server.dir;
    const halfSingles = COURT.widthSingles / 2;
    // diagonal service box: x sign opposite the server's stance
    const bx = -sx * (halfSingles * 0.5 + aimX * -sx * halfSingles * 0.32);
    const bz = -sDir * COURT.serviceLine * (0.5 + 0.38 * quality);
    const from = new THREE.Vector3(this.server.pos.x, Math.max(1.9, 1.5 + this.tossY), this.server.pos.z);
    const target = new THREE.Vector3(THREE.MathUtils.clamp(bx, -halfSingles + 0.3, halfSingles - 0.3), 0.05, bz);
    const power = this.server.powerMul * (0.82 + 0.38 * quality) * this.theme.ballSpeedMul;
    const solved = solveShot(from, target, 'serve', power, aimX);
    this.server.avatar.serveHit(quality);
    this.tossActive = false;
    this.pending = null;
    // launch after the animation reaches contact
    this.schedule(SWING_CONTACT_DELAY, () => {
      this.ball.launch(from, solved.vel, 'serve', solved.sidespin * sx);
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
      this.endPoint(this.lastHitTeam, 'WINNER!');
    } else if (this.phase === 'serveFlight') {
      this.serveFault();
    }
  }

  private serveFault(): void {
    this.serveFaults++;
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
    this.pending = null;
    this.timers.length = 0;
    this.fx.hideStar();
    this.deps.audio.chargeLoop(false);
    for (const a of this.actors) {
      a.cancelCharge();
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
    const d = actor.pos.distanceTo(ball.pos);
    if (d > actor.reach) return;
    // ball must be on / coming to our side
    if (ball.vel.z * actor.dir < -3 && Math.sign(ball.pos.z) !== Math.sign(actor.dir)) return;

    // star shot?
    let kind = actor.chargeKind;
    let star = false;
    if (this.fx.starActive && actor.pos.distanceTo(this.fx.starPos) < 1.15) {
      kind = 'star';
      star = true;
      this.fx.hideStar();
      this.starConsumedBy = actor;
    } else if (ball.pos.y > 1.5 && (kind === 'flat' || kind === 'topspin')) {
      kind = 'smash';
    }

    const aimX = actor.intent.aimX;
    const aimY = actor.intent.aimY;
    const charge = actor.charge;
    const side = actor.sideForBallX(ball.pos.x);
    actor.avatar.swing({ side: kind === 'smash' || kind === 'star' ? (ball.pos.y > 1.4 ? 'overhead' : side) : side, kind, power: charge });
    actor.cancelCharge();
    actor.swingLock = 0.55;
    this.deps.audio.chargeLoop(false);

    const power = actor.powerMul * (0.9 + charge * 0.32) * this.theme.ballSpeedMul;
    this.pending = { t: SWING_CONTACT_DELAY, actor, kind, aimX, aimY, power };
  }

  private launchPending(): void {
    const p = this.pending!;
    this.pending = null;
    const ball = this.ball;
    const from = ball.pos.clone();
    from.y = Math.max(0.35, Math.min(from.y, 2.6));
    const target = computeTarget(p.kind, p.actor.dir, p.aimX, p.aimY, this.singles);
    const solved = solveShot(from, target, p.kind, p.power, p.aimX);
    ball.launch(from, solved.vel, p.kind, solved.sidespin * p.actor.spinMul * -p.actor.dir);
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
    if (!floaty && !(slow && Math.random() < 0.45)) return;
    if (!this.inCourt(target)) return;
    // star sits one step behind the landing spot (further from the net)
    const star = new THREE.Vector3(target.x, 0, target.z - 0.9 * hitter.dir);
    const receiverSide = -hitter.dir; // -1 ⇒ z<0 side
    star.z = receiverSide === -1
      ? THREE.MathUtils.clamp(star.z, -COURT.halfLength + 0.5, -0.8)
      : THREE.MathUtils.clamp(star.z, 0.8, COURT.halfLength - 0.5);
    this.fx.showStar(star);
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

    // actors
    this.driveIntents(dt);
    for (const a of this.actors) a.update(dt);
    this.ball.update(dt);
    this.fx.update(dt);

    // charge meters for humans
    for (const a of this.actors) {
      if (a.isHuman) this.deps.ui.setCharge(a.slot, a.charging ? a.charge : -1);
    }
  }

  private updateServe(dt: number): void {
    const isHuman = this.server.isHuman;
    if (!this.tossActive) {
      this.holdBallAtServer();
      if (isHuman) {
        if (this.server.pad?.pressed('a')) this.doToss();
      } else {
        const brain = this.brains.get(this.server)!;
        if (brain.serveTick(dt, 0, false) === 'toss') this.doToss();
      }
    } else {
      this.tossT += dt;
      const g = 9.8, v0 = 4.6;
      this.tossY = v0 * this.tossT - 0.5 * g * this.tossT * this.tossT;
      const p = this.server.pos;
      this.ball.hold(new THREE.Vector3(p.x, 1.5 + Math.max(0, this.tossY), p.z));
      if (this.tossY < -0.05) {
        // caught it — re-toss
        this.tossActive = false;
        this.server.avatar.playReady();
        return;
      }
      if (isHuman) {
        if (this.server.pad?.pressed('a')) this.doServeHit(this.server.pad.moveX);
      } else {
        const brain = this.brains.get(this.server)!;
        if (brain.serveTick(dt, this.tossT, true) === 'hit') this.doServeHit(brain.serveAimX);
      }
    }
    // non-serving actors may shuffle around
    this.driveFormationDuringServe();
  }

  private driveFormationDuringServe(): void {
    for (const a of this.actors) {
      if (a === this.server) continue;
      a.intent.moveX = 0; a.intent.moveZ = 0;
      if (a.isHuman && a.pad) { a.intent.moveX = a.pad.moveX * 0.4; a.intent.moveZ = a.pad.moveY * 0.4; }
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
        a.intent.moveX = a.pad.moveX;
        a.intent.moveZ = a.pad.moveY;
        a.intent.aimX = a.pad.moveX;
        a.intent.aimY = -a.pad.moveY * (a.team === 0 ? 1 : -1); // push toward far side = deeper
      }
      // cancel charge if our own team just hit (ball heading away)
      if (a.charging && this.ball.active && this.lastHitTeam === a.team) {
        a.cancelCharge();
        this.deps.audio.chargeLoop(false);
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
        else if (this.lastHitTeam !== a.team && a.swingLock <= 0) {
          const side = a.sideForBallX(this.ball.pos.x);
          a.beginCharge(btn, side);
          if (a.isHuman) this.deps.audio.chargeLoop(true);
        }
      }
      if (a.charging || btn) this.tryExecuteHit(a);
      else if (this.lastHitTeam !== a.team) this.tryAutoSwing(a);
    }
  }

  /** tiny mercy: if ball is about to pass a non-charging human within easy
   *  reach, do nothing (they must press). AI always charges via brain. */
  private tryAutoSwing(_a: Actor): void {}

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
