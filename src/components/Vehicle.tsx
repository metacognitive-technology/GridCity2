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
  type?: 'car' | 'train' | 'semi';
  trailers?: number;
}

const GRID_SIZE = 64;

export function getTrajectory(x: number, y: number, heading: number, targetHeading: number, lane: number, progress: number) {
  const centerX = (x + 0.5) * GRID_SIZE;
  const centerY = (y + 0.5) * GRID_SIZE;
  
  const laneWidth = 12; // Half of 24
  const lOffset = lane * (laneWidth / 2);
  
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
    
    const radius = Math.abs((GRID_SIZE / 2) - lOffset * turnDir);
    
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

const Trailer: React.FC<{
  x: number;
  y: number;
  heading: number;
  targetHeading: number;
  lane: number;
  progress: number;
  zIndex: number;
  index: number;
}> = ({ x, y, heading, targetHeading, lane, progress, zIndex, index }) => {
  const pixelOffset = 27 + index * 42;
  const progressOffset = pixelOffset / GRID_SIZE;
  
  let tProg = progress - progressOffset;
  let target = targetHeading;

  if (tProg < 0) {
     target = heading;
  }

  const { posX, posY, rotation } = getTrajectory(x, y, heading, target, lane, tProg);

  const prevRotationRef = React.useRef(rotation);
  let diff = (rotation - prevRotationRef.current) % 360;
  if (diff > 180) diff -= 360;
  if (diff < -180) diff += 360;
  const displayRotation = prevRotationRef.current + diff;
  prevRotationRef.current = displayRotation;

  return (
    <motion.div
      style={{
        position: 'absolute',
        width: 12,
        height: 40,
        backgroundColor: '#94a3b8',
        borderRadius: 1,
        border: `1px solid rgba(0,0,0,0.3)`,
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
    />
  );
};

export const Vehicle: React.FC<VehicleProps> = ({ x, y, heading, lane, progress, color, zIndex, exitHeading, type = 'car', trailers = 0 }) => {
  const targetHeading = exitHeading !== undefined ? exitHeading : heading;
  
  const { posX, posY, rotation: currentRotation } = getTrajectory(x, y, heading, targetHeading, lane, progress);

  // Normalize rotation to avoid 360 -> 0 spin
  // We can use a ref to keep track of the continuous rotation
  const prevRotationRef = React.useRef(currentRotation);
  
  let diff = (currentRotation - prevRotationRef.current) % 360;
  if (diff > 180) diff -= 360;
  if (diff < -180) diff += 360;
  
  const displayRotation = prevRotationRef.current + diff;
  prevRotationRef.current = displayRotation;

  let baseHeight = 20;
  if (type === 'semi') baseHeight = 10;
  else if (type === 'train') baseHeight = 40;

  return (
    <>
      <motion.div
        style={{
          position: 'absolute',
          width: 12,
          height: baseHeight,
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
        {type !== 'train' && (
          <div 
            style={{
              position: 'absolute',
              top: type === 'semi' ? '25%' : '15%',
              left: '10%',
              right: '10%',
              height: type === 'semi' ? '40%' : '20%',
              backgroundColor: '#bfdbfe',
              borderRadius: 1,
            }}
          />
        )}
        {/* Headlights */}
        <div style={{ position: 'absolute', top: '0', left: '15%', width: '20%', height: type === 'semi' ? '20%' : '10%', backgroundColor: '#fef3c7', borderRadius: '50%' }} />
        <div style={{ position: 'absolute', top: '0', right: '15%', width: '20%', height: type === 'semi' ? '20%' : '10%', backgroundColor: '#fef3c7', borderRadius: '50%' }} />
      </motion.div>
      
      {type === 'semi' && Array.from({ length: trailers }).map((_, i) => (
        <Trailer 
          key={`trailer-${i}`}
          x={x}
          y={y}
          heading={heading}
          targetHeading={targetHeading}
          lane={lane}
          progress={progress}
          zIndex={zIndex}
          index={i}
        />
      ))}
    </>
  );
};
