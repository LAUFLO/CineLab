/**
 * Deterministic whitebox world around a previs stage: the original modern city block (`modern-v1`) or a styled
 * block driven by bounded style parameters (`styled-v1`: built-in Japanese modern / Edo presets, or parameters an
 * assistant planned for a style that is not in the library). Pure TypeScript shared by the
 * plan-director-previs Edge Function (Deno) and the browser. Only integer RNG and + - * / are used, outputs are
 * rounded to 1 cm and stage headings are multiples of 90°, so every JS engine produces identical layouts.
 *
 * Plan coordinates: x = east, y = north, metres; origin = world centre.
 */

import {
  applyPrevisWorldWater,
  normalizePrevisWorldWaterRef,
  type PrevisWorldBridge,
  type PrevisWorldQuay,
  type PrevisWorldWaterRef,
} from './world-water';

export const PREVIS_WORLD_GENERATOR_VERSIONS = ['modern-v1', 'styled-v1'] as const;
export type PrevisWorldGeneratorVersion = (typeof PREVIS_WORLD_GENERATOR_VERSIONS)[number];
export const PREVIS_WORLD_STYLES = ['modern_city', 'jp_modern', 'edo', 'custom'] as const;
export type PrevisWorldStyle = (typeof PREVIS_WORLD_STYLES)[number];
export const PREVIS_WORLD_LAYOUTS = ['street', 'crossroad', 't_junction', 'plaza'] as const;
export type PrevisWorldLayout = (typeof PREVIS_WORLD_LAYOUTS)[number];
export const PREVIS_WORLD_DENSITIES = ['low', 'medium', 'high'] as const;
export type PrevisWorldDensity = (typeof PREVIS_WORLD_DENSITIES)[number];
export const PREVIS_WORLD_TIMES = ['day', 'dusk', 'night'] as const;
export type PrevisWorldTimeOfDay = (typeof PREVIS_WORLD_TIMES)[number];
export type PrevisWorldHeading = 0 | 90 | 180 | 270;

export const PREVIS_WORLD_EXTENT_DEFAULT_M = 120;
/** Size of newly made worlds (stored on the ref; worlds made before keep theirs). */
export const PREVIS_WORLD_EXTENT_NEW_M = 200;
export const PREVIS_WORLD_EXTENT_MIN_M = 60;
export const PREVIS_WORLD_EXTENT_MAX_M = 200;
const MAX_OVERRIDES = 200;

/** Half the carriageway width and the sidewalk width (m). */
export const PREVIS_WORLD_ROAD_HALF_M = 6;
export const PREVIS_WORLD_SIDEWALK_M = 4;
const CORRIDOR = PREVIS_WORLD_ROAD_HALF_M + PREVIS_WORLD_SIDEWALK_M;

export interface PrevisWorldStageAnchor {
  /** Stage centre in world coordinates. */
  x: number;
  y: number;
  /** Rotation of the stage axes (counter-clockwise). 270 = stage +y points east. */
  headingDeg: PrevisWorldHeading;
}

export type PrevisWorldOverride =
  | { op: 'move'; id: string; x: number; y: number; rotDeg?: PrevisWorldHeading }
  | { op: 'resize'; id: string; w?: number; d?: number; h?: number }
  | { op: 'remove'; id: string }
  | { op: 'restore'; id: string }
  | {
      op: 'add';
      id: string;
      kind: 'building' | 'storefront';
      x: number;
      y: number;
      w: number;
      d: number;
      h: number;
      front?: PrevisWorldFront;
    };

export type PrevisWorldSurface = 'asphalt' | 'dirt' | 'stone';
export type PrevisWorldShopFront = 'glass' | 'open' | 'none';
export const PREVIS_WORLD_STYLED_PROP_KINDS = [
  'lamp',
  'tree',
  'utility_pole',
  'lantern',
  'vending_machine',
  'planter',
  'barrel',
  'bench',
] as const;
export type PrevisWorldStyledPropKind = (typeof PREVIS_WORLD_STYLED_PROP_KINDS)[number];

/** Bounded parameters of a styled block (see `normalizePrevisWorldStyleParams` for the limits). */
export interface PrevisWorldStyleParams {
  roadHalfM: number;
  sidewalkM: number;
  roadSurface: PrevisWorldSurface;
  /** Lane dashes and zebra crossings. */
  markings: boolean;
  lotWidthM: [number, number];
  lotDepthM: [number, number];
  floors: [number, number];
  floorHeightM: number;
  gapM: [number, number];
  /** Chance that an inner lot stays empty. */
  vacancy: number;
  roofs: { flat: number; gable: number; hip: number };
  roofPitchDeg: number;
  eaveM: number;
  /** Share of street-front lots that are shops. */
  shopRatio: number;
  shopFront: PrevisWorldShopFront;
  tints: { plain: number; blue: number; warm: number };
  /** Street objects per 100 m of street edge; `car` per 100 m of road. */
  props: Record<PrevisWorldStyledPropKind, number> & { car: number };
  /** Chance that a flat-roofed building of 10+ floors steps back near the top (high-rise districts). */
  towerSetback?: number;
}

export const PREVIS_WORLD_STYLE_PRESETS: Record<'jp_modern' | 'edo', PrevisWorldStyleParams> = {
  jp_modern: {
    roadHalfM: 3.2,
    sidewalkM: 0.8,
    roadSurface: 'asphalt',
    markings: false,
    lotWidthM: [6, 10],
    lotDepthM: [8, 12],
    floors: [2, 4],
    floorHeightM: 2.9,
    gapM: [0.3, 1.2],
    vacancy: 0.08,
    roofs: { flat: 0.45, gable: 0.35, hip: 0.2 },
    roofPitchDeg: 25,
    eaveM: 0.4,
    shopRatio: 0.45,
    shopFront: 'glass',
    tints: { plain: 0.6, blue: 0.25, warm: 0.15 },
    props: { lamp: 0, tree: 1.5, utility_pole: 6, lantern: 0, vending_machine: 3, planter: 4, barrel: 0, bench: 0, car: 4 },
  },
  edo: {
    roadHalfM: 3.8,
    sidewalkM: 0,
    roadSurface: 'dirt',
    markings: false,
    lotWidthM: [5, 9],
    lotDepthM: [7, 11],
    floors: [1, 2],
    floorHeightM: 3,
    gapM: [0, 0.6],
    vacancy: 0.05,
    roofs: { flat: 0, gable: 0.55, hip: 0.45 },
    roofPitchDeg: 28,
    eaveM: 0.9,
    shopRatio: 0.7,
    shopFront: 'open',
    tints: { plain: 0.3, blue: 0, warm: 0.7 },
    props: { lamp: 0, tree: 1, utility_pole: 0, lantern: 8, vending_machine: 0, planter: 0, barrel: 5, bench: 1, car: 0 },
  },
};

/** Starting point for assistant-planned styles (a generic modern block). */
export const PREVIS_WORLD_STYLE_TEMPLATE: PrevisWorldStyleParams = {
  roadHalfM: 6,
  sidewalkM: 4,
  roadSurface: 'asphalt',
  markings: true,
  lotWidthM: [8, 14],
  lotDepthM: [11, 16],
  floors: [3, 8],
  floorHeightM: 3.2,
  gapM: [0.4, 1],
  vacancy: 0.14,
  roofs: { flat: 1, gable: 0, hip: 0 },
  roofPitchDeg: 25,
  eaveM: 0,
  shopRatio: 0.6,
  shopFront: 'glass',
  tints: { plain: 0.67, blue: 0.33, warm: 0 },
  props: { lamp: 6, tree: 6, utility_pole: 0, lantern: 0, vending_machine: 0, planter: 0, barrel: 0, bench: 1, car: 12 },
};

export const PREVIS_WORLD_LANDMARK_KINDS = [
  'castle_keep',
  'pagoda',
  'torii',
  'temple',
  'clock_tower',
  'church',
  'skyscraper',
  'tv_tower',
  'hill',
  'lattice_tower',
  'triumphal_arch',
  'pyramid',
  'mountain',
  'statue',
  'arena',
  'city_gate',
  'ferris_wheel',
  'leaning_tower',
  'castle',
  'opera_house',
  'great_wall',
  'dome',
  'suspension_bridge',
] as const;
export type PrevisWorldLandmarkKind = (typeof PREVIS_WORLD_LANDMARK_KINDS)[number];
/**
 * `far_*`: beyond the blocks on the skyline; plain directions: inside the map (replaces the buildings there);
 * `approach`: on the approach road leading to a far landmark (needs a landmark with `approach`).
 */
export const PREVIS_WORLD_LANDMARK_SPOTS = ['far_north', 'far_south', 'far_east', 'far_west', 'north', 'south', 'east', 'west', 'approach'] as const;
export type PrevisWorldLandmarkSpot = (typeof PREVIS_WORLD_LANDMARK_SPOTS)[number];
export const PREVIS_WORLD_MAX_LANDMARKS = 6;
/** Width of an approach road (m). */
const APPROACH_W = 6;

