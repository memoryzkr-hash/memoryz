import * as THREE from 'three';
import { CARDS } from '../core/cards';
import type { CardDef } from '../core/types';
import { group } from './kit';
import { arrowProp, buildModel, fireballProp } from './models';

export const ART_SIZE = 200;

const BACKGROUNDS: Record<CardDef['type'], [string, string]> = {
  troop: ['#7c5cff', '#2d1b69'],
  spell: ['#ffb347', '#8a2d0b'],
  building: ['#9aa3ad', '#343a46'],
};

/** Up to three copies for swarm cards, arranged in a little crowd. */
function subject(card: CardDef): { obj: THREE.Object3D; height: number } {
  if (card.id === 'fireball') {
    const f = fireballProp();
    f.rotation.set(0.4, 0.6, 0);
    return { obj: f, height: 1.1 };
  }
  if (card.id === 'arrows') {
    const g = group();
    [-0.35, 0, 0.35].forEach((x, i) => {
      const a = arrowProp();
      a.position.set(x, 0.1 * i, 0);
      a.rotation.set(0, 0, -0.5 + i * 0.5);
      g.add(a);
    });
    g.position.y = 0.4;
    return { obj: g, height: 1.1 };
  }
  const count = Math.min(card.count ?? 1, 3);
  const g = group();
  let height = 0;
  const spots = count === 1 ? [[0, 0]] : count === 2 ? [[-0.35, 0], [0.35, -0.2]] : [[0, 0.1], [-0.5, -0.3], [0.5, -0.3]];
  for (const [x, z] of spots) {
    const rig = buildModel(card.id, 0);
    rig.root.position.set(x * rig.height, 0, z * rig.height);
    if (rig.armR && rig.aimPose) rig.armR.rotation.x = rig.attack === 'throw' ? rig.aimPose : 0;
    if (rig.armL && rig.aimPose && rig.attack === 'throw') rig.armL.rotation.x = rig.aimPose;
    g.add(rig.root);
    height = Math.max(height, rig.height);
  }
  return { obj: g, height };
}

/** Renders a portrait of every card's model. Returns canvases keyed by card id. */
export function renderCardArt(): Map<string, HTMLCanvasElement> {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(ART_SIZE * 2, ART_SIZE * 2, false);
  renderer.setClearColor(0x000000, 0);
  const out = new Map<string, HTMLCanvasElement>();

  for (const card of CARDS) {
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffffff, 0x886688, 1.8));
    const sun = new THREE.DirectionalLight(0xffffff, 2.2);
    sun.position.set(2, 4, 5);
    scene.add(sun);
    const { obj, height } = subject(card);
    obj.rotation.y += -0.45;
    scene.add(obj);

    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
    const d = height * 2.3 + 0.5;
    camera.position.set(0, height * 0.8, d);
    camera.lookAt(0, height * 0.45, 0);
    renderer.render(scene, camera);

    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = ART_SIZE;
    const g = canvas.getContext('2d')!;
    const [c0, c1] = BACKGROUNDS[card.type];
    const grad = g.createRadialGradient(ART_SIZE / 2, ART_SIZE * 0.4, 10, ART_SIZE / 2, ART_SIZE / 2, ART_SIZE * 0.75);
    grad.addColorStop(0, c0);
    grad.addColorStop(1, c1);
    g.fillStyle = grad;
    g.fillRect(0, 0, ART_SIZE, ART_SIZE);
    g.drawImage(renderer.domElement, 0, 0, ART_SIZE, ART_SIZE);
    out.set(card.id, canvas);
  }
  renderer.dispose();
  renderer.forceContextLoss();
  return out;
}
