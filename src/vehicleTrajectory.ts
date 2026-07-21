import { LANE_OFFSET_UNIT } from './roadGeometry';

const GRID_SIZE = 64;

export function getTrajectory(
  x: number,
  y: number,
  heading: number,
  targetHeading: number,
  lane: number,
  progress: number
) {
  const centerX = (x + 0.5) * GRID_SIZE;
  const centerY = (y + 0.5) * GRID_SIZE;

  const lOffset = lane * LANE_OFFSET_UNIT;

  let posX = centerX;
  let posY = centerY;
  let currentRotation = heading;

  if (targetHeading !== heading) {
    let turnAngle = targetHeading - heading;
    if (turnAngle > 180) turnAngle -= 360;
    if (turnAngle < -180) turnAngle += 360;

    const entryRad = (heading - 90) * (Math.PI / 180);
    const ex = Math.cos(entryRad);
    const ey = Math.sin(entryRad);

    const rightRad = heading * (Math.PI / 180);
    const rx = Math.cos(rightRad);
    const ry = Math.sin(rightRad);

    const turnDir = turnAngle > 0 ? 1 : -1;

    const arcCenterX = centerX - ex * (GRID_SIZE / 2) + rx * (GRID_SIZE / 2) * turnDir;
    const arcCenterY = centerY - ey * (GRID_SIZE / 2) + ry * (GRID_SIZE / 2) * turnDir;

    const radius = Math.abs(GRID_SIZE / 2 - lOffset * turnDir);

    const startAngleRad = entryRad - (Math.PI / 2) * turnDir;
    const currentAngleRad = startAngleRad + progress * (Math.PI / 2) * turnDir;

    posX = arcCenterX + Math.cos(currentAngleRad) * radius;
    posY = arcCenterY + Math.sin(currentAngleRad) * radius;

    currentRotation = heading + progress * turnAngle;
  } else {
    const pOffset = (progress - 0.5) * GRID_SIZE;

    const rad = (heading - 90) * (Math.PI / 180);
    const dx = Math.cos(rad);
    const dy = Math.sin(rad);

    posX += dx * pOffset;
    posY += dy * pOffset;

    const rightRad = heading * (Math.PI / 180);
    const rx = Math.cos(rightRad);
    const ry = Math.sin(rightRad);

    posX += rx * lOffset;
    posY += ry * lOffset;
  }

  return { posX, posY, rotation: currentRotation };
}