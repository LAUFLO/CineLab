// 3D Director (V2 worlds): vehicles — cars / vans / buses on the road, boats on the water, helicopters / planes /
// spaceships in the air — and people getting in and out of them. The planner writes `vehicles` + `rides`; this
// module gives it the street in numbers, turns vehicles it wrote as people back into vehicles, keeps each kind
// where it can go, stops a vehicle while people get in / out, and puts them at its door.

import {
  PREVIS_VEHICLE_KINDS,
  samplePrevisCharacter,
  samplePrevisVehicle,
  type PrevisPlan,
  type PrevisVehicle,
  type PrevisVehicleKey,
  type PrevisVehicleKind,
} from './plan-core';
import { previsStageToWorld, previsWorldToStage, type PrevisWorldBox, type PrevisWorldStageAnchor } from './world-gen';

/** What this module needs of a world context (structural, so it does not import the world planner). */
export interface PrevisVehicleWorld {
  ref: { stageAnchor: PrevisWorldStageAnchor; water?: { kind: string } };
  world: { roads: PrevisWorldBox[]; water?: PrevisWorldBox[] };
  geo: { roadHalf: number; roadLabel: string; stage: { width: number; depth: number } };
}

/** Body size (m): length along the heading, width, height. */
export const PREVIS_VEHICLE_SIZE: Record<PrevisVehicleKind, { l: number; w: number; h: number }> = {
  car: { l: 4.5, w: 1.8, h: 1.5 },
  van: { l: 5.2, w: 2.0, h: 2.2 },
  bus: { l: 11, w: 2.5, h: 3.1 },
  boat: { l: 6, w: 2.2, h: 1.4 },
  helicopter: { l: 9, w: 2.4, h: 3 },
  plane: { l: 14, w: 12, h: 3.5 },
  spaceship: { l: 14, w: 14, h: 5 },
};

const ROAD_KINDS: ReadonlySet<PrevisVehicleKind> = new Set(['car', 'van', 'bus']);
const AIR_KINDS: ReadonlySet<PrevisVehicleKind> = new Set(['helicopter', 'plane', 'spaceship']);

const KIND_WORDS: Array<[PrevisVehicleKind, RegExp]> = [
  ['spaceship', /宇宙飞船|飞船|飞碟|火箭|太空船|spaceship|spacecraft|starship|ufo|rocket/i],
  ['helicopter', /直升机|直升飞机|helicopter|chopper/i],
  ['plane', /飞机|客机|战斗机|喷气机|airplane|aeroplane|aircraft|\bplane\b|\bjet\b/i],
  ['boat', /船|艇|舟|渡轮|boat|ship|yacht|ferry|canoe|kayak/i],
  ['bus', /公交|巴士|大巴|\bbus\b/i],
  ['van', /面包车|厢式车|货车|卡车|\bvan\b|truck|lorry/i],
  ['car', /汽车|轿车|出租车|警车|跑车|吉普|小车|车|\bcar\b|taxi|sedan|suv|jeep/i],
];
const PERSON_RE = /人|司机|驾驶员|船长|机长|乘客|绑匪|男|女|driver|pilot|captain|passenger|man|woman|guy|kidnapper|thug/i;
const VEHICLE_NOUN = '(?:车|船|艇|飞机|直升机|飞船|飞碟)';
const GET_IN_RE = new RegExp(
  `上车|上船|登船|登机|登上${VEHICLE_NOUN}|上了?${VEHICLE_NOUN}|(?:进|钻进|坐进|塞进|绑进|拖进|拉进|推进|拽进|押进|抬进|绑上|押上)了?${VEHICLE_NOUN}|get(?:s|ting)? (?:in|into|on)\\b|board(?:s|ed|ing)?\\b|climb(?:s|ed)? (?:in|into|aboard)`,
  'i',
);
const LEAVE_RE = /开走|驶离|驶走|开离|离开|飞走|起飞|飞离|开船|远去|drives? (?:off|away)|driving (?:off|away)|fl(?:y|ies) (?:off|away)|takes? off|sails? (?:off|away)/i;
const GET_OUT_RE = new RegExp(
  `下车|下船|下飞机|下直升机|${VEHICLE_NOUN}(?:上|里|内)?(?:下来|走出来|走出|出来|跳下)|从.{0,8}${VEHICLE_NOUN}.{0,3}(?:下来|走出|出来|跳下)|get(?:s|ting)? (?:out|off)\\b|step(?:s|ped)? out|climb(?:s|ed)? out`,
  'i',
);

/** Vehicle kind a name / phrase refers to (null when it is not a vehicle). */
export function previsVehicleKindFromText(text: string): PrevisVehicleKind | null {
  for (const [kind, re] of KIND_WORDS) if (re.test(text)) return kind;
  return null;
}

/** True when the story has vehicles (a car that drives, a boat, a helicopter…). */
export function previsStoryHasVehicles(story: string): boolean {
  return previsVehicleKindFromText(story) !== null;
}

const r2 = (v: number) => Math.round(v * 100) / 100;
const fmt = (v: number) => (Math.round(v * 10) / 10).toFixed(1).replace(/\.0$/, '');

