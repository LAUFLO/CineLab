/**
 * Shared previs plan core (no imports): types, normalize/parse, sampling and feasibility checks.
 * Used by the plan-director-previs Edge Function and by the client renderer.
 *
 * Floor coordinates are meters: `x` to the right, `y` away from the viewer (top of the top-down map).
 * Heights (`h`) are meters above the floor.
 */
import type { PrevisWorldRef } from './world-gen';

/** Set pieces the previs draws as recognizable low-poly shapes; anything else is a plain block. */
export const PREVIS_PROP_KINDS = [
  'door',
  'stairwell',
  'stairs',
  'railing',
  'low_wall',
  'table',
  'desk',
  'chair',
  'sofa',
  'bed',
  'counter',
  'shelf',
  'pillar',
  'window',
  'car',
  'tree',
  'box',
] as const;
export type PrevisPropKind = (typeof PREVIS_PROP_KINDS)[number];

export interface PrevisProp {
  id: string;
  label: string;
  /** What the block is (drawn shape); inferred from the label when the planner leaves it out. */
  kind?: PrevisPropKind;
  /** Center of the block on the floor. */
  x: number;
  y: number;
  /** Size along x. */
  w: number;
  /** Size along y. */
  d: number;
  h: number;
  /** Degrees the front (door opening, stairs going up, seat) faces: 0 = +y, 90 = +x, 180 = toward the entrance. */
  facing?: number;
  color?: string;
  /** Part of the world around the stage (shop door, lamp, tree, car): settle steps never move or turn it. */
  fixed?: boolean;
  /** Id of the world object this prop stands for. */
  worldId?: string;
}

/** Indoor sets have walls; outdoor sets have low edges and open surroundings. */
export interface PrevisSet {
  kind: 'indoor' | 'outdoor';
  /** One English sentence about the place (no people): used to turn the previs set into a scene image. */
  description?: string;
  /** Whitebox world the stage sits in (see previsWorldGen.ts). Missing on plans without a world. */
  world?: PrevisWorldRef;
}

export interface PrevisCharacterKey {
  t: number;
  x: number;
  y: number;
  /** Short action label shown on the map, e.g. "steps on letter". */
  action?: string;
  /** Facing in degrees while standing still: 0 = toward +y (deeper), 90 = +x, 180 = toward the entrance. */
  facing?: number;
  /** Set or moved by hand in the 3D Director (kept when nearby planned / recorded keys are re-blended). */
  byHand?: boolean;
}

export interface PrevisCharacter {
  id: string;
  name: string;
  color: string;
  path: PrevisCharacterKey[];
}

/** Vehicles: they drive / sail / fly on their own path; people get in and out of them (`rides`). */
export const PREVIS_VEHICLE_KINDS = ['car', 'van', 'bus', 'boat', 'helicopter', 'plane', 'spaceship'] as const;
export type PrevisVehicleKind = (typeof PREVIS_VEHICLE_KINDS)[number];

export interface PrevisVehicleKey {
  t: number;
  x: number;
  y: number;
  /** Height above the ground (m), for aircraft; 0 / missing = on the ground or water. */
  alt?: number;
}

export interface PrevisVehicle {
  id: string;
  name: string;
  kind: PrevisVehicleKind;
  color?: string;
  path: PrevisVehicleKey[];
}

/** `who` gets into `vehicle` at `from` (hidden while inside) and out at `to` (stays inside when missing). */
export interface PrevisRide {
  who: string;
  vehicle: string;
  from: number;
  to?: number;
}

export interface PrevisPoint3 {
  x: number;
  y: number;
  h: number;
}

export interface PrevisCameraKey {
  t: number;
  x: number;
  y: number;
  h: number;
  /** Character id (aims at that character's chest/head) or a fixed floor point with height. */
  lookAt: string | PrevisPoint3;
  /** Height on the character to aim at when `lookAt` is a character id. Defaults to 1.3. */
  lookAtH?: number;
  /** Move vocabulary label, e.g. "low follow", "orbit", "crane up". */
  move?: string;
  /** Turn (degrees, + = clockwise seen from above) away from `lookAt`; the aim keeps tracking it. */
  yawDeg?: number;
  /** Vertical field of view at this key (zoom); defaults to `camera.fovDeg`. */
  fovDeg?: number;
  /** Camera roll (Dutch angle), degrees; + tilts the frame clockwise. */
  rollDeg?: number;
  /** Set or moved by hand in the 3D Director (kept when nearby planned / recorded keys are re-blended). */
  byHand?: boolean;
}

/**
 * Where the camera stands relative to the subject's own facing. The model writes these; coordinates are
 * solved in code (`solvePrevisCameraShots`) because models get "behind / over the shoulder" wrong in x/y.
 */
export type PrevisCameraRelation = 'front' | 'front_side' | 'side' | 'back_side' | 'behind' | 'over_shoulder' | 'hold';
export type PrevisCameraDistance = 'close' | 'medium' | 'far';
export type PrevisCameraHeight = 'floor' | 'low' | 'eye' | 'high' | 'crane';
export type PrevisCameraAim = 'feet' | 'body' | 'face';

export interface PrevisCameraShot {
  /** Second at which this framing is reached; the camera moves continuously between shots. */
  t: number;
  /** Character the camera frames (for `over_shoulder`: whose shoulder the camera is behind). */
  subject: string;
  relation: PrevisCameraRelation;
  /** The subject's own left/right. Defaults to the previous shot's side (keeps the 180° line). */
  side?: 'left' | 'right';
  /** `over_shoulder` only: the character the camera looks at past the subject's shoulder. */
  toward?: string;
  distance?: PrevisCameraDistance;
  height?: PrevisCameraHeight;
  aim?: PrevisCameraAim;
  move?: string;
  /**
   * Exact framing from the top-down editor; when `angleDeg` + `distM` are set they replace relation / side /
   * distance (the camera stays at that angle and distance around the subject, aiming at `toward` or the subject).
   */
  angleDeg?: number;
  distM?: number;
  heightM?: number;
  /** Pan away from the aim target in degrees, + = clockwise seen from above. */
  yawDeg?: number;
  /** Set by the solver on a hold it created (framing out of reach): keep gliding with the previous framing while panning. */
  drift?: boolean;
  /** Technique catalog ids (previsTechniques.ts): camera move to the next shot, shot size, angle, composition. */
  technique?: string;
  size?: string;
  angle?: string;
  composition?: string;
  /** Vertical field of view for this framing (zoom / shot size). */
  fovDeg?: number;
  /** Camera roll (Dutch angle), degrees. */
  rollDeg?: number;
  /** Handheld-style shake from this shot to the next. */
  shake?: boolean;
  /** Degrees further round the subject than the previous shot of the same subject (truck / arc / orbit). */
  angleOffsetDeg?: number;
  /** Static / pan: the camera stays where this framing puts it at `t` and only turns. */
  still?: boolean;
}

/** Two characters must physically meet at `t` (hand-over, touch, embrace, whisper). */
export interface PrevisContact {
  t: number;
  a: string;
  b: string;
  what?: string;
}

export interface PrevisBeat {
  t: number;
  text: string;
}

export interface PrevisPlan {
  version: 1;
  title?: string;
  durationSec: number;
  stage: { width: number; depth: number };
  /** Missing on plans made before set layouts (rendered as an indoor set). */
  set?: PrevisSet;
  props: PrevisProp[];
  characters: PrevisCharacter[];
  /** `keys` drive rendering; when `shots` exist the keys are solved from them. */
  camera: { fovDeg?: number; keys: PrevisCameraKey[]; shots?: PrevisCameraShot[] };
  contacts?: PrevisContact[];
  beats?: PrevisBeat[];
  vehicles?: PrevisVehicle[];
  rides?: PrevisRide[];
}

export type PrevisIssueLevel = 'error' | 'warn';

export interface PrevisIssue {
  level: PrevisIssueLevel;
  message: string;
}

export const PREVIS_WALK_COMFORT_MPS = 1.6;
export const PREVIS_RUN_MPS = 2.4;
export const PREVIS_CAMERA_MAX_MPS = 3;
export const PREVIS_DEFAULT_LOOK_AT_H = 1.3;
export const PREVIS_CHARACTER_HEAD_H = 1.6;
/** Closest the camera may sit to the character it is aiming at (key frames). */
export const PREVIS_CAMERA_MIN_SUBJECT_M = 1;
/** Camera closer than this to any figure (below head height) is inside the body. */
export const PREVIS_CAMERA_COLLISION_M = 0.45;
/** Characters in a contact must be at most this far apart at the contact time. */
export const PREVIS_CONTACT_MAX_M = 0.9;
/** Talking ("一起聊天", "chats with") needs a conversation distance, not touching. */
export const PREVIS_TALK_MAX_M = 3;
const PREVIS_TALK_GAP_M = 1.2;
const TALK_CONTACT_RE = /聊天|聊|交谈|谈话|说话|对话|寒暄|打招呼|问候|\btalk|\bchat|\bspeak|\bconvers|\bgreet|\bsay/i;

export function isPrevisTalkContact(ct: Pick<PrevisContact, 'what'>): boolean {
  return TALK_CONTACT_RE.test(ct.what ?? '');
}

/** Farthest two people may stand for this contact to count as happening. */
export function previsContactReachM(ct: Pick<PrevisContact, 'what'>): number {
  return isPrevisTalkContact(ct) ? PREVIS_TALK_MAX_M : PREVIS_CONTACT_MAX_M;
}
/** Handing something across a counter / desk / table: its thickness plus an arm's reach on each side. */
const ACROSS_REACH_M = 1.6;

/** A counter, desk or table both people stand at, on opposite sides, close enough to hand something over. */
function contactAcrossFurniture(plan: PrevisPlan, a: { x: number; y: number }, b: { x: number; y: number }): boolean {
  return plan.props.some((p) => {
    const kind = p.kind ?? inferPrevisPropKind(p.label);
    if (kind !== 'counter' && kind !== 'desk' && kind !== 'table') return false;
    if (distanceToProp(a, p) > 0.9 || distanceToProp(b, p) > 0.9) return false;
    // Opposite sides: the line between them crosses the piece's footprint.
    for (let u = 0.1; u < 0.95; u += 0.1) {
      const q = { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u };
      if (distanceToProp(q, p) < 1e-6) return Math.hypot(a.x - b.x, a.y - b.y) <= Math.min(p.w, p.d) + ACROSS_REACH_M;
    }
    return false;
  });
}

export const PREVIS_CAMERA_RELATIONS: readonly PrevisCameraRelation[] = [
  'front',
  'front_side',
  'side',
  'back_side',
  'behind',
  'over_shoulder',
  'hold',
];
/** Angle from the subject's facing to the camera, toward the subject's right. `behind` keeps a slight shoulder offset. */
const RELATION_ANGLE_DEG: Record<Exclude<PrevisCameraRelation, 'over_shoulder' | 'hold'>, number> = {
  front: 0,
  front_side: 45,
  side: 90,
  back_side: 135,
  behind: 160,
};
export const PREVIS_CAMERA_DISTANCE_M: Record<PrevisCameraDistance, number> = { close: 1.5, medium: 2.5, far: 4 };
export const PREVIS_CAMERA_HEIGHT_M: Record<PrevisCameraHeight, number> = { floor: 0.35, low: 0.9, eye: 1.5, high: 2.4, crane: 3.2 };
export const PREVIS_CAMERA_AIM_H: Record<PrevisCameraAim, number> = { feet: 0.25, body: 1, face: 1.5 };
/** Dense key spacing for solved camera paths. */
const SOLVED_KEY_STEP_SEC = 0.25;

const DEFAULT_FOV = 40;

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

/** Character floor position at time `t`; holds the first/last key outside the path range. */
export function samplePrevisCharacter(character: PrevisCharacter, t: number): { x: number; y: number } {
  const keys = character.path;
  if (keys.length === 0) return { x: 0, y: 0 };
  if (t <= keys[0].t) return { x: keys[0].x, y: keys[0].y };
  const last = keys[keys.length - 1];
  if (t >= last.t) return { x: last.x, y: last.y };
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i];
    const b = keys[i + 1];
    if (t >= a.t && t <= b.t) {
      const span = b.t - a.t;
      const u = span > 0 ? (t - a.t) / span : 1;
      return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u };
    }
  }
  return { x: last.x, y: last.y };
}

/** Vehicle position and altitude at `t` (linear between keys, held before the first / after the last). */
export function samplePrevisVehicle(vehicle: PrevisVehicle, t: number): { x: number; y: number; alt: number } {
  const keys = vehicle.path;
  if (keys.length === 0) return { x: 0, y: 0, alt: 0 };
  const at = (k: PrevisVehicleKey) => ({ x: k.x, y: k.y, alt: k.alt ?? 0 });
  if (t <= keys[0].t) return at(keys[0]);
  for (let i = 0; i + 1 < keys.length; i++) {
    const a = keys[i];
    const b = keys[i + 1];
    if (t <= b.t) {
      const u = b.t > a.t ? (t - a.t) / (b.t - a.t) : 1;
      return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, alt: (a.alt ?? 0) + ((b.alt ?? 0) - (a.alt ?? 0)) * u };
    }
  }
  return at(keys[keys.length - 1]);
}

/** True while `who` is inside a vehicle (between getting in and getting out). */
export function isPrevisRiding(plan: PrevisPlan, who: string, t: number): boolean {
  return (plan.rides ?? []).some((r) => r.who === who && t >= r.from && (r.to === undefined || t < r.to));
}

const vehicleSubjects = new WeakMap<PrevisVehicle, PrevisCharacter>();
/** Camera distance multiplier when a shot frames a vehicle (distances are set for people). */
const VEHICLE_FRAMING_SCALE: Record<PrevisVehicleKind, number> = { car: 3, van: 3.2, bus: 5, boat: 3.5, helicopter: 5, plane: 8, spaceship: 8 };
const subjectFramingScale = new WeakMap<PrevisCharacter, number>();

/**
 * A character, or a vehicle seen as one (same id / path) so the camera can frame and follow it. The vehicle view is
 * cached per vehicle object, so solver identity checks (same subject as the previous shot) hold.
 */
export function previsSubjectById(plan: PrevisPlan, id: string | undefined): PrevisCharacter | undefined {
  if (!id) return undefined;
  const c = plan.characters.find((ch) => ch.id === id);
  if (c) return c;
  const v = plan.vehicles?.find((x) => x.id === id);
  if (!v) return undefined;
  let s = vehicleSubjects.get(v);
  if (!s || s.path !== (v.path as unknown)) {
    s = { id: v.id, name: v.name, color: v.color ?? 'gray', path: v.path as PrevisCharacterKey[] };
    vehicleSubjects.set(v, s);
    subjectFramingScale.set(s, VEHICLE_FRAMING_SCALE[v.kind] ?? 3);
  }
  return s;
}

/** Half window of the render's walking smoothing (s): eases starts, stops and corners. */
const RENDER_WALK_SMOOTH_SEC = 0.3;

/**
 * Position for drawing a figure: the planned path averaged over ±0.3 s (triangle weights), so walks speed
 * up and slow down instead of jumping between speeds, and corners are rounded. Standing spots are exact.
 */
export function samplePrevisCharacterSmooth(character: PrevisCharacter, t: number): { x: number; y: number } {
  let sx = 0;
  let sy = 0;
  let sw = 0;
  const n = 6;
  for (let k = -n; k <= n; k++) {
    const w = n + 1 - Math.abs(k);
    const p = samplePrevisCharacter(character, t + (k / n) * RENDER_WALK_SMOOTH_SEC);
    sx += p.x * w;
    sy += p.y * w;
    sw += w;
  }
  return { x: sx / sw, y: sy / sw };
}

/** How fast figures turn on the spot in the render (rad/s): a half turn takes ~0.8 s. */
const RENDER_TURN_RAD_PER_SEC = 4;
const RENDER_TURN_STEP_SEC = 1 / 30;
const renderHeadingCache = new WeakMap<PrevisCharacter, { sig: string; headings: number[] }>();

/**
 * Heading for drawing a figure: like `samplePrevisCharacterHeading`, but turns at a human pace instead of
 * snapping (a stop with a new `facing` would otherwise flip the figure in one frame).
 */
export function samplePrevisCharacterTurnHeading(character: PrevisCharacter, t: number): number {
  const sig = JSON.stringify(character.path);
  let cached = renderHeadingCache.get(character);
  if (!cached || cached.sig !== sig) {
    const end = (character.path[character.path.length - 1]?.t ?? 0) + 2;
    const headings: number[] = [];
    let h = samplePrevisCharacterHeading(character, 0);
    const maxStep = RENDER_TURN_RAD_PER_SEC * RENDER_TURN_STEP_SEC;
    for (let n = 0; n * RENDER_TURN_STEP_SEC <= end + 1e-6; n++) {
      const want = samplePrevisCharacterHeading(character, n * RENDER_TURN_STEP_SEC);
      const d = Math.atan2(Math.sin(want - h), Math.cos(want - h));
      h += Math.max(-maxStep, Math.min(maxStep, d));
      headings.push(h);
    }
    cached = { sig, headings };
    renderHeadingCache.set(character, cached);
  }
  const i = Math.max(0, Math.min(cached.headings.length - 1, Math.round(t / RENDER_TURN_STEP_SEC)));
  return cached.headings[i];
}

/** Heading in radians (0 = facing +y): movement direction while walking, else the latest `facing`. */
export function samplePrevisCharacterHeading(character: PrevisCharacter, t: number): number {
  const keys = character.path;
  let heading = typeof keys[0]?.facing === 'number' ? (keys[0].facing * Math.PI) / 180 : 0;
  for (let i = 0; i < keys.length; i++) {
    const a = keys[i];
    if (a.t > t) break;
    if (typeof a.facing === 'number') heading = (a.facing * Math.PI) / 180;
    const b = keys[i + 1];
    if (b && Math.hypot(b.x - a.x, b.y - a.y) > 0.05) heading = Math.atan2(b.x - a.x, b.y - a.y);
  }
  return heading;
}

function resolveLookAtPoint(plan: PrevisPlan, key: PrevisCameraKey, t: number): PrevisPoint3 {
  if (typeof key.lookAt === 'string') {
    const c = plan.characters.find((ch) => ch.id === key.lookAt);
    if (c) {
      const p = samplePrevisCharacter(c, t);
      return { x: p.x, y: p.y, h: key.lookAtH ?? PREVIS_DEFAULT_LOOK_AT_H };
    }
    const v = plan.vehicles?.find((x) => x.id === key.lookAt);
    if (v) {
      const p = samplePrevisVehicle(v, t);
      return { x: p.x, y: p.y, h: p.alt + (key.lookAtH ?? PREVIS_DEFAULT_LOOK_AT_H) };
    }
    return { x: 0, y: 0, h: PREVIS_DEFAULT_LOOK_AT_H };
  }
  return key.lookAt;
}

/** Aim of `key` seen from `pos`, turned by the key's `yawDeg`. */
function keyTarget(plan: PrevisPlan, key: PrevisCameraKey, t: number, pos: { x: number; y: number }): PrevisPoint3 {
  const p = resolveLookAtPoint(plan, key, t);
  if (!key.yawDeg) return p;
  const dx = p.x - pos.x;
  const dy = p.y - pos.y;
  const r = Math.hypot(dx, dy);
  const heading = Math.atan2(dx, dy) + (key.yawDeg * Math.PI) / 180;
  return { x: pos.x + Math.sin(heading) * r, y: pos.y + Math.cos(heading) * r, h: p.h };
}

function hermite(p0: number, p1: number, m0: number, m1: number, u: number): number {
  const u2 = u * u;
  const u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * p0 + (u3 - 2 * u2 + u) * m0 + (-2 * u3 + 3 * u2) * p1 + (u3 - u2) * m1;
}

function smoothstep(u: number): number {
  return u * u * (3 - 2 * u);
}

type Axis = 'x' | 'y' | 'h';

/** Catmull-Rom style tangent (per second) at key `i`; zero at the ends so the move eases in/out. */
/** A key's fixed aim point (no character id, no extra yaw), else null. */
function aimPointOf(k: PrevisCameraKey | undefined): PrevisPoint3 | null {
  if (!k || typeof k.lookAt === 'string' || k.yawDeg) return null;
  return k.lookAt;
}