/** Footprint (w × d) and overall height of each landmark (m). */
export const PREVIS_WORLD_LANDMARK_SIZE: Record<PrevisWorldLandmarkKind, { w: number; d: number; h: number }> = {
  castle_keep: { w: 26, d: 22, h: 38 },
  pagoda: { w: 11, d: 11, h: 32 },
  torii: { w: 9, d: 1.4, h: 7.5 },
  temple: { w: 26, d: 18, h: 15 },
  clock_tower: { w: 9, d: 9, h: 42 },
  church: { w: 15, d: 28, h: 38 },
  skyscraper: { w: 26, d: 26, h: 130 },
  tv_tower: { w: 14, d: 14, h: 170 },
  hill: { w: 70, d: 56, h: 16 },
  lattice_tower: { w: 44, d: 44, h: 165 },
  triumphal_arch: { w: 30, d: 15, h: 32 },
  pyramid: { w: 64, d: 64, h: 40 },
  /** Skyline only (a near spot moves to the far spot in the same direction). */
  mountain: { w: 170, d: 120, h: 75 },
  statue: { w: 10, d: 10, h: 32 },
  arena: { w: 62, d: 50, h: 24 },
  city_gate: { w: 56, d: 20, h: 30 },
  ferris_wheel: { w: 54, d: 10, h: 62 },
  leaning_tower: { w: 16, d: 16, h: 56 },
  castle: { w: 42, d: 36, h: 30 },
  opera_house: { w: 62, d: 40, h: 30 },
  /** Skyline only: a wall along a ridge. */
  great_wall: { w: 170, d: 30, h: 26 },
  dome: { w: 40, d: 40, h: 46 },
  /** Skyline only: towers, deck and cables over a strip of water. */
  suspension_bridge: { w: 190, d: 14, h: 72 },
};
/** Landmarks too big for a spot inside the map: a near spot moves to the far spot in the same direction. */
const FAR_ONLY_LANDMARKS: ReadonlySet<string> = new Set(['mountain', 'great_wall', 'suspension_bridge']);

/** Rolling hills: amplitude and wavelength (m) of the rise and fall along the street (steepest ≈ 21 %). */
export const PREVIS_WORLD_HILL_AMP_M = 3;
export const PREVIS_WORLD_HILL_WAVE_M = 90;

/** Ground height (m) at plan x for a world's slope / hills (0 on flat worlds). */
export function previsWorldGroundAt(ref: { slope?: number; hills?: boolean }, x: number): number {
  return (ref.slope ?? 0) * x + (ref.hills ? PREVIS_WORLD_HILL_AMP_M * Math.sin((2 * Math.PI * x) / PREVIS_WORLD_HILL_WAVE_M) : 0);
}

/**
 * Look of the whole world (drawn only; the layout is the same): a base on Mars (habitat modules, domes, solar
 * panels), an orbital station (a deck floating in space), a future city (sculpted towers, elevated loops) or a
 * cyberpunk district (neon billboards, glowing lanes).
 */
export const PREVIS_WORLD_THEMES = ['mars', 'orbital', 'future', 'cyberpunk'] as const;
export type PrevisWorldTheme = (typeof PREVIS_WORLD_THEMES)[number];

export const PREVIS_WORLD_WEATHERS = ['rain', 'snow'] as const;
export type PrevisWorldWeather = (typeof PREVIS_WORLD_WEATHERS)[number];

export interface PrevisWorldRef {
  schemaVersion: 1;
  style: PrevisWorldStyle;
  generatorVersion: PrevisWorldGeneratorVersion;
  /** Styled worlds: parameters snapshot (presets are copied so later preset tweaks do not move old worlds). */
  styleParams?: PrevisWorldStyleParams;
  /** Display name of an assistant-planned style. */
  styleName?: string;
  /** Landmarks (castle keep, pagoda, …) and where they stand. */
  landmarks?: Array<{ kind: PrevisWorldLandmarkKind; spot: PrevisWorldLandmarkSpot; approach?: boolean }>;
  /** A river across or alongside the street, a canal instead of the road, or a waterfront to the south. */
  water?: PrevisWorldWaterRef;
  /** Falling rain / snow (drawn only; the layout is the same). */
  weather?: PrevisWorldWeather;
  /** Neon signs on the shopfronts (implies night). */
  neon?: true;
  /** Themed look of the whole world (see PREVIS_WORLD_THEMES; the layout is unchanged). */
  theme?: PrevisWorldTheme;
  /**
   * Open space between buildings: share of each lot left free (0.1–0.5). Buildings keep their street front and
   * shrink along the street and from the back. Missing on worlds made before (their layout is unchanged).
   */
  spacing?: number;
  /** Sloped street: grade (rise per metre) uphill toward the east, 0.03–0.2; the layout is unchanged. */
  slope?: number;
  /** Rolling street: the ground rises and falls along it (on top of any slope); the layout is unchanged. */
  hills?: true;
  /** Buildings with a ground-floor interior (validated in previsInterior.ts; the layout is unchanged). */
  interiors?: Array<{ buildingId: string; room: string; furniture?: Array<Record<string, unknown>> }>;
  seed: number;
  extentM: [number, number];
  layout: PrevisWorldLayout;
  density: PrevisWorldDensity;
  timeOfDay?: PrevisWorldTimeOfDay;
  stageAnchor: PrevisWorldStageAnchor;
  overrides?: PrevisWorldOverride[];
}

export interface PrevisWorldBox {
  x: number;
  y: number;
  w: number;
  d: number;
}
export type PrevisWorldFront = 'n' | 's' | 'e' | 'w';
export type PrevisWorldBuildingKind = 'building' | 'storefront' | 'tower';
export interface PrevisWorldBuilding extends PrevisWorldBox {
  id: string;
  kind: PrevisWorldBuildingKind;
  h: number;
  /** Side facing the street. */
  front: PrevisWorldFront;
  /** Door centre along the front facade, metres from the facade centre (east / north positive). */
  doorOffset: number;
  setback?: { h: number; inset: number };
  roofUnits: PrevisWorldBox[];
  /** Styled worlds: pitched roof on top of `h` (ridge along x or y). */
  roof?: { kind: 'gable' | 'hip'; h: number; ridge: 'x' | 'y'; eave: number };
  /** Styled worlds: wall tint. */
  tint?: 'plain' | 'blue' | 'warm';
  /** Added or changed by an override. */
  edited?: boolean;
}
export type PrevisWorldStreetPropKind = 'lamp' | 'tree' | 'car' | 'bench' | 'bus_stop' | Exclude<PrevisWorldStyledPropKind, 'lamp' | 'tree' | 'bench'>;
export interface PrevisWorldStreetProp {
  id: string;
  kind: PrevisWorldStreetPropKind;
  x: number;
  y: number;
  rotDeg: PrevisWorldHeading;
  /** Utility poles on the same line (wires run between them). */
  line?: string;
}
export interface PrevisWorldOpenSpace extends PrevisWorldBox {
  kind: 'park' | 'plaza';
}
export interface PrevisWorldLandmark extends PrevisWorldBox {
  id: string;
  kind: PrevisWorldLandmarkKind;
  h: number;
  /** Side facing the map centre. */
  front: PrevisWorldFront;
  /** Beyond the blocks (skyline) rather than inside the map. */
  far: boolean;
  /** Standing on a hill at the same spot (height of its base). */
  elev?: number;
}

export interface PrevisWorld {
  generatorVersion: PrevisWorldGeneratorVersion;
  extentM: [number, number];
  landmarks?: PrevisWorldLandmark[];
  /** Roads from the map to far landmarks. */
  approaches?: PrevisWorldBox[];
  /** Paths up a hill to the landmark on top (drawn on the hill surface). */
  climbs?: Array<{ from: { x: number; y: number }; to: { x: number; y: number }; w: number; hill: PrevisWorldBox & { h: number } }>;
  /** Styled worlds: how roads and shop fronts are drawn. */
  look?: { style: PrevisWorldStyle; roadSurface: PrevisWorldSurface; shopFront: PrevisWorldShopFront };
  /** Water surfaces, the bridges over them and the railings along their edges (see previsWorldWater.ts). */
  water?: PrevisWorldBox[];
  bridges?: PrevisWorldBridge[];
  quays?: PrevisWorldQuay[];
  roads: PrevisWorldBox[];
  sidewalks: PrevisWorldBox[];
  crosswalks: PrevisWorldBox[];
  laneDashes: PrevisWorldBox[];
  openSpaces: PrevisWorldOpenSpace[];
  buildings: PrevisWorldBuilding[];
  props: PrevisWorldStreetProp[];
}

export class PrevisWorldError extends Error {
  constructor(
    public readonly code: 'WORLD_INVALID' | 'UNKNOWN_GENERATOR' | 'UNKNOWN_STYLE',
    message: string,
  ) {
    super(message);
    this.name = 'PrevisWorldError';
  }
}

/** Round to 1 cm; never returns -0. */
const r2 = (v: number) => Math.round(v * 100) / 100 + 0;
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
const pick = <T extends string>(v: unknown, list: readonly T[], fallback: T): T =>
  (list as readonly string[]).includes(String(v)) ? (v as T) : fallback;