/** Main-road lines (curbs and lane centres) in stage coordinates, and the stage axis they run along. */
function roadLines(ctx: PrevisVehicleWorld): { along: 'x' | 'y'; curbs: number[]; lanes: number[] } | null {
  const a = ctx.ref.stageAnchor;
  const half = ctx.geo.roadHalf;
  if (!(half > 0) || ctx.ref.water?.kind === 'canal') return null;
  const across = (worldY: number) => {
    const p = previsWorldToStage(a, a.x, worldY);
    return a.headingDeg === 0 || a.headingDeg === 180 ? p.y : p.x;
  };
  const along = a.headingDeg === 0 || a.headingDeg === 180 ? 'x' : 'y';
  const lane = Math.max(1.2, half / 2);
  return { along, curbs: [across(-half), across(half)].sort((p, q) => p - q), lanes: [across(-lane), across(lane)].sort((p, q) => p - q) };
}

/** Planner prompt section: how to write vehicles and rides in this world (English; stage coordinates). */
export function buildPrevisVehiclePromptSection(ctx: PrevisVehicleWorld): string {
  const road = roadLines(ctx);
  const across = road ? (road.along === 'x' ? 'y' : 'x') : 'x';
  const water = ctx.world.water ?? [];
  const a = ctx.ref.stageAnchor;
  const waterLine = water.length
    ? (() => {
        const boxes = water
          .map((w) => {
            const c = previsWorldToStage(a, w.x, w.y);
            return `around (${fmt(c.x)}, ${fmt(c.y)})`;
          })
          .slice(0, 3);
        return `- WATER: boats sail only on the water (${boxes.join('; ')}; see WATER above); they stop at the bank / railing to let people on or off.`;
      })()
    : '- There is no water here: no boats.';
  return `
VEHICLES — a car, van, bus, boat, helicopter, plane or spaceship is NOT a character: put it in "vehicles" (never in "characters"):
"vehicles": [{"id": "car1", "name": "黑色面包车", "kind": "${PREVIS_VEHICLE_KINDS.join('" | "')}", "path": [{"t": 0, "x": 0, "y": -30, "alt": 0}, …]}]
- A vehicle may start or end up to 40 m off the stage (it drives / flies in or away). Speeds: cars in a street 6–12 m/s (slow down before stopping), boats 2–6 m/s, helicopters 10–30 m/s, planes 40–80 m/s, spaceships as the text says. "alt" = height above the ground in metres (0 on the ground or water).
${
  road
    ? `- ROAD: cars / vans / buses drive along ${road.along} on the road: lane centres at ${across} ≈ ${road.lanes.map(fmt).join(' and ')}; the curbs (sidewalk edges) are at ${across} = ${road.curbs.map(fmt).join(' and ')}. To stop beside someone on the sidewalk a car pulls up in the lane next to that curb. A vehicle never drives through a person: it stops for anyone in its way.`
    : '- No road for cars here.'
}
${waterLine}
- AIR: helicopters, planes and spaceships fly with "alt" > 0; to let people in or out they land (alt 0) on the road or an open space and stand still.
- People getting in / out: "rides": [{"who": "<character id>", "vehicle": "car1", "from": 9, "to": 14}]. "from" = the second they get in (first they walk to the vehicle, which stands still there); "to" = the second they get out (leave it out when they stay inside). While inside they are hidden and move with the vehicle. People who arrive in a vehicle and get out have a ride from 0 to the second they get out (their path starts at the vehicle's door then). Someone forced into a car (绑 / 拖 / 塞进车) also gets a ride, from the second they are inside. One person's rides never overlap.
- Example — two men arrive in a van, get out at 4 s, push A into it at 8 s and it drives away: "rides": [{"who": "m1", "vehicle": "van1", "from": 0, "to": 4}, {"who": "m2", "vehicle": "van1", "from": 0, "to": 4}, {"who": "A", "vehicle": "van1", "from": 8}, {"who": "m1", "vehicle": "van1", "from": 8.3}, {"who": "m2", "vehicle": "van1", "from": 8.5}]; the van stands still at the curb from 3.5 s to 9 s, then drives off.`;
}

/** The planner sometimes writes a vehicle as a person: a "character" named 车 / 直升机 becomes a vehicle again. */
export function rescuePrevisVehicleCharacters(plan: PrevisPlan): number {
  const moved: PrevisVehicle[] = [];
  plan.characters = plan.characters.filter((c) => {
    const kind = previsVehicleKindFromText(`${c.name} ${c.id}`);
    if (!kind || PERSON_RE.test(c.name)) return true;
    moved.push({ id: c.id, name: c.name, kind, ...(c.color ? { color: c.color } : {}), path: c.path.map((k) => ({ t: k.t, x: k.x, y: k.y })) });
    return false;
  });
  if (moved.length === 0) return 0;
  const ids = new Set(moved.map((v) => v.id));
  plan.vehicles = [...(plan.vehicles ?? []).filter((v) => !ids.has(v.id)), ...moved];
  if (plan.contacts) plan.contacts = plan.contacts.filter((ct) => !ids.has(ct.a) && !ids.has(ct.b));
  return moved.length;
}

const STOP_HALF_SEC = 0.8;
const APPROACH_SEC = 1.5;
/** How close (m) someone must come to a vehicle to be getting into it. */
const BOARD_REACH_M = 3.5;
const ROAD_EDGE_M = 0.3;

