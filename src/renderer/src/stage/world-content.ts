/**
 * Scene content shared by the live viewport and the recorder: whitebox world (or the classic stage turned white),
 * stage outline + paths (overlays), muted figures, sun / lights sized to the set. A world can also be shown on its
 * own (no plan yet). Buildings and street objects are grouped so the world can grow in (`grow`).
 */
import * as THREE from 'three';
import {
  isPrevisRiding,
  samplePrevisCamera,
  samplePrevisCharacterTurnHeading,
  samplePrevisVehicle,
  type PrevisPlan,
} from '@shared/previs/plan-core';
import { buildWorld3dVehicle, world3dVehicleHeadings } from './world-vehicles';
import { previsPathLine, samplePrevisPath, samplePrevisPathSmoothHeading } from '@shared/previs/motion-spline';
import { createWorld3dTheme, WORLD3D_THEME_LOOK } from './world-themes';
import {
  generatePrevisWorld,
  normalizePrevisWorldRef,
  previsStageToWorld,
  previsWorldToStage,
  type PrevisWorld,
  type PrevisWorldBuilding,
  type PrevisWorldLandmark,
  type PrevisWorldRef,
  previsWorldGroundAt,
} from '@shared/previs/world-gen';
import {
  PREVIS_INTERIOR_HEIGHT_M,
  PREVIS_INTERIOR_WALL_M,
  previsInteriorLayouts,
  previsPlanSeats,
  previsSeatAt,
  type PrevisInteriorLayout,
} from '@shared/previs/interior';
import { buildPrevisPropShape, buildPrevisSet } from '@shared/previs/set-builder';
import { DS3D_BACKGROUND, DS3D_COLORS, DS3D_PRIMARY, ds3dBuildingIsBlue, ds3dBuildingShade, ds3dFigureHex } from './world-palette';

/** Plan floor (x right, y away) + height → three.js (y up, -z away). */
export const v3 = (x: number, y: number, h = 0) => new THREE.Vector3(x, h, -y);

/** A plan (stage + cast + camera, optionally in a world) or a world on its own. */
export type World3dSource = PrevisPlan | { world: PrevisWorldRef };

/** What a click in the viewport can select (plan coordinates: x east, y north). */
export type World3dLive =
  | { kind: 'character'; id: string; x: number; y: number; facing: number }
  | { kind: 'camera'; x: number; y: number; h: number; yaw: number; pitch: number };

export interface World3dPickInfo {
  kind: 'building' | 'prop' | 'street' | 'landmark' | 'character' | 'camera';
  id: string;
  /** Building kind (storefront / building / tower) or street-object kind. */
  sub: string;
  x: number;
  y: number;
}

export interface World3dContent {
  scene: THREE.Scene;
  sun: THREE.DirectionalLight;
  overlays: THREE.Object3D[];
  /** Figures (hidden for the scene overview). */
  figures: THREE.Group[];
  /** World objects farther than `m` metres from the stage centre (hidden while recording). */
  farFrom(m: number): THREE.Object3D[];
  stageToWorld(x: number, y: number, h?: number): THREE.Vector3;
  /** World plan coordinates (x east, y north) → stage coordinates. */
  worldToStage(x: number, y: number): { x: number; y: number };
  pose(t: number): void;
  /** Live preview while dragging / rotating (stage coordinates, degrees), or null. */
  setLive(live: World3dLive | null): void;
  /** Camera body + view frustum for the planned camera (hidden for overviews / recording). */
  cameraGizmo: THREE.Object3D | null;
  /** Far frame of the camera frustum: shown and grabbable while the camera is selected (drag to aim). */
  aimHandle: THREE.Mesh | null;
  setAimActive(on: boolean): void;
  /** Point `camera` along the planned shot at `t` (no-op for a world on its own). */
  aimShotCamera(camera: THREE.PerspectiveCamera, t: number): void;
  /** True when a three.js point is inside a solid building (camera navigation). */
  blocked(p: THREE.Vector3): boolean;
  /** Growth of the world from the centre outwards; 0 = only footprints, 1 = complete. */
  grow(progress: number): void;
  /** World extent (m) for framing the overview. */
  extentM: [number, number];
  /** Tallest building in the blocks (m), so the overview clears high-rise districts. */
  maxHeightM: number;
  /** Extra distance for the world overview (an orbital deck is seen whole, from further out). */
  overviewScale: number;
  /** The plan, when the source has one. */
  plan: PrevisPlan | null;
  /** Street grade (rise per metre eastward); 0 on flat worlds. */
  groundSlope: number;
  /** Ground height (m) at plan x (0 on flat worlds). */
  groundAt(x: number): number;
  /** Advance falling rain / snow to `seconds` around `viewer` (three.js coordinates); no-op without weather. */
  animate(seconds: number, viewer: THREE.Vector3): void;
  /** Update sky, sun and precipitation without rebuilding city geometry. */
  applyAtmosphere(sourceWorld: PrevisWorldRef | undefined): void;
  dispose(): void;
}

type TimeOfDay = 'day' | 'dusk' | 'night';

/** Sky, fog and light colours per time of day (day = the original look). */
const TIME_LOOK: Record<TimeOfDay, { sky: string; hemiSky: string; hemiGround: string; hemi: number; sun: string; sunI: number; sunLift: number; glow: number }> = {
  day: { sky: DS3D_BACKGROUND, hemiSky: '#ffffff', hemiGround: '#8a8780', hemi: 1.5, sun: '#fff6e8', sunI: 2.1, sunLift: 1, glow: 0 },
  dusk: { sky: '#cfc6bd', hemiSky: '#f4e2d2', hemiGround: '#7d746c', hemi: 1.05, sun: '#ffcf9e', sunI: 1.7, sunLift: 0.42, glow: 0.35 },
  night: { sky: '#4c5462', hemiSky: '#8394ad', hemiGround: '#2b2e34', hemi: 0.5, sun: '#bccbe4', sunI: 0.45, sunLift: 1, glow: 1.1 },
};

/** Blend two hex colours (`k` = share of `b`). */
function mixHex(a: string, b: string, k: number): string {
  return `#${new THREE.Color(a).lerp(new THREE.Color(b), k).getHexString()}`;
}

function resolveWorldLook(sourceWorld: PrevisWorldRef | undefined): {
  time: TimeOfDay;
  weather: 'rain' | 'snow' | undefined;
  look: (typeof TIME_LOOK)[TimeOfDay];
  theme: PrevisWorldRef['theme'];
  themeLook: (typeof WORLD3D_THEME_LOOK)[keyof typeof WORLD3D_THEME_LOOK] | null;
} {
  const rawTime = sourceWorld?.timeOfDay ?? 'day';
  const neon = sourceWorld?.neon === true;
  const time: TimeOfDay = neon && rawTime === 'day' ? 'night' : rawTime === 'night' || rawTime === 'dusk' ? rawTime : 'day';
  const look = { ...TIME_LOOK[time] };
  const weather = sourceWorld?.weather;
  if (weather === 'rain') Object.assign(look, { sky: mixHex(look.sky, '#8f969e', 0.55), hemi: look.hemi * 0.8, sunI: look.sunI * 0.45 });
  if (weather === 'snow') Object.assign(look, { sky: mixHex(look.sky, '#e9ecef', 0.6), sunI: look.sunI * 0.6 });
  const theme = sourceWorld?.theme;
  const themeLook = theme ? WORLD3D_THEME_LOOK[theme] : null;
  if (themeLook) {
    const { sky, hemiSky, hemiGround, hemi, sun, sunI, sunLift, glow } = themeLook;
    Object.assign(look, { sky, hemiSky, hemiGround, hemi, sun, sunI, sunLift, glow });
  }
  return { time, weather, look, theme, themeLook };
}

function createBaseScene(look: (typeof TIME_LOOK)[TimeOfDay]): { scene: THREE.Scene; hemi: THREE.HemisphereLight } {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(look.sky);
  scene.fog = new THREE.Fog(look.sky, 150, 360);
  const hemi = new THREE.HemisphereLight(look.hemiSky, look.hemiGround, look.hemi);
  scene.add(hemi);
  return { scene, hemi };
}

/**
 * Pitched roof with the ridge along local x, footprint `w` × `d`, rising to `h` (flat-shaded, non-indexed).
 * Hip roofs slope on all four sides; gable roofs have vertical triangle ends.
 */
function roofGeometry(kind: 'gable' | 'hip', w: number, d: number, h: number): THREE.BufferGeometry {
  const X = w / 2;
  const Z = d / 2;
  const r = kind === 'hip' ? Math.max(0, X - Z) : X;
  const A = [-X, 0, -Z], B = [X, 0, -Z], C = [X, 0, Z], D = [-X, 0, Z];
  const R1 = [-r, h, 0], R2 = [r, h, 0];
  const tris: number[][] = [
    // Slopes (north / south).
    A, R2, B, A, R1, R2,
    C, R1, D, C, R2, R1,
    // Ends (triangles; vertical for gables).
    D, R1, A,
    B, R2, C,
    // Underside.
    A, B, C, A, C, D,
  ];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(tris.flat(), 3));
  g.computeVertexNormals();
  return g;
}

type Growable = { obj: THREE.Object3D; start: number; mode: 'rise' | 'pop' };
type Box2 = { x: number; y: number; w: number; d: number };

/** Camera position straight between its keys at `t` (null without keys). */
function linearCameraPosition(plan: PrevisPlan, t: number): { x: number; y: number; h: number } | null {
  const keys = plan.camera.keys;
  if (!keys.length) return null;
  if (t <= keys[0].t) return keys[0];
  for (let i = 0; i + 1 < keys.length; i++) {
    const a = keys[i];
    const b = keys[i + 1];
    if (t <= b.t) {
      const u = b.t > a.t ? (t - a.t) / (b.t - a.t) : 1;
      return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, h: a.h + (b.h - a.h) * u };
    }
  }
  return keys[keys.length - 1];
}

/** A character figure (body, head, face) in `hex`; `ghost` makes it see-through for placing. */
/** How far a seated figure sinks (its head ends at a seated height; the body below the seat is hidden). */
export const WORLD3D_SIT_DROP_M = 0.45;

