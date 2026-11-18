// 3D Director: interiors of street buildings. A building listed in `ref.interiors` is drawn hollow (ground
// floor) with a room inside whose entrance is the building's door; stories can be planned in it. The room's
// stage is anchored at the building centre, its entrance wall on the facade.

import { previsPropSeats, type PrevisPlan, type PrevisProp, type PrevisSeat } from './plan-core';
import {
  createPrevisRoomPlan,
  normalizePrevisRoomSpec,
  previsWalkInOf,
  PREVIS_ROOM_TYPES,
  type PrevisRoomSpec,
  type PrevisRoomType,
} from './room';
import {
  generatePrevisWorld,
  previsStageToWorld,
  previsWorldToStage,
  type PrevisWorld,
  type PrevisWorldBuilding,
  type PrevisWorldHeading,
  type PrevisWorldRef,
  type PrevisWorldStageAnchor,
} from './world-gen';

export const PREVIS_INTERIOR_MAX = 3;
/** Wall thickness and ground-floor height of a hollow building (m). */
export const PREVIS_INTERIOR_WALL_M = 0.25;
export const PREVIS_INTERIOR_HEIGHT_M = 3.6;
/** Outdoor seating in front of a shop: the sidewalk band beyond its front wall, at most this deep (m). */
export const PREVIS_INTERIOR_TERRACE_M = 2.4;
/** Smallest room that fits furniture and a walkway. */
const MIN_ROOM_M = 4.2;

export interface PrevisInteriorRef {
  buildingId: string;
  room: PrevisRoomType;
  /** Fixed furniture after layout edits (stage coordinates); the template is used when missing. */
  furniture?: PrevisProp[];
}

const HEADING_FOR_FRONT: Record<PrevisWorldBuilding['front'], PrevisWorldHeading> = { s: 0, e: 90, n: 180, w: 270 };

/** Stage anchor of a building's interior: centre of the building, entrance wall on its facade. */
export function previsInteriorAnchor(b: PrevisWorldBuilding): PrevisWorldStageAnchor {
  return { x: b.x, y: b.y, headingDeg: HEADING_FOR_FRONT[b.front] };
}

/** Room spec that fits inside the building (null when it is too small for a room). */
export function previsInteriorSpec(b: PrevisWorldBuilding, room: PrevisRoomType): PrevisRoomSpec | null {
  const along = b.front === 'n' || b.front === 's' ? b.w : b.d;
  const deep = b.front === 'n' || b.front === 's' ? b.d : b.w;
  const widthM = Math.round((along - 2 * PREVIS_INTERIOR_WALL_M) * 100) / 100;
  const depthM = Math.round((deep - 2 * PREVIS_INTERIOR_WALL_M) * 100) / 100;
  if (widthM < MIN_ROOM_M || depthM < MIN_ROOM_M) return null;
  // Door offset is east / north positive along the facade; the stage x of the entrance flips for n / w fronts.
  const sign = b.front === 's' || b.front === 'e' ? 1 : -1;
  const doorX = Math.max(-widthM / 2 + 1, Math.min(widthM / 2 - 1, sign * b.doorOffset));
  const spec = normalizePrevisRoomSpec({ room });
  return { type: spec.type, widthM, depthM, description: spec.description, doorX: Math.round(doorX * 100) / 100 };
}

export function normalizePrevisInteriors(raw: unknown): PrevisInteriorRef[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: PrevisInteriorRef[] = [];
  for (const r of raw) {
    const o = (r && typeof r === 'object' ? r : {}) as Record<string, unknown>;
    const buildingId = typeof o.buildingId === 'string' ? o.buildingId.slice(0, 40) : '';
    if (!buildingId || out.some((x) => x.buildingId === buildingId)) continue;
    const room = (PREVIS_ROOM_TYPES as readonly string[]).includes(String(o.room)) ? (o.room as PrevisRoomType) : 'generic';
    const furniture = Array.isArray(o.furniture) ? (o.furniture.filter((p) => p && typeof p === 'object').slice(0, 60) as PrevisProp[]) : undefined;
    out.push({ buildingId, room, ...(furniture?.length ? { furniture } : {}) });
    if (out.length >= PREVIS_INTERIOR_MAX) break;
  }
  return out.length ? out : undefined;
}

