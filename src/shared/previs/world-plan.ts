/**
 * World mode for the previs planner: pick a whitebox world and a stage inside it, turn the nearby world into
 * fixed props (shop doors, lamps, trees, cars) and describe it to the planner. The stage's -x edge is laid on a
 * shopfront facade, so shop doors are doors in the stage edge and the existing doorway logic applies unchanged
 * (people wait just behind the door, out of view, and step out).
 */
import type { PrevisPlan, PrevisProp, PrevisPropKind } from './plan-core';
import { nudgePrevisCameraClear } from './plan-core';
import {
  PREVIS_WORLD_EXTENT_NEW_M,
  PREVIS_WORLD_SPACING_DEFAULT,
  PREVIS_WORLD_LAYOUTS,
  PREVIS_WORLD_ROAD_HALF_M,
  PREVIS_WORLD_SIDEWALK_M,
  PREVIS_WORLD_TIMES,
  PREVIS_WORLD_DENSITIES,
  generatePrevisWorld,
  normalizePrevisWorldRef,
  previsWorldObjectsNearStage,
  previsStageToWorld,
  previsWorldToStage,
  type PrevisWorld,
  type PrevisWorldLayout,
  type PrevisWorldRef,
  type PrevisWorldStageAnchor,
  type PrevisWorldStreetPropKind,
  type PrevisWorldTimeOfDay,
} from './world-gen';

/** World-mode stage on a modern street: 14 m across the street (x), 18 m along it (y). */
export const PREVIS_WORLD_STAGE = { width: 14, depth: 18 } as const;

/** Street geometry of a world as the planner sees it (modern values match the original constants). */
export interface PrevisWorldGeometry {
  roadHalf: number;
  sidewalk: number;
  corridor: number;
  /** World y of the north shopfront facades (first lot row). */
  facadeY: number;
  stage: { width: number; depth: number };
  /** Styled streets are narrow: the stage spans both shop rows and there is no across-the-road stage. */
  styled: boolean;
  streetLabel: string;
  roadLabel: string;
}

const r2g = (v: number) => Math.round(v * 100) / 100;

export function previsWorldGeometry(ref: PrevisWorldRef): PrevisWorldGeometry {
  const P = ref.generatorVersion === 'styled-v1' ? ref.styleParams : undefined;
  if (!P) {
    const corridor = PREVIS_WORLD_ROAD_HALF_M + PREVIS_WORLD_SIDEWALK_M;
    return {
      roadHalf: PREVIS_WORLD_ROAD_HALF_M,
      sidewalk: PREVIS_WORLD_SIDEWALK_M,
      corridor,
      facadeY: r2g(corridor + 0.5),
      stage: { width: PREVIS_WORLD_STAGE.width, depth: PREVIS_WORLD_STAGE.depth },
      styled: false,
      streetLabel: 'modern city street',
      roadLabel: 'Road with two lanes',
    };
  }
  const corridor = P.roadHalfM + P.sidewalkM;
  const facadeY = r2g(corridor + 0.5);
  const width = Math.min(PREVIS_WORLD_STAGE.width, Math.round(facadeY * 2 * 10) / 10);
  const streetLabel =
    ref.style === 'edo'
      ? 'Edo-period Japanese town street with wooden shophouses'
      : ref.style === 'jp_modern'
        ? 'narrow Japanese neighbourhood street'
        : `${(ref.styleName || 'custom').replace(/["\n]/g, ' ')} street`;
  const roadLabel =
    P.roadSurface === 'dirt'
      ? 'Unpaved dirt road (no cars; people walk on it)'
      : P.roadHalfM >= 10
        ? 'Wide boulevard with several lanes each way'
        : P.roadHalfM >= 5
        ? 'Road with two lanes'
        : 'Narrow road (room for one car)';
  return { roadHalf: P.roadHalfM, sidewalk: P.sidewalkM, corridor, facadeY, stage: { width, depth: PREVIS_WORLD_STAGE.depth }, styled: true, streetLabel, roadLabel };
}

const MODERN_GEO = previsWorldGeometry({ generatorVersion: 'modern-v1' } as PrevisWorldRef);

export interface PrevisWorldHints {
  layout: PrevisWorldLayout;
  timeOfDay: PrevisWorldTimeOfDay;
  /** The text happens at a junction / crossing: keep the crossing in the stage. */
  nearJunction: boolean;
  /** Someone goes into / hides in an alley: keep a facade gap in the stage. */
  wantsAlley: boolean;
  /** Someone crosses the road: the stage spans the road at a zebra crossing. */
  crossing: boolean;
}

const JUNCTION_RE = /十字路口|路口|crossroads?|intersection/i;
const CROSSING_RE = /过马路|穿过马路|横穿马路|走过马路|斑马线|红绿灯|crosswalk|zebra|cross(?:es|ing)? the (?:road|street)/i;
const T_JUNCTION_RE = /丁字路口|t-junction|t junction/i;
const PLAZA_RE = /广场|plaza|town square|\bsquare\b/i;
const ALLEY_RE = /巷|胡同|弄堂|alley|backstreet/i;
const NIGHT_RE = /夜|晚上|深夜|凌晨|night|midnight/i;
const DUSK_RE = /傍晚|黄昏|日落|夕阳|dusk|sunset|evening/i;

