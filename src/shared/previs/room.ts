// 3D Director interiors: a room (type, size, one-line description) becomes a previs plan with walls and fixed
// furniture laid out from a template. Stories are then planned inside it with the furniture kept in place.
// Stage coordinates: x to the right, y away from the entrance (the entrance wall is at y = -depth / 2).

import { nudgePrevisCameraClear, PREVIS_CAMERA_MIN_SUBJECT_M, type PrevisPlan, type PrevisProp, type PrevisPropKind } from './plan-core';
import type { PrevisWorldRef } from './world-gen';

export const PREVIS_ROOM_TYPES = [
  'cafe',
  'restaurant',
  'bar',
  'office',
  'meeting_room',
  'classroom',
  'living_room',
  'bedroom',
  'kitchen',
  'shop',
  'library',
  'lobby',
  'hospital_ward',
  'generic',
] as const;
export type PrevisRoomType = (typeof PREVIS_ROOM_TYPES)[number];

export interface PrevisRoomSpec {
  type: PrevisRoomType;
  widthM: number;
  depthM: number;
  /** One English sentence about the place (no people). */
  description: string;
  /** Entrance centre along the front wall (stage x); default a little left of centre. */
  doorX?: number;
}

const DEFAULT_SIZE: Record<PrevisRoomType, [number, number]> = {
  cafe: [10, 12],
  restaurant: [12, 14],
  bar: [10, 12],
  office: [12, 14],
  meeting_room: [8, 10],
  classroom: [9, 10],
  living_room: [7, 8],
  bedroom: [5, 6],
  kitchen: [5, 6],
  shop: [8, 10],
  library: [12, 14],
  lobby: [14, 16],
  hospital_ward: [8, 10],
  generic: [8, 10],
};

const DEFAULT_DESCRIPTION: Record<PrevisRoomType, string> = {
  cafe: 'A cosy modern café with a counter at the back and small tables, soft daylight.',
  restaurant: 'A restaurant dining room with tables for four, warm evening light.',
  bar: 'A dim bar with a long counter and stools, warm low light.',
  office: 'An open-plan office with rows of desks, cool daylight.',
  meeting_room: 'A meeting room with a long table and a screen, cool daylight.',
  classroom: 'A school classroom with rows of desks facing the blackboard, daylight.',
  living_room: 'A home living room with a sofa, a coffee table and a TV, warm light.',
  bedroom: 'A small bedroom with a bed, a wardrobe and a desk, soft light.',
  kitchen: 'A home kitchen with counters along the walls and a small table, daylight.',
  shop: 'A small shop with rows of shelves and a till by the entrance, bright light.',
  library: 'A quiet library with rows of bookshelves and reading tables, soft light.',
  lobby: 'A hotel lobby with a reception desk, sofas and pillars, bright light.',
  hospital_ward: 'A hospital ward with beds along the walls, cool light.',
  generic: 'A plain room with a table, chairs and a shelf, daylight.',
};

const ROOM_WORDS: Array<[RegExp, PrevisRoomType]> = [
  [/咖啡|café|cafe|coffee/i, 'cafe'],
  [/餐厅|饭店|餐馆|食堂|restaurant|diner/i, 'restaurant'],
  [/酒吧|酒馆|居酒屋|\bbar\b|\bpub\b/i, 'bar'],
  [/会议室|meeting room|conference/i, 'meeting_room'],
  [/办公室|辦公室|写字楼|office/i, 'office'],
  [/教室|课堂|classroom/i, 'classroom'],
  [/客厅|客廳|起居室|living room|lounge/i, 'living_room'],
  [/卧室|臥室|寝室|bedroom/i, 'bedroom'],
  [/厨房|廚房|kitchen/i, 'kitchen'],
  [/商店|店铺|便利店|超市|shop|store/i, 'shop'],
  [/图书馆|圖書館|书店|library|bookstore/i, 'library'],
  [/大堂|大厅|大廳|前台|lobby|reception/i, 'lobby'],
  [/病房|医院|醫院|ward|hospital/i, 'hospital_ward'],
];

