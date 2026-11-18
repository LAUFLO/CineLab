// Water in a 3D Director world, applied after the blocks are generated (worlds without water are unchanged):
// - river: a band across the main street (north–south) with a road bridge and railings along both banks;
// - river_along: a river parallel to the main street at the south edge of town, a row of lots between them;
//   side streets cross it on road bridges;
// - canal: the main road is water, walkways on both sides, footbridges across it (Venice / Amsterdam);
// - waterfront: south of the street is the sea or a lake behind a railing.
// Railings (`quays`) become fixed props when stories are planned, so nobody walks into the water.

/** Floor box (same shape as the generator's boxes; kept local so this module does not import the generator). */
export interface PrevisWorldBox {
  x: number;
  y: number;
  w: number;
  d: number;
}

/** The parts of a generated world that water changes. */
interface WorldParts {
  extentM: [number, number];
  roads: PrevisWorldBox[];
  sidewalks: PrevisWorldBox[];
  crosswalks: PrevisWorldBox[];
  laneDashes: PrevisWorldBox[];
  buildings: PrevisWorldBox[];
  props: Array<{ x: number; y: number; kind: string }>;
  openSpaces: PrevisWorldBox[];
}

export const PREVIS_WORLD_WATER_KINDS = ['river', 'river_along', 'canal', 'waterfront'] as const;
export type PrevisWorldWaterKind = (typeof PREVIS_WORLD_WATER_KINDS)[number];

export interface PrevisWorldWaterRef {
  kind: PrevisWorldWaterKind;
  /** River width (m); default 18. */
  widthM?: number;
}

export interface PrevisWorldBridge extends PrevisWorldBox {
  /** Footbridge (canal) rather than the road bridge. */
  foot?: boolean;
}

/** A railing along water; `foot` = the side of a footbridge (drawn with the bridge, kept for planning). */
export interface PrevisWorldQuay extends PrevisWorldBox {
  foot?: boolean;
}

const r2 = (v: number) => Math.round(v * 100) / 100 + 0;
const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

export function normalizePrevisWorldWaterRef(raw: unknown): PrevisWorldWaterRef | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const o = raw as Record<string, unknown>;
  const kind = String(o.kind);
  if (!(PREVIS_WORLD_WATER_KINDS as readonly string[]).includes(kind)) return undefined;
  const out: PrevisWorldWaterRef = { kind: kind as PrevisWorldWaterKind };
  if ((kind === 'river' || kind === 'river_along') && typeof o.widthM === 'number' && Number.isFinite(o.widthM)) out.widthM = r2(clamp(o.widthM, 10, 30));
  return out;
}

const overlaps = (a: PrevisWorldBox, b: PrevisWorldBox, pad = 0) =>
  Math.abs(a.x - b.x) < (a.w + b.w) / 2 + pad && Math.abs(a.y - b.y) < (a.d + b.d) / 2 + pad;

/** Boxes with the x-range [x0, x1] cut out (pieces shorter than 0.5 m dropped). */
function cutX(boxes: PrevisWorldBox[], x0: number, x1: number): PrevisWorldBox[] {
  const out: PrevisWorldBox[] = [];
  for (const b of boxes) {
    const a = b.x - b.w / 2;
    const e = b.x + b.w / 2;
    if (e <= x0 || a >= x1) {
      out.push(b);
      continue;
    }
    if (x0 - a >= 0.5) out.push({ ...b, x: r2((a + x0) / 2), w: r2(x0 - a) });
    if (e - x1 >= 0.5) out.push({ ...b, x: r2((x1 + e) / 2), w: r2(e - x1) });
  }
  return out;
}

/** Boxes with the y-range [y0, y1] cut out. */
function cutY(boxes: PrevisWorldBox[], y0: number, y1: number): PrevisWorldBox[] {
  const out: PrevisWorldBox[] = [];
  for (const b of boxes) {
    const a = b.y - b.d / 2;
    const e = b.y + b.d / 2;
    if (e <= y0 || a >= y1) {
      out.push(b);
      continue;
    }
    if (y0 - a >= 0.5) out.push({ ...b, y: r2((a + y0) / 2), d: r2(y0 - a) });
    if (e - y1 >= 0.5) out.push({ ...b, y: r2((y1 + e) / 2), d: r2(e - y1) });
  }
  return out;
}

/** Railing segments along x at `y` from x0 to x1, leaving gaps where bridges land. */
function railAlongX(y: number, x0: number, x1: number, gaps: Array<[number, number]>): PrevisWorldBox[] {
  const out: PrevisWorldBox[] = [];
  let cursor = x0;
  for (const [a, b] of [...gaps].sort((p, q) => p[0] - q[0])) {
    if (a - cursor >= 0.5) out.push({ x: r2((cursor + a) / 2), y: r2(y), w: r2(a - cursor), d: 0.15 });
    cursor = Math.max(cursor, b);
  }
  if (x1 - cursor >= 0.5) out.push({ x: r2((cursor + x1) / 2), y: r2(y), w: r2(x1 - cursor), d: 0.15 });
  return out;
}