export function inferPrevisWorldHints(story: string): PrevisWorldHints {
  const text = String(story || '');
  const layout: PrevisWorldLayout = T_JUNCTION_RE.test(text)
    ? 't_junction'
    : JUNCTION_RE.test(text)
      ? 'crossroad'
      : PLAZA_RE.test(text)
        ? 'plaza'
        : 'street';
  const timeOfDay: PrevisWorldTimeOfDay = NIGHT_RE.test(text) ? 'night' : DUSK_RE.test(text) ? 'dusk' : 'day';
  return {
    layout,
    timeOfDay,
    nearJunction: layout === 'crossroad' || layout === 't_junction',
    wantsAlley: ALLEY_RE.test(text),
    crossing: CROSSING_RE.test(text),
  };
}

function seedFromText(text: string): number {
  let h = 0x811c9dc5;
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return (h % 2147483646) + 1;
}

interface DoorAt {
  id: string;
  x: number;
}

/** Gaps between buildings of the north facade row (world x intervals), at least `min` metres wide. */
function northFacadeGaps(world: PrevisWorld, min: number, facadeY: number): Array<[number, number]> {
  const spans = world.buildings
    .filter((b) => b.front === 's' && Math.abs(b.y - b.d / 2 - facadeY) < 0.05)
    .map((b) => [b.x - b.w / 2, b.x + b.w / 2] as [number, number])
    .sort((p, q) => p[0] - q[0]);
  const gaps: Array<[number, number]> = [];
  for (let i = 1; i < spans.length; i++) if (spans[i][0] - spans[i - 1][1] >= min) gaps.push([spans[i - 1][1], spans[i][0]]);
  return gaps;
}

/** Street doors in the north facade row (world x of each door). */
function northFacadeDoors(world: PrevisWorld, facadeY: number): DoorAt[] {
  return world.buildings
    .filter((b) => b.front === 's' && Math.abs(b.y - b.d / 2 - facadeY) < 0.05)
    .map((b) => ({ id: b.id, x: b.x + b.doorOffset }))
    .sort((a, b) => a.x - b.x);
}

/**
 * Stage on the north sidewalk with its -x edge on the shopfront facade (heading 270: stage +y runs east,
 * stage +x points across the street). Along the street the stage covers the most shop doors (or the crossing).
 */
export function choosePrevisWorldStageAnchor(
  world: PrevisWorld,
  hints: PrevisWorldHints,
  geo: PrevisWorldGeometry = MODERN_GEO,
  focusX?: number,
): PrevisWorldStageAnchor {
  const HW = geo.stage.width / 2;
  const HD = geo.stage.depth / 2;
  const CORRIDOR = geo.corridor;
  const ay = Math.round((geo.facadeY - HW) * 100) / 100;
  const hx = world.extentM[0] / 2;
  const doors = northFacadeDoors(world, geo.facadeY);
  const minX = -hx + HD + 1;
  const maxX = hx - HD - 1;
  if (typeof focusX === 'number' && Number.isFinite(focusX)) {
    // The user picked where the scene happens: centre the stage there (clamped to the world).
    const ax = Math.max(minX, Math.min(maxX, focusX));
    return { x: Math.round(ax * 100) / 100, y: ay, headingDeg: 270 };
  }
  if (hints.crossing && !geo.styled) {
    // Stage spans the road (stage y = north) at a zebra crossing: the junction crossing east of the side
    // street, or the mid-block crossing on a plain street.
    const cx = world.roads.length > 1 ? CORRIDOR + 2 + 4 : 0;
    return { x: cx, y: 0, headingDeg: 0 };
  }
  if (hints.nearJunction) {
    // East of the north-south road, keeping the zebra crossing (x ≈ 12) at the stage's west end.
    const ax = Math.min(maxX, CORRIDOR + 0.5 + HD - 2);
    return { x: Math.round(ax * 100) / 100, y: ay, headingDeg: 270 };
  }
  const alleys = hints.wantsAlley ? northFacadeGaps(world, 2.5, geo.facadeY) : [];
  let best = { ax: 0, score: -Infinity };
  for (let ax = Math.ceil(minX); ax <= Math.floor(maxX); ax++) {
    const inside = doors.filter((d) => Math.abs(d.x - ax) <= HD - 1.5).length;
    const alley = alleys.some(([a, b]) => Math.abs((a + b) / 2 - ax) <= HD - 3) ? 1 : 0;
    const score = alley * 1000 + inside * 100 - Math.abs(ax);
    if (score > best.score) best = { ax, score };
  }
  return { x: best.ax, y: ay, headingDeg: 270 };
}

