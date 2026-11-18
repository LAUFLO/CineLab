import * as THREE from 'three';
import { inferPrevisPropKind, type PrevisPlan, type PrevisProp } from '@shared/previs/plan-core';

/** Floor (x, y) → three.js (x, height, -y). */
const WALL_H = 3.2;
const ROOFTOP_RE = /roof|rooftop|terrace|天台|楼顶|屋顶/i;

const MATS = {
  wall: () => new THREE.MeshStandardMaterial({ color: '#d8d4cc', roughness: 1 }),
  prop: (color?: string) => new THREE.MeshStandardMaterial({ color: new THREE.Color(color ?? '#8c8c8c'), roughness: 0.8 }),
  dark: () => new THREE.MeshStandardMaterial({ color: '#2b2b2b', roughness: 1 }),
  metal: () => new THREE.MeshStandardMaterial({ color: '#6f6f6f', roughness: 0.5 }),
  glass: () => new THREE.MeshStandardMaterial({ color: '#a9c4d6', roughness: 0.2 }),
  leaf: () => new THREE.MeshStandardMaterial({ color: '#8fa88a', roughness: 0.9 }),
};

function addBox(
  group: THREE.Group,
  size: { w: number; h: number; d: number },
  at: { x: number; y: number; h: number },
  mat: THREE.Material,
): void {
  const m = new THREE.Mesh(new THREE.BoxGeometry(size.w, size.h, size.d), mat);
  m.position.set(at.x, at.h, -at.y);
  m.castShadow = true;
  m.receiveShadow = true;
  group.add(m);
}

/** Front of a prop snapped to an axis: unit floor vector the front faces. */
function frontDir(p: PrevisProp): { x: number; y: number } {
  const deg = (((p.facing ?? 180) % 360) + 360) % 360;
  const q = Math.round(deg / 90) % 4;
  return [
    { x: 0, y: 1 },
    { x: 1, y: 0 },
    { x: 0, y: -1 },
    { x: -1, y: 0 },
  ][q];
}

/** Half extent of the prop along a floor axis direction. */
function halfAlong(p: PrevisProp, dir: { x: number; y: number }): number {
  return dir.x !== 0 ? p.w / 2 : p.d / 2;
}

/** One prop as a recognisable low-poly piece (a chair has a seat and a back), stage coordinates. */
export function buildPrevisPropShape(p: PrevisProp): THREE.Group {
  return buildProp(p);
}

function buildProp(p: PrevisProp): THREE.Group {
  const g = new THREE.Group();
  const kind = p.kind ?? inferPrevisPropKind(p.label);
  const base = MATS.prop(p.color);
  const f = frontDir(p);
  const across = { x: Math.abs(f.y), y: Math.abs(f.x) };
  const widthAcross = across.x ? p.w : p.d;
  const at = (along: number, side: number, h: number) => ({
    x: p.x + f.x * along + across.x * side,
    y: p.y + f.y * along + across.y * side,
    h,
  });
  const sized = (alongLen: number, acrossLen: number, h: number) =>
    f.x !== 0 ? { w: alongLen, d: acrossLen, h } : { w: acrossLen, d: alongLen, h };

  switch (kind) {
    case 'door': {
      addBox(g, { w: p.w, h: p.h, d: p.d }, { x: p.x, y: p.y, h: p.h / 2 }, MATS.wall());
      const ph = Math.min(p.h - 0.1, 2.1);
      addBox(g, sized(halfAlong(p, f) * 2 + 0.04, widthAcross * 0.75, ph), { x: p.x, y: p.y, h: ph / 2 }, MATS.dark());
      break;
    }
    case 'stairwell': {
      addBox(g, { w: p.w, h: p.h, d: p.d }, { x: p.x, y: p.y, h: p.h / 2 }, base);
      addBox(g, { w: p.w + 0.2, h: 0.12, d: p.d + 0.2 }, { x: p.x, y: p.y, h: p.h + 0.06 }, MATS.wall());
      const door = Math.min(1.1, widthAcross * 0.5);
      addBox(g, sized(0.06, door, 2.1), at(halfAlong(p, f) + 0.02, 0, 1.05), MATS.dark());
      break;
    }
    case 'stairs': {
      const n = 8;
      const depth = halfAlong(p, f) * 2;
      for (let i = 0; i < n; i++) {
        const hStep = (p.h * (i + 1)) / n;
        addBox(g, sized(depth / n, widthAcross, hStep), at(depth / 2 - (i + 0.5) * (depth / n), 0, hStep / 2), base);
      }
      break;
    }
    case 'railing': {
      const longX = p.w >= p.d;
      const len = longX ? p.w : p.d;
      const h = p.h || 1.1;
      const posts = Math.max(2, Math.round(len / 1.4) + 1);
      for (let i = 0; i < posts; i++) {
        const o = -len / 2 + (len * i) / (posts - 1);
        addBox(g, { w: 0.06, h, d: 0.06 }, { x: p.x + (longX ? o : 0), y: p.y + (longX ? 0 : o), h: h / 2 }, MATS.metal());
      }
      for (const rh of [h, h * 0.55]) {
        addBox(g, longX ? { w: len, h: 0.05, d: 0.05 } : { w: 0.05, h: 0.05, d: len }, { x: p.x, y: p.y, h: rh }, MATS.metal());
      }
      break;
    }
    case 'table':
    case 'desk': {
      const top = Math.max(0.6, p.h);
      addBox(g, { w: p.w, h: 0.06, d: p.d }, { x: p.x, y: p.y, h: top - 0.03 }, base);
      for (const sx of [-1, 1]) {
        for (const sy of [-1, 1]) {
          addBox(g, { w: 0.07, h: top - 0.06, d: 0.07 }, { x: p.x + sx * (p.w / 2 - 0.08), y: p.y + sy * (p.d / 2 - 0.08), h: (top - 0.06) / 2 }, base);
        }
      }
      break;
    }
    case 'chair':
    case 'sofa':
    case 'bed': {
      const seatH = kind === 'bed' ? Math.min(0.55, p.h) : Math.min(0.45, p.h * 0.5);
      const depth = halfAlong(p, f) * 2;
      addBox(g, { w: p.w, h: seatH, d: p.d }, { x: p.x, y: p.y, h: seatH / 2 }, base);
      const backH = Math.max(seatH + 0.3, p.h);
      addBox(g, sized(Math.min(0.2, depth * 0.25), widthAcross, backH), at(-depth / 2 + Math.min(0.1, depth * 0.125), 0, backH / 2), base);
      break;
    }
    case 'pillar': {
      const h = Math.max(p.h, 3);
      const m = new THREE.Mesh(new THREE.CylinderGeometry(Math.min(p.w, p.d) / 2, Math.min(p.w, p.d) / 2, h, 24), MATS.wall());
      m.position.set(p.x, h / 2, -p.y);
      m.castShadow = true;
      g.add(m);
      break;
    }
    case 'window': {
      addBox(g, { w: p.w, h: Math.max(1, p.h), d: p.d }, { x: p.x, y: p.y, h: 1.0 + Math.max(1, p.h) / 2 }, MATS.glass());
      break;
    }
    case 'car': {
      const bodyH = Math.min(0.8, p.h * 0.55);
      addBox(g, { w: p.w, h: bodyH, d: p.d }, { x: p.x, y: p.y, h: 0.15 + bodyH / 2 }, base);
      const cabin = p.w >= p.d ? { w: p.w * 0.55, h: p.h - bodyH - 0.15, d: p.d * 0.9 } : { w: p.w * 0.9, h: p.h - bodyH - 0.15, d: p.d * 0.55 };
      addBox(g, cabin, { x: p.x, y: p.y, h: 0.15 + bodyH + cabin.h / 2 }, MATS.glass());
      break;
    }
    case 'tree': {
      const h = Math.max(p.h, 3);
      const r = Math.max(0.8, Math.min(p.w, p.d) / 2);
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, h * 0.5, 12), MATS.prop('#7a6a58'));
      trunk.position.set(p.x, h * 0.25, -p.y);
      const crown = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), MATS.leaf());
      crown.position.set(p.x, h * 0.5 + r * 0.8, -p.y);
      for (const m of [trunk, crown]) {
        m.castShadow = true;
        g.add(m);
      }
      break;
    }
    case 'low_wall':
      addBox(g, { w: p.w, h: p.h, d: p.d }, { x: p.x, y: p.y, h: p.h / 2 }, MATS.wall());
      break;
    case 'shelf':
      addBox(g, { w: p.w, h: p.h, d: p.d }, { x: p.x, y: p.y, h: p.h / 2 }, MATS.prop(p.color ?? '#6f655b'));
      break;
    default:
      addBox(g, { w: p.w, h: p.h, d: p.d }, { x: p.x, y: p.y, h: p.h / 2 }, base);
  }
  return g;
}

