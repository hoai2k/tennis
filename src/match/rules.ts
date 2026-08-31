import type { ScoreState } from '../core/types';

/* Tennis scoring: 15/30/40/deuce/advantage games, first team to
 * `gamesToWin` games takes the match (arcade single set). At
 * gamesToWin-1 all, the next game is the deciding "final game". */

export type PointOutcome =
  | { kind: 'point' }
  | { kind: 'game' }
  | { kind: 'match'; winner: 0 | 1 };

const POINT_LABELS = ['0', '15', '30', '40'];

export class Scorer {
  points: [number, number] = [0, 0]; // 0..3, 4=advantage bookkeeping below
  games: [number, number] = [0, 0];
  servingTeam: 0 | 1 = 0;
  /** total points played in current game (serve side: even=right/deuce court) */
  pointsThisGame = 0;
  /** total games played (serve rotation) */
  private advantage: -1 | 0 | 1 = -1; // -1 none, else team with Ad

  constructor(public gamesToWin: number) {}

  get isDeuce(): boolean {
    return this.points[0] >= 3 && this.points[1] >= 3 && this.advantage === -1;
  }

  get isFinalGame(): boolean {
    return this.games[0] === this.gamesToWin - 1 && this.games[1] === this.gamesToWin - 1;
  }

  /** true when the next point could decide the match for `team` */
  isMatchPointFor(team: 0 | 1): boolean {
    if (this.games[team] !== this.gamesToWin - 1) return false;
    return this.isGamePointFor(team);
  }

  isGamePointFor(team: 0 | 1): boolean {
    const other = (1 - team) as 0 | 1;
    if (this.advantage === team) return true;
    if (this.advantage !== -1) return false;
    return this.points[team] >= 3 && this.points[team] > this.points[other];
  }

  /** serve court for current point: 'right' (deuce) or 'left' (ad) */
  get serveCourt(): 'right' | 'left' {
    return this.pointsThisGame % 2 === 0 ? 'right' : 'left';
  }

  wonPoint(team: 0 | 1): PointOutcome {
    const other = (1 - team) as 0 | 1;
    this.pointsThisGame++;
    const both40 = this.points[team] >= 3 && this.points[other] >= 3;
    if (both40) {
      if (this.advantage === team) return this.wonGame(team);
      if (this.advantage === other) { this.advantage = -1; return { kind: 'point' }; }
      this.advantage = team;
      return { kind: 'point' };
    }
    this.points[team]++;
    if (this.points[team] > 3) return this.wonGame(team);
    return { kind: 'point' };
  }

  private wonGame(team: 0 | 1): PointOutcome {
    this.games[team]++;
    this.points = [0, 0];
    this.advantage = -1;
    this.pointsThisGame = 0;
    this.servingTeam = (1 - this.servingTeam) as 0 | 1;
    if (this.games[team] >= this.gamesToWin) return { kind: 'match', winner: team };
    return { kind: 'game' };
  }

  pointLabel(team: 0 | 1): string {
    if (this.advantage === team) return 'Ad';
    if (this.advantage === (1 - team)) return '–';
    return POINT_LABELS[Math.min(this.points[team], 3)];
  }

  snapshot(): ScoreState {
    return {
      points: [this.pointLabel(0), this.pointLabel(1)],
      games: [this.games[0], this.games[1]],
      gamesToWin: this.gamesToWin,
      servingTeam: this.servingTeam,
      isTiebreak: this.isFinalGame,
      isDeuce: this.isDeuce,
    };
  }

  /** call announcement text after a rally, e.g. "15 – LOVE" (server first) */
  callout(): string {
    if (this.isDeuce) return 'DEUCE';
    if (this.advantage !== -1) {
      return this.advantage === this.servingTeam ? 'ADVANTAGE IN' : 'ADVANTAGE OUT';
    }
    const s = this.pointLabel(this.servingTeam);
    const r = this.pointLabel((1 - this.servingTeam) as 0 | 1);
    const word = (x: string) => (x === '0' ? 'LOVE' : x);
    if (s === r) return `${word(s)} – ALL`;
    return `${word(s)} – ${word(r)}`;
  }
}