const heading = (v: unknown): PrevisWorldHeading => {
  const n = isNum(v) ? (((Math.round(v / 90) * 90) % 360) + 360) % 360 : 0;
  return n as PrevisWorldHeading;
};

/** Validate and clamp a world reference (planner output or stored node content). */
export function normalizePrevisWorldRef(raw: unknown): PrevisWorldRef {
  if (!raw || typeof raw !== 'object') throw new PrevisWorldError('WORLD_INVALID', 'World settings are missing.');
  const o = raw as Record<string, unknown>;
  const style = String(o.style ?? 'modern_city');
  if (!(PREVIS_WORLD_STYLES as readonly string[]).includes(style)) {
    throw new PrevisWorldError('UNKNOWN_STYLE', 'This world style is not available yet.');
  }
  const styled = style !== 'modern_city';
  const gen = String(o.generatorVersion ?? (styled ? 'styled-v1' : 'modern-v1'));
  if (!(PREVIS_WORLD_GENERATOR_VERSIONS as readonly string[]).includes(gen)) {
    throw new PrevisWorldError('UNKNOWN_GENERATOR', 'This world was made by a newer version. Refresh the page.');
  }
  const ext = Array.isArray(o.extentM) ? o.extentM : [];
  const size = (v: unknown) =>
    clamp(isNum(v) ? Math.round(v) : PREVIS_WORLD_EXTENT_DEFAULT_M, PREVIS_WORLD_EXTENT_MIN_M, PREVIS_WORLD_EXTENT_MAX_M);
  const extentM: [number, number] = [size(ext[0]), size(ext[1] ?? ext[0])];
  const a = (o.stageAnchor ?? {}) as Record<string, unknown>;
  const hx = extentM[0] / 2;
  const hy = extentM[1] / 2;
  const stageAnchor: PrevisWorldStageAnchor = {
    x: r2(clamp(isNum(a.x) ? a.x : 0, -hx, hx)),
    y: r2(clamp(isNum(a.y) ? a.y : 0, -hy, hy)),
    headingDeg: heading(a.headingDeg),
  };
  const seed = isNum(o.seed) ? Math.abs(Math.trunc(o.seed)) % 2147483647 : 1;
  const overrides = Array.isArray(o.overrides) ? o.overrides.slice(0, MAX_OVERRIDES).map(normalizeOverride).filter(Boolean) : [];
  const out: PrevisWorldRef = {
    schemaVersion: 1,
    style: style as PrevisWorldStyle,
    generatorVersion: styled ? 'styled-v1' : 'modern-v1',
    seed,
    extentM,
    layout: pick(o.layout, PREVIS_WORLD_LAYOUTS, 'crossroad'),
    density: pick(o.density, PREVIS_WORLD_DENSITIES, 'medium'),
    stageAnchor,
  };
  if (o.timeOfDay != null) out.timeOfDay = pick(o.timeOfDay, PREVIS_WORLD_TIMES, 'day');
  if (styled) {
    const fallback = style === 'jp_modern' || style === 'edo' ? PREVIS_WORLD_STYLE_PRESETS[style] : PREVIS_WORLD_STYLE_TEMPLATE;
    out.styleParams = normalizePrevisWorldStyleParams(o.styleParams ?? fallback);
    if (style === 'custom' && typeof o.styleName === 'string' && o.styleName.trim()) out.styleName = o.styleName.trim().slice(0, 24);
  }
  if (Array.isArray(o.landmarks)) {
    // One landmark per spot, plus one hill under it; `approach` only on far spots; the approach spot needs one.
    const seen = new Set<string>();
    const list: NonNullable<PrevisWorldRef['landmarks']> = [];
    for (const raw of o.landmarks) {
      const l = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
      if (!(PREVIS_WORLD_LANDMARK_KINDS as readonly string[]).includes(String(l.kind))) continue;
      const kind = l.kind as PrevisWorldLandmarkKind;
      let spot = pick(l.spot, PREVIS_WORLD_LANDMARK_SPOTS, 'far_north');
      if (FAR_ONLY_LANDMARKS.has(kind) && !spot.startsWith('far_')) spot = spot === 'approach' ? 'far_north' : (`far_${spot}` as PrevisWorldLandmarkSpot);
      const slot = `${spot}:${kind === 'hill' ? 'hill' : 'top'}`;
      if (seen.has(slot) || (kind === 'hill' && spot === 'approach')) continue;
      seen.add(slot);
      const entry: NonNullable<PrevisWorldRef['landmarks']>[number] = { kind, spot };
      if (l.approach === true && spot.startsWith('far_') && kind !== 'hill') entry.approach = true;
      list.push(entry);
      if (list.length >= PREVIS_WORLD_MAX_LANDMARKS) break;
    }
    const hasApproach = list.some((l) => l.approach);
    const kept = list.filter((l) => l.spot !== 'approach' || hasApproach);
    if (kept.length) out.landmarks = kept;
  }
  const water = normalizePrevisWorldWaterRef(o.water);
  if (water) out.water = water;
  if ((PREVIS_WORLD_WEATHERS as readonly string[]).includes(String(o.weather))) out.weather = o.weather as PrevisWorldWeather;
  if (o.neon === true) out.neon = true;
  if ((PREVIS_WORLD_THEMES as readonly string[]).includes(String(o.theme))) out.theme = o.theme as PrevisWorldTheme;
  if (isNum(o.spacing) && o.spacing >= 0.05) out.spacing = r2(clamp(o.spacing, 0.1, 0.5));
  if (isNum(o.slope) && o.slope >= 0.02) out.slope = r2(clamp(o.slope, 0.03, 0.2));
  if (o.hills === true) out.hills = true;
  if (Array.isArray(o.interiors)) {
    const list = o.interiors
      .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object' && typeof (x as Record<string, unknown>).buildingId === 'string')
      .slice(0, 3)
      .map((x) => ({
        buildingId: String(x.buildingId).slice(0, 40),
        room: String(x.room ?? 'generic').slice(0, 24),
        ...(Array.isArray(x.furniture) ? { furniture: (x.furniture as Array<Record<string, unknown>>).filter((p) => p && typeof p === 'object').slice(0, 60) } : {}),
      }));
    if (list.length) out.interiors = list;
  }
  if (overrides.length) out.overrides = overrides as PrevisWorldOverride[];
  return out;
}

/**
 * Place landmarks: far ones stand beyond the blocks (skyline); near ones take a spot inside the map and the
 * buildings / street objects under them (plus 2 m) are removed. Streets are never covered.
 */
