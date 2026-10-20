import { LANE_OFFSET_UNIT, ROUNDABOUT_LANE_R } from './roadGeometry';
import { ROUNDABOUT_4WAY_TYPE } from './traffic';

const GRID_SIZE = 64;

export interface VehiclePose {
  posX: number;
  posY: number;
  rotation: number;
}

function forwardUnit(heading: number): { x: number; y: number } {
  const rad = ((heading - 90) * Math.PI) / 180;
  return { x: Math.cos(rad), y: Math.sin(rad) };
}

function rightUnit(heading: number): { x: number; y: number } {
  const rad = (heading * Math.PI) / 180;
  return { x: Math.cos(rad), y: Math.sin(rad) };
}

/** Straight-ahead pose on a tile. progress 0 is the entry edge, 1 is the exit edge. */
export function straightPose(
  gridX: number,
  gridY: number,
  heading: number,
  lane: number,
  progress: number,
): VehiclePose {
  const centerX = (gridX + 0.5) * GRID_SIZE;
  const centerY = (gridY + 0.5) * GRID_SIZE;
  const lOffset = lane * LANE_OFFSET_UNIT;
  const pOffset = (progress - 0.5) * GRID_SIZE;
  const fwd = forwardUnit(heading);
  const right = rightUnit(heading);
  return {
    posX: centerX + fwd.x * pOffset + right.x * lOffset,
    posY: centerY + fwd.y * pOffset + right.y * lOffset,
    rotation: heading,
  };
}

function shortestTurn(from: number, to: number): number {
  let turn = to - from;
  while (turn > 180) turn -= 360;
  while (turn < -180) turn += 360;
  return turn;
}

/**
 * Cubic curve that leaves `from` along its heading and arrives at `to` along its heading.
 * `handleLen` is the tangent length in pixels. A short chord with a long handle is a U-turn
 * through the tile instead of a straight slide between the two endpoints.
 */
export function curveBetweenPoses(
  from: VehiclePose,
  to: VehiclePose,
  t: number,
  handleLen?: number,
): VehiclePose {
  const tt = Math.max(0, Math.min(1, t));
  const dx = to.posX - from.posX;
  const dy = to.posY - from.posY;
  const dist = Math.hypot(dx, dy);
  const turn = shortestTurn(from.rotation, to.rotation);
  if (dist < 0.5) {
    return {
      posX: to.posX,
      posY: to.posY,
      rotation: from.rotation + turn * tt,
    };
  }
  const sharpness = Math.min(1, Math.abs(turn) / 90);
  const handle = handleLen ?? Math.max(8, dist * (0.38 + 0.5 * sharpness));
  const aFwd = forwardUnit(from.rotation);
  const bFwd = forwardUnit(to.rotation);
  const c1x = from.posX + aFwd.x * handle;
  const c1y = from.posY + aFwd.y * handle;
  const c2x = to.posX - bFwd.x * handle;
  const c2y = to.posY - bFwd.y * handle;
  const u = 1 - tt;
  const posX = u * u * u * from.posX + 3 * u * u * tt * c1x + 3 * u * tt * tt * c2x + tt * tt * tt * to.posX;
  const posY = u * u * u * from.posY + 3 * u * u * tt * c1y + 3 * u * tt * tt * c2y + tt * tt * tt * to.posY;
  const dpx = 3 * u * u * (c1x - from.posX) + 6 * u * tt * (c2x - c1x) + 3 * tt * tt * (to.posX - c2x);
  const dpy = 3 * u * u * (c1y - from.posY) + 6 * u * tt * (c2y - c1y) + 3 * tt * tt * (to.posY - c2y);
  const rotation = Math.hypot(dpx, dpy) > 0.001
    ? (Math.atan2(dpx, -dpy) * 180) / Math.PI
    : from.rotation + turn * tt;
  return { posX, posY, rotation };
}

/**
 * Heading stored when a vehicle crosses into the next tile.
 * Cars, trucks, and taxis keep the exit they were already curving toward.
 * Replacing it with another road axis pivots the sprite at the tile edge.
 */
export function headingWhenEnteringTile(exitHeading: number): number {
  const steps = Math.round(exitHeading / 90);
  return ((steps % 4) + 4) % 4 * 90;
}

function stepDelta(heading: number): { dx: number; dy: number } {
  const h = ((Math.round(heading / 90) % 4) + 4) % 4;
  if (h === 1) return { dx: 1, dy: 0 };
  if (h === 2) return { dx: 0, dy: 1 };
  if (h === 3) return { dx: -1, dy: 0 };
  return { dx: 0, dy: -1 };
}

const TAU = Math.PI * 2;

function normHeading(heading: number): number {
  const steps = Math.round(heading / 90);
  return ((steps % 4) + 4) % 4 * 90;
}