function cameraTangent(keys: PrevisCameraKey[], i: number, axis: Axis): number {
  if (i <= 0 || i >= keys.length - 1) return 0;
  const dt = keys[i + 1].t - keys[i - 1].t;
  if (dt <= 0) return 0;
  return (keys[i + 1][axis] - keys[i - 1][axis]) / dt;
}

export interface PrevisCameraSample {
  position: PrevisPoint3;
  target: PrevisPoint3;
  fovDeg: number;
  /** Camera roll (Dutch angle), degrees. */
  rollDeg: number;
  move?: string;
}

/** Smooth camera position plus aim target at time `t`. */
export function samplePrevisCamera(plan: PrevisPlan, t: number): PrevisCameraSample {
  const keys = plan.camera.keys;
  const baseFov = plan.camera.fovDeg ?? DEFAULT_FOV;
  const fovOf = (k: PrevisCameraKey) => k.fovDeg ?? baseFov;
  const rollOf = (k: PrevisCameraKey) => k.rollDeg ?? 0;
  if (keys.length === 0) {
    return { position: { x: 0, y: -6, h: 1.6 }, target: { x: 0, y: 0, h: 1.2 }, fovDeg: baseFov, rollDeg: 0 };
  }
  if (t <= keys[0].t || keys.length === 1) {
    const k = keys[0];
    return { position: { x: k.x, y: k.y, h: k.h }, target: keyTarget(plan, k, t, k), fovDeg: fovOf(k), rollDeg: rollOf(k), move: k.move };
  }
  const lastKey = keys[keys.length - 1];
  if (t >= lastKey.t) {
    return {
      position: { x: lastKey.x, y: lastKey.y, h: lastKey.h },
      target: keyTarget(plan, lastKey, t, lastKey),
      fovDeg: fovOf(lastKey),
      rollDeg: rollOf(lastKey),
      move: lastKey.move,
    };
  }
  let i = 0;
  while (i < keys.length - 2 && t > keys[i + 1].t) i++;
  const a = keys[i];
  const b = keys[i + 1];
  const span = Math.max(1e-6, b.t - a.t);
  const u = Math.min(1, Math.max(0, (t - a.t) / span));
  const axis = (ax: Axis) =>
    hermite(a[ax], b[ax], cameraTangent(keys, i, ax) * span, cameraTangent(keys, i + 1, ax) * span, u);
  const position = { x: axis('x'), y: axis('y'), h: axis('h') };
  const w = smoothstep(u);
  const fixedA = aimPointOf(a);
  const fixedB = aimPointOf(b);
  let target: PrevisPoint3;
  if (fixedA && fixedB) {
    // Dense fixed aim points: one smooth curve through them (easing every key made the pan stutter 4×/s).
    const tan = (k: number, ax: 'x' | 'y' | 'h') => {
      const p0 = aimPointOf(keys[k - 1]);
      const p1 = aimPointOf(keys[k + 1]);
      if (!p0 || !p1) return 0;
      return (p1[ax] - p0[ax]) / Math.max(1e-6, keys[k + 1].t - keys[k - 1].t);
    };
    const aimAxis = (ax: 'x' | 'y' | 'h') => hermite(fixedA[ax], fixedB[ax], tan(i, ax) * span, tan(i + 1, ax) * span, u);
    target = { x: aimAxis('x'), y: aimAxis('y'), h: aimAxis('h') };
  } else {
    const ta = keyTarget(plan, a, t, position);
    const tb = keyTarget(plan, b, t, position);
    target = { x: ta.x + (tb.x - ta.x) * w, y: ta.y + (tb.y - ta.y) * w, h: ta.h + (tb.h - ta.h) * w };
  }
  return {
    position,
    target,
    fovDeg: fovOf(a) + (fovOf(b) - fovOf(a)) * w,
    rollDeg: rollOf(a) + (rollOf(b) - rollOf(a)) * w,
    move: a.move,
  };
}

function checkTimeline(label: string, times: number[], duration: number, issues: PrevisIssue[]): void {
  for (let i = 0; i < times.length; i++) {
    if (times[i] < 0 || times[i] > duration + 1e-6) {
      issues.push({ level: 'error', message: `${label}: key at ${times[i]}s is outside 0–${duration}s.` });
    }
    if (i > 0 && times[i] <= times[i - 1]) {
      issues.push({ level: 'error', message: `${label}: key times must increase (${times[i - 1]}s → ${times[i]}s).` });
    }
  }
}

/** Someone may wait just outside a door on the stage edge (hidden by the wall) before walking in. */
const DOOR_OUTSIDE_M = 1;

/** A door prop on the stage edge within 1.5 m of `p`. */
function edgeDoorNear(plan: PrevisPlan, p: { x: number; y: number }): PrevisProp | null {
  const hw = plan.stage.width / 2;
  const hd = plan.stage.depth / 2;
  return (
    plan.props.find((d) => {
      if ((d.kind ?? inferPrevisPropKind(d.label)) !== 'door') return false;
      const onEdge = hw - Math.abs(d.x) - d.w / 2 < 0.4 || hd - Math.abs(d.y) - d.d / 2 < 0.4;
      return onEdge && Math.hypot(p.x - d.x, p.y - d.y) < 1.5 + Math.max(d.w, d.d) / 2;
    }) ?? null
  );
}

function checkInStage(label: string, x: number, y: number, plan: PrevisPlan, issues: PrevisIssue[]): void {
  const hw = plan.stage.width / 2;
  const hd = plan.stage.depth / 2;
  const slack = edgeDoorNear(plan, { x, y }) ? DOOR_OUTSIDE_M + 0.1 : 0.5;
  if (Math.abs(x) > hw + slack || Math.abs(y) > hd + slack) {
    issues.push({ level: 'warn', message: `${label} at (${round1(x)}, ${round1(y)}) is outside the stage.` });
  }
}

/**
 * Feasibility check: can this blocking actually play out in `durationSec`?
 * Flags walking speeds a person cannot hit, camera moves that are too fast, and broken timelines.
 */
export function validatePrevisPlan(plan: PrevisPlan): PrevisIssue[] {
  const issues: PrevisIssue[] = [];
  const duration = plan.durationSec;
  if (!isFiniteNumber(duration) || duration <= 0) {
    issues.push({ level: 'error', message: 'durationSec must be a positive number.' });
    return issues;
  }
  if (!isFiniteNumber(plan.stage?.width) || !isFiniteNumber(plan.stage?.depth)) {
    issues.push({ level: 'error', message: 'stage.width and stage.depth are required.' });
    return issues;
  }

  const ids = new Set<string>();
  for (const c of plan.characters) {
    if (ids.has(c.id)) issues.push({ level: 'error', message: `Duplicate character id "${c.id}".` });
    ids.add(c.id);
    if (c.path.length === 0) {
      issues.push({ level: 'error', message: `${c.name}: path is empty.` });
      continue;
    }
    checkTimeline(c.name, c.path.map((k) => k.t), duration, issues);
    for (const k of c.path) checkInStage(c.name, k.x, k.y, plan, issues);
    for (let i = 0; i < c.path.length - 1; i++) {
      const a = c.path[i];
      const b = c.path[i + 1];
      const dt = b.t - a.t;
      // Inside a vehicle they move with it.
      if (dt <= 0 || isPrevisRiding(plan, c.id, (a.t + b.t) / 2)) continue;
      const dist = Math.hypot(b.x - a.x, b.y - a.y);
      const speed = dist / dt;
      if (speed > PREVIS_RUN_MPS) {
        issues.push({
          level: 'error',
          message: `${c.name} ${a.t}–${b.t}s covers ${round1(dist)} m at ${round1(speed)} m/s (running). Give this move more time or shorten the distance.`,
        });
      } else if (speed > PREVIS_WALK_COMFORT_MPS) {
        issues.push({
          level: 'warn',
          message: `${c.name} ${a.t}–${b.t}s walks at ${round1(speed)} m/s (rushed; natural walking is ~1.2–1.5 m/s).`,
        });
      }
    }
  }

  const names = new Set<string>();
  for (const c of plan.characters) {
    if (names.has(c.name)) {
      issues.push({ level: 'error', message: `Two figures are named "${c.name}"; one person must be exactly one figure.` });
    }
    names.add(c.name);
  }
  issues.push(...validatePrevisCameraShots(plan));
  issues.push(...validatePrevisContacts(plan));

  const keys = plan.camera.keys;
  if (keys.length < 2) {
    issues.push({ level: 'error', message: 'Camera needs at least 2 keys.' });
    return issues;
  }
  checkTimeline('Camera', keys.map((k) => k.t), duration, issues);
  if (keys[0].t > 0) issues.push({ level: 'warn', message: `Camera starts at ${keys[0].t}s; first key should be at 0s.` });
  const lastT = keys[keys.length - 1].t;
  if (lastT < duration - 0.25) {
    issues.push({ level: 'warn', message: `Camera ends at ${lastT}s but the shot is ${duration}s; it will hold still at the end.` });
  }
  for (const k of keys) {
    checkInStage(`Camera @${k.t}s`, k.x, k.y, plan, issues);
    if (k.h < 0.1 || k.h > 8) issues.push({ level: 'warn', message: `Camera height ${k.h} m at ${k.t}s is unusual.` });
    if (typeof k.lookAt === 'string' && !ids.has(k.lookAt) && !plan.vehicles?.some((v) => v.id === k.lookAt)) {
      issues.push({ level: 'error', message: `Camera @${k.t}s looks at unknown character "${k.lookAt}".` });
    }
  }

  if (!issues.some((i) => i.level === 'error')) {
    const step = 1 / 30;
    const windowSec = 0.5;
    let prev = samplePrevisCamera(plan, 0).position;
    const window: number[] = [];
    let worst = 0;
    let worstAt = 0;
    for (let t = step; t <= duration + 1e-6; t += step) {
      const p = samplePrevisCamera(plan, t).position;
      window.push(Math.hypot(p.x - prev.x, p.y - prev.y, p.h - prev.h));
      if (window.length > windowSec / step) window.shift();
      const speed = window.reduce((s, v) => s + v, 0) / (window.length * step);
      if (speed > worst) {
        worst = speed;
        worstAt = t;
      }
      prev = p;
    }
    if (worst > PREVIS_CAMERA_MAX_MPS) {
      issues.push({
        level: 'warn',
        message: `Camera moves ${round1(worst)} m/s around ${round1(worstAt)}s; video models tend to blur or cut on moves this fast.`,
      });
    }

    for (const k of keys) {
      if (typeof k.lookAt !== 'string') continue;
      const subject = plan.characters.find((c) => c.id === k.lookAt);
      if (!subject) continue;
      const p = samplePrevisCharacter(subject, k.t);
      const dist = Math.hypot(k.x - p.x, k.y - p.y);
      if (dist < PREVIS_CAMERA_MIN_SUBJECT_M) {
        issues.push({
          level: 'error',
          message: `Camera @${k.t}s is only ${round1(dist)} m from ${subject.name}; keep at least 1 m from the subject.`,
        });
      }
    }
    const hit = new Set<string>();
    for (let t = 0; t <= duration + 1e-6; t += 0.25) {
      const cam = samplePrevisCamera(plan, t).position;
      if (cam.h > PREVIS_CHARACTER_HEAD_H + 0.25) continue;
      for (const c of plan.characters) {
        if (hit.has(c.id)) continue;
        const p = samplePrevisCharacter(c, t);
        if (Math.hypot(cam.x - p.x, cam.y - p.y) < PREVIS_CAMERA_COLLISION_M) {
          hit.add(c.id);
          issues.push({ level: 'error', message: `Camera passes through ${c.name} around ${round1(t)}s; route it around them.` });
        }
      }
    }
  }

  return issues;
}

/** Shot list sanity (only when the plan uses camera shots). */
export function validatePrevisCameraShots(plan: PrevisPlan): PrevisIssue[] {
  const shots = plan.camera.shots;
  if (!shots || shots.length === 0) return [];
  const issues: PrevisIssue[] = [];
  const ids = new Set([...plan.characters.map((c) => c.id), ...(plan.vehicles ?? []).map((v) => v.id)]);
  checkTimeline('Camera shots', shots.map((s) => s.t), plan.durationSec, issues);
  for (const s of shots) {
    if (!PREVIS_CAMERA_RELATIONS.includes(s.relation)) {
      issues.push({
        level: 'error',
        message: `Camera shot @${s.t}s has unknown relation "${s.relation}"; use one of ${PREVIS_CAMERA_RELATIONS.join(', ')}.`,
      });
    }
    if (!ids.has(s.subject)) {
      issues.push({ level: 'error', message: `Camera shot @${s.t}s frames unknown character "${s.subject}".` });
    }
    if (s.relation === 'over_shoulder') {
      if (!s.toward || !ids.has(s.toward)) {
        issues.push({ level: 'error', message: `Over-the-shoulder shot @${s.t}s needs "toward": the character seen past ${s.subject}'s shoulder.` });
      } else if (s.toward === s.subject) {
        issues.push({ level: 'error', message: `Over-the-shoulder shot @${s.t}s cannot look at its own subject.` });
      }
    }
  }
  return issues;
}

/** Every contact must reference known characters standing within reach at that second. */
export function validatePrevisContacts(plan: PrevisPlan): PrevisIssue[] {
  const issues: PrevisIssue[] = [];
  for (const ct of plan.contacts ?? []) {
    const a = plan.characters.find((c) => c.id === ct.a);
    const b = plan.characters.find((c) => c.id === ct.b);
    if (!a || !b || a === b) {
      issues.push({ level: 'error', message: `Contact @${ct.t}s must name two different characters from the plan.` });
      continue;
    }
    const pa = samplePrevisCharacter(a, ct.t);
    const pb = samplePrevisCharacter(b, ct.t);
    const gap = Math.hypot(pa.x - pb.x, pa.y - pb.y);
    if (gap > previsContactReachM(ct) && !contactAcrossFurniture(plan, pa, pb)) {
      issues.push({
        level: 'error',
        message: `At ${ct.t}s ${a.name} and ${b.name} must meet${ct.what ? ` (${ct.what})` : ''} but are ${round1(gap)} m apart; bring them within ${isPrevisTalkContact(ct) ? PREVIS_TALK_GAP_M : 0.6} m.`,
      });
    }
  }
  return issues;
}

function pathLength(c: PrevisCharacter): number {
  let len = 0;
  for (let i = 1; i < c.path.length; i++) len += Math.hypot(c.path[i].x - c.path[i - 1].x, c.path[i].y - c.path[i - 1].y);
  return len;
}

const CONTACT_GAP_M = 0.6;

/**
 * Make contacts physically happen: the character who moves less is shifted (whole path, so speeds are
 * unchanged) to stand 0.6 m beside the other at the contact second. A character already placed by an
 * earlier contact is not moved again. Mutates `plan`; returns the number of fixes.
 */
/** "把文件拍在桌上" / "puts the file on the desk": an object onto furniture, not two people touching. */
const CONTACT_ONTO_FURNITURE_RE =
  /(?:放|拍|摆|搁|扔|摔|丢).{0,6}(?:桌|台|柜)|(?:on|onto) the (?:table|desk|counter)|对面|坐下|坐到|坐在|\bsits?\b|opposite/i;

/** Drop contacts that only put something onto a table or desk (each person stays on their side of it). */
export function dropPrevisFurnitureContacts(plan: PrevisPlan): number {
  const before = plan.contacts?.length ?? 0;
  if (!before) return 0;
  plan.contacts = plan.contacts!.filter((ct) => !CONTACT_ONTO_FURNITURE_RE.test(ct.what ?? ''));
  if (plan.contacts.length === 0) delete plan.contacts;
  return before - (plan.contacts?.length ?? 0);
}

/**
 * One person talking with several others at once ("跟三个人一起聊天"): walk them to the group (beside its centre) in
 * one move, instead of pair by pair, where the first pair would pin them before they reach the rest.
 */
function nudgePrevisGroupTalks(plan: PrevisPlan, anchored: Set<string>, pinned: ReadonlySet<string>): number {
  let fixes = 0;
  const talks = (plan.contacts ?? []).filter((ct) => isPrevisTalkContact(ct));
  const done = new Set<string>();
  for (const ct of talks) {
    for (const hubId of [ct.a, ct.b]) {
      const key = `${hubId}@${ct.t}`;
      if (done.has(key)) continue;
      done.add(key);
      const partnerIds = [
        ...new Set(
          talks.filter((o) => Math.abs(o.t - ct.t) <= 0.5 && (o.a === hubId || o.b === hubId)).map((o) => (o.a === hubId ? o.b : o.a)),
        ),
      ];
      const hub = plan.characters.find((c) => c.id === hubId);
      const partners = partnerIds.map((id) => plan.characters.find((c) => c.id === id)).filter((c): c is PrevisCharacter => !!c && c !== hub);
      if (!hub || partners.length < 2 || hub.path.length === 0 || anchored.has(hub.id) || pinned.has(hub.id)) continue;
      const pts = partners.map((c) => samplePrevisCharacter(c, ct.t));
      const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
      const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
      const ph = samplePrevisCharacter(hub, ct.t);
      if (pts.every((p) => Math.hypot(p.x - ph.x, p.y - ph.y) <= PREVIS_TALK_MAX_M)) {
        anchored.add(hub.id);
        partners.forEach((c) => anchored.add(c.id));
        continue;
      }
      // Stand on the hub's own side of the group, a conversation step from its centre.
      let ux = ph.x - cx;
      let uy = ph.y - cy;
      const len = Math.hypot(ux, uy) || 1;
      ux /= len;
      uy /= len;
      const dx = cx + ux * PREVIS_TALK_GAP_M - ph.x;
      const dy = cy + uy * PREVIS_TALK_GAP_M - ph.y;
      const wait = previsWaitingKeyCount(plan, hub);
      hub.path.forEach((k, i) => {
        if (i < wait) return;
        k.x += dx;
        k.y += dy;
      });
      anchored.add(hub.id);
      partners.forEach((c) => anchored.add(c.id));
      fixes++;
    }
  }
  return fixes;
}

export function nudgePrevisContacts(plan: PrevisPlan, opts: { pinned?: ReadonlySet<string> } = {}): number {
  let fixes = 0;
  const anchored = new Set<string>();
  const pinned = opts.pinned ?? new Set<string>();
  fixes += nudgePrevisGroupTalks(plan, anchored, pinned);
  for (const ct of [...(plan.contacts ?? [])].sort((x, y) => x.t - y.t)) {
    const a = plan.characters.find((c) => c.id === ct.a);
    const b = plan.characters.find((c) => c.id === ct.b);
    if (!a || !b || a === b || a.path.length === 0 || b.path.length === 0) continue;
    const pa = samplePrevisCharacter(a, ct.t);
    const pb = samplePrevisCharacter(b, ct.t);
    if (Math.hypot(pa.x - pb.x, pa.y - pb.y) <= previsContactReachM(ct) || contactAcrossFurniture(plan, pa, pb)) {
      anchored.add(a.id);
      anchored.add(b.id);
      continue;
    }
    // People the text pins to a set piece stay; their partner walks to them.
    const mover = [a, b]
      .filter((c) => !anchored.has(c.id))
      .sort((x, y) => Number(pinned.has(x.id)) - Number(pinned.has(y.id)) || pathLength(x) - pathLength(y))[0];
    if (!mover) continue;
    const other = mover === a ? b : a;
    const po = samplePrevisCharacter(other, ct.t);
    const pm = samplePrevisCharacter(mover, ct.t);
    const heading = samplePrevisCharacterHeading(other, ct.t);
    const rx = Math.cos(heading);
    const ry = -Math.sin(heading);
    const side = (pm.x - po.x) * rx + (pm.y - po.y) * ry >= 0 ? 1 : -1;
    const gapM = isPrevisTalkContact(ct) ? PREVIS_TALK_GAP_M : CONTACT_GAP_M;
    const dx = po.x + side * gapM * rx - pm.x;
    const dy = po.y + side * gapM * ry - pm.y;
    // Keys where they still wait inside a doorway stay there (only the walk out of it changes).
    const wait = previsWaitingKeyCount(plan, mover);
    mover.path.forEach((k, i) => {
      if (i < wait) return;
      k.x += dx;
      k.y += dy;
    });
    anchored.add(a.id);
    anchored.add(b.id);
    fixes++;
  }
  return fixes;
}

