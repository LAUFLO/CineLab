/**
 * 3D Director motion between keyframes. Smooth: a curve through every key (Catmull-Rom tangents in time, at rest at the
 * first / last key and wherever the character stands still), so a walk with a turn becomes an arc. Linear: straight
 * segments at constant speed with hard corners. Client rendering only; the planner's checks keep their own sampling.
 */
import { samplePrevisCharacter, type PrevisCharacter } from './plan-core';

type Pt = { x: number; y: number };

/** Keys closer than this (m) are the same spot: the character stands there. */
const STILL_M = 0.05;
/** Longest tangent, as a share of the segment it bends (keeps the curve from overshooting short legs). */
const MAX_TANGENT_SHARE = 1.2;

function tangentAt(path: PrevisCharacter['path'], i: number): Pt {
  if (i <= 0 || i >= path.length - 1) return { x: 0, y: 0 };
  const a = path[i - 1];
  const k = path[i];
  const b = path[i + 1];
  if (Math.hypot(k.x - a.x, k.y - a.y) < STILL_M || Math.hypot(b.x - k.x, b.y - k.y) < STILL_M) return { x: 0, y: 0 };
  const dt = b.t - a.t;
  if (dt <= 0) return { x: 0, y: 0 };
  return { x: (b.x - a.x) / dt, y: (b.y - a.y) / dt };
}

function hermite(p0: number, p1: number, m0: number, m1: number, u: number): number {
  const u2 = u * u;
  const u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * p0 + (u3 - 2 * u2 + u) * m0 + (-2 * u3 + 3 * u2) * p1 + (u3 - u2) * m1;
}

function capped(m: Pt, span: number, chord: number): Pt {
  const len = Math.hypot(m.x, m.y) * span;
  const max = chord * MAX_TANGENT_SHARE;
  if (len <= max || len === 0) return { x: m.x * span, y: m.y * span };
  const k = max / len;
  return { x: m.x * span * k, y: m.y * span * k };
}

/** Position on the smooth curve through the character's keys at `t` (held before the first / after the last key). */
export function samplePrevisPathSmooth(character: PrevisCharacter, t: number): Pt {
  const path = character.path;
  if (path.length === 0) return { x: 0, y: 0 };
  if (t <= path[0].t) return { x: path[0].x, y: path[0].y };
  const last = path[path.length - 1];
  if (t >= last.t) return { x: last.x, y: last.y };
  let i = 0;
  while (i < path.length - 2 && t > path[i + 1].t) i++;
  const a = path[i];
  const b = path[i + 1];
  const span = b.t - a.t;
  if (span <= 0) return { x: b.x, y: b.y };
  const chord = Math.hypot(b.x - a.x, b.y - a.y);
  if (chord < STILL_M) return { x: a.x, y: a.y };
  const u = (t - a.t) / span;
  const m0 = capped(tangentAt(path, i), span, chord);
  const m1 = capped(tangentAt(path, i + 1), span, chord);
  return { x: hermite(a.x, b.x, m0.x, m1.x, u), y: hermite(a.y, b.y, m0.y, m1.y, u) };
}

/** Position at `t`: on the smooth curve, or straight between keys. */
export function samplePrevisPath(character: PrevisCharacter, t: number, smooth: boolean): Pt {
  return smooth ? samplePrevisPathSmooth(character, t) : samplePrevisCharacter(character, t);
}

/** Walking direction (radians, 0 = +y) on the smooth curve at `t`, or null while standing still. */
export function samplePrevisPathSmoothHeading(character: PrevisCharacter, t: number): number | null {
  const dt = 0.05;
  const a = samplePrevisPathSmooth(character, t - dt);
  const b = samplePrevisPathSmooth(character, t + dt);
  if (Math.hypot(b.x - a.x, b.y - a.y) < 0.02) return null;
  return Math.atan2(b.x - a.x, b.y - a.y);
}

/** Points along the drawn path line: the curve sampled every `stepSec`, or the keys themselves when linear. */
export function previsPathLine(character: PrevisCharacter, smooth: boolean, stepSec = 0.1): Pt[] {
  const path = character.path;
  if (!smooth || path.length < 3) return path.map((k) => ({ x: k.x, y: k.y }));
  const out: Pt[] = [];
  const end = path[path.length - 1].t;
  for (let t = path[0].t; t < end; t += stepSec) out.push(samplePrevisPathSmooth(character, t));
  out.push({ x: path[path.length - 1].x, y: path[path.length - 1].y });
  return out;
}
