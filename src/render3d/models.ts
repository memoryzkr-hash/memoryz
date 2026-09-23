import * as THREE from 'three';
import type { Side } from '../core/types';
import { G, PAL, TEAM, group, part, pivot, toon } from './kit';

/** Animated handles into a built model. Models face +Z; the world rotates `root` to aim them. */
export interface Rig {
  root: THREE.Group;
  /** Everything above the ground ring; bobs while walking. */
  body: THREE.Group;
  legs: THREE.Object3D[];
  armR?: THREE.Object3D;
  armL?: THREE.Object3D;
  wings: THREE.Object3D[];
  /** Part that turns toward the target independently of the root (tower figures, cannon barrel). */
  turret?: THREE.Object3D;
  /** Arm pose held while a ranged unit is aiming. */
  aimPose?: number;
  attack: 'swing' | 'spin' | 'shoot' | 'throw' | 'none';
  /** Top of the model in world units, used to place the health bar. */
  height: number;
  flying: boolean;
}

interface HumanoidOpts {
  skin?: number;
  shirt: number;
  pants: number;
  boots?: number;
  headR?: number;
  torsoW?: number;
  torsoH?: number;
  armT?: number;
  handR?: number;
  bones?: boolean;
  eyes?: number;
}

interface Humanoid {
  body: THREE.Group;
  head: THREE.Group;
  legs: THREE.Group[];
  armR: THREE.Group;
  armL: THREE.Group;
  handR: THREE.Group;
  handL: THREE.Group;
  top: number;
}

/** Chibi body: big head, short torso and stubby limbs, around 1.1 units tall before scaling. */
function humanoid(o: HumanoidOpts): Humanoid {
  const skin = toon(o.skin ?? PAL.skin);
  const shirt = toon(o.shirt);
  const pants = toon(o.pants);
  const boots = toon(o.boots ?? PAL.woodDark);
  const headR = o.headR ?? 0.25;
  const torsoW = o.torsoW ?? 0.34;
  const torsoH = o.torsoH ?? 0.34;
  const armT = o.armT ?? 0.1;
  const handR = o.handR ?? 0.065;
  const hipY = 0.26;
  const limb = o.bones ? toon(PAL.bone) : pants;

  const legs = [-1, 1].map((sx) =>
    pivot(
      [sx * 0.09, hipY, 0],
      part(G.cyl(), limb, { p: [0, -0.11, 0], s: o.bones ? [0.03, 0.22, 0.03] : [0.065, 0.22, 0.065] }),
      part(G.box(), boots, { p: [0, -0.23, 0.03], s: [0.12, 0.07, 0.17] }),
    ),
  );

  const body = group(...legs);
  const torsoTop = hipY + torsoH;
  if (o.bones) {
    const bone = toon(PAL.bone);
    body.add(part(G.cyl(), bone, { p: [0, hipY + torsoH / 2, 0], s: [0.035, torsoH, 0.035] }));
    for (let i = 0; i < 3; i++) {
      body.add(part(G.torus(), bone, { p: [0, hipY + 0.1 + i * 0.08, 0], s: [0.12 - i * 0.01, 0.12 - i * 0.01, 0.12], r: [Math.PI / 2, 0, 0] }));
    }
    body.add(part(G.box(), bone, { p: [0, hipY + 0.02, 0], s: [0.2, 0.06, 0.1] }));
  } else {
    body.add(part(G.capsule(), shirt, { p: [0, hipY + torsoH / 2, 0], s: [torsoW, torsoH / 2, torsoW * 0.85] }));
    body.add(part(G.cyl(), toon(PAL.woodDark), { p: [0, hipY + 0.05, 0], s: [torsoW * 0.52, 0.05, torsoW * 0.45] }));
  }

  const headY = torsoTop + headR * 0.8;
  const head = pivot([0, headY, 0]);
  head.add(part(G.sphere(), o.bones ? toon(PAL.bone) : skin, { s: headR }));
  for (const sx of [-1, 1]) {
    const at: [number, number, number] = [sx * headR * 0.36, headR * 0.1, headR * 0.84];
    if (o.bones) {
      head.add(part(G.sphere(), toon(PAL.black), { p: at, s: 0.058 }));
    } else if (o.eyes) {
      head.add(part(G.sphere(), toon(o.eyes, o.eyes), { p: at, s: 0.045 }));
    } else {
      head.add(part(G.sphere(), toon(PAL.white), { p: at, s: [0.055, 0.065, 0.04] }));
      head.add(part(G.sphere(), toon(PAL.black), { p: [at[0] * 0.95, at[1], at[2] + 0.03], s: 0.03 }));
    }
  }
  if (!o.bones) head.add(part(G.sphere(), toon(PAL.skinShade), { p: [0, -headR * 0.12, headR * 0.95], s: headR * 0.16 }));
  body.add(head);

  const shoulderY = torsoTop - 0.05;
  const arm = (sx: number) => {
    const hand = pivot([0, -0.22, 0], part(G.sphere(), o.bones ? toon(PAL.bone) : skin, { s: handR }));
    const a = pivot(
      [sx * (torsoW / 2 + armT * 0.35), shoulderY, 0],
      part(G.capsule(), o.bones ? toon(PAL.bone) : shirt, { p: [0, -0.1, 0], s: o.bones ? [0.05, 0.1, 0.05] : [armT, 0.1, armT] }),
      hand,
    );
    body.add(a);
    return { a, hand };
  };
  const r = arm(-1);
  const l = arm(1);
  return { body, head, legs, armR: r.a, armL: l.a, handR: r.hand, handL: l.hand, top: headY + headR };
}