function inBox(p: { x: number; y: number }, b: PrevisWorldBox, margin = 0): boolean {
  return Math.abs(p.x - b.x) <= b.w / 2 - margin && Math.abs(p.y - b.y) <= b.d / 2 - margin;
}

function clampIntoBox(p: { x: number; y: number }, b: PrevisWorldBox, margin: number): { x: number; y: number } {
  const mx = Math.min(margin, b.w / 2);
  const my = Math.min(margin, b.d / 2);
  return { x: Math.max(b.x - b.w / 2 + mx, Math.min(b.x + b.w / 2 - mx, p.x)), y: Math.max(b.y - b.d / 2 + my, Math.min(b.y + b.d / 2 - my, p.y)) };
}

/** Keep a key in the nearest box (road / water) when it is in none. Returns true when it moved. */
function keepIn(key: PrevisVehicleKey, boxes: readonly PrevisWorldBox[], margin: number, a: PrevisWorldStageAnchor): boolean {
  if (boxes.length === 0) return false;
  const p = previsStageToWorld(a, key.x, key.y);
  if (boxes.some((b) => inBox(p, b, margin))) return false;
  let best = p;
  let bestD = Infinity;
  for (const b of boxes) {
    const q = clampIntoBox(p, b, margin);
    const d = Math.hypot(q.x - p.x, q.y - p.y);
    if (d < bestD) {
      bestD = d;
      best = q;
    }
  }
  const s = previsWorldToStage(a, best.x, best.y);
  key.x = r2(s.x);
  key.y = r2(s.y);
  return true;
}

/** Tightest turn (m) of a ground / water vehicle; aircraft turn on the spot (0). */
function turnRadiusM(kind: PrevisVehicleKind): number {
  return AIR_KINDS.has(kind) ? 0 : Math.max(3.5, PREVIS_VEHICLE_SIZE[kind].l * 0.9);
}

/**
 * Heading over time (radians, 0 = stage +y, + toward +x) from the vehicle's own movement, held while it stands.
 * Cars, vans, buses and boats turn only as they move, no tighter than their turning radius, so pulling over to the
 * curb never swings the body across the road; aircraft turn freely. Shared by the 3D view and the planner checks.
 */
export function previsVehicleHeadingTrack(v: PrevisVehicle, durationSec: number, step = 0.1): (t: number) => number {
  const n = Math.max(1, Math.ceil(durationSec / step));
  const radius = turnRadiusM(v.kind);
  const start = samplePrevisVehicle(v, 0);
  let h = 0;
  for (let t = step; t <= Math.max(durationSec, v.path[v.path.length - 1]?.t ?? 0) + 1e-6; t += step) {
    const p = samplePrevisVehicle(v, t);
    if (Math.hypot(p.x - start.x, p.y - start.y) > 0.5) {
      h = Math.atan2(p.x - start.x, p.y - start.y);
      break;
    }
  }
  const out: number[] = [];
  let prev = start;
  for (let i = 0; i <= n; i++) {
    const t = i * step;
    if (radius === 0) {
      const p = samplePrevisVehicle(v, t - 0.3);
      const q = samplePrevisVehicle(v, t + 0.3);
      if (Math.hypot(q.x - p.x, q.y - p.y) > 0.15) h = Math.atan2(q.x - p.x, q.y - p.y);
    } else {
      const p = samplePrevisVehicle(v, t);
      const d = Math.hypot(p.x - prev.x, p.y - prev.y);
      if (d > 1e-4) {
        let diff = Math.atan2(p.x - prev.x, p.y - prev.y) - h;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        const max = d / radius;
        h += Math.max(-max, Math.min(max, diff));
      }
      prev = p;
    }
    out.push(h);
  }
  return (t: number) => out[Math.max(0, Math.min(out.length - 1, Math.round(t / step)))];
}

function headingAt(v: PrevisVehicle, t: number): { x: number; y: number } {
  for (const dt of [0.5, 1.5, 4]) {
    const p = samplePrevisVehicle(v, t - dt);
    const q = samplePrevisVehicle(v, t + dt);
    const d = Math.hypot(q.x - p.x, q.y - p.y);
    if (d > 0.3) return { x: (q.x - p.x) / d, y: (q.y - p.y) / d };
  }
  return { x: 0, y: 1 };
}

/** The vehicle stays at its key `i` until `until`; the rest of its route moves later by the same time. */
function waitAt(v: PrevisVehicle, i: number, until: number): void {
  const k = v.path[i];
  const delta = until - k.t;
  if (delta <= 0) return;
  for (let j = i + 1; j < v.path.length; j++) v.path[j].t = r2(v.path[j].t + delta);
  v.path.splice(i + 1, 0, { t: r2(until), x: k.x, y: k.y });
}