export function buildWorld3dFigure(hex: string, ghost = false): THREE.Group {
  const g = new THREE.Group();
  const look = ghost ? { transparent: true, opacity: 0.45, depthWrite: false } : {};
  const fmat = new THREE.MeshStandardMaterial({ color: hex, roughness: 0.7, ...look });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 1.32, 24), fmat);
  body.position.y = 0.66;
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.2, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2), fmat);
  dome.position.y = 1.32;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 20, 14), fmat);
  head.position.y = 1.6;
  const face = new THREE.Mesh(
    new THREE.SphereGeometry(0.035, 10, 8),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(hex).multiplyScalar(0.45), roughness: 0.5, ...look }),
  );
  face.position.set(0, 1.6, -0.12);
  // Thighs, shown only while seated (the figure then sinks so its lower body is under the seat).
  const lap = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.16, 0.46), fmat);
  lap.name = 'lap';
  lap.position.set(0, 0.38 + WORLD3D_SIT_DROP_M, -0.2);
  lap.visible = false;
  for (const part of [body, dome, head, face, lap]) {
    part.castShadow = !ghost;
    g.add(part);
  }
  return g;
}

/** `smooth` (default on): motion between keys follows curves; off: straight lines with hard corners. */
export function buildWorld3dContent(source: World3dSource, opts?: { smooth?: boolean }): World3dContent {
  const smooth = opts?.smooth !== false;
  const plan: PrevisPlan | null = 'stage' in source ? source : null;
  const sourceWorld = plan ? plan.set?.world : (source as { world: PrevisWorldRef }).world;
  const { time, weather, look, theme, themeLook } = resolveWorldLook(sourceWorld);
  const neon = sourceWorld?.neon === true;
  /** Grade of a sloped street (uphill toward the east); rolling hills add a gentle wave along the street. */
  const slope = typeof sourceWorld?.slope === 'number' ? sourceWorld.slope : 0;
  const hills = sourceWorld?.hills === true;
  const groundAt = (x: number) => previsWorldGroundAt({ slope, hills }, x);
  /** Lowest ground under a footprint `halfW` either side of x (objects stand there; the rest is below grade). */
  const groundUnder = (x: number, halfW: number) => {
    let lo = Infinity;
    for (let i = 0; i <= 6; i++) lo = Math.min(lo, groundAt(x - halfW + (i * halfW) / 3));
    return lo;
  };
  const { scene, hemi } = createBaseScene(look);
  if (themeLook && scene.fog instanceof THREE.Fog) {
    scene.fog.near = themeLook.fog[0];
    scene.fog.far = themeLook.fog[1];
  }
  if (weather && scene.fog instanceof THREE.Fog) {
    scene.fog.near = weather === 'rain' ? 45 : 60;
    scene.fog.far = weather === 'rain' ? 210 : 240;
  }
  const sun = new THREE.DirectionalLight(look.sun, look.sunI);
  sun.castShadow = true;
  sun.shadow.bias = -0.0003;
  sun.shadow.normalBias = 0.06;
  sun.shadow.mapSize.set(4096, 4096);
  scene.add(sun, sun.target);
  const mat = (c: string, roughness = 0.95, side: THREE.Side = THREE.FrontSide) => new THREE.MeshStandardMaterial({ color: c, roughness, side });
  const M = {
    ground: mat(DS3D_COLORS.ground),
    road: mat(DS3D_COLORS.road),
    dirt: mat(DS3D_COLORS.dirt),
    stone: mat(DS3D_COLORS.stone),
    sidewalk: mat(DS3D_COLORS.sidewalk),
    building: mat(DS3D_COLORS.building),
    buildingBlue: mat(DS3D_COLORS.buildingBlue),
    buildingWarm: mat(DS3D_COLORS.buildingWarm),
    roof: mat(DS3D_COLORS.roof, 0.9, THREE.DoubleSide),
    shopOpen: mat(DS3D_COLORS.shopOpen),
    paper: new THREE.MeshStandardMaterial({ color: DS3D_COLORS.paper, roughness: 0.8, emissive: '#ffd49a', emissiveIntensity: look.glow }),
    glass: mat(DS3D_COLORS.glass, 0.5),
    car: mat(DS3D_COLORS.car, 0.6),
    metal: mat(DS3D_COLORS.metal, 0.6),
    plant: mat(DS3D_COLORS.plant),
    park: mat(DS3D_COLORS.park),
    trunk: mat(DS3D_COLORS.trunk),
    masonry: mat(DS3D_COLORS.masonry),
    masonryOpen: mat(DS3D_COLORS.masonry, 0.95, THREE.DoubleSide),
    shell: mat(DS3D_COLORS.building, 0.55, THREE.DoubleSide),
    windowGlass: new THREE.MeshStandardMaterial({ color: DS3D_COLORS.glass, roughness: 0.2, transparent: true, opacity: 0.28, depthWrite: false }),
    hill: mat(DS3D_COLORS.hill),
    water: new THREE.MeshStandardMaterial({ color: DS3D_COLORS.water, roughness: 0.35, metalness: 0.05 }),
    torii: mat(DS3D_COLORS.torii, 0.8),
  };
  /** Three shades per facade tint so neighbouring buildings read as separate volumes. */
  const shaded = (c: string) => [1, 0.93, 0.86].map((k) => mat(`#${new THREE.Color(c).multiplyScalar(k).getHexString()}`));
  const wallShades = { plain: shaded(DS3D_COLORS.building), blue: shaded(DS3D_COLORS.buildingBlue), warm: shaded(DS3D_COLORS.buildingWarm) };
  if (themeLook) {
    M.ground.color.set(themeLook.ground);
    for (const m of [M.road, M.dirt, M.stone]) m.color.set(themeLook.road);
    M.sidewalk.color.set(themeLook.sidewalk);
    M.park.color.set(themeLook.sidewalk);
    wallShades.plain = shaded(themeLook.building[0]);
    wallShades.blue = shaded(themeLook.building[2]);
    wallShades.warm = shaded(themeLook.building[1]);
  }
  let themed: ReturnType<typeof createWorld3dTheme> | null = null;
  const horizonMats: THREE.Material[] = [];
  // Wet streets shine a little; snow whitens the ground, the streets and the roofs.
  if (weather === 'rain') {
    for (const m of [M.road, M.sidewalk, M.stone, M.dirt]) {
      m.roughness = 0.42;
      m.color.multiplyScalar(0.88);
    }
  }
  if (weather === 'snow') {
    for (const m of [M.ground, M.road, M.sidewalk, M.stone, M.dirt, M.roof, M.park, M.hill]) m.color.lerp(new THREE.Color('#f1f3f5'), 0.7);
  }
  const neonMats = ['#d987b4', '#7fc4d8', '#c9b46a'].map((c) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 1.6, roughness: 0.6 }));
  const neonFor = (id: string) => neonMats[[...id].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7) % neonMats.length];
  const wireMat = new THREE.LineBasicMaterial({ color: '#6f7377' });
  const white = M.building;
  /** Solid volumes for camera navigation; `base` = ground height they stand on (0 on flat worlds). */
  const solids: Array<{ x: number; y: number; w: number; d: number; h: number; base?: number }> = [];
  const worldGroup = new THREE.Group();
  scene.add(worldGroup);
  // Flat pieces (ground, streets, water, railings, wires) follow a slope by a vertical shear: verticals stay
  // vertical. Without a slope they stay in the world group as before.
  let strips: THREE.Object3D = worldGroup;
  if (hills) {
    // Rolling ground: the flat pieces are subdivided and displaced after drawing (see `drapeStrips`).
    const draped = new THREE.Group();
    worldGroup.add(draped);
    strips = draped;
  } else if (slope) {
    const shear = new THREE.Group();
    shear.matrixAutoUpdate = false;
    shear.matrix.set(1, 0, 0, 0, slope, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1);
    worldGroup.add(shear);
    strips = shear;
  }
  const overlays: THREE.Object3D[] = [];
  const growables: Growable[] = [];
  let extentM: [number, number] = [60, 60];
  let maxHeightM = 0;

  let stageToWorld = (x: number, y: number, h = 0) => v3(x, y, h);
  let worldToStage = (x: number, y: number) => ({ x, y });
  let heading = 0;
  let stageCenter = { x: 0, y: 0 };

  /** Box with its base at `y0`; `parent` defaults to the world group (world coordinates). */
  const box = (
    x: number,
    y: number,
    w: number,
    d: number,
    h: number,
    y0 = 0,
    shadow = true,
    material: THREE.Material = white,
    parent: THREE.Object3D = strips,
  ) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    m.position.copy(v3(x, y, y0 + h / 2));
    m.castShadow = shadow;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  };
  /** Group anchored on the ground at world (x, y); children use coordinates relative to it. */
  /**
   * Rolling ground: subdivide the flat pieces along x and lift every vertex to the ground under it (lines too).
   * Runs once after the world is drawn; boxes are axis-aligned so x is position + local x.
   */
  const drapeStrips = () => {
    if (!hills) return;
    for (const o of strips.children) {
      const mesh = o as THREE.Mesh;
      const line = o as THREE.Line;
      if (mesh.isMesh) {
        const p = (mesh.geometry as THREE.BoxGeometry).parameters;
        if (p && typeof p.width === 'number') {
          mesh.geometry.dispose();
          mesh.geometry = new THREE.BoxGeometry(p.width, p.height, p.depth, Math.max(1, Math.min(240, Math.ceil(p.width / 2))), 1, 1);
        }
      } else if (!line.isLine) continue;
      const geo = (mesh.isMesh ? mesh.geometry : line.geometry) as THREE.BufferGeometry;
      const pos = geo.attributes.position;
      for (let i = 0; i < pos.count; i++) pos.setY(i, pos.getY(i) + groundAt(o.position.x + pos.getX(i)));
      pos.needsUpdate = true;
      if (mesh.isMesh) geo.computeVertexNormals();
      geo.computeBoundingSphere();
    }
  };
  /** Object standing at (x, y): on a slope it sits at the ground height, `sink` metres of footprint below grade. */
  const anchored = (x: number, y: number, sink = 0) => {
    const g = new THREE.Group();
    g.position.copy(v3(x, y, slope || hills ? groundUnder(x, sink) : 0));
    worldGroup.add(g);
    return g;
  };

  let lightAnchor = { cx: 0, cy: 0, span: 60 };
  const lightFor = (cx: number, cy: number, span: number) => {
    lightAnchor = { cx, cy, span };
    const r = span * 0.6;
    Object.assign(sun.shadow.camera, { left: -r, right: r, top: r, bottom: -r, near: 1, far: Math.max(120, span * 3) });
    sun.position.copy(v3(cx - span * 0.35, cy - span * 0.25, Math.max(18, span * 0.6) * look.sunLift));
    sun.target.position.copy(v3(cx, cy, 0));
    sun.shadow.camera.updateProjectionMatrix();
  };

  const wallMaterial = (b: PrevisWorldBuilding, styled: boolean) => {
    const tint = styled ? (b.tint ?? 'plain') : ds3dBuildingIsBlue(b.id) ? 'blue' : 'plain';
    return wallShades[tint][ds3dBuildingShade(b.id)];
  };

  /** Pitched roof on top of a tier: `w` × `d` footprint at height `y0`. */
  const roofOn = (g: THREE.Object3D, kind: 'gable' | 'hip', w: number, d: number, h: number, y0: number, eave: number, rotate = false) => {
    const m = new THREE.Mesh(roofGeometry(kind, (rotate ? d : w) + 2 * eave, (rotate ? w : d) + 2 * eave, h), M.roof);
    m.position.y = y0;
    if (rotate) m.rotation.y = Math.PI / 2;
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
  };
  const cylinder = (g: THREE.Object3D, r0: number, r1: number, h: number, y0: number, material: THREE.Material, seg = 16) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, h, seg), material);
    m.position.y = y0 + h / 2;
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
  };
  const shade = (m: THREE.Mesh) => {
    m.castShadow = true;
    m.receiveShadow = true;
  };
  /** Round beam between two points (local three.js coordinates). */
  const strut = (g: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3, r: number, material: THREE.Material) => {
    const dir = b.clone().sub(a);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.8, r, dir.length(), 8), material);
    m.position.copy(a.clone().add(b).multiplyScalar(0.5));
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
  };
  /** Procedural landmark in its anchored group (local plan coordinates, origin on the ground). */
  const drawLandmark = (g: THREE.Group, l: PrevisWorldLandmark) => {
    const { w, d } = l;
    const long = w >= d;
    const toward = { n: [0, 1], s: [0, -1], e: [1, 0], w: [-1, 0] }[l.front];
    if (l.kind === 'castle_keep') {
      box(0, 0, w, d, 9, 0, true, M.masonry, g);
      let tw = w * 0.62;
      let td = d * 0.62;
      let y = 9;
      for (let i = 0; i < 4; i++) {
        box(0, 0, tw, td, 5, y, true, M.building, g);
        y += 5;
        roofOn(g, 'hip', tw, td, i === 3 ? 4 : 2.2, y, 1.3, !long);
        tw *= 0.8;
        td *= 0.8;
      }
    } else if (l.kind === 'pagoda') {
      box(0, 0, w * 0.8, d * 0.8, 1, 0, true, M.masonry, g);
      let s = w * 0.62;
      let y = 1;
      for (let i = 0; i < 5; i++) {
        box(0, 0, s, s, 3.6, y, true, M.buildingWarm, g);
        y += 3.6;
        roofOn(g, 'hip', s, s, 1.4, y, 1.6);
        s *= 0.86;
      }
      cylinder(g, 0.18, 0.12, 6, y + 1.2, M.metal, 8);
    } else if (l.kind === 'torii') {
      const span = Math.max(w, d) * 0.72;
      const ax = long ? 1 : 0;
      for (const sgn of [-1, 1]) {
        const pg = new THREE.Group();
        pg.position.copy(v3(ax * sgn * (span / 2), (1 - ax) * sgn * (span / 2), 0));
        cylinder(pg, 0.38, 0.32, 6.6, 0, M.torii);
        g.add(pg);
      }
      box(0, 0, long ? Math.max(w, d) : 0.7, long ? 0.7 : Math.max(w, d), 0.55, 6.6, true, M.torii, g);
      box(0, 0, long ? span + 0.8 : 0.4, long ? 0.4 : span + 0.8, 0.35, 5.6, true, M.torii, g);
    } else if (l.kind === 'temple') {
      box(0, 0, w, d, 1.2, 0, true, M.masonry, g);
      box(0, 0, w * 0.72, d * 0.7, 6.5, 1.2, true, M.buildingWarm, g);
      roofOn(g, 'hip', w * 0.72, d * 0.7, 7, 7.7, 2.4, !long);
    } else if (l.kind === 'clock_tower') {
      box(0, 0, w, d, 33, 0, true, M.building, g);
      box(toward[0] * (w / 2 + 0.06), toward[1] * (d / 2 + 0.06), toward[0] ? 0.12 : w * 0.6, toward[0] ? d * 0.6 : 0.12, w * 0.6, 27, false, M.paper, g);
      roofOn(g, 'hip', w, d, 9, 33, 0.4);
    } else if (l.kind === 'church') {
      box(0, 0, w, d, 13, 0, true, M.building, g);
      roofOn(g, 'gable', w, d, 6, 13, 0.4, long);
      const tx = toward[0] * ((long ? w : d) / 2 - 3.5);
      const ty = toward[1] * ((long ? d : w) / 2 - 3.5);
      box(tx, ty, 7, 7, 24, 0, true, M.building, g);
      const spire = new THREE.Group();
      spire.position.copy(v3(tx, ty, 0));
      roofOn(spire, 'hip', 7, 7, 14, 24, 0.2);
      g.add(spire);
    } else if (l.kind === 'skyscraper') {
      box(0, 0, w, d, l.h * 0.62, 0, true, M.buildingBlue, g);
      box(0, 0, w * 0.72, d * 0.72, l.h * 0.38, l.h * 0.62, true, M.buildingBlue, g);
    } else if (l.kind === 'hill') {
      // Gentle mound: half an ellipsoid.
      const mound = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 14, 0, Math.PI * 2, 0, Math.PI / 2), M.hill);
      mound.scale.set(w / 2, l.h, d / 2);
      mound.castShadow = true;
      mound.receiveShadow = true;
      g.add(mound);
    } else if (l.kind === 'tv_tower') {
      cylinder(g, Math.min(w, d) / 2, Math.min(w, d) / 2.4, 8, 0, M.building, 24);
      cylinder(g, 2.6, 1.8, 112, 8, M.building, 20);
      const ball = new THREE.Mesh(new THREE.SphereGeometry(7, 24, 16), M.buildingBlue);
      ball.position.y = 118;
      ball.castShadow = true;
      g.add(ball);
      cylinder(g, 1.4, 0.5, 46, 124, M.metal, 10);
    } else if (l.kind === 'lattice_tower') {
      // Iron lattice tower: four splayed legs to the first deck, then narrowing legs to a slender top.
      const s = Math.min(w, d);
      const H = l.h;
      const levels: Array<[number, number, number]> = [
        // [half-span at the top of the stage, height of the top, leg radius]
        [s * 0.2, H * 0.19, s * 0.055],
        [s * 0.11, H * 0.38, s * 0.04],
        [s * 0.025, H * 0.88, s * 0.024],
      ];
      let from: [number, number] = [s * 0.46, 0];
      for (const [half, top, radius] of levels) {
        for (const [sx, sy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) strut(g, v3(sx * from[0], sy * from[0], from[1]), v3(sx * half, sy * half, top), radius, M.metal);
        if (top < H * 0.5) box(0, 0, half * 2.5, half * 2.5, H * 0.012, top, true, M.metal, g);
        from = [half, top];
      }
      cylinder(g, s * 0.03, s * 0.012, H * 0.12, H * 0.88, M.metal, 8);
    } else if (l.kind === 'triumphal_arch') {
      // Two piers and the attic over the passage; the passage runs along the short side.
      const across = Math.max(w, d);
      const along = Math.min(w, d);
      const pier = across * 0.3;
      const spring = l.h * 0.62;
      const px = long ? across / 2 - pier / 2 : 0;
      const py = long ? 0 : across / 2 - pier / 2;
      for (const sgn of [-1, 1]) box(sgn * px, sgn * py, long ? pier : along, long ? along : pier, spring, 0, true, M.masonry, g);
      box(0, 0, w, d, l.h - spring, spring, true, M.masonry, g);
    } else if (l.kind === 'pyramid') {
      const m = new THREE.Mesh(new THREE.ConeGeometry(Math.min(w, d) / Math.SQRT2, l.h, 4), M.buildingWarm);
      m.rotation.y = Math.PI / 4;
      m.position.y = l.h / 2;
      shade(m);
      g.add(m);
    } else if (l.kind === 'mountain') {
      // Broad cone with a snow cap (the top 28 %).
      const body = new THREE.Mesh(new THREE.ConeGeometry(1, l.h, 48), M.masonry);
      body.scale.set(w / 2, 1, d / 2);
      body.position.y = l.h / 2;
      const cap = new THREE.Mesh(new THREE.ConeGeometry(0.28 * 1.02, l.h * 0.28, 48), M.building);
      cap.scale.set(w / 2, 1, d / 2);
      cap.position.y = l.h * 0.86;
      shade(body);
      shade(cap);
      g.add(body, cap);
    } else if (l.kind === 'statue') {
      const base = l.h * 0.42;
      box(0, 0, w * 0.55, d * 0.55, base, 0, true, M.masonry, g);
      cylinder(g, w * 0.17, w * 0.1, l.h * 0.4, base, M.hill, 16);
      const head = new THREE.Mesh(new THREE.SphereGeometry(w * 0.08, 16, 12), M.hill);
      head.position.y = base + l.h * 0.44;
      shade(head);
      g.add(head);
      const side = long ? v3(w * 0.12, 0, 0) : v3(0, d * 0.12, 0);
      const shoulder = side.clone().setY(base + l.h * 0.36);
      const hand = side.clone().multiplyScalar(1.3).setY(l.h * 0.97);
      strut(g, shoulder, hand, w * 0.035, M.hill);
      const flame = new THREE.Mesh(new THREE.SphereGeometry(w * 0.05, 12, 8), M.paper);
      flame.position.copy(hand).setY(l.h);
      g.add(flame);
    } else if (l.kind === 'arena') {
      // Oval wall, a lower inner tier and a sand floor.
      const ring = (sx: number, sz: number, h: number) => {
        const m = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, h, 56, 1, true), M.masonryOpen);
        m.scale.set(sx, 1, sz);
        m.position.y = h / 2;
        shade(m);
        g.add(m);
      };
      ring(w / 2, d / 2, l.h);
      ring(w * 0.38, d * 0.38, l.h * 0.55);
      const floor = new THREE.Mesh(new THREE.CircleGeometry(1, 48), M.dirt);
      floor.scale.set(w * 0.3, d * 0.3, 1);
      floor.rotation.x = -Math.PI / 2;
      floor.position.y = 0.05;
      floor.receiveShadow = true;
      g.add(floor);
    } else if (l.kind === 'city_gate') {
      // Red wall with the hall on top under a double-eaved roof.
      const wallH = l.h * 0.42;
      box(0, 0, w, d, wallH, 0, true, M.torii, g);
      const hw = w * 0.74;
      const hd = d * 0.6;
      const hallH = l.h * 0.22;
      box(0, 0, hw, hd, hallH, wallH, true, M.torii, g);
      roofOn(g, 'hip', hw, hd, l.h * 0.06, wallH + hallH * 0.55, 1.6, !long);
      roofOn(g, 'hip', hw * 0.96, hd * 0.9, l.h - wallH - hallH, wallH + hallH, 1.8, !long);
    } else if (l.kind === 'ferris_wheel') {
      const R = l.h / 2 - 2;
      const hub = v3(0, 0, R + 2);
      const wheel = new THREE.Group();
      wheel.position.copy(hub);
      if (!long) wheel.rotation.y = Math.PI / 2;
      const rim = new THREE.Mesh(new THREE.TorusGeometry(R, 0.45, 8, 72), M.metal);
      shade(rim);
      wheel.add(rim);
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        const p = new THREE.Vector3(Math.cos(a) * R, Math.sin(a) * R, 0);
        strut(wheel, new THREE.Vector3(), p, 0.18, M.metal);
        const cab = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.4, 2.2), M.buildingBlue);
        cab.position.copy(p).setY(p.y - 1.6);
        shade(cab);
        wheel.add(cab);
      }
      g.add(wheel);
      const depth = (long ? d : w) / 2;
      for (const sgn of [-1, 1]) {
        for (const foot of [-1, 1]) {
          const ground = long ? v3(foot * R * 0.55, sgn * depth, 0) : v3(sgn * depth, foot * R * 0.55, 0);
          strut(g, ground, hub, 0.5, M.metal);
        }
      }
    } else if (l.kind === 'leaning_tower') {
      const r = Math.min(w, d) / 2 - 0.5;
      const tower = new THREE.Group();
      tower.rotation.z = (4 * Math.PI) / 180;
      const body = l.h * 0.84;
      cylinder(tower, r, r, body, 0, M.building, 32);
      for (let i = 1; i <= 6; i++) cylinder(tower, r + 0.35, r + 0.35, 0.5, (body * i) / 7, M.building, 32);
      cylinder(tower, r * 0.72, r * 0.72, l.h - body, body, M.building, 24);
      g.add(tower);
    } else if (l.kind === 'castle') {
      // Curtain walls, round corner towers with cone roofs, a keep and a gatehouse on the front.
      const wallH = l.h * 0.36;
      const t = 2;
      box(0, d / 2 - t / 2, w, t, wallH, 0, true, M.masonry, g);
      box(0, -d / 2 + t / 2, w, t, wallH, 0, true, M.masonry, g);
      box(w / 2 - t / 2, 0, t, d, wallH, 0, true, M.masonry, g);
      box(-w / 2 + t / 2, 0, t, d, wallH, 0, true, M.masonry, g);
      const towerH = l.h * 0.58;
      for (const [cx, cy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const tg = new THREE.Group();
        tg.position.copy(v3((cx * w) / 2, (cy * d) / 2, 0));
        cylinder(tg, 4, 4, towerH, 0, M.masonry, 20);
        cylinder(tg, 4.6, 0.05, l.h * 0.22, towerH, M.roof, 20);
        g.add(tg);
      }
      box(0, 0, w * 0.36, d * 0.36, l.h * 0.8, 0, true, M.masonry, g);
      roofOn(g, 'hip', w * 0.36, d * 0.36, l.h * 0.2, l.h * 0.8, 0.3);
      box(toward[0] * (w / 2), toward[1] * (d / 2), toward[0] ? 6 : 10, toward[0] ? 10 : 6, wallH * 1.4, 0, true, M.masonry, g);
    } else if (l.kind === 'opera_house') {
      // Podium with two rows of sail-shaped shells, tallest first.
      const along = Math.max(w, d);
      const across = Math.min(w, d);
      box(0, 0, w, d, 3, 0, true, M.masonry, g);
      for (const row of [-1, 1]) {
        for (let i = 0; i < 3; i++) {
          const r = (l.h - 3) * (0.62 - i * 0.14);
          const shell = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 12, 0, Math.PI, 0, Math.PI / 2), M.shell);
          shell.scale.set(r * 0.55, r * 1.55, r * 0.9);
          const off = -along * 0.3 + i * along * 0.22;
          const side = row * across * 0.22;
          shell.position.copy(long ? v3(off, side, 3) : v3(side, off, 3));
          shell.rotation.y = long ? -Math.PI / 2 : 0;
          shade(shell);
          g.add(shell);
        }
      }
    } else if (l.kind === 'great_wall') {
      // A long ridge with the wall and watchtowers following its crest.
      const along = Math.max(w, d);
      const across = Math.min(w, d);
      const ridgeH = l.h * 0.55;
      const ridge = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 12, 0, Math.PI * 2, 0, Math.PI / 2), M.hill);
      ridge.scale.set(long ? along / 2 : across, ridgeH, long ? across : along / 2);
      shade(ridge);
      g.add(ridge);
      const crest = (u: number) => ridgeH * Math.sqrt(Math.max(0, 1 - (u / (along / 2)) ** 2));
      const seg = 14;
      for (let u = -along / 2 + seg; u < along / 2 - seg / 2; u += seg) {
        const a = v3(long ? u - seg / 2 : 0, long ? Math.sin(u / 23) * 3 : u - seg / 2, crest(u - seg / 2) + 2.5);
        const b = v3(long ? u + seg / 2 : Math.sin((u + seg) / 23) * 3, long ? Math.sin((u + seg) / 23) * 3 : u + seg / 2, crest(u + seg / 2) + 2.5);
        strut(g, a, b, 2.2, M.masonry);
        if (Math.round(u / seg) % 3 === 0) {
          const tw = new THREE.Group();
          tw.position.copy(v3(long ? u : 0, long ? Math.sin(u / 23) * 3 : u, crest(u) - 1));
          box(0, 0, 6, 6, 8, 0, true, M.masonry, tw);
          g.add(tw);
        }
      }
    } else if (l.kind === 'dome') {
      // Base hall, drum, dome and lantern.
      const s0 = Math.min(w, d);
      box(0, 0, s0 * 0.9, s0 * 0.9, l.h * 0.28, 0, true, M.building, g);
      cylinder(g, s0 * 0.3, s0 * 0.3, l.h * 0.2, l.h * 0.28, M.building, 32);
      const cap = new THREE.Mesh(new THREE.SphereGeometry(s0 * 0.31, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), M.buildingBlue);
      cap.scale.y = 1.15;
      cap.position.y = l.h * 0.48;
      shade(cap);
      g.add(cap);
      cylinder(g, s0 * 0.05, s0 * 0.04, l.h * 0.12, l.h * 0.48 + s0 * 0.31 * 1.15 - 0.5, M.building, 12);
    } else if (l.kind === 'suspension_bridge') {
      // Water under the span, two towers, the deck, two main cables and hangers.
      const span = Math.max(w, d);
      const deckW = Math.min(w, d);
      const deckH = l.h * 0.32;
      const towerX = span * 0.3;
      const at = (u: number, v: number, h: number) => (long ? v3(u, v, h) : v3(v, u, h));
      box(0, 0, long ? span + 30 : 70, long ? 70 : span + 30, 0.05, 0.01, false, M.water, g);
      box(0, 0, long ? span : deckW, long ? deckW : span, 1.4, deckH, true, M.torii, g);
      for (const sx of [-1, 1]) {
        for (const sy of [-1, 1]) strut(g, at(sx * towerX, (sy * deckW) / 2, 0), at(sx * towerX, (sy * deckW) / 2, l.h), 1.3, M.torii);
        for (const hh of [deckH + 4, l.h * 0.7, l.h - 2]) strut(g, at(sx * towerX, -deckW / 2, hh), at(sx * towerX, deckW / 2, hh), 0.8, M.torii);
      }
      const cable = (u: number) => {
        const a = Math.abs(u);
        if (a <= towerX) return deckH + 3 + (l.h - deckH - 3) * (u / towerX) ** 2;
        return l.h - ((a - towerX) / (span / 2 - towerX)) * (l.h - deckH - 1);
      };
      for (const sy of [-1, 1]) {
        const pts: THREE.Vector3[] = [];
        for (let u = -span / 2; u <= span / 2 + 0.01; u += span / 60) pts.push(at(u, (sy * deckW) / 2, cable(u)));
        g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), wireMat));
        for (let u = -towerX + 6; u < towerX; u += 8) {
          g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([at(u, (sy * deckW) / 2, deckH + 1.4), at(u, (sy * deckW) / 2, cable(u))]), wireMat));
        }
      }
    }
  };

  /**
   * Hollow ground floor of a building with an interior: walls (door gap and a glass band in the front),
   * a floor and the furniture; the storeys above stay solid. Local coordinates of the building group `g`.
   */
  const drawInterior = (g: THREE.Group, b: PrevisWorld['buildings'][number], layout: PrevisInteriorLayout, wall: THREE.Material): Box2[] => {
    const walls: Box2[] = [];
    const H = Math.min(PREVIS_INTERIOR_HEIGHT_M, b.h);
    const t = PREVIS_INTERIOR_WALL_M;
    const { anchor, spec } = layout;
    const local = (x: number, y: number) => {
      const p = previsStageToWorld(anchor, x, y);
      return { x: p.x - b.x, y: p.y - b.y };
    };
    const turned = anchor.headingDeg === 90 || anchor.headingDeg === 270;
    // Stage-aligned box inside the building (x across the facade, y into the building).
    const stageBox = (x: number, y: number, w: number, d: number, h: number, y0: number, material: THREE.Material, shadow = true, solid = false) => {
      const c = local(x, y);
      box(c.x, c.y, turned ? d : w, turned ? w : d, h, y0, shadow, material, g);
      if (solid) walls.push({ x: b.x + c.x, y: b.y + c.y, w: turned ? d : w, d: turned ? w : d });
    };
    const hw = spec.widthM / 2 + t / 2;
    const hd = spec.depthM / 2 + t / 2;
    stageBox(0, hd, spec.widthM + 2 * t, t, H, 0, wall, true, true);
    stageBox(-hw, 0, t, spec.depthM, H, 0, wall, true, true);
    stageBox(hw, 0, t, spec.depthM, H, 0, wall, true, true);
    // Front wall: a door gap, a sill and a glass band you can look through, a solid lintel band above.
    const door = spec.doorX ?? 0;
    const gap = 1.6;
    const left = door - gap / 2 + spec.widthM / 2;
    const right = spec.widthM / 2 - (door + gap / 2);
    for (const [cx, w] of [
      [-spec.widthM / 2 + left / 2, left],
      [door + gap / 2 + right / 2, right],
    ] as Array<[number, number]>) {
      if (w < 0.2) continue;
      stageBox(cx, -hd, w, t, 0.9, 0, wall, true, true);
      stageBox(cx, -hd, w, t * 0.4, Math.max(0.2, Math.min(2.6, H) - 0.9), 0.9, M.windowGlass, false);
    }
    stageBox(0, -hd, spec.widthM + 2 * t, t, Math.max(0.2, H - 2.6), 2.6, wall);
    stageBox(0, 0, spec.widthM, spec.depthM, 0.03, 0, M.sidewalk, false);
    // Ceiling, then the storeys above.
    stageBox(0, 0, spec.widthM + 2 * t, spec.depthM + 2 * t, 0.2, H - 0.2, wall);
    // Furniture as recognisable pieces (a chair has a seat and a back), turned with the room's stage.
    const furniture = new THREE.Group();
    const origin = local(0, 0);
    furniture.position.set(origin.x, 0, -origin.y);
    furniture.rotation.y = (anchor.headingDeg * Math.PI) / 180;
    for (const p of layout.props) {
      if (p.kind === 'door' || p.kind === 'window') continue;
      const piece = buildPrevisPropShape({ ...p, h: Math.max(0.2, p.h) });
      piece.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        (m.material as THREE.Material).dispose();
        m.material = M.building;
        m.castShadow = true;
        m.receiveShadow = true;
      });
      furniture.add(piece);
    }
    g.add(furniture);
    return walls;
  };

  /**
   * No visible end of the map: ground to the horizon (fog into the sky), streets and water running on, sparse
   * outskirts (a far skyline for tower districts) and a ring of mesas / hills. Drawn only: no collisions or picks,
   * marked `sky` so ASCII / thumbnail renders keep the centre block.
   */
  const drawHorizon = (w: PrevisWorld, ref: PrevisWorldRef | undefined, roadMat: THREE.Material) => {
    const [EW, ED] = w.extentM;
    const E = Math.max(EW, ED);
    const far = (m: THREE.Object3D) => {
      m.userData.sky = true;
      scene.add(m);
      return m;
    };
    const flat = !slope && !hills;
    const low = flat ? 0 : Math.min(groundAt(-E), groundAt(E)) - 0.5;
    if (scene.fog instanceof THREE.Fog) {
      scene.fog.near = Math.max(scene.fog.near, E * 0.7);
      scene.fog.far = Math.max(scene.fog.far, E * 3);
    }
    const plane = new THREE.Mesh(new THREE.CircleGeometry(4000, 72), M.ground);
    plane.rotation.x = -Math.PI / 2;
    plane.position.y = low - 0.06;
    plane.receiveShadow = true;
    far(plane);
    const slab = (x: number, y: number, bw: number, bd: number, y0: number, m: THREE.Material) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(bw, 0.02, bd), m);
      mesh.position.copy(v3(x, y, y0));
      mesh.receiveShadow = true;
      return far(mesh);
    };
    // Streets and water that reach the edge run on; by the sea, everything south of the shore is water.
    const RUN = 1500;
    const sea = ref?.water?.kind === 'waterfront' ? (w.water ?? []).reduce((top, b) => Math.max(top, b.y + b.d / 2), -Infinity) : null;
    if (sea !== null && Number.isFinite(sea)) {
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(RUN * 2, RUN), M.water);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.copy(v3(0, sea - RUN / 2 - 0.4, low + 0.001));
      far(mesh);
    }
    if (flat) {
      for (const [boxes, m, y0] of [
        [w.roads, roadMat, 0.005],
        [w.water ?? [], M.water, 0.003],
      ] as const) {
        for (const b of boxes) {
          if (b.x - b.w / 2 <= -EW / 2 + 0.5) slab(-EW / 2 - RUN / 2, b.y, RUN, b.d, y0, m);
          if (b.x + b.w / 2 >= EW / 2 - 0.5) slab(EW / 2 + RUN / 2, b.y, RUN, b.d, y0, m);
          if (b.y - b.d / 2 <= -ED / 2 + 0.5) slab(b.x, -ED / 2 - RUN / 2, b.w, RUN, y0, m);
          if (b.y + b.d / 2 >= ED / 2 - 0.5) slab(b.x, ED / 2 + RUN / 2, b.w, RUN, y0, m);
        }
      }
    }
    let seed = ((ref?.seed ?? 1) * 2654435761) >>> 0 || 1;
    const rnd = () => {
      seed = (seed + 0x6d2b79f5) >>> 0;
      let t = seed;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const towers = theme === 'cyberpunk' || theme === 'future' || (w.buildings.reduce((m, b) => Math.max(m, b.h), 0) > 40 && theme !== 'mars');
    const busy = [...w.roads, ...(w.water ?? []), ...(w.approaches ?? []), ...(w.landmarks ?? [])];
    /** Not on a street / water / landmark, nor on the strip where one that reaches the edge runs on. */
    const clear = (x: number, y: number, m: number) =>
      !(sea !== null && y < sea + m) &&
      !busy.some((b) => {
        if (Math.abs(x - b.x) <= b.w / 2 + m && Math.abs(y - b.y) <= b.d / 2 + m) return true;
        const pastX = Math.abs(x) > EW / 2 && Math.sign(x) * b.x + b.w / 2 >= EW / 2 - 0.5;
        if (pastX && Math.abs(y - b.y) <= b.d / 2 + m) return true;
        const pastY = Math.abs(y) > ED / 2 && Math.sign(y) * b.y + b.d / 2 >= ED / 2 - 0.5;
        return pastY && Math.abs(x - b.x) <= b.w / 2 + m;
      });
    const shades = wallShades.plain.concat(wallShades.blue, wallShades.warm);
    // Outskirts: thinning out with distance.
    for (let i = 0; i < (towers ? 70 : 260); i++) {
      const a = rnd() * Math.PI * 2;
      const dist = E / 2 + 6 + Math.pow(rnd(), 1.5) * E * 0.9;
      const x = Math.cos(a) * dist;
      const y = Math.sin(a) * dist;
      if (Math.abs(x) < EW / 2 + 5 && Math.abs(y) < ED / 2 + 5) continue;
      if (rnd() > 1 - (dist - E / 2) / (E * 1.05)) continue;
      if (!clear(x, y, 8)) continue;
      const g0 = flat ? 0 : groundAt(x) - 0.3;
      if (theme === 'mars') {
        const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(0.6 + rnd() * 2.4, 0), M.ground);
        rock.position.copy(v3(x, y, g0 + 0.4));
        rock.rotation.set(rnd() * 3, rnd() * 3, 0);
        far(rock);
        continue;
      }
      const bw = 6 + rnd() * 8;
      const bd = 6 + rnd() * 7;
      // Tower districts thin out into low blocks; their skyline stands further out (the ring below).
      const h = towers ? 6 + rnd() * rnd() * 34 : 3 + rnd() * 6;
      const m = new THREE.Mesh(theme === 'future' ? new THREE.CylinderGeometry(bw * 0.3, bw * 0.38, h, 16) : new THREE.BoxGeometry(bw, h, bd), shades[Math.floor(rnd() * shades.length)]);
      m.position.copy(v3(x, y, g0 + h / 2));
      m.rotation.y = theme === 'future' ? 0 : Math.round(rnd()) * (Math.PI / 2) + (rnd() - 0.5) * 0.1;
      m.castShadow = dist < E;
      m.receiveShadow = true;
      far(m);
    }
    // A far ring: a skyline for tower districts, otherwise mesas (desert / Mars) or rounded hills.
    const ringMat = new THREE.MeshStandardMaterial({ color: `#${new THREE.Color(M.ground.color).multiplyScalar(0.92).getHexString()}`, roughness: 1, flatShading: true });
    horizonMats.push(ringMat);
    const mesas = theme === 'mars' || w.look?.roadSurface === 'dirt';
    for (let i = 0; i < (towers ? 46 : 14); i++) {
      const a = (i / (towers ? 46 : 14)) * Math.PI * 2 + rnd() * 0.3;
      const dist = E * (towers ? 1.45 : 1.15) + rnd() * E * (towers ? 1.2 : 1.3);
      const x = Math.cos(a) * dist;
      const y = Math.sin(a) * dist;
      if (!clear(x, y, 30)) continue;
      let m: THREE.Mesh;
      if (towers) {
        const h = 40 + rnd() * 140;
        m = new THREE.Mesh(new THREE.BoxGeometry(10 + rnd() * 16, h, 10 + rnd() * 16), shades[Math.floor(rnd() * shades.length)]);
        m.position.copy(v3(x, y, low + h / 2));
      } else if (mesas) {
        const r = 35 + rnd() * 75;
        const h = 18 + rnd() * 45;
        m = new THREE.Mesh(new THREE.CylinderGeometry(r * (0.55 + rnd() * 0.2), r, h, 7), ringMat);
        m.position.copy(v3(x, y, low + h / 2));
        m.rotation.y = rnd() * 3;
      } else {
        const r = 60 + rnd() * 120;
        m = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), ringMat);
        m.scale.y = 0.18 + rnd() * 0.2;
        m.position.copy(v3(x, y, low));
      }
      m.receiveShadow = true;
      far(m);
    }
  };

  /** The generated world last drawn (seats in its building interiors). */
  let drawnWorld: PrevisWorld | null = null;
  const drawWorld = (w: PrevisWorld, ref?: PrevisWorldRef) => {
    drawnWorld = w;
    const interiors = new Map((ref ? previsInteriorLayouts(ref, w) : []).map((l) => [l.building.id, l]));
    const styled = !!w.look;
    const [EW, ED] = w.extentM;
    extentM = [EW, ED];
    const roadMat = w.look?.roadSurface === 'dirt' ? M.dirt : w.look?.roadSurface === 'stone' ? M.stone : M.road;
    // Ground reaches past landmarks standing beyond the blocks.
    let gw = EW + 10;
    let gd = ED + 10;
    for (const l of w.landmarks ?? []) {
      gw = Math.max(gw, 2 * (Math.abs(l.x) + l.w / 2 + 25));
      gd = Math.max(gd, 2 * (Math.abs(l.y) + l.d / 2 + 25));
    }
    if (theme) {
      themed = createWorld3dTheme({
        theme,
        seed: ref?.seed ?? 1,
        anchored,
        scene,
        shadowed: (m) => {
          m.castShadow = true;
          m.receiveShadow = true;
          return m;
        },
        grow: (obj, x, y, mode) => growables.push({ obj, start: growStart(x, y) + (mode === 'pop' ? 0.05 : 0), mode }),
      });
    }
    if (!themed?.hidesGround) box(0, 0, gw, gd, 0.02, -0.02, false, M.ground);
    const street = (m: THREE.Mesh) => {
      m.userData.pick = { kind: 'street', id: 'street', sub: 'street', x: 0, y: 0 } satisfies World3dPickInfo;
    };
    for (const r of w.roads) street(box(r.x, r.y, r.w, r.d, 0.01, 0, false, roadMat));
    // Water lies just above the ground (roads and blocks were cut away there); bridges and railings over it.
    for (const p of w.water ?? []) street(box(p.x, p.y, p.w, p.d, 0.006, 0.002, false, M.water));
    for (const b of w.bridges ?? []) {
      const along = b.d >= b.w ? 'y' : 'x';
      if (b.foot) {
        // Footbridge: a raised deck with ramps at both ends.
        const g = anchored(b.x, b.y);
        const len = along === 'y' ? b.d : b.w;
        const deck = len * 0.5;
        box(0, 0, along === 'y' ? b.w : deck, along === 'y' ? deck : b.d, 0.25, 0.9, true, M.sidewalk, g);
        for (const s of [-1, 1]) {
          const ramp = new THREE.Mesh(new THREE.BoxGeometry(along === 'y' ? b.w : len * 0.3, 0.25, along === 'y' ? len * 0.3 : b.d), M.sidewalk);
          const off = s * (deck / 2 + len * 0.13);
          ramp.position.copy(along === 'y' ? v3(0, off, 0.55) : v3(off, 0, 0.55));
          const tilt = Math.atan2(0.9, len * 0.3) * s;
          if (along === 'y') ramp.rotation.x = tilt;
          else ramp.rotation.z = -tilt;
          ramp.castShadow = true;
          ramp.receiveShadow = true;
          g.add(ramp);
        }
        for (const s of [-1, 1]) box(along === 'y' ? s * (b.w / 2 - 0.05) : 0, along === 'y' ? 0 : s * (b.d / 2 - 0.05), along === 'y' ? 0.1 : deck, along === 'y' ? deck : 0.1, 0.9, 1.15, true, M.metal, g);
      } else {
        street(box(b.x, b.y, b.w, b.d, 0.012, 0.004, true, M.sidewalk));
      }
    }
    for (const q of w.quays ?? []) if (!q.foot) box(q.x, q.y, q.w, q.d, 1.05, 0, true, M.metal);
    for (const r of w.approaches ?? []) street(box(r.x, r.y, r.w, r.d, 0.012, 0, false, roadMat));
    // Paths up a hill: a strip following the hill surface (half ellipsoid) from its foot to the landmark.
    for (const c of w.climbs ?? []) {
      const n = 32;
      const ax = c.hill.w / 2;
      const ay = c.hill.d / 2;
      const surface = (x: number, y: number) => {
        const u = 1 - ((x - c.hill.x) / ax) ** 2 - ((y - c.hill.y) / ay) ** 2;
        return c.hill.h * Math.sqrt(Math.max(0, u)) + 0.08;
      };
      const dx = c.to.x - c.from.x;
      const dy = c.to.y - c.from.y;
      const len = Math.hypot(dx, dy) || 1;
      const px = (-dy / len) * (c.w / 2);
      const py = (dx / len) * (c.w / 2);
      const pos: number[] = [];
      for (let i = 0; i <= n; i++) {
        const x = c.from.x + (dx * i) / n;
        const y = c.from.y + (dy * i) / n;
        const h = surface(x, y);
        pos.push(x - px, h, -(y - py), x + px, h, -(y + py));
      }
      const idx: number[] = [];
      for (let i = 0; i < n; i++) {
        const a0 = i * 2;
        idx.push(a0, a0 + 1, a0 + 2, a0 + 1, a0 + 3, a0 + 2);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      const path = new THREE.Mesh(geo, roadMat);
      path.material.side = THREE.DoubleSide;
      path.receiveShadow = true;
      // On a slope the hill (and its path) stands at the ground height of its centre.
      if (slope || hills) path.position.y = groundUnder(c.hill.x, c.hill.w / 2);
      worldGroup.add(path);
    }
    for (const o of w.openSpaces) box(o.x, o.y, o.w, o.d, 0.04, 0, false, o.kind === 'park' ? M.park : M.sidewalk);
    for (const s of w.sidewalks) street(box(s.x, s.y, s.w, s.d, 0.15, 0, false, M.sidewalk));
    if (styled) for (const c of w.crosswalks) box(c.x, c.y, c.w, c.d, 0.012, 0.01, false, M.sidewalk);
    const growStart = (x: number, y: number) => {
      const dx = x - stageCenter.x;
      const dy = y - stageCenter.y;
      const far = Math.hypot(EW, ED) / 2;
      return 0.08 + 0.72 * Math.min(1, Math.sqrt(dx * dx + dy * dy) / far);
    };
    maxHeightM = w.buildings.reduce((m, b) => Math.max(m, b.h), 0);
    // High-rise districts: keep the far blocks out of the fog when seen from the raised overview.
    if (maxHeightM > 40 && scene.fog instanceof THREE.Fog) {
      scene.fog.near += maxHeightM;
      scene.fog.far += maxHeightM * 2;
    }
    for (const b of w.buildings) {
      const g = anchored(b.x, b.y, b.w / 2);
      g.userData.pick = { kind: 'building', id: b.id, sub: b.kind, x: b.x, y: b.y } satisfies World3dPickInfo;
      const wall = wallMaterial(b, styled);
      const lower = b.setback ? b.setback.h : b.h;
      const interior = interiors.get(b.id);
      const H = Math.min(PREVIS_INTERIOR_HEIGHT_M, b.h);
      let interiorWalls: Box2[] | null = null;
      // Themed worlds draw the building in the theme's shape (interiors keep the plain block).
      const themedShape = !!themed && !interior;
      if (themedShape) themed!.building(g, b);
      else if (interior) {
        // Ground floor hollow; the rest of the lower block solid above it.
        interiorWalls = drawInterior(g, b, interior, wall);
        if (lower > H) box(0, 0, b.w, b.d, lower - H, H, true, wall, g);
      } else box(0, 0, b.w, b.d, lower, 0, true, wall, g);
      if (b.setback && !themedShape) box(0, 0, b.w - 2 * b.setback.inset, b.d - 2 * b.setback.inset, b.h - lower, lower, true, wall, g);
      if (!themedShape) for (const u of b.roofUnits) box(u.x - b.x, u.y - b.y, u.w, u.d, 1.4, b.h, true, M.metal, g);
      if (b.roof && !themedShape) {
        const along = b.roof.ridge === 'x';
        const rw = (along ? b.w : b.d) + 2 * b.roof.eave;
        const rd = (along ? b.d : b.w) + 2 * b.roof.eave;
        const roof = new THREE.Mesh(roofGeometry(b.roof.kind, rw, rd, b.roof.h), M.roof);
        roof.position.y = b.h;
        if (!along) roof.rotation.y = Math.PI / 2;
        roof.castShadow = true;
        roof.receiveShadow = true;
        g.add(roof);
      }
      if (interiorWalls) {
        // The camera can walk in through the door: walls on the ground floor, solid above the ceiling.
        for (const wb of interiorWalls) solids.push({ ...wb, h: H, base: g.position.y });
        solids.push({ x: b.x, y: b.y, w: b.w, d: b.d, h: b.h + (b.roof?.h ?? 0) - H + 0.2, base: g.position.y + H - 0.2 });
      } else solids.push({ x: b.x, y: b.y, w: b.w, d: b.d, h: b.h + (b.roof?.h ?? 0), base: g.position.y });
      if (b.kind === 'storefront' && w.look?.shopFront !== 'none' && !interior && !themedShape) {
        const ew = b.front === 'e' || b.front === 'w';
        const fx = b.front === 'e' ? 1 : b.front === 'w' ? -1 : 0;
        const fy = b.front === 'n' ? 1 : b.front === 's' ? -1 : 0;
        const span = (ew ? b.d : b.w) - 1.2;
        const open = w.look?.shopFront === 'open';
        const band = open ? Math.min(2.4, b.h - 0.6) : 3;
        box(fx * (b.w / 2 + 0.04), fy * (b.d / 2 + 0.04), ew ? 0.08 : span, ew ? span : 0.08, band, open ? 0.2 : 0.4, false, open ? M.shopOpen : M.glass, g);
        if (neon) {
          // A glowing sign over the shop and, on taller blocks, a vertical sign at the corner.
          box(fx * (b.w / 2 + 0.18), fy * (b.d / 2 + 0.18), ew ? 0.12 : span * 0.62, ew ? span * 0.62 : 0.12, 0.7, band + 0.75, false, neonFor(b.id), g);
          if (b.h > 9) {
            const cx = ew ? fx * (b.w / 2 + 0.5) : span / 2 - 0.3;
            const cy = ew ? span / 2 - 0.3 : fy * (b.d / 2 + 0.5);
            box(cx, cy, ew ? 0.9 : 0.16, ew ? 0.16 : 0.9, Math.min(7, b.h * 0.45), band + 2, false, neonFor(`${b.id}v`), g);
          }
        }
      }
      growables.push({ obj: g, start: growStart(b.x, b.y), mode: 'rise' });
    }
    for (const l of w.landmarks ?? []) {
      const g = anchored(l.x, l.y, l.w / 2);
      g.userData.pick = { kind: 'landmark', id: l.id, sub: l.kind, x: l.x, y: l.y } satisfies World3dPickInfo;
      drawLandmark(g, l);
      if (l.elev) g.position.y += l.elev;
      solids.push({ x: l.x, y: l.y, w: l.w, d: l.d, h: l.h, base: g.position.y });
      growables.push({ obj: g, start: l.far ? 0.72 : growStart(l.x, l.y), mode: 'rise' });
    }
    const poles = new Map<string, Array<{ x: number; y: number; start: number }>>();
    // Static street cars in the way of a planned car / van / bus are left out (it drives and stops there).
    const driven: Array<{ x: number; y: number }> = [];
    const anchor = plan?.set?.world?.stageAnchor;
    if (plan && anchor) {
      for (const v of plan.vehicles ?? []) {
        if (v.kind !== 'car' && v.kind !== 'van' && v.kind !== 'bus') continue;
        for (let t = 0; t <= plan.durationSec; t += 0.1) {
          const p = samplePrevisVehicle(v, t);
          driven.push(previsStageToWorld(anchor, p.x, p.y));
        }
        for (const k of v.path) driven.push(previsStageToWorld(anchor, k.x, k.y));
      }
    }
    for (const prop of w.props) {
      if (prop.kind === 'car' && driven.some((p) => Math.hypot(p.x - prop.x, p.y - prop.y) < 3.4)) continue;
      const g = anchored(prop.x, prop.y);
      g.userData.pick = { kind: 'prop', id: prop.id, sub: prop.kind, x: prop.x, y: prop.y } satisfies World3dPickInfo;
      const turned = prop.rotDeg === 90 || prop.rotDeg === 270;
      if (prop.kind === 'tree') {
        box(0, 0, 0.3, 0.3, 2.6, 0.15, true, M.trunk, g);
        const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(1.8, 1), M.plant);
        crown.position.y = 4;
        crown.castShadow = true;
        crown.receiveShadow = true;
        g.add(crown);
      } else if (prop.kind === 'lamp') {
        box(0, 0, 0.18, 0.18, 6, 0.15, true, M.metal, g);
        box(0, 0, 0.5, 0.5, 0.25, 6.05, false, M.paper, g);
      }
      else if (prop.kind === 'car') {
        box(0, 0, turned ? 4.3 : 1.8, turned ? 1.8 : 4.3, 0.75, 0.3, true, M.car, g);
        box(0, 0, turned ? 2.2 : 1.6, turned ? 1.6 : 2.2, 0.6, 1.05, true, M.car, g);
      } else if (prop.kind === 'bench') box(0, 0, 1.8, 0.5, 0.45, 0.15, true, M.metal, g);
      else if (prop.kind === 'bus_stop') {
        box(0, 0, 4.2, 1.6, 0.12, 2.6, true, M.metal, g);
        box(0, -0.75, 4.2, 0.06, 2.4, 0.15, true, M.glass, g);
      } else if (prop.kind === 'utility_pole') {
        box(0, 0, 0.26, 0.26, 8.5, 0, true, M.metal, g);
        box(0, 0, turned ? 0.12 : 1.6, turned ? 1.6 : 0.12, 0.12, 7.8, true, M.metal, g);
        const list = poles.get(prop.line ?? prop.id) ?? [];
        list.push({ x: prop.x, y: prop.y, start: growStart(prop.x, prop.y) });
        poles.set(prop.line ?? prop.id, list);
      } else if (prop.kind === 'lantern') {
        const lantern = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.55, 12), M.paper);
        lantern.position.y = 2.15;
        lantern.castShadow = true;
        g.add(lantern);
      } else if (prop.kind === 'vending_machine') box(0, 0, turned ? 0.8 : 1, turned ? 1 : 0.8, 1.85, 0.05, true, M.buildingBlue, g);
      else if (prop.kind === 'planter') {
        box(0, 0, 0.7, 0.5, 0.45, 0.05, true, M.metal, g);
        const leaves = new THREE.Mesh(new THREE.IcosahedronGeometry(0.38, 0), M.plant);
        leaves.position.y = 0.75;
        leaves.castShadow = true;
        g.add(leaves);
      } else if (prop.kind === 'barrel') {
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.27, 0.85, 14), M.shopOpen);
        barrel.position.y = 0.43;
        barrel.castShadow = true;
        g.add(barrel);
      }
      growables.push({ obj: g, start: growStart(prop.x, prop.y) + 0.05, mode: 'pop' });
    }
    themed?.decor(w);
    if (theme !== 'orbital') drawHorizon(w, ref, roadMat);
    // Overhead wires between consecutive poles on the same line (two sagging strands).
    for (const list of poles.values()) {
      for (let i = 1; i < list.length; i++) {
        const a = list[i - 1];
        const b = list[i];
        if (Math.hypot(b.x - a.x, b.y - a.y) > 40) continue;
        for (const off of [-0.6, 0.6]) {
          const pts: THREE.Vector3[] = [];
          for (let k = 0; k <= 8; k++) {
            const t = k / 8;
            const sag = 0.45 * 4 * t * (1 - t);
            const ox = a.x === b.x ? off : 0;
            const oy = a.x === b.x ? 0 : off;
            pts.push(v3(a.x + (b.x - a.x) * t + ox, a.y + (b.y - a.y) * t + oy, 7.85 - sag));
          }
          const wire = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), wireMat);
          strips.add(wire);
          growables.push({ obj: wire, start: Math.max(a.start, b.start) + 0.15, mode: 'pop' });
        }
      }
    }
  };

  let world = false;
  const worldRef = plan ? plan.set?.world : (source as { world: PrevisWorldRef }).world;
  if (worldRef) {
    try {
      const ref = normalizePrevisWorldRef(worldRef);
      const w = generatePrevisWorld(ref);
      if (plan) {
        const a = ref.stageAnchor;
        heading = (a.headingDeg * Math.PI) / 180;
        stageCenter = { x: a.x, y: a.y };
        stageToWorld = (x, y, h = 0) => {
          const p = previsStageToWorld(a, x, y);
          return v3(p.x, p.y, h + groundAt(p.x));
        };
        worldToStage = (x, y) => previsWorldToStage(a, x, y);
      }
      drawWorld(w, ref);
      if (plan) {
        const a = ref.stageAnchor;
        const swap = a.headingDeg === 90 || a.headingDeg === 270;
        // Interiors: the doorway is the gap the world draws in the facade (no door leaf in it).
        const doors = plan.set?.kind === 'indoor' ? [] : plan.props.filter((x) => x.fixed && x.kind === 'door' && !x.id.startsWith('opening_'));
        for (const d of doors) {
          const p = previsStageToWorld(a, d.x, d.y);
          box(p.x, p.y, swap ? d.d : 0.12, swap ? 0.12 : d.d, 2.4, 0.15, true, M.metal);
        }
        for (const sp of plan.props.filter((x) => !x.fixed)) {
          const p = previsStageToWorld(a, sp.x, sp.y);
          box(p.x, p.y, swap ? sp.d : sp.w, swap ? sp.w : sp.d, Math.max(0.2, sp.h), 0.15);
        }
        lightFor(a.x, a.y, Math.max(...w.extentM));
      } else {
        lightFor(0, 0, Math.max(...w.extentM));
      }
      drapeStrips();
      world = true;
    } catch (e) {
      if (import.meta.env.DEV) console.error('[buildWorld3dContent] world build failed', e);
      worldGroup.clear();
      growables.length = 0;
      solids.length = 0;
      world = false;
    }
  }
  if (!world && plan) {
    heading = 0;
    stageCenter = { x: 0, y: 0 };
    stageToWorld = (x, y, h = 0) => v3(x, y, h);
    const { width, depth } = plan.stage;
    extentM = [Math.max(60, width * 3), Math.max(60, depth * 3)];
    box(0, 0, extentM[0], extentM[1], 0.02, -0.02, false, M.ground);
    const set = new THREE.Group();
    buildPrevisSet(set as unknown as THREE.Scene, plan);
    set.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      (m.material as THREE.Material).dispose?.();
      m.material = M.building;
      m.castShadow = true;
      m.receiveShadow = true;
    });
    worldGroup.add(set);
    lightFor(0, 0, Math.max(width, depth) * 2);
  }

  const figures: THREE.Group[] = [];
  const figureById = new Map<string, THREE.Group>();
  const vehicleParts: Array<{ v: NonNullable<PrevisPlan['vehicles']>[number]; g: THREE.Group; headingAt: (t: number) => number; rotor: THREE.Object3D | null }> = [];
  if (plan) {
    // Overlays: stage outline + paths.
    const hw = plan.stage.width / 2;
    const hd = plan.stage.depth / 2;
    const outline = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd], [-hw, -hd]].map(([x, y]) => stageToWorld(x, y, 0.22))),
      new THREE.LineDashedMaterial({ color: DS3D_PRIMARY, dashSize: 0.8, gapSize: 0.45, depthTest: false }),
    );
    outline.computeLineDistances();
    outline.renderOrder = 10;
    scene.add(outline);
    overlays.push(outline);

    for (const c of plan.characters) {
      const hex = ds3dFigureHex(c.color);
      const g = buildWorld3dFigure(hex);
      g.userData.pick = { kind: 'character', id: c.id, sub: 'character', x: 0, y: 0 } satisfies World3dPickInfo;
      scene.add(g);
      figures.push(g);
      figureById.set(c.id, g);
      if (c.path.length > 1) {
        const line = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(previsPathLine(c, smooth).map((k) => stageToWorld(k.x, k.y, 0.24))),
          new THREE.LineBasicMaterial({ color: hex, depthTest: false }),
        );
        line.renderOrder = 11;
        scene.add(line);
        overlays.push(line);
      }
    }
    for (const v of plan.vehicles ?? []) {
      const hex = ds3dFigureHex(v.color ?? 'gray');
      const g = buildWorld3dVehicle(v.kind, hex);
      scene.add(g);
      vehicleParts.push({ v, g, headingAt: world3dVehicleHeadings(v, plan.durationSec), rotor: g.getObjectByName('rotor') ?? null });
      if (v.path.length > 1) {
        const line = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(v.path.map((k) => stageToWorld(k.x, k.y, 0.24 + (k.alt ?? 0)))),
          new THREE.LineDashedMaterial({ color: hex, dashSize: 0.6, gapSize: 0.4, depthTest: false }),
        );
        line.computeLineDistances();
        line.renderOrder = 11;
        scene.add(line);
        overlays.push(line);
      }
    }
  }

  // Planned camera as a small body + frustum, picked and dragged like a character.
  let cameraGizmo: THREE.Group | null = null;
  const gizmoCam = new THREE.PerspectiveCamera(40, 16 / 9, 0.3, 3.2);
  let gizmoHelper: THREE.CameraHelper | null = null;
  let aimHandle: THREE.Mesh | null = null;
  // No gizmo once the camera was deleted (no keys).
  if (plan && plan.camera.keys.length > 0) {
    cameraGizmo = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.34, 0.6), new THREE.MeshStandardMaterial({ color: '#2a2d33', roughness: 0.6 }));
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.22, 16), new THREE.MeshStandardMaterial({ color: '#1d1f24', roughness: 0.4 }));
    lens.rotation.x = Math.PI / 2;
    lens.position.z = -0.4;
    body.castShadow = true;
    cameraGizmo.add(body, lens);
    cameraGizmo.userData.pick = { kind: 'camera', id: 'camera', sub: 'camera', x: 0, y: 0 } satisfies World3dPickInfo;
    scene.add(cameraGizmo);
    // Hidden with the other overlays when recording / looking through the shot camera.
    overlays.push(cameraGizmo);
    gizmoHelper = new THREE.CameraHelper(gizmoCam);
    const lime = new THREE.Color(DS3D_PRIMARY);
    gizmoHelper.setColors(lime, lime, lime, lime, lime);
    (gizmoHelper.material as THREE.LineBasicMaterial).depthTest = false;
    gizmoHelper.renderOrder = 12;
    scene.add(gizmoHelper);
    overlays.push(gizmoHelper);
    // The frustum's far frame: dragging it aims the selected camera (see World3dContent.aimHandle).
    aimHandle = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ color: lime, transparent: true, opacity: 0, depthTest: false, depthWrite: false, side: THREE.DoubleSide }),
    );
    aimHandle.renderOrder = 12;
    aimHandle.visible = false;
    scene.add(aimHandle);
    overlays.push(aimHandle);
    // The planned camera's parts (hidden while recording with the free camera).
    for (const o of [cameraGizmo, gizmoHelper, aimHandle]) o.userData.plannedCamera = true;
  }
  let live: World3dLive | null = null;
  let lastT = 0;

  /** Point a camera from a stage position along yaw / pitch (degrees). */
  const aimFrom = (camera: THREE.PerspectiveCamera, x: number, y: number, h: number, yaw: number, pitch: number) => {
    const yr = (yaw * Math.PI) / 180;
    const pr = (pitch * Math.PI) / 180;
    camera.position.copy(stageToWorld(x, y, h + 0.15));
    camera.lookAt(stageToWorld(x + Math.sin(yr) * Math.cos(pr) * 8, y + Math.cos(yr) * Math.cos(pr) * 8, h + 0.15 + Math.sin(pr) * 8));
  };
  const aimShot = (camera: THREE.PerspectiveCamera, t: number) => {
    if (!plan) return;
    const s = samplePrevisCamera(plan, t);
    camera.fov = s.fovDeg;
    if (live?.kind === 'camera') aimFrom(camera, live.x, live.y, live.h, live.yaw, live.pitch);
    else {
      const at = smooth ? s.position : linearCameraPosition(plan, t) ?? s.position;
      camera.position.copy(stageToWorld(at.x, at.y, at.h + 0.15));
      camera.lookAt(stageToWorld(s.target.x, s.target.y, s.target.h + 0.15));
      if (s.rollDeg) camera.rotateZ((-s.rollDeg * Math.PI) / 180);
    }
    camera.updateProjectionMatrix();
  };

  /** Chairs / sofas people sit on when they stop there (the plan's own and the world's interiors). */
  const seats = plan ? previsPlanSeats(plan, drawnWorld) : [];
  const pose = (t: number) => {
    lastT = t;
    if (!plan) return;
    for (const c of plan.characters) {
      const g = figureById.get(c.id);
      if (!g) continue;
      if (live?.kind === 'character' && live.id === c.id) {
        g.position.copy(stageToWorld(live.x, live.y, 0.15));
        g.rotation.y = -(live.facing * Math.PI) / 180 + heading;
        for (const part of g.children) part.visible = part.name !== 'lap';
        continue;
      }
      const p = samplePrevisPath(c, t, smooth);
      // Inside a vehicle: hidden (parts only, so callers can still hide the whole figure).
      const riding = isPrevisRiding(plan, c.id, t);
      // Stopped on a chair / sofa: seated on it, facing the way it faces.
      const seat = seats.length && !riding ? previsSeatAt(seats, p, 0.05) : null;
      const before = seat ? samplePrevisPath(c, t - 0.3, smooth) : p;
      const after = seat ? samplePrevisPath(c, t + 0.3, smooth) : p;
      const seated = !!seat && Math.hypot(after.x - before.x, after.y - before.y) < 0.12;
      if (seat && seated) {
        g.position.copy(stageToWorld(seat.x, seat.y, 0.15 - WORLD3D_SIT_DROP_M));
        g.rotation.y = -(seat.facing * Math.PI) / 180 + heading;
      } else {
        g.position.copy(stageToWorld(p.x, p.y, 0.15));
        g.rotation.y = -((smooth ? samplePrevisPathSmoothHeading(c, t) : null) ?? samplePrevisCharacterTurnHeading(c, t)) + heading;
      }
      for (const part of g.children) part.visible = !riding && (part.name !== 'lap' || seated);
    }
    for (const it of vehicleParts) {
      const p = samplePrevisVehicle(it.v, t);
      it.g.position.copy(stageToWorld(p.x, p.y, p.alt));
      it.g.rotation.y = -it.headingAt(t) + heading;
      if (it.rotor) it.rotor.rotation.y = t * 24;
    }
    if (cameraGizmo && gizmoHelper) {
      aimShot(gizmoCam, t);
      gizmoCam.far = 3.2;
      gizmoCam.updateProjectionMatrix();
      gizmoCam.updateMatrixWorld();
      cameraGizmo.position.copy(gizmoCam.position);
      cameraGizmo.quaternion.copy(gizmoCam.quaternion);
      gizmoHelper.update();
      if (aimHandle) {
        const fh = 2 * gizmoCam.far * Math.tan(((gizmoCam.fov / 2) * Math.PI) / 180);
        aimHandle.position.copy(gizmoCam.position).add(new THREE.Vector3(0, 0, -gizmoCam.far).applyQuaternion(gizmoCam.quaternion));
        aimHandle.quaternion.copy(gizmoCam.quaternion);
        aimHandle.scale.set(fh * gizmoCam.aspect, fh, 1);
      }
    }
  };

  const GROW_SPAN = 0.2;
  const grow = (progress: number) => {
    for (const it of growables) {
      const k = Math.max(0, Math.min(1, (progress - it.start) / GROW_SPAN));
      const e = 1 - (1 - k) * (1 - k) * (1 - k);
      if (it.mode === 'rise') it.obj.scale.y = Math.max(0.02, e);
      else {
        it.obj.visible = k > 0;
        it.obj.scale.setScalar(Math.max(0.001, e));
      }
    }
  };

  let precip = weather ? createPrecipitation(scene, weather) : null;
  const applyAtmosphere = (ref: PrevisWorldRef | undefined) => {
    const resolved = resolveWorldLook(ref);
    Object.assign(look, resolved.look);
    scene.background = new THREE.Color(resolved.look.sky);
    if (scene.fog instanceof THREE.Fog) {
      scene.fog.color.set(resolved.look.sky);
      if (resolved.themeLook) {
        scene.fog.near = resolved.themeLook.fog[0];
        scene.fog.far = resolved.themeLook.fog[1];
      } else if (resolved.weather) {
        scene.fog.near = resolved.weather === 'rain' ? 45 : 60;
        scene.fog.far = resolved.weather === 'rain' ? 210 : 240;
      } else {
        scene.fog.near = 150;
        scene.fog.far = 360;
      }
    }
    hemi.color.set(resolved.look.hemiSky);
    hemi.groundColor.set(resolved.look.hemiGround);
    hemi.intensity = resolved.look.hemi;
    sun.color.set(resolved.look.sun);
    sun.intensity = resolved.look.sunI;
    M.paper.emissiveIntensity = resolved.look.glow;
    lightFor(lightAnchor.cx, lightAnchor.cy, lightAnchor.span);
    precip?.dispose();
    precip = resolved.weather ? createPrecipitation(scene, resolved.weather) : null;
  };
  return {
    scene,
    sun,
    overlays,
    figures,
    extentM,
    maxHeightM,
    overviewScale: theme === 'orbital' ? 2.6 : theme === 'future' || theme === 'cyberpunk' ? 1.6 : 1,
    groundSlope: slope,
    groundAt,
    plan,
    animate(seconds, viewer) {
      precip?.update(seconds, viewer);
    },
    applyAtmosphere,
    farFrom(m) {
      return worldGroup.children.filter((o) => {
        const dx = o.position.x - stageCenter.x;
        const dy = -o.position.z - stageCenter.y;
        return Math.sqrt(dx * dx + dy * dy) > m;
      });
    },
    stageToWorld,
    worldToStage: (x, y) => worldToStage(x, y),
    pose,
    setLive(next) {
      live = next;
      pose(lastT);
    },
    cameraGizmo,
    aimHandle,
    setAimActive(on) {
      if (!aimHandle) return;
      aimHandle.visible = on;
      (aimHandle.material as THREE.MeshBasicMaterial).opacity = on ? 0.14 : 0;
    },
    grow,
    blocked(p) {
      const wx = p.x;
      const wy = -p.z;
      for (const b of solids) {
        if (p.y > (b.base ?? 0) + b.h + 0.2 || p.y < (b.base ?? 0) - 0.2) continue;
        if (Math.abs(wx - b.x) < b.w / 2 + 0.3 && Math.abs(wy - b.y) < b.d / 2 + 0.3) return true;
      }
      return false;
    },
    aimShotCamera(camera, t) {
      aimShot(camera, t);
    },
    dispose() {
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
        const mt = m.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mt)) mt.forEach((x) => x.dispose());
        else mt?.dispose();
      });
      sun.shadow.map?.dispose();
      Object.values(M).forEach((m) => m.dispose());
      Object.values(wallShades).forEach((list) => list.forEach((m) => m.dispose()));
      neonMats.forEach((m) => m.dispose());
      themed?.dispose();
      horizonMats.forEach((m) => m.dispose());
      precip?.dispose();
      wireMat.dispose();
    },
  };
}