const STREET_PROP_AS: Record<PrevisWorldStreetPropKind, { kind: PrevisPropKind; label: string }> = {
  lamp: { kind: 'pillar', label: '路灯 lamp post' },
  tree: { kind: 'tree', label: '树 tree' },
  car: { kind: 'car', label: '汽车 parked car' },
  bench: { kind: 'chair', label: '长椅 bench' },
  bus_stop: { kind: 'box', label: '公交站 bus stop' },
  utility_pole: { kind: 'pillar', label: '电线杆 utility pole' },
  lantern: { kind: 'box', label: '灯笼 lantern' },
  vending_machine: { kind: 'box', label: '自动售货机 vending machine' },
  planter: { kind: 'box', label: '花盆 planter' },
  barrel: { kind: 'box', label: '木桶 barrel' },
};

/** World objects in / on the stage as fixed previs props (stage coordinates). */
export function previsWorldFixedProps(world: PrevisWorld, anchor: PrevisWorldStageAnchor, geo: PrevisWorldGeometry = MODERN_GEO): PrevisProp[] {
  const HW = geo.stage.width / 2;
  const HD = geo.stage.depth / 2;
  const near = previsWorldObjectsNearStage(world, anchor, geo.stage, 0.2);
  const out: PrevisProp[] = [];
  const facadeStage = anchor.headingDeg === 270;
  let shop = 0;
  for (const o of near) {
    if (!facadeStage || o.source !== 'building' || !o.door) continue;
    // Doors in the facade on the stage's -x edge, far enough from the stage ends to walk through.
    if (Math.abs(o.door.x + HW) > 0.3 || Math.abs(o.door.y) > HD - 0.9) continue;
    shop++;
    const isShop = o.kind === 'storefront';
    out.push({
      id: `door_${o.id}`,
      label: isShop ? `商店${shop} shop door ${shop}` : `楼门${shop} building door ${shop}`,
      kind: 'door',
      x: -HW + 0.15,
      y: o.door.y,
      w: 0.3,
      d: 1.6,
      h: 2.4,
      facing: 90,
      fixed: true,
      worldId: o.id,
    });
  }
  // Gaps in the facade row (alleys, or the side street at a corner) are openings people can disappear into.
  const spans = world.buildings
    .filter((b) => b.front === 's' && Math.abs(b.y - b.d / 2 - geo.facadeY) < 0.05)
    .map((b) => [b.x - b.w / 2 - anchor.x, b.x + b.w / 2 - anchor.x] as [number, number])
    .filter(([a, b]) => b > -HD && a < HD)
    .sort((p, q) => p[0] - q[0]);
  let cursor = -HD;
  let gap = 0;
  const openings: Array<[number, number]> = [];
  for (const [a, b] of facadeStage ? [...spans, [HD, HD] as [number, number]] : []) {
    if (a - cursor >= 1.9) openings.push([cursor, Math.min(a, HD)]);
    cursor = Math.max(cursor, b);
  }
  for (const [a, b] of openings) {
    gap++;
    const atEnd = a <= -HD + 0.01 || b >= HD - 0.01;
    const corner = atEnd && world.roads.length > 1;
    const width = Math.min(4, b - a);
    const y = Math.round((atEnd ? (a <= -HD + 0.01 ? b - width / 2 : a + width / 2) : (a + b) / 2) * 100) / 100;
    out.push({
      id: `opening_${gap}`,
      label: corner ? `路口${gap} street corner` : `小巷${gap} alley`,
      kind: 'door',
      x: -HW + 0.15,
      y,
      w: 0.3,
      d: Math.round(width * 100) / 100,
      h: 3,
      facing: 90,
      fixed: true,
      worldId: `gap_${Math.round(a * 10)}_${Math.round(b * 10)}`,
    });
  }
  // Railings along water (river banks, canal edges, the waterfront) inside the stage: nobody walks into the water.
  const swap = anchor.headingDeg === 90 || anchor.headingDeg === 270;
  (world.quays ?? []).forEach((q, i) => {
    const c = previsWorldToStage(anchor, q.x, q.y);
    const w = swap ? q.d : q.w;
    const d = swap ? q.w : q.d;
    const x0 = Math.max(-HW, c.x - w / 2);
    const x1 = Math.min(HW, c.x + w / 2);
    const y0 = Math.max(-HD, c.y - d / 2);
    const y1 = Math.min(HD, c.y + d / 2);
    if (x1 - x0 < 0.1 || y1 - y0 < 0.1) return;
    out.push({
      id: `quay_${i + 1}`,
      label: '水边栏杆 waterside railing',
      kind: 'railing',
      x: Math.round(((x0 + x1) / 2) * 100) / 100,
      y: Math.round(((y0 + y1) / 2) * 100) / 100,
      w: Math.round((x1 - x0) * 100) / 100,
      d: Math.round((y1 - y0) * 100) / 100,
      h: 1.05,
      fixed: true,
      worldId: `quay_${i + 1}`,
    });
  });
  for (const o of near) {
    if (o.source !== 'prop') continue;
    if (Math.abs(o.x) > HW - 0.2 || Math.abs(o.y) > HD - 0.2) continue;
    const as = STREET_PROP_AS[o.kind as PrevisWorldStreetPropKind];
    out.push({
      id: `world_${o.id}`,
      label: as.label,
      kind: as.kind,
      x: o.x,
      y: o.y,
      w: o.w,
      d: o.d,
      h: o.h,
      facing: o.facing,
      fixed: true,
      worldId: o.id,
    });
  }
  return out;
}