/** Make the vehicle stand still (on the ground) at its position at `t` for ±0.8 s; returns that position. */
function holdStill(v: PrevisVehicle, t: number, at?: { x: number; y: number }): { x: number; y: number } {
  const p = at ?? samplePrevisVehicle(v, t);
  const from = t - STOP_HALF_SEC;
  const to = t + STOP_HALF_SEC;
  const moving = (() => {
    const a = samplePrevisVehicle(v, from);
    const b = samplePrevisVehicle(v, to);
    return Math.hypot(b.x - a.x, b.y - a.y) > 0.4 || a.alt > 0.3 || b.alt > 0.3 || Math.hypot(a.x - p.x, a.y - p.y) > 0.3;
  })();
  if (!moving) return { x: p.x, y: p.y };
  // Ease in: keep its own course until 1.5 s before stopping, then glide to the stop (no sideways jump).
  const approach = from - APPROACH_SEC;
  const lead = approach > (v.path[0]?.t ?? 0) + 0.05 ? samplePrevisVehicle(v, approach) : null;
  v.path = [
    ...v.path.filter((k) => k.t < (lead ? approach : from) - 1e-6 || k.t > to + 1e-6),
    ...(lead ? [{ t: r2(approach), x: r2(lead.x), y: r2(lead.y), ...(lead.alt > 0 ? { alt: r2(lead.alt) } : {}) }] : []),
    { t: r2(Math.max(0, from)), x: r2(p.x), y: r2(p.y) },
    { t: r2(to), x: r2(p.x), y: r2(p.y) },
  ].sort((k1, k2) => k1.t - k2.t);
  return { x: p.x, y: p.y };
}

/**
 * A boat stopping for someone moors at the nearer bank (across its heading). Returns the mooring position and the
 * unit side (stage) toward the bank, or null when it is not on water.
 */
function moorAtBank(v: PrevisVehicle, t: number, ctx: PrevisVehicleWorld): { stop: { x: number; y: number }; side: { x: number; y: number } } | null {
  const pools = ctx.world.water ?? [];
  if (v.kind !== 'boat' || pools.length === 0) return null;
  const a = ctx.ref.stageAnchor;
  const p = samplePrevisVehicle(v, t);
  const h = headingAt(v, t);
  const wet = (x: number, y: number) => {
    const q = previsStageToWorld(a, x, y);
    return pools.some((b) => inBox(q, b));
  };
  if (!wet(p.x, p.y)) return null;
  let best: { d: number; side: { x: number; y: number } } | null = null;
  for (const sign of [1, -1]) {
    const side = { x: -h.y * sign, y: h.x * sign };
    for (let d = 0.25; d <= 20; d += 0.25) {
      if (!wet(p.x + side.x * d, p.y + side.y * d)) {
        if (!best || d < best.d) best = { d, side };
        break;
      }
    }
  }
  if (!best) return null;
  const pull = Math.max(0, best.d - PREVIS_VEHICLE_SIZE.boat.w / 2 - 0.3);
  return { stop: { x: p.x + best.side.x * pull, y: p.y + best.side.y * pull }, side: best.side };
}

/** A road vehicle stopping for someone pulls into the lane next to their curb. */
function pullOver(v: PrevisVehicle, t: number, toward: { x: number; y: number }, ctx: PrevisVehicleWorld): { x: number; y: number } {
  const moor = moorAtBank(v, t, ctx);
  if (moor) return moor.stop;
  const p = samplePrevisVehicle(v, t);
  const road = ROAD_KINDS.has(v.kind) ? roadLines(ctx) : null;
  if (!road) return p;
  const across = road.along === 'x' ? 'y' : 'x';
  const half = PREVIS_VEHICLE_SIZE[v.kind].w / 2 + ROAD_EDGE_M;
  const [lo, hi] = road.curbs;
  const pos = across === 'x' ? p.x : p.y;
  if (pos < lo - 1 || pos > hi + 1) return p;
  const side = (across === 'x' ? toward.x : toward.y) < (lo + hi) / 2 ? lo + half : hi - half;
  return across === 'x' ? { x: side, y: p.y } : { x: p.x, y: side };
}

/**
 * After planning (world mode): vehicles stay where their kind can go, stop for people getting in / out, and the
 * riders are at the door at those seconds. Returns how many fixes were made.
 */
export function settlePrevisVehicles(plan: PrevisPlan, ctx: PrevisVehicleWorld, story = ''): number {
  // Twice: stops made for the first riders let the second pass see who came out of / goes into a stopped vehicle.
  const first = settleOnce(plan, ctx, story);
  return first > 0 ? first + settleOnce(plan, ctx, story) : 0;
}