function placeLandmarks(world: PrevisWorld, ref: PrevisWorldRef, corridor: number, roadHalf: number): PrevisWorld {
  if (!ref.landmarks?.length) return world;
  const [EW, ED] = world.extentM;
  const hx = EW / 2;
  const hy = ED / 2;
  const placed: Array<PrevisWorldLandmark | null> = ref.landmarks.map(() => null);
  let buildings = world.buildings;
  let props = world.props;
  const approaches: PrevisWorldBox[] = [];
  const clearArea = (box: PrevisWorldBox, pad: number) => {
    const hit = (b: PrevisWorldBox) => Math.abs(b.x - box.x) < (b.w + box.w) / 2 + pad && Math.abs(b.y - box.y) < (b.d + box.d) / 2 + pad;
    buildings = buildings.filter((b) => !hit(b));
    props = props.filter((p) => !hit({ x: p.x, y: p.y, w: 1, d: 1 }));
  };
  const at = (kind: PrevisWorldLandmarkKind, spot: Exclude<PrevisWorldLandmarkSpot, 'approach'>) => {
    const far = spot.startsWith('far_');
    const full = PREVIS_WORLD_LANDMARK_SIZE[kind];
    // Hills inside the map are smaller (a mound among the blocks rather than a skyline ridge).
    const size = kind === 'hill' && !far ? { w: r2(full.w * 0.65), d: r2(full.d * 0.65), h: r2(full.h * 0.65) } : full;
    const dir = spot.replace('far_', '') as 'north' | 'south' | 'east' | 'west';
    const ns = dir === 'north' || dir === 'south';
    const sign = dir === 'north' || dir === 'east' ? 1 : -1;
    // Long side across the line of sight from the centre.
    const w = ns ? Math.max(size.w, size.d) : Math.min(size.w, size.d);
    const d = ns ? Math.min(size.w, size.d) : Math.max(size.w, size.d);
    const half = ns ? d / 2 : w / 2;
    // Inside: centre of the outer half of the quadrant pair, off the side street.
    const inner = Math.min((ns ? hy : hx) - half - 3, Math.max(corridor + half + 3, (ns ? hy : hx) * 0.62));
    const dist = far ? (ns ? hy : hx) + half + 30 : inner;
    // Each near spot takes its own quadrant (north NE, east SE, south SW, west NW) so big landmarks never overlap.
    const side = dir === 'north' || dir === 'west' ? 1 : -1;
    const offset = far ? 0 : side * (corridor + (ns ? w : d) / 2 + 3);
    const front: PrevisWorldFront = dir === 'north' ? 's' : dir === 'south' ? 'n' : dir === 'east' ? 'w' : 'e';
    return { x: ns ? offset : sign * dist, y: ns ? sign * dist : offset, w, d, h: size.h, front, far, ns, sign };
  };
  // Hills first: a landmark at the same spot stands on top.
  const hills = new Map<string, PrevisWorldLandmark>();
  ref.landmarks.forEach((l, i) => {
    if (l.kind !== 'hill' || l.spot === 'approach') return;
    const p = at('hill', l.spot);
    const lm: PrevisWorldLandmark = { id: `l${i + 1}`, kind: 'hill', x: r2(p.x), y: r2(p.y), w: p.w, d: p.d, h: p.h, front: p.front, far: p.far };
    placed[i] = lm;
    hills.set(l.spot, lm);
    if (!p.far) clearArea(lm, 2);
  });
  let target: { lm: PrevisWorldLandmark; ns: boolean; sign: number } | null = null;
  ref.landmarks.forEach((l, i) => {
    if (l.kind === 'hill' || l.spot === 'approach') return;
    const p = at(l.kind, l.spot);
    const hill = hills.get(l.spot);
    const lm: PrevisWorldLandmark = {
      id: `l${i + 1}`,
      kind: l.kind,
      x: r2(hill ? hill.x : p.x),
      y: r2(hill ? hill.y : p.y),
      w: p.w,
      d: p.d,
      h: p.h,
      front: p.front,
      far: p.far,
      ...(hill ? { elev: r2(hill.h * 0.82) } : {}),
    };
    placed[i] = lm;
    if (!p.far) clearArea(lm, 2);
    if (l.approach && !target) target = { lm, ns: p.ns, sign: p.sign };
  });
  // Approach road from the main street to the far landmark (through the blocks), and objects standing on it.
  // A landmark on a hill: the road ends at the foot of the hill and a path climbs to the landmark.
  const climbs: NonNullable<PrevisWorld['climbs']> = [];
  if (target) {
    const { lm, ns, sign } = target as { lm: PrevisWorldLandmark; ns: boolean; sign: number };
    const hill = lm.elev ? [...hills.values()].find((h) => h.x === lm.x && h.y === lm.y) : undefined;
    const base = hill
      ? ns
        ? Math.abs(hill.y) - hill.d / 2
        : Math.abs(hill.x) - hill.w / 2
      : ns
        ? Math.abs(lm.y) - lm.d / 2
        : Math.abs(lm.x) - lm.w / 2;
    if (hill) {
      const top = ns ? Math.abs(lm.y) - lm.d / 2 : Math.abs(lm.x) - lm.w / 2;
      climbs.push({
        from: ns ? { x: lm.x, y: r2(sign * base) } : { x: r2(sign * base), y: lm.y },
        to: ns ? { x: lm.x, y: r2(sign * top) } : { x: r2(sign * top), y: lm.y },
        w: 3,
        hill: { x: hill.x, y: hill.y, w: hill.w, d: hill.d, h: hill.h },
      });
    }
    // East / west landmarks stand on the main street's axis: the street itself continues to them at full width.
    const from = ns ? corridor : hx;
    const len = Math.max(4, base - from);
    const mid = from + len / 2;
    const roadW = ns ? APPROACH_W : r2(Math.max(APPROACH_W, roadHalf * 2));
    const road: PrevisWorldBox = ns
      ? { x: r2(lm.x), y: r2(sign * mid), w: APPROACH_W, d: r2(len) }
      : { x: r2(sign * mid), y: r2(lm.y), w: r2(len), d: roadW };
    approaches.push(road);
    clearArea(road, 1);
    const onRoad = ref.landmarks.map((l, i) => [l, i] as const).filter(([l]) => l.spot === 'approach');
    onRoad.forEach(([l, i], n) => {
      const size = PREVIS_WORLD_LANDMARK_SIZE[l.kind];
      const edge = ns ? hy : hx;
      // Spread along the part of the road beyond the blocks (the first one halfway there).
      const t = edge + ((base - edge) * (n + 1)) / (onRoad.length + 1);
      const w = ns ? Math.max(size.w, size.d) : Math.min(size.w, size.d);
      const d = ns ? Math.min(size.w, size.d) : Math.max(size.w, size.d);
      placed[i] = {
        id: `l${i + 1}`,
        kind: l.kind,
        x: r2(ns ? lm.x : sign * t),
        y: r2(ns ? sign * t : lm.y),
        w,
        d,
        h: size.h,
        front: lm.front,
        far: true,
      };
    });
  }
  const landmarks = placed.filter((l): l is PrevisWorldLandmark => !!l);
  return { ...world, buildings, props, landmarks, ...(approaches.length ? { approaches } : {}), ...(climbs.length ? { climbs } : {}) };
}

/** Clamp style parameters to what the generator and renderer support; missing values come from the template. */
export function normalizePrevisWorldStyleParams(raw: unknown): PrevisWorldStyleParams {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const T = PREVIS_WORLD_STYLE_TEMPLATE;
  const num = (v: unknown, lo: number, hi: number, fb: number) => r2(clamp(isNum(v) ? v : fb, lo, hi));
  const pair = (v: unknown, lo: number, hi: number, fb: [number, number]): [number, number] => {
    const a = Array.isArray(v) ? v : fb;
    const x = num(a[0], lo, hi, fb[0]);
    const y = num(a[1], lo, hi, fb[1]);
    return x <= y ? [x, y] : [y, x];
  };
  const weights = <K extends string>(v: unknown, keys: readonly K[], fb: Record<K, number>): Record<K, number> => {
    const w = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
    const out = {} as Record<K, number>;
    let sum = 0;
    for (const k of keys) {
      out[k] = num(w[k], 0, 1, fb[k]);
      sum += out[k];
    }
    if (sum <= 0) return { ...fb };
    for (const k of keys) out[k] = r2(out[k] / sum);
    return out;
  };
  const pr = (o.props && typeof o.props === 'object' ? o.props : {}) as Record<string, unknown>;
  const props = {} as PrevisWorldStyleParams['props'];
  for (const k of PREVIS_WORLD_STYLED_PROP_KINDS) props[k] = num(pr[k], 0, 12, T.props[k]);
  props.car = num(pr.car, 0, 20, T.props.car);
  const floors = pair(o.floors, 1, 60, T.floors);
  const towerSetback = isNum(o.towerSetback) && o.towerSetback > 0 ? num(o.towerSetback, 0, 1, 0) : 0;
  return {
    roadHalfM: num(o.roadHalfM, 2.5, 14, T.roadHalfM),
    sidewalkM: num(o.sidewalkM, 0, 10, T.sidewalkM),
    roadSurface: pick(o.roadSurface, ['asphalt', 'dirt', 'stone'] as const, T.roadSurface),
    markings: typeof o.markings === 'boolean' ? o.markings : T.markings,
    lotWidthM: pair(o.lotWidthM, 4, 30, T.lotWidthM),
    lotDepthM: pair(o.lotDepthM, 6, 30, T.lotDepthM),
    floors: [Math.round(floors[0]), Math.round(floors[1])],
    floorHeightM: num(o.floorHeightM, 2.6, 4.2, T.floorHeightM),
    gapM: pair(o.gapM, 0, 5, T.gapM),
    vacancy: num(o.vacancy, 0, 0.4, T.vacancy),
    roofs: weights(o.roofs, ['flat', 'gable', 'hip'] as const, T.roofs),
    roofPitchDeg: num(o.roofPitchDeg, 15, 45, T.roofPitchDeg),
    eaveM: num(o.eaveM, 0, 1.2, T.eaveM),
    shopRatio: num(o.shopRatio, 0, 1, T.shopRatio),
    shopFront: pick(o.shopFront, ['glass', 'open', 'none'] as const, T.shopFront),
    tints: weights(o.tints, ['plain', 'blue', 'warm'] as const, T.tints),
    props,
    ...(towerSetback > 0 ? { towerSetback } : {}),
  };
}

function normalizeOverride(raw: unknown): PrevisWorldOverride | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const id = typeof o.id === 'string' ? o.id.slice(0, 40) : '';
  if (!id) return null;
  const dim = (v: unknown, lo: number, hi: number) => (isNum(v) ? r2(clamp(v, lo, hi)) : undefined);
  switch (o.op) {
    case 'move':
      if (!isNum(o.x) || !isNum(o.y)) return null;
      return { op: 'move', id, x: r2(o.x), y: r2(o.y), ...(o.rotDeg != null ? { rotDeg: heading(o.rotDeg) } : {}) };
    case 'resize': {
      const w = dim(o.w, 2, 60);
      const d = dim(o.d, 2, 60);
      const h = dim(o.h, 3, 120);
      return { op: 'resize', id, ...(w != null ? { w } : {}), ...(d != null ? { d } : {}), ...(h != null ? { h } : {}) };
    }
    case 'remove':
    case 'restore':
      return { op: o.op, id };
    case 'add': {
      if (!isNum(o.x) || !isNum(o.y)) return null;
      return {
        op: 'add',
        id,
        kind: o.kind === 'storefront' ? 'storefront' : 'building',
        x: r2(o.x),
        y: r2(o.y),
        w: dim(o.w, 2, 60) ?? 10,
        d: dim(o.d, 2, 60) ?? 10,
        h: dim(o.h, 3, 120) ?? 12,
        front: pick(o.front, ['n', 's', 'e', 'w'] as const, 's'),
      };
    }
    default:
      return null;
  }
}