/** Heading averaged over ±0.6 s so the camera does not snap when a path turns (the reference for shot angles). */
export function samplePrevisCharacterFacing(c: PrevisCharacter, t: number): number {
  return smoothedHeading(c, t);
}

function smoothedHeading(c: PrevisCharacter, t: number): number {
  let sx = 0;
  let sy = 0;
  for (let dt = -0.6; dt <= 0.6 + 1e-6; dt += 0.2) {
    const h = samplePrevisCharacterHeading(c, t + dt);
    sx += Math.sin(h);
    sy += Math.cos(h);
  }
  return Math.hypot(sx, sy) < 1e-6 ? samplePrevisCharacterHeading(c, t) : Math.atan2(sx, sy);
}

interface SolvedShot {
  shot: PrevisCameraShot;
  subject: PrevisCharacter;
  toward?: PrevisCharacter;
  sign: number;
  /** Fixed camera position for `hold`. */
  fixed?: PrevisPoint3;
  /** `hold` with `drift`: the camera keeps this framing's path (no stop) while it pans to the subject. */
  driftFrom?: SolvedShot;
  /** `angleOffsetDeg`: the angle round the subject, from the previous shot's angle plus the offset. */
  alphaFrom?: number;
  /** `over_shoulder`: unit direction subject → view, frozen at the shot second so passers-by do not spin the camera. */
  view?: { x: number; y: number };
}

/** Direction from `subject` toward `toward` at `t`; within 2 m the subject's facing dominates. */
function overShoulderView(subject: PrevisCharacter, toward: PrevisCharacter, t: number): { x: number; y: number } {
  const a = samplePrevisCharacter(subject, t);
  const b = samplePrevisCharacter(toward, t);
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const w = Math.min(1, len / 2);
  const h = smoothedHeading(subject, t);
  const ux = (len > 1e-6 ? ((b.x - a.x) / len) * w : 0) + Math.sin(h) * (1 - w);
  const uy = (len > 1e-6 ? ((b.y - a.y) / len) * w : 0) + Math.cos(h) * (1 - w);
  const ulen = Math.hypot(ux, uy);
  return ulen < 1e-6 ? { x: Math.sin(h), y: Math.cos(h) } : { x: ux / ulen, y: uy / ulen };
}

const OVER_SHOULDER_MIN_VIEW_M = 2;

/**
 * Looking over someone's shoulder at the person right beside them (e.g. the one handing them a letter) has
 * no stable framing. Retarget such shots to the person farther away in the shoulder owner's view.
 * Mutates `plan.camera.shots`; returns notes.
 */
export function retargetPrevisOverShoulderShots(plan: PrevisPlan): string[] {
  const notes: string[] = [];
  for (const s of plan.camera.shots ?? []) {
    if (s.relation !== 'over_shoulder' || !s.toward) continue;
    const subject = plan.characters.find((c) => c.id === s.subject);
    const toward = plan.characters.find((c) => c.id === s.toward);
    if (!subject || !toward) continue;
    const a = samplePrevisCharacter(subject, s.t);
    const b = samplePrevisCharacter(toward, s.t);
    if (Math.hypot(b.x - a.x, b.y - a.y) >= OVER_SHOULDER_MIN_VIEW_M) continue;
    // The beat at this second says who the shot is about: a third person named there is the real target;
    // when it only names these two, the text wants both in frame (a two-shot from behind the shoulder).
    const beat = [...(plan.beats ?? [])].reverse().find((bt) => bt.t <= s.t + 0.01);
    const named = beat
      ? plan.characters.filter((c) => c !== subject && c !== toward && beat.text.includes(c.name))
      : null;
    const h = smoothedHeading(subject, s.t);
    let best: { c: PrevisCharacter; score: number } | null = null;
    for (const c of named ?? plan.characters) {
      if (c === subject || c === toward) continue;
      const p = samplePrevisCharacter(c, s.t);
      const d = Math.hypot(p.x - a.x, p.y - a.y);
      if (d < OVER_SHOULDER_MIN_VIEW_M) continue;
      const score = ((p.x - a.x) * Math.sin(h) + (p.y - a.y) * Math.cos(h)) / d;
      if (!named && score <= 0) continue;
      if (!best || score > best.score) best = { c, score };
    }
    if (best) {
      notes.push(`Over-the-shoulder shot @${s.t}s now looks at ${best.c.name}; ${toward.name} is right beside ${subject.name}.`);
      s.toward = best.c.id;
      continue;
    }
    notes.push(`Shot @${s.t}s frames ${subject.name} and ${toward.name} together from behind ${subject.name}'s shoulder.`);
    s.relation = 'back_side';
    if (!s.distance || s.distance === 'close') s.distance = 'far';
    delete s.toward;
  }
  return notes;
}

const INTENT_KEEP_WALKING = /不停步|脚步(?:都|也)?(?:没|没有|不)停|没有?停下|未停|不停|没停|擦肩|walks? (?:right )?past|without stopping|keeps? walking/i;
const INTENT_LEAVE = /离开|走远|远离|走出|leaves?\b|walks? away|exits?\b/i;
const INTENT_CRANE_UP = /升起|升高|拉升|crane[s]? up|rises?\b/i;
const INTENT_CRANE_DOWN = /降下|降低|crane[s]? down|lowers?\b/i;
const INTENT_LEAVE_MIN_M = 3;
const INTENT_STOP_RE =
  /停下|停住|停在|站住|站定|坐下|坐在|坐到|坐着|站着|等着|走到|来到|说话|聊|交谈|对话|争吵|吵架|面对面|抱在一起|拥抱|stops?\b|halts?\b|sits? down|waits?\b|stands? still|walks? (?:up )?to\b|talks?\b|argues?\b|hugs?\b|embraces?\b|face each other/i;
/** Clauses about everyone present ("两个人面对面说话") apply to each of them. */
const INTENT_GROUP_RE = /两个人|两人|他们|她们|大家|\bboth\b|\bthey\b|\beveryone\b/i;
/** A walker who barely moves for this long, with no stop in the text, looks like a pause. */
const INTENT_EARLY_STOP_SEC = 4;
const INTENT_SLOW_MPS = 0.3;
const INTENT_KEEP_WALKING_MIN_M = 1.5;
const INTENT_CRANE_MIN_M = 0.5;

/** Time-ranged lines of a staging text ("0-3秒：…" / "0–3s: …"); the whole text as one segment otherwise. */
function storySegments(story: string, duration: number): Array<{ from: number; to: number; text: string }> {
  const out: Array<{ from: number; to: number; text: string }> = [];
  const re = /(\d+(?:\.\d+)?)\s*[-–~至到]\s*(\d+(?:\.\d+)?)\s*(?:秒|s)\s*[:：]?/gi;
  const marks = [...story.matchAll(re)];
  marks.forEach((m, i) => {
    const start = (m.index ?? 0) + m[0].length;
    const end = i + 1 < marks.length ? marks[i + 1].index ?? story.length : story.length;
    out.push({ from: Number(m[1]), to: Math.min(duration, Number(m[2])), text: story.slice(start, end) });
  });
  return out.length > 0 ? out : [{ from: 0, to: duration, text: story }];
}

/** Who the verb at `index` belongs to: the first person named in its clause, else the nearest one before it. */
function personBefore(plan: PrevisPlan, text: string, index: number): PrevisCharacter | null {
  const clauseStart = Math.max(...['。', '；', ';', '！', '？', '!', '?', '\n', '，', ','].map((d) => text.lastIndexOf(d, index - 1))) + 1;
  const clause = text.slice(clauseStart, index);
  let first: { c: PrevisCharacter; at: number } | null = null;
  let nearest: { c: PrevisCharacter; at: number } | null = null;
  for (const c of plan.characters) {
    const inClause = clause.indexOf(c.name);
    if (inClause >= 0 && (!first || inClause < first.at)) first = { c, at: inClause };
    const at = text.lastIndexOf(c.name, index);
    if (at >= 0 && (!nearest || at > nearest.at)) nearest = { c, at };
  }
  // "经过公爵身旁时她不停步": a pronoun between the last name and the verb means we cannot tell who it is.
  if (!first && nearest && /[她他]|\b(?:she|he)\b/i.test(text.slice(nearest.at + nearest.c.name.length, index))) return null;
  const lastInClause = nearest && nearest.at >= clauseStart ? nearest.at + nearest.c.name.length : clauseStart;
  if (/[她他]|\b(?:she|he)\b/i.test(text.slice(lastInClause, index))) return null;
  return first?.c ?? nearest?.c ?? null;
}

/**
 * Checks the solved plan against verbs in the user's text that the planner often skips: passing without
 * stopping, leaving, craning up/down. Returns repair instructions (empty when the plan already does them).
 */
export function checkPrevisStoryIntent(plan: PrevisPlan, story: string): string[] {
  const out: string[] = [];
  const end = plan.durationSec;
  const moved = (c: PrevisCharacter, from: number, to: number) => {
    const a = samplePrevisCharacter(c, from);
    const b = samplePrevisCharacter(c, Math.max(from, to));
    return Math.hypot(b.x - a.x, b.y - a.y);
  };
  // Walkers the text never stops keep moving: standing (or creeping) for seconds mid-take reads as a pause.
  const clauses = story.split(/[。；;！？!?\n，,]/);
  for (const c of plan.characters) {
    const walks = c.path.some((k, i) => i > 0 && Math.hypot(k.x - c.path[i - 1].x, k.y - c.path[i - 1].y) > 0.3);
    if (!walks || clauses.some((cl) => (cl.includes(c.name) || INTENT_GROUP_RE.test(cl)) && INTENT_STOP_RE.test(cl))) continue;
    const firstMove = c.path.find((k, i) => i > 0 && Math.hypot(k.x - c.path[i - 1].x, k.y - c.path[i - 1].y) > 0.3)!;
    let runStart: number | null = null;
    for (let t = Math.max(0, firstMove.t - 1); t <= end + 1e-6; t += 0.5) {
      const slow = t + 0.5 <= end ? moved(c, t, t + 0.5) < INTENT_SLOW_MPS * 0.5 : runStart !== null;
      if (slow && runStart === null) runStart = t;
      if ((!slow || t + 0.5 > end) && runStart !== null) {
        const runEnd = slow ? end : t;
        if (runEnd - runStart >= INTENT_EARLY_STOP_SEC) {
          out.push(`${c.name} barely moves from ${runStart}s to ${runEnd}s, but the text never stops them: keep them walking at an even pace (about 1 m/s) through that time.`);
          break;
        }
        runStart = null;
      }
    }
  }
  for (const seg of storySegments(story, end)) {
    const keep = seg.text.match(INTENT_KEEP_WALKING);
    let walker = keep ? personBefore(plan, seg.text, keep.index ?? 0) : null;
    if (keep) {
      // "Passing without stopping" belongs to whoever walks up to the contact; when the named person stands
      // still (or the clause only says 她 / 他), use the contact participant who is walking.
      const inSeg = (plan.contacts ?? []).filter((ct) => ct.t >= seg.from - 0.5 && ct.t <= seg.to + 0.5);
      const mover = (c: PrevisCharacter | undefined, t: number) => (c ? moved(c, Math.max(0, t - 2), t) : 0);
      for (const ct of walker ? [] : inSeg) {
        const a = plan.characters.find((c) => c.id === ct.a);
        const b = plan.characters.find((c) => c.id === ct.b);
        walker = (mover(a, ct.t) >= mover(b, ct.t) ? a : b) ?? null;
        break;
      }
      if (walker) {
        const ct = inSeg.find((c) => c.a === walker!.id || c.b === walker!.id);
        if (ct && mover(walker, ct.t) < 0.5) {
          const otherId = ct.a === walker.id ? ct.b : ct.a;
          const other = plan.characters.find((c) => c.id === otherId);
          if (other && mover(other, ct.t) > mover(walker, ct.t)) walker = other;
        }
      }
    }
    if (walker) {
      const contact = (plan.contacts ?? []).find((ct) => (ct.a === walker!.id || ct.b === walker!.id) && ct.t >= seg.from - 0.5 && ct.t <= seg.to + 0.5);
      const from = contact?.t ?? seg.from;
      if (moved(walker, from, Math.min(end, from + 2.5)) < INTENT_KEEP_WALKING_MIN_M) {
        out.push(`${walker.name} passes without stopping (text ${seg.from}–${seg.to}s): after ${from}s keep walking in the same direction for at least ${INTENT_KEEP_WALKING_MIN_M + 0.5} m (add path keys after the contact).`);
      }
    }
    const leave = seg.text.match(INTENT_LEAVE);
    const leaver = leave ? personBefore(plan, seg.text, leave.index ?? 0) : null;
    const atEdge = (c: PrevisCharacter) => {
      const p = samplePrevisCharacter(c, end);
      return plan.stage.width / 2 - Math.abs(p.x) < 0.6 || plan.stage.depth / 2 - Math.abs(p.y) < 0.6;
    };
    // Walking out through the nearest edge (e.g. leaving by the entrance) also counts as leaving.
    if (leaver && moved(leaver, seg.from, end) < INTENT_LEAVE_MIN_M && !(atEdge(leaver) && moved(leaver, seg.from, end) >= 1)) {
      out.push(`${leaver.name} leaves (text ${seg.from}–${seg.to}s): from ${seg.from}s walk at least ${INTENT_LEAVE_MIN_M} m away before ${end}s.`);
    }
    const up = INTENT_CRANE_UP.test(seg.text);
    const down = INTENT_CRANE_DOWN.test(seg.text);
    if ((up || down) && plan.camera.keys.length > 0) {
      const h0 = samplePrevisCamera(plan, seg.from).position.h;
      const h1 = samplePrevisCamera(plan, Math.min(end, seg.to)).position.h;
      if (up && h1 - h0 < INTENT_CRANE_MIN_M) {
        out.push(`The camera cranes up during ${seg.from}–${seg.to}s: give the shot at the end of that range a higher "height" than the one at its start (e.g. eye → high).`);
      } else if (down && !up && h0 - h1 < INTENT_CRANE_MIN_M) {
        out.push(`The camera cranes down during ${seg.from}–${seg.to}s: give the shot at the end of that range a lower "height" than the one at its start.`);
      }
    }
  }
  return [...out, ...checkPrevisLayoutIntent(plan, story)];
}

const LAYOUT_NEAR_RE =
  /靠在|靠着|倚着|倚在|站在|坐在|躺在|等在|守在|旁边|身边|边上|走到|来到|后面|前面|behind the|in front of the|leans?\b|leaning|beside|next to|\bby the\b|\bat the\b|sits? (?:on|at)\b|stands? (?:at|by|next)\b/i;
const LAYOUT_FROM_RE =
  /从.{0,10}?(?:上来|进来|出来|走出|跑出|下来|出现)|推门进来|推门而入|走进来|跑进来|进门|comes? (?:out of|up from|in from|from|in)\b|enters?\b|emerges? from\b/i;
const LAYOUT_INTO_RE =
  /走回|回到|走进|进入|钻进|下楼|消失在|走出门|出门|走出去|goes? (?:back )?(?:into|down|out)\b|walks? (?:back )?(?:into|out)\b|exits?\b|leaves? (?:through|the room)\b|disappears? into\b/i;
/** Kinds whose mention in the text must exist as a prop (chairs, walls and plain blocks are often implied). */
const LAYOUT_REQUIRED_KINDS: ReadonlySet<PrevisPropKind> = new Set([
  'door',
  'stairwell',
  'stairs',
  'railing',
  'table',
  'desk',
  'sofa',
  'bed',
  'counter',
  'shelf',
  'car',
  'tree',
]);
/** Kinds the text may use for the same piece ("桌子" for the desk, "门" for the stairwell door). */
const LAYOUT_SAME_FAMILY: Partial<Record<PrevisPropKind, PrevisPropKind[]>> = {
  table: ['desk'],
  desk: ['table'],
  door: ['stairwell'],
  stairs: ['stairwell'],
  stairwell: ['door'],
  sofa: ['chair', 'bed'],
};
const LAYOUT_NEAR_M = 1.5;
const LAYOUT_ENDPOINT_M = 2;

/**
 * True when the text names this prop: its label, the label's last two CJK characters (the noun: 办公桌 →
 * 公桌, 栏杆), a latin word of 4+ letters from the label, or a word of its kind (楼梯口 for a stairwell).
 */
function propInText(prop: PrevisProp, text: string): boolean {
  if (text.includes(prop.label)) return true;
  const cjk = prop.label.replace(/[^\u3400-\u9fff]/g, '');
  if (cjk.length >= 2 && text.includes(cjk.slice(-2))) return true;
  if ((prop.label.toLowerCase().match(/[a-z]{4,}/g) ?? []).some((w) => text.toLowerCase().includes(w))) return true;
  const kind = prop.kind ?? inferPrevisPropKind(prop.label);
  if (kind === 'box' || kind === 'low_wall') return false;
  // "桌子" also names the desk (same family of pieces).
  return [kind, ...(LAYOUT_SAME_FAMILY[kind] ?? [])].some((k) => PROP_KIND_WORDS.find(([w]) => w === k)?.[1].test(text) ?? false);
}

const LAYOUT_BEHIND_RE = /后面|背后|后方|behind/i;
const LAYOUT_FRONT_RE = /前面|前方|跟前|in front of/i;

/**
 * Clauses with the people they are about: the people named in the clause, else the last person named
 * earlier in the same sentence ("小雨推门进来，走到桌子前面" → 小雨 walks to the desk).
 */
function layoutClauses(
  plan: PrevisPlan,
  story: string,
): Array<{ clause: string; people: PrevisCharacter[]; recent: PrevisCharacter[] }> {
  const out: Array<{ clause: string; people: PrevisCharacter[]; recent: PrevisCharacter[] }> = [];
  for (const sentence of story.split(/[。！？!?\n]/)) {
    let last: PrevisCharacter[] = [];
    // Distinct people in the order they were last named in this sentence so far.
    const recent: PrevisCharacter[] = [];
    for (const clause of sentence.split(/[，,；;]/).map((x) => x.trim()).filter(Boolean)) {
      const named = plan.characters
        .filter((c) => c.path.length > 0 && clause.includes(c.name))
        .sort((a, b) => clause.indexOf(a.name) - clause.indexOf(b.name));
      if (named.length > 0) last = named;
      for (const c of named) {
        const i = recent.indexOf(c);
        if (i >= 0) recent.splice(i, 1);
        recent.push(c);
      }
      out.push({ clause, people: named.length > 0 ? named : last, recent: [...recent] });
    }
  }
  return out;
}

/** Characters the text places next to a prop ("靠在栏杆边" / "at the desk"), excluding entering / leaving clauses. */
function layoutNearPairs(plan: PrevisPlan, story: string): Array<{ c: PrevisCharacter; prop: PrevisProp; clause: string }> {
  const out: Array<{ c: PrevisCharacter; prop: PrevisProp; clause: string }> = [];
  for (const { clause, people } of layoutClauses(plan, story)) {
    if (!LAYOUT_NEAR_RE.test(clause) || LAYOUT_FROM_RE.test(clause) || LAYOUT_INTO_RE.test(clause)) continue;
    for (const c of people) {
      for (const prop of plan.props) if (propInText(prop, clause)) out.push({ c, prop, clause });
    }
  }
  return out;
}

/**
 * Floor point beside a prop (0.5 m off its edge): closest to `p`, or behind / in front of it when the text
 * says so (front = the side its `facing` points to, else the entrance side).
 */