function rigFrom(h: Humanoid, scale: number, extra: Partial<Rig> = {}): Rig {
  const root = group(h.body);
  h.body.scale.setScalar(scale);
  return {
    root,
    body: h.body,
    legs: h.legs,
    armR: h.armR,
    armL: h.armL,
    wings: [],
    attack: 'swing',
    height: h.top * scale,
    flying: false,
    ...extra,
  };
}

function sword(length = 0.42, width = 0.045): THREE.Group {
  return group(
    part(G.box(), toon(PAL.steel), { p: [0, length / 2 + 0.05, 0], s: [width, length, 0.015] }),
    part(G.box(), toon(PAL.gold), { p: [0, 0.05, 0], s: [0.16, 0.03, 0.04] }),
    part(G.cyl(), toon(PAL.woodDark), { p: [0, -0.02, 0], s: [0.022, 0.1, 0.022] }),
  );
}

/** Holds a weapon in a hand, tipped forward. */
function hold(hand: THREE.Object3D, item: THREE.Object3D, tilt = 1.1): void {
  item.rotation.x = tilt;
  hand.add(item);
}

// --- Troops ---------------------------------------------------------------

function knight(side: Side): Rig {
  const h = humanoid({ shirt: PAL.steel, pants: PAL.steelDark, boots: PAL.black });
  const team = TEAM[side];
  h.body.add(part(G.box(), toon(team.main), { p: [0, 0.43, 0.13], s: [0.24, 0.26, 0.03] }));
  h.body.add(part(G.box(), toon(PAL.gold), { p: [0, 0.47, 0.15], s: [0.07, 0.07, 0.02] }));
  h.head.add(part(G.hemi(), toon(PAL.steel), { p: [0, 0.07, 0], s: 0.265 }));
  h.head.add(part(G.cone(), toon(team.main), { p: [0, 0.37, -0.03], s: [0.06, 0.2, 0.06] }));
  for (const sx of [-1, 1]) {
    h.head.add(part(G.box(), toon(PAL.hairBrown), { p: [sx * 0.07, -0.08, 0.22], s: [0.11, 0.04, 0.05], r: [0, 0, sx * 0.35] }));
  }
  hold(h.handR, sword());
  const shield = group(
    part(G.cyl(), toon(team.main), { s: [0.19, 0.03, 0.19], r: [Math.PI / 2, 0, 0] }),
    part(G.torus(), toon(PAL.gold), { s: [0.19, 0.19, 0.12] }),
    part(G.sphere(), toon(PAL.gold), { p: [0, 0, 0.03], s: 0.05 }),
  );
  shield.position.set(0.04, 0, 0.07);
  h.handL.add(shield);
  return rigFrom(h, 1.45);
}