function settleOnce(plan: PrevisPlan, ctx: PrevisVehicleWorld, story: string): number {
  const vehicles = plan.vehicles ?? [];
  if (vehicles.length === 0) {
    delete plan.rides;
    return 0;
  }
  let fixes = untangleRides(plan) + flipPrevisArrivalRides(plan, story) + inferPrevisArrivals(plan, story) + inferPrevisBoardings(plan, story);
  fixes += boardAfterForced(plan, story);
  // Getting in / out is the touch itself: contacts at those moments (or while inside) are dropped.
  if (plan.contacts?.length && plan.rides?.length) {
    const busy = (id: string, t: number) =>
      plan.rides!.some((r) => r.who === id && (Math.abs(t - r.from) <= 1 || (r.to !== undefined && Math.abs(t - r.to) <= 1) || (t >= r.from && (r.to === undefined || t < r.to))));
    const before = plan.contacts.length;
    plan.contacts = plan.contacts.filter((ct) => !busy(ct.a, ct.t) && !busy(ct.b, ct.t));
    fixes += before - plan.contacts.length;
    if (plan.contacts.length === 0) delete plan.contacts;
  }
  // "Gets out" at the very end, with nothing to do afterwards, or right at the end of a drive away: stays inside.
  for (const r of plan.rides ?? []) {
    if (r.to === undefined) continue;
    const c = plan.characters.find((x) => x.id === r.who);
    const v = vehicles.find((x) => x.id === r.vehicle);
    const after = c?.path.some((k) => k.t > (r.to as number) + 0.05) ?? false;
    const drove = v ? Math.hypot(samplePrevisVehicle(v, r.to).x - samplePrevisVehicle(v, r.from).x, samplePrevisVehicle(v, r.to).y - samplePrevisVehicle(v, r.from).y) : 0;
    if (r.to >= plan.durationSec - 0.1 || (!after && r.from > 0.05) || (r.to >= plan.durationSec - 2 && drove >= 8)) delete r.to;
  }
  const a = ctx.ref.stageAnchor;
  for (const v of vehicles) {
    const size = PREVIS_VEHICLE_SIZE[v.kind];
    const boxes = ROAD_KINDS.has(v.kind) && roadLines(ctx) ? ctx.world.roads : v.kind === 'boat' ? (ctx.world.water ?? []) : [];
    for (const k of v.path) {
      if (keepIn(k, boxes, size.w / 2 + ROAD_EDGE_M, a)) fixes++;
      if (!AIR_KINDS.has(v.kind) && k.alt) {
        delete k.alt;
        fixes++;
      }
    }
  }
  const people = new Set(plan.characters.map((c) => c.id));
  plan.rides = (plan.rides ?? []).filter((r) => people.has(r.who) && vehicles.some((v) => v.id === r.vehicle));
  // Several people at one door at the same moment stand side by side along the vehicle.
  const spread = (ride: { vehicle: string; who: string }, t: number, key: 'from' | 'to') => {
    const same = (plan.rides ?? []).filter((r) => r.vehicle === ride.vehicle && r[key] !== undefined && Math.abs((r[key] as number) - t) < 0.6);
    const i = same.findIndex((r) => r.who === ride.who);
    return same.length > 1 && i >= 0 ? (i - (same.length - 1) / 2) * 0.8 : 0;
  };
  for (const ride of plan.rides) {
    const v = vehicles.find((x) => x.id === ride.vehicle)!;
    const c = plan.characters.find((x) => x.id === ride.who)!;
    const doorAt = (t: number, toward: { x: number; y: number }, along = 0) => {
      const moor = moorAtBank(v, t, ctx);
      const h = headingAt(v, t);
      const stop = holdStill(v, t, moor?.stop ?? pullOver(v, t, toward, ctx));
      // Door on the side facing the person, perpendicular to the heading; a car on the road opens onto the nearer
      // curb (never into traffic), a moored boat onto the bank.
      const nx = -h.y;
      const ny = h.x;
      const road = ROAD_KINDS.has(v.kind) ? roadLines(ctx) : null;
      let face = toward;
      if (road) {
        const across = road.along === 'x' ? 'y' : 'x';
        const pos = across === 'x' ? stop.x : stop.y;
        const [lo, hi] = road.curbs;
        if (pos >= lo - 0.5 && pos <= hi + 0.5) {
          const curb = Math.abs(pos - lo) <= Math.abs(pos - hi) ? lo - 2 : hi + 2;
          face = across === 'x' ? { x: curb, y: stop.y } : { x: stop.x, y: curb };
        }
      }
      const sign = moor ? (moor.side.x * nx + moor.side.y * ny >= 0 ? 1 : -1) : (face.x - stop.x) * nx + (face.y - stop.y) * ny >= 0 ? 1 : -1;
      const off = Math.min(PREVIS_VEHICLE_SIZE[v.kind].w / 2, 3) + (v.kind === 'boat' ? 0.8 : 0.5);
      return { x: r2(stop.x + sign * nx * off + h.x * along), y: r2(stop.y + sign * ny * off + h.y * along) };
    };
    // Inside from the start (they arrive in it): the vehicle keeps moving; only getting out stops it.
    const arrives = ride.from <= 0.05;
    if (!arrives) {
      // Getting in where the vehicle stood (landed) a little earlier: it waits there instead of leaving first.
      const me = samplePrevisCharacter(c, ride.from);
      const now = samplePrevisVehicle(v, ride.from);
      let i = -1;
      v.path.forEach((k, j) => {
        if (k.t < ride.from && (k.alt ?? 0) <= 1 && Math.hypot(k.x - me.x, k.y - me.y) <= 6) i = j;
      });
      if (i >= 0 && v.path[i + 1] && (Math.hypot(now.x - v.path[i].x, now.y - v.path[i].y) > 1 || now.alt > 1)) {
        waitAt(v, i, ride.from + STOP_HALF_SEC);
        fixes++;
      }
    }
    const after = ride.to !== undefined ? samplePrevisCharacter(c, ride.to + 1) : null;
    const outDoor = ride.to !== undefined ? doorAt(ride.to, after ?? samplePrevisVehicle(v, ride.to), spread(ride, ride.to, 'to')) : null;
    const inDoor = arrives ? (outDoor ?? samplePrevisVehicle(v, 0)) : doorAt(ride.from, samplePrevisCharacter(c, ride.from - 1), spread(ride, ride.from, 'from'));
    const action = c.path.find((k) => Math.abs(k.t - ride.from) < 0.3)?.action;
    const end = ride.to ?? Infinity;
    // Marks just before getting in / after getting out on the far side of the vehicle would walk through it.
    const farSide = (k: { t: number; x: number; y: number }, door: { x: number; y: number }, t: number) => {
      const at = samplePrevisVehicle(v, t);
      return (k.x - at.x) * (door.x - at.x) + (k.y - at.y) * (door.y - at.y) < 0.3;
    };
    const nearIn = (k: { t: number }) => !arrives && k.t < ride.from && k.t >= ride.from - 3;
    const nearOut = (k: { t: number }) => ride.to !== undefined && k.t > ride.to && k.t <= ride.to + 3;
    c.path = [
      ...c.path.filter(
        (k) =>
          (k.t < ride.from - 1e-6 || k.t > end + 1e-6) &&
          !(nearIn(k) && farSide(k, inDoor, ride.from)) &&
          !(outDoor && nearOut(k) && farSide(k, outDoor, ride.to as number)),
      ),
      { t: r2(ride.from), x: inDoor.x, y: inDoor.y, ...(action ? { action } : {}) },
      ...(outDoor && ride.to !== undefined ? [{ t: r2(ride.to), x: outDoor.x, y: outDoor.y }] : []),
    ].sort((k1, k2) => k1.t - k2.t);
    fixes++;
  }
  if (plan.rides.length === 0) delete plan.rides;
  fixes += ensurePrevisDepartures(plan, story);
  return fixes;
}