export interface PrevisWorldContext {
  ref: PrevisWorldRef;
  world: PrevisWorld;
  fixed: PrevisProp[];
  geo: PrevisWorldGeometry;
}

/** Settings the client may send with `world` (all optional). */
export interface PrevisWorldRequest {
  layout?: unknown;
  density?: unknown;
  timeOfDay?: unknown;
  seed?: unknown;
  /** An existing world (made in world mode) to plan the story in. */
  ref?: unknown;
  /** Where the user wants the scene (world coordinates); the stage is centred on it along the street. */
  focus?: unknown;
}

const BRIDGE_RE = /桥|橋|bridge/i;
const WATERSIDE_RE = /海边|海滩|海岸|看海|大海|湖边|湖畔|水边|岸边|河边|栏杆|堤|码头|seaside|the sea|lake|shore|waterfront|railing|pier|harbou?r|beach/i;

/** New world for a story (plan mode). */
export function createPrevisWorldContext(story: string, request: PrevisWorldRequest | true | null | undefined): PrevisWorldContext {
  const req = request && request !== true ? request : {};
  const hints = inferPrevisWorldHints(story);
  if (req.ref) {
    const given = normalizePrevisWorldRef(req.ref);
    const base = generatePrevisWorld(given);
    const geo = previsWorldGeometry(given);
    const f = (req.focus && typeof req.focus === 'object' ? req.focus : null) as { x?: unknown } | null;
    let focusX = f && typeof f.x === 'number' && Number.isFinite(f.x) ? f.x : undefined;
    // A story on a bridge happens on the bridge nearest the centre.
    if (focusX === undefined && given.water && given.water.kind !== 'waterfront' && BRIDGE_RE.test(story)) {
      const bridge = [...(base.bridges ?? [])].sort((p, q) => Math.abs(p.x) - Math.abs(q.x))[0];
      if (bridge) focusX = bridge.x;
    }
    let anchor = choosePrevisWorldStageAnchor(base, { ...hints, layout: given.layout, nearJunction: hints.nearJunction && given.layout !== 'street' && given.layout !== 'plaza' }, geo, focusX);
    // By the sea / lake: the stage moves to the water side (its -x edge on the railing above the water).
    if (given.water?.kind === 'waterfront' && anchor.headingDeg === 270 && WATERSIDE_RE.test(story)) anchor = { x: anchor.x, y: -anchor.y, headingDeg: 90 };
    const ref: PrevisWorldRef = { ...given, stageAnchor: anchor };
    return { ref, world: base, fixed: previsWorldFixedProps(base, anchor, geo), geo };
  }
  const layout = (PREVIS_WORLD_LAYOUTS as readonly string[]).includes(String(req.layout)) ? (req.layout as PrevisWorldLayout) : hints.layout;
  const draft = normalizePrevisWorldRef({
    generatorVersion: 'modern-v1',
    seed: typeof req.seed === 'number' ? req.seed : seedFromText(story),
    extentM: [PREVIS_WORLD_EXTENT_NEW_M, PREVIS_WORLD_EXTENT_NEW_M],
    spacing: PREVIS_WORLD_SPACING_DEFAULT,
    layout,
    density: (PREVIS_WORLD_DENSITIES as readonly string[]).includes(String(req.density)) ? req.density : 'medium',
    timeOfDay: (PREVIS_WORLD_TIMES as readonly string[]).includes(String(req.timeOfDay)) ? req.timeOfDay : hints.timeOfDay,
    stageAnchor: { x: 0, y: 0, headingDeg: 270 },
  });
  const base = generatePrevisWorld(draft);
  const anchor = choosePrevisWorldStageAnchor(base, { ...hints, layout, nearJunction: layout === 'crossroad' || layout === 't_junction' });
  const ref: PrevisWorldRef = { ...draft, stageAnchor: anchor };
  return { ref, world: base, fixed: previsWorldFixedProps(base, anchor), geo: MODERN_GEO };
}

/** World of an existing plan (revise mode); throws PrevisWorldError for unreadable settings. */
export function previsWorldContextFromPlan(plan: PrevisPlan): PrevisWorldContext | null {
  if (!plan.set?.world) return null;
  const ref = normalizePrevisWorldRef(plan.set.world);
  const world = generatePrevisWorld(ref);
  const geo = previsWorldGeometry(ref);
  return { ref, world, fixed: previsWorldFixedProps(world, ref.stageAnchor, geo), geo };
}