function archer(side: Side, scale = 1.2): Rig {
  const team = TEAM[side];
  const h = humanoid({ shirt: team.main, pants: PAL.brownCloth });
  h.head.add(part(G.sphere(), toon(PAL.hairPink), { p: [0, -0.02, -0.06], s: [0.25, 0.22, 0.24] }));
  h.head.add(part(G.sphere(), toon(PAL.hairPink), { p: [0, -0.12, -0.26], s: [0.09, 0.14, 0.09] }));
  h.head.add(part(G.hemi(), toon(team.dark), { p: [0, 0.03, -0.01], s: [0.27, 0.27, 0.27] }));
  const bow = group(
    part(G.halfTorus(), toon(PAL.wood), { s: 0.22, r: [0, Math.PI / 2, Math.PI / 2] }),
    part(G.cyl(), toon(PAL.white), { s: [0.006, 0.44, 0.006] }),
  );
  bow.position.set(0, -0.02, 0.04);
  h.handL.add(bow);
  h.body.add(part(G.cyl(), toon(PAL.woodDark), { p: [-0.06, 0.48, -0.16], s: [0.06, 0.28, 0.06], r: [0.35, 0, 0] }));
  return rigFrom(h, scale, { attack: 'shoot', aimPose: -1.45 });
}

function giant(side: Side): Rig {
  const team = TEAM[side];
  const h = humanoid({ shirt: 0xd8a45f, pants: PAL.brownCloth, headR: 0.22, torsoW: 0.46, torsoH: 0.42, armT: 0.15, handR: 0.11 });
  h.head.add(part(G.cone(), toon(PAL.hairOrange), { p: [0, 0.22, -0.02], s: [0.08, 0.12, 0.08] }));
  h.head.add(part(G.sphere(), toon(PAL.hairOrange), { p: [0, -0.14, 0.14], s: [0.14, 0.08, 0.09] }));
  h.body.add(part(G.box(), toon(team.main), { p: [0, 0.48, 0.02], s: [0.1, 0.52, 0.42], r: [0, 0, 0.7] }));
  for (const arm of [h.handR, h.handL]) arm.add(part(G.cyl(), toon(team.main), { p: [0, 0.07, 0], s: [0.1, 0.06, 0.1] }));
  return rigFrom(h, 2.1);
}

function goblin(side: Side): Rig {
  const team = TEAM[side];
  const h = humanoid({ skin: PAL.goblin, shirt: team.dark, pants: PAL.brownCloth, headR: 0.23 });
  for (const sx of [-1, 1]) {
    h.head.add(part(G.cone(), toon(PAL.goblin), { p: [sx * 0.25, 0.03, -0.02], s: [0.06, 0.22, 0.05], r: [0, 0, -sx * 1.25] }));
  }
  h.head.add(part(G.cone(), toon(PAL.goblin), { p: [0, -0.03, 0.27], s: [0.045, 0.14, 0.045], r: [Math.PI / 2, 0, 0] }));
  h.head.add(part(G.hemi(), toon(team.main), { p: [0, 0.06, -0.02], s: [0.24, 0.22, 0.24] }));
  hold(h.handR, sword(0.2, 0.035));
  return rigFrom(h, 1.05);
}