/**
 * "Gets in at 4 s" for someone who is nowhere before 4 s, in a story where people get out: they came in the
 * vehicle and get out at 4 s.
 */
function flipPrevisArrivalRides(plan: PrevisPlan, story: string): number {
  if (!GET_OUT_RE.test(story)) return 0;
  const forcedIn = boardersNamedInStory(plan, story);
  let n = 0;
  for (const r of plan.rides ?? []) {
    if (r.from <= 0.5 || r.to !== undefined || forcedIn.has(r.who)) continue;
    const c = plan.characters.find((x) => x.id === r.who);
    if (!c || (c.path[0]?.t ?? 0) < r.from - 0.3) continue;
    r.to = r.from;
    r.from = 0;
    n++;
  }
  return n;
}

/** Someone the text forces into a vehicle gets in first; the others getting into it follow right after. */
function boardAfterForced(plan: PrevisPlan, story: string): number {
  const forced = boardersNamedInStory(plan, story);
  if (forced.size === 0) return 0;
  let n = 0;
  for (const v of plan.vehicles ?? []) {
    const forcedFrom = (plan.rides ?? []).filter((r) => r.vehicle === v.id && forced.has(r.who) && r.from > 0.05).map((r) => r.from);
    if (forcedFrom.length === 0) continue;
    const first = Math.min(...forcedFrom);
    for (const r of plan.rides ?? []) {
      if (r.vehicle !== v.id || forced.has(r.who) || r.from <= 0.05 || r.to !== undefined || r.from >= first) continue;
      r.from = r2(Math.min(plan.durationSec - 0.2, first + 0.3));
      n++;
    }
  }
  return n;
}

/** The text has the vehicle leave but its path ends where people got in: it drives / flies / sails away after them. */
function ensurePrevisDepartures(plan: PrevisPlan, story: string): number {
  if (!LEAVE_RE.test(story)) return 0;
  let n = 0;
  for (const v of plan.vehicles ?? []) {
    const boarded = (plan.rides ?? []).filter((r) => r.vehicle === v.id && r.from > 0.05 && r.to === undefined).map((r) => r.from);
    if (boarded.length === 0) continue;
    const go = Math.max(...boarded) + 1;
    if (go > plan.durationSec - 0.5) continue;
    const at = samplePrevisVehicle(v, go);
    const end = samplePrevisVehicle(v, plan.durationSec);
    if (Math.hypot(end.x - at.x, end.y - at.y) > 3 || end.alt > at.alt + 3) continue;
    const h = headingAt(v, go);
    const speed = v.kind === 'boat' ? 4 : AIR_KINDS.has(v.kind) ? 15 : 8;
    const far = Math.min(60, speed * (plan.durationSec - go) + 10);
    v.path = [
      ...v.path.filter((k) => k.t < go - 1e-6),
      { t: r2(go), x: r2(at.x), y: r2(at.y), ...(at.alt > 0 ? { alt: r2(at.alt) } : {}) },
      {
        t: r2(go + far / speed),
        x: r2(at.x + h.x * far),
        y: r2(at.y + h.y * far),
        ...(AIR_KINDS.has(v.kind) ? { alt: 30 } : {}),
      },
    ];
    n++;
  }
  return n;
}

/**
 * People who come out of a vehicle in the text but have no ride: someone whose path starts late next to a vehicle
 * was inside it until then (otherwise they would stand there from 0 s). Returns rides added.
 */