/** mulberry32: 32-bit integer PRNG (identical in every engine). */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Layout of the base world before overrides. */
function generateBase(ref: PrevisWorldRef): PrevisWorld {
  const r = rng(ref.seed);
  const range = (a: number, b: number) => a + (b - a) * r();
  const [EW, ED] = ref.extentM;
  const hx = EW / 2;
  const hy = ED / 2;
  const dens = ref.density === 'high' ? 1.3 : ref.density === 'low' ? 0.7 : 1;
  const nsNorth = ref.layout === 'crossroad' || ref.layout === 't_junction';
  const nsSouth = ref.layout === 'crossroad';

  const roads: PrevisWorldBox[] = [{ x: 0, y: 0, w: EW, d: PREVIS_WORLD_ROAD_HALF_M * 2 }];
  if (nsNorth && nsSouth) roads.push({ x: 0, y: 0, w: PREVIS_WORLD_ROAD_HALF_M * 2, d: ED });
  else if (nsNorth) roads.push({ x: 0, y: hy / 2, w: PREVIS_WORLD_ROAD_HALF_M * 2, d: hy });

  const sidewalks: PrevisWorldBox[] = [];
  const walkY = PREVIS_WORLD_ROAD_HALF_M + PREVIS_WORLD_SIDEWALK_M / 2;
  for (const sy of [1, -1]) {
    const crossed = sy > 0 ? nsNorth : nsSouth;
    if (crossed) {
      for (const sx of [1, -1]) sidewalks.push({ x: (sx * (hx + CORRIDOR)) / 2, y: sy * walkY, w: hx - CORRIDOR, d: PREVIS_WORLD_SIDEWALK_M });
      for (const sx of [1, -1]) sidewalks.push({ x: sx * walkY, y: sy * walkY, w: PREVIS_WORLD_SIDEWALK_M, d: PREVIS_WORLD_SIDEWALK_M });
      for (const sx of [1, -1]) sidewalks.push({ x: sx * walkY, y: (sy * (hy + CORRIDOR)) / 2, w: PREVIS_WORLD_SIDEWALK_M, d: hy - CORRIDOR });
    } else {
      sidewalks.push({ x: 0, y: sy * walkY, w: EW, d: PREVIS_WORLD_SIDEWALK_M });
    }
  }

  const crosswalks: PrevisWorldBox[] = [];
  const zc = CORRIDOR + 2;
  for (let i = -5; i <= 5; i++) {
    const o = i * 1.1;
    if (nsNorth || nsSouth) for (const sx of [1, -1]) crosswalks.push({ x: sx * zc, y: o, w: 3, d: 0.55 });
    else crosswalks.push({ x: 0, y: o, w: 3, d: 0.55 });
    if (nsNorth) crosswalks.push({ x: o, y: zc, w: 0.55, d: 3 });
    if (nsSouth) crosswalks.push({ x: o, y: -zc, w: 0.55, d: 3 });
  }

  const laneDashes: PrevisWorldBox[] = [];
  for (let x = CORRIDOR + 6; x < hx; x += 6) for (const s of [-1, 1]) laneDashes.push({ x: s * x, y: 0, w: 3, d: 0.18 });
  for (let y = CORRIDOR + 6; y < hy; y += 6) {
    if (nsNorth) laneDashes.push({ x: 0, y, w: 0.18, d: 3 });
    if (nsSouth) laneDashes.push({ x: 0, y: -y, w: 0.18, d: 3 });
  }

  const buildings: PrevisWorldBuilding[] = [];
  const openSpaces: PrevisWorldOpenSpace[] = [];
  const props: PrevisWorldStreetProp[] = [];
  let bid = 0;
  let pid = 0;
  const addProp = (kind: PrevisWorldStreetPropKind, x: number, y: number, rotDeg: PrevisWorldHeading) =>
    props.push({ id: `p${++pid}`, kind, x, y, rotDeg });
  const addBuilding = (b: Omit<PrevisWorldBuilding, 'id' | 'roofUnits' | 'doorOffset'>) => {
    const roofUnits: PrevisWorldBox[] = [];
    const n = Math.floor(range(0, 3));
    for (let i = 0; i < n; i++) {
      roofUnits.push({ x: b.x + range(-b.w / 4, b.w / 4), y: b.y + range(-b.d / 4, b.d / 4), w: range(1.5, 3.5), d: range(1.5, 3.5) });
    }
    const span = b.front === 'e' || b.front === 'w' ? b.d : b.w;
    buildings.push({ ...b, id: `b${++bid}`, roofUnits, doorOffset: range(-span * 0.3, span * 0.3) });
  };

  const parkQuadrant = ref.layout === 'crossroad' && ref.density !== 'high' ? Math.floor(r() * 4) : -1;
  const quads: Array<[number, number]> = [[1, 1], [-1, 1], [-1, -1], [1, -1]];
  quads.forEach(([sx, sy], qi) => {
    const nsHere = sy > 0 ? nsNorth : nsSouth;
    const x0 = nsHere ? CORRIDOR + 0.5 : 0.5;
    const x1 = hx - 2;
    const y0 = CORRIDOR + 0.5;
    const y1 = hy - 2;
    if (qi === parkQuadrant) {
      openSpaces.push({ kind: 'park', x: (sx * (x0 + x1)) / 2, y: (sy * (y0 + y1)) / 2, w: x1 - x0, d: y1 - y0 });
      for (let i = 0; i < 18 * dens; i++) addProp('tree', sx * range(x0 + 3, x1 - 3), sy * range(y0 + 3, y1 - 3), 0);
      for (let i = 0; i < 4; i++) addProp('bench', sx * range(x0 + 4, x1 - 4), sy * range(y0 + 4, y1 - 4), (Math.floor(range(0, 4)) * 90) as PrevisWorldHeading);
      return;
    }
    const plazaHere = ref.layout === 'plaza' && sy > 0;
    const plazaW = plazaHere ? Math.min(24, x1 - x0 - 8) : 0;
    if (plazaHere) {
      openSpaces.push({ kind: 'plaza', x: sx * (x0 + plazaW / 2), y: y0 + 9, w: plazaW, d: 18 });
      for (let i = 0; i < 3; i++) addProp('bench', sx * range(x0 + 3, x0 + plazaW - 3), range(y0 + 3, y0 + 15), 0);
    }
    const cols: Array<[number, number]> = [];
    for (let x = x0 + (plazaW ? plazaW + 0.5 : 0); x < x1 - 5; ) {
      const w = Math.min(range(8, 14), x1 - x);
      cols.push([x, w]);
      x += w + (r() < 0.25 ? range(3, 4.5) : range(0.4, 1));
    }
    const rows: Array<[number, number]> = [];
    for (let y = y0; y < y1 - 5; ) {
      const d = Math.min(range(11, 16), y1 - y);
      rows.push([y, d]);
      y += d + range(3.5, 5);
    }
    rows.forEach(([y, d], ri) => {
      cols.forEach(([x, w], ci) => {
        if (plazaHere && ri === 0 && x < x0 + plazaW) return;
        const onEW = ri === 0;
        const onNS = nsHere && ci === 0;
        if (!onEW && !onNS && r() < 0.14) return;
        const corner = onEW && onNS;
        const roadDist = Math.min(ri, ci);
        const h = corner ? range(24, 34) : onEW || onNS ? range(8, 20) : range(10, 26) - roadDist * 1.5;
        const front: PrevisWorldFront = onEW || !onNS ? (sy > 0 ? 's' : 'n') : sx > 0 ? 'w' : 'e';
        addBuilding({
          kind: corner ? 'tower' : (onEW || onNS) && r() < 0.8 ? 'storefront' : 'building',
          x: sx * (x + w / 2),
          y: sy * (y + d / 2),
          w,
          d,
          h: Math.max(6, h * dens),
          front,
          setback: corner ? { h: range(10, 16), inset: 1.6 } : r() < 0.25 ? { h: range(6, 10), inset: range(1, 2) } : undefined,
        });
      });
    });
  });

  // Street furniture along the curbs (lamps every 16 m, trees in between), skipping the junction.
  const curb = PREVIS_WORLD_ROAD_HALF_M + 0.7;
  const startX = nsNorth || nsSouth ? CORRIDOR + 4 : 4;
  for (let x = startX; x < hx - 2; x += 16) {
    for (const s of [-1, 1]) {
      for (const side of [-1, 1]) {
        addProp('lamp', s * x, side * curb, side > 0 ? 180 : 0);
        if (x + 8 < hx - 2) addProp('tree', s * (x + 8), side * (curb + 0.6), 0);
      }
    }
  }
  for (let y = CORRIDOR + 4; y < hy - 2; y += 16) {
    for (const side of [-1, 1]) {
      if (nsNorth) {
        addProp('lamp', side * curb, y, side > 0 ? 90 : 270);
        if (y + 8 < hy - 2) addProp('tree', side * (curb + 0.6), y + 8, 0);
      }
      if (nsSouth) {
        addProp('lamp', side * curb, -y, side > 0 ? 90 : 270);
        if (y + 8 < hy - 2) addProp('tree', side * (curb + 0.6), -(y + 8), 0);
      }
    }
  }
  const cars = Math.round(14 * dens * (EW / 120));
  for (let i = 0; i < cars; i++) {
    const alongX = !(nsNorth || nsSouth) || r() < 0.5;
    const lane = (r() < 0.5 ? -1 : 1) * range(2.2, 4.6);
    if (alongX) {
      const t = (r() < 0.5 ? -1 : 1) * range(CORRIDOR + 4, hx - 6);
      addProp('car', t, lane, lane > 0 ? 270 : 90);
    } else {
      const north = nsNorth && (!nsSouth || r() < 0.5);
      const t = (north ? 1 : -1) * range(CORRIDOR + 4, hy - 6);
      addProp('car', lane, t, lane > 0 ? 180 : 0);
    }
  }
  addProp('bus_stop', -(CORRIDOR + 14), -(PREVIS_WORLD_ROAD_HALF_M + 2.4), 0);

  return roundWorld({
    generatorVersion: ref.generatorVersion,
    extentM: [EW, ED],
    roads,
    sidewalks,
    crosswalks,
    laneDashes,
    openSpaces,
    buildings,
    props,
  });
}