const LABEL_MAX = 40;

/**
 * Put the world back into a planner reply: stage size, set.world, fixed props with world geometry (the planner
 * may only rename them, e.g. a shop door → "咖啡店"). Other props the planner added are kept.
 */
export function applyPrevisWorldToPlan(plan: PrevisPlan, ctx: PrevisWorldContext): PrevisPlan {
  plan.stage = { width: ctx.geo.stage.width, depth: ctx.geo.stage.depth };
  const weather = ctx.ref.weather === 'rain' ? ' in the rain' : ctx.ref.weather === 'snow' ? ' in the snow' : '';
  const neon = ctx.ref.neon ? ' with neon signs at night' : '';
  plan.set = {
    kind: 'outdoor',
    description:
      plan.set?.description ||
      (ctx.geo.styled ? `A ${ctx.geo.streetLabel}${weather}${neon}.` : `A modern city street with a row of shopfronts on one side${weather}${neon}.`),
    world: ctx.ref,
  };
  const byWorld = new Map<string, PrevisProp>();
  for (const p of plan.props) {
    if (p.worldId) byWorld.set(p.worldId, p);
    else if (p.id.startsWith('door_') || p.id.startsWith('world_')) byWorld.set(p.id.replace(/^(door|world)_/, ''), p);
  }
  const fixedIds = new Set(ctx.fixed.map((f) => f.id));
  const kept = plan.props.filter((p) => !fixedIds.has(p.id) && !(p.worldId && ctx.fixed.some((f) => f.worldId === p.worldId)));
  const fixed = ctx.fixed.map((f) => {
    const mine = byWorld.get(f.worldId ?? '');
    const label = mine?.label?.trim();
    return { ...f, ...(label && label.length <= LABEL_MAX ? { label } : {}) };
  });
  plan.props = [...fixed, ...kept];
  return plan;
}

const fmt = (v: number) => (Math.round(v * 10) / 10).toFixed(1).replace(/\.0$/, '');

/** Prompt lines for the fixed pieces. */
function fixedLines(ctx: PrevisWorldContext): string {
  const lines = ctx.fixed.map((f) =>
    f.id.startsWith('opening_')
      ? `- ${f.id} "${f.label}": an opening in the shopfront wall (${f.label.includes('alley') ? 'an alley between buildings' : 'the side street at the corner'}) at y = ${fmt(f.y)}, ${fmt(f.d)} m wide`
      : f.kind === 'door'
        ? `- ${f.id} "${f.label}": door in the shopfront wall at y = ${fmt(f.y)}, opening onto the sidewalk`
        : `- ${f.id} "${f.label}" (${f.kind}) at x = ${fmt(f.x)}, y = ${fmt(f.y)}`,
  );
  return lines.join('\n') || '- (no fixed pieces inside the stage)';
}

/** Crossing stage (heading 0): stage axes = world axes, y across the road. */
function buildCrossingPromptSection(ctx: PrevisWorldContext, time: string): string {
  const a = ctx.ref.stageAnchor;
  const { stage, corridor: CORRIDOR, facadeY: FACADE_Y } = ctx.geo;
  const HW = stage.width / 2;
  const HD = stage.depth / 2;
  const curb = ctx.geo.roadHalf;
  const crossings = [
    ...new Set(
      ctx.world.crosswalks
        .filter((c) => c.w > 1 && Math.abs(c.y) < 0.6)
        .map((c) => c.x - a.x)
        .filter((x) => Math.abs(x) <= HW)
        .map((x) => fmt(x)),
    ),
  ];
  const sideStreet = ctx.world.roads.length > 1 ? CORRIDOR - a.x : null;
  return `World (fixed, already built — plan inside it, do not move or resize it):
The stage is a ${stage.width} m × ${stage.depth} m piece of a ${ctx.geo.streetLabel} at ${time}, centred on the road. Set "stage" to {"width": ${stage.width}, "depth": ${stage.depth}} and "set.kind" to "outdoor".
- x runs along the street, y runs across it. Compass: east = +x, west = -x, north = +y, south = -y. South sidewalk: y from -${HD} to -${curb}. Road with two lanes: y from -${curb} to ${curb} (centre line y = 0). North sidewalk: y from ${curb} to ${HD}. Shopfronts line both sides just beyond the stage (y = ±${fmt(FACADE_Y)}).
- Zebra crossing${crossings.length ? ` along y at x ≈ ${crossings.join(', ')}, from y = -${curb} to ${curb}` : ': none in the stage'}.${sideStreet !== null && sideStreet > -HW ? ` West of x = ${fmt(sideStreet)} the side street meets this road (a junction).` : ''}
- People crossing the road walk along y on the zebra crossing (wait on the sidewalk first if they wait for the lights); people walking along the street walk along x on a sidewalk. Otherwise nobody stands or walks on the road: only to cross it (briefly) or at a vehicle's door to get in / out.
Fixed set pieces — copy each one into "props" with the same id, position and size:
${fixedLines(ctx)}`;
}