function inferPrevisArrivals(plan: PrevisPlan, story: string): number {
  if (!GET_OUT_RE.test(story)) return 0;
  const vehicles = plan.vehicles ?? [];
  const forcedIn = boardersNamedInStory(plan, story);
  let added = 0;
  for (const c of plan.characters) {
    const t0 = c.path[0]?.t ?? 0;
    if ((plan.rides ?? []).some((r) => r.who === c.id && r.from <= Math.max(t0, 0.05))) continue;
    if (t0 < 0.8) {
      // Standing under a hovering / arriving vehicle from 0 s and still beside it when it lands: they were inside.
      if (forcedIn.has(c.id)) continue;
      const start = samplePrevisCharacter(c, 0);
      for (const v of vehicles) {
        const p0 = samplePrevisVehicle(v, 0);
        const p1 = samplePrevisVehicle(v, 0.5);
        const arriving = p0.alt > 1 || Math.hypot(p1.x - p0.x, p1.y - p0.y) > 0.5;
        if (!arriving || Math.hypot(start.x - p0.x, start.y - p0.y) > 6) continue;
        let ts = -1;
        for (let t = 0.5; t <= plan.durationSec - 0.5; t += 0.25) {
          const p = samplePrevisVehicle(v, t);
          const q = samplePrevisVehicle(v, t + 0.25);
          if (p.alt < 1 && Math.hypot(q.x - p.x, q.y - p.y) < 0.15) {
            ts = t;
            break;
          }
        }
        const me = ts > 0 ? samplePrevisCharacter(c, ts) : null;
        const at = ts > 0 ? samplePrevisVehicle(v, ts) : null;
        if (me && at && Math.hypot(me.x - at.x, me.y - at.y) <= 6) {
          plan.rides = [...(plan.rides ?? []), { who: c.id, vehicle: v.id, from: 0, to: r2(ts + 0.5) }];
          added++;
          break;
        }
      }
      continue;
    }
    const near = vehicles
      .map((v) => ({ v, p: samplePrevisVehicle(v, t0) }))
      .filter(({ p }) => Math.hypot(p.x - c.path[0].x, p.y - c.path[0].y) <= 5 && p.alt < 1)
      .sort((u, w) => Math.hypot(u.p.x - c.path[0].x, u.p.y - c.path[0].y) - Math.hypot(w.p.x - c.path[0].x, w.p.y - c.path[0].y))[0];
    // Otherwise: the first moment a vehicle stands still (landed) next to them is when they get out.
    let out: { v: PrevisVehicle; t: number } | null = near ? { v: near.v, t: t0 } : null;
    for (let t = Math.max(0.5, t0 - 1); !out && t <= plan.durationSec - 0.5; t += 0.25) {
      const me = samplePrevisCharacter(c, t);
      for (const v of vehicles) {
        const p = samplePrevisVehicle(v, t);
        const q = samplePrevisVehicle(v, t + 0.25);
        if (p.alt < 1 && Math.hypot(q.x - p.x, q.y - p.y) < 0.15 && Math.hypot(me.x - p.x, me.y - p.y) <= 5) {
          out = { v, t: r2(t) };
          break;
        }
      }
    }
    if (!out) continue;
    plan.rides = [...(plan.rides ?? []), { who: c.id, vehicle: out.v.id, from: 0, to: out.t }];
    added++;
  }
  return added;
}

/**
 * People who get into a vehicle in the text but have no ride: someone who reaches a spot where a vehicle stopped /
 * landed gets in there. When they arrive after it left again, the vehicle waits for them (its later keys move back).
 */
function inferPrevisBoardings(plan: PrevisPlan, story: string): number {
  if (!GET_IN_RE.test(story)) return 0;
  // Named just before a get-in phrase ("把角色A绑进车里"): they must get in. Nobody named and no ride at all: anyone
  // who reaches a stopped vehicle gets in.
  const named = boardersNamedInStory(plan, story);
  const anyone = named.size === 0 && !(plan.rides ?? []).some((r) => r.from > 0.05);
  // People who came in a vehicle and are next to it again later leave with it (the kidnappers get back in).
  const cameIn = new Map((plan.rides ?? []).filter((r) => r.from <= 0.05 && r.to !== undefined).map((r) => [r.who, r]));
  let added = 0;
  // Named people first: the ones who came in get back in after them.
  const order = [...plan.characters].sort((a, b) => Number(named.has(b.id)) - Number(named.has(a.id)));
  for (const c of order) {
    const arrival = cameIn.get(c.id);
    if (!anyone && !named.has(c.id) && !arrival) continue;
    if ((plan.rides ?? []).some((r) => r.who === c.id && r.from > 0.05)) continue;
    const namedIn = (plan.rides ?? []).filter((r) => named.has(r.who) && r.from > 0.05 && (!arrival || r.vehicle === arrival.vehicle));
    const earliest =
      arrival && !named.has(c.id)
        ? Math.max((arrival.to as number) + 1.5, namedIn.length ? Math.min(...namedIn.map((r) => r.from)) + 0.3 : 0)
        : 0.5;
    let hit: { v: PrevisVehicle; i: number; t: number } | null = null;
    for (const v of plan.vehicles ?? []) {
      if (arrival && v.id !== arrival.vehicle) continue;
      v.path.forEach((k, i) => {
        if (i === 0 || (k.alt ?? 0) > 1) return;
        for (let t = Math.max(earliest, k.t - 2); t <= plan.durationSec - 0.5; t += 0.25) {
          const p = samplePrevisCharacter(c, t);
          if (Math.hypot(p.x - k.x, p.y - k.y) <= BOARD_REACH_M) {
            if (!hit || t < hit.t) hit = { v, i, t };
            break;
          }
        }
      });
    }
    if (!hit) continue;
    const { v, i, t } = hit as { v: PrevisVehicle; i: number; t: number };
    const k = v.path[i];
    const leaveAt = t + STOP_HALF_SEC;
    const now = samplePrevisVehicle(v, t);
    // It left before they got there: it waits at that spot.
    if (v.path[i + 1] && (Math.hypot(now.x - k.x, now.y - k.y) > 1 || now.alt > 1)) waitAt(v, i, leaveAt);
    plan.rides = [...(plan.rides ?? []), { who: c.id, vehicle: v.id, from: r2(t) }];
    added++;
  }
  return added;
}