function skeleton(side: Side, scale = 0.85): { rig: Rig; h: Humanoid } {
  const h = humanoid({ shirt: PAL.bone, pants: PAL.bone, boots: PAL.bone, bones: true, headR: 0.22 });
  h.head.add(part(G.box(), toon(PAL.bone), { p: [0, -0.16, 0.08], s: [0.18, 0.06, 0.14] }));
  h.body.add(part(G.torus(), toon(TEAM[side].main), { p: [0, 0.6, 0], s: [0.1, 0.1, 0.14], r: [Math.PI / 2, 0, 0] }));
  return { rig: rigFrom(h, scale), h };
}

function skeletonWarrior(side: Side): Rig {
  const { rig, h } = skeleton(side);
  hold(h.handR, sword(0.24, 0.035));
  return rig;
}

function bomber(side: Side): Rig {
  const { rig, h } = skeleton(side, 1.0);
  const bomb = group(
    part(G.sphere(), toon(PAL.black), { s: 0.15 }),
    part(G.cyl(), toon(PAL.wood), { p: [0, 0.17, 0], s: [0.015, 0.06, 0.015] }),
    part(G.sphere(), toon(0xffb020, 0xff7a00), { p: [0, 0.21, 0], s: 0.035 }),
  );
  bomb.position.set(0, 1.12, 0.04);
  h.body.add(bomb);
  return { ...rig, attack: 'throw', aimPose: -2.9 };
}

function musketeer(side: Side): Rig {
  const team = TEAM[side];
  const h = humanoid({ shirt: team.main, pants: PAL.black, boots: PAL.black });
  h.head.add(part(G.sphere(), toon(PAL.hairBlack), { p: [0, -0.06, -0.08], s: [0.26, 0.26, 0.22] }));
  h.head.add(part(G.cyl(), toon(team.dark), { p: [0, 0.13, 0], s: [0.36, 0.025, 0.36] }));
  h.head.add(part(G.hemi(), toon(team.dark), { p: [0, 0.13, 0], s: [0.19, 0.17, 0.19] }));
  h.head.add(part(G.cone(), toon(PAL.white), { p: [0.14, 0.3, -0.06], s: [0.035, 0.25, 0.035], r: [0, 0, -0.5] }));
  const gun = group(
    part(G.cyl(), toon(PAL.steelDark), { p: [0, 0.3, 0], s: [0.022, 0.6, 0.022] }),
    part(G.box(), toon(PAL.wood), { p: [0, -0.02, 0], s: [0.05, 0.2, 0.07] }),
  );
  hold(h.handR, gun, Math.PI / 2);
  return rigFrom(h, 1.35, { attack: 'shoot', aimPose: -1.45 });
}

function valkyrie(side: Side): Rig {
  const team = TEAM[side];
  const h = humanoid({ shirt: team.main, pants: PAL.brownCloth, torsoW: 0.38 });
  h.head.add(part(G.hemi(), toon(PAL.hairOrange), { p: [0, 0.03, -0.01], s: 0.262 }));
  for (const sx of [-1, 1]) h.head.add(part(G.capsule(), toon(PAL.hairOrange), { p: [sx * 0.22, -0.16, -0.06], s: [0.08, 0.13, 0.08] }));
  h.body.add(part(G.hemi(), toon(PAL.steel), { p: [-0.22, 0.56, 0], s: 0.09 }));
  h.body.add(part(G.hemi(), toon(PAL.steel), { p: [0.22, 0.56, 0], s: 0.09 }));
  const axe = group(
    part(G.cyl(), toon(PAL.wood), { p: [0, 0.2, 0], s: [0.025, 0.55, 0.025] }),
    ...[-1, 1].map((sx) => part(G.cyl(), toon(PAL.steel), { p: [sx * 0.13, 0.42, 0], s: [0.17, 0.035, 0.17], r: [0, 0, Math.PI / 2] })),
  );
  hold(h.handR, axe, 1.3);
  return rigFrom(h, 1.5, { attack: 'spin' });
}