/** Room type named in a request (keyword fallback when the assistant round fails). */
export function previsRoomTypeFromText(text: string): PrevisRoomType {
  for (const [re, type] of ROOM_WORDS) if (re.test(text)) return type;
  return 'generic';
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const r2 = (v: number) => Math.round(v * 100) / 100;

export function normalizePrevisRoomSpec(raw: unknown, request = ''): PrevisRoomSpec {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const type = (PREVIS_ROOM_TYPES as readonly string[]).includes(String(o.room ?? o.type))
    ? (String(o.room ?? o.type) as PrevisRoomType)
    : previsRoomTypeFromText(request);
  const [dw, dd] = DEFAULT_SIZE[type];
  // Never smaller than the room's furniture needs (85 % of the usual size).
  const size = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? r2(clamp(v, Math.max(4, d * 0.85), 24)) : d);
  const description = String(o.description ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
  return { type, widthM: size(o.widthM, dw), depthM: size(o.depthM, dd), description: description || DEFAULT_DESCRIPTION[type] };
}

/** Furniture for a room (fixed props, stage coordinates). Deterministic for a spec. */
export function previsRoomFurniture(spec: PrevisRoomSpec): PrevisProp[] {
  const W = spec.widthM;
  const D = spec.depthM;
  const hw = W / 2;
  const hd = D / 2;
  const out: PrevisProp[] = [];
  const count = new Map<string, number>();
  const add = (kind: PrevisPropKind, label: string, x: number, y: number, w: number, d: number, h: number, facing?: number) => {
    const n = (count.get(kind) ?? 0) + 1;
    count.set(kind, n);
    out.push({ id: `${kind}_${n}`, label, kind, x: r2(x), y: r2(y), w: r2(w), d: r2(d), h: r2(h), ...(facing != null ? { facing } : {}), fixed: true });
  };
  // Entrance in the front wall, a little off-centre so the middle stays free for the action (or where the
  // building's door is, for an interior).
  const doorX = spec.doorX ?? -hw * 0.45;
  add('door', 'Entrance', doorX, -hd + 0.1, 1.4, 0.2, 2.2, 0);
  /** Walkway from the entrance to the back wall kept free of seating (people walk in without detours). */
  const AISLE_HALF = 1.3;
  /** Table with chairs on its two long sides (or around it for square tables). */
  const tableSet = (x: number, y: number, w: number, d: number, label: string, around: boolean) => {
    add('table', label, x, y, w, d, 0.75);
    const seats = around ? [[0, -1], [0, 1], [-1, 0], [1, 0]] : w >= d ? [[0, -1], [0, 1]] : [[-1, 0], [1, 0]];
    for (const [sx, sy] of seats) {
      const cx = x + sx * (w / 2 + 0.35);
      const cy = y + sy * (d / 2 + 0.35);
      // Chairs face the table.
      const facing = sy === -1 ? 0 : sy === 1 ? 180 : sx === -1 ? 90 : 270;
      add('chair', 'Chair', cx, cy, 0.5, 0.5, 0.9, facing);
    }
  };
  /**
   * Grid of items between x0..x1, y0..y1 with the given pitch (pitches leave ≥ 1 m between pieces so people can
   * walk between them); `halfW` = half the item's width, used to keep the entrance walkway clear.
   */
  const grid = (x0: number, x1: number, y0: number, y1: number, px: number, py: number, fn: (x: number, y: number) => void, max = 12, halfW = 0.6) => {
    // At least one row / column, centred, when the span is shorter than the pitch.
    if (x1 < x0) x0 = x1 = (x0 + x1) / 2;
    if (y1 < y0) y0 = y1 = (y0 + y1) / 2;
    let n = 0;
    for (let y = y0; y <= y1 + 1e-6 && n < max; y += py) {
      for (let x = x0; x <= x1 + 1e-6 && n < max; x += px) {
        if (Math.abs(x - doorX) < AISLE_HALF + halfW) continue;
        fn(x, y);
        n++;
      }
    }
  };
  switch (spec.type) {
    case 'cafe': {
      add('counter', 'Counter', hw * 0.25, hd - 1.6, Math.min(W * 0.5, 5), 0.7, 1.05, 180);
      add('shelf', 'Back shelf', hw * 0.25, hd - 0.25, Math.min(W * 0.55, 5.5), 0.4, 2);
      add('window', 'Window', -hw + 0.05, 0, 0.1, D * 0.5, 1.6, 90);
      grid(-hw + 1.6, hw - 1.6, -hd + 2.6, hd - 3.6, 2.4, 3.2, (x, y) => tableSet(x, y, 0.8, 0.8, 'Café table', false), 6, 0.4);
      break;
    }
    case 'restaurant':
      grid(-hw + 2, hw - 2, -hd + 3, hd - 2.5, 3.2, 3.2, (x, y) => tableSet(x, y, 1.2, 0.8, 'Dining table', false), 8);
      add('counter', 'Service counter', hw - 0.6, hd - 2.5, 0.7, 3, 1.05, 270);
      break;
    case 'bar':
      add('counter', 'Bar counter', hw - 1.2, 0.5, 0.7, D * 0.6, 1.1, 270);
      add('shelf', 'Bottle shelf', hw - 0.25, 0.5, 0.4, D * 0.6, 2.2);
      for (let i = 0; i < 5; i++) add('chair', 'Bar stool', hw - 2, -D * 0.22 + i * ((D * 0.55) / 4), 0.4, 0.4, 0.8, 90);
      grid(-hw + 1.6, -hw + 4.4, -hd + 3, hd - 2, 2.8, 3.2, (x, y) => tableSet(x, y, 0.8, 0.8, 'Bar table', false), 4, 0.4);
      break;
    case 'office':
      grid(-hw + 1.8, hw - 1.8, -hd + 3, hd - 2, 3, 2.6, (x, y) => {
        add('desk', 'Desk', x, y, 1.4, 0.7, 0.75);
        add('chair', 'Office chair', x, y - 0.75, 0.5, 0.5, 0.95, 0);
      }, 10, 0.7);
      add('shelf', 'Filing cabinet', -hw + 0.25, hd - 2, 0.4, 2.4, 1.5, 90);
      break;
    case 'meeting_room': {
      const tw = Math.min(W - 3, 5);
      add('table', 'Meeting table', 0, 0.4, tw, 1.3, 0.75);
      for (let i = 0; i < 3; i++) {
        const x = -tw / 2 + (tw * (i + 0.5)) / 3;
        add('chair', 'Chair', x, 0.4 - 1.05, 0.5, 0.5, 0.95, 0);
        add('chair', 'Chair', x, 0.4 + 1.05, 0.5, 0.5, 0.95, 180);
      }
      add('shelf', 'Screen', 0, hd - 0.15, Math.min(W * 0.4, 3), 0.15, 1.6);
      break;
    }
    case 'classroom':
      add('shelf', 'Blackboard', 0, hd - 0.1, Math.min(W * 0.6, 5), 0.12, 1.2);
      add('desk', "Teacher's desk", 0, hd - 1.6, 1.4, 0.7, 0.8);
      grid(-hw + 1.6, hw - 1.6, -hd + 2.2, hd - 3.4, 2, 2.3, (x, y) => {
        add('desk', 'Student desk', x, y, 1, 0.5, 0.75);
        add('chair', 'Chair', x, y - 0.55, 0.45, 0.45, 0.85, 0);
      }, 12, 0.5);
      break;
    case 'living_room':
      add('sofa', 'Sofa', 0, -hd + 2.6, 2.2, 0.9, 0.9, 0);
      add('table', 'Coffee table', 0, -hd + 3.8, 1.2, 0.6, 0.45);
      add('shelf', 'TV cabinet', 0, hd - 0.3, 2, 0.45, 0.6, 180);
      add('chair', 'Armchair', hw - 1.2, -hd + 3.8, 0.9, 0.9, 0.9, 270);
      add('shelf', 'Bookshelf', -hw + 0.25, 0.5, 0.4, 1.8, 2, 90);
      break;
    case 'bedroom':
      add('bed', 'Bed', 0, hd - 1.15, 1.6, 2.1, 0.55, 180);
      add('table', 'Bedside table', 1.2, hd - 0.4, 0.45, 0.45, 0.55);
      add('shelf', 'Wardrobe', -hw + 0.35, -hd + 1.8, 0.6, 1.6, 2, 90);
      add('desk', 'Desk', hw - 0.4, -hd + 1.6, 0.6, 1.2, 0.75, 270);
      add('chair', 'Chair', hw - 1.0, -hd + 1.6, 0.45, 0.45, 0.9, 90);
      break;
    case 'kitchen':
      add('counter', 'Kitchen counter', 0, hd - 0.35, W - 1, 0.6, 0.9, 180);
      add('counter', 'Side counter', hw - 0.35, 0, 0.6, D * 0.5, 0.9, 270);
      tableSet(-hw * 0.3, -hd * 0.25, 1, 0.8, 'Kitchen table', false);
      break;
    case 'shop':
      add('counter', 'Till', hw - 1.2, -hd + 1.8, 1.4, 0.6, 1, 270);
      for (let i = 0; i < 3; i++) add('shelf', 'Shelf', -hw + 2 + i * ((W - 4.5) / 2), 1, 0.6, D * 0.45, 1.6);
      add('shelf', 'Wall shelf', 0, hd - 0.25, W - 1, 0.4, 2);
      break;
    case 'library':
      for (let i = 0; i < 4; i++) add('shelf', 'Bookshelf', -hw + 1.5 + i * ((W * 0.5 - 1.5) / 3), hd - 3.5, 0.5, 4, 2.2);
      grid(hw * 0.25, hw - 1.6, -hd + 3, hd - 3, 3, 3.6, (x, y) => tableSet(x, y, 1.6, 0.9, 'Reading table', false), 4, 0.8);
      break;
    case 'lobby':
      add('counter', 'Reception', 0, hd - 2, 4, 0.8, 1.1, 180);
      add('sofa', 'Sofa', -hw + 2.5, -1, 2.2, 0.9, 0.9, 90);
      add('sofa', 'Sofa', hw - 2.5, -1, 2.2, 0.9, 0.9, 270);
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) add('pillar', 'Pillar', sx * hw * 0.45, sy * hd * 0.35, 0.6, 0.6, 3.5);
      break;
    case 'hospital_ward':
      for (let i = 0; i < 3; i++) {
        const y = -hd + 2.5 + i * ((D - 3.5) / 2);
        add('bed', 'Hospital bed', -hw + 1.2, y, 2.1, 1, 0.65, 90);
        add('bed', 'Hospital bed', hw - 1.2, y, 2.1, 1, 0.65, 270);
      }
      break;
    default:
      tableSet(0, 1, 1.6, 0.9, 'Table', false);
      add('shelf', 'Shelf', -hw + 0.25, 0, 0.4, 2, 2, 90);
  }
  return out;
}