/** Add water to a generated world (`roadHalf` / `sidewalk` of its main street). */
export function applyPrevisWorldWater<W extends WorldParts>(
  world: W,
  water: PrevisWorldWaterRef | undefined,
  roadHalf: number,
  sidewalk: number,
): W & { water?: PrevisWorldBox[]; bridges?: PrevisWorldBridge[]; quays?: PrevisWorldQuay[] } {
  if (!water) return world;
  const [EW, ED] = world.extentM;
  const hx = EW / 2;
  const hy = ED / 2;
  const COR = roadHalf + sidewalk;
  let { roads, sidewalks, crosswalks, laneDashes, buildings, props, openSpaces } = world;
  const pools: PrevisWorldBox[] = [];
  const bridges: PrevisWorldBridge[] = [];
  const quays: PrevisWorldQuay[] = [];
  const clear = (area: PrevisWorldBox, keepCars = false) => {
    buildings = buildings.filter((b) => !overlaps(b, area, 0.5));
    props = props.filter((p) => (keepCars && p.kind === 'car') || !overlaps({ x: p.x, y: p.y, w: 1, d: 1 }, area));
    openSpaces = openSpaces.filter((o) => !overlaps(o, area));
    crosswalks = crosswalks.filter((c) => !overlaps(c, area));
    laneDashes = laneDashes.filter((c) => !overlaps(c, area));
  };

  if (water.kind === 'river') {
    const width = water.widthM ?? 18;
    // East of the centre (the stage usually sits near it), clear of the side street.
    const xr = r2(Math.min(hx - width / 2 - 4, Math.max(COR + width / 2 + 6, EW * 0.22)));
    const band = { x: xr, y: 0, w: width, d: ED };
    clear(band);
    roads = cutX(roads, xr - width / 2, xr + width / 2);
    sidewalks = cutX(sidewalks, xr - width / 2, xr + width / 2);
    pools.push(band);
    bridges.push({ x: xr, y: 0, w: r2(width + 1), d: r2(2 * COR) });
    for (const sx of [-1, 1]) {
      const x = r2(xr + (sx * width) / 2);
      quays.push({ x, y: r2(-(hy + COR) / 2), w: 0.15, d: r2(hy - COR) }, { x, y: r2((hy + COR) / 2), w: 0.15, d: r2(hy - COR) });
    }
    for (const sy of [-1, 1]) quays.push({ x: xr, y: r2(sy * (COR - 0.1)), w: r2(width + 1), d: 0.15 });
  } else if (water.kind === 'river_along') {
    // Keep at least one row of lots between the main street and the river; the far bank stays inside the world.
    const width = Math.min(water.widthM ?? 16, Math.max(8, hy - COR - 14));
    const yc = r2(-Math.max(COR + 10 + width / 2, hy - width / 2 - 4));
    const y0 = yc - width / 2;
    const y1 = yc + width / 2;
    const band = { x: 0, y: yc, w: EW, d: width };
    clear(band);
    pools.push(band);
    const crossing = roads.filter((r) => r.d > r.w && r.y - r.d / 2 < y1 && r.y + r.d / 2 > y0);
    const gaps: Array<[number, number]> = [];
    for (const r of crossing) {
      bridges.push({ x: r.x, y: yc, w: r.w, d: r2(width + 1) });
      gaps.push([r.x - r.w / 2, r.x + r.w / 2]);
    }
    roads = [...roads.filter((r) => !crossing.includes(r)), ...cutY(crossing, y0, y1)];
    sidewalks = cutY(sidewalks, y0, y1);
    for (const y of [y0, y1]) quays.push(...railAlongX(r2(y), -hx, hx, gaps));
    for (const b of bridges) {
      for (const sx of [-1, 1]) quays.push({ x: r2(b.x + (sx * b.w) / 2), y: yc, w: 0.15, d: r2(width) });
    }
  } else if (water.kind === 'canal') {
    const band = { x: 0, y: 0, w: EW, d: 2 * roadHalf };
    clear(band);
    // The main road becomes the canal; side streets cross it on road bridges.
    roads = cutY(roads.filter((r) => !(Math.abs(r.y) < 0.01 && r.d <= 2 * roadHalf + 0.01 && r.w >= EW - 0.01)), -roadHalf, roadHalf);
    pools.push(band);
    const crossing = world.roads.filter((r) => r.d > r.w);
    const gaps: Array<[number, number]> = [];
    for (const r of crossing) {
      bridges.push({ x: r.x, y: 0, w: r.w, d: r2(2 * roadHalf + 1) });
      gaps.push([r.x - r.w / 2, r.x + r.w / 2]);
    }
    for (let x = -hx + 14; x < hx - 8; x += 34) {
      if (gaps.some(([a, b]) => x + 2 > a - 6 && x - 2 < b + 6)) continue;
      bridges.push({ x: r2(x), y: 0, w: 3, d: r2(2 * roadHalf + 1), foot: true });
      gaps.push([x - 1.5, x + 1.5]);
    }
    for (const sy of [-1, 1]) quays.push(...railAlongX(sy * roadHalf, -hx, hx, gaps));
    // Bridge sides: people on a bridge stay on it until they reach the other walkway.
    for (const b of bridges) {
      for (const sx of [-1, 1]) quays.push({ x: r2(b.x + (sx * b.w) / 2), y: 0, w: 0.15, d: r2(2 * roadHalf), ...(b.foot ? { foot: true } : {}) });
    }
  } else {
    const top = -COR;
    const area = { x: 0, y: r2((-hy + top) / 2), w: EW, d: r2(hy + top) };
    clear(area);
    roads = cutY(roads, -hy, top);
    sidewalks = cutY(sidewalks, -hy, top);
    pools.push(area);
    quays.push({ x: 0, y: r2(top - 0.1), w: EW, d: 0.15 });
  }
  return { ...world, roads, sidewalks, crosswalks, laneDashes, buildings, props, openSpaces, water: pools, bridges, quays };
}