function besideProp(prop: PrevisProp, p: { x: number; y: number }, where?: 'behind' | 'front'): { x: number; y: number } {
  const hx = prop.w / 2 + 0.5;
  const hy = prop.d / 2 + 0.5;
  if (where) {
    const f = typeof prop.facing === 'number' ? (prop.facing * Math.PI) / 180 : Math.PI;
    const sign = where === 'front' ? 1 : -1;
    const fx = Math.round(Math.sin(f)) * sign;
    const fy = Math.round(Math.cos(f)) * sign;
    return fx !== 0
      ? { x: prop.x + fx * hx, y: prop.y + Math.max(-prop.d / 2, Math.min(prop.d / 2, p.y - prop.y)) }
      : { x: prop.x + Math.max(-prop.w / 2, Math.min(prop.w / 2, p.x - prop.x)), y: prop.y + (fy || -sign) * hy };
  }
  const dx = p.x - prop.x;
  const dy = p.y - prop.y;
  if (Math.abs(dx) / hx > Math.abs(dy) / hy) {
    return { x: prop.x + Math.sign(dx || 1) * hx, y: prop.y + Math.max(-prop.d / 2, Math.min(prop.d / 2, dy)) };
  }
  return { x: prop.x + Math.max(-prop.w / 2, Math.min(prop.w / 2, dx)), y: prop.y + Math.sign(dy || 1) * hy };
}

/**
 * Doors and stairwells without a facing open toward where people walk out (or come from when they go
 * back in); otherwise toward the stage centre. Snapped to 90°. Returns how many were oriented.
 */
export function orientPrevisDoorways(plan: PrevisPlan): number {
  let fixes = 0;
  for (const prop of plan.props) {
    const kind = prop.kind ?? inferPrevisPropKind(prop.label);
    if ((kind !== 'door' && kind !== 'stairwell') || typeof prop.facing === 'number' || prop.fixed) continue;
    let vx = 0;
    let vy = 0;
    for (const c of plan.characters) {
      const ends: Array<[PrevisCharacterKey, PrevisCharacterKey[]]> = [
        [c.path[0], c.path.slice(1)],
        [c.path[c.path.length - 1], [...c.path].reverse().slice(1)],
      ];
      for (const [at, rest] of ends) {
        if (!at || distanceToProp(at, prop) > 0.8) continue;
        const next = rest.find((k) => Math.hypot(k.x - at.x, k.y - at.y) > 0.5);
        if (next) {
          vx += next.x - at.x;
          vy += next.y - at.y;
        }
      }
    }
    if (Math.hypot(vx, vy) < 1e-6) {
      vx = -prop.x;
      vy = -prop.y;
    }
    if (Math.hypot(vx, vy) < 1e-6) continue;
    const deg = (Math.atan2(vx, vy) * 180) / Math.PI;
    prop.facing = (((Math.round(deg / 90) * 90) % 360) + 360) % 360;
    fixes++;
  }
  return fixes;
}

const LAYOUT_RUN_RE = /跑|奔|冲|\bruns?\b|running|\brush(?:es)?\b|\bdash(?:es)?\b|sprint/i;
const DOORWAY_KINDS: ReadonlySet<PrevisPropKind> = new Set(['door', 'stairwell']);
const ENTRY_WALK_MPS = 1.4;
/** A door this close to the stage edge is a door in that wall. */
const EDGE_DOOR_M = 1.5;

/** Doors near a stage edge sit in that wall (so people can wait outside them, out of view). */
function snapEdgeDoors(plan: PrevisPlan): void {
  for (const p of plan.props) {
    if (p.fixed || (p.kind ?? inferPrevisPropKind(p.label)) !== 'door') continue;
    const out = edgeOutward(plan, p);
    if (!out) continue;
    if (out.x !== 0) p.x = out.x * (plan.stage.width / 2 - p.w / 2);
    else p.y = out.y * (plan.stage.depth / 2 - p.d / 2);
  }
}
const ENTRY_STEP_SEC = 0.4;

/** Ids of people the text has run ("小雨从楼梯口跑上来"). */
export function previsRunners(plan: PrevisPlan, story: string): Set<string> {
  const out = new Set<string>();
  for (const { clause, people } of layoutClauses(plan, story)) {
    if (LAYOUT_RUN_RE.test(clause)) for (const c of people) out.add(c.id);
  }
  return out;
}

function isDoorway(prop: PrevisProp): boolean {
  return DOORWAY_KINDS.has(prop.kind ?? inferPrevisPropKind(prop.label));
}

/** Unit floor vector from the stage centre to an edge door (its outside); null for doors not on an edge. */
function edgeOutward(plan: PrevisPlan, prop: PrevisProp): { x: number; y: number } | null {
  const gx = plan.stage.width / 2 - Math.abs(prop.x) - prop.w / 2;
  const gy = plan.stage.depth / 2 - Math.abs(prop.y) - prop.d / 2;
  if (Math.min(gx, gy) >= EDGE_DOOR_M) return null;
  return gx < gy ? { x: Math.sign(prop.x) || 1, y: 0 } : { x: 0, y: Math.sign(prop.y) || 1 };
}

/** Where someone waits out of view: inside a stairwell, or just outside a door on the stage edge. */
function doorwayInside(plan: PrevisPlan, prop: PrevisProp): { x: number; y: number } {
  const out = edgeOutward(plan, prop);
  if ((prop.kind ?? inferPrevisPropKind(prop.label)) === 'door' && out) return { x: prop.x + out.x * 0.8, y: prop.y + out.y * 0.8 };
  return { x: prop.x, y: prop.y };
}

/** The step just outside a doorway, on the side facing `toward`. */
function doorwayFront(plan: PrevisPlan, prop: PrevisProp, toward: { x: number; y: number }): { x: number; y: number } {
  const out = edgeOutward(plan, prop);
  if ((prop.kind ?? inferPrevisPropKind(prop.label)) === 'door' && out) return { x: prop.x - out.x * 0.7, y: prop.y - out.y * 0.7 };
  const vx = toward.x - prop.x;
  const vy = toward.y - prop.y;
  const len = Math.hypot(vx, vy) || 1;
  const reach = Math.abs(vx) / len > Math.abs(vy) / len ? prop.w / 2 : prop.d / 2;
  return { x: prop.x + (vx / len) * (reach + 0.6), y: prop.y + (vy / len) * (reach + 0.6) };
}

/** Leading keys at which this character waits out of view in a doorway (0 when they start in view). */
export function previsWaitingKeyCount(plan: PrevisPlan, c: PrevisCharacter): number {
  const first = c.path[0];
  if (!first || !plan.props.some((p) => isDoorway(p) && hiddenAt(plan, first, p))) return 0;
  let n = 1;
  while (n < c.path.length && Math.hypot(c.path[n].x - first.x, c.path[n].y - first.y) < 0.05) n++;
  return n;
}

/**
 * People who come out of a door / stairwell ("从楼梯口跑上来") wait inside it out of view and step out in time
 * to reach their next spot (at walking pace, running when the text says so). When even running cannot make
 * it, the doorway moves closer (set pieces are freer than the story's timing). People who go back in
 * ("走回楼梯间") end inside it. Returns how many paths changed.
 */
export function nudgePrevisEntrances(plan: PrevisPlan, story: string): number {
  // Walking in from the street: the doorway leads into the stage itself (the interior is on stage), so people do
  // not appear from it or disappear into it.
  if (isWalkInStage(plan)) return 0;
  let fixes = 0;
  snapEdgeDoors(plan);
  const runners = previsRunners(plan, story);
  const done = new Set<string>();
  for (const { clause, people } of layoutClauses(plan, story)) {
    const from = LAYOUT_FROM_RE.test(clause);
    const into = LAYOUT_INTO_RE.test(clause);
    if (!from && !into) continue;
    // "推门进来 / 转身下楼": no doorway named, but a set with a single doorway can only mean that one.
    const named = plan.props.filter((p) => isDoorway(p) && propInText(p, clause));
    const all = plan.props.filter(isDoorway);
    const doorways = named.length > 0 ? named : all.length === 1 ? all : [];
    for (const c of people) {
      for (const prop of doorways) {
        const key = `${from ? 'from' : 'into'}:${c.id}:${prop.id}`;
        if (done.has(key) || c.path.length === 0) continue;
        done.add(key);
        // Already at the doorway and walking from the first second: they are coming in right now.
        const enteringNow = distanceToProp(c.path[0], prop) <= LAYOUT_ENDPOINT_M && c.path[0].t <= 0.01 && firstMoveSec(c) <= 1;
        if (from && !hiddenAt(plan, c.path[0], prop) && !enteringNow) {
          const v = runners.has(c.id) ? NUDGE_RUN_MPS : ENTRY_WALK_MPS;
          // Their first destination: where the first walk ends (or the first key when they start walking at once).
          const ti = c.path.length > 1 && c.path[0].t <= 0.01 ? 1 : 0;
          const target = c.path[ti];
          let front = doorwayFront(plan, prop, target);
          let dist = Math.hypot(target.x - front.x, target.y - front.y);
          const reach = v * Math.max(0, target.t - 1.5);
          // A door on the stage edge is part of the wall and stays; stairwells and inner doors can move.
          const wallDoor = (prop.kind ?? inferPrevisPropKind(prop.label)) === 'door' && !!edgeOutward(plan, prop);
          if (dist > reach && reach > 0.5 && !wallDoor && !prop.fixed) {
            // Move the doorway toward the destination until the walk out fits.
            const ux = (prop.x - target.x) / (Math.hypot(prop.x - target.x, prop.y - target.y) || 1);
            const uy = (prop.y - target.y) / (Math.hypot(prop.x - target.x, prop.y - target.y) || 1);
            const keep = reach * 0.9 + 0.6 + Math.max(prop.w, prop.d) / 2;
            prop.x = Math.round((target.x + ux * keep) * 100) / 100;
            prop.y = Math.round((target.y + uy * keep) * 100) / 100;
            delete prop.facing;
            front = doorwayFront(plan, prop, target);
            dist = Math.hypot(target.x - front.x, target.y - front.y);
          }
          const inside = doorwayInside(plan, prop);
          const step = Math.max(ENTRY_STEP_SEC, Math.hypot(front.x - inside.x, front.y - inside.y) / ENTRY_WALK_MPS);
          const leave = Math.max(0, Math.round((target.t - dist / v - step) * 100) / 100);
          const out = Math.min(target.t, Math.round((leave + step) * 100) / 100);
          c.path = [
            { t: 0, x: inside.x, y: inside.y },
            ...(leave > 0 ? [{ t: leave, x: inside.x, y: inside.y }] : []),
            ...(out < target.t ? [{ t: out, x: front.x, y: front.y }] : []),
            ...c.path.slice(ti),
          ];
          fixes++;
        } else if (into) {
          const last = c.path[c.path.length - 1];
          if (hiddenAt(plan, last, prop)) continue;
          const v = runners.has(c.id) ? NUDGE_RUN_MPS : ENTRY_WALK_MPS;
          const front = doorwayFront(plan, prop, last);
          const inside = doorwayInside(plan, prop);
          // Already past the doorstep (nearer the inside than the doorstep is): just step in.
          const past = Math.hypot(inside.x - last.x, inside.y - last.y) < Math.hypot(inside.x - front.x, inside.y - front.y);
          const away = past ? 0 : Math.hypot(front.x - last.x, front.y - last.y);
          const tFront = Math.round((last.t + (away > 0.3 ? away / v : 0)) * 100) / 100;
          const tIn = Math.round((tFront + Math.max(ENTRY_STEP_SEC, Math.hypot(inside.x - front.x, inside.y - front.y) / ENTRY_WALK_MPS)) * 100) / 100;
          if (tIn > plan.durationSec + 1e-6) continue;
          if (away > 0.3) c.path.push({ t: tFront, x: front.x, y: front.y });
          c.path.push({ t: tIn, x: inside.x, y: inside.y });
          fixes++;
        }
      }
    }
  }
  return fixes;
}

const FACE_EACH_OTHER_RE =
  /面对面|对视|说话|交谈|对话|争吵|吵架|聊|看着对方|对峙|talks?\b|argues?\b|face each other|look at each other|confront/i;
const LAYOUT_GROUP_RE = /两个人|两人|他们|她们|\bboth\b|\bthey\b/i;
const FACE_PARTNER_MAX_M = 6;

/**
 * People the text has talking or facing each other ("两个人面对面说话") face each other wherever they stand
 * together (the planner's facing degrees are often backwards). Returns how many keys turned.
 */
export function facePrevisTalkers(plan: PrevisPlan, story: string): number {
  let fixes = 0;
  for (const { clause, people, recent } of layoutClauses(plan, story)) {
    if (!FACE_EACH_OTHER_RE.test(clause)) continue;
    // "两个人" with more people in the scene: the two named last in the sentence.
    const group = LAYOUT_GROUP_RE.test(clause) ? recent.slice(-2) : people;
    if (group.length !== 2) continue;
    const [a, b] = group;
    for (const [me, other] of [
      [a, b],
      [b, a],
    ] as const) {
      for (let i = 0; i < me.path.length; i++) {
        const k = me.path[i];
        const prev = me.path[i - 1];
        const next = me.path[i + 1];
        const standing =
          (prev && Math.hypot(prev.x - k.x, prev.y - k.y) < 0.05) || (next && Math.hypot(next.x - k.x, next.y - k.y) < 0.05);
        if (!standing) continue;
        const o = samplePrevisCharacter(other, k.t);
        if (Math.hypot(o.x - k.x, o.y - k.y) > FACE_PARTNER_MAX_M) continue;
        const toward = Math.round((((Math.atan2(o.x - k.x, o.y - k.y) * 180) / Math.PI + 360) % 360) * 10) / 10;
        if (k.facing === toward) continue;
        k.facing = toward;
        fixes++;
      }
    }
  }
  return fixes;
}

const OPPOSITE_RE = /对面|\bopposite\b|across (?:the table )?from/i;

/** A place to sit (chair / sofa), stage coordinates: footprint w × d and the way the sitter faces. */
export interface PrevisSeat {
  x: number;
  y: number;
  w: number;
  d: number;
  /** Degrees the sitter faces: 0 = +y, 90 = +x. */
  facing: number;
}

const SEAT_KINDS: ReadonlySet<string> = new Set(['chair', 'sofa']);

/** Chairs and sofas among props, as seats. */
export function previsPropSeats(props: readonly PrevisProp[]): PrevisSeat[] {
  return props
    .filter((p) => SEAT_KINDS.has(p.kind ?? inferPrevisPropKind(p.label)))
    // No facing: drawn facing the entrance (previsSetBuilder's default), so the sitter faces that way too.
    .map((p) => ({ x: p.x, y: p.y, w: p.w, d: p.d, facing: p.facing ?? 180 }));
}

