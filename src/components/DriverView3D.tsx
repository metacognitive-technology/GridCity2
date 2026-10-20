/**
 * First-person driver view of the grid city.
 * Canvas 2D perspective projection of tiles, buildings, trees, traffic, and vehicles.
 * Purely visual — does not capture input; drive panel / keyboard controls stay authoritative.
 */

import React, { useEffect, useRef } from 'react';
import type {
  GridData,
  GridTile,
  Person,
  TileType,
  TrafficState,
  Vehicle,
} from '../types';
import { indoorTileKey } from '../people';
import { Tile } from './Tile';
import {
  DIVIDER_LEFT,
  DIVIDER_RIGHT,
  RAIL_LEFT,
  RAIL_RIGHT,
  ROAD_INSET_2L,
  ROAD_INSET_4L,
  ROAD_OUTER_2L,
  ROAD_OUTER_4L,
  ROAD_WIDTH_2L,
  ROAD_WIDTH_4L,
  ROUNDABOUT_ISLAND_R,
  ROUNDABOUT_LANE_R,
  ROUNDABOUT_OUTER_R,
  TILE_CENTER,
  TILE_PX,
} from '../roadGeometry';
import { getVehiclePose } from '../vehicleShapes';

const TILE = 1; // world units per grid cell
/** Euclidean draw radius so the tile horizon stays constant as the camera yaws. */
const VIEW_RANGE = 16; // tiles around the camera
const EYE_HEIGHT = 0.42;
/**
 * Standing adult eyes, in the same world units as building floors.
 * First-floor windows are drawn at y 0.25–0.47; 0.32 looks through that band
 * (~1.6m). Driver pitch-down is NOT applied — that reads as a 2-storey aerial.
 */
const PERSON_EYE_HEIGHT = 0.32;
const PERSON_EYE_WALK = 0.34;
/** Slight sidewalk look-down (radians), far less than PITCH_DOWN. */
const PERSON_PITCH = 0.07;
/** Vertical FOV (radians). Keep modest — wide angles warp buildings at the frame edges. */
const FOV_CRUISE = 50 * (Math.PI / 180);
/** Extra look-down (positive = toward the road). */
const PITCH_DOWN = 15 * (Math.PI / 180);
/** Camera look-joystick limits (radians). Stick-up looks toward the horizon. */
const LOOK_YAW_MAX = 75 * (Math.PI / 180);
const LOOK_PITCH_MAX = 42 * (Math.PI / 180);
const JOY_TRAVEL_PX = 20;
const NEAR_CLIP = 0.08;
/** World-space grass sits just under tile surfaces (y = 0) so look-around has no screen-space parallax. */
const GROUND_Y = -0.03;
/** Disk radius; larger than VIEW_RANGE so the grass horizon is never a square cutoff. */
const GROUND_PLANE_RADIUS = 48;
const CAM_SMOOTH = 0.28;

type RGB = [number, number, number];

/** Slightly above the road surface so markings don't z-fight */
const MARK_LIFT = 0.018;
const ROAD_ASPHALT: RGB = [55, 65, 81]; // matches Tile #374151
const ROAD_GRASS: RGB = [100, 140, 80];
const MARK_WHITE = 'rgba(255,255,255,0.92)';
const MARK_WHITE_DIM = 'rgba(255,255,255,0.55)';
const MARK_YELLOW = 'rgba(251,191,36,0.95)'; // #fbbf24
const RAIL_TIE = 'rgba(156,163,175,0.9)';
const RAIL_METAL = 'rgba(100,116,139,0.95)';

interface DriverView3DProps {
  vehicle: Vehicle;
  vehicleId: string;
  grid: GridData;
  vehicles: Record<string, Vehicle>;
  traffic?: TrafficState;
  people?: Record<string, Person>;
  className?: string;
  /** Logical pixel size (CSS scales with container) */
  width?: number;
  height?: number;
}

interface Cam {
  x: number;
  y: number;
  z: number;
  yaw: number; // radians — forward from headingToYaw
  /** Look-down pitch in radians (positive = look toward road surface) */
  pitch: number;
  /** Vertical field of view in radians */
  fov: number;
  cos: number;
  sin: number;
}

function isIntersectionTileType(type: string | undefined): boolean {
  if (!type || !type.startsWith('road-')) return false;
  return (
    type.includes('cross') ||
    type.endsWith('-t') ||
    type.includes('-t-') ||
    type.includes('curve') ||
    type.includes('roundabout')
  );
}

/** Tile under vehicle (bridge-aware). */
function vehicleGroundTile(vehicle: Vehicle, grid: GridData): GridTile | null {
  const tiles = grid[`${vehicle.x},${vehicle.y}`];
  if (!tiles?.length) return null;
  return (
    tiles.find(t => {
      const isBridge = t.type.includes('bridge') || t.type.includes('trestle');
      return (vehicle.zIndex === 1 && isBridge) || (vehicle.zIndex === 0 && !isBridge);
    }) || tiles[tiles.length - 1]
  );
}

/** Cell ahead of vehicle in travel direction. */
function tileAheadKey(vehicle: Vehicle): string {
  const h = ((vehicle.heading % 360) + 360) % 360;
  const dx = h === 90 ? 1 : h === 270 ? -1 : 0;
  const dy = h === 180 ? 1 : h === 0 ? -1 : 0;
  return `${vehicle.x + dx},${vehicle.y + dy}`;
}

function tileAheadIsIntersection(vehicle: Vehicle, grid: GridData): boolean {
  const key = tileAheadKey(vehicle);
  const tiles = grid[key];
  if (!tiles?.length) return false;
  const top = tiles[tiles.length - 1];
  return isIntersectionTileType(top?.type);
}

interface Face {
  depth: number;
  points: { x: number; y: number }[];
  fill: string;
  stroke?: string;
}

function clamp(v: number, a: number, b: number) {
  return Math.max(a, Math.min(b, v));
}

function rgb(c: RGB, shade = 1, alpha = 1): string {
  const r = clamp(Math.round(c[0] * shade), 0, 255);
  const g = clamp(Math.round(c[1] * shade), 0, 255);
  const b = clamp(Math.round(c[2] * shade), 0, 255);
  return alpha < 1 ? `rgba(${r},${g},${b},${alpha})` : `rgb(${r},${g},${b})`;
}

function tileStyle(type: string): { color: RGB; height: number; kind: string } {
  if (type.startsWith('road-')) {
    if (type.includes('bridge')) return { color: [90, 95, 105], height: 0.55, kind: 'bridge' };
    if (type.includes('bus-stop')) return { color: [72, 78, 88], height: 0.02, kind: 'road' };
    if (type.includes('4lane')) return { color: [70, 74, 82], height: 0.02, kind: 'road' };
    return { color: [78, 82, 90], height: 0.02, kind: 'road' };
  }
  if (type.startsWith('rail-')) {
    if (type.includes('trestle')) return { color: [100, 80, 60], height: 0.5, kind: 'bridge' };
    return { color: [95, 85, 75], height: 0.04, kind: 'rail' };
  }
  if (type.startsWith('parking-')) return { color: [95, 100, 110], height: 0.03, kind: 'parking' };
  if (type === 'building-home') return { color: [200, 140, 100], height: 1.1, kind: 'building' };
  if (type === 'building-apartment') return { color: [100, 120, 145], height: 2.4, kind: 'building' };
  if (type === 'building-store' || type === 'building-strip-mall')
    return { color: [180, 90, 90], height: 1.3, kind: 'building' };
  if (type.includes('factory') || type.includes('warehouse') || type.includes('lumber'))
    return { color: [130, 130, 145], height: 1.8, kind: 'building' };
  if (type.includes('school') || type.includes('college') || type.includes('university'))
    return { color: [210, 180, 90], height: 1.6, kind: 'building' };
  if (type === 'building-hospital') return { color: [230, 240, 250], height: 2.0, kind: 'building' };
  if (type === 'building-repair-shop') return { color: [160, 120, 70], height: 1.2, kind: 'building' };
  if (type === 'building-police') return { color: [70, 100, 180], height: 1.4, kind: 'building' };
  if (type === 'building-fire') return { color: [190, 60, 50], height: 1.4, kind: 'building' };
  if (type === 'building-station' || type.includes('train-station'))
    return { color: [120, 140, 160], height: 1.5, kind: 'building' };
  if (type === 'building-taxi-station') return { color: [230, 190, 50], height: 1.0, kind: 'building' };
  if (type === 'building-bus-station') return { color: [59, 130, 246], height: 1.5, kind: 'building' };
  if (type === 'building-playground' || type === 'building-large-park')
    return { color: [90, 170, 90], height: 0.15, kind: 'park' };
  if (type.startsWith('tree-')) return { color: [40, 120, 50], height: 1.6, kind: 'tree' };
  if (type.startsWith('grass-')) return { color: [110, 170, 90], height: 0.02, kind: 'grass' };
  if (type === 'landscape-sand') return { color: [210, 190, 140], height: 0.02, kind: 'ground' };
  if (type === 'landscape-gravel') return { color: [150, 145, 140], height: 0.02, kind: 'ground' };
  return { color: [100, 140, 80], height: 0.02, kind: 'ground' };
}

/** Map 2D pixel pose → world (X right, Y up, Z into map / south-positive like screen Y). */
function pixelToWorld(posX: number, posY: number): { x: number; z: number } {
  return { x: posX / 64, z: posY / 64 };
}

/** Heading degrees (0=N, 90=E) → yaw where 0 looks toward -Z (north on map when Y down in 2D). */
function headingToYaw(headingDeg: number): number {
  // 2D: heading 0 moves toward -Y (north). World Z increases with screen Y (south).
  // Looking north (heading 0) = looking toward -Z.
  return ((headingDeg - 90) * Math.PI) / 180;
}

/** Driver camera: fixed FOV / pitch so the view does not lurch when stopping or turning. */
function makeCam(vehicle: Vehicle, grid: GridData): Cam {
  const pose = getVehiclePose(vehicle, grid);
  const { x, z } = pixelToWorld(pose.posX, pose.posY);
  const yaw = headingToYaw(pose.rotation);
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  const eyeY = EYE_HEIGHT + (vehicle.zIndex > 0 ? 0.55 : 0);
  const back = 0.12;
  return {
    x: x - cos * back,
    y: eyeY,
    z: z - sin * back,
    yaw,
    pitch: 0.08 + PITCH_DOWN,
    fov: FOV_CRUISE,
    cos,
    sin,
  };
}

function applyLook(cam: Cam, lookYaw: number, lookPitch: number): Cam {
  const yaw = cam.yaw + lookYaw;
  const pitch = Math.max(-0.35, Math.min(1.1, cam.pitch + lookPitch));
  return { ...cam, yaw, pitch, cos: Math.cos(yaw), sin: Math.sin(yaw) };
}