/** Water near the stage, in the planner's words (empty without water). */
function waterLines(ctx: PrevisWorldContext): string {
  const water = ctx.ref.water;
  if (!water) return '';
  const a = ctx.ref.stageAnchor;
  const bridgeYs = (ctx.world.bridges ?? [])
    .map((b) => previsWorldToStage(a, b.x, b.y))
    .filter((p) => Math.abs(p.x) <= ctx.geo.stage.width / 2 + 2 && Math.abs(p.y) <= ctx.geo.stage.depth / 2 + 2);
  const at = (axis: 'x' | 'y') => [...new Set(bridgeYs.map((p) => fmt(p[axis])))].join(', ');
  const along = a.headingDeg === 0 ? 'x' : 'y';
  if (water.kind === 'canal') {
    return `\n- WATER: the "road" between the two walkways is a canal full of water — nobody walks, stands or drives on it; people cross it only on a footbridge${bridgeYs.length ? ` (at ${along} ≈ ${at(along)})` : ' (none in this stage: they stay on their side)'}. Railings run along both canal edges (fixed props).`;
  }
  if (water.kind === 'river') {
    return `\n- WATER: east of here a river crosses the street; the street passes over it on a bridge with railings${bridgeYs.length ? ` (bridge at ${along} ≈ ${at(along)})` : ''}. Off the bridge and beyond the railings is water: nobody goes there.`;
  }
  if (water.kind === 'river_along') {
    return '\n- WATER: a river runs parallel to the street behind the buildings on its south side (it never crosses the street); side streets reach it on bridges. Beyond its railings is water: nobody goes there.';
  }
  return '\n- WATER: south of the street (beyond the south sidewalk) is the sea / a lake behind a railing along the edge: people may stand at the railing and look out, nobody goes past it.';
}

/** Planner prompt section describing the fixed street (English; stage coordinates). */
/** Groups in the story are separate people (the planner otherwise tends to merge "三个人" into one figure). */
const PEOPLE_LINE =
  '\n- PEOPLE: a number of people in the story ("三个人", "two officers") means that many characters, each with its own id, name and path, walking or standing side by side; never one character for a group (no "三人组" / "the trio"). Up to 6 characters here.';

export function buildPrevisWorldPromptSection(ctx: PrevisWorldContext): string {
  return `${streetPromptSection(ctx)}${waterLines(ctx)}${weatherLine(ctx.ref)}${PEOPLE_LINE}`;
}

const THEME_SETTING: Record<NonNullable<PrevisWorldRef['theme']>, string> = {
  mars: 'a research base on Mars — white habitat modules on legs, geodesic domes, connecting tubes and solar panels on rusty ground under an orange sky; people outdoors wear space suits.',
  orbital: 'an orbital space station — a metal deck floating in space with dark towers, lit corridors and a planet below; it is not a city on Earth.',
  future: 'a future city — slender sculpted towers far apart, elevated loop roads and flying craft.',
  cyberpunk: 'a cyberpunk district at night — dark towers covered in neon billboards, glowing lane lines.',
};

/** Weather / neon in the planner's words (empty in clear weather without neon). */
function weatherLine(ref: PrevisWorldRef): string {
  const parts = [
    ref.weather === 'rain' ? 'it is raining' : ref.weather === 'snow' ? 'it is snowing (snow on the ground)' : '',
    ref.neon ? 'neon signs glow on the shopfronts' : '',
  ].filter(Boolean);
  const terrain = [
    ref.slope ? `the street climbs toward the east (about ${Math.round(ref.slope * 100)} % grade)` : '',
    ref.hills ? 'the street rises and falls over gentle hills' : '',
  ].filter(Boolean);
  const slope = terrain.length
    ? `\n- SLOPE: ${terrain.join('; ')}: people walking uphill walk a little slower; heights (camera "h") are above the ground where it stands.`
    : '';
  return (parts.length ? `\n- WEATHER: ${parts.join('; ')}. Mention it in "set.description".` : '') + slope + (ref.theme ? `\n- SETTING: ${THEME_SETTING[ref.theme]} Describe the place that way in "set.description".` : '');
}