/** The seat a floor point is on (inside its footprint, plus `margin`), or null. */
export function previsSeatAt(seats: readonly PrevisSeat[], p: { x: number; y: number }, margin = 0.1): PrevisSeat | null {
  let best: PrevisSeat | null = null;
  let bestD = Infinity;
  for (const s of seats) {
    if (Math.abs(p.x - s.x) > s.w / 2 + margin || Math.abs(p.y - s.y) > s.d / 2 + margin) continue;
    const d = Math.hypot(p.x - s.x, p.y - s.y);
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  return best;
}

const SIT_RE = /坐下|坐在|坐到|坐着|坐进|坐回|入座|落座|\bsits?\b|\bsitting\b|\bseated\b|takes? a seat/i;
const SIT_ELSEWHERE_RE = /地上|地板|台阶|草地|床上|floor|ground|steps|stairs|grass|on the bed/i;
/** The text names what they sit at (a chair, a table…): any free seat in reach of the room. */
const SEAT_WORD_RE = /椅|凳|沙发|座|桌|chair|stool|sofa|seat|table|bench|booth/i;
const STAND_UP_RE = /站起|起身|离开|走出|走开|出门|\bstands? up\b|\bgets? up\b|\bleaves?\b|\bwalks? out\b/i;
/** A free seat this far (m) from where someone sits down is where they sit (farther when the text names a seat). */
const SEAT_REACH_M = 4;
const SEAT_REACH_NAMED_M = 8;

/**
 * People the text has sit down sit ON a chair / sofa (not beside it): their "sit" key (else the stand closest to
 * a free seat) moves onto the nearest free seat, facing the way it faces, and they stay seated unless the text has
 * them get up afterwards. Sitting on the floor, steps or grass is left alone. Returns how many sat.
 */
export function seatPrevisSitters(plan: PrevisPlan, story: string): number {
  const seats = previsPropSeats(plan.props);
  if (seats.length === 0) return 0;
  const sitters: Array<{ c: PrevisCharacter; named: boolean; after: string }> = [];
  for (const { clause, recent } of layoutClauses(plan, story)) {
    if (!SIT_RE.test(clause) || SIT_ELSEWHERE_RE.test(clause)) continue;
    const named = plan.characters.filter((c) => clause.includes(c.name));
    const at = story.indexOf(clause);
    const after = at >= 0 ? story.slice(at + clause.length) : '';
    for (const c of named.length > 0 ? named : recent.slice(0, 1)) {
      if (!sitters.some((x) => x.c === c)) sitters.push({ c, named: SEAT_WORD_RE.test(clause), after });
    }
  }
  const taken = new Set<PrevisSeat>();
  const same = (a: PrevisCharacterKey, b: PrevisCharacterKey) => Math.hypot(a.x - b.x, a.y - b.y) < 0.05;
  let fixes = 0;
  for (const { c, named, after } of sitters) {
    const reach = named ? SEAT_REACH_NAMED_M : SEAT_REACH_M;
    const nearest = (at: { x: number; y: number }) => {
      let best: { seat: PrevisSeat; d: number } | null = null;
      for (const seat of seats) {
        if (taken.has(seat)) continue;
        const d = Math.hypot(seat.x - at.x, seat.y - at.y);
        if (d <= reach && (!best || d < best.d)) best = { seat, d };
      }
      return best;
    };
    // The key the planner marked "sit", else the stand (keys on one spot; the last key holds) nearest a free seat.
    let from = c.path.findIndex((k) => !!k.action && SIT_RE.test(k.action));
    let to = from;
    let pick = from >= 0 ? nearest(c.path[from]) : null;
    if (from < 0) {
      for (let i = 0; i < c.path.length; ) {
        let j = i;
        while (j + 1 < c.path.length && same(c.path[j + 1], c.path[i])) j++;
        if (j > i || j === c.path.length - 1) {
          const n = nearest(c.path[i]);
          if (n && (!pick || n.d < pick.d)) {
            pick = n;
            from = i;
            to = j;
          }
        }
        i = j + 1;
      }
    } else {
      while (to + 1 < c.path.length && same(c.path[to + 1], c.path[from])) to++;
    }
    if (!pick || from < 0) continue;
    // Seated to the end unless the text has them get up afterwards.
    const last = STAND_UP_RE.test(after) ? to : c.path.length - 1;
    taken.add(pick.seat);
    for (let i = from; i <= last; i++) c.path[i] = { ...c.path[i], x: pick.seat.x, y: pick.seat.y, facing: pick.seat.facing };
    fixes++;
  }
  return fixes;
}

/**
 * "走过去坐在他对面": the person goes to the other side of the table the other person is at, and stays
 * there (the closest point of their path moves there, later keys hold it). Returns how many moved.
 */
export function nudgePrevisOpposite(plan: PrevisPlan, story: string): number {
  let fixes = 0;
  for (const { clause, people, recent } of layoutClauses(plan, story)) {
    if (!OPPOSITE_RE.test(clause)) continue;
    const named = plan.characters.filter((c) => clause.includes(c.name));
    // "小雨…看到了阿杰，走过去坐在他对面": no name in the clause, so the sitter is the sentence's subject
    // (named first) and "他" is the person named last.
    const me = named.length > 0 ? named[0] : recent[0];
    const other = named.length > 1 ? named[1] : named.length === 1 ? [...recent].reverse().find((c) => c !== me) : recent[recent.length - 1];
    void people;
    if (!me || !other || me.path.length === 0) continue;
    const o = samplePrevisCharacter(other, plan.durationSec);
    const table = plan.props
      .filter((p) => ['table', 'desk', 'counter'].includes(p.kind ?? inferPrevisPropKind(p.label)))
      .sort((a, b) => distanceToProp(o, a) - distanceToProp(o, b))[0];
    if (!table || distanceToProp(o, table) > 1.5) continue;
    const seat = besideProp(table, { x: 2 * table.x - o.x, y: 2 * table.y - o.y });
    let best = 0;
    me.path.forEach((k, i) => {
      if (i > 0 && Math.hypot(k.x - seat.x, k.y - seat.y) < Math.hypot(me.path[best].x - seat.x, me.path[best].y - seat.y)) best = i;
    });
    if (best === 0) continue;
    if (Math.hypot(me.path[best].x - seat.x, me.path[best].y - seat.y) < 0.3 && me.path.slice(best).every((k) => Math.hypot(k.x - seat.x, k.y - seat.y) < 0.3)) continue;
    const toward = Math.round((((Math.atan2(o.x - seat.x, o.y - seat.y) * 180) / Math.PI + 360) % 360) * 10) / 10;
    for (let i = best; i < me.path.length; i++) {
      me.path[i] = { ...me.path[i], x: Math.round(seat.x * 100) / 100, y: Math.round(seat.y * 100) / 100, facing: toward };
    }
    // Walk there at a natural pace: arrive later when the planned time is too short (later keys keep order).
    const prev = me.path[best - 1];
    const need = prev.t + Math.hypot(seat.x - prev.x, seat.y - prev.y) / NUDGE_WALK_MPS;
    if (need > me.path[best].t) {
      const delta = need - me.path[best].t;
      me.path = me.path
        .map((k, i) => (i >= best ? { ...k, t: Math.min(plan.durationSec, Math.round((k.t + delta) * 100) / 100) } : k))
        .filter((k, i, arr) => i === 0 || k.t > arr[i - 1].t);
    }
    fixes++;
  }
  return fixes;
}

const WATCH_RE = /看着|看向|盯着|望着|注视|偷看|\bwatch(?:es|ing)?\b|looks? at\b|stares? at\b/i;
const THEM_RE = /他们|她们|两人|两个人|\bthem\b/i;

/**
 * Someone the text has watching others ("阿青偷偷看着他们") faces them at the end of the take (their last
 * standing spot): toward the named person, or the middle of everyone else for "them". Returns keys turned.
 */
export function facePrevisWatchers(plan: PrevisPlan, story: string): number {
  let fixes = 0;
  for (const { clause, people } of layoutClauses(plan, story)) {
    if (!WATCH_RE.test(clause) || people.length === 0) continue;
    const watcher = people[0];
    const targets = THEM_RE.test(clause)
      ? plan.characters.filter((c) => c !== watcher && c.path.length > 0)
      : people.slice(1);
    if (targets.length === 0) continue;
    const last = watcher.path[watcher.path.length - 1];
    for (let i = watcher.path.length - 1; i >= 0; i--) {
      const k = watcher.path[i];
      if (Math.hypot(k.x - last.x, k.y - last.y) > 0.05) break;
      const at = targets.map((c) => samplePrevisCharacter(c, Math.max(k.t, plan.durationSec - 1)));
      const cx = at.reduce((sum, p) => sum + p.x, 0) / at.length;
      const cy = at.reduce((sum, p) => sum + p.y, 0) / at.length;
      const toward = Math.round((((Math.atan2(cx - k.x, cy - k.y) * 180) / Math.PI + 360) % 360) * 10) / 10;
      if (k.facing !== toward) fixes++;
      k.facing = toward;
    }
  }
  return fixes;
}

/** Set pieces nobody walks through (doors, windows and plain markers are passable). */
const SOLID_KINDS: ReadonlySet<PrevisPropKind> = new Set([
  'stairwell',
  'stairs',
  'railing',
  'low_wall',
  'table',
  'desk',
  'chair',
  'sofa',
  'bed',
  'counter',
  'shelf',
  'pillar',
  'car',
  'tree',
]);
/** Body radius kept clear of solid pieces when walking round them. */
const WALK_CLEAR_M = 0.45;

/** Whether the segment a→b passes through the prop's footprint grown by `grow` (slab clipping). */
function segmentHitsProp(a: { x: number; y: number }, b: { x: number; y: number }, p: PrevisProp, grow: number): boolean {
  const minX = p.x - p.w / 2 - grow;
  const maxX = p.x + p.w / 2 + grow;
  const minY = p.y - p.d / 2 - grow;
  const maxY = p.y + p.d / 2 + grow;
  let t0 = 0;
  let t1 = 1;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  for (const [pd, q] of [
    [-dx, a.x - minX],
    [dx, maxX - a.x],
    [-dy, a.y - minY],
    [dy, maxY - a.y],
  ] as const) {
    if (Math.abs(pd) < 1e-9) {
      if (q < 0) return false;
      continue;
    }
    const r = q / pd;
    if (pd < 0) t0 = Math.max(t0, r);
    else t1 = Math.min(t1, r);
    if (t0 > t1) return false;
  }
  return t1 - t0 > 1e-6;
}

/**
 * Walks that cut through a table, counter, stairwell… go round it: corner waypoints just outside the piece
 * are inserted (the shortest way round) and the segment's time is shared out by distance. Paths into or
 * out of a stairwell are left alone. Returns how many detours were added.
 */
export function routePrevisPathsAroundProps(plan: PrevisPlan): number {
  let fixes = 0;
  const solids = plan.props.filter((p) => SOLID_KINDS.has(p.kind ?? inferPrevisPropKind(p.label)));
  if (solids.length === 0) return 0;
  const clear = (a: { x: number; y: number }, b: { x: number; y: number }, skip: PrevisProp[]) =>
    !solids.some((p) => !skip.includes(p) && segmentHitsProp(a, b, p, WALK_CLEAR_M - 0.15));
  for (const c of plan.characters) {
    for (let guard = 0, i = 0; i < c.path.length - 1 && guard < 40; guard++) {
      const a = c.path[i];
      const b = c.path[i + 1];
      if (Math.hypot(b.x - a.x, b.y - a.y) < 0.05) {
        i++;
        continue;
      }
      // Someone stepping into / out of a piece (a stairwell hut) passes through its doorway.
      const own = solids.filter((p) => distanceToProp(a, p) < 0.01 || distanceToProp(b, p) < 0.01);
      const hit = solids.find((p) => !own.includes(p) && segmentHitsProp(a, b, p, WALK_CLEAR_M - 0.15));
      if (!hit) {
        i++;
        continue;
      }
      const m = WALK_CLEAR_M;
      const corners = [
        { x: hit.x - hit.w / 2 - m, y: hit.y - hit.d / 2 - m },
        { x: hit.x + hit.w / 2 + m, y: hit.y - hit.d / 2 - m },
        { x: hit.x + hit.w / 2 + m, y: hit.y + hit.d / 2 + m },
        { x: hit.x - hit.w / 2 - m, y: hit.y + hit.d / 2 + m },
      ];
      let best: Array<{ x: number; y: number }> | null = null;
      let bestLen = Infinity;
      const consider = (via: Array<{ x: number; y: number }>) => {
        const pts = [a, ...via, b];
        for (let k = 0; k < pts.length - 1; k++) if (!clear(pts[k], pts[k + 1], own)) return;
        let len = 0;
        for (let k = 0; k < pts.length - 1; k++) len += Math.hypot(pts[k + 1].x - pts[k].x, pts[k + 1].y - pts[k].y);
        if (len < bestLen) {
          bestLen = len;
          best = via;
        }
      };
      for (const k of corners) consider([k]);
      for (let k = 0; k < 4; k++) {
        consider([corners[k], corners[(k + 1) % 4]]);
        consider([corners[(k + 1) % 4], corners[k]]);
      }
      if (!best) {
        i++;
        continue;
      }
      const via: Array<{ x: number; y: number }> = best;
      const pts = [a, ...via, b];
      const legs = pts.slice(1).map((p, k) => Math.hypot(p.x - pts[k].x, p.y - pts[k].y));
      const total = legs.reduce((sum, l) => sum + l, 0);
      let acc = 0;
      const inserted = via.map((p, k) => {
        acc += legs[k];
        return { t: Math.round((a.t + ((b.t - a.t) * acc) / total) * 100) / 100, x: Math.round(p.x * 100) / 100, y: Math.round(p.y * 100) / 100 };
      });
      c.path.splice(i + 1, 0, ...inserted);
      fixes++;
    }
  }
  return fixes;
}

/** Ids of people the text places at a set piece ("靠在栏杆边"): contacts move their partner, not them. */
export function previsPeoplePinnedToProps(plan: PrevisPlan, story: string): Set<string> {
  return new Set(layoutNearPairs(plan, story).map((p) => p.c.id));
}

/**
 * Put people the text places at a set piece next to it: the stretch of their path closest to the prop
 * (every key standing at that spot) moves beside it. `skipContacts`: leave people who touch someone (run
 * after the contact fix, which would otherwise be undone). Returns how many characters moved.
 */
export function nudgePrevisPeopleToProps(plan: PrevisPlan, story: string, opts: { skipContacts?: boolean } = {}): number {
  let fixes = 0;
  const touching = new Set((plan.contacts ?? []).flatMap((ct) => [ct.a, ct.b]));
  for (const { c, prop, clause } of layoutNearPairs(plan, story)) {
    if (opts.skipContacts && touching.has(c.id)) continue;
    let best = 0;
    c.path.forEach((k, i) => {
      if (distanceToProp(k, prop) < distanceToProp(c.path[best], prop)) best = i;
    });
    const where = LAYOUT_BEHIND_RE.test(clause) ? 'behind' : LAYOUT_FRONT_RE.test(clause) ? 'front' : undefined;
    const spot = { x: c.path[best].x, y: c.path[best].y };
    const target = besideProp(prop, spot, where);
    const near = distanceToProp(spot, prop) <= LAYOUT_NEAR_M;
    // Standing inside the piece itself (a person in the middle of a table) also moves beside it.
    const inside = distanceToProp(spot, prop) < 0.01;
    const move = inside || !(near && (!where || Math.hypot(target.x - spot.x, target.y - spot.y) < 0.6));
    const at = move ? target : spot;
    // Standing at a desk, railing or doorway means facing it (seats keep the planner's facing).
    const kind = prop.kind ?? inferPrevisPropKind(prop.label);
    const faceIt = !['chair', 'sofa', 'bed'].includes(kind);
    const toward = Math.round((((Math.atan2(prop.x - at.x, prop.y - at.y) * 180) / Math.PI + 360) % 360) * 10) / 10;
    for (const k of c.path) {
      if (Math.hypot(k.x - spot.x, k.y - spot.y) < 0.05) {
        k.x = Math.round(at.x * 100) / 100;
        k.y = Math.round(at.y * 100) / 100;
        if (faceIt) k.facing = toward;
      }
    }
    if (move) fixes++;
  }
  return fixes;
}

/** Second the character first walks (0 when they start walking right away). */
function firstMoveSec(c: PrevisCharacter): number {
  for (let i = 1; i < c.path.length; i++) {
    if (Math.hypot(c.path[i].x - c.path[i - 1].x, c.path[i].y - c.path[i - 1].y) > 0.3) return c.path[i - 1].t;
  }
  return 0;
}

/** Waiting inside a stairwell hut, or outside the stage beyond an edge door, is out of view. */
function hiddenAt(plan: PrevisPlan, p: { x: number; y: number }, prop: PrevisProp): boolean {
  const kind = prop.kind ?? inferPrevisPropKind(prop.label);
  if (kind === 'stairwell') return distanceToProp(p, prop) < 0.01;
  return Math.abs(p.x) > plan.stage.width / 2 || Math.abs(p.y) > plan.stage.depth / 2;
}

/** Distance from a floor point to a prop's footprint (0 inside). */
function distanceToProp(p: { x: number; y: number }, prop: PrevisProp): number {
  const dx = Math.max(0, Math.abs(p.x - prop.x) - prop.w / 2);
  const dy = Math.max(0, Math.abs(p.y - prop.y) - prop.d / 2);
  return Math.hypot(dx, dy);
}

/**
 * Where the text puts people relative to set pieces: "靠在栏杆边" → next to the railing, "从楼梯口跑上来" →
 * starts at the stairwell, "走回楼梯间" → ends there; set pieces the text names must exist as props.
 */
export function checkPrevisLayoutIntent(plan: PrevisPlan, story: string): string[] {
  const out: string[] = [];
  const kindsInPlan = new Set(plan.props.map((p) => p.kind ?? inferPrevisPropKind(p.label)));
  const missing = new Set<PrevisPropKind>();
  // Words matched by an earlier (more specific) kind are blanked: "办公桌" is a desk, not also a table.
  let rest = story;
  for (const [kind, re] of PROP_KIND_WORDS) {
    const m = rest.match(re);
    if (m) rest = rest.replace(new RegExp(re.source, `${re.flags.replace('g', '')}g`), (w) => ' '.repeat(w.length));
    if (!m || !LAYOUT_REQUIRED_KINDS.has(kind) || kindsInPlan.has(kind) || missing.has(kind)) continue;
    if ((LAYOUT_SAME_FAMILY[kind] ?? []).some((k) => kindsInPlan.has(k))) continue;
    missing.add(kind);
    out.push(`The text names "${m[0]}" but the plan has no prop for it: add it as a prop with "kind": "${kind}" where the text puts it.`);
  }
  for (const { clause, people } of layoutClauses(plan, story)) {
    const props = plan.props.filter((p) => propInText(p, clause));
    if (people.length === 0 || props.length === 0) continue;
    const from = LAYOUT_FROM_RE.test(clause);
    const into = LAYOUT_INTO_RE.test(clause);
    const near = LAYOUT_NEAR_RE.test(clause);
    for (const c of people) {
      for (const prop of props) {
        if (from && distanceToProp(c.path[0], prop) > LAYOUT_ENDPOINT_M) {
          out.push(`${c.name} comes out of / from the ${prop.label} ("${clause}"): start their path right at it (within 1 m of its front).`);
        } else if (from && !hiddenAt(plan, c.path[0], prop) && firstMoveSec(c) > 1) {
          out.push(`${c.name} comes out of the ${prop.label} at ${firstMoveSec(c)}s ("${clause}") but is already in view before that: start their path inside it (the stairwell's centre, or just outside the door on the stage edge).`);
        } else if (into && distanceToProp(c.path[c.path.length - 1], prop) > LAYOUT_ENDPOINT_M) {
          out.push(`${c.name} goes into / back to the ${prop.label} ("${clause}"): end their path right at it (within 1 m of its front).`);
        } else if (near && !from && !into) {
          let best = Infinity;
          for (let t = 0; t <= plan.durationSec + 1e-6; t += 0.5) best = Math.min(best, distanceToProp(samplePrevisCharacter(c, t), prop));
          if (best > LAYOUT_NEAR_M) {
            out.push(`${c.name} is at / next to the ${prop.label} ("${clause}"): place them within 1 m of it.`);
          }
        }
      }
    }
  }
  return out;
}

interface CameraPose {
  x: number;
  y: number;
  h: number;
  aim: PrevisPoint3;
  aimId?: string;
  fov?: number;
  roll?: number;
}

const OVER_SHOULDER_BACK_M = 0.75;
const OVER_SHOULDER_SIDE_M = 0.38;

function shotHeight(s: PrevisCameraShot, fallback: number): number {
  if (typeof s.heightM === 'number') return s.heightM;
  return s.height ? PREVIS_CAMERA_HEIGHT_M[s.height] : fallback;
}

function hasExactFraming(s: PrevisCameraShot): boolean {
  return typeof s.angleDeg === 'number' && typeof s.distM === 'number';
}

/** Turn the aim point around the camera by `yawDeg` (clockwise seen from above). */
function applyYaw(cam: { x: number; y: number }, aim: PrevisPoint3, yawDeg: number | undefined): PrevisPoint3 {
  if (!yawDeg) return aim;
  const dx = aim.x - cam.x;
  const dy = aim.y - cam.y;
  const r = Math.hypot(dx, dy);
  if (r < 1e-6) return aim;
  const dir = Math.atan2(dx, dy) + (yawDeg * Math.PI) / 180;
  return { x: cam.x + Math.sin(dir) * r, y: cam.y + Math.cos(dir) * r, h: aim.h };
}

function shotAimH(s: PrevisCameraShot): number {
  if (s.aim) return PREVIS_CAMERA_AIM_H[s.aim];
  return s.height === 'floor' ? PREVIS_CAMERA_AIM_H.feet : PREVIS_CAMERA_AIM_H.face;
}

function polarParams(s: SolvedShot): { alpha: number; d: number; h: number; aimH: number } {
  const rel = s.shot.relation as keyof typeof RELATION_ANGLE_DEG;
  const exact = hasExactFraming(s.shot);
  return {
    alpha: exact
      ? (s.shot.angleDeg! * Math.PI) / 180
      : s.alphaFrom !== undefined
        ? s.alphaFrom
        : ((RELATION_ANGLE_DEG[rel] ?? 90) * s.sign * Math.PI) / 180,
    d:
      (typeof s.shot.distM === 'number' ? s.shot.distM : PREVIS_CAMERA_DISTANCE_M[s.shot.distance ?? 'medium']) *
      (subjectFramingScale.get(s.subject) ?? 1),
    h: shotHeight(s.shot, PREVIS_CAMERA_HEIGHT_M.eye),
    aimH: shotAimH(s.shot),
  };
}

function isPolar(s: SolvedShot): boolean {
  if (s.shot.relation === 'hold') return false;
  return s.shot.relation !== 'over_shoulder' || hasExactFraming(s.shot);
}

/** Who a polar shot looks at: `toward` for over-the-shoulder and editor-placed shots, else the subject. */
function polarAimCharacter(s: SolvedShot): PrevisCharacter {
  return (s.shot.relation === 'over_shoulder' || hasExactFraming(s.shot)) && s.toward ? s.toward : s.subject;
}

/**
 * Heading the camera places itself by: the walking direction while the subject walks, and their facing at
 * the shot second while they stand, so someone turning on the spot (looking up at a door) does not swing
 * the camera round them. Blends by speed, so starting or stopping never jumps.
 */
/** Half window over which the walking direction is measured (wider = gentler camera turns). */
const CAMERA_HEADING_WINDOW_SEC = 0.8;

/** How fast the camera may swing round a walker who turns (rad/s): a right-angle turn takes ~1.5 s. */
const CAMERA_ORBIT_RAD_PER_SEC = Math.PI / 3;
const HEADING_TRACK_STEP_SEC = 0.1;
const walkHeadingCache = new WeakMap<PrevisCharacter, { sig: string; track: number[] }>();

/**
 * Walking direction over time, turned at most CAMERA_ORBIT_RAD_PER_SEC (rate-limited forwards and
 * backwards, then averaged), so a sharp turn round a counter does not whip the camera round the walker.
 */
function walkHeadingTrack(subject: PrevisCharacter): number[] {
  const sig = JSON.stringify(subject.path);
  const hit = walkHeadingCache.get(subject);
  if (hit && hit.sig === sig) return hit.track;
  const end = (subject.path[subject.path.length - 1]?.t ?? 0) + 2;
  const raw: number[] = [];
  let last = smoothedHeading(subject, 0);
  for (let n = 0; n * HEADING_TRACK_STEP_SEC <= end + 1e-6; n++) {
    const t = n * HEADING_TRACK_STEP_SEC;
    const a = samplePrevisCharacter(subject, t - CAMERA_HEADING_WINDOW_SEC);
    const b = samplePrevisCharacter(subject, t + CAMERA_HEADING_WINDOW_SEC);
    const h = Math.hypot(b.x - a.x, b.y - a.y) < 1e-3 ? last : Math.atan2(b.x - a.x, b.y - a.y);
    // Unwrap so the limiter works on a continuous angle.
    last = last + wrapRad(h - last);
    raw.push(last);
  }
  const step = CAMERA_ORBIT_RAD_PER_SEC * HEADING_TRACK_STEP_SEC;
  const limit = (order: number[]) => {
    const out = raw.slice();
    let prev = raw[order[0]];
    for (const i of order) {
      prev += Math.max(-step, Math.min(step, raw[i] - prev));
      out[i] = prev;
    }
    return out;
  };
  const idx = raw.map((_, i) => i);
  const fwd = limit(idx);
  const bwd = limit([...idx].reverse());
  const track = raw.map((_, i) => (fwd[i] + bwd[i]) / 2);
  walkHeadingCache.set(subject, { sig, track });
  return track;
}

function cameraHeading(subject: PrevisCharacter, t: number, anchorT: number): number {
  const standing = smoothedHeading(subject, anchorT);
  const a = samplePrevisCharacter(subject, t - CAMERA_HEADING_WINDOW_SEC);
  const b = samplePrevisCharacter(subject, t + CAMERA_HEADING_WINDOW_SEC);
  const moved = Math.hypot(b.x - a.x, b.y - a.y);
  if (moved < 1e-3) return standing;
  // The walking direction itself (a "look back" facing key while walking must not swing the camera),
  // turned at a limited rate.
  const track = walkHeadingTrack(subject);
  const walking = track[Math.max(0, Math.min(track.length - 1, Math.round(t / HEADING_TRACK_STEP_SEC)))];
  const w = clamp01((moved / (2 * CAMERA_HEADING_WINDOW_SEC) - 0.15) / 0.45);
  return standing + wrapRad(walking - standing) * w;
}

function polarPose(
  subject: PrevisCharacter,
  t: number,
  p: { alpha: number; d: number; h: number; aimH: number },
  aimCharacter: PrevisCharacter = subject,
  yawDeg?: number,
  heading: number = smoothedHeading(subject, t),
): CameraPose {
  const at = samplePrevisCharacter(subject, t);
  const dir = heading + p.alpha;
  const x = at.x + p.d * Math.sin(dir);
  const y = at.y + p.d * Math.cos(dir);
  const target = aimCharacter === subject ? at : samplePrevisCharacter(aimCharacter, t);
  return {
    x,
    y,
    h: p.h,
    aim: applyYaw({ x, y }, { x: target.x, y: target.y, h: p.aimH }, yawDeg),
    aimId: yawDeg ? undefined : aimCharacter.id,
  };
}

function shotPose(s: SolvedShot, t: number): CameraPose {
  const yaw = s.shot.yawDeg;
  if (s.shot.relation === 'hold' && s.driftFrom) {
    const from = shotPose(s.driftFrom, t);
    const at = samplePrevisCharacter(s.subject, t);
    return { x: from.x, y: from.y, h: from.h, aim: applyYaw(from, { x: at.x, y: at.y, h: shotAimH(s.shot) }, yaw), aimId: yaw ? undefined : s.subject.id };
  }
  if ((s.shot.relation === 'hold' || s.shot.still) && s.fixed) {
    const at = samplePrevisCharacter(s.subject, t);
    return { ...s.fixed, aim: applyYaw(s.fixed, { x: at.x, y: at.y, h: shotAimH(s.shot) }, yaw), aimId: yaw ? undefined : s.subject.id };
  }
  if (s.shot.relation === 'over_shoulder' && s.toward && !hasExactFraming(s.shot)) {
    const a = samplePrevisCharacter(s.subject, t);
    const b = samplePrevisCharacter(s.toward, t);
    const { x: ux, y: uy } = s.view ?? overShoulderView(s.subject, s.toward, t);
    // Tight over the shoulder: foreground shoulder + back of the head fill about a third of the frame.
    const x = a.x - ux * OVER_SHOULDER_BACK_M + uy * s.sign * OVER_SHOULDER_SIDE_M;
    const y = a.y - uy * OVER_SHOULDER_BACK_M - ux * s.sign * OVER_SHOULDER_SIDE_M;
    return {
      x,
      y,
      h: shotHeight(s.shot, PREVIS_CAMERA_HEIGHT_M.eye),
      aim: applyYaw({ x, y }, { x: b.x, y: b.y, h: shotAimH(s.shot) }, yaw),
      aimId: yaw ? undefined : s.toward.id,
    };
  }
  return polarPose(s.subject, t, polarParams(s), polarAimCharacter(s), yaw, cameraHeading(s.subject, t, s.shot.t));
}

function lerp(a: number, b: number, w: number): number {
  return a + (b - a) * w;
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

/** Pan from aim `a` to aim `b` as seen from `pos` (yaw interpolation), so the aim never swings through the camera. */
function panAim(pos: { x: number; y: number }, a: PrevisPoint3, b: PrevisPoint3, w: number): PrevisPoint3 {
  const ya = Math.atan2(a.x - pos.x, a.y - pos.y);
  let d = Math.atan2(b.x - pos.x, b.y - pos.y) - ya;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  const yaw = ya + d * w;
  const r = Math.max(1, lerp(Math.hypot(a.x - pos.x, a.y - pos.y), Math.hypot(b.x - pos.x, b.y - pos.y), w));
  return { x: pos.x + Math.sin(yaw) * r, y: pos.y + Math.cos(yaw) * r, h: lerp(a.h, b.h, w) };
}

/** Seconds at the end of a gap used to move to a new subject; before that the camera keeps the old framing. */
const SUBJECT_CHANGE_MIN_SEC = 2.5;
/** Fastest pan between subjects; a half turn takes ~2.4 s instead of a whip through the walls. */
const PAN_MAX_DEG_PER_SEC = 75;
/** Pans happen over the last 70% of the subject-change window. */
const PAN_SHARE = 0.7;

/** Shot pairs whose move label asks for circling around the subject. */
const ORBIT_MOVE_RE = /orbit|arc|circle|环绕/i;
/** Turning further than this around a person without an orbit request means "let them walk past". */
const LET_PASS_MIN_RAD = (100 * Math.PI) / 180;

function wrapRad(r: number): number {
  return Math.atan2(Math.sin(r), Math.cos(r));
}

function poseBetween(a: SolvedShot, b: SolvedShot | undefined, t: number): CameraPose {
  if (!b || t <= a.shot.t) return shotPose(a, t);
  const span = Math.max(1e-6, b.shot.t - a.shot.t);
  const w = smoothstep(clamp01((t - a.shot.t) / span));
  if (isPolar(a) && isPolar(b) && a.subject === b.subject) {
    const pa = polarParams(a);
    const pb = polarParams(b);
    const turn = wrapRad(pb.alpha - pa.alpha);
    const orbit = ORBIT_MOVE_RE.test(a.shot.move ?? '') || ORBIT_MOVE_RE.test(b.shot.move ?? '');
    if (!orbit && Math.abs(turn) > LET_PASS_MIN_RAD && polarAimCharacter(a) === polarAimCharacter(b)) {
      // e.g. from in front of a walking person to following them: the camera glides straight from where it
      // was to the follow position while they walk past it (no circling round them, no stop).
      const start = shotPose(a, a.shot.t);
      const target = shotPose(b, t);
      const aimAt = samplePrevisCharacter(polarAimCharacter(a), t);
      const lw = clamp01((t - a.shot.t) / span);
      return {
        x: lerp(start.x, target.x, lw),
        y: lerp(start.y, target.y, lw),
        h: lerp(start.h, target.h, w),
        aim: { x: aimAt.x, y: aimAt.y, h: lerp(pa.aimH, pb.aimH, w) },
        aimId: polarAimCharacter(a).id,
      };
    }
    // Orbits go the shorter way round.
    const params = { alpha: pa.alpha + turn * w, d: lerp(pa.d, pb.d, w), h: lerp(pa.h, pb.h, w), aimH: lerp(pa.aimH, pb.aimH, w) };
    const aimA = polarAimCharacter(a);
    const ha = cameraHeading(a.subject, t, a.shot.t);
    const heading = ha + wrapRad(cameraHeading(a.subject, t, b.shot.t) - ha) * w;
    if (aimA === polarAimCharacter(b) && !a.shot.yawDeg && !b.shot.yawDeg) {
      return polarPose(a.subject, t, params, aimA, undefined, heading);
    }
    const pose = polarPose(a.subject, t, params, aimA, undefined, heading);
    return { ...pose, aim: panAim(pose, shotPose(a, t).aim, shotPose(b, t).aim, w), aimId: undefined };
  }
  const endA = shotPose(a, b.shot.t).aim;
  const endB = shotPose(b, b.shot.t);
  const turnDeg = Math.abs(
    (wrapRad(Math.atan2(endB.aim.x - endB.x, endB.aim.y - endB.y) - Math.atan2(endA.x - endB.x, endA.y - endB.y)) * 180) /
      Math.PI,
  );
  const panSec = turnDeg / PAN_MAX_DEG_PER_SEC / PAN_SHARE;
  const win = Math.min(span, Math.max(SUBJECT_CHANGE_MIN_SEC, span * 0.5, panSec));
  const u = clamp01((t - (b.shot.t - win)) / win);
  const pa = shotPose(a, t);
  if (u <= 0) return pa;
  const pb = shotPose(b, t);
  const mw = smoothstep(u);
  const pos = { x: lerp(pa.x, pb.x, mw), y: lerp(pa.y, pb.y, mw) };
  const sameAim = pa.aimId !== undefined && pa.aimId === pb.aimId;
  return {
    ...pos,
    h: lerp(pa.h, pb.h, mw),
    // The pan starts a little after the move so the current subject stays in frame.
    aim: sameAim
      ? { x: lerp(pa.aim.x, pb.aim.x, mw), y: lerp(pa.aim.y, pb.aim.y, mw), h: lerp(pa.aim.h, pb.aim.h, mw) }
      : panAim(pos, pa.aim, pb.aim, smoothstep(clamp01((u - (1 - PAN_SHARE)) / PAN_SHARE))),
    aimId: sameAim ? pa.aimId : undefined,
  };
}

/**
 * Keep the camera out of bodies (1 m from whoever it aims at, 0.8 m from others) and inside the stage.
 * `sides` remembers which side of each person the camera went around, so a path crossing someone's center
 * does not flip sides (a 2 m jump).
 */
function clearPose(plan: PrevisPlan, pose: CameraPose, t: number, sides: Map<string, { x: number; y: number }>): void {
  if (pose.h <= PREVIS_CHARACTER_HEAD_H + 0.25) {
    for (let pass = 0; pass < 6; pass++) {
      for (const c of plan.characters) {
        const p = samplePrevisCharacter(c, t);
        const minR = (c.id === pose.aimId ? PREVIS_CAMERA_MIN_SUBJECT_M : 0.8) + 0.02;
        const dx = pose.x - p.x;
        const dy = pose.y - p.y;
        const d = Math.hypot(dx, dy);
        if (d >= minR) {
          sides.delete(c.id);
          continue;
        }
        let ux = d > 1e-3 ? dx / d : 0;
        let uy = d > 1e-3 ? dy / d : -1;
        const prev = sides.get(c.id);
        if (prev && ux * prev.x + uy * prev.y < 0) {
          ux = prev.x;
          uy = prev.y;
        }
        sides.set(c.id, { x: ux, y: uy });
        pose.x = p.x + ux * minR;
        pose.y = p.y + uy * minR;
      }
    }
  }
  const hw = plan.stage.width / 2 - 0.2;
  const hd = plan.stage.depth / 2 - 0.2;
  pose.x = Math.max(-hw, Math.min(hw, pose.x));
  pose.y = Math.max(-hd, Math.min(hd, pose.y));
}

function buildSolvedShots(plan: PrevisPlan, shots: PrevisCameraShot[]): SolvedShot[] {
  const solved: SolvedShot[] = [];
  let sign = 1;
  for (const shot of shots) {
    const subject = previsSubjectById(plan, shot.subject)!;
    if (shot.side) sign = shot.side === 'left' ? -1 : 1;
    const s: SolvedShot = {
      shot,
      subject,
      toward: shot.toward ? previsSubjectById(plan, shot.toward) : undefined,
      sign,
    };
    if (shot.relation === 'over_shoulder' && s.toward) s.view = overShoulderView(subject, s.toward, shot.t);
    const prev = solved[solved.length - 1];
    if (typeof shot.angleOffsetDeg === 'number' && prev && prev.subject === subject && isPolar(prev) && !hasExactFraming(shot)) {
      s.alphaFrom = polarParams(prev).alpha + (shot.angleOffsetDeg * Math.PI) / 180;
    }
    if (!shot.side && prev && prev.subject !== subject && shot.relation !== 'hold' && !hasExactFraming(shot)) {
      // "Right" of the previous subject means nothing for a new one: take the side nearer the camera.
      const from = shotPose(prev, shot.t);
      const dist = (sg: number) => {
        const p = shotPose({ ...s, sign: sg }, shot.t);
        return Math.hypot(p.x - from.x, p.y - from.y);
      };
      sign = dist(1) <= dist(-1) ? 1 : -1;
      s.sign = sign;
    }
    if (shot.relation === 'hold') {
      const prev = solved[solved.length - 1];
      const from = prev
        ? prev.fixed ?? poseBetween(prev, undefined, shot.t)
        : polarPose(subject, shot.t, { alpha: (45 * Math.PI) / 180, d: PREVIS_CAMERA_DISTANCE_M.medium, h: PREVIS_CAMERA_HEIGHT_M.eye, aimH: 1.5 });
      s.fixed = { x: from.x, y: from.y, h: shotHeight(shot, from.h) };
      if (shot.drift && prev && !prev.fixed) s.driftFrom = prev;
      else if (shot.drift && prev?.driftFrom) s.driftFrom = prev.driftFrom;
    } else if (shot.still) {
      const at = shotPose(s, shot.t);
      s.fixed = { x: at.x, y: at.y, h: at.h };
    }
    solved.push(s);
  }
  return solved;
}

const SIGHT_CLEAR_M = 0.5;
const SIGHT_SHIFT_MAX_M = 1.2;
/** Half-widths used to tell whether the framed person hides someone further back. */
const SUBJECT_HALF_W_M = 0.3;
const OTHER_HALF_W_M = 0.2;
const HIDDEN_BEHIND_MAX_M = 15;

/** How fast the camera may slide aside for a clear line of sight (it starts early and eases back). */
const SIGHT_SLIDE_MPS = 0.8;

type Offset = { x: number; y: number };

/**
 * Sideways offset that keeps people visible:
 * - someone standing between the camera and whoever it frames hides them (a head filling the frame): the
 *   line of sight should pass beside that person. `keepId` (the shoulder in an over-the-shoulder) is a wanted
 *   foreground and stays;
 * - whoever the camera frames can hide someone further back on the same line (following a person towards
 *   someone waiting): the one behind should show beside them.
 * Weights fade to zero at the edges of each test so the offset never jumps; `prefer` (the side used on the
 * previous frame) keeps the camera on one side while someone crosses behind the subject.
 */
function sightLineOffset(
  plan: PrevisPlan,
  pose: CameraPose,
  t: number,
  keepId: string | undefined,
  prefer: number,
): Offset & { side: number } {
  const dx = pose.aim.x - pose.x;
  const dy = pose.aim.y - pose.y;
  const len = Math.hypot(dx, dy);
  if (len < 1) return { x: 0, y: 0, side: 0 };
  const ux = dx / len;
  const uy = dy / len;
  let side = 0;
  for (const c of plan.characters) {
    if (c.id === pose.aimId || c.id === keepId) continue;
    const p = samplePrevisCharacter(c, t);
    const along = (p.x - pose.x) * ux + (p.y - pose.y) * uy;
    const perp = -(p.x - pose.x) * uy + (p.y - pose.y) * ux;
    if (len >= 1.5 && along > 0.3 && along < len - 0.6 && Math.abs(perp) < SIGHT_CLEAR_M) {
      // Away from the person in front; nearer the subject needs a bigger slide.
      const w = clamp01((along - 0.3) / 0.4) * clamp01((len - 0.6 - along) / 0.6);
      const shift = Math.min(SIGHT_SHIFT_MAX_M, ((SIGHT_CLEAR_M - Math.abs(perp)) * len) / Math.max(0.6, len - along));
      side += (perp >= 0 ? -1 : 1) * shift * w;
    } else if (pose.aimId && along > len + 0.4 && along < len + HIDDEN_BEHIND_MAX_M) {
      const need = SUBJECT_HALF_W_M / len + OTHER_HALF_W_M / along;
      const sep = perp / along;
      if (Math.abs(sep) >= need) continue;
      // Moving the camera s metres sideways separates them by s * (1/len - 1/along) radians.
      const k = 1 / len - 1 / along;
      const w = clamp01((along - len - 0.4) / 0.6);
      const toSide = (dir: number) => (dir * need - sep) / k;
      let s = toSide(sep >= 0 ? 1 : -1);
      if (prefer !== 0 && Math.abs(toSide(prefer)) <= SIGHT_SHIFT_MAX_M) s = toSide(prefer);
      s = Math.max(-SIGHT_SHIFT_MAX_M, Math.min(SIGHT_SHIFT_MAX_M, s)) * w;
      if (Math.abs(s) > Math.abs(side)) side = s;
    }
  }
  side = Math.max(-SIGHT_SHIFT_MAX_M, Math.min(SIGHT_SHIFT_MAX_M, side));
  return { x: -uy * side, y: ux * side, side };
}

/** Rate-limit offsets forwards and backwards and average: the slide starts before it is needed and eases out. */
function smoothOffsets(offsets: Offset[], maxStep: number): Offset[] {
  const pass = (order: number[]) => {
    const out: Offset[] = offsets.map(() => ({ x: 0, y: 0 }));
    let prev: Offset = { x: 0, y: 0 };
    for (const i of order) {
      const dx = offsets[i].x - prev.x;
      const dy = offsets[i].y - prev.y;
      const d = Math.hypot(dx, dy);
      const f = d > maxStep ? maxStep / d : 1;
      prev = { x: prev.x + dx * f, y: prev.y + dy * f };
      out[i] = prev;
    }
    return out;
  };
  const idx = offsets.map((_, i) => i);
  const fwd = pass(idx);
  const bwd = pass([...idx].reverse());
  return offsets.map((_, i) => ({ x: (fwd[i].x + bwd[i].x) / 2, y: (fwd[i].y + bwd[i].y) / 2 }));
}

function denseCameraKeys(plan: PrevisPlan, solved: SolvedShot[]): PrevisCameraKey[] {
  const keys: PrevisCameraKey[] = [];
  const steps = Math.round(plan.durationSec / SOLVED_KEY_STEP_SEC);
  const sides = new Map<string, { x: number; y: number }>();
  const frames: { t: number; i: number; pose: CameraPose }[] = [];
  let i = 0;
  for (let n = 0; n <= steps; n++) {
    const t = Math.min(plan.durationSec, Math.round(n * SOLVED_KEY_STEP_SEC * 1000) / 1000);
    while (i < solved.length - 1 && t >= solved[i + 1].shot.t) i++;
    const pose = poseBetween(solved[i], solved[i + 1], t);
    if (solved[i].shot.shake) {
      pose.x += 0.03 * Math.sin(t * 8.1);
      pose.h += 0.02 * Math.sin(t * 10.7 + 1);
    }
    frames.push({ t, i, pose });
  }
  let prefer = 0;
  const offsets = smoothOffsets(
    frames.map(({ t, i, pose }) => {
      const keepId = solved[i].shot.relation === 'over_shoulder' ? solved[i].subject.id : undefined;
      const o = sightLineOffset(plan, pose, t, keepId, prefer);
      prefer = Math.abs(o.side) > 0.05 ? Math.sign(o.side) : 0;
      return o;
    }),
    SIGHT_SLIDE_MPS * SOLVED_KEY_STEP_SEC,
  );
  for (let n = 0; n < frames.length; n++) {
    const { t, i, pose } = frames[n];
    pose.x += offsets[n].x;
    pose.y += offsets[n].y;
    clearPose(plan, pose, t, sides);
    const baseFov = plan.camera.fovDeg ?? DEFAULT_FOV;
    const fovA = solved[i].shot.fovDeg ?? baseFov;
    const fovB = solved[i + 1]?.shot.fovDeg ?? fovA;
    const rollA = solved[i].shot.rollDeg ?? 0;
    const rollB = solved[i + 1]?.shot.rollDeg ?? rollA;
    const span = solved[i + 1] ? Math.max(1e-6, solved[i + 1].shot.t - solved[i].shot.t) : 1;
    const u = solved[i + 1] ? smoothstep(clamp01((t - solved[i].shot.t) / span)) : 0;
    const fov = Math.round(lerp(fovA, fovB, u) * 10) / 10;
    const roll = Math.round(lerp(rollA, rollB, u) * 10) / 10;
    keys.push({
      t,
      x: Math.round(pose.x * 1000) / 1000,
      y: Math.round(pose.y * 1000) / 1000,
      h: Math.round(pose.h * 1000) / 1000,
      lookAt: pose.aimId ?? { x: pose.aim.x, y: pose.aim.y, h: pose.aim.h },
      lookAtH: Math.round(pose.aim.h * 1000) / 1000,
      move: solved[i].shot.move,
      ...(fov !== baseFov ? { fovDeg: fov } : {}),
      ...(roll !== 0 ? { rollDeg: roll } : {}),
    });
  }
  return keys;
}

/** Binomial [1 4 6 4 1] smoothing of key positions (ends kept): irons out leftover jolts without lag. */
function smoothCameraKeys(keys: PrevisCameraKey[]): PrevisCameraKey[] {
  if (keys.length < 5) return keys;
  const w = [1, 4, 6, 4, 1];
  return keys.map((k, i) => {
    if (i < 2 || i > keys.length - 3) return k;
    let x = 0;
    let y = 0;
    let h = 0;
    for (let j = -2; j <= 2; j++) {
      x += keys[i + j].x * w[j + 2];
      y += keys[i + j].y * w[j + 2];
      h += keys[i + j].h * w[j + 2];
    }
    // Fixed aim points get the same smoothing when all five neighbours have one (pans speed up and slow down evenly).
    let lookAt = k.lookAt;
    const aims = [-2, -1, 0, 1, 2].map((j) => aimPointOf(keys[i + j]));
    if (aims.every((a) => a)) {
      const avg = (ax: 'x' | 'y' | 'h') =>
        Math.round((aims.reduce((sum, a, j) => sum + a![ax] * w[j], 0) / 16) * 1000) / 1000;
      lookAt = { x: avg('x'), y: avg('y'), h: avg('h') };
    }
    return {
      ...k,
      x: Math.round((x / 16) * 1000) / 1000,
      y: Math.round((y / 16) * 1000) / 1000,
      h: Math.round((h / 16) * 1000) / 1000,
      lookAt,
    };
  });
}

/** Peak camera speed (0.5 s window) between two times on dense keys. */
function peakCameraSpeed(keys: PrevisCameraKey[], from: number, to: number): number {
  let peak = 0;
  for (let i = 2; i < keys.length; i++) {
    if (keys[i].t <= from || keys[i - 2].t >= to) continue;
    const d =
      Math.hypot(keys[i].x - keys[i - 1].x, keys[i].y - keys[i - 1].y, keys[i].h - keys[i - 1].h) +
      Math.hypot(keys[i - 1].x - keys[i - 2].x, keys[i - 1].y - keys[i - 2].y, keys[i - 1].h - keys[i - 2].h);
    peak = Math.max(peak, d / Math.max(1e-6, keys[i].t - keys[i - 2].t));
  }
  return peak;
}

const MIN_SHOT_GAP_SEC = 0.5;
/** The last framing should be reached at least this long before the take ends. */
const END_SETTLE_SEC = 1.5;

/**
 * Give shot `i + 1` (and, if needed, the shots after it) `delta` more seconds. Later shots that no longer fit
 * before the end are dropped only if they are holds; returns false when the move cannot be delayed.
 */
function delayShot(shots: PrevisCameraShot[], i: number, delta: number, duration: number): boolean {
  const next = shots[i + 1];
  const newT = Math.ceil((next.t + delta) * 4) / 4;
  if (newT > duration) return false;
  // A framing pushed into the last seconds is only reached as the take ends (a whip pan on the last frame).
  if (newT > duration - END_SETTLE_SEC && next.t <= duration - END_SETTLE_SEC) return false;
  const moved = shots.map((s) => ({ ...s }));
  moved[i + 1].t = newT;
  for (let j = i + 2; j < moved.length; j++) moved[j].t = Math.max(moved[j].t, moved[j - 1].t + MIN_SHOT_GAP_SEC);
  const dropped = moved.filter((s) => s.t > duration);
  if (dropped.some((s) => s.relation !== 'hold')) return false;
  shots.splice(0, shots.length, ...moved.filter((s) => s.t <= duration));
  return true;
}

/** Window at the end of the take where framings that follow each other too closely are merged. */
const END_TIDY_SEC = 3;
/** A new person needs this long on screen before the next framing, or they are never seen. */
const SUBJECT_SETTLE_SEC = 1.5;

/**
 * Near the end of the take: a framing of someone that the next framing replaces within 1.5 s is dropped (it
 * would only be a whip pan through), and the last framing is reached 1.5 s before the end.
 */
function tidyShotEnding(shots: PrevisCameraShot[], duration: number): string[] {
  const notes: string[] = [];
  for (let i = shots.length - 1; i >= 2; i--) {
    const prev = shots[i - 1];
    if (shots[i].t <= duration - END_TIDY_SEC || shots[i].t - prev.t >= SUBJECT_SETTLE_SEC) continue;
    if (prev.subject === shots[i].subject && prev.relation !== 'hold') continue;
    notes.push(`Shot @${prev.t}s of ${prev.subject} was replaced ${shots[i].t - prev.t}s later; it was dropped.`);
    shots.splice(i - 1, 1);
  }
  const last = shots[shots.length - 1];
  if (shots.length >= 2 && last.t > duration - END_SETTLE_SEC) {
    const t = Math.max(shots[shots.length - 2].t + MIN_SHOT_GAP_SEC, Math.floor((duration - END_SETTLE_SEC) * 4) / 4);
    if (t < last.t) {
      notes.push(`Last framing moved from ${last.t}s to ${t}s so it settles before the end.`);
      last.t = t;
    }
  }
  return notes;
}

/**
 * Solve `camera.keys` from `camera.shots`. When a transition would need the camera to move faster than
 * PREVIS_CAMERA_MAX_MPS, the framing is reached later (later shots shift with it); if there is no time left
 * it becomes a `hold` (the camera stays and pans), which is what an operator would do.
 * No-op when the plan has no shots or the shots reference unknown characters. Returns notes on changes.
 * `autoFix: false` (top-down editor) only solves the keys: hand-placed shots are never retargeted or moved.
 */
export function solvePrevisCameraShots(plan: PrevisPlan, opts: { autoFix?: boolean } = {}): string[] {
  const shots = plan.camera.shots;
  if (!shots || shots.length === 0) return [];
  if (validatePrevisCameraShots(plan).some((i) => i.level === 'error')) return [];
  shots.sort((a, b) => a.t - b.t);
  if (shots[0].t > 0) shots.unshift({ ...shots[0], t: 0 });
  if (opts.autoFix === false) {
    plan.camera.keys = smoothCameraKeys(denseCameraKeys(plan, buildSolvedShots(plan, shots)));
    return [];
  }
  const notes: string[] = retargetPrevisOverShoulderShots(plan);
  for (let round = 0; round < 2; round++) {
    const tidied = tidyShotEnding(shots, plan.durationSec);
    if (round > 0 && tidied.length === 0) break;
    notes.push(...tidied);
    fitShotsToCameraSpeed(plan, shots, notes);
  }
  // Speed decisions above use the raw keys; the final path is smoothed.
  plan.camera.keys = smoothCameraKeys(plan.camera.keys);
  return notes;
}

/** Delay framings the camera cannot reach in time, or turn them into pans when there is no time left. */
function fitShotsToCameraSpeed(plan: PrevisPlan, shots: PrevisCameraShot[], notes: string[]): void {
  for (let attempt = 0; attempt <= shots.length * 3; attempt++) {
    const solved = buildSolvedShots(plan, shots);
    plan.camera.keys = denseCameraKeys(plan, solved);
    let changed = false;
    for (let i = 0; i < shots.length - 1; i++) {
      const next = shots[i + 1];
      if (next.relation === 'hold') continue;
      const peak = peakCameraSpeed(plan.camera.keys, shots[i].t, next.t);
      if (peak <= PREVIS_CAMERA_MAX_MPS) continue;
      const span = next.t - shots[i].t;
      const from = next.t;
      if (delayShot(shots, i, Math.max(0.25, span * (peak / PREVIS_CAMERA_MAX_MPS) * 1.1 - span), plan.durationSec)) {
        notes.push(`Camera needed more time to reach the @${from}s framing; it now arrives at ${shots[i + 1].t}s.`);
      } else {
        notes.push(
          `Camera @${from}s was too far to reach in time; it keeps gliding and pans to ${next.relation === 'over_shoulder' && next.toward ? next.toward : next.subject}.`,
        );
        if (next.relation === 'over_shoulder' && next.toward) next.subject = next.toward;
        next.relation = 'hold';
        next.drift = true;
        delete next.toward;
      }
      changed = true;
      break;
    }
    if (!changed) break;
  }
}

const APART_MIN_M = 1.2;
const APART_SHIFT_M = 1.5;

/**
 * People who share a spot without touching (e.g. two people both "at the entrance") stand side by side:
 * the later character's standing spot is shifted sideways, unless that would make them walk too fast.
 */
export function nudgePrevisCharactersApart(plan: PrevisPlan): number {
  let fixes = 0;
  const hw = plan.stage.width / 2 - 0.3;
  const touching = (a: PrevisCharacter, b: PrevisCharacter, t: number) =>
    (plan.contacts ?? []).some(
      (ct) => ((ct.a === a.id && ct.b === b.id) || (ct.a === b.id && ct.b === a.id)) && Math.abs(ct.t - t) <= 1.5,
    );
  for (let j = 1; j < plan.characters.length; j++) {
    const b = plan.characters[j];
    let i = 0;
    while (i < b.path.length) {
      let k = i;
      while (k + 1 < b.path.length && Math.hypot(b.path[k + 1].x - b.path[i].x, b.path[k + 1].y - b.path[i].y) < 0.05) k++;
      const run = b.path.slice(i, k + 1);
      const spot = run[0];
      // Waiting out of view in a doorway: several people may wait in the same stairwell.
      if (plan.props.some((p) => isDoorway(p) && hiddenAt(plan, spot, p))) {
        i = k + 1;
        continue;
      }
      let other: { x: number; y: number } | null = null;
      for (const a of plan.characters.slice(0, j)) {
        for (let t = run[0].t; t <= run[run.length - 1].t + 1e-6 && !other; t += 0.5) {
          const p = samplePrevisCharacter(a, t);
          if (Math.hypot(p.x - spot.x, p.y - spot.y) < APART_MIN_M && !touching(a, b, t)) other = p;
        }
        if (other) break;
      }
      if (other) {
        const away = spot.x !== other.x ? Math.sign(spot.x - other.x) : spot.x > 0 ? -1 : 1;
        const x = Math.max(-hw, Math.min(hw, other.x + away * APART_SHIFT_M));
        const before = run.map((key) => key.x);
        for (const key of run) key.x = x;
        const fast = [i - 1, k].some((s0) => {
          const p = b.path[s0];
          const q = b.path[s0 + 1];
          if (!p || !q || q.t <= p.t) return false;
          return Math.hypot(q.x - p.x, q.y - p.y) / (q.t - p.t) > PREVIS_WALK_COMFORT_MPS;
        });
        if (fast) run.forEach((key, n) => (key.x = before[n]));
        else fixes++;
      }
      i = k + 1;
    }
  }
  return fixes;
}

/** Words that put the camera on a side ("左侧 / 右后方 / 从她左边"); "左右看看" (looks around) is not one. */
const SIDE_WORDS_RE = /(?<![左右])[左右](?![右左])(?:侧|边|后|前|肩|方)|\b(?:on|from|to) (?:her|his|their|the) (?:left|right)\b|\b(?:left|right)[- ]side\b|cross(?:es)? over|越轴/i;

/**
 * Same person, consecutive shots, sides flipped although the text for that second names no side: keep the
 * previous side (staying on one side of the action instead of crossing in front of the person).
 */
export function keepPrevisShotSides(plan: PrevisPlan, story: string): number {
  const shots = [...(plan.camera.shots ?? [])].sort((x, y) => x.t - y.t);
  const segments = storySegments(story, plan.durationSec);
  let fixes = 0;
  let side: 'left' | 'right' | undefined;
  let subject: string | undefined;
  for (const shot of shots) {
    if (shot.relation === 'hold') continue;
    if (shot.subject === subject && side && shot.side && shot.side !== side) {
      const seg = segments.find((sg) => shot.t >= sg.from - 0.01 && shot.t <= sg.to + 0.01) ?? segments[segments.length - 1];
      if (!SIDE_WORDS_RE.test(seg?.text ?? '')) {
        shot.side = side;
        fixes++;
      }
    }
    subject = shot.subject;
    side = shot.side ?? side;
  }
  return fixes;
}

const CAMERA_STILL_RE = /原地|不动|固定|静止|定住|stays? still|static|locked[- ]off|holds? still/i;

/**
 * Holds glide with the previous framing while they pan, unless the text for that second keeps the camera
 * still (原地 / 不动 / static): a frozen camera mid-take reads as a pause.
 */
export function markPrevisHoldsDrift(plan: PrevisPlan, story: string): number {
  const segments = storySegments(story, plan.durationSec);
  let marked = 0;
  for (const shot of plan.camera.shots ?? []) {
    if (shot.relation !== 'hold' || shot.drift !== undefined) continue;
    const seg = segments.find((sg) => shot.t >= sg.from - 0.01 && shot.t <= sg.to + 0.01) ?? segments[segments.length - 1];
    if (CAMERA_STILL_RE.test(seg?.text ?? '')) continue;
    shot.drift = true;
    marked++;
  }
  return marked;
}

/** Pull character keys back inside the stage (models sometimes place "far" people beyond the set). */
export function nudgePrevisCharactersIntoStage(plan: PrevisPlan): number {
  const hw = plan.stage.width / 2 - 0.3;
  const hd = plan.stage.depth / 2 - 0.3;
  let fixes = 0;
  for (const p of plan.props) {
    if (p.fixed) continue;
    const x = Math.max(-plan.stage.width / 2 + p.w / 2, Math.min(plan.stage.width / 2 - p.w / 2, p.x));
    const y = Math.max(-plan.stage.depth / 2 + p.d / 2, Math.min(plan.stage.depth / 2 - p.d / 2, p.y));
    if (x !== p.x || y !== p.y) fixes++;
    p.x = x;
    p.y = y;
  }
  for (const c of plan.characters) {
    for (const k of c.path) {
      const out = edgeDoorNear(plan, k) ? DOOR_OUTSIDE_M + 0.3 : 0;
      const x = Math.max(-hw - out, Math.min(hw + out, k.x));
      const y = Math.max(-hd - out, Math.min(hd + out, k.y));
      if (x !== k.x || y !== k.y) {
        k.x = x;
        k.y = y;
        fixes++;
      }
    }
  }
  return fixes;
}

/** Camera markers for maps and prompt drafts: one per shot when shots exist, otherwise the raw keys. */
export function listPrevisCameraMarks(plan: PrevisPlan): Array<{ t: number; x: number; y: number; h: number; move?: string }> {
  const shots = plan.camera.shots;
  if (shots && shots.length > 0 && plan.camera.keys.length > 0) {
    return shots.map((s) => {
      const p = samplePrevisCamera(plan, s.t).position;
      return { t: s.t, x: p.x, y: p.y, h: p.h, move: s.move };
    });
  }
  return plan.camera.keys.map((k) => ({ t: k.t, x: k.x, y: k.y, h: k.h, move: k.move }));
}

/** Plan as sent back to the model (smart revise / repair): solved dense keys are dropped when shots exist. */
export function previsPlanForModel(plan: PrevisPlan): PrevisPlan {
  if (!plan.camera.shots || plan.camera.shots.length === 0) return plan;
  return { ...plan, camera: { fovDeg: plan.camera.fovDeg, keys: [], shots: plan.camera.shots } };
}

const CAMERA_CLEARANCE_M = 1.3;
const NUDGE_WALK_MPS = 1.5;
const NUDGE_RUN_MPS = 2.2;

/**
 * Shorten walks that would need running: scale the move down to a natural pace and shift the
 * character's later keys by the same offset (relative blocking afterwards is kept). Mutates `plan`.
 */
export function nudgePrevisCharacterSpeeds(plan: PrevisPlan, opts: { runners?: ReadonlySet<string> } = {}): number {
  let fixes = 0;
  for (const c of plan.characters) {
    // People the text has run (跑 / run) may go up to running pace.
    const runner = opts.runners?.has(c.id) ?? false;
    const limit = runner ? PREVIS_RUN_MPS : PREVIS_WALK_COMFORT_MPS;
    const target = runner ? NUDGE_RUN_MPS : NUDGE_WALK_MPS;
    for (let i = 0; i < c.path.length - 1; i++) {
      const a = c.path[i];
      const b = c.path[i + 1];
      const dt = b.t - a.t;
      if (dt <= 0 || isPrevisRiding(plan, c.id, (a.t + b.t) / 2)) continue;
      const dist = Math.hypot(b.x - a.x, b.y - a.y);
      if (dist / dt <= limit) continue;
      const scale = (target * dt) / dist;
      const nx = a.x + (b.x - a.x) * scale;
      const ny = a.y + (b.y - a.y) * scale;
      const dx = nx - b.x;
      const dy = ny - b.y;
      for (let j = i + 1; j < c.path.length; j++) {
        c.path[j].x += dx;
        c.path[j].y += dy;
      }
      fixes++;
    }
  }
  return fixes;
}

/** A street-to-interior stage (the building facade is a fixed wall with a doorway gap). */
function isWalkInStage(plan: PrevisPlan): boolean {
  return plan.props.some((p) => p.fixed && p.id === 'facade_wall_l') && plan.props.some((p) => p.fixed && p.id === 'facade_wall_r');
}

/** Time a character must still stand at a key after a walk is retimed into the hold that follows (s). */
const RETIME_KEEP_HOLD_SEC = 0.5;
/** Slower than this between two keys counts as standing (a small shift on the spot), not walking (m/s). */
const RETIME_STAND_MPS = 0.25;

/**
 * Walks that would need more than running pace (the story pinned where they start and end) get more time instead of a
 * shorter route. A walk is the run of keys between two stands (routes around furniture and through doorways add keys
 * along it): it may end later, into the stand that follows (or toward the end of the take after the last key), and its
 * keys are then spread evenly along the route. It never starts earlier (the story's order of events stays). Positions
 * stay. Only walks with a step over running pace are touched; a walk whose time span would cross one of their contacts
 * is left as it is. Mutates `plan`.
 */
export function retimePrevisFastWalks(plan: PrevisPlan, opts: { runners?: ReadonlySet<string> } = {}): number {
  let fixes = 0;
  const gap = (p: { x: number; y: number }, q: { x: number; y: number }) => Math.hypot(q.x - p.x, q.y - p.y);
  for (const c of plan.characters) {
    const target = opts.runners?.has(c.id) ? NUDGE_RUN_MPS : NUDGE_WALK_MPS;
    const path = c.path;
    // Standing (or barely shifting on the spot) between two keys.
    const stands = (k: number) => {
      const dt = path[k + 1].t - path[k].t;
      const d = gap(path[k], path[k + 1]);
      return d < 0.05 || (dt > 0 && d / dt < RETIME_STAND_MPS);
    };
    let i = 0;
    while (i < path.length - 1) {
      if (stands(i)) {
        i++;
        continue;
      }
      let j = i + 1;
      while (j < path.length - 1 && !stands(j)) j++;
      // Keys i..j are one walk.
      let dist = 0;
      let tooFast = false;
      let riding = false;
      for (let k = i; k < j; k++) {
        const d = gap(path[k], path[k + 1]);
        const dt = path[k + 1].t - path[k].t;
        dist += d;
        if (dt <= 0 || d / dt > PREVIS_RUN_MPS) tooFast = true;
        if (isPrevisRiding(plan, c.id, (path[k].t + path[k + 1].t) / 2)) riding = true;
      }
      if (tooFast && !riding) {
        const span = path[j].t - path[i].t;
        const need = Math.max(0, dist / target - span);
        const next = path[j + 1];
        const after = !next ? plan.durationSec - path[j].t : next.t - path[j].t - RETIME_KEEP_HOLD_SEC;
        const from = path[i].t;
        const to = path[j].t + Math.min(need, Math.max(0, after));
        const crossesContact = (plan.contacts ?? []).some((k) => (k.a === c.id || k.b === c.id) && k.t >= from && k.t <= to);
        if (!crossesContact && to - from > 0.05) {
          let walked = 0;
          path[i].t = Math.round(from * 100) / 100;
          for (let k = i + 1; k <= j; k++) {
            walked += gap(path[k - 1], path[k]);
            path[k].t = Math.round((from + ((to - from) * walked) / dist) * 100) / 100;
          }
          fixes++;
        }
      }
      i = j;
    }
  }
  return fixes;
}

function findFirstCameraCollision(plan: PrevisPlan): { t: number; x: number; y: number } | null {
  for (let t = 0; t <= plan.durationSec + 1e-6; t += 0.25) {
    const cam = samplePrevisCamera(plan, t).position;
    if (cam.h > PREVIS_CHARACTER_HEAD_H + 0.25) continue;
    for (const c of plan.characters) {
      const p = samplePrevisCharacter(c, t);
      if (Math.hypot(cam.x - p.x, cam.y - p.y) < PREVIS_CAMERA_COLLISION_M) return { t: Math.round(t * 100) / 100, x: p.x, y: p.y };
    }
  }
  return null;
}

function pushAway(fromX: number, fromY: number, x: number, y: number, dist: number): { x: number; y: number } {
  const dx = x - fromX;
  const dy = y - fromY;
  const d = Math.hypot(dx, dy);
  const [ux, uy] = d > 1e-3 ? [dx / d, dy / d] : [0, -1];
  return { x: fromX + ux * dist, y: fromY + uy * dist };
}

/**
 * Deterministic camera clean-up (geometry the model cannot see): keys too close to their subject are pushed
 * back to 1 m, and where the smoothed path cuts through a figure an avoidance key is inserted 1 m away.
 * Mutates `plan`; returns the number of fixes.
 */
const CAMERA_KEY_MAX_MPS = 2.5;

/**
 * Camera keys written by the model: keep every key inside the stage and limit the average speed between
 * keys; a key the camera cannot reach in time is pulled toward the previous one (it arrives short / late).
 */
export function limitPrevisCameraKeys(plan: PrevisPlan, maxMps = CAMERA_KEY_MAX_MPS): number {
  let fixes = 0;
  const keys = plan.camera.keys;
  const hw = plan.stage.width / 2 - 0.2;
  const hd = plan.stage.depth / 2 - 0.2;
  for (const k of keys) {
    const x = Math.max(-hw, Math.min(hw, k.x));
    const y = Math.max(-hd, Math.min(hd, k.y));
    if (x !== k.x || y !== k.y) fixes++;
    k.x = x;
    k.y = y;
  }
  for (let i = 1; i < keys.length; i++) {
    const a = keys[i - 1];
    const b = keys[i];
    const dt = b.t - a.t;
    if (dt <= 0) continue;
    const d = Math.hypot(b.x - a.x, b.y - a.y, b.h - a.h);
    const max = maxMps * dt;
    if (d <= max) continue;
    const w = max / d;
    b.x = a.x + (b.x - a.x) * w;
    b.y = a.y + (b.y - a.y) * w;
    b.h = a.h + (b.h - a.h) * w;
    fixes++;
  }
  return fixes;
}

export function nudgePrevisCameraClear(plan: PrevisPlan, maxIterations = 12): number {
  let fixes = 0;
  const keys = plan.camera.keys;
  const hw = plan.stage.width / 2;
  const hd = plan.stage.depth / 2;
  const clampToStage = (k: PrevisCameraKey) => {
    k.x = Math.max(-hw, Math.min(hw, k.x));
    k.y = Math.max(-hd, Math.min(hd, k.y));
  };
  for (let iter = 0; iter < maxIterations; iter++) {
    let changed = false;
    for (const k of keys) {
      if (typeof k.lookAt !== 'string') continue;
      const subject = plan.characters.find((c) => c.id === k.lookAt);
      if (!subject) continue;
      const p = samplePrevisCharacter(subject, k.t);
      if (Math.hypot(k.x - p.x, k.y - p.y) < PREVIS_CAMERA_MIN_SUBJECT_M) {
        Object.assign(k, pushAway(p.x, p.y, k.x, k.y, CAMERA_CLEARANCE_M));
        clampToStage(k);
        changed = true;
        fixes++;
      }
    }
    const hit = findFirstCameraCollision(plan);
    if (hit) {
      const cam = samplePrevisCamera(plan, hit.t);
      const target = pushAway(hit.x, hit.y, cam.position.x, cam.position.y, CAMERA_CLEARANCE_M);
      const existing = keys.find((k) => Math.abs(k.t - hit.t) < 0.05);
      if (existing) {
        Object.assign(existing, target);
        clampToStage(existing);
      } else {
        let before = keys[0];
        for (const k of keys) if (k.t < hit.t) before = k;
        const inserted: PrevisCameraKey = { t: hit.t, ...target, h: cam.position.h, lookAt: before.lookAt, lookAtH: before.lookAtH };
        clampToStage(inserted);
        keys.push(inserted);
        keys.sort((a, b) => a.t - b.t);
      }
      changed = true;
      fixes++;
    }
    if (!changed) break;
  }
  return fixes;
}

/** Ordered beats, falling back to character actions when the plan has no beats. */
export function listPrevisBeats(plan: PrevisPlan): PrevisBeat[] {
  if (plan.beats && plan.beats.length > 0) return [...plan.beats].sort((a, b) => a.t - b.t);
  const out: PrevisBeat[] = [];
  for (const c of plan.characters) {
    for (const k of c.path) if (k.action) out.push({ t: k.t, text: `${c.name}: ${k.action}` });
  }
  return out.sort((a, b) => a.t - b.t);
}

export const PREVIS_PLAN_BLOCK_OPEN = '[PREVIS_PLAN_JSON]';
export const PREVIS_PLAN_BLOCK_CLOSE = '[/PREVIS_PLAN_JSON]';

function extractJsonText(reply: string): string {
  const open = reply.indexOf(PREVIS_PLAN_BLOCK_OPEN);
  if (open >= 0) {
    const close = reply.indexOf(PREVIS_PLAN_BLOCK_CLOSE, open);
    return reply.slice(open + PREVIS_PLAN_BLOCK_OPEN.length, close >= 0 ? close : undefined).trim();
  }
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(reply);
  if (fenced) return fenced[1].trim();
  const first = reply.indexOf('{');
  const last = reply.lastIndexOf('}');
  if (first >= 0 && last > first) return reply.slice(first, last + 1);
  return reply.trim();
}

function num(v: unknown, field: string): number {
  const n = typeof v === 'string' ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isFinite(n)) throw new Error(`Invalid number for ${field}.`);
  return n;
}

function optNum(v: unknown, fallback: number): number {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : fallback;
}

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function rec(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function normalizePoint(v: unknown, field: string): PrevisPoint3 {
  const o = rec(v);
  return { x: num(o.x, `${field}.x`), y: num(o.y, `${field}.y`), h: optNum(o.h, 1.3) };
}

/** Script markup is not part of a name: `@@公爵【】` → `公爵`. */
export function normalizePrevisCharacterName(raw: string): string {
  return raw.replace(/@@/g, '').replace(/【[^】]*】?/g, '').trim();
}

const RELATION_ALIASES: Record<string, PrevisCameraRelation> = {
  follow: 'behind',
  back: 'behind',
  rear: 'behind',
  side_behind: 'back_side',
  behind_side: 'back_side',
  rear_side: 'back_side',
  back_three_quarter: 'back_side',
  side_front: 'front_side',
  three_quarter: 'front_side',
  front_three_quarter: 'front_side',
  lead: 'front',
  ots: 'over_shoulder',
  over_the_shoulder: 'over_shoulder',
  static: 'hold',
  pan: 'hold',
  fixed: 'hold',
};

function normalizeRelation(v: unknown): PrevisCameraRelation {
  const s = str(v).trim().toLowerCase().replace(/[\s-]+/g, '_');
  return (PREVIS_CAMERA_RELATIONS as readonly string[]).includes(s)
    ? (s as PrevisCameraRelation)
    : RELATION_ALIASES[s] ?? (s as PrevisCameraRelation);
}

function wrapDeg180(d: number): number {
  return ((((d + 180) % 360) + 360) % 360) - 180;
}

function pick<T extends string>(v: unknown, allowed: readonly T[]): T | undefined {
  const s = str(v).trim().toLowerCase();
  return (allowed as readonly string[]).includes(s) ? (s as T) : undefined;
}

const PROP_KIND_WORDS: Array<[PrevisPropKind, RegExp]> = [
  ['stairwell', /楼梯间|楼梯口|天台门|出入口小屋|stairwell|roof access|stair (?:hut|house)/i],
  ['stairs', /楼梯|台阶|阶梯|stairs?|staircase|steps/i],
  ['door', /门|入口|出口|door|doorway|entrance|exit|gate/i],
  ['railing', /栏杆|扶手|护栏|railing|handrail|balustrade/i],
  ['low_wall', /矮墙|女儿墙|围墙|墙|parapet|low wall|wall/i],
  ['desk', /办公桌|书桌|写字台|desk/i],
  ['table', /桌|餐台|table/i],
  ['sofa', /沙发|长椅|sofa|couch|bench/i],
  ['chair', /椅|凳|chair|stool|\bseat\b/i],
  ['bed', /床|\bbed\b/i],
  ['counter', /柜台|吧台|收银台|前台|counter|\bbar\b|reception/i],
  ['shelf', /书架|书柜|柜子|货架|衣柜|shelf|bookcase|cabinet|wardrobe/i],
  ['pillar', /柱|pillar|column/i],
  ['window', /窗|window/i],
  ['car', /汽车|轿车|车辆|\b(?:car|truck|van)\b/i],
  ['tree', /树|\btrees?\b/i],
];

/** Prop kind from the planner, else guessed from its label ("楼梯口" → stairwell); plain block otherwise. */
export function inferPrevisPropKind(label: string, kind?: unknown): PrevisPropKind {
  const k = typeof kind === 'string' ? kind.trim().toLowerCase().replace(/[\s-]+/g, '_') : '';
  if ((PREVIS_PROP_KINDS as readonly string[]).includes(k)) return k as PrevisPropKind;
  for (const [kindId, re] of PROP_KIND_WORDS) if (re.test(label)) return kindId;
  return 'box';
}

function normalizeSet(raw: unknown): PrevisSet | undefined {
  const r = rec(raw);
  const kind = pick(r.kind, ['indoor', 'outdoor'] as const);
  if (!kind) return undefined;
  const description = str(r.description).replace(/\s+/g, ' ').trim().slice(0, 240);
  const set: PrevisSet = description ? { kind, description } : { kind };
  // Validated by previsWorldPlan (normalizePrevisWorldRef) where it is created; kept as plain data here.
  if (r.world && typeof r.world === 'object' && (r.world as { schemaVersion?: unknown }).schemaVersion === 1) {
    set.world = JSON.parse(JSON.stringify(r.world)) as PrevisWorldRef;
  }
  return set;
}

/** Coerce parsed JSON into a `PrevisPlan`; throws with a field name when an essential value is missing. */
const MAX_VEHICLES = 6;
const VEHICLE_MAX_ALT_M = 400;

export function normalizePrevisPlan(raw: unknown): PrevisPlan {
  const o = rec(raw);
  const stage = rec(o.stage);
  const props: PrevisProp[] = arr(o.props).map((p, i) => {
    const r = rec(p);
    const label = str(r.label, str(r.id, `Prop ${i + 1}`));
    const facing = optNum(r.facing, NaN);
    return {
      id: str(r.id, `prop${i + 1}`),
      label,
      kind: inferPrevisPropKind(label, r.kind),
      x: num(r.x, `props[${i}].x`),
      y: num(r.y, `props[${i}].y`),
      w: optNum(r.w, 1),
      d: optNum(r.d, 1),
      h: optNum(r.h, 0.8),
      ...(Number.isFinite(facing) ? { facing: ((facing % 360) + 360) % 360 } : {}),
      color: typeof r.color === 'string' ? r.color : undefined,
      ...(r.fixed === true ? { fixed: true } : {}),
      ...(typeof r.worldId === 'string' && r.worldId ? { worldId: r.worldId.slice(0, 40) } : {}),
    };
  });
  const set = normalizeSet(o.set);
  const ref = (v: unknown) => normalizePrevisCharacterName(str(v));
  const characters: PrevisCharacter[] = arr(o.characters).map((c, i) => {
    const r = rec(c);
    const id = ref(r.id) || `c${i + 1}`;
    return {
      id,
      name: ref(r.name) || id,
      color: str(r.color, 'gray'),
      path: arr(r.path)
        .map((k, j) => {
          const kr = rec(k);
          return {
            t: num(kr.t, `characters[${i}].path[${j}].t`),
            x: num(kr.x, `characters[${i}].path[${j}].x`),
            y: num(kr.y, `characters[${i}].path[${j}].y`),
            action: typeof kr.action === 'string' && kr.action.trim() ? kr.action.trim() : undefined,
            facing: typeof kr.facing === 'number' && Number.isFinite(kr.facing) ? kr.facing : undefined,
            ...(kr.byHand === true ? { byHand: true } : {}),
          };
        })
        .sort((a, b) => a.t - b.t),
    };
  });
  const camera = rec(o.camera);
  const keys: PrevisCameraKey[] = arr(camera.keys)
    .map((k, i) => {
      const r = rec(k);
      const lookAt = typeof r.lookAt === 'string' ? ref(r.lookAt) : normalizePoint(r.lookAt, `camera.keys[${i}].lookAt`);
      return {
        t: num(r.t, `camera.keys[${i}].t`),
        x: num(r.x, `camera.keys[${i}].x`),
        y: num(r.y, `camera.keys[${i}].y`),
        h: optNum(r.h, 1.6),
        lookAt,
        lookAtH: typeof r.lookAtH === 'number' ? r.lookAtH : undefined,
        move: typeof r.move === 'string' && r.move.trim() ? r.move.trim() : undefined,
        ...(typeof r.yawDeg === 'number' && Number.isFinite(r.yawDeg) && wrapDeg180(r.yawDeg) !== 0
          ? { yawDeg: wrapDeg180(r.yawDeg) }
          : {}),
        ...(typeof r.fovDeg === 'number' && Number.isFinite(r.fovDeg) ? { fovDeg: Math.min(90, Math.max(8, r.fovDeg)) } : {}),
        ...(typeof r.rollDeg === 'number' && Number.isFinite(r.rollDeg) && r.rollDeg !== 0
          ? { rollDeg: Math.max(-45, Math.min(45, r.rollDeg)) }
          : {}),
        ...(r.byHand === true ? { byHand: true } : {}),
      };
    })
    .sort((a, b) => a.t - b.t);
  const beats = arr(o.beats)
    .map((b) => {
      const r = rec(b);
      return { t: optNum(r.t, NaN), text: str(r.text).trim() };
    })
    .filter((b) => Number.isFinite(b.t) && b.text);
  const shots: PrevisCameraShot[] = arr(camera.shots)
    .map((s, i) => {
      const r = rec(s);
      const side = pick(r.side, ['left', 'right'] as const);
      const toward = ref(r.toward);
      const distance = pick(r.distance, ['close', 'medium', 'far'] as const);
      const height = pick(r.height, ['floor', 'low', 'eye', 'high', 'crane'] as const);
      const aim = pick(r.aim, ['feet', 'body', 'face'] as const);
      const move = str(r.move).trim();
      const angleDeg = optNum(r.angleDeg, NaN);
      const distM = optNum(r.distM, NaN);
      const heightM = optNum(r.heightM, NaN);
      const yawDeg = optNum(r.yawDeg, NaN);
      const fovDeg = optNum(r.fovDeg, NaN);
      const rollDeg = optNum(r.rollDeg, NaN);
      const idOf = (v: unknown) => {
        const id = str(v).trim().toLowerCase();
        return id && /^[a-z0-9-]{2,60}$/.test(id) ? id : '';
      };
      const technique = idOf(r.technique);
      const size = idOf(r.size);
      const angle = idOf(r.angle);
      const composition = idOf(r.composition);
      return {
        ...(technique ? { technique } : {}),
        ...(size ? { size } : {}),
        ...(angle ? { angle } : {}),
        ...(composition ? { composition } : {}),
        ...(Number.isFinite(fovDeg) ? { fovDeg: Math.min(90, Math.max(8, fovDeg)) } : {}),
        ...(Number.isFinite(rollDeg) && rollDeg !== 0 ? { rollDeg: Math.max(-45, Math.min(45, rollDeg)) } : {}),
        t: num(r.t, `camera.shots[${i}].t`),
        subject: ref(r.subject),
        relation: normalizeRelation(r.relation),
        ...(side ? { side } : {}),
        ...(toward ? { toward } : {}),
        ...(distance ? { distance } : {}),
        ...(height ? { height } : {}),
        ...(aim ? { aim } : {}),
        ...(move ? { move } : {}),
        ...(Number.isFinite(angleDeg) && Number.isFinite(distM)
          ? { angleDeg: wrapDeg180(angleDeg), distM: Math.min(12, Math.max(0.8, distM)) }
          : Number.isFinite(distM)
            ? { distM: Math.min(12, Math.max(0.8, distM)) }
            : {}),
        ...(Number.isFinite(heightM) ? { heightM: Math.min(5, Math.max(0.2, heightM)) } : {}),
        ...(Number.isFinite(yawDeg) && wrapDeg180(yawDeg) !== 0 ? { yawDeg: wrapDeg180(yawDeg) } : {}),
      };
    })
    .sort((a, b) => a.t - b.t);
  const contacts: PrevisContact[] = arr(o.contacts)
    .map((c) => {
      const r = rec(c);
      const what = str(r.what).trim();
      return { t: optNum(r.t, NaN), a: ref(r.a), b: ref(r.b), ...(what ? { what } : {}) };
    })
    .filter((c) => Number.isFinite(c.t) && c.a && c.b);
  const vehicles: PrevisVehicle[] = arr(o.vehicles)
    .slice(0, MAX_VEHICLES)
    .map((v, i) => {
      const r = rec(v);
      const id = ref(r.id) || `v${i + 1}`;
      const kind = pick(r.kind, PREVIS_VEHICLE_KINDS) ?? 'car';
      const path = arr(r.path)
        .map((k) => {
          const kr = rec(k);
          const t = optNum(kr.t, NaN);
          const x = optNum(kr.x, NaN);
          const y = optNum(kr.y, NaN);
          const alt = optNum(kr.alt, 0);
          return { t, x, y, ...(alt > 0 ? { alt: Math.min(VEHICLE_MAX_ALT_M, alt) } : {}) };
        })
        .filter((k) => Number.isFinite(k.t) && Number.isFinite(k.x) && Number.isFinite(k.y))
        .sort((p1, p2) => p1.t - p2.t)
        .slice(0, 60);
      return { id, name: ref(r.name) || id, kind, ...(typeof r.color === 'string' ? { color: r.color } : {}), path };
    })
    .filter((v) => v.path.length > 0);
  const vehicleIds = new Set(vehicles.map((v) => v.id));
  const rides: PrevisRide[] = arr(o.rides)
    .slice(0, 24)
    .map((x) => {
      const r = rec(x);
      const to = optNum(r.to, NaN);
      return { who: ref(r.who), vehicle: ref(r.vehicle), from: optNum(r.from, NaN), ...(Number.isFinite(to) ? { to } : {}) };
    })
    .filter((r) => r.who && vehicleIds.has(r.vehicle) && Number.isFinite(r.from) && (r.to === undefined || r.to > r.from));

  return {
    version: 1,
    title: typeof o.title === 'string' ? o.title : undefined,
    durationSec: num(o.durationSec, 'durationSec'),
    stage: { width: optNum(stage.width, 14), depth: optNum(stage.depth, 18) },
    ...(set ? { set } : {}),
    props,
    characters,
    camera: {
      fovDeg: typeof camera.fovDeg === 'number' ? camera.fovDeg : undefined,
      keys,
      ...(shots.length > 0 ? { shots } : {}),
    },
    ...(contacts.length > 0 ? { contacts } : {}),
    beats: beats.length > 0 ? beats : undefined,
    ...(vehicles.length > 0 ? { vehicles } : {}),
    ...(rides.length > 0 ? { rides } : {}),
  };
}

export function parsePrevisPlanFromText(text: string): PrevisPlan {
  const jsonText = extractJsonText(text);
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error('The plan is not valid JSON.');
  }
  return normalizePrevisPlan(parsed);
}