function lerpAngle(a: number, b: number, t: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

function smoothCam(prev: Cam | null, target: Cam, k: number): Cam {
  if (!prev) return { ...target };
  const yaw = lerpAngle(prev.yaw, target.yaw, k);
  return {
    x: prev.x + (target.x - prev.x) * k,
    y: prev.y + (target.y - prev.y) * k,
    z: prev.z + (target.z - prev.z) * k,
    yaw,
    pitch: prev.pitch + (target.pitch - prev.pitch) * k,
    fov: target.fov,
    cos: Math.cos(yaw),
    sin: Math.sin(yaw),
  };
}

/** World → camera space (x right, y up, z forward), with pitch applied. */
function worldToCam(wx: number, wy: number, wz: number, cam: Cam) {
  const dx = wx - cam.x;
  const dy = wy - cam.y;
  const dz = wz - cam.z;
  const fx = cam.cos;
  const fz = cam.sin;
  // Right = rotate forward 90° so facing north (-Z) yields +X (east)
  const rx = -fz;
  const rz = fx;
  let cx = dx * rx + dz * rz;
  let cy = dy;
  let cz = dx * fx + dz * fz;
  // Pitch around camera X. Positive pitch = look down (horizon moves up on screen).
  if (cam.pitch) {
    const cp = Math.cos(cam.pitch);
    const sp = Math.sin(cam.pitch);
    const cy2 = cy * cp + cz * sp;
    const cz2 = -cy * sp + cz * cp;
    cy = cy2;
    cz = cz2;
  }
  return { x: cx, y: cy, z: cz };
}

function project(
  wx: number,
  wy: number,
  wz: number,
  cam: Cam,
  w: number,
  h: number,
): { x: number; y: number; z: number } | null {
  const c = worldToCam(wx, wy, wz, cam);
  if (c.z < NEAR_CLIP) return null;
  return camToScreen(c, cam, w, h);
}

function camToScreen(
  c: { x: number; y: number; z: number },
  cam: Cam,
  w: number,
  h: number,
): { x: number; y: number; z: number } {
  const f = 0.5 * h / Math.tan(cam.fov / 2);
  return {
    x: w / 2 + (c.x * f) / c.z,
    y: h / 2 - (c.y * f) / c.z,
    z: c.z,
  };
}

type CamPt = { x: number; y: number; z: number };

function interpolateCam(a: CamPt, b: CamPt, da: number, db: number): CamPt {
  const denom = da - db;
  const t = Math.abs(denom) < 1e-12 ? 0 : da / denom;
  const u = Math.max(0, Math.min(1, t));
  return {
    x: a.x + (b.x - a.x) * u,
    y: a.y + (b.y - a.y) * u,
    z: a.z + (b.z - a.z) * u,
  };
}

/** Sutherland–Hodgman clip against dist(p) >= 0. */
function clipPolyByDist(pts: CamPt[], dist: (p: CamPt) => number): CamPt[] {
  if (pts.length < 3) return [];
  const out: CamPt[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const da = dist(a);
    const db = dist(b);
    const aIn = da >= -1e-7;
    const bIn = db >= -1e-7;
    if (aIn && bIn) {
      out.push(b);
    } else if (aIn && !bIn) {
      out.push(interpolateCam(a, b, da, db));
    } else if (!aIn && bIn) {
      out.push(interpolateCam(a, b, da, db));
      out.push(b);
    }
  }
  return out;
}

/**
 * Clip to the perspective frustum so tiles aren't sliced/stretched as the camera
 * looks around. Slight overscan keeps in-view tiles whole (clip happens off-screen).
 */
function clipToViewFrustum(pts: CamPt[], cam: Cam, w: number, h: number): CamPt[] {
  const f = 0.5 * h / Math.tan(cam.fov / 2);
  const overscan = 1.35;
  const tanH = ((w / 2) / f) * overscan;
  const tanV = ((h / 2) / f) * overscan;
  let out = clipPolyByDist(pts, p => p.z - NEAR_CLIP);
  if (out.length < 3) return [];
  out = clipPolyByDist(out, p => p.x + p.z * tanH);
  if (out.length < 3) return [];
  out = clipPolyByDist(out, p => -p.x + p.z * tanH);
  if (out.length < 3) return [];
  out = clipPolyByDist(out, p => p.y + p.z * tanV);
  if (out.length < 3) return [];
  return clipPolyByDist(out, p => -p.y + p.z * tanV);
}

function avgDepth(pts: { z: number }[]): number {
  let s = 0;
  for (const p of pts) s += p.z;
  return s / pts.length;
}

function pushQuad(
  faces: Face[],
  cam: Cam,
  w: number,
  h: number,
  corners: [number, number, number][],
  fill: string,
  stroke?: string,
  depthBias = 0,
) {
  const camPts = corners.map(([x, y, z]) => worldToCam(x, y, z, cam));
  const clipped = clipToViewFrustum(camPts, cam, w, h);
  if (clipped.length < 3) return;
  const proj = clipped.map(c => camToScreen(c, cam, w, h));
  faces.push({
    depth: avgDepth(proj) + depthBias,
    points: proj.map(p => ({ x: p.x, y: p.y })),
    fill,
    stroke,
  });
}

function pushBox(
  faces: Face[],
  cam: Cam,
  w: number,
  h: number,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  y0: number,
  y1: number,
  color: RGB,
) {
  const midZ = (z0 + z1) / 2;
  const midX = (x0 + x1) / 2;
  // Shade faces by orientation
  pushQuad(
    faces,
    cam,
    w,
    h,
    [
      [x0, y1, z0],
      [x1, y1, z0],
      [x1, y1, z1],
      [x0, y1, z1],
    ],
    rgb(color, 1.05),
  );
  pushQuad(
    faces,
    cam,
    w,
    h,
    [
      [x0, y0, z0],
      [x0, y1, z0],
      [x0, y1, z1],
      [x0, y0, z1],
    ],
    rgb(color, 0.75),
  );
  pushQuad(
    faces,
    cam,
    w,
    h,
    [
      [x1, y0, z0],
      [x1, y0, z1],
      [x1, y1, z1],
      [x1, y1, z0],
    ],
    rgb(color, 0.85),
  );
  pushQuad(
    faces,
    cam,
    w,
    h,
    [
      [x0, y0, z0],
      [x1, y0, z0],
      [x1, y1, z0],
      [x0, y1, z0],
    ],
    rgb(color, 0.7),
  );
  pushQuad(
    faces,
    cam,
    w,
    h,
    [
      [x0, y0, z1],
      [x0, y1, z1],
      [x1, y1, z1],
      [x1, y0, z1],
    ],
    rgb(color, 0.9),
  );
  // unused mid for potential windows
  void midX;
  void midZ;
}

/**
 * Solid axis-aligned-in-local-space box oriented by forward/right on XZ.
 * Draws all 6 faces with directional shading so the body reads solid from any angle.
 * Local axes: +right (rx,rz), +up (Y), +forward (fx,fz). Box is centered at (cx, cz).
 */
function pushOrientedBox(
  faces: Face[],
  cam: Cam,
  w: number,
  h: number,
  cx: number,
  cz: number,
  y0: number,
  y1: number,
  halfLen: number,
  halfWid: number,
  fx: number,
  fz: number,
  rx: number,
  rz: number,
  color: RGB,
  shadeMul = 1,
) {
  const pt = (sRight: number, y: number, sFwd: number): [number, number, number] => [
    cx + rx * sRight * halfWid + fx * sFwd * halfLen,
    y,
    cz + rz * sRight * halfWid + fz * sFwd * halfLen,
  ];

  // Top
  pushQuad(
    faces, cam, w, h,
    [pt(1, y1, 1), pt(-1, y1, 1), pt(-1, y1, -1), pt(1, y1, -1)],
    rgb(color, 1.08 * shadeMul),
  );
  // Bottom
  pushQuad(
    faces, cam, w, h,
    [pt(1, y0, -1), pt(-1, y0, -1), pt(-1, y0, 1), pt(1, y0, 1)],
    rgb(color, 0.5 * shadeMul),
  );
  // Front (+forward)
  pushQuad(
    faces, cam, w, h,
    [pt(1, y0, 1), pt(-1, y0, 1), pt(-1, y1, 1), pt(1, y1, 1)],
    rgb(color, 0.95 * shadeMul),
  );
  // Back (−forward)
  pushQuad(
    faces, cam, w, h,
    [pt(-1, y0, -1), pt(1, y0, -1), pt(1, y1, -1), pt(-1, y1, -1)],
    rgb(color, 0.68 * shadeMul),
  );
  // Right (+right)
  pushQuad(
    faces, cam, w, h,
    [pt(1, y0, -1), pt(1, y0, 1), pt(1, y1, 1), pt(1, y1, -1)],
    rgb(color, 0.88 * shadeMul),
  );
  // Left (−right)
  pushQuad(
    faces, cam, w, h,
    [pt(-1, y0, 1), pt(-1, y0, -1), pt(-1, y1, -1), pt(-1, y1, 1)],
    rgb(color, 0.78 * shadeMul),
  );
}

/** Offset a world point along local vehicle axes (right, up, forward). */
function offsetAlong(
  cx: number,
  cy: number,
  cz: number,
  fx: number,
  fz: number,
  rx: number,
  rz: number,
  right: number,
  up: number,
  forward: number,
): { x: number; y: number; z: number } {
  return {
    x: cx + rx * right + fx * forward,
    y: cy + up,
    z: cz + rz * right + fz * forward,
  };
}

/** Glass windshield / side window as a slightly inset quad. */
function pushWindowQuad(
  faces: Face[],
  cam: Cam,
  w: number,
  h: number,
  corners: [number, number, number][],
  alpha = 0.55,
) {
  pushQuad(faces, cam, w, h, corners, `rgba(160,210,240,${alpha})`);
}

function vehicleBodyDims(type: string | undefined): {
  len: number;
  wid: number;
  bodyH: number;
  cabinH: number;
  kind: 'car' | 'bus' | 'semi' | 'train' | 'emergency' | 'service';
} {
  switch (type) {
    case 'train':
      return { len: 0.85, wid: 0.3, bodyH: 0.38, cabinH: 0.12, kind: 'train' };
    case 'semi':
      return { len: 0.42, wid: 0.28, bodyH: 0.28, cabinH: 0.22, kind: 'semi' };
    case 'bus':
      return { len: 0.72, wid: 0.3, bodyH: 0.42, cabinH: 0.08, kind: 'bus' };
    case 'fire-truck':
      return { len: 0.62, wid: 0.3, bodyH: 0.36, cabinH: 0.14, kind: 'emergency' };
    case 'ambulance':
      return { len: 0.55, wid: 0.28, bodyH: 0.34, cabinH: 0.12, kind: 'emergency' };
    case 'police':
      return { len: 0.48, wid: 0.26, bodyH: 0.22, cabinH: 0.14, kind: 'emergency' };
    case 'tow-truck':
      return { len: 0.52, wid: 0.28, bodyH: 0.24, cabinH: 0.16, kind: 'service' };
    case 'taxi':
      return { len: 0.46, wid: 0.26, bodyH: 0.2, cabinH: 0.14, kind: 'car' };
    default:
      return { len: 0.46, wid: 0.26, bodyH: 0.2, cabinH: 0.14, kind: 'car' };
  }
}

function pushWheels(
  faces: Face[],
  cam: Cam,
  w: number,
  h: number,
  cx: number,
  cz: number,
  y0: number,
  fx: number,
  fz: number,
  rx: number,
  rz: number,
  halfLen: number,
  halfWid: number,
  wheelR = 0.055,
  wheelW = 0.04,
) {
  const tire: RGB = [28, 28, 32];
  const axleZ = halfLen * 0.62;
  const axleX = halfWid + wheelW * 0.2;
  for (const sF of [-1, 1] as const) {
    for (const sR of [-1, 1] as const) {
      const p = offsetAlong(cx, 0, cz, fx, fz, rx, rz, sR * axleX, 0, sF * axleZ);
      // Thin box: radius along forward, thickness along right
      pushOrientedBox(
        faces, cam, w, h,
        p.x, p.z,
        y0, y0 + wheelR * 1.7,
        wheelR, wheelW,
        fx, fz, rx, rz,
        tire,
        0.95,
      );
    }
  }
}

/**
 * Multi-part solid vehicle mesh: chassis, cabin, glass, lights, wheels.
 * Readable as a filled volume from any camera angle.
 */
function pushVehicle3D(
  faces: Face[],
  cam: Cam,
  w: number,
  h: number,
  v: Vehicle,
  cx: number,
  cz: number,
  elev: number,
  yaw: number,
  now: number,
) {
  const fx = Math.cos(yaw);
  const fz = Math.sin(yaw);
  const rx = fz;
  const rz = -fx;
  const col = hexToRgb(v.color || '#64748b');
  const dims = vehicleBodyDims(v.type);
  const hl = dims.len / 2;
  const hw = dims.wid / 2;
  const y0 = elev;
  const yBody = y0 + dims.bodyH;
  const yCabin = yBody + dims.cabinH;
  const dark: RGB = [
    Math.round(col[0] * 0.45),
    Math.round(col[1] * 0.45),
    Math.round(col[2] * 0.45),
  ];
  const chrome: RGB = [190, 195, 205];
  const black: RGB = [22, 24, 28];

  if (dims.kind === 'train') {
    // Locomotive body
    pushOrientedBox(faces, cam, w, h, cx, cz, y0, yBody, hl, hw, fx, fz, rx, rz, col);
    // Cab raised front
    const cabC = offsetAlong(cx, 0, cz, fx, fz, rx, rz, 0, 0, hl * 0.45);
    pushOrientedBox(
      faces, cam, w, h,
      cabC.x, cabC.z,
      yBody, yCabin + 0.06,
      hl * 0.28, hw * 0.92,
      fx, fz, rx, rz, dark,
    );
    // Nose / cowcatcher
    const nose = offsetAlong(cx, 0, cz, fx, fz, rx, rz, 0, 0, hl * 0.95);
    pushOrientedBox(
      faces, cam, w, h,
      nose.x, nose.z,
      y0, y0 + dims.bodyH * 0.55,
      hl * 0.12, hw * 0.7,
      fx, fz, rx, rz, chrome, 0.9,
    );
    // Side windows on cab
    {
      const wY0 = yBody + 0.04;
      const wY1 = yCabin + 0.02;
      for (const sR of [-1, 1] as const) {
        const a = offsetAlong(cx, wY0, cz, fx, fz, rx, rz, sR * hw * 1.01, 0, hl * 0.25);
        const b = offsetAlong(cx, wY0, cz, fx, fz, rx, rz, sR * hw * 1.01, 0, hl * 0.62);
        const c = offsetAlong(cx, wY1, cz, fx, fz, rx, rz, sR * hw * 1.01, 0, hl * 0.62);
        const d = offsetAlong(cx, wY1, cz, fx, fz, rx, rz, sR * hw * 1.01, 0, hl * 0.25);
        pushWindowQuad(faces, cam, w, h, [
          [a.x, a.y, a.z], [b.x, b.y, b.z], [c.x, c.y, c.z], [d.x, d.y, d.z],
        ]);
      }
    }
    // Railcars trailing
    const cars = v.railcars?.length ?? 0;
    for (let i = 0; i < cars; i++) {
      const back = -(hl + 0.08 + i * 0.78 + 0.36);
      const rc = offsetAlong(cx, 0, cz, fx, fz, rx, rz, 0, 0, back);
      pushOrientedBox(
        faces, cam, w, h,
        rc.x, rc.z,
        y0, yBody * 0.95,
        0.36, hw * 0.95,
        fx, fz, rx, rz,
        [110, 100, 90],
      );
      // Roof rib
      pushOrientedBox(
        faces, cam, w, h,
        rc.x, rc.z,
        yBody * 0.95, yBody * 0.95 + 0.04,
        0.34, hw * 0.7,
        fx, fz, rx, rz, dark,
      );
    }
    pushWheels(faces, cam, w, h, cx, cz, y0, fx, fz, rx, rz, hl * 0.7, hw, 0.05, 0.035);
    return;
  }

  if (dims.kind === 'semi') {
    // Tractor cab
    pushOrientedBox(faces, cam, w, h, cx, cz, y0, yBody, hl, hw, fx, fz, rx, rz, col);
    const cab = offsetAlong(cx, 0, cz, fx, fz, rx, rz, 0, 0, hl * 0.15);
    pushOrientedBox(
      faces, cam, w, h,
      cab.x, cab.z,
      yBody, yCabin,
      hl * 0.55, hw * 0.95,
      fx, fz, rx, rz, col,
    );
    // Windshield
    {
      const yA = yBody + 0.02;
      const yB = yCabin - 0.02;
      const zF = hl * 0.55;
      const a = offsetAlong(cx, yA, cz, fx, fz, rx, rz, -hw * 0.85, 0, zF);
      const b = offsetAlong(cx, yA, cz, fx, fz, rx, rz, hw * 0.85, 0, zF);
      const c = offsetAlong(cx, yB, cz, fx, fz, rx, rz, hw * 0.75, 0, zF * 0.75);
      const d = offsetAlong(cx, yB, cz, fx, fz, rx, rz, -hw * 0.75, 0, zF * 0.75);
      pushWindowQuad(faces, cam, w, h, [
        [a.x, a.y, a.z], [b.x, b.y, b.z], [c.x, c.y, c.z], [d.x, d.y, d.z],
      ], 0.6);
    }
    // Trailer(s)
    const nTrailers = Math.max(0, v.trailers ?? 1);
    for (let i = 0; i < nTrailers; i++) {
      const tLen = 0.55;
      const back = -(hl + 0.06 + i * (tLen + 0.06) + tLen / 2);
      const tc = offsetAlong(cx, 0, cz, fx, fz, rx, rz, 0, 0, back);
      pushOrientedBox(
        faces, cam, w, h,
        tc.x, tc.z,
        y0 + 0.06, y0 + 0.42,
        tLen / 2, hw * 1.02,
        fx, fz, rx, rz,
        [200, 200, 210],
      );
      // Trailer chassis rails
      pushOrientedBox(
        faces, cam, w, h,
        tc.x, tc.z,
        y0, y0 + 0.07,
        tLen / 2, hw * 0.55,
        fx, fz, rx, rz, black,
      );
    }
    // Headlights
    for (const sR of [-1, 1] as const) {
      const p = offsetAlong(cx, 0, cz, fx, fz, rx, rz, sR * hw * 0.65, 0, hl + 0.01);
      pushOrientedBox(
        faces, cam, w, h,
        p.x, p.z,
        y0 + 0.08, y0 + 0.14,
        0.02, 0.04,
        fx, fz, rx, rz, [255, 245, 200],
      );
    }
    pushWheels(faces, cam, w, h, cx, cz, y0, fx, fz, rx, rz, hl * 0.75, hw);
    return;
  }

  if (dims.kind === 'bus') {
    pushOrientedBox(faces, cam, w, h, cx, cz, y0, yCabin, hl, hw, fx, fz, rx, rz, col);
    // Window band along both sides
    const wY0 = y0 + dims.bodyH * 0.45;
    const wY1 = yCabin - 0.04;
    for (const sR of [-1, 1] as const) {
      for (let i = 0; i < 4; i++) {
        const z0 = -hl * 0.75 + i * (hl * 0.4);
        const z1 = z0 + hl * 0.28;
        const a = offsetAlong(cx, wY0, cz, fx, fz, rx, rz, sR * hw * 1.01, 0, z0);
        const b = offsetAlong(cx, wY0, cz, fx, fz, rx, rz, sR * hw * 1.01, 0, z1);
        const c = offsetAlong(cx, wY1, cz, fx, fz, rx, rz, sR * hw * 1.01, 0, z1);
        const d = offsetAlong(cx, wY1, cz, fx, fz, rx, rz, sR * hw * 1.01, 0, z0);
        pushWindowQuad(faces, cam, w, h, [
          [a.x, a.y, a.z], [b.x, b.y, b.z], [c.x, c.y, c.z], [d.x, d.y, d.z],
        ]);
      }
    }
    // Front windshield
    {
      const a = offsetAlong(cx, wY0, cz, fx, fz, rx, rz, -hw * 0.9, 0, hl * 0.99);
      const b = offsetAlong(cx, wY0, cz, fx, fz, rx, rz, hw * 0.9, 0, hl * 0.99);
      const c = offsetAlong(cx, wY1, cz, fx, fz, rx, rz, hw * 0.9, 0, hl * 0.99);
      const d = offsetAlong(cx, wY1, cz, fx, fz, rx, rz, -hw * 0.9, 0, hl * 0.99);
      pushWindowQuad(faces, cam, w, h, [
        [a.x, a.y, a.z], [b.x, b.y, b.z], [c.x, c.y, c.z], [d.x, d.y, d.z],
      ], 0.65);
    }
    pushWheels(faces, cam, w, h, cx, cz, y0, fx, fz, rx, rz, hl * 0.7, hw, 0.06, 0.045);
    return;
  }

  // —— Car / taxi / police / tow / ambulance / fire (car-like base with variants) ——
  // Lower body / rocker
  pushOrientedBox(
    faces, cam, w, h,
    cx, cz, y0, yBody * 0.55,
    hl, hw, fx, fz, rx, rz, dark, 0.95,
  );
  // Main body
  pushOrientedBox(
    faces, cam, w, h,
    cx, cz, y0 + dims.bodyH * 0.12, yBody,
    hl * 0.98, hw * 0.96, fx, fz, rx, rz, col,
  );

  // Cabin (centered slightly rear of middle for sedan silhouette)
  const cabinFwd = dims.kind === 'emergency' && v.type === 'fire-truck' ? 0.08 : -0.04;
  const cabinHl = dims.kind === 'emergency' && (v.type === 'ambulance' || v.type === 'fire-truck')
    ? hl * 0.55
    : hl * 0.38;
  const cabinC = offsetAlong(cx, 0, cz, fx, fz, rx, rz, 0, 0, cabinFwd * hl);
  pushOrientedBox(
    faces, cam, w, h,
    cabinC.x, cabinC.z,
    yBody - 0.01, yCabin,
    cabinHl, hw * 0.9,
    fx, fz, rx, rz, col,
  );

  // Hood slope hint (slightly lower front deck)
  if (v.type !== 'bus') {
    const hood = offsetAlong(cx, 0, cz, fx, fz, rx, rz, 0, 0, hl * 0.55);
    pushOrientedBox(
      faces, cam, w, h,
      hood.x, hood.z,
      yBody * 0.7, yBody + 0.02,
      hl * 0.32, hw * 0.88,
      fx, fz, rx, rz, col, 1.02,
    );
  }

  // Windshield (front of cabin)
  {
    const zF = cabinFwd * hl + cabinHl * 0.95;
    const yA = yBody + 0.01;
    const yB = yCabin - 0.02;
    const a = offsetAlong(cx, yA, cz, fx, fz, rx, rz, -hw * 0.82, 0, zF);
    const b = offsetAlong(cx, yA, cz, fx, fz, rx, rz, hw * 0.82, 0, zF);
    const c = offsetAlong(cx, yB, cz, fx, fz, rx, rz, hw * 0.72, 0, zF - cabinHl * 0.15);
    const d = offsetAlong(cx, yB, cz, fx, fz, rx, rz, -hw * 0.72, 0, zF - cabinHl * 0.15);
    pushWindowQuad(faces, cam, w, h, [
      [a.x, a.y, a.z], [b.x, b.y, b.z], [c.x, c.y, c.z], [d.x, d.y, d.z],
    ], 0.62);
  }
  // Rear window
  {
    const zB = cabinFwd * hl - cabinHl * 0.95;
    const yA = yBody + 0.02;
    const yB = yCabin - 0.03;
    const a = offsetAlong(cx, yA, cz, fx, fz, rx, rz, hw * 0.8, 0, zB);
    const b = offsetAlong(cx, yA, cz, fx, fz, rx, rz, -hw * 0.8, 0, zB);
    const c = offsetAlong(cx, yB, cz, fx, fz, rx, rz, -hw * 0.7, 0, zB + cabinHl * 0.12);
    const d = offsetAlong(cx, yB, cz, fx, fz, rx, rz, hw * 0.7, 0, zB + cabinHl * 0.12);
    pushWindowQuad(faces, cam, w, h, [
      [a.x, a.y, a.z], [b.x, b.y, b.z], [c.x, c.y, c.z], [d.x, d.y, d.z],
    ], 0.5);
  }
  // Side windows
  for (const sR of [-1, 1] as const) {
    const z0 = cabinFwd * hl - cabinHl * 0.55;
    const z1 = cabinFwd * hl + cabinHl * 0.45;
    const yA = yBody + 0.03;
    const yB = yCabin - 0.03;
    const a = offsetAlong(cx, yA, cz, fx, fz, rx, rz, sR * hw * 0.92, 0, z0);
    const b = offsetAlong(cx, yA, cz, fx, fz, rx, rz, sR * hw * 0.92, 0, z1);
    const c = offsetAlong(cx, yB, cz, fx, fz, rx, rz, sR * hw * 0.92, 0, z1);
    const d = offsetAlong(cx, yB, cz, fx, fz, rx, rz, sR * hw * 0.92, 0, z0);
    pushWindowQuad(faces, cam, w, h, [
      [a.x, a.y, a.z], [b.x, b.y, b.z], [c.x, c.y, c.z], [d.x, d.y, d.z],
    ], 0.48);
  }

  // Headlights
  for (const sR of [-1, 1] as const) {
    const p = offsetAlong(cx, 0, cz, fx, fz, rx, rz, sR * hw * 0.62, 0, hl * 0.98);
    pushOrientedBox(
      faces, cam, w, h,
      p.x, p.z,
      y0 + dims.bodyH * 0.35, y0 + dims.bodyH * 0.55,
      0.025, 0.045,
      fx, fz, rx, rz, [255, 250, 210],
    );
  }
  // Taillights
  for (const sR of [-1, 1] as const) {
    const p = offsetAlong(cx, 0, cz, fx, fz, rx, rz, sR * hw * 0.62, 0, -hl * 0.98);
    pushOrientedBox(
      faces, cam, w, h,
      p.x, p.z,
      y0 + dims.bodyH * 0.4, y0 + dims.bodyH * 0.58,
      0.02, 0.04,
      fx, fz, rx, rz, [220, 40, 40],
    );
  }

  // Taxi roof light
  if (v.type === 'taxi') {
    const p = offsetAlong(cx, 0, cz, fx, fz, rx, rz, 0, 0, cabinFwd * hl);
    pushOrientedBox(
      faces, cam, w, h,
      p.x, p.z,
      yCabin, yCabin + 0.06,
      0.06, 0.08,
      fx, fz, rx, rz, [255, 210, 40],
    );
  }

  // Tow boom
  if (v.type === 'tow-truck') {
    const boom = offsetAlong(cx, 0, cz, fx, fz, rx, rz, 0, 0, -hl * 0.35);
    pushOrientedBox(
      faces, cam, w, h,
      boom.x, boom.z,
      yCabin - 0.02, yCabin + 0.08,
      hl * 0.45, 0.04,
      fx, fz, rx, rz, chrome,
    );
  }

  // Fire truck ladder rack
  if (v.type === 'fire-truck') {
    const rack = offsetAlong(cx, 0, cz, fx, fz, rx, rz, 0, 0, -hl * 0.15);
    pushOrientedBox(
      faces, cam, w, h,
      rack.x, rack.z,
      yCabin, yCabin + 0.1,
      hl * 0.5, hw * 0.35,
      fx, fz, rx, rz, [180, 40, 40],
    );
  }

  // Ambulance box already tall via cabin — add roof stripe
  if (v.type === 'ambulance') {
    pushOrientedBox(
      faces, cam, w, h,
      cabinC.x, cabinC.z,
      yCabin, yCabin + 0.03,
      cabinHl * 0.9, hw * 0.5,
      fx, fz, rx, rz, [240, 240, 245],
    );
  }

  pushWheels(faces, cam, w, h, cx, cz, y0, fx, fz, rx, rz, hl * 0.72, hw);

  // Emergency light bar
  if (
    v.emergencyLightsOn !== false &&
    (v.type === 'police' || v.type === 'fire-truck' || v.type === 'ambulance' || v.type === 'tow-truck')
  ) {
    const flash = Math.floor(now / 200) % 2 === 0;
    const left: RGB = flash ? [40, 80, 255] : [255, 50, 40];
    const right: RGB = flash ? [255, 50, 40] : [40, 80, 255];
    const bar = offsetAlong(cx, 0, cz, fx, fz, rx, rz, 0, 0, cabinFwd * hl + cabinHl * 0.15);
    pushOrientedBox(
      faces, cam, w, h,
      bar.x, bar.z,
      yCabin, yCabin + 0.05,
      0.04, hw * 0.7,
      fx, fz, rx, rz, black,
    );
    const pl = offsetAlong(bar.x, 0, bar.z, fx, fz, rx, rz, -hw * 0.35, 0, 0);
    const pr = offsetAlong(bar.x, 0, bar.z, fx, fz, rx, rz, hw * 0.35, 0, 0);
    pushOrientedBox(
      faces, cam, w, h,
      pl.x, pl.z, yCabin + 0.02, yCabin + 0.07,
      0.035, 0.06, fx, fz, rx, rz, left,
    );
    pushOrientedBox(
      faces, cam, w, h,
      pr.x, pr.z, yCabin + 0.02, yCabin + 0.07,
      0.035, 0.06, fx, fz, rx, rz, right,
    );
  }
}

function pushGroundTile(
  faces: Face[],
  cam: Cam,
  w: number,
  h: number,
  gx: number,
  gz: number,
  color: RGB,
  y = 0,
) {
  const x0 = gx;
  const z0 = gz;
  const x1 = gx + TILE;
  const z1 = gz + TILE;
  pushQuad(
    faces,
    cam,
    w,
    h,
    [
      [x0, y, z0],
      [x1, y, z0],
      [x1, y, z1],
      [x0, y, z1],
    ],
    rgb(color, 1),
    undefined,
    0.04,
  );
}

function pushWorldGroundPlane(faces: Face[], cam: Cam, w: number, h: number) {
  const R = GROUND_PLANE_RADIUS;
  const y = GROUND_Y;
  const segs = 24;
  const fill = rgb(ROAD_GRASS, 0.95);
  const cx = cam.x;
  const cz = cam.z;
  for (let i = 0; i < segs; i++) {
    const a0 = (i / segs) * Math.PI * 2;
    const a1 = ((i + 1) / segs) * Math.PI * 2;
    pushQuad(
      faces,
      cam,
      w,
      h,
      [
        [cx, y, cz],
        [cx + Math.cos(a0) * R, y, cz + Math.sin(a0) * R],
        [cx + Math.cos(a1) * R, y, cz + Math.sin(a1) * R],
      ],
      fill,
      undefined,
      0.12,
    );
  }
}

/** Tile pixel (0–64) → unit fraction. */
function tU(px: number): number {
  return px / TILE_PX;
}

/**
 * Map local tile pixel coords → world XZ, applying the same CSS-style rotation
 * as Tile.tsx (positive degrees = clockwise with Y/Z down).
 */
function tileLocalToWorld(
  gx: number,
  gz: number,
  px: number,
  py: number,
  rotDeg: number,
): { x: number; z: number } {
  const lx = tU(px) - 0.5;
  const ly = tU(py) - 0.5;
  const r = (rotDeg * Math.PI) / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  // Clockwise with Y-down: x' = x cos − y sin, y' = x sin + y cos
  const rx = lx * cos - ly * sin;
  const ry = lx * sin + ly * cos;
  return { x: gx + 0.5 + rx, z: gz + 0.5 + ry };
}

function pushLocalQuad(
  faces: Face[],
  cam: Cam,
  w: number,
  h: number,
  gx: number,
  gz: number,
  rot: number,
  y: number,
  corners: [number, number][], // [px, py] in tile space
  fill: string,
) {
  const world = corners.map(([px, py]) => tileLocalToWorld(gx, gz, px, py, rot));
  pushQuad(
    faces,
    cam,
    w,
    h,
    world.map(p => [p.x, y, p.z] as [number, number, number]),
    fill,
  );
}

/** Axis-aligned rect in tile pixel space (before rotation). */
function pushLocalRect(
  faces: Face[],
  cam: Cam,
  w: number,
  h: number,
  gx: number,
  gz: number,
  rot: number,
  y: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  fill: string,
) {
  pushLocalQuad(
    faces,
    cam,
    w,
    h,
    gx,
    gz,
    rot,
    y,
    [
      [x0, y0],
      [x1, y0],
      [x1, y1],
      [x0, y1],
    ],
    fill,
  );
}

/** Dashed N–S line in local tile space (matches SVG strokeDasharray patterns). */
function pushDashedLineNS(
  faces: Face[],
  cam: Cam,
  w: number,
  h: number,
  gx: number,
  gz: number,
  rot: number,
  y: number,
  xPx: number,
  y0: number,
  y1: number,
  dash: number,
  gap: number,
  halfWidth: number,
  fill: string,
) {
  let yCur = y0;
  while (yCur < y1 - 0.5) {
    const yEnd = Math.min(yCur + dash, y1);
    if (yEnd > yCur) {
      pushLocalRect(
        faces,
        cam,
        w,
        h,
        gx,
        gz,
        rot,
        y,
        xPx - halfWidth,
        yCur,
        xPx + halfWidth,
        yEnd,
        fill,
      );
    }
    yCur += dash + gap;
  }
}

/** Dashed E–W line in local tile space. */
function pushDashedLineEW(
  faces: Face[],
  cam: Cam,
  w: number,
  h: number,
  gx: number,
  gz: number,
  rot: number,
  y: number,
  yPx: number,
  x0: number,
  x1: number,
  dash: number,
  gap: number,
  halfWidth: number,
  fill: string,
) {
  let xCur = x0;
  while (xCur < x1 - 0.5) {
    const xEnd = Math.min(xCur + dash, x1);
    if (xEnd > xCur) {
      pushLocalRect(
        faces,
        cam,
        w,
        h,
        gx,
        gz,
        rot,
        y,
        xCur,
        yPx - halfWidth,
        xEnd,
        yPx + halfWidth,
        fill,
      );
    }
    xCur += dash + gap;
  }
}

function quadBezierPt(
  p0: [number, number],
  p1: [number, number],
  p2: [number, number],
  t: number,
): [number, number] {
  const mt = 1 - t;
  return [
    mt * mt * p0[0] + 2 * mt * t * p1[0] + t * t * p2[0],
    mt * mt * p0[1] + 2 * mt * t * p1[1] + t * t * p2[1],
  ];
}

/** Approximate a dashed quadratic curve as short local quads. */
function pushDashedQuadBezier(
  faces: Face[],
  cam: Cam,
  w: number,
  h: number,
  gx: number,
  gz: number,
  rot: number,
  y: number,
  p0: [number, number],
  p1: [number, number],
  p2: [number, number],
  halfWidth: number,
  dash: number,
  gap: number,
  fill: string,
  samples = 16,
) {
  // Estimate arc length in tile px for dash patterning
  let len = 0;
  let prev = p0;
  for (let i = 1; i <= samples; i++) {
    const pt = quadBezierPt(p0, p1, p2, i / samples);
    len += Math.hypot(pt[0] - prev[0], pt[1] - prev[1]);
    prev = pt;
  }
  if (len < 1) return;
  let dist = 0;
  const period = dash + gap;
  prev = p0;
  for (let i = 1; i <= samples; i++) {
    const t = i / samples;
    const pt = quadBezierPt(p0, p1, p2, t);
    const step = Math.hypot(pt[0] - prev[0], pt[1] - prev[1]);
    const nextDist = dist + step;
    // Emit sub-segments when crossing dash/gap boundaries
    let d0 = dist;
    let a = prev;
    while (d0 < nextDist - 1e-6) {
      const phase = d0 % period;
      const inDash = phase < dash;
      const remain = inDash ? dash - phase : period - phase;
      const d1 = Math.min(nextDist, d0 + remain);
      const u = step > 1e-6 ? (d1 - dist) / step : 1;
      const b: [number, number] = [
        prev[0] + (pt[0] - prev[0]) * u,
        prev[1] + (pt[1] - prev[1]) * u,
      ];
      if (inDash && d1 > d0) {
        // Perpendicular in 2D tile space
        const dx = b[0] - a[0];
        const dy = b[1] - a[1];
        const inv = 1 / (Math.hypot(dx, dy) || 1);
        const nx = (-dy * inv) * halfWidth;
        const ny = (dx * inv) * halfWidth;
        pushLocalQuad(
          faces,
          cam,
          w,
          h,
          gx,
          gz,
          rot,
          y,
          [
            [a[0] + nx, a[1] + ny],
            [a[0] - nx, a[1] - ny],
            [b[0] - nx, b[1] - ny],
            [b[0] + nx, b[1] + ny],
          ],
          fill,
        );
      }
      a = b;
      d0 = d1;
    }
    dist = nextDist;
    prev = pt;
  }
}

/** Solid quadratic curve strip (yellow centerlines, etc.). */
function pushSolidQuadBezier(
  faces: Face[],
  cam: Cam,
  w: number,
  h: number,
  gx: number,
  gz: number,
  rot: number,
  y: number,
  p0: [number, number],
  p1: [number, number],
  p2: [number, number],
  halfWidth: number,
  fill: string,
  samples = 12,
) {
  let prev = p0;
  for (let i = 1; i <= samples; i++) {
    const pt = quadBezierPt(p0, p1, p2, i / samples);
    const dx = pt[0] - prev[0];
    const dy = pt[1] - prev[1];
    const inv = 1 / (Math.hypot(dx, dy) || 1);
    const nx = (-dy * inv) * halfWidth;
    const ny = (dx * inv) * halfWidth;
    pushLocalQuad(
      faces,
      cam,
      w,
      h,
      gx,
      gz,
      rot,
      y,
      [
        [prev[0] + nx, prev[1] + ny],
        [prev[0] - nx, prev[1] - ny],
        [pt[0] - nx, pt[1] - ny],
        [pt[0] + nx, pt[1] + ny],
      ],
      fill,
    );
    prev = pt;
  }
}

/** Tessellate curved road asphalt (NW default: west↔north corner). */
function pushCurveRoadSurface(
  faces: Face[],
  cam: Cam,
  w: number,
  h: number,
  gx: number,
  gz: number,
  rot: number,
  y: number,
  inset: number,
  outer: number,
  fill: string,
  /** Mirror through tile center for SE one-way reverse curve */
  mirror = false,
  samples = 10,
) {
  const mapPt = (px: number, py: number): [number, number] =>
    mirror ? [TILE_PX - px, TILE_PX - py] : [px, py];

  const inner0 = mapPt(inset, 0);
  const innerC = mapPt(inset, inset);
  const inner1 = mapPt(0, inset);
  const outer0 = mapPt(outer, 0);
  const outerC = mapPt(outer, outer);
  const outer1 = mapPt(0, outer);

  for (let i = 0; i < samples; i++) {
    const t0 = i / samples;
    const t1 = (i + 1) / samples;
    const i0 = quadBezierPt(inner0, innerC, inner1, t0);
    const i1 = quadBezierPt(inner0, innerC, inner1, t1);
    const o0 = quadBezierPt(outer0, outerC, outer1, t0);
    const o1 = quadBezierPt(outer0, outerC, outer1, t1);
    pushLocalQuad(faces, cam, w, h, gx, gz, rot, y, [i0, o0, o1, i1], fill);
  }
}

/** Small chevron / arrow head pointing local-north (travel toward -Y), matching Tile art. */
function pushOneWayArrow(
  faces: Face[],
  cam: Cam,
  w: number,
  h: number,
  gx: number,
  gz: number,
  rot: number,
  y: number,
  cx: number,
  cy: number,
  fill: string,
  size = 7,
) {
  const halfW = size * 0.7;
  const tipY = cy - size * 0.85;
  const baseY = cy + size * 0.55;
  // Degenerate quad (triangle) — tip + base corners
  pushLocalQuad(
    faces,
    cam,
    w,
    h,
    gx,
    gz,
    rot,
    y,
    [
      [cx, tipY],
      [cx - halfW, baseY],
      [cx + halfW, baseY],
      [cx, tipY],
    ],
    fill,
  );
}

function pushArrowAlongBezier(
  faces: Face[],
  cam: Cam,
  w: number,
  h: number,
  gx: number,
  gz: number,
  rot: number,
  y: number,
  p0: [number, number],
  p1: [number, number],
  p2: [number, number],
  samples: number[],
  fill: string,
) {
  for (const t of samples) {
    const [x, yPx] = quadBezierPt(p0, p1, p2, t);
    const mt = 1 - t;
    // Tangent
    const dx = 2 * mt * (p1[0] - p0[0]) + 2 * t * (p2[0] - p1[0]);
    const dy = 2 * mt * (p1[1] - p0[1]) + 2 * t * (p2[1] - p1[1]);
    const ang = Math.atan2(dy, dx) + Math.PI / 2; // match Tile tangentToArrowAngle (+90°)
    const size = 7;
    const halfW = size * 0.7;
    const tipDist = size * 0.85;
    const baseDist = size * 0.55;
    // Local arrow: tip along -localY in arrow space, then rotate by ang
    // ang is CSS-style degrees converted... we use radians for cos/sin of ang
    // Default arrow tip at (0, -tipDist) relative, base left/right at (±halfW, baseDist)
    const cos = Math.cos(ang);
    const sin = Math.sin(ang);
    const xf = (lx: number, ly: number): [number, number] => [
      x + lx * cos - ly * sin,
      yPx + lx * sin + ly * cos,
    ];
    // Default up arrow points local -Y before rotation; Tile uses rotate(angle) with angle = atan2(dy,dx)*180/π+90
    // In SVG, rotate positive is clockwise. Our localToWorld also uses clockwise for tile rot.
    // Arrow path: tip (0, -0.85*size), base (-halfW, 0.55*size), (halfW, 0.55*size)
    // transform rotate(ang) around (x,y) with SVG coords
    pushLocalQuad(
      faces,
      cam,
      w,
      h,
      gx,
      gz,
      rot,
      y,
      [xf(0, -tipDist), xf(-halfW, baseDist), xf(halfW, baseDist), xf(0, -tipDist)],
      fill,
    );
  }
}

/**
 * Draw asphalt + lane markings for a road/rail tile so the driver view matches grid Tile art.
 */
function pushRoadTileVisual(
  faces: Face[],
  cam: Cam,
  w: number,
  h: number,
  gx: number,
  gz: number,
  type: string,
  rot: number,
  ySurface: number,
) {
  const yMark = ySurface + MARK_LIFT;
  const asphalt = rgb(ROAD_ASPHALT, 1);
  const isRail = type.startsWith('rail-');
  const is4Lane = type.includes('4lane');
  const isOneWay = type.includes('oneway');
  const isBridge =
    type.includes('bridge') || type.includes('trestle');
  const inset = is4Lane ? ROAD_INSET_4L : ROAD_INSET_2L;
  const outer = is4Lane ? ROAD_OUTER_4L : ROAD_OUTER_2L;
  const roadW = is4Lane ? ROAD_WIDTH_4L : ROAD_WIDTH_2L;

  const drawNSAsphalt = (y0: number, y1: number) => {
    pushLocalRect(faces, cam, w, h, gx, gz, rot, ySurface, inset, y0, outer, y1, asphalt);
  };
  const drawEWAsphalt = (x0: number, x1: number, yMid = TILE_CENTER) => {
    const half = roadW / 2;
    pushLocalRect(
      faces,
      cam,
      w,
      h,
      gx,
      gz,
      rot,
      ySurface,
      x0,
      yMid - half,
      x1,
      yMid + half,
      asphalt,
    );
  };

  // --- Surface (local art is N–S; tile rotation matches grid) ---
  if (
    type === 'road-straight' ||
    type === 'road-bridge' ||
    type === 'road-4lane-straight' ||
    type === 'road-4lane-bridge' ||
    type === 'road-oneway-straight' ||
    type === 'road-oneway-bridge' ||
    type === 'road-bus-stop' ||
    type === 'road-4lane-bus-stop' ||
    type === 'rail-straight' ||
    type === 'rail-trestle'
  ) {
    drawNSAsphalt(0, TILE_PX);
    // Bus pull-out bay on east curb (right in local tile space)
    if (type === 'road-bus-stop' || type === 'road-4lane-bus-stop') {
      const bayX0 = is4Lane ? ROAD_OUTER_4L : ROAD_OUTER_2L;
      pushLocalRect(
        faces, cam, w, h, gx, gz, rot, ySurface,
        bayX0, 12, Math.min(TILE_PX, bayX0 + 14), 52, asphalt,
      );
    }
  } else if (
    type === 'road-curve' ||
    type === 'rail-curve' ||
    type === 'road-4lane-curve' ||
    type === 'road-oneway-curve'
  ) {
    pushCurveRoadSurface(
      faces,
      cam,
      w,
      h,
      gx,
      gz,
      rot,
      ySurface,
      inset,
      outer,
      asphalt,
      false,
    );
  } else if (type === 'road-oneway-curve-reverse') {
    pushCurveRoadSurface(
      faces,
      cam,
      w,
      h,
      gx,
      gz,
      rot,
      ySurface,
      ROAD_INSET_2L,
      ROAD_OUTER_2L,
      asphalt,
      true,
    );
  } else if (type === 'road-t' || type === 'road-4lane-t' || type === 'rail-t') {
    drawNSAsphalt(0, TILE_PX);
    drawEWAsphalt(0, TILE_CENTER);
  } else if (type === 'road-cross' || type === 'road-4lane-cross' || type === 'rail-cross') {
    drawNSAsphalt(0, TILE_PX);
    drawEWAsphalt(0, TILE_PX);
  } else if (type === 'road-end' || type === 'road-4lane-end' || type === 'rail-end') {
    drawNSAsphalt(TILE_CENTER, TILE_PX);
  } else if (type === 'road-cul-de-sac') {
    // South stem is the 2-lane connection; the bulb is the turnaround.
    drawNSAsphalt(30, TILE_PX);
    const bulb: [number, number] = [TILE_CENTER, 28];
    const bulbR = 18;
    const segs = 14;
    for (let i = 0; i < segs; i++) {
      const a0 = (i / segs) * Math.PI * 2;
      const a1 = ((i + 1) / segs) * Math.PI * 2;
      pushLocalQuad(
        faces, cam, w, h, gx, gz, rot, ySurface,
        [
          bulb,
          [bulb[0] + bulbR * Math.cos(a0), bulb[1] + bulbR * Math.sin(a0)],
          [bulb[0] + bulbR * Math.cos(a1), bulb[1] + bulbR * Math.sin(a1)],
          bulb,
        ],
        asphalt,
      );
    }
  } else if (type === 'road-transition-2to4') {
    pushLocalQuad(
      faces,
      cam,
      w,
      h,
      gx,
      gz,
      rot,
      ySurface,
      [
        [ROAD_INSET_2L, 0],
        [ROAD_OUTER_2L, 0],
        [ROAD_OUTER_4L, TILE_PX],
        [ROAD_INSET_4L, TILE_PX],
      ],
      asphalt,
    );
  } else if (type === 'road-roundabout' || type === 'road-roundabout-reverse') {
    // Match Tile art: quarter ring centered on the SE corner, west spur.
    // The reverse tile mirrors that across the vertical center.
    const mirror = type === 'road-roundabout-reverse';
    const flip = (x: number) => (mirror ? TILE_PX - x : x);
    const segs = 10;
    const cArc = TILE_PX;
    for (let i = 0; i < segs; i++) {
      const a0 = Math.PI + (Math.PI / 2) * (i / segs);
      const a1 = Math.PI + (Math.PI / 2) * ((i + 1) / segs);
      const at = (r: number, a: number): [number, number] => [
        flip(cArc + r * Math.cos(a)),
        cArc + r * Math.sin(a),
      ];
      pushLocalQuad(
        faces, cam, w, h, gx, gz, rot, ySurface,
        [at(ROAD_INSET_2L, a0), at(ROAD_OUTER_2L, a0), at(ROAD_OUTER_2L, a1), at(ROAD_INSET_2L, a1)],
        asphalt,
      );
    }
    const spurX0 = flip(0);
    const spurX1 = flip(TILE_CENTER);
    drawEWAsphalt(Math.min(spurX0, spurX1), Math.max(spurX0, spurX1));
  } else if (type === 'road-roundabout-4way') {
    drawNSAsphalt(0, TILE_PX);
    drawEWAsphalt(0, TILE_PX);
    const segs = 20;
    for (let i = 0; i < segs; i++) {
      const a0 = (i / segs) * Math.PI * 2;
      const a1 = ((i + 1) / segs) * Math.PI * 2;
      const midA = (a0 + a1) / 2;
      const midR = ROUNDABOUT_OUTER_R * 0.92;
      const mx = TILE_CENTER + midR * Math.cos(midA);
      const my = TILE_CENTER + midR * Math.sin(midA);
      const half = ROAD_WIDTH_2L / 2;
      // Corner flares sit outside the 2-lane cross and inside the ring.
      if (Math.abs(mx - TILE_CENTER) <= half || Math.abs(my - TILE_CENTER) <= half) continue;
      const at = (r: number, a: number): [number, number] => [
        TILE_CENTER + r * Math.cos(a),
        TILE_CENTER + r * Math.sin(a),
      ];
      pushLocalQuad(
        faces, cam, w, h, gx, gz, rot, ySurface,
        [at(ROUNDABOUT_ISLAND_R, a0), at(ROUNDABOUT_OUTER_R, a0), at(ROUNDABOUT_OUTER_R, a1), at(ROUNDABOUT_ISLAND_R, a1)],
        asphalt,
      );
    }
  } else if (type.startsWith('road-') || type.startsWith('rail-')) {
    pushLocalRect(faces, cam, w, h, gx, gz, rot, ySurface, 0, 0, TILE_PX, TILE_PX, asphalt);
  }

  // Bridge side rails (visual)
  if (isBridge && !isRail) {
    const railCol = 'rgba(148,163,184,0.85)';
    pushLocalRect(faces, cam, w, h, gx, gz, rot, yMark, inset - 1, 0, inset + 2, TILE_PX, railCol);
    pushLocalRect(faces, cam, w, h, gx, gz, rot, yMark, outer - 2, 0, outer + 1, TILE_PX, railCol);
  }

  // --- Markings (match Tile.tsx) ---
  if (isRail) {
    // Ties + rails for straight-like / general
    if (type.includes('curve')) {
      pushDashedQuadBezier(
        faces, cam, w, h, gx, gz, rot, yMark,
        [TILE_CENTER, 0], [TILE_CENTER, TILE_CENTER], [0, TILE_CENTER],
        2, 4, 4, RAIL_TIE, 12,
      );
      pushSolidQuadBezier(
        faces, cam, w, h, gx, gz, rot, yMark,
        [RAIL_LEFT, 0], [RAIL_LEFT, RAIL_LEFT], [0, RAIL_LEFT],
        1, RAIL_METAL, 12,
      );
      pushSolidQuadBezier(
        faces, cam, w, h, gx, gz, rot, yMark,
        [RAIL_RIGHT, 0], [RAIL_RIGHT, RAIL_RIGHT], [0, RAIL_RIGHT],
        1, RAIL_METAL, 12,
      );
    } else {
      const yTies = type.includes('end') ? [40, 56] : [8, 24, 40, 56];
      const y0 = type.includes('end') ? TILE_CENTER : 0;
      for (const ty of yTies) {
        pushLocalRect(
          faces, cam, w, h, gx, gz, rot, yMark,
          RAIL_LEFT - 3, ty - 2, RAIL_RIGHT + 3, ty + 2, RAIL_TIE,
        );
      }
      pushLocalRect(faces, cam, w, h, gx, gz, rot, yMark, RAIL_LEFT, y0, RAIL_LEFT + 2, TILE_PX, RAIL_METAL);
      pushLocalRect(faces, cam, w, h, gx, gz, rot, yMark, RAIL_RIGHT, y0, RAIL_RIGHT + 2, TILE_PX, RAIL_METAL);
      if (type.includes('cross') || type.endsWith('-t') || type.includes('rail-t')) {
        const xMax = type.includes('cross') ? TILE_PX : TILE_CENTER;
        for (const tx of type.includes('cross') ? [8, 24, 40, 56] : [8, 24]) {
          pushLocalRect(
            faces, cam, w, h, gx, gz, rot, yMark,
            tx - 2, RAIL_LEFT - 3, tx + 2, RAIL_RIGHT + 3, RAIL_TIE,
          );
        }
        pushLocalRect(faces, cam, w, h, gx, gz, rot, yMark, 0, RAIL_LEFT, xMax, RAIL_LEFT + 2, RAIL_METAL);
        pushLocalRect(faces, cam, w, h, gx, gz, rot, yMark, 0, RAIL_RIGHT, xMax, RAIL_RIGHT + 2, RAIL_METAL);
      }
    }
    return;
  }

  // Road markings
  if (
    type === 'road-straight' ||
    type === 'road-bridge' ||
    type === 'road-oneway-straight' ||
    type === 'road-oneway-bridge' ||
    type === 'road-4lane-straight' ||
    type === 'road-4lane-bridge' ||
    type === 'road-bus-stop' ||
    type === 'road-4lane-bus-stop'
  ) {
    if (is4Lane || type === 'road-4lane-bus-stop') {
      // Yellow solid centerline + white dashed lane dividers
      pushLocalRect(
        faces, cam, w, h, gx, gz, rot, yMark,
        TILE_CENTER - 1, 0, TILE_CENTER + 1, TILE_PX, MARK_YELLOW,
      );
      pushDashedLineNS(
        faces, cam, w, h, gx, gz, rot, yMark,
        DIVIDER_LEFT, 0, TILE_PX, 4, 4, 0.6, MARK_WHITE_DIM,
      );
      pushDashedLineNS(
        faces, cam, w, h, gx, gz, rot, yMark,
        DIVIDER_RIGHT, 0, TILE_PX, 4, 4, 0.6, MARK_WHITE_DIM,
      );
    } else if (isOneWay) {
      // Dashed white center + northbound arrows (Tile OneWayStraightMarkings)
      pushDashedLineNS(
        faces, cam, w, h, gx, gz, rot, yMark,
        TILE_CENTER, 4, 60, 5, 5, 1, MARK_WHITE,
      );
      for (const ay of [14, 32, 50]) {
        pushOneWayArrow(faces, cam, w, h, gx, gz, rot, yMark, TILE_CENTER, ay, MARK_WHITE);
      }
    } else {
      // Standard 2-lane: two white dash blocks
      pushLocalRect(
        faces, cam, w, h, gx, gz, rot, yMark,
        TILE_CENTER - 1, 8, TILE_CENTER + 1, 20, MARK_WHITE,
      );
      pushLocalRect(
        faces, cam, w, h, gx, gz, rot, yMark,
        TILE_CENTER - 1, 44, TILE_CENTER + 1, 56, MARK_WHITE,
      );
    }
    // Yellow curb line for bus bay
    if (type === 'road-bus-stop' || type === 'road-4lane-bus-stop') {
      const bayX = type === 'road-4lane-bus-stop' ? ROAD_OUTER_4L : ROAD_OUTER_2L;
      pushDashedLineNS(
        faces, cam, w, h, gx, gz, rot, yMark,
        bayX, 12, 52, 4, 3, 1, MARK_YELLOW,
      );
    }
  } else if (
    type === 'road-curve' ||
    type === 'road-4lane-curve' ||
    type === 'road-oneway-curve' ||
    type === 'road-oneway-curve-reverse'
  ) {
    const mirror = type === 'road-oneway-curve-reverse';
    const mapPt = (p: [number, number]): [number, number] =>
      mirror ? [TILE_PX - p[0], TILE_PX - p[1]] : p;
    if (is4Lane) {
      pushSolidQuadBezier(
        faces, cam, w, h, gx, gz, rot, yMark,
        mapPt([TILE_CENTER, 0]), mapPt([TILE_CENTER, TILE_CENTER]), mapPt([0, TILE_CENTER]),
        1, MARK_YELLOW, 12,
      );
      pushDashedQuadBezier(
        faces, cam, w, h, gx, gz, rot, yMark,
        mapPt([DIVIDER_RIGHT, 0]), mapPt([DIVIDER_RIGHT, DIVIDER_RIGHT]), mapPt([0, DIVIDER_RIGHT]),
        0.6, 4, 4, MARK_WHITE_DIM, 12,
      );
      pushDashedQuadBezier(
        faces, cam, w, h, gx, gz, rot, yMark,
        mapPt([DIVIDER_LEFT, 0]), mapPt([DIVIDER_LEFT, DIVIDER_LEFT]), mapPt([0, DIVIDER_LEFT]),
        0.6, 4, 4, MARK_WHITE_DIM, 12,
      );
    } else if (isOneWay) {
      const p0 = mapPt([TILE_CENTER, 0]);
      const p1 = mapPt([TILE_CENTER, TILE_CENTER]);
      const p2 = mapPt([0, TILE_CENTER]);
      pushDashedQuadBezier(
        faces, cam, w, h, gx, gz, rot, yMark,
        p0, p1, p2, 1, 5, 5, MARK_WHITE, 14,
      );
      // NW curve: CCW west→north (reverse bezier). SE reverse: CW south→east.
      const ccw = type === 'road-oneway-curve';
      pushArrowAlongBezier(
        faces, cam, w, h, gx, gz, rot, yMark,
        ccw ? p2 : p0,
        p1,
        ccw ? p0 : p2,
        [0.22, 0.5, 0.78], MARK_WHITE,
      );
    } else {
      pushDashedQuadBezier(
        faces, cam, w, h, gx, gz, rot, yMark,
        [TILE_CENTER, 0], [TILE_CENTER, TILE_CENTER], [0, TILE_CENTER],
        1, 8, 8, MARK_WHITE, 12,
      );
    }
  } else if (type === 'road-t' || type === 'road-4lane-t') {
    if (is4Lane) {
      pushLocalRect(
        faces, cam, w, h, gx, gz, rot, yMark,
        TILE_CENTER - 1, 0, TILE_CENTER + 1, TILE_PX, MARK_YELLOW,
      );
      pushLocalRect(
        faces, cam, w, h, gx, gz, rot, yMark,
        0, TILE_CENTER - 1, TILE_CENTER, TILE_CENTER + 1, MARK_YELLOW,
      );
      pushDashedLineNS(
        faces, cam, w, h, gx, gz, rot, yMark,
        DIVIDER_LEFT, 0, TILE_PX, 4, 4, 0.6, MARK_WHITE_DIM,
      );
      pushDashedLineNS(
        faces, cam, w, h, gx, gz, rot, yMark,
        DIVIDER_RIGHT, 0, TILE_PX, 4, 4, 0.6, MARK_WHITE_DIM,
      );
      pushDashedLineEW(
        faces, cam, w, h, gx, gz, rot, yMark,
        DIVIDER_LEFT, 0, TILE_CENTER, 4, 4, 0.6, MARK_WHITE_DIM,
      );
      pushDashedLineEW(
        faces, cam, w, h, gx, gz, rot, yMark,
        DIVIDER_RIGHT, 0, TILE_CENTER, 4, 4, 0.6, MARK_WHITE_DIM,
      );
    } else {
      pushLocalRect(
        faces, cam, w, h, gx, gz, rot, yMark,
        TILE_CENTER - 1, 8, TILE_CENTER + 1, 20, MARK_WHITE,
      );
      pushLocalRect(
        faces, cam, w, h, gx, gz, rot, yMark,
        TILE_CENTER - 1, 44, TILE_CENTER + 1, 56, MARK_WHITE,
      );
      pushLocalRect(
        faces, cam, w, h, gx, gz, rot, yMark,
        ROAD_INSET_2L - 12, TILE_CENTER - 1, ROAD_INSET_2L, TILE_CENTER + 1, MARK_WHITE,
      );
    }
  } else if (type === 'road-cross' || type === 'road-4lane-cross') {
    if (is4Lane) {
      pushLocalRect(
        faces, cam, w, h, gx, gz, rot, yMark,
        TILE_CENTER - 1, 0, TILE_CENTER + 1, TILE_PX, MARK_YELLOW,
      );
      pushLocalRect(
        faces, cam, w, h, gx, gz, rot, yMark,
        0, TILE_CENTER - 1, TILE_PX, TILE_CENTER + 1, MARK_YELLOW,
      );
      pushDashedLineNS(
        faces, cam, w, h, gx, gz, rot, yMark,
        DIVIDER_LEFT, 0, TILE_PX, 4, 4, 0.6, MARK_WHITE_DIM,
      );
      pushDashedLineNS(
        faces, cam, w, h, gx, gz, rot, yMark,
        DIVIDER_RIGHT, 0, TILE_PX, 4, 4, 0.6, MARK_WHITE_DIM,
      );
      pushDashedLineEW(
        faces, cam, w, h, gx, gz, rot, yMark,
        DIVIDER_LEFT, 0, TILE_PX, 4, 4, 0.6, MARK_WHITE_DIM,
      );
      pushDashedLineEW(
        faces, cam, w, h, gx, gz, rot, yMark,
        DIVIDER_RIGHT, 0, TILE_PX, 4, 4, 0.6, MARK_WHITE_DIM,
      );
    } else {
      pushLocalRect(
        faces, cam, w, h, gx, gz, rot, yMark,
        TILE_CENTER - 1, 8, TILE_CENTER + 1, 20, MARK_WHITE,
      );
      pushLocalRect(
        faces, cam, w, h, gx, gz, rot, yMark,
        TILE_CENTER - 1, 44, TILE_CENTER + 1, 56, MARK_WHITE,
      );
      pushLocalRect(
        faces, cam, w, h, gx, gz, rot, yMark,
        ROAD_INSET_2L - 12, TILE_CENTER - 1, ROAD_INSET_2L, TILE_CENTER + 1, MARK_WHITE,
      );
      pushLocalRect(
        faces, cam, w, h, gx, gz, rot, yMark,
        ROAD_OUTER_2L, TILE_CENTER - 1, ROAD_OUTER_2L + 12, TILE_CENTER + 1, MARK_WHITE,
      );
    }
  } else if (type === 'road-cul-de-sac') {
    pushLocalRect(
      faces, cam, w, h, gx, gz, rot, yMark,
      TILE_CENTER - 1, 42, TILE_CENTER + 1, 54, MARK_WHITE,
    );
    // Center island
    const island: [number, number] = [TILE_CENTER, 28];
    const ir = 5;
    const segs = 8;
    for (let i = 0; i < segs; i++) {
      const a0 = (i / segs) * Math.PI * 2;
      const a1 = ((i + 1) / segs) * Math.PI * 2;
      pushLocalQuad(
        faces, cam, w, h, gx, gz, rot, yMark,
        [
          island,
          [island[0] + ir * Math.cos(a0), island[1] + ir * Math.sin(a0)],
          [island[0] + ir * Math.cos(a1), island[1] + ir * Math.sin(a1)],
          island,
        ],
        'rgba(134,239,172,0.95)',
      );
    }
  } else if (type === 'road-end' || type === 'road-4lane-end') {
    if (is4Lane) {
      pushLocalRect(
        faces, cam, w, h, gx, gz, rot, yMark,
        TILE_CENTER - 1, TILE_CENTER, TILE_CENTER + 1, TILE_PX, MARK_YELLOW,
      );
      pushDashedLineNS(
        faces, cam, w, h, gx, gz, rot, yMark,
        DIVIDER_LEFT, TILE_CENTER, TILE_PX, 4, 4, 0.6, MARK_WHITE_DIM,
      );
      pushDashedLineNS(
        faces, cam, w, h, gx, gz, rot, yMark,
        DIVIDER_RIGHT, TILE_CENTER, TILE_PX, 4, 4, 0.6, MARK_WHITE_DIM,
      );
    } else {
      pushLocalRect(
        faces, cam, w, h, gx, gz, rot, yMark,
        TILE_CENTER - 1, 44, TILE_CENTER + 1, 56, MARK_WHITE,
      );
    }
    // End bar
    pushLocalRect(
      faces, cam, w, h, gx, gz, rot, yMark,
      inset, TILE_CENTER, outer, TILE_CENTER + 4, 'rgba(71,85,105,0.95)',
    );
  } else if (type === 'road-transition-2to4') {
    pushLocalRect(
      faces, cam, w, h, gx, gz, rot, yMark,
      TILE_CENTER - 1, 8, TILE_CENTER + 1, 20, MARK_WHITE,
    );
    pushLocalRect(
      faces, cam, w, h, gx, gz, rot, yMark,
      TILE_CENTER - 1, 44, TILE_CENTER + 1, 56, MARK_WHITE,
    );
    pushDashedLineNS(
      faces, cam, w, h, gx, gz, rot, yMark,
      DIVIDER_LEFT, 40, 56, 4, 4, 0.5, MARK_WHITE_DIM,
    );
    pushDashedLineNS(
      faces, cam, w, h, gx, gz, rot, yMark,
      DIVIDER_RIGHT, 40, 56, 4, 4, 0.5, MARK_WHITE_DIM,
    );
  } else if (type === 'road-roundabout' || type === 'road-roundabout-reverse') {
    const mirror = type === 'road-roundabout-reverse';
    const flip = (x: number) => (mirror ? TILE_PX - x : x);
    const segs = 12;
    const cArc = TILE_PX;
    for (let i = 0; i < segs; i++) {
      const angA = Math.PI + (Math.PI / 2) * (i / segs);
      const angB = Math.PI + (Math.PI / 2) * ((i + 1) / segs);
      const aPt: [number, number] = [
        flip(cArc + TILE_CENTER * Math.cos(angA)),
        cArc + TILE_CENTER * Math.sin(angA),
      ];
      const bPt: [number, number] = [
        flip(cArc + TILE_CENTER * Math.cos(angB)),
        cArc + TILE_CENTER * Math.sin(angB),
      ];
      if (i % 2 === 0) {
        const dx = bPt[0] - aPt[0];
        const dy = bPt[1] - aPt[1];
        const inv = 1 / (Math.hypot(dx, dy) || 1);
        const nx = (-dy * inv) * 1;
        const ny = (dx * inv) * 1;
        pushLocalQuad(
          faces, cam, w, h, gx, gz, rot, yMark,
          [
            [aPt[0] + nx, aPt[1] + ny],
            [aPt[0] - nx, aPt[1] - ny],
            [bPt[0] - nx, bPt[1] - ny],
            [bPt[0] + nx, bPt[1] + ny],
          ],
          MARK_WHITE,
        );
      }
    }
    const dashX0 = flip(0);
    const dashX1 = flip(ROAD_OUTER_2L - 20);
    pushDashedLineEW(
      faces, cam, w, h, gx, gz, rot, yMark,
      TILE_CENTER, Math.min(dashX0, dashX1), Math.max(dashX0, dashX1), 8, 8, 1, MARK_WHITE,
    );
  } else if (type === 'road-roundabout-4way') {
    const armLen = Math.max(4, TILE_CENTER - ROUNDABOUT_OUTER_R - 1);
    pushLocalRect(
      faces, cam, w, h, gx, gz, rot, yMark,
      TILE_CENTER - 1, 1, TILE_CENTER + 1, 1 + armLen, MARK_WHITE,
    );
    pushLocalRect(
      faces, cam, w, h, gx, gz, rot, yMark,
      TILE_CENTER - 1, TILE_CENTER + ROUNDABOUT_OUTER_R + 1, TILE_CENTER + 1, TILE_CENTER + ROUNDABOUT_OUTER_R + 1 + armLen, MARK_WHITE,
    );
    pushLocalRect(
      faces, cam, w, h, gx, gz, rot, yMark,
      1, TILE_CENTER - 1, 1 + armLen, TILE_CENTER + 1, MARK_WHITE,
    );
    pushLocalRect(
      faces, cam, w, h, gx, gz, rot, yMark,
      TILE_CENTER + ROUNDABOUT_OUTER_R + 1, TILE_CENTER - 1, TILE_CENTER + ROUNDABOUT_OUTER_R + 1 + armLen, TILE_CENTER + 1, MARK_WHITE,
    );
    const segs = 18;
    for (let i = 0; i < segs; i += 2) {
      const a0 = (i / segs) * Math.PI * 2;
      const a1 = ((i + 0.55) / segs) * Math.PI * 2;
      const at = (a: number, radial: number): [number, number] => [
        TILE_CENTER + (ROUNDABOUT_LANE_R + radial) * Math.cos(a),
        TILE_CENTER + (ROUNDABOUT_LANE_R + radial) * Math.sin(a),
      ];
      pushLocalQuad(
        faces, cam, w, h, gx, gz, rot, yMark,
        [at(a0, 0.7), at(a0, -0.7), at(a1, -0.7), at(a1, 0.7)],
        MARK_WHITE,
      );
    }
    const island: [number, number] = [TILE_CENTER, TILE_CENTER];
    const isegs = 10;
    for (let i = 0; i < isegs; i++) {
      const a0 = (i / isegs) * Math.PI * 2;
      const a1 = ((i + 1) / isegs) * Math.PI * 2;
      pushLocalQuad(
        faces, cam, w, h, gx, gz, rot, yMark,
        [
          island,
          [island[0] + ROUNDABOUT_ISLAND_R * Math.cos(a0), island[1] + ROUNDABOUT_ISLAND_R * Math.sin(a0)],
          [island[0] + ROUNDABOUT_ISLAND_R * Math.cos(a1), island[1] + ROUNDABOUT_ISLAND_R * Math.sin(a1)],
          island,
        ],
        'rgba(134,239,172,0.95)',
      );
    }
  }
}

function topTile(tiles: GridTile[] | undefined): GridTile | null {
  if (!tiles?.length) return null;
  return tiles[tiles.length - 1];
}

function horizonScreenY(cam: Cam, h: number): number {
  const f = 0.5 * h / Math.tan(cam.fov / 2);
  return h / 2 - f * Math.tan(cam.pitch);
}

function drawSky(ctx: CanvasRenderingContext2D, w: number, h: number, cam: Cam) {
  const hy = clamp(horizonScreenY(cam, h), 0, h);
  ctx.fillStyle = rgb(ROAD_GRASS, 0.92);
  ctx.fillRect(0, 0, w, h);
  if (hy > 0) {
    const g = ctx.createLinearGradient(0, 0, 0, hy);
    g.addColorStop(0, '#5b8fd4');
    g.addColorStop(0.7, '#9ec5f0');
    g.addColorStop(1, '#c8ddc0');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, hy + 1);
  }
}

