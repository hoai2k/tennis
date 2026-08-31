/* Court geometry & physics constants (world units = meters).
 * Team 0 defends z > 0 (near side, default camera behind them);
 * team 1 defends z < 0. Net is at z = 0. X is sideline axis. */

export const COURT = {
  /** full length baseline-to-baseline */
  length: 23.77,
  /** singles sideline-to-sideline */
  widthSingles: 8.23,
  /** doubles sideline-to-sideline */
  widthDoubles: 10.97,
  /** service line distance from net */
  serviceLine: 6.4,
  /** net height at center */
  netHeightCenter: 0.95,
  /** net height at posts */
  netHeightPost: 1.1,
  /** half-length convenience */
  halfLength: 23.77 / 2,
  /** out-of-bounds run-off space around the court */
  runoff: 6.5,
} as const;

export const GRAVITY = -22; // arcade-y gravity (real is -9.8; higher keeps rallies snappy)

export const BALL = {
  radius: 0.11, // slightly big, arcade look
  bounceRestitution: 0.72,
  airDrag: 0.008,
} as const;

/** base movement speed in m/s at speed stat 3 */
export const PLAYER_BASE_SPEED = 7.2;
/** base shot speed in m/s at power stat 3, uncharged */
export const SHOT_BASE_SPEED = 21;