/**
 * Walls (indoor) or low edges + distant blocks (outdoor), and every prop as a recognizable low-poly piece.
 * Plans without `set` are indoor (how they were drawn before set layouts).
 */
export function buildPrevisSet(scene: THREE.Scene, plan: PrevisPlan): void {
  const { width, depth } = plan.stage;
  const outdoor = plan.set?.kind === 'outdoor';
  const edgeH = outdoor ? 0.5 : WALL_H;
  const edges: Array<[number, number, number, number]> = [
    [0, -depth / 2, width, 0.1],
    [0, depth / 2, width, 0.1],
    [-width / 2, 0, 0.1, depth],
    [width / 2, 0, 0.1, depth],
  ];
  const set = new THREE.Group();
  for (const [x, y, w, d] of edges) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, edgeH, d), MATS.wall());
    m.position.set(x, edgeH / 2, -y);
    m.receiveShadow = true;
    set.add(m);
  }
  if (outdoor) {
    // Distant blocks read as buildings / skyline; on a rooftop they start below the roof.
    const groundH = ROOFTOP_RE.test(plan.set?.description ?? '') ? -14 : 0;
    const r = Math.max(width, depth) / 2 + 45;
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const h = 6 + ((i * 53) % 19);
      const dist = r + ((i * 29) % 15);
      addBox(set, { w: 7, h: h - groundH, d: 7 }, { x: Math.sin(a) * dist, y: Math.cos(a) * dist, h: groundH + (h - groundH) / 2 }, MATS.wall());
    }
  }
  for (const p of plan.props) set.add(buildProp(p));
  scene.add(set);
}

/**
 * Camera for the 45° scene overview: on the side the main doorway faces (so its opening is visible),
 * turned 35° for depth; the entrance side when there is no doorway.
 */
export function previsOverviewCamera(plan: PrevisPlan): { position: THREE.Vector3; target: THREE.Vector3 } {
  const doorway = plan.props.find((p) => ['stairwell', 'door', 'stairs'].includes(p.kind ?? inferPrevisPropKind(p.label)));
  const f = doorway ? frontDir(doorway) : { x: 0, y: -1 };
  const turn = (35 * Math.PI) / 180;
  const dx = f.x * Math.cos(turn) + f.y * Math.sin(turn);
  const dy = -f.x * Math.sin(turn) + f.y * Math.cos(turn);
  const span = Math.max(plan.stage.width, plan.stage.depth);
  const dist = span * 0.95;
  return {
    position: new THREE.Vector3(dx * dist, span * 0.7, -dy * dist),
    target: new THREE.Vector3(0, 0, 0),
  };
}