/** Positive turn is right (north → east). */
function maneuverOf(heading: number, targetHeading: number): 'right' | 'left' | 'straight' | 'uturn' {
  const turn = shortestTurn(normHeading(heading), normHeading(targetHeading));
  if (Math.abs(turn) > 135) return 'uturn';
  if (turn > 45) return 'right';
  if (turn < -45) return 'left';
  return 'straight';
}

function ccwDir(phi: number): { x: number; y: number } {
  return { x: Math.sin(phi), y: -Math.cos(phi) };
}

/** Decrease `fromPhi` until it lands on `toPhi`. Result is in (0, 2π]. */
function ccwSweep(fromPhi: number, toPhi: number): number {
  let d = fromPhi - toPhi;
  d = ((d % TAU) + TAU) % TAU;
  if (d < 1e-3) return TAU;
  return d;
}

function circleTangents(
  cx: number,
  cy: number,
  r: number,
  px: number,
  py: number,
): { x: number; y: number; phi: number }[] {
  const dx = px - cx;
  const dy = py - cy;
  const d = Math.hypot(dx, dy);
  if (d <= r + 0.05) return [];
  const a = Math.asin(Math.min(1, r / d));
  const b = Math.atan2(dy, dx);
  return [b + Math.PI / 2 - a, b - Math.PI / 2 + a].map(phi => ({
    x: cx + r * Math.cos(phi),
    y: cy + r * Math.sin(phi),
    phi,
  }));
}

function pickEntryTangent(
  cx: number,
  cy: number,
  start: VehiclePose,
): { x: number; y: number; phi: number } | null {
  const fwd = forwardUnit(start.rotation);
  let best: { x: number; y: number; phi: number } | null = null;
  let bestScore = 0.35;
  for (const t of circleTangents(cx, cy, ROUNDABOUT_LANE_R, start.posX, start.posY)) {
    const vx = t.x - start.posX;
    const vy = t.y - start.posY;
    const vlen = Math.hypot(vx, vy) || 1;
    const dir = ccwDir(t.phi);
    const align = (vx / vlen) * dir.x + (vy / vlen) * dir.y;
    const ahead = (vx / vlen) * fwd.x + (vy / vlen) * fwd.y;
    const score = align + ahead;
    if (align > 0.35 && ahead > 0.15 && score > bestScore) {
      bestScore = score;
      best = t;
    }
  }
  return best;
}

function pickExitTangent(
  cx: number,
  cy: number,
  end: VehiclePose,
): { x: number; y: number; phi: number } | null {
  const fwd = forwardUnit(end.rotation);
  let best: { x: number; y: number; phi: number } | null = null;
  let bestScore = 0.35;
  for (const t of circleTangents(cx, cy, ROUNDABOUT_LANE_R, end.posX, end.posY)) {
    const vx = end.posX - t.x;
    const vy = end.posY - t.y;
    const vlen = Math.hypot(vx, vy) || 1;
    const dir = ccwDir(t.phi);
    const align = (vx / vlen) * dir.x + (vy / vlen) * dir.y;
    const towardExit = (vx / vlen) * fwd.x + (vy / vlen) * fwd.y;
    const score = align + towardExit;
    if (align > 0.35 && towardExit > 0.15 && score > bestScore) {
      bestScore = score;
      best = t;
    }
  }
  return best;
}

function circlePoseAt(cx: number, cy: number, phi: number): VehiclePose {
  return {
    posX: cx + ROUNDABOUT_LANE_R * Math.cos(phi),
    posY: cy + ROUNDABOUT_LANE_R * Math.sin(phi),
    rotation: (phi * 180) / Math.PI,
  };
}

/**
 * Counterclockwise ring.
 * Right turns use the outer quarter-circle (first exit).
 * Straight rides the near flank. Left and U-turn continue around the island.
 * Progress 0 is the incoming lane. Progress 1 is the exit road's right-hand lane.
 */