function miniPekka(side: Side): Rig {
  const team = TEAM[side];
  const armor = 0x3a4a6e;
  const h = humanoid({ skin: armor, shirt: armor, pants: 0x2b3652, boots: 0x1f2740, headR: 0.24, torsoW: 0.4, armT: 0.13, handR: 0.08, eyes: team.light });
  h.head.add(part(G.box(), toon(0x2b3652), { p: [0, -0.02, 0.2], s: [0.3, 0.1, 0.1] }));
  for (const sx of [-1, 1]) {
    h.head.add(part(G.cone(), toon(PAL.steel), { p: [sx * 0.2, 0.2, 0], s: [0.05, 0.2, 0.05], r: [0, 0, -sx * 0.7] }));
    h.body.add(part(G.hemi(), toon(team.main), { p: [sx * 0.24, 0.55, 0], s: 0.1 }));
  }
  hold(h.handR, sword(0.55, 0.08));
  return rigFrom(h, 1.5);
}

function hogRider(side: Side): Rig {
  const team = TEAM[side];
  const hog = toon(PAL.hog);
  const legs = [
    [-1, 1],
    [1, -1],
    [1, 1],
    [-1, -1],
  ].map(([sx, sz]) => pivot([sx * 0.15, 0.3, sz * 0.24], part(G.cyl(), toon(0x8a5a3c), { p: [0, -0.14, 0], s: [0.06, 0.28, 0.06] })));
  const body = group(
    ...legs,
    part(G.sphere(), hog, { p: [0, 0.42, 0], s: [0.28, 0.25, 0.42] }),
    part(G.sphere(), hog, { p: [0, 0.5, 0.4], s: 0.21 }),
    part(G.cyl(), toon(PAL.hogSnout), { p: [0, 0.46, 0.6], s: [0.09, 0.06, 0.09], r: [Math.PI / 2, 0, 0] }),
    part(G.torus(), toon(0x8a5a3c), { p: [0, 0.5, -0.43], s: 0.05 }),
  );
  for (const sx of [-1, 1]) {
    body.add(part(G.cone(), toon(PAL.white), { p: [sx * 0.08, 0.4, 0.6], s: [0.025, 0.09, 0.025], r: [-0.4, 0, 0] }));
    body.add(part(G.cone(), hog, { p: [sx * 0.14, 0.7, 0.36], s: [0.05, 0.1, 0.04], r: [0, 0, -sx * 0.4] }));
    body.add(part(G.sphere(), toon(PAL.black), { p: [sx * 0.09, 0.56, 0.58], s: 0.03 }));
  }
  const rider = humanoid({ shirt: team.main, pants: PAL.brownCloth });
  rider.head.add(part(G.box(), toon(PAL.hairBlack), { p: [0, 0.22, 0], s: [0.05, 0.14, 0.34] }));
  for (const [i, leg] of rider.legs.entries()) {
    leg.rotation.set(-1.2, 0, (i ? -1 : 1) * 0.5);
  }
  const hammer = group(
    part(G.cyl(), toon(PAL.wood), { p: [0, 0.2, 0], s: [0.025, 0.45, 0.025] }),
    part(G.box(), toon(PAL.steelDark), { p: [0, 0.42, 0], s: [0.18, 0.1, 0.1] }),
  );
  hold(rider.handR, hammer);
  rider.body.scale.setScalar(0.85);
  rider.body.position.set(0, 0.42, -0.08);
  body.add(rider.body);
  const scale = 1.35;
  body.scale.setScalar(scale);
  return {
    root: group(body),
    body,
    legs,
    armR: rider.armR,
    armL: rider.armL,
    wings: [],
    attack: 'swing',
    height: (0.42 + rider.top * 0.85) * scale,
    flying: false,
  };
}

function wingPair(color: number, size: number, y: number, z: number): THREE.Group[] {
  const mat = new THREE.MeshToonMaterial({ color, side: THREE.DoubleSide });
  return [-1, 1].map((sx) => {
    const w = part(G.wing(), mat, { s: [sx * size, size, size] });
    const p = pivot([sx * 0.08, y, z], w);
    return p;
  });
}