function roundBox<T extends PrevisWorldBox>(b: T): T {
  return { ...b, x: r2(b.x), y: r2(b.y), w: r2(b.w), d: r2(b.d) };
}
function roundWorld(w: PrevisWorld): PrevisWorld {
  return {
    ...w,
    roads: w.roads.map(roundBox),
    sidewalks: w.sidewalks.map(roundBox),
    crosswalks: w.crosswalks.map(roundBox),
    laneDashes: w.laneDashes.map(roundBox),
    openSpaces: w.openSpaces.map(roundBox),
    buildings: w.buildings.map((b) => ({
      ...roundBox(b),
      h: r2(b.h),
      doorOffset: r2(b.doorOffset),
      roofUnits: b.roofUnits.map(roundBox),
      ...(b.setback ? { setback: { h: r2(b.setback.h), inset: r2(b.setback.inset) } } : {}),
      ...(b.roof ? { roof: { ...b.roof, h: r2(b.roof.h), eave: r2(b.roof.eave) } } : {}),
    })),
    props: w.props.map((p) => ({ ...p, x: r2(p.x), y: r2(p.y) })),
  };
}

/** Apply user / assistant edits in order. Unknown ids are ignored. */
export function applyPrevisWorldOverrides(world: PrevisWorld, overrides: readonly PrevisWorldOverride[] | undefined): PrevisWorld {
  if (!overrides?.length) return world;
  const removed = new Set<string>();
  const byId = new Map(world.buildings.map((b) => [b.id, { ...b }]));
  const order = world.buildings.map((b) => b.id);
  for (const o of overrides) {
    if (o.op === 'add') {
      if (byId.has(o.id)) continue;
      byId.set(o.id, {
        id: o.id,
        kind: o.kind,
        x: o.x,
        y: o.y,
        w: o.w,
        d: o.d,
        h: o.h,
        front: o.front ?? 's',
        doorOffset: 0,
        roofUnits: [],
        edited: true,
      });
      order.push(o.id);
      continue;
    }
    if (o.op === 'remove') {
      if (byId.has(o.id) || world.props.some((p) => p.id === o.id)) removed.add(o.id);
      continue;
    }
    if (o.op === 'restore') {
      removed.delete(o.id);
      continue;
    }
    const b = byId.get(o.id);
    if (!b) continue;
    if (o.op === 'move') {
      const dx = o.x - b.x;
      const dy = o.y - b.y;
      b.roofUnits = b.roofUnits.map((u) => ({ ...u, x: r2(u.x + dx), y: r2(u.y + dy) }));
      b.x = o.x;
      b.y = o.y;
      if (o.rotDeg != null && (o.rotDeg === 90 || o.rotDeg === 270)) {
        const w = b.w;
        b.w = b.d;
        b.d = w;
        b.roofUnits = [];
      }
      b.edited = true;
    } else if (o.op === 'resize') {
      if (o.w != null) b.w = o.w;
      if (o.d != null) b.d = o.d;
      if (o.h != null) {
        b.h = o.h;
        if (b.setback && b.setback.h >= o.h) delete b.setback;
      }
      b.roofUnits = b.roofUnits.filter((u) => Math.abs(u.x - b.x) < b.w / 2 && Math.abs(u.y - b.y) < b.d / 2);
      b.edited = true;
    }
  }
  return {
    ...world,
    buildings: order.filter((id) => !removed.has(id)).map((id) => byId.get(id)!),
    // Street objects can be removed too (by id).
    props: removed.size ? world.props.filter((p) => !removed.has(p.id)) : world.props,
  };
}

/** World layout for a reference, overrides included. */
/** Default open space for new worlds (worlds made before have none and keep their layout). */
export const PREVIS_WORLD_SPACING_DEFAULT = 0.3;

/**
 * Open space between buildings: each keeps its street front, shrinks along the street by `s` and from the back by
 * 70 % of it; the door, roof units and setback follow.
 */
function spaceBuildings(w: PrevisWorld, s: number): PrevisWorld {
  return {
    ...w,
    buildings: w.buildings.map((b) => {
      const ns = b.front === 'n' || b.front === 's';
      const along = ns ? b.w : b.d;
      const deep = ns ? b.d : b.w;
      const a2 = r2(Math.max(3, along * (1 - s)));
      const d2 = r2(Math.max(3, deep * (1 - s * 0.7)));
      const toFront = b.front === 'n' || b.front === 'e' ? 1 : -1;
      const shift = (toFront * (deep - d2)) / 2;
      const x = ns ? b.x : r2(b.x + shift);
      const y = ns ? r2(b.y + shift) : b.y;
      const w2 = ns ? a2 : d2;
      const dd = ns ? d2 : a2;
      const kx = w2 / b.w;
      const ky = dd / b.d;
      return {
        ...b,
        x,
        y,
        w: w2,
        d: dd,
        doorOffset: r2(clamp(b.doorOffset * (a2 / along), -(a2 / 2 - 0.8), a2 / 2 - 0.8)),
        roofUnits: b.roofUnits.map((u) => ({ x: r2(x + (u.x - b.x) * kx), y: r2(y + (u.y - b.y) * ky), w: r2(u.w * kx), d: r2(u.d * ky) })),
        ...(b.setback ? { setback: { h: b.setback.h, inset: r2(b.setback.inset * Math.min(kx, ky)) } } : {}),
      };
    }),
  };
}

export function generatePrevisWorld(ref: PrevisWorldRef): PrevisWorld {
  const raw = ref.generatorVersion === 'styled-v1' ? generateStyled(ref) : generateBase(ref);
  const base = ref.spacing ? spaceBuildings(raw, ref.spacing) : raw;
  const P = ref.generatorVersion === 'styled-v1' ? ref.styleParams : undefined;
  const corridor = P ? P.roadHalfM + P.sidewalkM : CORRIDOR;
  const roadHalf = P ? P.roadHalfM : PREVIS_WORLD_ROAD_HALF_M;
  const wet = applyPrevisWorldWater(base, ref.water, roadHalf, P ? P.sidewalkM : PREVIS_WORLD_SIDEWALK_M);
  return applyPrevisWorldOverrides(placeLandmarks(wet, ref, corridor, roadHalf), ref.overrides);
}

/** tan() of whole degrees 15–45 without trig (identical in every engine): table at 5° steps, linear between. */
const TAN_5: number[] = [0.2679, 0.364, 0.4663, 0.5774, 0.7002, 0.8391, 1];
function tanDeg(deg: number): number {
  const d = clamp(deg, 15, 45);
  const i = Math.min(5, Math.floor((d - 15) / 5));
  const f = (d - 15 - i * 5) / 5;
  return TAN_5[i] + (TAN_5[i + 1] - TAN_5[i]) * f;
}