function roundaboutPose(
  x: number,
  y: number,
  heading: number,
  targetHeading: number,
  lane: number,
  progress: number,
): VehiclePose {
  const kind = maneuverOf(heading, targetHeading);
  const t = Math.max(0, Math.min(1, progress));
  if (kind === 'right') {
    const canon = roadPose(x, y, heading, targetHeading, 1, t);
    if (Math.abs(lane - 1) < 0.25) return canon;
    const start = straightPose(x, y, heading, lane, 0);
    const join = roadPose(x, y, heading, targetHeading, 1, 0.22);
    if (t <= 0.22) return curveBetweenPoses(start, join, t / 0.22, 12);
    return canon;
  }

  const centerX = (x + 0.5) * GRID_SIZE;
  const centerY = (y + 0.5) * GRID_SIZE;
  const start = straightPose(x, y, heading, lane, 0);
  const end = straightPose(x, y, normHeading(targetHeading), 1, 1);
  const entry = pickEntryTangent(centerX, centerY, start);
  const exit = pickExitTangent(centerX, centerY, end);
  if (!entry || !exit) return roadPose(x, y, heading, targetHeading, lane, t);

  const sweep = ccwSweep(entry.phi, exit.phi);
  const entryLen = Math.hypot(entry.x - start.posX, entry.y - start.posY);
  const exitLen = Math.hypot(end.posX - exit.x, end.posY - exit.y);
  const arcLen = sweep * ROUNDABOUT_LANE_R;
  const total = Math.max(1, entryLen + arcLen + exitLen);
  const entryPose = circlePoseAt(centerX, centerY, entry.phi);
  const leavePose = circlePoseAt(centerX, centerY, entry.phi - sweep);
  const entryHandle = Math.max(6, entryLen * 0.34);
  const exitHandle = Math.max(6, exitLen * 0.34);

  if (t * total <= entryLen) {
    return curveBetweenPoses(start, entryPose, entryLen < 0.5 ? 1 : (t * total) / entryLen, entryHandle);
  }
  if (t * total <= entryLen + arcLen) {
    const u = arcLen < 0.5 ? 1 : (t * total - entryLen) / arcLen;
    return circlePoseAt(centerX, centerY, entry.phi - sweep * u);
  }
  const u = exitLen < 0.5 ? 1 : (t * total - entryLen - arcLen) / exitLen;
  return curveBetweenPoses(leavePose, end, u, exitHandle);
}

function pathLength(poseAt: (p: number) => VehiclePose): number {
  let len = 0;
  let prev = poseAt(0);
  const steps = 24;
  for (let i = 1; i <= steps; i++) {
    const pose = poseAt(i / steps);
    len += Math.hypot(pose.posX - prev.posX, pose.posY - prev.posY);
    prev = pose;
  }
  return len;
}

/**
 * Scale sim progress so a long loop around the circle is not faster than a straight tile.
 * 1 means "same pixels per second as a straight road". Never speeds the vehicle up.
 */
export function roundaboutTravelFactor(
  x: number,
  y: number,
  heading: number,
  targetHeading: number,
  lane: number,
): number {
  const len = pathLength(p => getTrajectory(x, y, heading, targetHeading, lane, p, ROUNDABOUT_4WAY_TYPE));
  if (len <= GRID_SIZE) return 1;
  return GRID_SIZE / len;
}

export function getTrajectory(
  x: number,
  y: number,
  heading: number,
  targetHeading: number,
  lane: number,
  progress: number,
  tileType?: string,
): VehiclePose {
  if (tileType === ROUNDABOUT_4WAY_TYPE) {
    return roundaboutPose(x, y, heading, targetHeading, lane, progress);
  }
  return roadPose(x, y, heading, targetHeading, lane, progress);
}

function roadPose(
  x: number,
  y: number,
  heading: number,
  targetHeading: number,
  lane: number,
  progress: number,
): VehiclePose {
  const centerX = (x + 0.5) * GRID_SIZE;
  const centerY = (y + 0.5) * GRID_SIZE;
  const lOffset = lane * LANE_OFFSET_UNIT;

  let turnAngle = shortestTurn(heading, targetHeading);

  // Reverse exit (cul-de-sac, road that runs out): one curve through the tile
  // back to the entry edge, in the opposite lane. End pose is the next tile's progress 0.
  if (Math.abs(turnAngle) > 135) {
    const start = straightPose(x, y, heading, lane, 0);
    const step = stepDelta(targetHeading);
    const end = straightPose(x + step.dx, y + step.dy, targetHeading, lane, 0);
    return curveBetweenPoses(start, end, progress, GRID_SIZE * 0.58);
  }

  if (Math.abs(turnAngle) > 1) {
    // Quarter-circle in the lane. Sweep is 90° because exits are axis-aligned.
    const sweep = turnAngle > 0 ? Math.PI / 2 : -Math.PI / 2;
    const entryRad = ((heading - 90) * Math.PI) / 180;
    const ex = Math.cos(entryRad);
    const ey = Math.sin(entryRad);
    const rightRad = (heading * Math.PI) / 180;
    const rx = Math.cos(rightRad);
    const ry = Math.sin(rightRad);
    const turnDir = turnAngle > 0 ? 1 : -1;

    const arcCenterX = centerX - ex * (GRID_SIZE / 2) + rx * (GRID_SIZE / 2) * turnDir;
    const arcCenterY = centerY - ey * (GRID_SIZE / 2) + ry * (GRID_SIZE / 2) * turnDir;
    const radius = Math.abs(GRID_SIZE / 2 - lOffset * turnDir);
    const startAngleRad = entryRad - (Math.PI / 2) * turnDir;
    const currentAngleRad = startAngleRad + Math.max(0, Math.min(1, progress)) * sweep;

    return {
      posX: arcCenterX + Math.cos(currentAngleRad) * radius,
      posY: arcCenterY + Math.sin(currentAngleRad) * radius,
      rotation: heading + progress * turnAngle,
    };
  }

  return straightPose(x, y, heading, lane, progress);
}