function babyDragon(side: Side): Rig {
  const team = TEAM[side];
  const skin = toon(PAL.dragon);
  const body = group(
    part(G.sphere(), skin, { p: [0, 0.35, 0], s: [0.3, 0.28, 0.34] }),
    part(G.sphere(), toon(PAL.dragonBelly), { p: [0, 0.3, 0.16], s: [0.22, 0.2, 0.2] }),
    part(G.sphere(), skin, { p: [0, 0.64, 0.26], s: 0.24 }),
    part(G.sphere(), skin, { p: [0, 0.58, 0.48], s: [0.15, 0.1, 0.14] }),
    part(G.cone(), skin, { p: [0, 0.3, -0.42], s: [0.1, 0.35, 0.1], r: [-2.0, 0, 0] }),
    part(G.torus(), toon(team.main), { p: [0, 0.5, 0.18], s: [0.15, 0.15, 0.2], r: [1.2, 0, 0] }),
  );
  for (const sx of [-1, 1]) {
    body.add(part(G.sphere(), toon(PAL.white), { p: [sx * 0.1, 0.7, 0.45], s: 0.065 }));
    body.add(part(G.sphere(), toon(PAL.black), { p: [sx * 0.1, 0.7, 0.5], s: 0.035 }));
    body.add(part(G.cone(), toon(PAL.dragonBelly), { p: [sx * 0.1, 0.9, 0.2], s: [0.04, 0.12, 0.04], r: [-0.4, 0, 0] }));
    body.add(part(G.sphere(), skin, { p: [sx * 0.14, 0.1, 0.08], s: [0.08, 0.08, 0.1] }));
  }
  const wings = wingPair(0x3e9a3a, 0.55, 0.5, -0.05);
  body.add(...wings);
  const scale = 1.6;
  body.scale.setScalar(scale);
  return { root: group(body), body, legs: [], wings, attack: 'shoot', height: 0.95 * scale, flying: true };
}

function minion(side: Side): Rig {
  const team = TEAM[side];
  const h = humanoid({ skin: PAL.minion, shirt: PAL.minion, pants: PAL.minion, boots: 0x3b7fd9, headR: 0.24, torsoH: 0.26 });
  for (const sx of [-1, 1]) {
    h.head.add(part(G.cone(), toon(PAL.bone), { p: [sx * 0.12, 0.22, 0], s: [0.04, 0.12, 0.04], r: [0, 0, -sx * 0.4] }));
    h.head.add(part(G.cone(), toon(PAL.minion), { p: [sx * 0.24, 0.05, 0], s: [0.05, 0.14, 0.04], r: [0, 0, -sx * 1.3] }));
  }
  h.body.add(part(G.torus(), toon(team.main), { p: [0, 0.3, 0], s: [0.16, 0.16, 0.2], r: [Math.PI / 2, 0, 0] }));
  const wings = wingPair(team.dark, 0.5, 0.5, -0.12);
  h.body.add(...wings);
  return rigFrom(h, 1.1, { flying: true, wings, legs: h.legs });
}

// --- Buildings & towers ------------------------------------------------------

function cannon(side: Side): Rig {
  const team = TEAM[side];
  const barrel = group(
    part(G.cyl(), toon(PAL.black), { p: [0, 0, 0.25], s: [0.15, 0.75, 0.15], r: [Math.PI / 2, 0, 0] }),
    part(G.torus(), toon(PAL.steelDark), { p: [0, 0, 0.62], s: [0.15, 0.15, 0.2] }),
    part(G.cyl(), toon(team.main), { p: [0, 0, 0.05], s: [0.165, 0.12, 0.165], r: [Math.PI / 2, 0, 0] }),
  );
  barrel.position.y = 0.5;
  const body = group(
    part(G.box(), toon(PAL.woodDark), { p: [0, 0.18, 0], s: [0.8, 0.3, 0.8] }),
    part(G.box(), toon(PAL.wood), { p: [0, 0.38, 0], s: [0.5, 0.18, 0.5] }),
    ...[-1, 1].map((sx) => part(G.cyl(), toon(PAL.black), { p: [sx * 0.45, 0.2, 0], s: [0.2, 0.07, 0.2], r: [0, 0, Math.PI / 2] })),
    barrel,
  );
  body.scale.setScalar(1.3);
  return { root: group(body), body, legs: [], wings: [], turret: barrel, attack: 'none', height: 1.0, flying: false };
}