/** An empty room as a plan: walls, entrance, fixed furniture, a still camera at the entrance corner. */
export function createPrevisRoomPlan(spec: PrevisRoomSpec, durationSec = 15): PrevisPlan {
  const hw = spec.widthM / 2;
  const hd = spec.depthM / 2;
  const key = { x: r2(hw - 0.8), y: r2(-hd + 0.8), h: 1.7, lookAt: { x: 0, y: r2(hd * 0.3), h: 1 } };
  return {
    version: 1,
    durationSec,
    stage: { width: spec.widthM, depth: spec.depthM },
    set: { kind: 'indoor', description: spec.description },
    props: previsRoomFurniture(spec),
    characters: [],
    camera: { keys: [{ t: 0, ...key }, { t: durationSec, ...key }] },
  };
}

/** The room spec a room plan was made from (type inferred from its template furniture). */
export function previsRoomSpecOf(plan: PrevisPlan): PrevisRoomSpec {
  const widthM = plan.stage.width;
  const depthM = plan.stage.depth;
  const description = plan.set?.description ?? '';
  const sig = (props: PrevisProp[]) => props.filter((p) => p.fixed).map((p) => `${p.id}:${p.label}`).join('|');
  const mine = sig(plan.props);
  const type = PREVIS_ROOM_TYPES.find((t) => sig(previsRoomFurniture({ type: t, widthM, depthM, description })) === mine) ?? 'generic';
  return { type, widthM, depthM, description };
}