/** Styled block: same street layouts as modern-v1, sizes / roofs / street objects from the style parameters. */
function generateStyled(ref: PrevisWorldRef): PrevisWorld {
  const P = ref.styleParams ?? PREVIS_WORLD_STYLE_TEMPLATE;
  const r = rng(ref.seed);
  const range = (a: number, b: number) => a + (b - a) * r();
  const weighted = <K extends string>(w: Record<K, number>): K => {
    const keys = Object.keys(w) as K[];
    let t = r();
    for (const k of keys) {
      t -= w[k];
      if (t < 0) return k;
    }
    return keys[keys.length - 1];
  };
  const [EW, ED] = ref.extentM;
  const hx = EW / 2;
  const hy = ED / 2;
  const RH = P.roadHalfM;
  const SW = P.sidewalkM;
  const COR = RH + SW;
  const dens = ref.density === 'high' ? 1.3 : ref.density === 'low' ? 0.7 : 1;
  const nsNorth = ref.layout === 'crossroad' || ref.layout === 't_junction';
  const nsSouth = ref.layout === 'crossroad';

  const roads: PrevisWorldBox[] = [{ x: 0, y: 0, w: EW, d: RH * 2 }];
  if (nsNorth && nsSouth) roads.push({ x: 0, y: 0, w: RH * 2, d: ED });
  else if (nsNorth) roads.push({ x: 0, y: hy / 2, w: RH * 2, d: hy });

  const sidewalks: PrevisWorldBox[] = [];
  if (SW > 0) {
    const walkY = RH + SW / 2;
    for (const sy of [1, -1]) {
      const crossed = sy > 0 ? nsNorth : nsSouth;
      if (crossed) {
        for (const sx of [1, -1]) sidewalks.push({ x: (sx * (hx + COR)) / 2, y: sy * walkY, w: hx - COR, d: SW });
        for (const sx of [1, -1]) sidewalks.push({ x: sx * walkY, y: sy * walkY, w: SW, d: SW });
        for (const sx of [1, -1]) sidewalks.push({ x: sx * walkY, y: (sy * (hy + COR)) / 2, w: SW, d: hy - COR });
      } else {
        sidewalks.push({ x: 0, y: sy * walkY, w: EW, d: SW });
      }
    }
  }

  const crosswalks: PrevisWorldBox[] = [];
  const laneDashes: PrevisWorldBox[] = [];
  if (P.markings) {
    const zc = COR + 2;
    const n = Math.max(2, Math.floor(RH / 1.1));
    for (let i = -n; i <= n; i++) {
      const o = i * 1.1;
      if (nsNorth || nsSouth) for (const sx of [1, -1]) crosswalks.push({ x: sx * zc, y: o, w: 3, d: 0.55 });
      else crosswalks.push({ x: 0, y: o, w: 3, d: 0.55 });
      if (nsNorth) crosswalks.push({ x: o, y: zc, w: 0.55, d: 3 });
      if (nsSouth) crosswalks.push({ x: o, y: -zc, w: 0.55, d: 3 });
    }
    for (let x = COR + 6; x < hx; x += 6) for (const s of [-1, 1]) laneDashes.push({ x: s * x, y: 0, w: 3, d: 0.18 });
    for (let y = COR + 6; y < hy; y += 6) {
      if (nsNorth) laneDashes.push({ x: 0, y, w: 0.18, d: 3 });
      if (nsSouth) laneDashes.push({ x: 0, y: -y, w: 0.18, d: 3 });
    }
  }

  const buildings: PrevisWorldBuilding[] = [];
  const openSpaces: PrevisWorldOpenSpace[] = [];
  const props: PrevisWorldStreetProp[] = [];
  const fronts: Array<{ x: number; y: number; rot: PrevisWorldHeading; shop: boolean }> = [];
  let bid = 0;
  let pid = 0;
  const taken: Array<[number, number]> = [];
  const free = (x: number, y: number, m: number) => taken.every(([a, b]) => Math.abs(a - x) > m || Math.abs(b - y) > m);
  const addProp = (kind: PrevisWorldStreetPropKind, x: number, y: number, rotDeg: PrevisWorldHeading, line?: string) => {
    props.push({ id: `p${++pid}`, kind, x, y, rotDeg, ...(line ? { line } : {}) });
    taken.push([x, y]);
  };
  const tan = tanDeg(P.roofPitchDeg);

  const parkQuadrant = ref.layout === 'crossroad' && ref.density !== 'high' ? Math.floor(r() * 4) : -1;
  const quads: Array<[number, number]> = [[1, 1], [-1, 1], [-1, -1], [1, -1]];
  quads.forEach(([sx, sy], qi) => {
    const nsHere = sy > 0 ? nsNorth : nsSouth;
    const x0 = nsHere ? COR + 0.5 : 0.5;
    const x1 = hx - 2;
    const y0 = COR + 0.5;
    const y1 = hy - 2;
    if (qi === parkQuadrant) {
      openSpaces.push({ kind: 'park', x: (sx * (x0 + x1)) / 2, y: (sy * (y0 + y1)) / 2, w: x1 - x0, d: y1 - y0 });
      for (let i = 0; i < 14 * dens; i++) addProp('tree', sx * range(x0 + 3, x1 - 3), sy * range(y0 + 3, y1 - 3), 0);
      return;
    }
    const plazaHere = ref.layout === 'plaza' && sy > 0;
    const plazaW = plazaHere ? Math.min(24, x1 - x0 - 8) : 0;
    if (plazaHere) openSpaces.push({ kind: 'plaza', x: sx * (x0 + plazaW / 2), y: y0 + 9, w: plazaW, d: 18 });
    const cols: Array<[number, number]> = [];
    for (let x = x0 + (plazaW ? plazaW + 0.5 : 0); x < x1 - P.lotWidthM[0] * 0.6; ) {
      const w = Math.min(range(P.lotWidthM[0], P.lotWidthM[1]), x1 - x);
      cols.push([x, w]);
      x += w + range(P.gapM[0], P.gapM[1]);
    }
    const rows: Array<[number, number]> = [];
    for (let y = y0; y < y1 - P.lotDepthM[0] * 0.6; ) {
      const d = Math.min(range(P.lotDepthM[0], P.lotDepthM[1]), y1 - y);
      rows.push([y, d]);
      y += d + range(1.5, 3.5);
    }
    rows.forEach(([y, d], ri) => {
      cols.forEach(([x, w], ci) => {
        if (plazaHere && ri === 0 && x < x0 + plazaW) return;
        const onEW = ri === 0;
        const onNS = nsHere && ci === 0;
        if (!onEW && !onNS && r() < P.vacancy) return;
        const corner = onEW && onNS;
        const fl = Math.round(range(P.floors[0], P.floors[1] + 0.99) - 0.49);
        const floors = Math.max(1, corner ? Math.max(fl, P.floors[1]) : fl);
        const front: PrevisWorldFront = onEW || !onNS ? (sy > 0 ? 's' : 'n') : sx > 0 ? 'w' : 'e';
        const shop = (onEW || onNS) && r() < P.shopRatio;
        const roofKind = weighted(P.roofs);
        const tint = weighted(P.tints);
        const bx = sx * (x + w / 2);
        const by = sy * (y + d / 2);
        const ridge: 'x' | 'y' = front === 'n' || front === 's' ? 'x' : 'y';
        const span = ridge === 'x' ? d : w;
        const b: PrevisWorldBuilding = {
          id: `b${++bid}`,
          kind: shop ? 'storefront' : 'building',
          x: bx,
          y: by,
          w,
          d,
          h: floors * P.floorHeightM,
          front,
          doorOffset: range(-(ridge === 'x' ? w : d) * 0.3, (ridge === 'x' ? w : d) * 0.3),
          roofUnits: [],
          tint,
        };
        // Roof no taller than half the walls (deep lots with steep pitches would tower over the street).
        if (roofKind !== 'flat') b.roof = { kind: roofKind, h: Math.min((span / 2) * tan, Math.max(2.5, b.h * 0.5)), ridge, eave: P.eaveM };
        // Only drawn when the style asks for it, so worlds without the parameter keep their random sequence.
        else if (P.towerSetback && floors >= 10 && r() < P.towerSetback) {
          const inset = Math.min(range(1.5, 3), Math.min(w, d) * 0.2);
          b.setback = { h: Math.round(floors * range(0.55, 0.8)) * P.floorHeightM, inset };
        } else if (r() < 0.5) b.roofUnits.push({ x: bx + range(-w / 4, w / 4), y: by + range(-d / 4, d / 4), w: range(1.2, 2.6), d: range(1.2, 2.6) });
        buildings.push(b);
        if (onEW || onNS) {
          const fx = front === 'e' ? 1 : front === 'w' ? -1 : 0;
          const fy = front === 'n' ? 1 : front === 's' ? -1 : 0;
          const rot: PrevisWorldHeading = front === 's' ? 180 : front === 'n' ? 0 : front === 'e' ? 90 : 270;
          fronts.push({ x: bx + fx * (w / 2 + 0.45), y: by + fy * (d / 2 + 0.45), rot, shop });
        }
      });
    });
  });

  // Street objects along each street edge, spaced by density (per 100 m), skipping the junction.
  const edgeOff = RH + (SW > 0 ? Math.min(0.7, SW / 2) : 0.35);
  const edges: Array<{ along: 'x' | 'y'; fixed: number; from: number; to: number; sign: 1 | -1 }> = [];
  const ewStart = nsNorth || nsSouth ? COR + 3 : 3;
  for (const s of [-1, 1] as const) {
    for (const side of [-1, 1] as const) edges.push({ along: 'x', fixed: side * edgeOff, from: s > 0 ? ewStart : -(hx - 2), to: s > 0 ? hx - 2 : -ewStart, sign: side });
  }
  for (const side of [-1, 1] as const) {
    if (nsNorth) edges.push({ along: 'y', fixed: side * edgeOff, from: COR + 3, to: hy - 2, sign: side });
    if (nsSouth) edges.push({ along: 'y', fixed: side * edgeOff, from: -(hy - 2), to: -(COR + 3), sign: side });
  }
  const linear: Array<'lamp' | 'utility_pole' | 'tree' | 'bench'> = ['utility_pole', 'lamp', 'tree', 'bench'];
  edges.forEach((e, ei) => {
    for (const kind of linear) {
      const per100 = P.props[kind] * (kind === 'tree' || kind === 'bench' ? dens : 1);
      if (per100 <= 0) continue;
      // Poles run on one side of each street only.
      if (kind === 'utility_pole' && e.sign < 0) continue;
      const step = 100 / per100;
      const line = kind === 'utility_pole' ? `w${ei}` : undefined;
      for (let t = e.from + range(0, step); t < e.to; t += step * range(0.85, 1.15)) {
        const x = e.along === 'x' ? t : e.fixed;
        const y = e.along === 'x' ? e.fixed : t;
        if (!free(x, y, 1.4)) continue;
        const rot: PrevisWorldHeading = e.along === 'x' ? (e.sign > 0 ? 180 : 0) : e.sign > 0 ? 90 : 270;
        addProp(kind === 'bench' ? 'bench' : kind, x, y, rot, line);
      }
    }
  });
  // Objects against the shop fronts.
  const frontKinds: Array<'lantern' | 'vending_machine' | 'planter' | 'barrel'> = ['lantern', 'vending_machine', 'planter', 'barrel'];
  for (const kind of frontKinds) {
    const per100 = P.props[kind];
    if (per100 <= 0) continue;
    const chance = clamp((per100 * 8) / 100, 0, 0.9);
    for (const f of fronts) {
      if (kind === 'lantern' && !f.shop) continue;
      if (r() >= chance || !free(f.x, f.y, 1.1)) continue;
      const jitter = range(-1.5, 1.5);
      const along = f.rot === 0 || f.rot === 180;
      addProp(kind, along ? f.x + jitter : f.x, along ? f.y : f.y + jitter, f.rot);
    }
  }
  if (RH >= 2.8 && P.props.car > 0) {
    const cars = Math.round((P.props.car * dens * EW) / 100);
    for (let i = 0; i < cars; i++) {
      const alongX = !(nsNorth || nsSouth) || r() < 0.5;
      const lane = (r() < 0.5 ? -1 : 1) * range(RH * 0.35, RH * 0.75);
      if (alongX) {
        const t = (r() < 0.5 ? -1 : 1) * range(COR + 4, hx - 6);
        addProp('car', t, lane, lane > 0 ? 270 : 90);
      } else {
        const north = nsNorth && (!nsSouth || r() < 0.5);
        const t = (north ? 1 : -1) * range(COR + 4, hy - 6);
        addProp('car', lane, t, lane > 0 ? 180 : 0);
      }
    }
  }

  const world = roundWorld({
    generatorVersion: 'styled-v1',
    extentM: [EW, ED],
    roads,
    sidewalks,
    crosswalks,
    laneDashes,
    openSpaces,
    buildings,
    props,
  });
  return { ...world, look: { style: ref.style, roadSurface: P.roadSurface, shopFront: P.shopFront } };
}

