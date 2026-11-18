/**
 * Themed looks for whole worlds (`ref.theme`): the generated layout stays the same (footprints, streets, stage),
 * buildings are drawn as the theme's shapes inside their footprints and decor is added off the streets.
 * - mars: habitat modules on legs, geodesic domes, hubs, connecting tubes, solar arrays, antennas, rocks, rust ground.
 * - orbital: the block on a deck floating in space (rim, terraces, underside), dark metal blocks with ribs and lit
 *   strips, spires at the centre, a planet below and stars.
 * - future: sparse sculpted towers (tapered, capsule, hex, disc-on-stem, stepped), elevated loops on pillars, craft.
 * - cyberpunk: dark towers with neon billboards and light bands, glowing lane lines, stars.
 */
import * as THREE from 'three';
import type { PrevisWorld, PrevisWorldBox, PrevisWorldBuilding, PrevisWorldTheme } from '@shared/previs/world-gen';

export interface World3dThemeLook {
  sky: string;
  hemiSky: string;
  hemiGround: string;
  hemi: number;
  sun: string;
  sunI: number;
  sunLift: number;
  glow: number;
  fog: [number, number];
  ground: string;
  road: string;
  sidewalk: string;
  building: [string, string, string];
}

export const WORLD3D_THEME_LOOK: Record<PrevisWorldTheme, World3dThemeLook> = {
  mars: {
    sky: '#d8a684',
    hemiSky: '#ffe2c8',
    hemiGround: '#8a5a40',
    hemi: 1.25,
    sun: '#ffd2a6',
    sunI: 2,
    sunLift: 0.7,
    glow: 0.2,
    fog: [140, 380],
    ground: '#c48c69',
    road: '#b47b59',
    sidewalk: '#bd8664',
    building: ['#efe9e2', '#e6dfd6', '#dcd4ca'],
  },
  orbital: {
    sky: '#0d1220',
    hemiSky: '#9fb4d6',
    hemiGround: '#1c2230',
    hemi: 0.9,
    sun: '#e6eeff',
    sunI: 1.9,
    sunLift: 1,
    glow: 1,
    fog: [600, 2400],
    ground: '#4a5160',
    road: '#5d6575',
    sidewalk: '#6b7383',
    building: ['#596172', '#4f5767', '#454c5b'],
  },
  future: {
    sky: '#bcd8f0',
    hemiSky: '#ffffff',
    hemiGround: '#8d9aa6',
    hemi: 1.5,
    sun: '#fffaf0',
    sunI: 2.1,
    sunLift: 1,
    glow: 0,
    fog: [220, 620],
    ground: '#dde5ea',
    road: '#c3ccd4',
    sidewalk: '#e8eef2',
    building: ['#d6e5f1', '#e9eff4', '#c4d8e9'],
  },
  cyberpunk: {
    sky: '#1b1430',
    hemiSky: '#6a5aa8',
    hemiGround: '#120f1c',
    hemi: 0.75,
    sun: '#a9b4ff',
    sunI: 0.5,
    sunLift: 1,
    glow: 1.3,
    fog: [120, 420],
    ground: '#262233',
    road: '#1d1a29',
    sidewalk: '#2d2a3b',
    building: ['#353a50', '#2e3246', '#3d4159'],
  },
};

/** What the themes need from the world builder. */
export interface World3dThemeKit {
  theme: PrevisWorldTheme;
  seed: number;
  /** Group anchored on the ground at world (x, y) (added to the world group). */
  anchored(x: number, y: number, sink?: number): THREE.Group;
  /** Scene-level (sky) objects: hidden in ASCII / thumbnail renders. */
  scene: THREE.Scene;
  shadowed(m: THREE.Mesh): THREE.Mesh;
  grow(obj: THREE.Object3D, x: number, y: number, mode: 'rise' | 'pop'): void;
}

const hashId = (id: string) => [...id].reduce((h, ch) => (Math.imul(h, 31) + ch.charCodeAt(0)) >>> 0, 7);