/** Rain streaks or snow flakes in a box that follows the viewer (wrapping, so the density never runs out). */
function createPrecipitation(scene: THREE.Scene, kind: 'rain' | 'snow'): { update(seconds: number, viewer: THREE.Vector3): void; dispose(): void } {
  const N = kind === 'rain' ? 7000 : 5000;
  const R = 34;
  const H = 26;
  const seedRand = (() => {
    let x = 2463534242;
    return () => {
      x ^= x << 13;
      x ^= x >>> 17;
      x ^= x << 5;
      return ((x >>> 0) % 100000) / 100000;
    };
  })();
  const base = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    base[i * 3] = (seedRand() * 2 - 1) * R;
    base[i * 3 + 1] = seedRand() * H;
    base[i * 3 + 2] = (seedRand() * 2 - 1) * R;
  }
  const geo = new THREE.BufferGeometry();
  const verts = kind === 'rain' ? 2 : 1;
  const pos = new Float32Array(N * 3 * verts);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const obj: THREE.LineSegments | THREE.Points =
    kind === 'rain'
      ? new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: '#c3cad2', transparent: true, opacity: 0.55, depthWrite: false }))
      : new THREE.Points(geo, new THREE.PointsMaterial({ color: '#ffffff', size: 0.14, transparent: true, opacity: 0.9, depthWrite: false }));
  obj.frustumCulled = false;
  obj.renderOrder = 5;
  scene.add(obj);
  const speed = kind === 'rain' ? 13 : 1.1;
  const wrap = (v: number, span: number) => ((v % span) + span) % span;
  return {
    update(seconds, viewer) {
      for (let i = 0; i < N; i++) {
        const bx = base[i * 3];
        const bz = base[i * 3 + 2];
        const sway = kind === 'snow' ? Math.sin(seconds * 0.9 + i) * 0.6 : seconds * 1.2;
        const x = viewer.x + wrap(bx + sway - viewer.x, 2 * R) - R;
        const z = viewer.z + wrap(bz - viewer.z, 2 * R) - R;
        const y = wrap(base[i * 3 + 1] - seconds * speed, H) + Math.max(0, viewer.y - H / 2);
        if (kind === 'rain') {
          pos.set([x, y, z, x - 0.05, y + 0.7, z], i * 6);
        } else {
          pos.set([x, y, z], i * 3);
        }
      }
      geo.attributes.position.needsUpdate = true;
    },
    dispose() {
      scene.remove(obj);
      geo.dispose();
      (obj.material as THREE.Material).dispose();
    },
  };
}