const COS_SIN: Record<PrevisWorldHeading, [number, number]> = { 0: [1, 0], 90: [0, 1], 180: [-1, 0], 270: [0, -1] };

/** Stage coordinates (x right, y away from the entrance) → world coordinates. */
export function previsStageToWorld(anchor: PrevisWorldStageAnchor, x: number, y: number): { x: number; y: number } {
  const [c, s] = COS_SIN[anchor.headingDeg];
  return { x: r2(anchor.x + c * x - s * y), y: r2(anchor.y + s * x + c * y) };
}

/** World coordinates → stage coordinates. */
export function previsWorldToStage(anchor: PrevisWorldStageAnchor, x: number, y: number): { x: number; y: number } {
  const [c, s] = COS_SIN[anchor.headingDeg];
  const dx = x - anchor.x;
  const dy = y - anchor.y;
  return { x: r2(c * dx + s * dy), y: r2(-s * dx + c * dy) };
}

/** Axis-aligned stage rectangle in world coordinates. */
export function previsStageRectInWorld(anchor: PrevisWorldStageAnchor, stage: { width: number; depth: number }): PrevisWorldBox {
  const swap = anchor.headingDeg === 90 || anchor.headingDeg === 270;
  return { x: anchor.x, y: anchor.y, w: swap ? stage.depth : stage.width, d: swap ? stage.width : stage.depth };
}

const FRONT_TURN: Record<PrevisWorldFront, number> = { n: 0, e: 90, s: 180, w: 270 };

export interface PrevisWorldStageObject {
  id: string;
  source: 'building' | 'prop';
  kind: PrevisWorldBuildingKind | PrevisWorldStreetPropKind;
  /** Stage coordinates. */
  x: number;
  y: number;
  w: number;
  d: number;
  h: number;
  /** Facing in stage degrees (0 = stage +y), like previs props. Buildings: the street front. */
  facing: number;
  /** Buildings with a street door: door centre in stage coordinates. */
  door?: { x: number; y: number };
}

export const PREVIS_WORLD_PROP_SIZE: Record<PrevisWorldStreetPropKind, { w: number; d: number; h: number }> = {
  lamp: { w: 0.3, d: 0.3, h: 6 },
  tree: { w: 0.8, d: 0.8, h: 5.8 },
  car: { w: 1.8, d: 4.3, h: 1.5 },
  bench: { w: 1.8, d: 0.5, h: 0.5 },
  bus_stop: { w: 4.2, d: 1.6, h: 2.7 },
  utility_pole: { w: 0.35, d: 0.35, h: 8.5 },
  lantern: { w: 0.45, d: 0.45, h: 2.4 },
  vending_machine: { w: 1, d: 0.8, h: 1.85 },
  planter: { w: 0.7, d: 0.5, h: 0.8 },
  barrel: { w: 0.6, d: 0.6, h: 0.85 },
};
const PROP_SIZE = PREVIS_WORLD_PROP_SIZE;

/**
 * World objects whose footprint touches the stage rectangle expanded by `marginM`, in stage coordinates
 * (the previs settle chain treats them as fixed obstacles / doorways).
 */
export function previsWorldObjectsNearStage(
  world: PrevisWorld,
  anchor: PrevisWorldStageAnchor,
  stage: { width: number; depth: number },
  marginM = 0,
): PrevisWorldStageObject[] {
  const rect = previsStageRectInWorld(anchor, stage);
  const touches = (b: PrevisWorldBox) =>
    Math.abs(b.x - rect.x) < (b.w + rect.w) / 2 + marginM && Math.abs(b.y - rect.y) < (b.d + rect.d) / 2 + marginM;
  const swap = anchor.headingDeg === 90 || anchor.headingDeg === 270;
  const toStageFacing = (worldDeg: number) => (((worldDeg - (360 - anchor.headingDeg)) % 360) + 360) % 360;
  const out: PrevisWorldStageObject[] = [];
  for (const b of world.buildings) {
    if (!touches(b)) continue;
    const c = previsWorldToStage(anchor, b.x, b.y);
    const f = FRONT_TURN[b.front];
    const ew = b.front === 'e' || b.front === 'w';
    const fx = b.front === 'e' ? 1 : b.front === 'w' ? -1 : 0;
    const fy = b.front === 'n' ? 1 : b.front === 's' ? -1 : 0;
    const doorW = { x: b.x + fx * (b.w / 2) + (ew ? 0 : b.doorOffset), y: b.y + fy * (b.d / 2) + (ew ? b.doorOffset : 0) };
    out.push({
      id: b.id,
      source: 'building',
      kind: b.kind,
      x: c.x,
      y: c.y,
      w: swap ? b.d : b.w,
      d: swap ? b.w : b.d,
      h: b.h,
      facing: toStageFacing(f),
      door: previsWorldToStage(anchor, doorW.x, doorW.y),
    });
  }
  for (const p of world.props) {
    const size = PROP_SIZE[p.kind];
    const rot = p.rotDeg === 90 || p.rotDeg === 270;
    const box = { x: p.x, y: p.y, w: rot ? size.d : size.w, d: rot ? size.w : size.d };
    if (!touches(box)) continue;
    const c = previsWorldToStage(anchor, p.x, p.y);
    out.push({
      id: p.id,
      source: 'prop',
      kind: p.kind,
      x: c.x,
      y: c.y,
      w: swap ? box.d : box.w,
      d: swap ? box.w : box.d,
      h: size.h,
      facing: toStageFacing(p.rotDeg),
    });
  }
  return out;
}