/** A room plan: indoor with fixed furniture (a room on its own, or the interior of a street building). */
export function isPrevisRoomPlan(plan: PrevisPlan | null | undefined): boolean {
  return !!plan && plan.set?.kind === 'indoor' && plan.props.some((p) => p.fixed);
}

export interface PrevisRoomContext {
  stage: { width: number; depth: number };
  description: string;
  fixed: PrevisProp[];
  /** Interior of a street building: the world it stands in (stage anchor = the building). */
  world?: PrevisWorldRef;
  /** One take from the sidewalk into the building: the stage spans both, split by its front wall. */
  walkIn?: PrevisWalkIn;
}

/** Walk-in stage: front wall line, its doorway and the inner half width (between the side walls). */
export interface PrevisWalkIn {
  facadeY: number;
  doorX: number;
  innerHalfW: number;
}

/** Building walls on a walk-in stage (fixed props; the world draws the walls themselves). */
export const PREVIS_WALK_IN_WALL_IDS = ['facade_wall_l', 'facade_wall_r', 'side_wall_l', 'side_wall_r'] as const;

export function previsWalkInOf(props: readonly PrevisProp[]): PrevisWalkIn | null {
  const l = props.find((p) => p.fixed && p.id === 'facade_wall_l');
  const r = props.find((p) => p.fixed && p.id === 'facade_wall_r');
  const side = props.find((p) => p.fixed && p.id === 'side_wall_r');
  if (!l || !r || !side) return null;
  return { facadeY: l.y, doorX: r2((l.x + l.w / 2 + (r.x - r.w / 2)) / 2), innerHalfW: r2(side.x - side.w / 2) };
}