function rng(seed: number) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const mat = (c: string, roughness = 0.75, metalness = 0) => new THREE.MeshStandardMaterial({ color: c, roughness, metalness });
const glowMat = (c: string, k = 1.6) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: k, roughness: 0.6 });

export function createWorld3dTheme(kit: World3dThemeKit) {
  const { theme } = kit;
  const look = WORLD3D_THEME_LOOK[theme];
  const materials: THREE.Material[] = [];
  const keep = <T extends THREE.Material>(m: T) => {
    materials.push(m);
    return m;
  };
  const shell = keep(mat(look.building[0], 0.55));
  const shellAlt = keep(mat(look.building[1], 0.55));
  const glass = keep(mat(theme === 'future' ? '#9fc3de' : '#3c4652', 0.25, 0.1));
  const dark = keep(mat('#2f343c', 0.8));
  const metal = keep(mat(theme === 'orbital' ? '#3d4452' : '#8d949c', 0.5, 0.35));
  const panel = keep(mat('#2b3442', 0.35, 0.3));
  const rock = keep(mat('#a8704f', 0.95));
  const neon = ['#ff3fd1', '#2ee6ff', '#8a5bff', '#ff7a3d', '#3d7bff', '#ff2f6d'].map((c) => keep(glowMat(c, 2.4)));
  const strip = keep(glowMat(theme === 'cyberpunk' ? '#c93cff' : '#7fd8ff', 1.2));
  const cyan = keep(glowMat('#38e1ff', 1.4));

  const add = (parent: THREE.Object3D, geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number) => {
    const mesh = kit.shadowed(new THREE.Mesh(geo, m));
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  };
  const boxIn = (g: THREE.Object3D, x: number, z: number, w: number, d: number, h: number, y0: number, m: THREE.Material) =>
    add(g, new THREE.BoxGeometry(w, h, d), m, x, y0 + h / 2, z);

  /** Building drawn in the theme's shape inside its footprint (local coordinates: x east, z south, y up). */
  const building = (g: THREE.Group, b: PrevisWorldBuilding) => {
    const hv = hashId(b.id);
    const minS = Math.min(b.w, b.d);
    const maxS = Math.max(b.w, b.d);
    const alongX = b.w >= b.d;
    if (theme === 'mars') {
      if (maxS / minS > 1.45) {
        // Habitat module: a horizontal cylinder on four legs, rings at the ends and a window strip.
        const r = Math.min(minS * 0.42, 2.6);
        const len = maxS * 0.92;
        const cy = r + 0.9;
        const body = add(g, new THREE.CylinderGeometry(r, r, len, 28), shell, 0, cy, 0);
        body.rotation.z = alongX ? Math.PI / 2 : 0;
        body.rotation.x = alongX ? 0 : Math.PI / 2;
        for (const s of [-1, 1]) {
          const ring = add(g, new THREE.TorusGeometry(r * 1.02, 0.12, 8, 28), metal, alongX ? (s * len) / 2.2 : 0, cy, alongX ? 0 : (s * len) / 2.2);
          ring.rotation.y = alongX ? Math.PI / 2 : 0;
          for (const t of [-1, 1]) {
            const leg = boxIn(g, alongX ? (s * len) / 3 : t * r * 0.7, alongX ? t * r * 0.7 : (s * len) / 3, 0.22, 0.22, cy - r * 0.5, 0, metal);
            leg.rotation[alongX ? 'x' : 'z'] = t * 0.25;
          }
        }
        const win = add(g, new THREE.BoxGeometry(alongX ? len * 0.35 : 0.1, r * 0.45, alongX ? 0.1 : len * 0.35), glass, 0, cy + r * 0.15, 0);
        win.position[alongX ? 'z' : 'x'] = r * 0.98;
        if (hv % 3 === 0) boxIn(g, 0, 0, 0.1, 0.1, 6 + (hv % 5), cy + r, metal);
      } else if (hv % 3 !== 1) {
        // Geodesic dome on a low ring.
        const r = minS * 0.47;
        add(g, new THREE.CylinderGeometry(r, r, 0.5, 20), shellAlt, 0, 0.25, 0);
        const dome = new THREE.SphereGeometry(r, 9, 5, 0, Math.PI * 2, 0, Math.PI / 2);
        const m = add(g, dome.toNonIndexed(), shell, 0, 0.5, 0);
        (m.geometry as THREE.BufferGeometry).computeVertexNormals();
        m.material = keep(new THREE.MeshStandardMaterial({ color: look.building[0], roughness: 0.6, flatShading: true }));
        add(g, new THREE.CylinderGeometry(0.9, 0.9, 1.6, 12), glass, r * 0.7, 0.8, 0).rotation.z = Math.PI / 2;
      } else {
        // Hub: a short vertical cylinder with a cap, a window band and an antenna.
        const r = minS * 0.42;
        const h = Math.min(b.h, 5.5);
        add(g, new THREE.CylinderGeometry(r, r, h, 28), shell, 0, h / 2, 0);
        add(g, new THREE.CylinderGeometry(r * 0.96, r, 0.6, 28), shellAlt, 0, h + 0.3, 0);
        add(g, new THREE.CylinderGeometry(r * 1.005, r * 1.005, 0.7, 28, 1, true), glass, 0, h * 0.62, 0);
        boxIn(g, r * 0.4, 0, 0.12, 0.12, 7 + (hv % 4), h + 0.6, metal);
        boxIn(g, -r * 0.3, r * 0.2, 0.08, 0.08, 4, h + 0.6, metal);
      }
      return;
    }
    if (theme === 'future') {
      // Slender towers in wide lots (space between them, like the reference skylines).
      const r = minS * 0.3;
      const H = b.h;
      const m = hv % 2 ? shell : shellAlt;
      switch (hv % 5) {
        case 0:
          add(g, new THREE.CylinderGeometry(r * 0.5, r, H, 32), m, 0, H / 2, 0);
          add(g, new THREE.ConeGeometry(r * 0.22, H * 0.3, 16), metal, 0, H + H * 0.15, 0);
          break;
        case 1:
          add(g, new THREE.CylinderGeometry(r, r, H - r, 32), m, 0, (H - r) / 2, 0);
          add(g, new THREE.SphereGeometry(r, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2), glass, 0, H - r, 0);
          break;
        case 2:
          add(g, new THREE.CylinderGeometry(r * 0.72, r, H, 6), glass, 0, H / 2, 0).rotation.y = (hv % 7) * 0.3;
          add(g, new THREE.ConeGeometry(r * 0.72, H * 0.18, 6), m, 0, H + H * 0.09, 0).rotation.y = (hv % 7) * 0.3;
          break;
        case 3: {
          const stem = H * 0.72;
          add(g, new THREE.CylinderGeometry(r * 0.22, r * 0.32, stem, 20), m, 0, stem / 2, 0);
          const disc = add(g, new THREE.SphereGeometry(r * 1.35, 36, 16), glass, 0, stem + r * 0.3, 0);
          disc.scale.y = 0.26;
          add(g, new THREE.SphereGeometry(r * 0.5, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2), m, 0, stem + r * 0.5, 0);
          break;
        }
        default: {
          boxIn(g, 0, 0, b.w * 0.78, b.d * 0.78, H * 0.6, 0, glass);
          boxIn(g, 0, 0, b.w * 0.58, b.d * 0.58, H * 0.28, H * 0.6, m);
          add(g, new THREE.CylinderGeometry(minS * 0.2, minS * 0.28, H * 0.12, 24), m, 0, H * 0.94, 0);
        }
      }
      return;
    }
    // Cyberpunk and orbital keep the block; they add light, ribs and signs.
    const wall = keep(mat(look.building[hv % 3], theme === 'orbital' ? 0.45 : 0.6, theme === 'orbital' ? 0.3 : 0.1));
    let H = b.h;
    if (theme === 'orbital' && Math.hypot(b.x, b.y) < 24) H = b.h * 2.2 + 18;
    boxIn(g, 0, 0, b.w, b.d, H, 0, wall);
    const front = b.front;
    const fx = front === 'e' ? 1 : front === 'w' ? -1 : 0;
    const fz = front === 's' ? 1 : front === 'n' ? -1 : 0;
    const span = fx ? b.d : b.w;
    if (theme === 'orbital') {
      // Vertical ribs, a lit band every few storeys, roof machinery; spires taper near the centre.
      for (let i = -1; i <= 1; i++) {
        const o = (i * span) / 3;
        boxIn(g, fx ? fx * (b.w / 2 + 0.12) : o, fz ? fz * (b.d / 2 + 0.12) : o, fx ? 0.25 : 0.35, fx ? 0.35 : 0.25, H, 0, metal);
      }
      for (let y = 4; y < H - 1; y += 6) boxIn(g, 0, 0, b.w + 0.06, b.d + 0.06, 0.18, y, cyan);
      const r = rng(hv);
      for (let i = 0; i < 4; i++) boxIn(g, (r() - 0.5) * b.w * 0.6, (r() - 0.5) * b.d * 0.6, 1 + r() * 2.5, 1 + r() * 2.5, 0.8 + r() * 2, H, metal);
      if (H > b.h + 10) {
        boxIn(g, 0, 0, b.w * 0.6, b.d * 0.6, H * 0.25, H, wall);
        add(g, new THREE.ConeGeometry(Math.min(b.w, b.d) * 0.25, H * 0.3, 6), metal, 0, H * 1.25 + H * 0.15, 0);
      }
      return;
    }
    // Cyberpunk: light bands around the tower, billboards on the street side, an antenna.
    for (let y = 6; y < H - 2; y += 9) boxIn(g, 0, 0, b.w + 0.08, b.d + 0.08, 0.14, y, strip);
    const r = rng(hv);
    const n = H > 25 ? 5 : H > 12 ? 3 : 2;
    for (let i = 0; i < n; i++) {
      const sw = 1.6 + r() * 2.6;
      const sh = 4 + r() * Math.min(10, H * 0.35);
      const y0 = 3 + r() * Math.max(1, H - sh - 4);
      const o = (r() - 0.5) * Math.max(0, span - sw);
      boxIn(g, fx ? fx * (b.w / 2 + 0.25) : o, fz ? fz * (b.d / 2 + 0.25) : o, fx ? 0.15 : sw, fx ? sw : 0.15, sh, y0, neon[(hv + i) % neon.length]);
    }
    boxIn(g, fx ? fx * (b.w / 2 + 0.3) : 0, fz ? fz * (b.d / 2 + 0.3) : 0, fx ? 0.15 : span * 0.7, fx ? span * 0.7 : 0.15, 0.9, 3.4, neon[(hv + 3) % neon.length]);
    if (H > 20) boxIn(g, 0, 0, 0.18, 0.18, 6 + (hv % 8), H, metal);
  };

  /** Decor off the streets (never on roads, sidewalks or open spaces, where stages are). */
  const decor = (w: PrevisWorld) => {
    const r = rng(kit.seed * 7 + 3);
    const busy: PrevisWorldBox[] = [...w.roads, ...w.sidewalks, ...w.openSpaces, ...(w.water ?? [])];
    const inBox = (x: number, y: number, b: PrevisWorldBox, m: number) => Math.abs(x - b.x) <= b.w / 2 + m && Math.abs(y - b.y) <= b.d / 2 + m;
    const free = (x: number, y: number, m: number) => !busy.some((b) => inBox(x, y, b, m)) && !w.buildings.some((b) => inBox(x, y, b, m));
    const [EW, ED] = w.extentM;
    const E = Math.max(EW, ED);
    const crossesStreet = (ax: number, ay: number, bx: number, by: number) => {
      for (let k = 1; k < 10; k++) {
        const x = ax + ((bx - ax) * k) / 10;
        const y = ay + ((by - ay) * k) / 10;
        if (busy.some((b) => inBox(x, y, b, 0.5))) return true;
      }
      return false;
    };

    if (theme === 'mars') {
      // Tubes between neighbouring modules.
      const done = new Set<string>();
      for (const a of w.buildings) {
        const near = w.buildings
          .filter((b) => b !== a)
          .map((b) => ({ b, d: Math.hypot(b.x - a.x, b.y - a.y) }))
          .sort((p, q) => p.d - q.d)[0];
        if (!near || near.d > 18) continue;
        const key = [a.id, near.b.id].sort().join('|');
        if (done.has(key) || crossesStreet(a.x, a.y, near.b.x, near.b.y)) continue;
        done.add(key);
        const g = kit.anchored((a.x + near.b.x) / 2, (a.y + near.b.y) / 2);
        const tube = add(g, new THREE.CylinderGeometry(0.7, 0.7, near.d, 16), shellAlt, 0, 1.6, 0);
        tube.rotation.z = Math.PI / 2;
        tube.rotation.y = Math.atan2(near.b.y - a.y, near.b.x - a.x);
        kit.grow(g, g.position.x, -g.position.z, 'pop');
      }
      // Solar arrays and rocks on free ground.
      let arrays = 0;
      for (let i = 0; i < 400 && arrays < 14; i++) {
        const x = (r() - 0.5) * EW * 0.8;
        const y = (r() - 0.5) * ED * 0.8;
        if (!free(x, y, 6)) continue;
        const g = kit.anchored(x, y);
        for (let row = 0; row < 2; row++)
          for (let col = 0; col < 3; col++) {
            const p = add(g, new THREE.BoxGeometry(2, 0.08, 1.2), panel, (col - 1) * 2.3, 0.9, (row - 0.5) * 2.2);
            p.rotation.x = -0.45;
            boxIn(g, (col - 1) * 2.3, (row - 0.5) * 2.2, 0.12, 0.12, 0.8, 0, metal);
          }
        kit.grow(g, x, y, 'pop');
        arrays++;
      }
      for (let i = 0; i < 160; i++) {
        const x = (r() - 0.5) * EW;
        const y = (r() - 0.5) * ED;
        if (!free(x, y, 1)) continue;
        const g = kit.anchored(x, y);
        add(g, new THREE.IcosahedronGeometry(0.25 + r() * 0.9, 0), rock, 0, 0.15, 0).rotation.set(r() * 3, r() * 3, 0);
        kit.grow(g, x, y, 'pop');
      }
      return;
    }

    if (theme === 'future') {
      // Elevated loops on pillars (pillars never on a street) and craft in the air.
      for (const [radius, height] of [
        [E * 0.3, 9],
        [E * 0.18, 16],
      ] as const) {
        const g = kit.anchored(0, 0);
        const loop = add(g, new THREE.TorusGeometry(radius, 1.6, 6, 120), shellAlt, 0, height, 0);
        loop.rotation.x = Math.PI / 2;
        loop.scale.z = 0.35;
        add(g, new THREE.TorusGeometry(radius, 0.12, 4, 120), cyan, 0, height + 0.6, 0).rotation.x = Math.PI / 2;
        const n = Math.round((2 * Math.PI * radius) / 16);
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2;
          const x = Math.cos(a) * radius;
          const y = Math.sin(a) * radius;
          if (busy.some((b) => inBox(x, y, b, 1))) continue;
          add(g, new THREE.CylinderGeometry(0.55, 0.7, height - 0.5, 10), metal, x, (height - 0.5) / 2, -y);
        }
        kit.grow(g, 0, 0, 'pop');
      }
      for (let i = 0; i < 7; i++) {
        const a = r() * Math.PI * 2;
        const d = E * (0.12 + r() * 0.3);
        const g = kit.anchored(Math.cos(a) * d, Math.sin(a) * d);
        const craft = add(g, new THREE.SphereGeometry(1.4, 16, 8), metal, 0, 24 + r() * 26, 0);
        craft.scale.set(1.8, 0.45, 0.9);
        craft.rotation.y = r() * Math.PI;
        kit.grow(g, g.position.x, -g.position.z, 'pop');
      }
      return;
    }

    const laneLines = (edge: THREE.Material, mid: THREE.Material | null, other: THREE.Material) => {
      const g = kit.anchored(0, 0);
      for (const road of w.roads) {
        const along = road.w >= road.d;
        const len = along ? road.w : road.d;
        const half = (along ? road.d : road.w) / 2 - 0.35;
        const lines: Array<[number, THREE.Material]> = [
          [-half, edge],
          [half, other],
        ];
        if (mid) lines.push([0, mid]);
        for (const [off, m] of lines) {
          boxIn(g, along ? road.x : road.x + off, along ? -(road.y + off) : -road.y, along ? len : 0.14, along ? 0.14 : len, 0.03, 0.02, m);
        }
      }
      kit.grow(g, 0, 0, 'pop');
    };

    if (theme === 'cyberpunk') {
      // Glowing lane lines along every road, and stars.
      laneLines(neon[1], neon[2], neon[0]);
      stars(900, 1600);
      return;
    }

    // Orbital: a deck in space under the block, a rim, terraces with machinery, an underside, a planet and stars.
    laneLines(cyan, null, cyan);
    const R = E * 0.74;
    const g = kit.anchored(0, 0);
    add(g, new THREE.CylinderGeometry(R, R * 0.985, 3, 120), metal, 0, -1.52, 0);
    add(g, new THREE.CylinderGeometry(R + 0.5, R + 0.5, 2.2, 120, 1, true), shellAlt, 0, 1.1, 0).material = keep(new THREE.MeshStandardMaterial({ color: look.building[1], side: THREE.DoubleSide, roughness: 0.5, metalness: 0.3 }));
    add(g, new THREE.CylinderGeometry(R + 14, R + 14, 2, 120), metal, 0, -3.4, 0);
    for (let i = 0; i < 90; i++) {
      const a = (i / 90) * Math.PI * 2 + r() * 0.03;
      const d = R + 3 + r() * 9;
      boxIn(g, Math.cos(a) * d, Math.sin(a) * d, 1.5 + r() * 4, 1.5 + r() * 4, 1 + r() * 5, -2.4, i % 7 ? shellAlt : metal);
    }
    add(g, new THREE.TorusGeometry(R + 14, 0.25, 4, 160), cyan, 0, -2.3, 0).rotation.x = Math.PI / 2;
    add(g, new THREE.CylinderGeometry(R * 0.9, R * 0.25, R * 0.55, 60), metal, 0, -3 - R * 0.275, 0);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      boxIn(g, Math.cos(a) * R * 0.45, Math.sin(a) * R * 0.45, 3, 3, R * 0.5, -3 - R * 0.6, dark);
    }
    kit.grow(g, 0, 0, 'pop');
    // Within the viewport's far plane (3 km).
    const planet = new THREE.Mesh(new THREE.SphereGeometry(1600, 96, 48), keep(new THREE.MeshStandardMaterial({ color: '#5f86b8', emissive: '#29466e', emissiveIntensity: 0.6, roughness: 0.9, fog: false })));
    planet.position.set(300, -2100, -700);
    planet.userData.sky = true;
    kit.scene.add(planet);
    stars(1400, 2600);
  };

  const stars = (n: number, radius: number) => {
    const r = rng(kit.seed + 11);
    const pos: number[] = [];
    for (let i = 0; i < n; i++) {
      const u = r() * 2 - 1;
      const t = r() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      const y = Math.abs(u) * radius * (theme === 'orbital' ? 1 : 0.9) * (theme === 'orbital' && r() < 0.3 ? -0.3 : 1);
      pos.push(Math.cos(t) * s * radius, y + 40, Math.sin(t) * s * radius);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const pts = new THREE.Points(geo, keep(new THREE.PointsMaterial({ color: '#e8ecff', size: 1.6, sizeAttenuation: false, fog: false })));
    pts.userData.sky = true;
    kit.scene.add(pts);
  };

  return {
    look,
    /** True when the theme draws this building itself (the plain block is skipped). */
    building,
    decor,
    /** Orbital worlds have no ground sheet (space under the deck). */
    hidesGround: theme === 'orbital',
    dispose() {
      materials.forEach((m) => m.dispose());
    },
  };
}