function crenellations(radius: number, y: number, count: number, size: number): THREE.Mesh[] {
  const stone = toon(PAL.stone);
  return Array.from({ length: count }, (_, i) => {
    const a = (i / count) * Math.PI * 2;
    return part(G.box(), stone, { p: [Math.cos(a) * radius, y, Math.sin(a) * radius], s: [size, size, size], r: [0, -a, 0] });
  });
}

function princessTower(side: Side): Rig {
  const team = TEAM[side];
  const stone = toon(PAL.stone);
  const body = group(
    part(G.cyl(), toon(PAL.stoneDark), { p: [0, 0.15, 0], s: [1.45, 0.3, 1.45] }),
    part(G.cyl(), stone, { p: [0, 1.1, 0], s: [1.2, 1.9, 1.2] }),
    part(G.torus(), toon(PAL.stoneDark), { p: [0, 0.8, 0], s: [1.2, 1.2, 0.6], r: [Math.PI / 2, 0, 0] }),
    part(G.cyl(), toon(PAL.woodDark), { p: [0, 2.1, 0], s: [1.35, 0.16, 1.35] }),
    ...crenellations(1.18, 2.35, 10, 0.34),
    part(G.box(), toon(team.main), { p: [0, 1.2, 1.2], s: [0.7, 1.1, 0.05] }),
    part(G.sphere(), toon(PAL.gold), { p: [0, 1.35, 1.24], s: [0.13, 0.13, 0.04] }),
    part(G.cyl(), toon(PAL.woodDark), { p: [0.85, 3.0, -0.7], s: [0.04, 1.6, 0.04] }),
    part(G.box(), toon(team.main), { p: [1.12, 3.5, -0.7], s: [0.5, 0.32, 0.03] }),
  );
  const figure = archer(side, 1.35);
  figure.root.position.y = 2.18;
  body.add(figure.root);
  return {
    root: group(body),
    body,
    legs: [],
    wings: [],
    armR: figure.armR,
    armL: figure.armL,
    turret: figure.root,
    attack: 'shoot',
    aimPose: -1.45,
    height: 3.9,
    flying: false,
  };
}

