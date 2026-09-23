// Dev-only page (/showcase.html): every model lined up close to the camera, for tuning the art.
import * as THREE from 'three';
import { buildModel } from '../render3d/models';

const types = ['knight', 'archers', 'giant', 'goblins', 'babydragon', 'skeletons', 'musketeer', 'minipekka', 'hogrider', 'valkyrie', 'minions', 'bomber', 'cannon'];
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(1400, 800);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x7ccf55);
scene.add(new THREE.HemisphereLight(0xffffff, 0x6b8f5a, 1.6));
const sun = new THREE.DirectionalLight(0xfff4e0, 2.4);
sun.position.set(-10, 30, 14);
sun.castShadow = true;
scene.add(sun);
const params = new URLSearchParams(location.search);
const towers = params.has('towers');
const list = towers ? ['princess', 'king'] : types;
list.forEach((t, i) => {
  const rig = buildModel(t, (i % 2) as 0 | 1);
  const cols = towers ? 2 : 7;
  const gap = towers ? 7 : 2.4;
  rig.root.position.set((i % cols - (cols - 1) / 2) * gap, 0, Math.floor(i / cols) * 3 - 1.5);
  rig.root.rotation.y = 0.35;
  if (rig.flying) rig.body.position.y = 0.6;
  scene.add(rig.root);
});
const camera = new THREE.PerspectiveCamera(30, 1400 / 800, 0.1, 200);
camera.position.set(0, towers ? 9 : 7, towers ? 17 : 15);
camera.lookAt(0, towers ? 2 : 0.8, 0);
renderer.render(scene, camera);
