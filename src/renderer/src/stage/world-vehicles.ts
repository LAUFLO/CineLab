/**
 * Whitebox vehicles for the 3D Director viewport / recorder: simple blocks per kind, front toward -z (stage +y at
 * heading 0, like the figures). Helicopter rotors are named `rotor` so the scene can spin them.
 */
import * as THREE from 'three';
import { type PrevisVehicle, type PrevisVehicleKind } from '@shared/previs/plan-core';
import { previsVehicleHeadingTrack } from '@shared/previs/vehicles';
import { PREVIS_VEHICLE_SIZE } from '@shared/previs/vehicles';

const glass = () => new THREE.MeshStandardMaterial({ color: 0x2c333b, roughness: 0.25 });
const dark = () => new THREE.MeshStandardMaterial({ color: 0x24272b, roughness: 0.8 });

function add(g: THREE.Group, geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, name?: string): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  if (name) m.name = name;
  g.add(m);
  return m;
}

function wheels(g: THREE.Group, halfW: number, halfL: number, r: number): void {
  const geo = new THREE.CylinderGeometry(r, r, 0.26, 16);
  geo.rotateZ(Math.PI / 2);
  const mat = dark();
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(g, geo, mat, sx * halfW, r, sz * halfL);
}

/** Vehicle model (metres, origin on the ground under its centre). */
export function buildWorld3dVehicle(kind: PrevisVehicleKind, hex: THREE.ColorRepresentation): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.MeshStandardMaterial({ color: hex, roughness: 0.55, metalness: 0.15 });
  const { l, w, h } = PREVIS_VEHICLE_SIZE[kind];
  if (kind === 'car') {
    add(g, new THREE.BoxGeometry(w, 0.75, l), body, 0, 0.3 + 0.375, 0);
    add(g, new THREE.BoxGeometry(w - 0.2, 0.6, l * 0.5), glass(), 0, 1.35, 0.15);
    wheels(g, w / 2 - 0.05, l / 2 - 0.9, 0.34);
  } else if (kind === 'van') {
    add(g, new THREE.BoxGeometry(w, h - 0.35, l), body, 0, 0.35 + (h - 0.35) / 2, 0);
    add(g, new THREE.BoxGeometry(w + 0.02, 0.55, 1.2), glass(), 0, h - 0.6, -l / 2 + 0.7);
    wheels(g, w / 2 - 0.05, l / 2 - 1, 0.36);
  } else if (kind === 'bus') {
    add(g, new THREE.BoxGeometry(w, h - 0.35, l), body, 0, 0.35 + (h - 0.35) / 2, 0);
    add(g, new THREE.BoxGeometry(w + 0.02, 0.8, l - 0.6), glass(), 0, h - 0.95, 0);
    wheels(g, w / 2 - 0.05, l / 2 - 1.8, 0.45);
  } else if (kind === 'boat') {
    const hull = new THREE.CylinderGeometry(w / 2, w / 2.6, l, 4, 1);
    hull.rotateX(Math.PI / 2);
    hull.rotateZ(Math.PI / 4);
    hull.scale(1, 0.45, 1);
    add(g, hull, body, 0, 0.35, 0);
    add(g, new THREE.BoxGeometry(w * 0.7, 0.9, l * 0.32), glass(), 0, 1.05, l * 0.12);
  } else if (kind === 'helicopter') {
    add(g, new THREE.BoxGeometry(w * 0.7, 1.6, 3.4), body, 0, 1.25, -0.6);
    add(g, new THREE.BoxGeometry(w * 0.66, 0.9, 1.2), glass(), 0, 1.45, -2.0);
    add(g, new THREE.BoxGeometry(0.3, 0.3, 4.6), body, 0, 1.6, 3.2);
    add(g, new THREE.BoxGeometry(0.12, 1.2, 0.7), body, 0, 2.0, 5.4);
    for (const sx of [-1, 1]) add(g, new THREE.BoxGeometry(0.1, 0.1, 3.2), dark(), sx * 0.8, 0.08, -0.6);
    add(g, new THREE.CylinderGeometry(0.06, 0.06, 0.5, 8), dark(), 0, 2.3, -0.6);
    const blade = new THREE.BoxGeometry(10.5, 0.05, 0.35);
    const rotor = new THREE.Group();
    rotor.name = 'rotor';
    rotor.position.set(0, 2.58, -0.6);
    add(rotor, blade, dark(), 0, 0, 0);
    add(rotor, blade.clone().rotateY(Math.PI / 2), dark(), 0, 0, 0);
    g.add(rotor);
  } else if (kind === 'plane') {
    const fuselage = new THREE.CylinderGeometry(0.85, 0.6, l, 16);
    fuselage.rotateX(Math.PI / 2);
    add(g, fuselage, body, 0, 1.9, 0);
    add(g, new THREE.BoxGeometry(w, 0.18, 2.2), body, 0, 1.7, -0.6);
    add(g, new THREE.BoxGeometry(4, 0.14, 1.1), body, 0, 2.1, l / 2 - 0.7);
    add(g, new THREE.BoxGeometry(0.16, 2.0, 1.4), body, 0, 3.0, l / 2 - 0.8);
    add(g, new THREE.BoxGeometry(1.1, 0.5, 1.3), glass(), 0, 2.45, -l / 2 + 1.6);
    for (const z of [-l / 2 + 2, 1]) add(g, new THREE.CylinderGeometry(0.08, 0.08, 1.1, 8), dark(), 0, 0.55, z);
  } else {
    add(g, new THREE.CylinderGeometry(w * 0.36, w / 2, 1.4, 32), body, 0, 2.4, 0);
    add(g, new THREE.SphereGeometry(w * 0.19, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), glass(), 0, 3.1, 0);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      add(g, new THREE.CylinderGeometry(0.12, 0.12, 1.9, 8), dark(), Math.sin(a) * w * 0.3, 0.95, Math.cos(a) * w * 0.3);
    }
  }
  g.userData.vehicleKind = kind;
  return g;
}

/** Heading of a vehicle over time (radians, 0 = stage +y): turns as it moves, held while it stands still. */
export function world3dVehicleHeadings(v: PrevisVehicle, durationSec: number, step = 0.1): (t: number) => number {
  return previsVehicleHeadingTrack(v, durationSec, step);
}
