/**
 * The entry point, ahead of the game.
 *
 * `index.html` loads this instead of `src/main.ts`, so the door goes up first
 * and the game is imported only once the visitor is through. The game is behind
 * a dynamic import, which Vite splits into its own chunk — somebody who never
 * gets in never downloads it.
 *
 * Plain JavaScript on purpose: `tsc --noEmit` ignores `.js` under this config,
 * which keeps the shared door byte-identical across every game rather than
 * forking a typed copy per repository. Vite bundles it the same either way.
 *
 * THE DEV PAGES ARE NOT GATED. audiotest, charviewer, skinaudit, uitest and
 * worldviewer are tools reached by URL, not the game; gating them was left as a
 * decision rather than assumed. They serve the same asset files the game does,
 * so a door on them is presentation rather than protection.
 *
 * The door is off on localhost, so `npm run dev` never meets it — see the
 * header of `gate.js`.
 */
import { openGate } from './gate.js';

openGate({
  title: 'Tennis',
  blurb: 'This game is for friends of Hoai Nguyen. Use your invite link, or enter your code below.',
  game: 'tennis',
}).then(() => import('../main.ts'));