/** The world with an interior added / replaced (room type) or removed (null); unchanged when it cannot fit. */
export function setPrevisInterior(ref: PrevisWorldRef, buildingId: string, room: PrevisRoomType | null, furniture?: PrevisProp[]): PrevisWorldRef {
  const list = (normalizePrevisInteriors(ref.interiors) ?? []).filter((x) => x.buildingId !== buildingId);
  if (room) {
    const b = generatePrevisWorld(ref).buildings.find((x) => x.id === buildingId);
    if (!b || !previsInteriorSpec(b, room)) return ref;
    list.push({ buildingId, room, ...(furniture?.length ? { furniture } : {}) });
  }
  const next: PrevisWorldRef = { ...ref };
  const kept = list.slice(-PREVIS_INTERIOR_MAX);
  if (kept.length) next.interiors = kept as unknown as NonNullable<PrevisWorldRef['interiors']>;
  else delete next.interiors;
  return next;
}

export interface PrevisInteriorLayout {
  building: PrevisWorldBuilding;
  anchor: PrevisWorldStageAnchor;
  spec: PrevisRoomSpec;
  /** Fixed furniture and the entrance door, stage coordinates. */
  props: PrevisProp[];
}

/** Interiors of a generated world (buildings that were removed or are too small are skipped). */
export function previsInteriorLayouts(ref: PrevisWorldRef, world: PrevisWorld = generatePrevisWorld(ref)): PrevisInteriorLayout[] {
  const out: PrevisInteriorLayout[] = [];
  for (const it of normalizePrevisInteriors(ref.interiors) ?? []) {
    const b = world.buildings.find((x) => x.id === it.buildingId);
    const spec = b ? previsInteriorSpec(b, it.room) : null;
    if (!b || !spec) continue;
    const base = createPrevisRoomPlan(spec);
    const door = base.props.filter((p) => p.kind === 'door');
    // The room is the building's ground floor: furniture outside it (e.g. after a size change) is dropped, except
    // outdoor seating on the sidewalk in front of the shop.
    const terrace = (p: PrevisProp) => p.y < -spec.depthM / 2 && p.y >= -spec.depthM / 2 - PREVIS_INTERIOR_WALL_M - PREVIS_INTERIOR_TERRACE_M;
    const inside = (p: PrevisProp) => Math.abs(p.x) <= spec.widthM / 2 && (Math.abs(p.y) <= spec.depthM / 2 || terrace(p));
    const props = it.furniture?.length
      ? [...door, ...it.furniture.filter((p) => p.kind !== 'door' && inside(p)).map((p) => ({ ...p, fixed: true }))]
      : base.props;
    out.push({ building: b, anchor: previsInteriorAnchor(b), spec, props });
  }
  return out;
}

/** A room plan inside a street building (its stage anchored at the building), or null without that interior. */
export function previsInteriorRoomPlan(ref: PrevisWorldRef, buildingId: string, durationSec = 15): PrevisPlan | null {
  const layout = previsInteriorLayouts(ref).find((l) => l.building.id === buildingId);
  if (!layout) return null;
  const plan = createPrevisRoomPlan(layout.spec, durationSec);
  plan.props = layout.props.map((p) => ({ ...p }));
  plan.set = { kind: 'indoor', description: layout.spec.description, world: { ...ref, stageAnchor: layout.anchor } };
  return plan;
}

/** Sidewalk depth in front of the building on a walk-in stage (m). */
export const PREVIS_WALK_IN_OUTSIDE_M = 5;
const DOOR_HALF_M = 0.8;
const r2 = (v: number) => Math.round(v * 100) / 100;

/**
 * One take from the street into a building's interior: the stage covers the sidewalk in front of the building and
 * its ground floor. The building walls are fixed props (with a doorway gap) the planner keeps paths out of; the
 * world draws the walls themselves.
 */