function drawDashboard(ctx: CanvasRenderingContext2D, w: number, h: number, vehicle: Vehicle) {
  // Windshield frame
  ctx.strokeStyle = 'rgba(20,20,30,0.85)';
  ctx.lineWidth = 6;
  ctx.strokeRect(3, 3, w - 6, h - 6);

  // Hood / dash
  ctx.fillStyle = 'rgba(25,28,36,0.92)';
  ctx.beginPath();
  ctx.moveTo(0, h * 0.78);
  ctx.quadraticCurveTo(w / 2, h * 0.72, w, h * 0.78);
  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.closePath();
  ctx.fill();

  // Steering wheel hint
  ctx.strokeStyle = 'rgba(60,65,75,0.9)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(w / 2, h * 0.96, w * 0.18, h * 0.08, 0, Math.PI, 0);
  ctx.stroke();

  // HUD strip
  const speed = vehicle.speed ?? 1;
  const moving = vehicle.isMoving ? 'RUN' : 'STOP';
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(6, h - 22, w - 12, 16);
  ctx.fillStyle = vehicle.isMoving ? '#86efac' : '#fca5a5';
  ctx.font = 'bold 10px ui-monospace, monospace';
  ctx.textAlign = 'left';
  ctx.fillText(moving, 12, h - 10);
  ctx.fillStyle = '#e2e8f0';
  ctx.fillText(`${speed.toFixed(1)}x`, 52, h - 10);
  ctx.fillText(`${vehicle.x},${vehicle.y}`, 92, h - 10);
  if (vehicle.manualOverride) {
    ctx.fillStyle = '#c4b5fd';
    ctx.fillText('MANUAL', w - 58, h - 10);
  }
  if (vehicle.destination) {
    ctx.fillStyle = '#93c5fd';
    ctx.fillText(`→${vehicle.destination.x},${vehicle.destination.y}`, w / 2 - 20, h - 10);
  }
}

