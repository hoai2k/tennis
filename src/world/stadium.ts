import * as THREE from 'three';
import type { CourtTheme, CourtThemeDef, StadiumApi } from '../core/types';
import { getPalette, themeDefList } from './themes';
import { seededRand, disposeObject } from './util';
import { buildCourt } from './court';
import { buildNet } from './net';
import { buildStands } from './stands';
import { CrowdSystem } from './crowd';
import { buildFurniture } from './furniture';
import { buildSky } from './sky';
import { buildLights } from './lights';

/* Entry point for the procedural stadium. Everything (court, net, stands,
 * crowd, furniture, sky, lights) lives inside the returned group — the game
 * just does scene.add(api.group) and calls update()/cheer(). */

export function themeDefs(): CourtThemeDef[] {
  return themeDefList();
}

export function createStadium(
  theme: CourtTheme,
  crowdDensity: 'full' | 'light'
): StadiumApi {
  const palette = getPalette(theme);
  const rand = seededRand(0xc0537 + theme.length * 977);

  const group = new THREE.Group();
  group.name = `stadium-${theme}`;

  group.add(buildCourt(palette));
  group.add(buildNet(palette));

  const stands = buildStands(palette, rand);
  group.add(stands.group);

  const crowd = new CrowdSystem(stands.anchors, crowdDensity, palette, rand);
  group.add(crowd.group);

  group.add(buildFurniture(palette));
  group.add(buildSky(palette, rand));
  group.add(buildLights(palette));

  // separate rng for cheer bursts so build stays deterministic
  const cheerRand = seededRand(0xbeef);

  return {
    group,
    update(dt: number, excitement: number): void {
      crowd.update(dt, excitement);
    },
    cheer(big: boolean): void {
      crowd.cheer(big, cheerRand);
    },
    dispose(): void {
      disposeObject(group);
      group.removeFromParent();
    },
  };
}
