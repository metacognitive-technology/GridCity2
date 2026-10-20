import { expect, test } from '@playwright/test';
import { TILE_CENTER } from '../src/roadGeometry';
import { getOneWayTravel, isOneWayTileType, oneWayKeepLane } from '../src/traffic';

/** Tangent of quadratic bezier at t (matches Tile.tsx arrow heading). */
function bezierTangent(
  p0: [number, number],
  p1: [number, number],
  p2: [number, number],
  t: number,
): { dx: number; dy: number } {
  const mt = 1 - t;
  return {
    dx: 2 * mt * (p1[0] - p0[0]) + 2 * t * (p2[0] - p1[0]),
    dy: 2 * mt * (p1[1] - p0[1]) + 2 * t * (p2[1] - p1[1]),
  };
}

test.describe('one-way lanes', () => {
  test('recognizes all one-way tile types', () => {
    expect(isOneWayTileType('road-oneway-straight')).toBe(true);
    expect(isOneWayTileType('road-oneway-bridge')).toBe(true);
    expect(isOneWayTileType('road-oneway-curve')).toBe(true);
    expect(isOneWayTileType('road-oneway-curve-reverse')).toBe(true);
    expect(isOneWayTileType('road-straight')).toBe(false);
    expect(isOneWayTileType('road-curve')).toBe(false);
  });

  test('keeps left and right lanes instead of snapping to the right-hand lane', () => {
    expect(oneWayKeepLane(1)).toBe(1);
    expect(oneWayKeepLane(-1)).toBe(-1);
    expect(oneWayKeepLane(2.5)).toBe(1);
    expect(oneWayKeepLane(-2.5)).toBe(-1);
    expect(oneWayKeepLane(0)).toBe(1);
  });
});

test.describe('one-way curve travel', () => {
  test('One-Way Cv is counter-clockwise (west→north); reverse is clockwise (south→east)', () => {
    const cv = getOneWayTravel({ type: 'road-oneway-curve', rotation: 0 });
    expect(cv).toEqual({ enterPort: 3, exitPort: 0, heading: 90 });
    const rev = getOneWayTravel({ type: 'road-oneway-curve-reverse', rotation: 0 });
    expect(rev).toEqual({ enterPort: 2, exitPort: 1, heading: 0 });
  });

  test('tile rotation rotates the one-way flow', () => {
    const cv90 = getOneWayTravel({ type: 'road-oneway-curve', rotation: 90 });
    // Local W→N becomes N→E
    expect(cv90).toEqual({ enterPort: 0, exitPort: 1, heading: 180 });
    const rev90 = getOneWayTravel({ type: 'road-oneway-curve-reverse', rotation: 90 });
    // Local S→E becomes W→S
    expect(rev90).toEqual({ enterPort: 3, exitPort: 2, heading: 90 });
  });

  test('One-Way Cv arrow bezier runs west→north (CCW)', () => {
    const p0: [number, number] = [0, TILE_CENTER];
    const p1: [number, number] = [TILE_CENTER, TILE_CENTER];
    const p2: [number, number] = [TILE_CENTER, 0];
    const start = bezierTangent(p0, p1, p2, 0);
    const end = bezierTangent(p0, p1, p2, 1);
    expect(start.dx).toBeGreaterThan(0);
    expect(end.dy).toBeLessThan(0);
  });

  test('One-Way Cv Rev arrow bezier runs south→east (CW)', () => {
    const p0: [number, number] = [TILE_CENTER, TILE_CENTER * 2];
    const p1: [number, number] = [TILE_CENTER, TILE_CENTER];
    const p2: [number, number] = [TILE_CENTER * 2, TILE_CENTER];
    const start = bezierTangent(p0, p1, p2, 0);
    const end = bezierTangent(p0, p1, p2, 1);
    expect(start.dy).toBeLessThan(0);
    expect(end.dx).toBeGreaterThan(0);
  });
});