function collectFaces(
  cam: Cam,
  w: number,
  h: number,
  vehicle: Vehicle,
  vehicleId: string,
  grid: GridData,
  vehicles: Record<string, Vehicle>,
  traffic: TrafficState | undefined,
  people: Record<string, Person> | undefined,
  now: number,
): Face[] {
  const faces: Face[] = [];
  // Anchor the loaded disk to the vehicle/person cell so look-around / heading
  // (which only nudge the camera a few tenths) cannot pop tiles at the horizon.
  const cx = vehicle.x;
  const cz = vehicle.y;
  const originX = cx + 0.5;
  const originZ = cz + 0.5;
  const range2 = VIEW_RANGE * VIEW_RANGE;

  for (let gz = cz - VIEW_RANGE; gz <= cz + VIEW_RANGE; gz++) {
    for (let gx = cx - VIEW_RANGE; gx <= cx + VIEW_RANGE; gx++) {
      const dx = gx + 0.5 - originX;
      const dz = gz + 0.5 - originZ;
      if (dx * dx + dz * dz > range2) continue;
      const key = `${gx},${gz}`;
      const tiles = grid[key];
      const top = topTile(tiles);
      if (!top) {
        pushGroundTile(faces, cam, w, h, gx, gz, ROAD_GRASS, GROUND_Y);
        continue;
      }
      const style = tileStyle(top.type);
      const yBase = top.type.includes('bridge') || top.type.includes('trestle') ? 0.5 : 0;

      // Ground / road surface
      if (style.kind === 'tree') {
        pushGroundTile(faces, cam, w, h, gx, gz, [90, 150, 70], 0);
        // Trunk
        const tx0 = gx + 0.42;
        const tz0 = gz + 0.42;
        pushBox(faces, cam, w, h, tx0, tz0, tx0 + 0.16, tz0 + 0.16, 0, 0.45, [90, 60, 30]);
        // Foliage
        const burning = top.burningUntil && top.burningUntil > now;
        const foliage: RGB = burning ? [220, 90, 30] : style.color;
        const fh = burning ? 1.2 : style.height * (top.growthProgress != null ? 0.4 + top.growthProgress * 0.6 : 1);
        pushBox(
          faces,
          cam,
          w,
          h,
          gx + 0.22,
          gz + 0.22,
          gx + 0.78,
          gz + 0.78,
          0.4,
          0.4 + fh,
          foliage,
        );
      } else if (style.kind === 'building') {
        pushGroundTile(faces, cam, w, h, gx, gz, [80, 85, 90], 0);
        const inset = 0.12;
        pushBox(
          faces,
          cam,
          w,
          h,
          gx + inset,
          gz + inset,
          gx + 1 - inset,
          gz + 1 - inset,
          0,
          style.height,
          style.color,
        );
        // Window rows
        if (style.height > 0.8) {
          const floors = Math.min(4, Math.floor(style.height / 0.55));
          for (let f = 0; f < floors; f++) {
            const wy = 0.25 + f * 0.5;
            pushQuad(
              faces,
              cam,
              w,
              h,
              [
                [gx + 0.2, wy, gz + inset - 0.01],
                [gx + 0.8, wy, gz + inset - 0.01],
                [gx + 0.8, wy + 0.22, gz + inset - 0.01],
                [gx + 0.2, wy + 0.22, gz + inset - 0.01],
              ],
              'rgba(180,220,255,0.55)',
            );
          }
        }
      } else if (style.kind === 'bridge') {
        pushGroundTile(faces, cam, w, h, gx, gz, [60, 90, 50], 0);
        // Deck pillars under elevated road/rail
        pushBox(faces, cam, w, h, gx + 0.15, gz + 0.4, gx + 0.28, gz + 0.55, 0, yBase, [100, 100, 110]);
        pushBox(faces, cam, w, h, gx + 0.72, gz + 0.4, gx + 0.85, gz + 0.55, 0, yBase, [100, 100, 110]);
        // Road/rail surface + markings on the deck (match grid Tile art)
        if (top.type.startsWith('road-') || top.type.startsWith('rail-')) {
          pushRoadTileVisual(
            faces,
            cam,
            w,
            h,
            gx,
            gz,
            top.type,
            top.rotation || 0,
            yBase + 0.02,
          );
        } else {
          pushBox(
            faces,
            cam,
            w,
            h,
            gx + 0.05,
            gz + 0.05,
            gx + 0.95,
            gz + 0.95,
            yBase,
            yBase + 0.12,
            style.color,
          );
        }
      } else if (style.kind === 'road' || style.kind === 'rail') {
        // Grass shoulders under the road/rail footprint, then asphalt + lane markings
        pushGroundTile(faces, cam, w, h, gx, gz, ROAD_GRASS, 0);
        pushRoadTileVisual(
          faces,
          cam,
          w,
          h,
          gx,
          gz,
          top.type,
          top.rotation || 0,
          yBase,
        );
      } else if (style.kind === 'parking') {
        pushGroundTile(faces, cam, w, h, gx, gz, style.color, yBase);
        // Simple stall lines (amber) — match parking bay feel from Tile art
        const rot = top.rotation || 0;
        pushLocalRect(
          faces, cam, w, h, gx, gz, rot, yBase + MARK_LIFT,
          8, 4, 10, 60, MARK_YELLOW,
        );
        pushLocalRect(
          faces, cam, w, h, gx, gz, rot, yBase + MARK_LIFT,
          30, 4, 34, 60, MARK_YELLOW,
        );
        pushLocalRect(
          faces, cam, w, h, gx, gz, rot, yBase + MARK_LIFT,
          54, 4, 56, 60, MARK_YELLOW,
        );
      } else {
        pushGroundTile(faces, cam, w, h, gx, gz, style.color, yBase);
      }

      // People activity markers at homes / buildings
      if (people && (style.kind === 'building' || top.type === 'building-home')) {
        let count = 0;
        for (const p of Object.values(people)) {
          if (p.location.kind === 'home' && p.location.homeKey === key) count++;
          if (p.location.kind === 'building' && p.location.buildingKey === key) count++;
        }
        if (count > 0) {
          const h0 = style.kind === 'building' ? style.height + 0.1 : 0.3;
          pushBox(
            faces,
            cam,
            w,
            h,
            gx + 0.4,
            gz + 0.4,
            gx + 0.6,
            gz + 0.6,
            h0,
            h0 + 0.15 + Math.min(count, 4) * 0.08,
            [250, 220, 80],
          );
        }
      }
    }
  }

  // Traffic controls
  if (traffic?.controls) {
    for (const c of Object.values(traffic.controls)) {
      const [tx, ty] = c.gridKey.split(',').map(Number);
      if (!Number.isFinite(tx) || !Number.isFinite(ty)) continue;
      const tdx = tx + 0.5 - originX;
      const tdz = ty + 0.5 - originZ;
      if (tdx * tdx + tdz * tdz > range2) continue;
      if (c.kind === 'stop-sign') {
        pushBox(faces, cam, w, h, tx + 0.7, ty + 0.7, tx + 0.82, ty + 0.82, 0, 0.7, [180, 40, 40]);
        pushBox(faces, cam, w, h, tx + 0.65, ty + 0.65, tx + 0.88, ty + 0.88, 0.7, 0.9, [200, 40, 40]);
      } else if (c.kind === 'stoplight') {
        const phase = c.phase || 'red';
        const lamp: RGB =
          phase === 'green' ? [40, 200, 80] : phase === 'yellow' ? [230, 200, 40] : [220, 40, 40];
        pushBox(faces, cam, w, h, tx + 0.72, ty + 0.72, tx + 0.82, ty + 0.82, 0, 0.85, [50, 50, 55]);
        pushBox(faces, cam, w, h, tx + 0.68, ty + 0.68, tx + 0.86, ty + 0.86, 0.85, 1.15, lamp);
      }
    }
  }

  // Other vehicles — solid multi-part meshes (body, cabin, glass, wheels, lights)
  for (const [id, v] of Object.entries(vehicles)) {
    if (id === vehicleId) continue;
    const vdx = v.x + 0.5 - originX;
    const vdz = v.y + 0.5 - originZ;
    if (vdx * vdx + vdz * vdz > range2) continue;
    try {
      const pose = getVehiclePose(v, grid);
      const { x, z } = pixelToWorld(pose.posX, pose.posY);
      const elev = (v.zIndex > 0 ? 0.55 : 0) + 0.02;
      const yaw = headingToYaw(pose.rotation);
      pushVehicle3D(faces, cam, w, h, v, x, z, elev, yaw, now);
    } catch {
      // skip bad pose
    }
  }

  faces.sort((a, b) => b.depth - a.depth);
  return faces;
}