export function previsRoomContextFromPlan(plan: PrevisPlan): PrevisRoomContext | null {
  if (!isPrevisRoomPlan(plan)) return null;
  const walkIn = previsWalkInOf(plan.props);
  return {
    stage: { width: plan.stage.width, depth: plan.stage.depth },
    description: plan.set?.description ?? '',
    fixed: plan.props.filter((p) => p.fixed).map((p) => ({ ...p })),
    ...(plan.set?.world ? { world: plan.set.world } : {}),
    ...(walkIn ? { walkIn } : {}),
  };
}

const fmt = (v: number) => (Math.round(v * 10) / 10).toFixed(1).replace(/\.0$/, '');

/** Planner prompt section describing the fixed room (English; stage coordinates). */
export function buildPrevisRoomPromptSection(ctx: PrevisRoomContext): string {
  const { width, depth } = ctx.stage;
  if (ctx.walkIn) return buildWalkInPromptSection(ctx, ctx.walkIn);
  const lines = ctx.fixed.map(
    (p) => `- ${p.id} "${p.label}" (${p.kind}) at x = ${fmt(p.x)}, y = ${fmt(p.y)}, ${fmt(p.w)} × ${fmt(p.d)} m${p.facing != null ? `, facing ${p.facing}` : ''}`,
  );
  return `Room (fixed, already built — plan inside it, do not move or resize anything):
${ctx.description} Set "stage" to {"width": ${width}, "depth": ${depth}} and "set.kind" to "indoor". Walls surround the stage; the entrance wall is y = -${fmt(depth / 2)}.
Furniture already in the room (it is added back automatically: do NOT list it in "props"; add only extra props the text needs). People walk around it, sit on its chairs / sofas / beds and stand at its tables, desks and counters:
${lines.join('\n')}
Someone who comes in starts just outside the entrance door (y ≈ -${fmt(depth / 2 + 0.8)}, same x) and steps in; someone who leaves walks out through it and ends there.`;
}