export function previsInteriorWalkInPlan(ref: PrevisWorldRef, buildingId: string, durationSec = 15): PrevisPlan | null {
  const layout = previsInteriorLayouts(ref).find((l) => l.building.id === buildingId);
  if (!layout) return null;
  const { spec, anchor } = layout;
  const wall = PREVIS_INTERIOR_WALL_M;
  const shift = (PREVIS_WALK_IN_OUTSIDE_M + wall) / 2;
  const width = r2(spec.widthM + 2 * wall + 2);
  const depth = r2(spec.depthM + wall + PREVIS_WALK_IN_OUTSIDE_M);
  const facadeY = r2(-spec.depthM / 2 - wall / 2 + shift);
  const outer = spec.widthM / 2 + wall;
  const doorX = spec.doorX ?? 0;
  const wallProp = (id: string, x0: number, x1: number, y: number, d: number): PrevisProp => ({
    id,
    label: 'building wall',
    kind: 'box',
    x: r2((x0 + x1) / 2),
    y: r2(y),
    w: r2(x1 - x0),
    d: r2(d),
    h: PREVIS_INTERIOR_HEIGHT_M,
    fixed: true,
  });
  const props: PrevisProp[] = [
    ...layout.props.map((p) => ({ ...p, y: r2(p.y + shift) })),
    wallProp('facade_wall_l', -outer, doorX - DOOR_HALF_M, facadeY, wall),
    wallProp('facade_wall_r', doorX + DOOR_HALF_M, outer, facadeY, wall),
    wallProp('side_wall_l', -outer, -spec.widthM / 2, shift, spec.depthM),
    wallProp('side_wall_r', spec.widthM / 2, outer, shift, spec.depthM),
  ];
  const centre = previsStageToWorld(anchor, 0, -shift);
  const plan = createPrevisRoomPlan({ ...spec, widthM: width, depthM: depth }, durationSec);
  plan.props = props;
  plan.set = {
    kind: 'indoor',
    description: `${spec.description} Seen from the street: the sidewalk in front of it and the way in.`,
    world: { ...ref, stageAnchor: { x: r2(centre.x), y: r2(centre.y), headingDeg: anchor.headingDeg } },
  };
  return plan;
}

export function isPrevisWalkInPlan(plan: PrevisPlan | null | undefined): boolean {
  return !!plan && plan.set?.kind === 'indoor' && !!previsWalkInOf(plan.props);
}

/** Building whose interior a room plan is (null for a room on its own). */
export function previsInteriorBuildingOf(plan: PrevisPlan | null | undefined): string | null {
  const w = plan?.set?.kind === 'indoor' ? plan.set.world : undefined;
  if (!w) return null;
  const hit = (normalizePrevisInteriors(w.interiors) ?? []).find((it) => {
    const b = generatePrevisWorld(w).buildings.find((x) => x.id === it.buildingId);
    return b && b.x === w.stageAnchor.x && b.y === w.stageAnchor.y;
  });
  return hit?.buildingId ?? null;
}

export { previsSeatAt, type PrevisSeat } from './plan-core';

/**
 * Seats of a plan, in its stage coordinates: its own chairs and sofas and, for a plan in a world (pass the
 * generated world), the chairs of the world's building interiors. Shared by the 3D view (seated figures), the
 * planner and hand placement.
 */
export function previsPlanSeats(plan: PrevisPlan, world?: PrevisWorld | null): PrevisSeat[] {
  const seats = previsPropSeats(plan.props);
  const ref = plan.set?.world;
  if (!ref || !world) return seats;
  const own = previsInteriorBuildingOf(plan);
  const a = ref.stageAnchor;
  for (const layout of previsInteriorLayouts(ref, world)) {
    if (layout.building.id === own) continue;
    const turn = (((layout.anchor.headingDeg - a.headingDeg) % 360) + 360) % 360;
    const swap = turn === 90 || turn === 270;
    for (const p of previsPropSeats(layout.props)) {
      const w = previsStageToWorld(layout.anchor, p.x, p.y);
      const at = previsWorldToStage(a, w.x, w.y);
      seats.push({ x: at.x, y: at.y, w: swap ? p.d : p.w, d: swap ? p.w : p.d, facing: (((p.facing - turn) % 360) + 360) % 360 });
    }
  }
  return seats;
}