function hexToRgb(hex: string): RGB {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [100, 120, 140];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function drawFaces(ctx: CanvasRenderingContext2D, faces: Face[]) {
  for (const f of faces) {
    if (f.points.length < 3) continue;
    ctx.beginPath();
    ctx.moveTo(f.points[0].x, f.points[0].y);
    for (let i = 1; i < f.points.length; i++) ctx.lineTo(f.points[i].x, f.points[i].y);
    ctx.closePath();
    ctx.fillStyle = f.fill;
    ctx.fill();
    if (f.stroke) {
      ctx.strokeStyle = f.stroke;
      ctx.lineWidth = 0.5;
      ctx.stroke();
    }
  }
}

type LookStick = {
  yaw: number;
  pitch: number;
  nx: number;
  ny: number;
  dragging: boolean;
  originX: number;
  originY: number;
};

function clampStick(nx: number, ny: number): { nx: number; ny: number } {
  const len = Math.hypot(nx, ny);
  if (len > 1 && len > 0) return { nx: nx / len, ny: ny / len };
  return { nx, ny };
}

function applyLookStick(
  look: LookStick,
  nx: number,
  ny: number,
  knob: HTMLDivElement | null,
) {
  const c = clampStick(nx, ny);
  look.nx = c.nx;
  look.ny = c.ny;
  look.yaw = c.nx * LOOK_YAW_MAX;
  // Stick/drag down (ny > 0) looks further down (positive pitch)
  look.pitch = c.ny * LOOK_PITCH_MAX;
  if (knob) {
    knob.style.transform = `translate(${c.nx * JOY_TRAVEL_PX}px, ${c.ny * JOY_TRAVEL_PX}px)`;
  }
}

export function DriverView3D({
  vehicle,
  vehicleId,
  grid,
  vehicles,
  traffic,
  people,
  className = '',
  width = 320,
  height = 180,
}: DriverView3DProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef(0);
  const lookRef = useRef<LookStick>({
    yaw: 0,
    pitch: 0,
    nx: 0,
    ny: 0,
    dragging: false,
    originX: 0,
    originY: 0,
  });
  const knobRef = useRef<HTMLDivElement>(null);
  const pointerRef = useRef<number | null>(null);
  const camSmoothRef = useRef<Cam | null>(null);
  const camVehicleRef = useRef(vehicleId);
  const propsRef = useRef({ vehicle, vehicleId, grid, vehicles, traffic, people, width, height });
  propsRef.current = { vehicle, vehicleId, grid, vehicles, traffic, people, width, height };

  const onLookPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    pointerRef.current = e.pointerId;
    const look = lookRef.current;
    look.dragging = true;
    look.originX = e.clientX;
    look.originY = e.clientY;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  };

  const onLookPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (pointerRef.current !== e.pointerId) return;
    e.stopPropagation();
    e.preventDefault();
    const look = lookRef.current;
    const nx = (e.clientX - look.originX) / 72;
    const ny = (e.clientY - look.originY) / 72;
    applyLookStick(look, nx, ny, knobRef.current);
  };

  const onLookPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (pointerRef.current !== e.pointerId) return;
    e.stopPropagation();
    pointerRef.current = null;
    lookRef.current.dragging = false;
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    let alive = true;
    const frame = () => {
      if (!alive) return;
      const p = propsRef.current;
      const w = p.width;
      const h = p.height;
      const look = lookRef.current;
      if (!look.dragging) {
        look.yaw *= 0.8;
        look.pitch *= 0.8;
        look.nx *= 0.8;
        look.ny *= 0.8;
        if (Math.abs(look.yaw) < 0.002 && Math.abs(look.pitch) < 0.002) {
          look.yaw = 0;
          look.pitch = 0;
          look.nx = 0;
          look.ny = 0;
        }
        const knob = knobRef.current;
        if (knob) {
          knob.style.transform = `translate(${look.nx * JOY_TRAVEL_PX}px, ${look.ny * JOY_TRAVEL_PX}px)`;
        }
      }
      try {
        const target = makeCam(p.vehicle, p.grid);
        if (camVehicleRef.current !== p.vehicleId) {
          camVehicleRef.current = p.vehicleId;
          camSmoothRef.current = null;
        }
        const smoothed = smoothCam(camSmoothRef.current, target, CAM_SMOOTH);
        camSmoothRef.current = smoothed;
        const cam = applyLook(smoothed, look.yaw, look.pitch);
        drawSky(ctx, w, h, cam);
        const groundFaces: Face[] = [];
        pushWorldGroundPlane(groundFaces, cam, w, h);
        drawFaces(ctx, groundFaces);
        const faces = collectFaces(
          cam,
          w,
          h,
          p.vehicle,
          p.vehicleId,
          p.grid,
          p.vehicles,
          p.traffic,
          p.people,
          Date.now(),
        );
        drawFaces(ctx, faces);
        drawDashboard(ctx, w, h, p.vehicle);
      } catch {
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#94a3b8';
        ctx.font = '12px sans-serif';
        ctx.fillText('Driver view unavailable', 12, h / 2);
      }
      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);
    return () => {
      alive = false;
      cancelAnimationFrame(rafRef.current);
    };
  }, [width, height]);

  return (
    <div
      className={`relative overflow-hidden rounded-xl border border-slate-800 bg-slate-900 shadow-inner touch-none cursor-grab active:cursor-grabbing ${className}`}
      data-camera-joystick
      onPointerDown={onLookPointerDown}
      onPointerMove={onLookPointerMove}
      onPointerUp={onLookPointerUp}
      onPointerCancel={onLookPointerUp}
      onDoubleClick={e => {
        e.stopPropagation();
        const look = lookRef.current;
        look.yaw = 0;
        look.pitch = 0;
        look.nx = 0;
        look.ny = 0;
        look.dragging = false;
        if (knobRef.current) knobRef.current.style.transform = 'translate(0px, 0px)';
      }}
    >
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className="block w-full h-auto pointer-events-none"
        style={{ aspectRatio: `${width} / ${height}` }}
        aria-label="Driver 3D view"
      />
      <div className="absolute top-1.5 left-2 text-[9px] font-bold uppercase tracking-wider text-cyan-100 pointer-events-none drop-shadow">
        Driver view · drag to look
      </div>
      <div
        className="absolute bottom-2 right-2 z-10 pointer-events-none select-none"
        aria-hidden
      >
        <div className="relative w-[4.25rem] h-[4.25rem] rounded-full bg-slate-950/80 border-2 border-cyan-300 shadow-[0_0_12px_rgba(34,211,238,0.55)]">
          <div className="absolute left-1/2 top-0.5 -translate-x-1/2 text-[8px] leading-none text-cyan-200 font-bold">▲</div>
          <div className="absolute right-0.5 top-1/2 -translate-y-1/2 text-[8px] leading-none text-cyan-200 font-bold">▶</div>
          <div className="absolute left-1/2 bottom-0.5 -translate-x-1/2 text-[8px] leading-none text-cyan-200 font-bold">▼</div>
          <div className="absolute left-0.5 top-1/2 -translate-y-1/2 text-[8px] leading-none text-cyan-200 font-bold">◀</div>
          <div className="absolute left-1/2 top-1/2 w-1.5 h-1.5 -ml-0.5 -mt-0.5 rounded-full bg-cyan-200/40" />
          <div
            ref={knobRef}
            data-look-knob
            className="absolute left-1/2 top-1/2 w-7 h-7 -ml-3.5 -mt-3.5 rounded-full bg-cyan-300 shadow-md border-2 border-white will-change-transform"
          />
        </div>
        <div className="text-center text-[8px] font-black uppercase tracking-[0.18em] text-cyan-100 mt-0.5 drop-shadow">
          Look
        </div>
      </div>
    </div>
  );
}

