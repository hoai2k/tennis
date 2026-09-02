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
  /** Deliberately livelier than a real ball. The point ends on the second
   *  bounce, so the hang time after the FIRST one is the whole window you get
   *  to run a deep ball down — at 0.72 that window was ~0.66s while the ball
   *  travelled 9-15m, i.e. it outran you. */
  bounceRestitution: 0.80,
  /** ceiling on the whole vertical rebound — court multiplier and topspin
   *  lift included — so the bounciest surface (Mayhem Foundry, 1.18) plus a
   *  topspin kick can't approach a perfectly elastic ball */
  maxRestitution: 0.90,
  /** Horizontal speed kept through a bounce. This — not the hang time — is
   *  what decides whether you can run a ball down: chasing in the ball's own
   *  direction, the ground you can cover is (sprint speed / post-bounce speed),
   *  and the hang time cancels out. It used to be >1 for topspin, so the ball
   *  literally accelerated away from you. */
  bounceFriction: 0.85,
  airDrag: 0.008,
} as const;

/** base movement speed in m/s at speed stat 3 */
export const PLAYER_BASE_SPEED = 9.4;
/** base shot speed in m/s at power stat 3, uncharged */
export const SHOT_BASE_SPEED = 21;