function buildWalkInPromptSection(ctx: PrevisRoomContext, w: PrevisWalkIn): string {
  const { width, depth } = ctx.stage;
  const walls = new Set<string>(PREVIS_WALK_IN_WALL_IDS);
  const lines = ctx.fixed
    .filter((p) => !walls.has(p.id) && p.kind !== 'door')
    .map((p) => `- ${p.id} "${p.label}" (${p.kind}) at x = ${fmt(p.x)}, y = ${fmt(p.y)}, ${fmt(p.w)} × ${fmt(p.d)} m${p.facing != null ? `, facing ${p.facing}` : ''}`);
  return `Walk-in set (fixed, already built — one continuous take from the street into the building; do not move or resize anything):
${ctx.description} Set "stage" to {"width": ${width}, "depth": ${depth}} and "set.kind" to "indoor".
- y < ${fmt(w.facadeY)} is OUTSIDE: the open-air sidewalk in front of the building (the street lies beyond y = -${fmt(depth / 2)}).
- The building's front wall runs along y = ${fmt(w.facadeY)} with ONE doorway at x = ${fmt(w.doorX)} (1.6 m wide). Inside (y > ${fmt(w.facadeY)}) the side walls are at x = ±${fmt(w.innerHalfW)}.
- Nobody and no camera passes through a wall: going in or out is always through the doorway, and a camera following someone in goes through it too (or stays outside looking in).
- Someone arriving comes along the sidewalk (enters from x = ±${fmt(width / 2)} or from y = -${fmt(depth / 2)}), walks to the doorway and steps in.
Furniture inside (it is added back automatically: do NOT list it in "props"; add only extra props the text needs). People walk around it, sit on its chairs / sofas and stand at its tables and counters:
${lines.join('\n')}`;
}

/** Put the room back into a planner reply: stage, indoor set, the fixed furniture (extra props are kept). */
export function applyPrevisRoomToPlan(plan: PrevisPlan, ctx: PrevisRoomContext): PrevisPlan {
  plan.stage = { ...ctx.stage };
  plan.set = { kind: 'indoor', description: ctx.description, ...(ctx.world ? { world: ctx.world } : {}) };
  const ids = new Set(ctx.fixed.map((p) => p.id));
  const extra = plan.props.filter((p) => !ids.has(p.id) && !p.fixed);
  plan.props = [...ctx.fixed.map((p) => ({ ...p })), ...extra];
  return plan;
}

/** Camera keys stay inside the walls (a key outside would look at the back of a wall). Returns keys moved. */
function keepCameraInsideRoom(plan: PrevisPlan, ctx: PrevisRoomContext, margin = 0.35): number {
  const hw = ctx.stage.width / 2 - margin;
  const hd = ctx.stage.depth / 2 - margin;
  let moved = 0;
  for (const k of plan.camera.keys) {
    const x = clamp(k.x, -hw, hw);
    const y = clamp(k.y, -hd, hd);
    if (x !== k.x || y !== k.y) {
      k.x = r2(x);
      k.y = r2(y);
      moved++;
    }
  }
  return moved;
}

/** Room camera pass after settling: inside the walls, clear of people, inside the walls again. */
export function settlePrevisCameraInRoom(plan: PrevisPlan, ctx: PrevisRoomContext): number {
  let moved = keepCameraInsideRoom(plan, ctx);
  moved += nudgePrevisCameraClear(plan);
  moved += keepCameraInsideRoom(plan, ctx);
  if (ctx.walkIn) {
    moved += threadPrevisWalkIn(plan, ctx.walkIn);
    // Threading and the walls can bring the camera back onto people: clear it again (the last pass wins).
    moved += nudgePrevisCameraClear(plan);
    moved += keepCameraInsideRoom(plan, ctx);
    moved += nudgePrevisCameraClear(plan);
  }
  return moved;
}

const DOOR_HALF_PASS_M = 0.5;
const DOOR_STEP_M = 0.7;
const DOOR_CLEAR_M = 0.9;
/** How far a camera kept behind someone in the doorway stays from them (m). */
const WALK_IN_CAMERA_CLEAR_M = 1.05;

function characterAt(plan: PrevisPlan, id: string, t: number): { x: number; y: number } | null {
  const path = plan.characters.find((c) => c.id === id)?.path;
  if (!path?.length) return null;
  if (t <= path[0].t) return path[0];
  for (let i = 0; i + 1 < path.length; i++) {
    const a = path[i];
    const b = path[i + 1];
    if (t <= b.t) {
      const f = b.t > a.t ? (t - a.t) / (b.t - a.t) : 1;
      return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
    }
  }
  return path[path.length - 1];
}

/**
 * Walk-in stage: paths (people and camera) that cross the front wall go through its doorway, points inside stay
 * between the side walls, and points stuck in the wall step out onto the sidewalk. Returns points added / moved.
 */