function personEyeScale(person: Person | undefined): number {
  const age = person?.ageYears ?? 30;
  if (age < 5) return 0.42;
  if (age < 13) return 0.62;
  if (age < 18) return 0.85;
  return 1;
}

/** Standing eye-height camera at continuous grid coords facing heading degrees. */
function makePersonCam(
  worldX: number,
  worldZ: number,
  headingDeg: number,
  walking: boolean,
  person?: Person,
): Cam {
  const yaw = headingToYaw(headingDeg);
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  const scale = personEyeScale(person);
  const eyeY = (walking ? PERSON_EYE_WALK : PERSON_EYE_HEIGHT) * scale;
  const fov = FOV_CRUISE;
  const back = 0.05;
  return {
    x: worldX - cos * back,
    y: eyeY,
    z: worldZ - sin * back,
    yaw,
    pitch: PERSON_PITCH,
    fov,
    cos,
    sin,
  };
}

function drawPersonHud(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  person: Person,
  activity: string,
) {
  ctx.strokeStyle = 'rgba(20,20,30,0.75)';
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, w - 4, h - 4);
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.fillRect(6, h - 22, w - 12, 16);
  ctx.font = 'bold 10px ui-monospace, monospace';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#e2e8f0';
  const indoorKey = indoorTileKey(person.location);
  const label = indoorKey
    ? `Inside ${indoorKey}`
    : person.location.kind === 'vehicle'
      ? 'In vehicle'
      : person.location.kind === 'walking'
        ? 'Walking'
        : activity || 'Standing';
  ctx.fillText(label, 12, h - 10);
  const loc = indoorKey
    ? ''
    : person.location.kind === 'tile'
      ? `${person.location.x},${person.location.y}`
      : person.location.kind === 'walking'
        ? `${person.location.x.toFixed(1)},${person.location.y.toFixed(1)}`
        : person.location.kind === 'outdoor'
          ? person.location.atKey
          : person.location.kind === 'vehicle'
            ? person.location.vehicleId.slice(0, 8)
            : '';
  ctx.fillStyle = '#93c5fd';
  ctx.fillText(loc, 100, h - 10);
}