function kingTower(side: Side): Rig {
  const team = TEAM[side];
  const stone = toon(PAL.stone);
  const body = group(
    part(G.box(), toon(PAL.stoneDark), { p: [0, 0.15, 0], s: [3.7, 0.3, 3.7] }),
    part(G.box(), stone, { p: [0, 1.25, 0], s: [3.1, 2.2, 3.1] }),
    part(G.box(), toon(PAL.stoneDark), { p: [0, 2.37, 0], s: [3.0, 0.08, 3.0] }),
    ...[-1, 1].flatMap((sx) => [
      part(G.box(), toon(PAL.gold), { p: [sx * 1.57, 2.1, 0], s: [0.06, 0.14, 3.2] }),
      part(G.box(), toon(PAL.gold), { p: [0, 2.1, sx * 1.57], s: [3.2, 0.14, 0.06] }),
    ]),
    ...[-1.0, -0.33, 0.33, 1.0].flatMap((t) =>
      [-1, 1].flatMap((sx) => [
        part(G.box(), stone, { p: [t * 1.1, 2.55, sx * 1.4], s: [0.34, 0.34, 0.3] }),
        part(G.box(), stone, { p: [sx * 1.4, 2.55, t * 1.1], s: [0.3, 0.34, 0.34] }),
      ]),
    ),
    part(G.box(), toon(team.main), { p: [0, 1.25, 1.57], s: [1.1, 1.6, 0.05] }),
    part(G.box(), toon(PAL.gold), { p: [0, 1.55, 1.6], s: [0.35, 0.35, 0.04], r: [0, 0, Math.PI / 4] }),
  );
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    body.add(part(G.cyl(), stone, { p: [sx * 1.45, 1.6, sz * 1.45], s: [0.42, 3.0, 0.42] }));
    body.add(part(G.cone(), toon(team.main), { p: [sx * 1.45, 3.45, sz * 1.45], s: [0.55, 0.75, 0.55] }));
  }
  const king = humanoid({ shirt: team.main, pants: team.dark, headR: 0.26, torsoW: 0.42 });
  king.head.add(part(G.sphere(), toon(PAL.white), { p: [0, -0.18, 0.12], s: [0.2, 0.15, 0.14] }));
  king.head.add(part(G.cyl(), toon(PAL.gold), { p: [0, 0.22, 0], s: [0.17, 0.1, 0.17] }));
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    king.head.add(part(G.cone(), toon(PAL.gold), { p: [Math.cos(a) * 0.15, 0.32, Math.sin(a) * 0.15], s: [0.04, 0.1, 0.04] }));
  }
  king.body.add(part(G.box(), toon(team.dark), { p: [0, 0.4, -0.16], s: [0.44, 0.5, 0.04] }));
  hold(king.handR, part(G.cyl(), toon(PAL.gold), { p: [0, 0.2, 0], s: [0.025, 0.5, 0.025] }), 0.4);
  king.body.scale.setScalar(1.7);
  const figure = group(king.body);
  figure.position.y = 2.4;
  body.add(figure);
  return {
    root: group(body),
    body,
    legs: [],
    wings: [],
    armR: king.armR,
    armL: king.armL,
    turret: figure,
    attack: 'shoot',
    aimPose: -1.2,
    height: 4.6,
    flying: false,
  };
}

// --- Spell props (card art) -------------------------------------------------

export function fireballProp(): THREE.Group {
  return group(
    part(G.sphere(), toon(0xff8a1f, 0xff5a00), { s: 0.45 }),
    part(G.sphere(), toon(0xffe066, 0xffc400), { p: [0.05, 0.08, 0.3], s: 0.22 }),
    ...[0, 1, 2, 3, 4].map((i) =>
      part(G.cone(), toon(0xff5a1f, 0xff3000), { p: [Math.sin(i * 1.3) * 0.25, -0.05, -0.45 - i * 0.05], s: [0.16, 0.5, 0.16], r: [-Math.PI / 2 + Math.sin(i) * 0.3, 0, 0] }),
    ),
  );
}

export function arrowProp(): THREE.Group {
  return group(
    part(G.cyl(), toon(PAL.wood), { s: [0.025, 0.9, 0.025] }),
    part(G.cone(), toon(PAL.steel), { p: [0, 0.5, 0], s: [0.06, 0.14, 0.06] }),
    ...[0, 1, 2].map((i) => part(G.box(), toon(PAL.white), { p: [0, -0.4, 0], s: [0.12, 0.14, 0.01], r: [0, (i * Math.PI) / 3, 0] })),
  );
}

const BUILDERS: Record<string, (side: Side) => Rig> = {
  knight,
  archers: (side) => archer(side),
  giant,
  goblins: goblin,
  babydragon: babyDragon,
  skeletons: skeletonWarrior,
  cannon,
  musketeer,
  minipekka: miniPekka,
  hogrider: hogRider,
  valkyrie,
  minions: minion,
  bomber,
  princess: princessTower,
  king: kingTower,
};

export function hasModel(type: string): boolean {
  return type in BUILDERS;
}

export function buildModel(type: string, side: Side): Rig {
  const build = BUILDERS[type];
  if (!build) throw new Error(`No model for ${type}`);
  return build(side);
}