function streetPromptSection(ctx: PrevisWorldContext): string {
  const a = ctx.ref.stageAnchor;
  const time = ctx.ref.timeOfDay === 'night' ? 'night' : ctx.ref.timeOfDay === 'dusk' ? 'dusk' : 'daytime';
  if (a.headingDeg === 0) return buildCrossingPromptSection(ctx, time);
  const { stage, styled } = ctx.geo;
  const HW = stage.width / 2;
  const HD = stage.depth / 2;
  if (a.headingDeg === 90) return buildWatersidePromptSection(ctx, time);
  const xOf = (worldY: number) => -(worldY - a.y);
  const curbX = xOf(ctx.geo.roadHalf);
  const roadMidX = xOf(0);
  const crossings = ctx.world.crosswalks
    .filter((c) => c.w > 1 && Math.abs(c.y) < 0.6)
    .map((c) => previsWorldToStage(a, c.x, 0).y)
    .filter((y) => Math.abs(y) <= HD);
  const crossingYs = [...new Set(crossings.map((y) => fmt(y)))];
  return `World (fixed, already built — plan inside it, do not move or resize it):
The stage is a ${stage.width} m × ${stage.depth} m piece of a ${ctx.geo.streetLabel} at ${time}. Set "stage" to {"width": ${stage.width}, "depth": ${stage.depth}} and "set.kind" to "outdoor".
- x runs across the street, y runs along it. Compass: east = +y, west = -y, north = -x (the shopfront side), south = +x (across the road). x = -${HW} is the shopfront wall: nobody passes it except through its doors and openings.${
    styled ? ` x = ${HW} is the shopfront wall across the street (the stage spans the whole street).` : ''
  }
${styled ? styledStreetLines(ctx, HW, curbX, roadMidX, crossingYs) : `- Sidewalk: x from -${HW} to ${fmt(curbX)}. Curb at x = ${fmt(curbX)}. Road with two lanes: x from ${fmt(curbX)} to ${HW} (centre line x = ${fmt(roadMidX)}).${crossingYs.length ? ` Zebra crossing across the road at y ≈ ${crossingYs.join(', ')}.` : ''}
- People walking "along the street" or "along the sidewalk" from the east / west walk along y on the sidewalk (x between -${HW - 1} and ${fmt(curbX - 0.5)}), never across the road; people "crossing the road" cross along x${crossingYs.length ? ' at the zebra crossing' : ''}.`}
- Keep people at least 1.5 m off the shopfront wall (x ≥ -${fmt(HW - 1.5)}) unless the text has them lean on it, stand in a doorway or hide; "路边 / at the roadside / by the curb" means standing near the curb (x ≈ ${fmt(styled && ctx.geo.sidewalk === 0 ? -(HW - 1) : curbX - 0.6)}).
Fixed set pieces — copy each one into "props" with the same id, position and size. You may only change a door's "label" to the shop the text names (for example "咖啡店"):
${fixedLines(ctx)}
Someone who comes out of a shop (or an alley) starts just behind that door or opening, outside the stage (x ≈ -${fmt(HW + 0.8)}, same y), and steps out through it. Someone who goes into a shop, turns into an alley or hides in it walks through that door or opening and ends just behind it (x ≈ -${fmt(HW + 0.8)}, same y as the opening), out of view.`;
}

/** Stage on the waterfront side (heading 90): -x edge on the railing above the water, +x toward the road. */
function buildWatersidePromptSection(ctx: PrevisWorldContext, time: string): string {
  const a = ctx.ref.stageAnchor;
  const { stage } = ctx.geo;
  const HW = stage.width / 2;
  const railX = previsWorldToStage(a, a.x, -ctx.geo.corridor - 0.1).x;
  const curbX = previsWorldToStage(a, a.x, -ctx.geo.roadHalf).x;
  return `World (fixed, already built — plan inside it, do not move or resize it):
The stage is a ${stage.width} m × ${stage.depth} m piece of a waterfront promenade beside a ${ctx.geo.streetLabel} at ${time}. Set "stage" to {"width": ${stage.width}, "depth": ${stage.depth}} and "set.kind" to "outdoor".
- x runs across the street, y runs along it. Compass: east = +y, west = -y, south = -x (the water side), north = +x (across the road). x = ${fmt(railX)} is the railing above the water (the sea / a lake beyond it, x < ${fmt(railX)}): people may stand at it, lean on it and look out, nobody goes past it.
- Promenade (sidewalk): x from ${fmt(railX)} to ${fmt(curbX)}. ${ctx.geo.roadLabel}: x from ${fmt(curbX)} to ${HW}. People walking along the waterfront walk along y on the promenade.
- "At the railing / by the sea / 海边 / 栏杆前" means standing within 1 m of the railing (x ≈ ${fmt(railX + 0.6)}), facing the water (facing 270).
Fixed set pieces — copy each one into "props" with the same id, position and size:
${fixedLines(ctx)}`;
}

/** Street lines for narrow styled streets (both shop rows in the stage). */
function styledStreetLines(ctx: PrevisWorldContext, HW: number, curbX: number, roadMidX: number, crossingYs: string[]): string {
  const { sidewalk, roadLabel } = ctx.geo;
  const farCurbX = roadMidX + (roadMidX - curbX);
  const walk =
    sidewalk > 0
      ? `- Sidewalks: x from -${HW} to ${fmt(curbX)} and from ${fmt(farCurbX)} to ${HW}. ${roadLabel}: x from ${fmt(curbX)} to ${fmt(farCurbX)} (centre line x = ${fmt(roadMidX)}).`
      : `- No sidewalks: the ${roadLabel.toLowerCase()} runs from wall to wall (centre line x = ${fmt(roadMidX)}).`;
  return `${walk}${crossingYs.length ? ` Zebra crossing at y ≈ ${crossingYs.join(', ')}.` : ''}
- People walking "along the street" walk along y (x between -${fmt(HW - 1)} and ${fmt(HW - 1)}); people "crossing the street" cross along x.`;
}

