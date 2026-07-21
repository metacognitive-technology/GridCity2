/** Shared road / lane dimensions for 64px tiles (scaled +30% from original art). */
export const LANE_SIZE_SCALE = 1.3;

export const TILE_PX = 64;
export const TILE_CENTER = TILE_PX / 2;

const BASE_ROAD_WIDTH_1L = 12;
const BASE_ROAD_WIDTH_2L = 24;
const BASE_ROAD_WIDTH_4L = 40;
const BASE_DIVIDER_OFFSET = 11;
const BASE_RAIL_INSET = 10;
const BASE_BRIDGE_PILLAR_OFFSET = 16;
const BASE_LANE_OFFSET_UNIT = 6;
export const ROAD_WIDTH_1L = BASE_ROAD_WIDTH_1L * LANE_SIZE_SCALE;
export const ROAD_WIDTH_2L = BASE_ROAD_WIDTH_2L * LANE_SIZE_SCALE;
export const ROAD_WIDTH_4L = BASE_ROAD_WIDTH_4L * LANE_SIZE_SCALE;

export const ROAD_INSET_1L = (TILE_PX - ROAD_WIDTH_1L) / 2;
export const ROAD_INSET_2L = (TILE_PX - ROAD_WIDTH_2L) / 2;
export const ROAD_INSET_4L = (TILE_PX - ROAD_WIDTH_4L) / 2;
export const ROAD_OUTER_1L = TILE_PX - ROAD_INSET_1L;
export const ROAD_OUTER_2L = TILE_PX - ROAD_INSET_2L;
export const ROAD_OUTER_4L = TILE_PX - ROAD_INSET_4L;

export const DIVIDER_OFFSET = BASE_DIVIDER_OFFSET * LANE_SIZE_SCALE;
export const DIVIDER_LEFT = TILE_CENTER - DIVIDER_OFFSET;
export const DIVIDER_RIGHT = TILE_CENTER + DIVIDER_OFFSET;

export const RAIL_LEFT = TILE_CENTER - BASE_RAIL_INSET * LANE_SIZE_SCALE;
export const RAIL_RIGHT = TILE_CENTER + BASE_RAIL_INSET * LANE_SIZE_SCALE;

export const BRIDGE_PILLAR_LEFT = TILE_CENTER - BASE_BRIDGE_PILLAR_OFFSET * LANE_SIZE_SCALE;
export const BRIDGE_PILLAR_RIGHT = TILE_CENTER + BASE_BRIDGE_PILLAR_OFFSET * LANE_SIZE_SCALE;

/** Half-width of a 2-lane road (center to outer edge). */
export const ROAD_HALF_WIDTH = (BASE_ROAD_WIDTH_2L / 2) * LANE_SIZE_SCALE;

/** Lateral offset per lane unit (±1, ±2.5) used by vehicles and traffic controls. */
export const LANE_OFFSET_UNIT = BASE_LANE_OFFSET_UNIT * LANE_SIZE_SCALE;

/** Scale a coordinate relative to tile center. */
export function sc(value: number): number {
  return TILE_CENTER + (value - TILE_CENTER) * LANE_SIZE_SCALE;
}

export function svgN(value: number): number {
  return Math.round(value * 10) / 10;
}