/** Camera keys inside a vehicle's body at that second move out to its side (the van must not drive through the lens). */
export function keepPrevisCameraOffVehicles(plan: PrevisPlan, margin = 0.6): number {
  let moved = 0;
  for (const k of plan.camera.keys) {
    for (const v of plan.vehicles ?? []) {
      const size = PREVIS_VEHICLE_SIZE[v.kind];
      const p = samplePrevisVehicle(v, k.t);
      if (k.h < p.alt - 0.3 || k.h > p.alt + size.h + 0.3) continue;
      const h = headingAt(v, k.t);
      const dx = k.x - p.x;
      const dy = k.y - p.y;
      const along = dx * h.x + dy * h.y;
      const across = -dx * h.y + dy * h.x;
      const halfL = Math.max(size.l, size.w) / 2 + margin;
      const halfW = size.w / 2 + margin;
      if (Math.abs(along) >= halfL || Math.abs(across) >= halfW) continue;
      const out = (across >= 0 ? 1 : -1) * (halfW + 0.2);
      k.x = r2(p.x + along * h.x - out * h.y);
      k.y = r2(p.y + along * h.y + out * h.x);
      moved++;
    }
  }
  return moved;
}

/** Camera shots framing someone who is inside a vehicle at that second frame the vehicle instead. */
export function retargetPrevisShotsToRides(plan: PrevisPlan): number {
  if (!plan.rides?.length || !plan.camera.shots?.length) return 0;
  const inside = (id: string | undefined, t: number) =>
    id ? plan.rides!.find((r) => r.who === id && t >= r.from && (r.to === undefined || t < r.to))?.vehicle : undefined;
  let n = 0;
  for (const s of plan.camera.shots) {
    const v = inside(s.subject, s.t);
    if (v) {
      s.subject = v;
      if (s.relation === 'over_shoulder') s.relation = 'behind';
      delete s.toward;
      n++;
    } else {
      const tv = inside(s.toward, s.t);
      if (tv) {
        s.toward = tv;
        n++;
      }
    }
  }
  return n;
}

function boardersNamedInStory(plan: PrevisPlan, story: string): Set<string> {
  const out = new Set<string>();
  const re = new RegExp(GET_IN_RE.source, 'gi');
  for (const m of story.matchAll(re)) {
    const before = story.slice(Math.max(0, (m.index ?? 0) - 16), m.index ?? 0);
    // Only the last clause before the phrase (after the previous comma / full stop).
    const clause = before.split(/[，。,.;；！!？?]/).pop() ?? '';
    for (const c of plan.characters) if (c.name && clause.includes(c.name)) out.add(c.id);
  }
  return out;
}

/** One person's rides never overlap: an earlier ride ends a second before the next one starts. */
function untangleRides(plan: PrevisPlan): number {
  let n = 0;
  const rides = [...(plan.rides ?? [])].sort((a, b) => (a.who === b.who ? a.from - b.from : a.who < b.who ? -1 : 1));
  for (let i = 0; i + 1 < rides.length; i++) {
    const a = rides[i];
    const b = rides[i + 1];
    if (a.who !== b.who || (a.to !== undefined && a.to <= b.from)) continue;
    a.to = r2(Math.max(a.from + 0.5, b.from - 1));
    n++;
  }
  plan.rides = rides.filter((r) => r.to === undefined || r.to > r.from);
  return n;
}

/** Story gaps the planner should fix: vehicles in the text but none planned, people getting in / out without rides. */
export function previsVehicleIntentGaps(plan: PrevisPlan, story: string): string[] {
  const gaps: string[] = [];
  const kind = previsVehicleKindFromText(story);
  if (kind && !(plan.vehicles?.length)) {
    gaps.push(`The text has a ${kind} but "vehicles" is empty: add it to "vehicles" (not as a character) with its own path.`);
  }
  if (plan.vehicles?.length) {
    const rides = plan.rides ?? [];
    if (GET_IN_RE.test(story) && !rides.some((r) => r.from > 0.05)) {
      gaps.push('Someone gets into a vehicle in the text but no ride starts after 0 s: add a ride (who, vehicle, "from" = the second they are inside).');
    }
    if (GET_OUT_RE.test(story) && !rides.some((r) => r.to !== undefined)) {
      gaps.push('Someone gets out of a vehicle in the text but no ride has "to": people who arrive inside it have a ride from 0 to the second they get out (their path starts at its door then).');
    }
  }
  return gaps;
}