/**
 * Keep camera keys out of solid buildings (the planner and solver do not know the world): a key inside a
 * building footprint (below its roof) moves to the nearest point just outside it. Returns how many moved.
 */
export function keepPrevisCameraOutOfWorld(plan: PrevisPlan, ctx: PrevisWorldContext, margin = 0.4): number {
  const a = ctx.ref.stageAnchor;
  const [c, s] = a.headingDeg === 0 ? [1, 0] : a.headingDeg === 90 ? [0, 1] : a.headingDeg === 180 ? [-1, 0] : [0, -1];
  let moved = 0;
  for (const k of plan.camera.keys) {
    let wx = a.x + c * k.x - s * k.y;
    let wy = a.y + s * k.x + c * k.y;
    let hit = false;
    for (const b of ctx.world.buildings) {
      if (k.h > b.h + (b.roof?.h ?? 0)) continue;
      const dx = wx - b.x;
      const dy = wy - b.y;
      const ox = b.w / 2 + margin - Math.abs(dx);
      const oy = b.d / 2 + margin - Math.abs(dy);
      if (ox <= 0 || oy <= 0) continue;
      if (ox < oy) wx += (dx >= 0 ? 1 : -1) * ox;
      else wy += (dy >= 0 ? 1 : -1) * oy;
      hit = true;
    }
    if (!hit) continue;
    const ddx = wx - a.x;
    const ddy = wy - a.y;
    k.x = Math.round((c * ddx + s * ddy) * 100) / 100;
    k.y = Math.round((-s * ddx + c * ddy) * 100) / 100;
    moved++;
  }
  return moved;
}

/**
 * People never stand in water: a path key in a river / canal / the sea (and not on a bridge) moves to the
 * nearest place to stand — onto a bridge within reach, or just onto the bank. Returns how many keys moved.
 */
export function keepPrevisPeopleOutOfWater(plan: PrevisPlan, ctx: PrevisWorldContext, story = ''): number {
  // A story on a bridge: a key in the water near a bridge goes onto the bridge, not the bank.
  const preferBridge = BRIDGE_RE.test(story);
  const pools = ctx.world.water ?? [];
  if (pools.length === 0) return 0;
  const bridges = ctx.world.bridges ?? [];
  const a = ctx.ref.stageAnchor;
  const within = (p: { x: number; y: number }, b: { x: number; y: number; w: number; d: number }, m = 0) =>
    Math.abs(p.x - b.x) <= b.w / 2 - m && Math.abs(p.y - b.y) <= b.d / 2 - m;
  let moved = 0;
  for (const c of plan.characters) {
    for (const k of c.path) {
      const p = previsStageToWorld(a, k.x, k.y);
      const pool = pools.find((w) => within(p, w));
      if (!pool || bridges.some((b) => within(p, b))) continue;
      const options: Array<{ x: number; y: number; bridge?: boolean }> = [];
      for (const b of bridges) {
        const q = {
          x: Math.max(b.x - b.w / 2 + 0.6, Math.min(b.x + b.w / 2 - 0.6, p.x)),
          y: Math.max(b.y - b.d / 2 + 0.6, Math.min(b.y + b.d / 2 - 0.6, p.y)),
        };
        if (Math.hypot(q.x - p.x, q.y - p.y) < 8) options.push({ ...q, bridge: true });
      }
      options.push(
        { x: pool.x - pool.w / 2 - 0.6, y: p.y },
        { x: pool.x + pool.w / 2 + 0.6, y: p.y },
        { x: p.x, y: pool.y - pool.d / 2 - 0.6 },
        { x: p.x, y: pool.y + pool.d / 2 + 0.6 },
      );
      const pool2 = preferBridge && options.some((o) => o.bridge) ? options.filter((o) => o.bridge) : options;
      const best = pool2.sort((u, v) => Math.hypot(u.x - p.x, u.y - p.y) - Math.hypot(v.x - p.x, v.y - p.y))[0];
      const st = previsWorldToStage(a, best.x, best.y);
      k.x = Math.round(st.x * 100) / 100;
      k.y = Math.round(st.y * 100) / 100;
      moved++;
    }
  }
  return moved;
}

/** World-mode camera pass after settling: out of buildings, then clear of people, then out of buildings again. */
export function settlePrevisCameraInWorld(plan: PrevisPlan, ctx: PrevisWorldContext): number {
  let moved = keepPrevisCameraOutOfWorld(plan, ctx);
  if (moved > 0) {
    moved += nudgePrevisCameraClear(plan);
    moved += keepPrevisCameraOutOfWorld(plan, ctx);
  }
  return moved;
}
