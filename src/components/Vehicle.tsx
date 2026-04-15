import React from 'react';
import { motion } from 'motion/react';

interface VehicleProps {
  id: string;
  x: number;
  y: number;
  heading: number;
  lane: number;
  progress: number;
  color: string;
  zIndex: number;
  tileType?: string;
  tileRotation?: number;
  turnIntent?: 'left' | 'right' | null;
  exitHeading?: number;
}

const GRID_SIZE = 64;

export const Vehicle: React.FC<VehicleProps> = ({ x, y, heading, lane, progress, color, zIndex, exitHeading }) => {
  // Base position of the tile center
  const centerX = (x + 0.5) * GRID_SIZE;
  const centerY = (y + 0.5) * GRID_SIZE;
  
  const laneWidth = 12; // Half of 24
  const lOffset = lane * (laneWidth / 2);
  
  let posX = centerX;
  let posY = centerY;
  let currentRotation = heading;
  
  const targetHeading = exitHeading !== undefined ? exitHeading : heading;
  
  if (targetHeading !== heading) {
    // We are turning!
    // Calculate the turn angle
    let turnAngle = targetHeading - heading;
    if (turnAngle > 180) turnAngle -= 360;
    if (turnAngle < -180) turnAngle += 360;
    
    // The turn is a 90 degree arc.
    // The center of the arc is the corner of the tile.
    // Which corner?
    // If turning right (turnAngle == 90), the arc center is to the right of the entry path.
    // If turning left (turnAngle == -90), the arc center is to the left.
    
    // Entry direction vector
    const entryRad = (heading - 90) * (Math.PI / 180);
    const ex = Math.cos(entryRad);
    const ey = Math.sin(entryRad);
    
    // Right vector
    const rightRad = heading * (Math.PI / 180);
    const rx = Math.cos(rightRad);
    const ry = Math.sin(rightRad);
    
    // The arc center is GRID_SIZE/2 forward and GRID_SIZE/2 to the right/left
    const turnDir = turnAngle > 0 ? 1 : -1; // 1 for right, -1 for left
    
    const arcCenterX = centerX - ex * (GRID_SIZE / 2) + rx * (GRID_SIZE / 2) * turnDir;
    const arcCenterY = centerY - ey * (GRID_SIZE / 2) + ry * (GRID_SIZE / 2) * turnDir;
    
    // The radius of the lane
    // If turning right, the right lane (lOffset > 0) is closer to the center.
    // Base radius is GRID_SIZE/2.
    const radius = (GRID_SIZE / 2) - lOffset * turnDir;
    
    // Start angle of the arc
    // If entering from South (heading 0), ex=0, ey=-1. Right is East (rx=1, ry=0).
    // If turning right, arcCenter is at (GRID_SIZE/2, GRID_SIZE/2) relative to tile center.
    // Entry point is at (lOffset, GRID_SIZE/2).
    // Vector from arcCenter to entry point is (-GRID_SIZE/2 + lOffset, 0).
    // Angle is 180 degrees (PI).
    const startAngleRad = entryRad - (Math.PI / 2) * turnDir;
    
    // Current angle along the arc
    // Progress goes from 0 to 1.
    // The arc covers 90 degrees (PI/2).
    const currentAngleRad = startAngleRad + progress * (Math.PI / 2) * turnDir;
    
    posX = arcCenterX + Math.cos(currentAngleRad) * radius;
    posY = arcCenterY + Math.sin(currentAngleRad) * radius;
    
    currentRotation = heading + progress * turnAngle;
  } else {
    // Straight line movement
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

  // Normalize rotation to avoid 360 -> 0 spin
  // We can use a ref to keep track of the continuous rotation
  const prevRotationRef = React.useRef(currentRotation);
  
  let diff = (currentRotation - prevRotationRef.current) % 360;
  if (diff > 180) diff -= 360;
  if (diff < -180) diff += 360;
  
  const displayRotation = prevRotationRef.current + diff;
  prevRotationRef.current = displayRotation;

  return (
    <motion.div
      style={{
        position: 'absolute',
        width: 12,
        height: 20,
        backgroundColor: color,
        borderRadius: 2,
        border: `1px solid ${color === '#ef4444' ? '#991b1b' : 'rgba(0,0,0,0.2)'}`,
        zIndex: 100 + zIndex,
        pointerEvents: 'none',
      }}
      initial={{ opacity: 0, scale: 0.5 }}
      animate={{
        opacity: 1,
        scale: 1,
        left: posX,
        top: posY,
        rotate: displayRotation,
        x: "-50%",
        y: "-50%",
        scaleX: zIndex > 0 ? 1.1 : 1,
        scaleY: zIndex > 0 ? 1.1 : 1,
      }}
      exit={{ opacity: 0, scale: 0.5 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
    >
      {/* Windshield */}
      <div 
        style={{
          position: 'absolute',
          top: '15%',
          left: '10%',
          right: '10%',
          height: '20%',
          backgroundColor: '#bfdbfe',
          borderRadius: 1,
        }}
      />
      {/* Headlights */}
      <div style={{ position: 'absolute', top: '0', left: '15%', width: '20%', height: '10%', backgroundColor: '#fef3c7', borderRadius: '50%' }} />
      <div style={{ position: 'absolute', top: '0', right: '15%', width: '20%', height: '10%', backgroundColor: '#fef3c7', borderRadius: '50%' }} />
    </motion.div>
  );
};