export interface PersonView3DProps {
  person: Person;
  grid: GridData;
  vehicles: Record<string, Vehicle>;
  traffic?: TrafficState;
  people?: Record<string, Person>;
  /** Continuous grid position (from getPersonMapPlacement) */
  gx: number;
  gy: number;
  /** Facing direction degrees (0=N, 90=E) */
  heading: number;
  className?: string;
  width?: number;
  height?: number;
}

function indoorStay(
  person: Person,
  grid: GridData,
): { key: string; tile?: GridTile; fallbackType: TileType } | null {
  const key = indoorTileKey(person.location);
  if (!key) return null;
  const tiles = grid[key];
  const tile = tiles?.length ? tiles[tiles.length - 1] : undefined;
  const fallbackType: TileType =
    person.location.kind === 'home' ? 'building-home' : 'building-store';
  return { key, tile, fallbackType };
}

/**
 * Eye-level 3D view from a person on the map (same renderer as driver view).
 * If the person is aboard a vehicle, uses that vehicle's driver camera.
 * Inside a home or building: show that tile's icon and "Inside X,Y".
 */
export function PersonView3D({
  person,
  grid,
  vehicles,
  traffic,
  people,
  gx,
  gy,
  heading,
  className = '',
  width = 320,
  height = 180,
}: PersonView3DProps) {
  const indoor = indoorStay(person, grid);
  const isIndoor = !!indoor;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef(0);
  const camSmoothRef = useRef<Cam | null>(null);
  const propsRef = useRef({
    person,
    grid,
    vehicles,
    traffic,
    people,
    gx,
    gy,
    heading,
    width,
    height,
  });
  propsRef.current = {
    person,
    grid,
    vehicles,
    traffic,
    people,
    gx,
    gy,
    heading,
    width,
    height,
  };

  useEffect(() => {
    if (isIndoor) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    let alive = true;
    const frame = () => {
      if (!alive) return;
      const p = propsRef.current;
      const w = p.width;
      const h = p.height;
      try {
        let cam: Cam;
        let proxyVehicle: Vehicle;
        let proxyId: string;
        if (p.person.location.kind === 'vehicle') {
          const v = p.vehicles[p.person.location.vehicleId];
          if (v) {
            cam = makeCam(v, p.grid);
            proxyVehicle = v;
            proxyId = v.id;
          } else {
            cam = makePersonCam(p.gx, p.gy, p.heading, false, p.person);
            proxyVehicle = {
              id: p.person.id,
              x: Math.floor(p.gx),
              y: Math.floor(p.gy),
              heading: p.heading,
              lane: 0,
              progress: 0.5,
              color: '#64748b',
              zIndex: 0,
              isMoving: false,
            };
            proxyId = p.person.id;
          }
        } else {
          const walking = p.person.location.kind === 'walking' || p.person.activity === 'walking';
          cam = makePersonCam(p.gx, p.gy, p.heading, walking, p.person);
          proxyVehicle = {
            id: p.person.id,
            x: Math.floor(p.gx),
            y: Math.floor(p.gy),
            heading: p.heading,
            lane: 0,
            progress: 0.5,
            color: '#64748b',
            zIndex: 0,
            isMoving: walking,
          };
          proxyId = p.person.id;
        }
        cam = smoothCam(camSmoothRef.current, cam, CAM_SMOOTH);
        camSmoothRef.current = cam;
        drawSky(ctx, w, h, cam);
        const groundFaces: Face[] = [];
        pushWorldGroundPlane(groundFaces, cam, w, h);
        drawFaces(ctx, groundFaces);
        const faces = collectFaces(
          cam,
          w,
          h,
          proxyVehicle,
          proxyId,
          p.grid,
          p.vehicles,
          p.traffic,
          p.people,
          Date.now(),
        );
        drawFaces(ctx, faces);
        drawPersonHud(ctx, w, h, p.person, p.person.activity || 'idle');
      } catch {
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#94a3b8';
        ctx.font = '12px sans-serif';
        ctx.fillText('Person view unavailable', 12, h / 2);
      }
      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);
    return () => {
      alive = false;
      cancelAnimationFrame(rafRef.current);
    };
  }, [width, height, isIndoor]);

  const indoorType = indoor?.tile?.type || indoor?.fallbackType || 'building-home';

  return (
    <div
      className={`relative overflow-hidden rounded-xl border border-slate-800 bg-slate-900 shadow-inner ${className}`}
    >
      {indoor ? (
        <div
          className="flex flex-col items-center justify-center gap-1.5 px-2 pt-5 pb-2 bg-gradient-to-b from-slate-700 to-slate-900"
          style={{ width, height, aspectRatio: `${width} / ${height}` }}
          data-testid="person-view-indoor"
          aria-label={`Inside ${indoor.key}`}
        >
          <div className="rounded-xl bg-white p-1 shadow-lg border border-white/70 shrink-0">
            <Tile
              type={indoorType}
              rotation={indoor.tile?.rotation ?? 0}
              size={48}
              part={indoor.tile?.part}
              localX={indoor.tile?.localX}
              localY={indoor.tile?.localY}
              w={indoor.tile?.w}
              h={indoor.tile?.h}
            />
          </div>
          <div
            className="text-xs font-bold text-white drop-shadow tracking-wide shrink-0 text-center leading-tight"
            data-testid="person-view-indoor-label"
          >
            Inside {indoor.key}
          </div>
        </div>
      ) : (
        <canvas
          ref={canvasRef}
          width={width}
          height={height}
          className="block w-full h-auto"
          style={{ aspectRatio: `${width} / ${height}` }}
          aria-label="Person 3D view"
        />
      )}
      <div className="absolute top-1.5 left-2 text-[9px] font-bold uppercase tracking-wider text-white/70 pointer-events-none drop-shadow">
        Person view
      </div>
    </div>
  );
}

export default DriverView3D;