export function threadPrevisWalkIn(plan: PrevisPlan, w: PrevisWalkIn): number {
  let moved = 0;
  for (const c of plan.characters) moved += threadThroughDoor(c.path, w, (_a, x, y, t) => ({ t, x, y }));
  // A camera right at the front wall (in the doorway or against the wall) sees mostly wall: step it to the side
  // of what it looks at.
  for (const k of plan.camera.keys) {
    if (Math.abs(k.y - w.facadeY) >= DOOR_CLEAR_M) continue;
    const target = typeof k.lookAt === 'string' ? characterAt(plan, k.lookAt, k.t) : k.lookAt;
    if (!target) continue;
    const side = target.y < w.facadeY ? -1 : 1;
    let y = w.facadeY + side * DOOR_CLEAR_M;
    // Following someone through the doorway: stepping to their side would put the camera on top of them, so it stays
    // on its own side, far enough back.
    if (typeof k.lookAt === 'string' && Math.hypot(k.x - target.x, y - target.y) < PREVIS_CAMERA_MIN_SUBJECT_M) {
      const dx = k.x - target.x;
      const back = Math.sqrt(Math.max(0, WALK_IN_CAMERA_CLEAR_M ** 2 - dx * dx)) - side * (target.y - w.facadeY);
      y = w.facadeY - side * Math.max(DOOR_CLEAR_M, back);
    }
    k.y = r2(y);
    moved++;
  }
  moved += threadThroughDoor(plan.camera.keys, w, (a, x, y, t) => {
    const { move: _move, ...rest } = a;
    return { ...rest, t, x, y };
  });
  return moved;
}

function threadThroughDoor<T extends { t: number; x: number; y: number }>(keys: T[], w: PrevisWalkIn, at: (a: T, x: number, y: number, t: number) => T): number {
  let moved = 0;
  const inner = Math.max(0.3, w.innerHalfW - 0.3);
  for (const k of keys) {
    if (k.y > w.facadeY + 0.2) {
      const x = clamp(k.x, -inner, inner);
      if (x !== k.x) {
        k.x = r2(x);
        moved++;
      }
    } else if (Math.abs(k.y - w.facadeY) <= 0.4 && Math.abs(k.x - w.doorX) > DOOR_HALF_PASS_M) {
      k.y = r2(w.facadeY - DOOR_STEP_M);
      moved++;
    }
  }
  for (let i = keys.length - 2; i >= 0; i--) {
    const a = keys[i];
    const b = keys[i + 1];
    if ((a.y - w.facadeY) * (b.y - w.facadeY) >= 0) continue;
    const f = (w.facadeY - a.y) / (b.y - a.y);
    if (Math.abs(a.x + (b.x - a.x) * f - w.doorX) <= DOOR_HALF_PASS_M) continue;
    if (b.t - a.t < 0.4) {
      // Dense (solved) keys: no room for detour points; bring both ends into the doorway instead.
      a.x = r2(clamp(a.x, w.doorX - DOOR_HALF_PASS_M, w.doorX + DOOR_HALF_PASS_M));
      b.x = r2(clamp(b.x, w.doorX - DOOR_HALF_PASS_M, w.doorX + DOOR_HALF_PASS_M));
      moved++;
      continue;
    }
    const side = Math.sign(a.y - w.facadeY);
    const p1 = { x: w.doorX, y: w.facadeY + side * DOOR_STEP_M };
    const p2 = { x: w.doorX, y: w.facadeY - side * DOOR_STEP_M };
    const d1 = Math.hypot(p1.x - a.x, p1.y - a.y);
    const d3 = Math.hypot(b.x - p2.x, b.y - p2.y);
    const total = d1 + 2 * DOOR_STEP_M + d3 || 1;
    const t1 = r2(a.t + ((b.t - a.t) * d1) / total);
    const t2 = r2(a.t + ((b.t - a.t) * (d1 + 2 * DOOR_STEP_M)) / total);
    keys.splice(i + 1, 0, at(a, r2(p1.x), r2(p1.y), t1), at(b, r2(p2.x), r2(p2.y), t2));
    moved++;
  }
  return moved;
}
