/**
 * New 3D Director Studio look: soft models with three low-saturation families — city greys, pale blue
 * (some buildings, shop glass, cars) and pale green (plants) — plus shadows; figures in low-saturation colours.
 * Styled worlds swap the blue for a warm grey (wood / plaster) and use dirt or stone road surfaces.
 */
export const DS3D_BACKGROUND = '#d9dcdf';
export const DS3D_PRIMARY = '#a3e635';

export const DS3D_COLORS = {
  ground: '#dcdcd8',
  road: '#b8babc',
  sidewalk: '#d2d3d1',
  building: '#e4e4e1',
  buildingBlue: '#d3dbe2',
  glass: '#b7c6d2',
  car: '#c9d3dc',
  metal: '#a7aaad',
  plant: '#c2d0b6',
  park: '#d2dccb',
  trunk: '#a9a59c',
  buildingWarm: '#e2dcd1',
  roof: '#adb1b4',
  shopOpen: '#b8b2a8',
  paper: '#ece7dc',
  dirt: '#d6cfc3',
  stone: '#cdcdc8',
  /** Castle bases, temple platforms. */
  masonry: '#bdbbb4',
  /** Torii (muted vermilion). */
  torii: '#b98e86',
  /** Grassy hills. */
  hill: '#c8d2bd',
  /** Rivers, canals, the sea (muted blue-grey). */
  water: '#aebfc8',
} as const;

const FIGURE_MUTED: Record<string, string> = {
  red: '#b5706b',
  blue: '#6f87ad',
  yellow: '#bda162',
  green: '#7f9a78',
  purple: '#8f7aa6',
  orange: '#c0875e',
  pink: '#b98aa0',
  cyan: '#6fa1a6',
  brown: '#8c735e',
  white: '#d8d6d0',
  black: '#55575c',
  gray: '#9a9a9a',
  grey: '#9a9a9a',
};

export function ds3dFigureHex(color: string): string {
  return FIGURE_MUTED[String(color || '').trim().toLowerCase()] ?? FIGURE_MUTED.gray;
}

/** About one building in three is pale blue (stable per id). */
export function ds3dBuildingIsBlue(id: string): boolean {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h % 3 === 0;
}

/** Facade shade 0–2 (stable per id, independent of the blue pick) so neighbours differ in brightness. */
export function ds3dBuildingShade(id: string): 0 | 1 | 2 {
  let h = 7;
  for (let i = 0; i < id.length; i++) h = (h * 131 + id.charCodeAt(i)) >>> 0;
  return (h % 3) as 0 | 1 | 2;
}
